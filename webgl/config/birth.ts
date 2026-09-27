/**
 * Blob birth — the lifecycle that turns an empty fluid field into the
 * steady-state composition on load.
 *
 * ### What is actually animated
 *
 * Nothing here fades anything. The composite writes `mask` as its alpha, and
 * `mask` is a function of the *blurred* alpha field, not of any blob's own
 * opacity — so the one thing a birth cannot be in this pipeline is an opacity
 * ramp. What a blob contributes to that field is instead:
 *
 *   1. **how much of it there is** — `scale`, a radial growth applied in the
 *      vertex stage, so the mass itself gets bigger;
 *   2. **how dense that material is** — `density`, the blob's alpha, which
 *      reaches the screen only through `blurredAlpha * threshold - cutoff`;
 *   3. **how firm its edge is** — `shape`, which widens the grazing-angle
 *      feather while the body is young, so the skirt of the blurred field is
 *      broad and diffuse and then tightens.
 *
 * Below the isoline the field produces nothing at all; as the product of (1) and
 * (2) climbs past it, the surface appears from the middle of the forming mass
 * and spreads outward. That crossing is what "the silhouette emerges" means
 * here, and it is why this cannot read as a fade: colour is recovered by
 * `straighten()` (a divide by alpha) before it is ever shown, so a half-density
 * blob is not a paler blob — it is a *smaller* one.
 *
 * ### The clock
 *
 * One module-level clock for the whole field, advanced from the pipeline's
 * single frame callback. Per-blob timing is a pure function of it and the
 * blob's own `birthOrder`, so there is no per-blob state to keep in sync, no
 * second animation loop, and nothing to allocate — `resolveBirth` writes into
 * a caller-owned struct.
 *
 * The clock is deliberately *not* the canvas clock: the loading curtain sits
 * over the scene while the page is coming up, and a birth that plays underneath
 * it has not been seen. `holdBirth` / `releaseBirth` let whatever owns the
 * curtain decide when the field is on screen; with no holder registered the clock
 * runs from the first frame, so a page without a curtain still works.
 *
 * The release point is no longer a guess. `lib/intro/director.ts` owns the one
 * clock the whole intro is scheduled off, and lifts the hold when it enters
 * REVEAL — the instant the seed has collapsed far enough to read as an origin.
 * That is also where the `travel` channel below gets its meaning: the birth clock
 * and the intro clock share an origin, so "0.8 s after the curtain started
 * dissolving" is a single fact rather than three numbers that had to agree.
 *
 * State lives only in this module, so a reload restarts the birth by
 * construction. Nothing is persisted anywhere.
 */

/** `BIRTH_PARAMS.debug` states. */
export const BIRTH_DEBUG = {
  OFF: 0,
  /** Dev only: pointer field off, and the clock loops so it can be re-watched. */
  ONLY_BIRTH: 1,
} as const;

export type BirthDebug = (typeof BIRTH_DEBUG)[keyof typeof BIRTH_DEBUG];

/**
 * Live-tunable, same contract as `FLUID_PARAMS`: a plain mutable object the
 * Leva panel writes and the frame loop reads, so a knob costs one property
 * write and never a React render.
 */
export const BIRTH_PARAMS = {
  /** Master switch. Off = every blob is born the instant it mounts. */
  enabled: true,

  /**
   * Seconds for one blob to go from nothing to its steady state.
   *
   * Set against the brief's own targets and then checked against the isoline
   * arithmetic below: first contribution around 0.05 s, a recognisable body by
   * ~0.35 s, settled by ~1.1 s.
   */
  duration: 1.15,

  /**
   * Seconds between successive `birthOrder` steps.
   *
   * Small on purpose. This is not a sequence the eye is meant to read — it
   * exists so the field does not look like seven objects switched on at once,
   * and the moment it grows large enough to be *counted* it has become a UI
   * animation.
   */
  stagger: 0.16,

  /**
   * Seconds for a blob to travel from the seed's collapse point to its resting
   * position — the `travel` channel below.
   *
   * Longer than `duration`, and deliberately: the body finishes *forming* before
   * it finishes *arriving*, so what the eye follows over the last third of the
   * move is a fully-realised drop settling into place rather than something still
   * assembling itself in flight.
   */
  travel: 1.3,

  /**
   * Seconds between successive `birthOrder` steps on the travel channel, and a
   * ceiling on how many steps are allowed to accumulate.
   *
   * Separate from `stagger` because they are answering different questions.
   * `stagger` sizes the growth sequence, which is judged on a field that is
   * mostly off-screen. This one sizes the *burst* out of a single point, which is
   * the most visible moment in the intro, and there the study is unambiguous: it
   * has to read as one event. Bravis gets that with three phases of 0.1 s and
   * nothing longer.
   *
   * The cap is what makes this a burst rather than a queue. Without it the tail
   * of a seven-body chain would leave the origin 0.6 s after the head, which is
   * long enough to be *counted* — and the moment a sequence can be counted it has
   * stopped being a birth and become a UI animation.
   */
  travelStagger: 0.1,
  travelStaggerCap: 3,

  /**
   * Master on the birth-only unrest — the extra silhouette deformation a body
   * carries while it is still forming. 0 leaves only growth and density.
   */
  strength: 1,

  /**
   * Shaping exponent on the eased progress. Below 1 front-loads the toe (the
   * mass shows early and spends longer settling), above 1 delays it.
   */
  curve: 0.62,

  /** See `BIRTH_DEBUG`. Dev only; production always runs OFF. */
  debug: BIRTH_DEBUG.OFF as BirthDebug,
};

