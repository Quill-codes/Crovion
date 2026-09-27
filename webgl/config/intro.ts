/**
 * The intro seed — the body the curtain hands off to, and the global settle
 * that runs underneath the whole reveal.
 *
 * ### What the seed is for
 *
 * The single load-bearing idea in the Bravis study, and the one a video capture
 * would miss entirely: the curtain does not dissolve to reveal *the page*. It
 * dissolves to reveal **a screen-filling body in the curtain's own colour**,
 * already in motion, which then collapses to a point — and the hero chain is
 * born out of that point while it is still visible.
 *
 * So there is never a frame where object A stops and object B starts. The
 * hand-off is a merge, and it is free: the seed is an ordinary `FluidBlob` on
 * `FLUID_LAYER`, so it goes through the same blur, the same `α × threshold −
 * cutoff` isoline and the same composite as the chain does. It is not a second
 * layer, not a second render target and not a second pass. It is one more
 * contributor to a field that already knows how to merge things.
 *
 * ### Why the colour match matters more for us than for them
 *
 * Bravis has a saturated brand red on both sides of the crossfade, which is
 * forgiving — two reds at slightly different values still read as one red. Our
 * ground is a pale off-white, where the eye's discrimination is at its best and
 * a few steps of luminance separation shows up as a visible disc. See
 * `INTRO_SEED_TINT` for what that costs us.
 *
 * ### The rotation
 *
 * A radially symmetric body shrinking is very nearly motionless to the eye — it
 * reads as a zoom, not as an object. Bravis unwinds 30° across the collapse for
 * exactly this reason, and it is why their seed reads as a *body turning*.
 * `FluidBlob` already tumbles on x and y, so ours has some of this for free; the
 * z unwind here is what makes the turn legible on a screen-filling silhouette,
 * where the tumble's effect is mostly off-frame.
 *
 * ### Live-tunable
 *
 * Same contract as `FLUID_PARAMS` and `BIRTH_PARAMS`: a plain mutable object the
 * frame loop reads, so a knob costs one property write and never a React render.
 */

import { introClock, introTiming } from "@/lib/intro/director";

export const INTRO_PARAMS = {
  /**
   * Master switch. Off leaves the field exactly as it is without an intro — the
   * seed is never instantiated and the settle stays at rest.
   */
  enabled: true,

  /**
   * Seed radius as a multiple of the *tangent* sphere — the smallest body whose
   * silhouette touches all four corners of the frame. See `IntroSeed`, which does
   * the perspective arithmetic; this is pure margin on top of it.
   *
   * The margin is doing real work rather than being a fudge: the metaball
   * threshold erodes a soft body slightly at its isoline, and the silhouette
   * carries the same procedural wobble the hero blobs do, so a seed sized to
   * exactly the tangent would show its own edge wandering into the corners from
   * the very first frame. 1.15 keeps the boundary off-screen until the collapse
   * brings it in deliberately, without pushing the body so close to the camera
   * that its own curvature starts to read.
   */
  coverage: 1.15,

  /**
   * Initial z rotation, radians. Bravis uses 30°; ours is a little under,
   * because our body is a tessellated sphere with a live noise silhouette rather
   * than a fixed texture and therefore starts from a higher baseline of visible
   * motion.
   */
  rotation: (25 * Math.PI) / 180,

  /** Seconds for the seed to collapse from screen-filling to its floor radius. */
  collapse: 1.4,

  /** Seconds for the rotation to unwind. Outlasts the collapse, as Bravis's does. */
  unwind: 1.5,

  /**
   * Floor the collapse eases down to, as a fraction of the seed's own radius.
   *
   * Not zero: the collapse is the *eased* move and has to land flat, and a body
   * eased to exactly nothing spends its last third invisible, which wastes the
   * part of the curve that reads best. The snuff below finishes the job.
   */
  collapseTo: 0.026,

  /** When the snuff starts, in seconds from `t = 0`. Runs straight off the collapse. */
  snuffAt: 1.4,

  /** Seconds for the snuff. After this the seed is removed from the frame loop. */
  snuff: 0.3,

  /**
   * Global distortion at `t = 0`, in canvas heights of radial displacement.
   *
   * Bravis's `_display.strength`, eased 0.010 → 0.004 across 1.5 s. This is the
   * one element in the whole sequence that is not meant to be consciously
   * perceptible: the entire composited image is more distorted at the moment the
   * curtain lifts and relaxes across the whole reveal, which gives the picture a
   * unified "coming into focus" that outlasts every individual entrance. It is
   * the visual equivalent of a reverb tail.
   *
   * Ours eases to exactly zero rather than to a small resting value, because we
   * have no steady-state refraction for it to settle onto — the pointer field
   * owns all distortion after the intro.
   */
  settleStrength: 0.011,

  /** Seconds for the global distortion to relax. */
  settle: 1.5,
} as const;

