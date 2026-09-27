/**
 * The single frame clock for the fluid pipeline.
 *
 * Two jobs, both learned from the reference engine:
 *
 * 1. **Normalise Δt to a 60 Hz frame** so every smoothed value moves the same
 *    distance per unit of wall-clock time regardless of display refresh rate.
 * 2. **Low-pass Δt itself.** Multiplying by a raw `delta` is the classic failure:
 *    one janky frame kicks every animated value at once and the whole scene
 *    visibly lurches. Smoothing the delta absorbs that.
 *
 * The clamp at 20 is what stops "return to a background tab and everything
 * teleports" — a restored tab can report a multi-second delta.
 *
 * This is a module-level singleton mutated in place. Nothing here allocates, and
 * nothing here is React state: it is read from inside frame loops.
 */
export const frame = {
  /** Δt normalised to a 60 Hz frame: 1.0 at 60 fps, 2.0 at 30 fps. Low-passed. */
  d: 1,
  /** `1 / d`. Precomputed because throttles divide by it every frame. */
  d2: 1,
  /**
   * Δt-corrected exponential smoothing coefficients, precomputed once per frame
   * for the whole app. Usage: `x = x * k + target * (1 - k)`.
   *
   * Doing this once beats hundreds of objects each evaluating `Math.pow(k, dt)`.
   */
  k098: 0.98,
  k090: 0.9,
  /** Seconds since the pipeline started. */
  elapsed: 0,
};

/** Call exactly once per frame, before anything reads `frame`. */
export function updateFrame(delta: number): void {
  let inst = delta / 0.016;

  // A zero-length or non-finite first frame would poison the low-pass
  // permanently, so both ends are clamped rather than just the top.
  if (!Number.isFinite(inst) || inst <= 0) inst = 1;
  else if (inst > 20) inst = 20;

  frame.d = frame.d * 0.95 + inst * 0.05;
  frame.d2 = 1 / frame.d;
  frame.k098 = 1 - 0.02 * frame.d;
  frame.k090 = 1 - 0.1 * frame.d;
  frame.elapsed += delta;
}