/**
 * Radius of the seed, as a fraction of the blob's own.
 *
 * Not zero, and the value is load-bearing rather than cosmetic. The blur runs
 * at sigma ~8 screen px, so a disc of radius r peaks at `1 - exp(-r^2/2s^2)` in
 * the blurred field and the isoline sits at `cutoff / threshold` = 0.42 — which
 * a solid disc only clears past ~8.4 px. At 0.04 the head sphere's seed is
 * ~11 px and, at the seed density below, lands *under* the isoline: the field
 * starts genuinely empty, and the first thing that happens is material welling
 * up into it rather than a dot being switched on.
 */
const SEED_SCALE = 0.04;

/**
 * Density of the seed material, as a fraction of the blob's own alpha.
 *
 * The newborn is thin, not absent. Starting at zero would put the isoline
 * crossing entirely in the hands of the density ramp, which is exactly the
 * "it fades up" failure — the crossing has to be driven by the mass growing.
 * Half density means the seed needs roughly twice the radius to clear the
 * isoline, so growth stays in charge of when the silhouette appears.
 */
const SEED_DENSITY = 0.5;

/** Extra envelope/detail amplitude at full unrest, as a multiple of the resting band. */
export const BIRTH_UNREST = 1.3;

export const birthClock = {
  /** Seconds since the field was released. */
  t: 0,
  /** Outstanding `holdBirth` calls. Non-zero freezes the clock at 0. */
  holds: 0,
  /** Mirrors `prefers-reduced-motion`; pushed in by the scene, not polled here. */
  reduced: false,
};

/**
 * Freeze the birth clock. Balanced by `releaseBirth`.
 *
 * Call from a layout effect, so the hold is registered before the pipeline's
 * first frame — a hold that arrives late has already let some of the birth run.
 */
export function holdBirth(): void {
  birthClock.holds += 1;
}

/**
 * Lift a hold. When the last one lifts the clock restarts from zero: the
 * release *is* the birth's origin, which also makes the double mount/unmount
 * React StrictMode performs in development a no-op rather than a head start.
 */
export function releaseBirth(): void {
  if (birthClock.holds > 0) birthClock.holds -= 1;
  if (birthClock.holds === 0) birthClock.t = 0;
}

/** Dev only — replay from the top without a reload. */
export function restartBirth(): void {
  birthClock.t = 0;
}

/**
 * Advance the clock. Called once per frame from the pipeline's own callback;
 * there is no second loop and no React state involved.
 *
 * Delta is clamped for the same reason `lib/frame.ts` clamps: a tab restored
 * from the background reports a multi-second delta, and letting that through
 * would skip the entire birth in one step.
 */
export function advanceBirth(delta: number): void {
  if (birthClock.holds > 0) return;

  birthClock.t += Math.min(Math.max(delta, 0), 1 / 20);

  // ONLY_BIRTH loops, because the thing being judged lasts a second and a
  // reload costs several. The span covers the longest stagger on the chain plus
  // a beat of settled steady state to compare against.
  if (BIRTH_PARAMS.debug === BIRTH_DEBUG.ONLY_BIRTH) {
    const span = BIRTH_PARAMS.duration + BIRTH_PARAMS.stagger * 8 + 1.5;
    if (birthClock.t > span) birthClock.t = 0;
  }
}

