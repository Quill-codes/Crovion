/**
 * The intro director — one clock and one phase machine for the whole sequence
 * from first paint to the settled hero.
 *
 * ### What this replaces
 *
 * Three hard-coded clocks that had to agree by hand and none of which knew
 * whether the page was ready: `LoadingScreen`'s `setTimeout(…, 2800)`, `Hero`'s
 * second `setTimeout(…, 2800)` plus its `CTA_REVEAL_AT = 3600` rAF poll, and
 * `Navbar`'s framer `delay: 3`. Every one of them was a guess at when the
 * previous one would finish, which is why the intro read as three animations
 * rather than one.
 *
 * Now there is one origin — `t = 0` is the instant the curtain begins to
 * dissolve — and everything else is an offset from it.
 *
 * ### The phases
 *
 * ```
 *   LOADING ──ready──► EXIT ──0.80s──► REVEAL ──2.60s──► SETTLED
 *      │                 │               │                  │
 *   curtain up     curtain dissolves   chain is born     autonomous
 *   seed live      seed collapses      headline enters   morph + pointer
 * ```
 *
 * Phases only ever move forward, and each transition is announced once. A
 * subscriber that cares about "has the curtain started leaving" should ask
 * `introAtLeast(phase, "EXIT")` rather than `phase === "EXIT"` — under reduced
 * motion EXIT and REVEAL land in the same tick and an equality test would miss
 * one of them.
 *
 * ### Why there is a readiness gate at all
 *
 * Bravis has no minimum and no maximum: it is a single hand-written engine that
 * constructs its renderer *inside* its own load gate, so the first frame ever
 * drawn is already the intro's first frame and every shader program is linked
 * behind the curtain. We are a React app with two independent WebGL contexts,
 * `next/font` and hydration, so we need both bounds — and a deliberate floor,
 * because we are procedural and have almost no texture payload, so the gate will
 * often satisfy in a couple of hundred milliseconds and a curtain that flashes
 * is worse than one that waits.
 *
 * ### The clock
 *
 * Stepped, not wall-derived, and clamped exactly like `advanceBirth` and
 * `lib/frame.ts` clamp: a tab restored from the background reports a
 * multi-second delta, and letting that through would skip the entire reveal in
 * one step rather than play it.
 *
 * It is pumped from the fluid pipeline's single frame callback — there is no
 * second rAF loop. What there *is* is a low-frequency watchdog timer, armed only
 * while the intro is running, which takes the clock over if the pump goes silent
 * for more than a few frames. That is the degraded path: if WebGL fails to
 * initialise, or the context is lost mid-intro, the curtain still lifts and the
 * page is still usable. A timer is not a frame loop and costs nothing at 120 ms.
 *
 * State lives only in this module, so a reload restarts the intro by
 * construction. Nothing is persisted anywhere.
 */

export type IntroPhase = "LOADING" | "EXIT" | "REVEAL" | "SETTLED";

/** Phase order, for the `introAtLeast` comparison below. */
const PHASE_ORDER: readonly IntroPhase[] = [
  "LOADING",
  "EXIT",
  "REVEAL",
  "SETTLED",
];

/**
 * Everything that must be true before the curtain may lift.
 *
 * A fixed tuple rather than an open registry on purpose: a gate that is never
 * registered is indistinguishable from a gate that is never satisfied, and the
 * failure mode of the open version is a curtain that hangs until the ceiling.
 * With a closed set the only thing that can go wrong is a signal that never
 * arrives, which the ceiling already covers.
 *
 * - `fonts` — `document.fonts.ready`. `next/font` runs `display: swap`, so a
 *   swap landing after the curtain lifts would reflow the headline in the middle
 *   of the reveal. Gating here removes that class of bug entirely.
 * - `fluid` — the metaball pipeline has completed one full pass chain. This is
 *   the shader-compilation gate: without it the curtain lifts onto a compile
 *   stall, which is the one hitch the whole sequence cannot survive.
 * - `aurora` — the background canvas has drawn. It is a separate WebGL context;
 *   if it paints after the curtain lifts, the ground pops in behind the fluid.
 */
export const INTRO_GATES = ["fonts", "fluid", "aurora"] as const;

export type IntroGate = (typeof INTRO_GATES)[number];

/**
 * The whole schedule, in seconds from `t = 0`.
 *
 * Calibrated from the Bravis study's measured tweens and then adjusted for our
 * pale ground and our slower, larger blobs — see
 * `BRAVIS_PRELOADER_TO_HERO_INTRO.md` §7 for the source numbers and §11 for the
 * adjustment. Copy the structure, not the numbers: theirs are tuned to a
 * saturated red curtain and eight small textured planes.
 */
export interface IntroTiming {
  /** Floor on the curtain, in seconds. */
  minDwell: number;
  /** Ceiling on the curtain, in seconds. */
  maxWait: number;
  /** EXIT → REVEAL, in seconds from t = 0. */
  reveal: number;
  /** REVEAL → SETTLED, in seconds from t = 0. */
  settled: number;
}

