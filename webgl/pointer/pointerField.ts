import * as THREE from "three";

/**
 * The CPU half of the pointer interaction: turns a raw event stream into
 * something a fluid can be driven by.
 *
 * Raw `pointermove` coordinates are unusable as-is. They arrive at whatever rate
 * the OS feels like — often faster than the display, sometimes far slower — and
 * they jump. Feeding them straight into the brush produces a stamp that teleports
 * between frames and a velocity that is pure noise.
 *
 * So three values are tracked, exactly as a physical contact would have them:
 *
 * ```
 *   target    where the pointer actually is       (raw, from the event)
 *   current   where the *touch* is                (chases target, damped)
 *   velocity  how fast the touch is moving        (chases the derivative, damped)
 * ```
 *
 * `current` is what the brush paints with, which is the whole source of the
 * effect's inertia: the contact lags the cursor slightly, overshoots nothing, and
 * keeps travelling for a moment after the pointer stops.
 *
 * ### Frame-rate independence
 *
 * Every smoothing step uses `1 - exp(-rate * dt)` rather than a fixed lerp
 * factor. A fixed factor makes the chase speed a function of refresh rate — the
 * same drag feels twice as sluggish on a 120 Hz display as on 60 Hz, and a
 * dropped frame produces a visible lurch. The exponential form is the closed-form
 * solution of the damping it approximates, so it is correct at any dt.
 */
export interface PointerFieldParams {
  /** How fast the contact chases the cursor, 1/s. Higher = tighter, less inertia. */
  pointerSmoothing: number;
  /** How fast the velocity estimate chases the measured derivative, 1/s. */
  velocitySmoothing: number;
  /** How fast presence ramps in and out, 1/s. Stops a pop on enter/leave. */
  activeSmoothing: number;
  /** Velocity is measured in UV/second; this maps it into the drag channel's range. */
  velocityScale: number;
  /** Upper bound on the scaled velocity, so a flick cannot blow the field up. */
  velocityClamp: number;
}

export interface PointerField {
  /** Smoothed contact position, canvas UV. */
  readonly current: THREE.Vector2;
  /** Smoothed contact position on the previous frame — the brush capsule's tail. */
  readonly previous: THREE.Vector2;
  /** Smoothed velocity, aspect-corrected UV, scaled and clamped. */
  readonly velocity: THREE.Vector2;
  /** 0..1 presence ramp. */
  readonly active: number;
  /**
   * @param present Pointer is over the canvas and the effect is enabled.
   * @param uvX,uvY Raw pointer in canvas UV (origin bottom-left, matching GL).
   * @param aspect Canvas width / height.
   */
  update(
    dt: number,
    present: boolean,
    uvX: number,
    uvY: number,
    aspect: number,
    params: PointerFieldParams
  ): void;
}

export function createPointerField(): PointerField {
  const target = new THREE.Vector2(0.5, 0.5);
  const current = new THREE.Vector2(0.5, 0.5);
  const previous = new THREE.Vector2(0.5, 0.5);
  const velocity = new THREE.Vector2();
  const measured = new THREE.Vector2();

  let active = 0;
  let engaged = false;

  return {
    current,
    previous,
    velocity,

    get active() {
      return active;
    },

    update(dt, present, uvX, uvY, aspect, params) {
      target.set(uvX, uvY);

      // Entering after an absence must snap. Without this the contact sweeps
      // across the whole canvas from wherever the pointer was last seen, painting
      // a trail the user never drew — most visible when re-entering the window on
      // the opposite side from where they left it.
      if (present && !engaged) {
        current.copy(target);
        previous.copy(target);
        velocity.set(0, 0);
      }
      engaged = present;

      previous.copy(current);

      const chase = 1 - Math.exp(-params.pointerSmoothing * dt);
      current.lerp(target, chase);

      // Measured in aspect-corrected space so a horizontal flick and a vertical
      // one of the same on-screen speed produce the same drag magnitude.
      measured
        .set((current.x - previous.x) * aspect, current.y - previous.y)
        .divideScalar(dt)
        .multiplyScalar(params.velocityScale);

      const speed = measured.length();
      if (speed > params.velocityClamp) {
        measured.multiplyScalar(params.velocityClamp / speed);
      }

      velocity.lerp(measured, 1 - Math.exp(-params.velocitySmoothing * dt));

      const presence = present ? 1 : 0;
      active += (presence - active) * (1 - Math.exp(-params.activeSmoothing * dt));
      // Snap the tail to zero so an absent pointer stops costing a brush stamp.
      if (!present && active < 0.002) active = 0;
    },
  };
}