/**
 * The seed's colour, before tone mapping.
 *
 * The curtain is `#F5F3F2` under a `rgba(109,74,255,0.18)` radial at 40 %
 * opacity, which composites to about `#EBE7F3` at the radial's centre and
 * `#F5F3F2` outside it — a violet-tinted off-white.
 *
 * These values are authored **pre-ACES**. The composite applies ACES filmic tone
 * mapping and the sRGB transfer on its way to the screen, and ACES saturates
 * around `#E9` — so the seed physically cannot be rendered as light as the
 * curtain, no matter what is written here, and pushing these to the ceiling is
 * the closest the pipeline can get.
 *
 * That residual gap is worth understanding rather than fighting: the seed lands
 * a few steps *under* the curtain, and a body slightly deeper than the veil over
 * it reads as something seen through the veil. A body *lighter* than the curtain
 * would read as a hole punched in it, which is the failure mode. The sign is on
 * our side.
 */
export const INTRO_SEED_TINT = {
  inner: "#EFE7FF",
  mid: "#F7F2FF",
  warm: "#FDF6F4",
  rim: "#FFFFFF",
} as const;

/**
 * Slow start, slow finish, no overshoot — the study's `power3.inOut`.
 *
 * The choice is structural rather than cosmetic. Combined with the fact that the
 * seed starts moving while the curtain is still fully opaque, the fast middle of
 * this curve is spent *behind* the curtain and the visible portion is almost
 * entirely deceleration. You never see the motion start; you catch it in flight,
 * which the brain reads as continuity rather than as an event.
 */
function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function easeOutCubic(u: number): number {
  return 1 - Math.pow(1 - u, 3);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Per-frame seed lifecycle, resolved into a caller-owned struct — nothing allocates. */
export interface SeedState {
  /** Radial scale, as a multiple of the seed's own radius. */
  scale: number;
  /** Z rotation, radians. */
  rotation: number;
  /**
   * 0 = the curtain's colour, 1 = the hero palette. The colour bridge — Bravis
   * authored theirs into the two transition textures; ours is a lerp.
   */
  bridge: number;
  /** False once the snuff is complete: stop drawing, stop stepping. */
  visible: boolean;
}

/**
 * Is the seed part of this page load at all?
 *
 * Under reduced motion it is **never instantiated**. A screen-filling body
 * collapsing to a point is close to a worst case for vestibular sensitivity, and
 * unlike every other element in the sequence there is no "arrives by fading in
 * place" version of it — the seed *is* the movement. The chain is already fully
 * formed at its resting position when the curtain lifts (`birthClock.reduced`
 * does exactly that), so nothing is lost by its absence.
 */
export function introSeedEnabled(reduced: boolean): boolean {
  return INTRO_PARAMS.enabled && !reduced;
}

export function resolveSeed(out: SeedState): SeedState {
  const t = introClock.t;
  const p = INTRO_PARAMS;

  // Held at full coverage through LOADING, so the very first composited frame —
  // which is drawn behind the curtain, and is the frame the `fluid` readiness
  // gate is waiting on — is already the intro's first frame. That is the same
  // structural property Bravis gets for free by constructing its renderer inside
  // its own load gate, and it is what stops the curtain lifting onto a shader
  // compile.
  if (introClock.phase === "LOADING") {
    out.scale = 1;
    out.rotation = p.rotation;
    out.bridge = 0;
    out.visible = true;
    return out;
  }

  const snuffEnd = p.snuffAt + p.snuff;
  if (t >= snuffEnd) {
    out.scale = 0;
    out.rotation = 0;
    out.bridge = 1;
    out.visible = false;
    return out;
  }

  const collapse = easeInOutCubic(clamp01(t / Math.max(p.collapse, 1e-3)));

  if (t < p.snuffAt) {
    out.scale = 1 + (p.collapseTo - 1) * collapse;
  } else {
    // The snuff is a plain ease-out off the collapse's landing value rather than
    // a second shaped move: by here the body is a few pixels across and the only
    // thing left to get right is that it leaves without a visible switch-off.
    const s = easeOutCubic(clamp01((t - p.snuffAt) / Math.max(p.snuff, 1e-3)));
    out.scale = p.collapseTo * (1 - s);
  }

  out.rotation =
    p.rotation * (1 - easeInOutCubic(clamp01(t / Math.max(p.unwind, 1e-3))));
  out.bridge = collapse;
  out.visible = true;
  return out;
}

/**
 * The global distortion, 0 (at rest) to 1 (fully warped).
 *
 * Elevated for the whole of LOADING so the composite's first visible frame is
 * already slightly wrong and resolves, rather than arriving correct and then
 * being disturbed.
 */
export function introSettle(reduced: boolean): number {
  if (!INTRO_PARAMS.enabled || reduced) return 0;
  if (!introClock.started) return 0;
  if (introClock.phase === "LOADING") return 1;
  return 1 - easeInOutCubic(clamp01(introClock.t / Math.max(INTRO_PARAMS.settle, 1e-3)));
}

/**
 * Where the seed's centre is, as a fraction of the way through the reveal — used
 * by nothing yet, but it is the number the chain's travel origin would have to
 * track if the seed ever stops collapsing at the canvas centre.
 *
 * Kept as the one place that knows the seed sits at the origin, so a later change
 * to that has exactly one site rather than three.
 */
export const INTRO_SEED_ORIGIN: readonly [number, number, number] = [0, 0, 0];

/** Seconds from `t = 0` to the moment the chain is released. Re-exported for the canvas. */
export function introRevealAt(): number {
  return introTiming().reveal;
}