export const INTRO_TIMING: IntroTiming = {
  /**
   * Floor on the curtain, in seconds.
   *
   * Not a stall — the thing it prevents is a flash. Bravis's curtain is buying
   * time for 1.81 MB of textures over a 4-way pipeline and so never needs a
   * floor; ours is procedural and the gate frequently satisfies inside 300 ms,
   * at which point the curtain becomes a flicker between two pale screens.
   */
  minDwell: 0.7,

  /**
   * Ceiling on the curtain, in seconds.
   *
   * The escape hatch Bravis does not have and we cannot do without: if a device
   * cannot initialise a WebGL context at all, `fluid` and `aurora` never arrive
   * and there is no gate left to satisfy. Lift anyway and let the reveal run at
   * whatever fidelity the device manages. Never hold the user hostage to a
   * canvas that will not start.
   */
  maxWait: 6.0,

  /**
   * EXIT → REVEAL: when the chain is born and the headline is scheduled.
   *
   * Bravis's `_openingTimer`, a bare scheduler with no visual target. 0.8 s is
   * where the seed has shrunk far enough to read as an *origin* rather than as
   * a background, while still being unmistakably on screen — which is the whole
   * point of the overlap.
   */
  reveal: 0.8,

  /**
   * REVEAL → SETTLED: the autonomous morph and the pointer field take over.
   *
   * The last headline line finishes at 2.60 and the chain has landed by 2.30, so
   * nothing is still in flight when this fires.
   */
  settled: 2.6,
};

/**
 * The reduced-motion schedule. See the study's §14.
 *
 * The gate is unchanged — it is correctness, not motion, and a font swap
 * reflowing the headline is not less of a bug for someone who asked for less
 * movement. Everything after it collapses to a single short cross-fade: EXIT and
 * REVEAL land together, and the whole intro is over in ~0.55 s.
 *
 * The rule this encodes: reduced motion removes *movement*, never information.
 * Every element that appears in the full sequence still appears — it just
 * arrives by fading, in place, at once.
 */
export const INTRO_TIMING_REDUCED: IntroTiming = {
  minDwell: INTRO_TIMING.minDwell,
  maxWait: INTRO_TIMING.maxWait,
  reveal: 0,
  settled: 0.55,
};

/**
 * Live intro state, read from the frame loop.
 *
 * A plain mutable object for the same reason `birthClock` and `FLUID_PARAMS` are:
 * the pipeline reads it at display rate and must never trigger a React render to
 * do so. React consumers go through `subscribeIntro` / `useIntroPhase` instead,
 * which fire once per *phase*, not once per frame.
 */
export const introClock = {
  /** Seconds since the curtain began to dissolve. Zero for the whole of LOADING. */
  t: 0,
  /** Current phase. Only ever moves forward. */
  phase: "LOADING" as IntroPhase,
  /** Mirrors `prefers-reduced-motion`, sampled once when the intro starts. */
  reduced: false,
  /** Has `startIntro` run? Guards the gate against a stray early signal. */
  started: false,
};

/** The schedule in force, which depends on the reduced-motion sample. */
export function introTiming(): IntroTiming {
  return introClock.reduced ? INTRO_TIMING_REDUCED : INTRO_TIMING;
}

/** Is `phase` at or past `target` in the sequence? */
export function introAtLeast(phase: IntroPhase, target: IntroPhase): boolean {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target);
}

const ready: Record<IntroGate, boolean> = {
  fonts: false,
  fluid: false,
  aurora: false,
};

const listeners = new Set<(phase: IntroPhase) => void>();

/** Wall-clock milliseconds at which LOADING began. */
let loadStart = 0;
/** Wall-clock milliseconds of the last external `advanceIntro`. */
let lastPump = 0;
/** Wall-clock milliseconds of the last watchdog tick, for its own delta. */
let lastWatch = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * How long the pump may be silent before the watchdog takes the clock over.
 *
 * Comfortably longer than a dropped frame at 30 Hz and shorter than anything a
 * viewer could notice stalling. A pipeline that is merely slow keeps its own
 * clock; one that has stopped loses it.
 */
const PUMP_STALE_MS = 250;

/** Watchdog period. Not a frame loop — it only ever checks and, rarely, steps. */
const WATCHDOG_MS = 120;

/** Delta clamp, shared by the pump and the watchdog. See the header. */
const MAX_STEP = 1 / 20;

function notify(): void {
  for (const fn of listeners) fn(introClock.phase);
}

function enter(phase: IntroPhase): void {
  if (introClock.phase === phase) return;
  introClock.phase = phase;
  notify();
}

/**
 * Has the gate opened?
 *
 * Two ways out, and the ceiling is checked first so a device that will never
 * satisfy the gate is never held by the floor as well.
 */