/** Per-blob lifecycle, resolved into a caller-owned struct — nothing allocates. */
export interface BirthState {
  /** 0 = not yet born, 1 = fully born. Drives unrest and edge firmness. */
  shape: number;
  /** Radial growth of the forming mass, in the vertex stage. */
  scale: number;
  /** Material density — the blob's alpha, which the threshold reads. */
  density: number;
  /**
   * 0 = at the intro seed's collapse point, 1 = at the resting position.
   *
   * The one channel here that is not about *how much body there is* but about
   * *where it is*, and it exists because growing in place and being born are not
   * the same event. A field whose blobs swell into existence at their final
   * coordinates reads as seven things switching on politely. A field whose blobs
   * come out of the single point the curtain just collapsed into reads as cause
   * and effect — the screen became a drop, the drop burst into the composition.
   *
   * Consumed by `FluidBlob`, which lerps its *written* position between the two.
   * Deliberately not fed back into the slosh integrator: the travel velocity is
   * an order of magnitude above anything the springs were tuned for, and the
   * body arriving is supposed to look settled, not to land sloshing.
   */
  travel: number;
}

/** All three at their settled values: the blob exactly as it is without birth. */
export function bornState(out: BirthState): BirthState {
  out.shape = 1;
  out.scale = 1;
  out.density = 1;
  out.travel = 1;
  return out;
}

/**
 * Slow start, slow finish, no overshoot — the study's `power3.inOut`, and the
 * same curve the seed collapses on, so the two halves of the hand-off are moving
 * to one rhythm rather than two.
 *
 * Nothing in this intro overshoots. No back, no elastic, no spring: every body
 * approaches its resting state from one side and stops there.
 */
function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * How far blob `order` has travelled from the seed's collapse point, 0 to 1.
 *
 * Split out from `resolveBirth` because it is the one channel a caller may want
 * on its own — `FluidBlob` reads it after the float, the parallax and the slosh
 * have all written this frame's position, since travel does not replace that
 * motion, it interpolates toward it.
 */
export function resolveTravel(order: number): number {
  if (!BIRTH_PARAMS.enabled || birthClock.reduced) return 1;

  const delay =
    Math.min(Math.max(order, 0), BIRTH_PARAMS.travelStaggerCap) *
    BIRTH_PARAMS.travelStagger;
  const u = (birthClock.t - delay) / Math.max(BIRTH_PARAMS.travel, 1e-3);

  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return easeInOutCubic(u);
}

/**
 * Where blob `order` is in its lifecycle right now.
 *
 * `order` is a position in the composition's own sequence, not an index into a
 * table of delays — fractional values are meaningful and are what the connector
 * beads use to fall between the two bodies they thread.
 */
export function resolveBirth(order: number, out: BirthState): BirthState {
  if (!BIRTH_PARAMS.enabled || birthClock.reduced) return bornState(out);

  const duration = Math.max(BIRTH_PARAMS.duration, 1e-3);
  const u = (birthClock.t - order * BIRTH_PARAMS.stagger) / duration;

  out.travel = resolveTravel(order);

  if (u <= 0) {
    out.shape = 0;
    out.scale = SEED_SCALE;
    out.density = SEED_DENSITY;
    return out;
  }
  if (u >= 1) {
    // Not `bornState`, which would also stamp `travel` back to 1: the body
    // finishes forming before it finishes arriving, and collapsing the two here
    // is exactly what would strand a fully-grown blob at the origin for a beat
    // and then teleport it.
    out.shape = 1;
    out.scale = 1;
    out.density = 1;
    return out;
  }

  // Smoothstep, then a shaping exponent. Smoothstep alone lands flat at both
  // ends — which is what keeps the hand-off into the autonomous morph seamless,
  // since the growth rate reaches zero exactly as the blob reaches its resting
  // size — but its toe is too slow to put anything on screen inside the first
  // tenth of a second. The exponent lifts the toe without touching either
  // endpoint or the zero end-slope at u = 1.
  //
  // Not an easing curve in the UI sense: no overshoot, no back, no elastic. The
  // body approaches its size from below and stops there, the way something
  // filling does.
  const s = u * u * (3 - 2 * u);
  const b = Math.pow(s, BIRTH_PARAMS.curve);

  out.shape = b;
  out.scale = SEED_SCALE + (1 - SEED_SCALE) * b;
  out.density = SEED_DENSITY + (1 - SEED_DENSITY) * b;
  return out;
}