function gateOpen(elapsed: number): boolean {
  if (elapsed >= introTiming().maxWait) return true;
  if (elapsed < introTiming().minDwell) return false;
  return INTRO_GATES.every((gate) => ready[gate]);
}

/** Walk the phase machine to wherever `introClock.t` says it should be. */
function checkPhase(): void {
  const timing = introTiming();
  if (introClock.t >= timing.settled) enter("SETTLED");
  else if (introClock.t >= timing.reveal) enter("REVEAL");
  else enter("EXIT");
}

function evaluate(): void {
  if (!introClock.started) return;
  if (introClock.phase !== "LOADING") return;
  if (!gateOpen((now() - loadStart) / 1000)) return;

  // The origin. Everything downstream is an offset from this instant, and the
  // clock is explicitly re-zeroed rather than assumed zero so a re-entry in
  // development StrictMode cannot hand the sequence a head start.
  introClock.t = 0;
  checkPhase();
}

function tickWatchdog(): void {
  watchdog = null;

  const stamp = now();
  const stale = stamp - lastPump > PUMP_STALE_MS;

  if (stale) {
    const delta = Math.min(Math.max((stamp - lastWatch) / 1000, 0), MAX_STEP);
    if (introClock.phase === "LOADING") {
      evaluate();
    } else {
      introClock.t += delta;
      checkPhase();
    }
  }

  lastWatch = stamp;
  if (introClock.phase !== "SETTLED") arm();
}

function arm(): void {
  if (watchdog !== null) return;
  watchdog = setTimeout(tickWatchdog, WATCHDOG_MS);
}

/**
 * Begin the intro. Idempotent — a second call is a no-op, which is what makes
 * the double mount React StrictMode performs in development harmless.
 *
 * Call from a layout effect on the page that owns the curtain, so the gate is
 * open for business before anything can report into it.
 */
export function startIntro(): void {
  if (introClock.started) return;
  introClock.started = true;

  // Sampled once, here, rather than subscribed: the schedule has to be decided
  // before the first tween is scheduled off it, and a preference that flips
  // mid-intro would otherwise leave the DOM half on one timetable and the WebGL
  // half on another. The steady-state animation keeps its own live subscription
  // — see `birthClock.reduced`, which `FluidScene` pushes every render.
  introClock.reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  loadStart = now();
  lastPump = loadStart;
  lastWatch = loadStart;

  installIntroDevtools();

  // `document.fonts` is universally available in every browser that can run this
  // page, but the optional chain costs nothing and keeps the gate from deadlocking
  // in a test environment that has no font loading API at all.
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (fonts) fonts.ready.then(() => markIntroReady("fonts"));
  else markIntroReady("fonts");

  arm();
}

/**
 * Report a readiness signal. Idempotent, and safe to call before `startIntro` —
 * the flag is recorded and the gate is evaluated when the intro actually begins.
 */
export function markIntroReady(gate: IntroGate): void {
  if (ready[gate]) return;
  ready[gate] = true;
  evaluate();
}

/**
 * Advance the clock. Called once per frame from the fluid pipeline's own
 * callback; there is no second frame loop and no React state involved.
 *
 * Delta is clamped for the reason the header gives: a backgrounded tab reports a
 * multi-second delta on return, and letting that through would skip the reveal
 * rather than play it.
 */
export function advanceIntro(delta: number): void {
  lastPump = now();

  if (introClock.phase === "LOADING") {
    evaluate();
    return;
  }
  if (introClock.phase === "SETTLED") return;

  introClock.t += Math.min(Math.max(delta, 0), MAX_STEP);
  checkPhase();
}

/** Subscribe to phase changes. Returns the unsubscribe. */
export function subscribeIntro(fn: (phase: IntroPhase) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** For `useSyncExternalStore`, which needs a stable identity per phase. */
export function getIntroPhase(): IntroPhase {
  return introClock.phase;
}

/**
 * Dev only — the clock and the replay, on the console.
 *
 * Same pattern the hero's `__textMode` diagnostic uses, and stripped out of a
 * built bundle entirely by the `NODE_ENV` guard. The intro is under three
 * seconds long and mostly happens behind a curtain, which makes it exactly the
 * kind of thing that is miserable to judge by reloading and squinting.
 */
export function installIntroDevtools(): void {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __intro?: typeof introClock;
    __introReplay?: () => string;
  };
  w.__intro = introClock;
  w.__introReplay = () => {
    restartIntro();
    return "INTRO · replaying from the curtain";
  };
}

/**
 * Dev only — replay the intro from the curtain without a reload.
 *
 * Deliberately does *not* reset the readiness gates: what is being re-watched is
 * the choreography, and re-waiting for fonts and two canvases that are demonstrably
 * already up would only add the floor back.
 */
export function restartIntro(): void {
  introClock.t = 0;
  introClock.phase = "LOADING";
  loadStart = now();
  lastWatch = loadStart;
  notify();
  arm();
}
