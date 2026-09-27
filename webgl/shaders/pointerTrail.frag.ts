/**
 * The pointer trail — a persistent **viscous displacement field** the cursor
 * drags through.
 *
 * This shader is the whole trail system. It runs once per frame on a small
 * ping-pong pair of half-float targets, reading the previous frame's field and
 * writing the next one:
 *
 * ```
 *   GB = drag       where this patch of fluid is being carried, and how fast
 *   R  = disturbance how agitated this patch is, 0..1 — an envelope, not a height
 *   A  = press      how hard the contact is pushing into the fluid here, 0..1
 * ```
 *
 * ### The channel that drives the effect is GB, not R
 *
 * That is the whole difference from the first cut of this pass, and it is worth
 * stating plainly because the old encoding looked almost identical on paper.
 *
 * Previously `R` was a scalar height stamped to 1.0 wherever the cursor touched,
 * and the composite displaced by its **gradient**. A scalar bump that decays and
 * diffuses does not stay a bump: its peak flattens while its shoulders spread, so
 * the *gradient* — which is zero at the centre and peaks on the shoulder — becomes
 * a ring that grows outward frame after frame. Stamp one and you have drawn an
 * expanding annulus. Hold the cursor still and the deposit keeps topping the bump
 * up, emitting one of those every few frames, forever. Nothing in the code says
 * `sin(d - t)`, and yet the output is a train of concentric waves radiating from
 * the contact point, which is precisely what a stone dropped in water looks like.
 *
 * A vector field has no such failure mode. `GB` stores where the material is being
 * carried; the composite displaces *along it* rather than along the slope of
 * anything. Decaying it makes the whole displacement shrink uniformly; diffusing
 * it spreads the motion into neighbouring fluid. Neither operation can manufacture
 * a ring, because there is no radial structure in the field to begin with — only
 * the direction the cursor happened to be travelling.
 *
 * ### Velocity is what deposits into GB and R, so a parked cursor stops dragging
 *
 * The drag channel relaxes toward `uVelocity`. When the pointer stops, that target
 * *is* zero, so the same relaxation that painted the stroke now actively unwinds
 * it under the resting cursor, and damping carries the rest away. No gate, no
 * special case: holding still is simply depositing a velocity of zero.
 *
 * `R` follows the same rule. It relaxes toward `motion` — a normalised speed —
 * rather than toward a constant 1.0, so it too falls back to nothing under a
 * stationary pointer. It exists to tell the composite *how disturbed* a region is,
 * for the light response, and never displaces anything by itself. Keeping it
 * motion-gated is what stops the light response becoming a glow parked under a
 * resting cursor.
 *
 * ### Press is the opposite: it is presence, not motion
 *
 * Drag alone describes a finger *sweeping* through liquid. It says nothing about a
 * drop *resting* on it, and a velocity-driven field is silent the instant the
 * cursor stops — the contact vanishes even though the object is still there.
 *
 * `A` is that missing half. It relaxes toward the brush profile itself, gated only
 * by presence, so a stationary pointer converges on a steady localised
 * indentation and holds it for as long as it stays. Lift the pointer and the only
 * thing acting is `uPressDecay`, which eases the whole shape back to flat — the
 * elastic recovery.
 *
 * ### Why relaxing toward a *shape* cannot ring, while stamping a height can
 *
 * This is the distinction the rest of this file is built around, and press is a
 * scalar, so it is worth being precise about why it is safe when the old `R` was
 * not.
 *
 * The ring came from a height that was **topped up additively and then left to
 * diffuse**. Diffusion flattens the peak while the shoulders spread, so the
 * *gradient* — zero at the centre, maximal on the shoulder — migrates outward
 * frame after frame. Repeat the deposit and you emit one travelling annulus after
 * another.
 *
 * Press has no such freedom. Its target is `pressShape`, a fixed function of
 * distance to the contact, so under a still cursor it converges to a fixed
 * profile: `p = f·r / (1 - k + k·r)`, a monotone rescaling of the brush falloff.
 * A fixed profile has a fixed gradient. Nothing about it is a function of how long
 * the cursor has been there, so there is nothing to travel. When the contact goes
 * away the field is multiplied down uniformly, which shrinks the amplitude without
 * moving the shape — the dent gets shallower where it already is rather than
 * crawling outward as a shell.
 *
 * `uPressDissipate` is the one control that can reintroduce the old failure, which
 * is why it is small: enough that the indentation bleeds into neighbouring fluid
 * and reads as one connected mass, far short of the amount that would let the
 * shoulder visibly walk outward during the recovery.
 *
 * ### The press brush is wider than the drag brush
 *
 * A drop landing in thick liquid does not leave a pinprick. The material it
 * displaces has to go somewhere, so the deformation is always much broader than
 * the contact itself — hence `uPressRadius`, a multiplier on the shared brush
 * reach rather than a second radius, so the two stay locked as one gesture.
 *
 * ### Diffusion is viscosity, and it is deliberately lopsided
 *
 * Blending toward the neighbourhood average is what makes the deformation
 * propagate: fluid next to the stroke is dragged by the fluid in it, a moment
 * later and a little more weakly. That is the "connected mass" behaviour, and it
 * belongs to the drag channel, so `uDragDissipate` is high.
 *
 * `uPressureDissipate` is deliberately near zero — spreading the scalar channel is
 * exactly the expanding-shell mechanism described above, and although R no longer
 * feeds a gradient by default, `uPushGain` can still route it there.
 *
 * ### Why the brush is a capsule and not a disc
 *
 * A disc stamped at the cursor position leaves gaps at speed: at 60 Hz a fast
 * flick moves the pointer further between frames than the brush is wide, and the
 * trail comes out as a dotted line. Measuring distance to the *segment* from last
 * frame's smoothed position to this frame's costs one dot product and closes the
 * gap exactly. It also gets the shape right for free — the capsule is short when
 * the cursor creeps and long when it flicks, so a fast stroke deposits an
 * elongated slug of aligned drag and the fluid stretches along the path.
 */
export const POINTER_TRAIL_FRAG = /* glsl */ `
precision highp float;

/** Last frame's field. */
uniform sampler2D uPrev;

/** Smoothed pointer, canvas UV, this frame and last. */
uniform vec2 uPointer;
uniform vec2 uPointerPrev;
/** Smoothed pointer velocity, aspect-corrected UV, pre-scaled and clamped. */
uniform vec2 uVelocity;

/** 1 / trail resolution. */
uniform vec2 uTexel;
/** Canvas width / height, so the brush stays circular on screen. */
uniform float uAspect;

/** Brush reach, as a fraction of canvas *height*. */
uniform float uBrushRadius;
/** Deposit rates at the brush core, 0..1, already corrected for frame time. */
uniform float uBrushStrength;
uniform float uDragDeposit;
/** Retention per frame for disturbance and drag, already corrected for frame time. */
uniform float uTrailDecay;
uniform float uTrailDamping;
/** How much of the 4-neighbour average bleeds in, per channel group, 0..1. */
uniform float uPressureDissipate;
uniform float uDragDissipate;

/** Contact press: reach as a multiple of uBrushRadius. */
uniform float uPressRadius;
/** Rate the press converges on the brush profile, already corrected for frame time. */
uniform float uPressDeposit;
/** Press retention per frame — the elastic recovery. Corrected for frame time. */
uniform float uPressDecay;
/** Neighbour bleed for the press channel. Small: this is the ring knob. */
uniform float uPressDissipate;
/** Speed at which the disturbance envelope saturates. */
uniform float uMotionKnee;
/** 0 when the pointer is absent or the effect is disabled. Ramped, not switched. */
uniform float uActive;

varying vec2 vUv;

/**
 * Neighbour taps sit further out than one texel. Diffusion length grows with the
 * square root of (rate x steps x spacing squared), so widening the stencil buys
 * more spread than raising the rate does, and unlike the rate it cannot overshoot
 * into instability.
 */
const float SPREAD = 1.5;

/** Distance from p to the segment a..b. */
float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  return distance(p, a + ab * t);
}

void main() {
  vec4 prev = texture2D(uPrev, vUv);

  // Named 'tap', not 'step' — that one is a GLSL builtin, and shadowing it is
  // legal but upsets enough drivers to be not worth the argument.
  vec2 tap = uTexel * SPREAD;
  vec4 neighbourhood = 0.25 * (
    texture2D(uPrev, vUv + vec2(tap.x, 0.0)) +
    texture2D(uPrev, vUv - vec2(tap.x, 0.0)) +
    texture2D(uPrev, vUv + vec2(0.0, tap.y)) +
    texture2D(uPrev, vUv - vec2(0.0, tap.y))
  );

  // Viscosity, then decay. Momentum spreads into the surrounding fluid; the
  // scalar envelope stays where it was put.
  float pressure = mix(prev.r, neighbourhood.r, uPressureDissipate) * uTrailDecay;
  vec2 drag = mix(prev.gb, neighbourhood.gb, uDragDissipate) * uTrailDamping;

  // The indentation relaxes back toward flat on its own decay, slower than the
  // drag does: the material is thick, so it lets go of the shape long after it has
  // stopped being carried anywhere.
  float press = mix(prev.a, neighbourhood.a, uPressDissipate) * uPressDecay;

  // Everything below works in aspect-corrected space, where a circle is round.
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 a = vec2(uPointerPrev.x * uAspect, uPointerPrev.y);
  vec2 b = vec2(uPointer.x * uAspect, uPointer.y);

  float d = segmentDistance(p, a, b);

  // Squared smoothstep: zero value *and* zero slope at the brush edge, so the
  // stamp has no shoulder for the downstream difference to catch as a hard rim.
  float falloff = 1.0 - smoothstep(0.0, uBrushRadius, d);
  falloff *= falloff;

  // How hard the fluid is being worked here, 0..1. Both *velocity-driven* deposits
  // aim at a target that collapses to zero when the pointer rests, which is the
  // entire reason a parked cursor cannot keep pumping the field. The press below
  // is the deliberate exception, and it aims at a shape rather than a height.
  float motion = smoothstep(0.0, uMotionKnee, length(uVelocity));

  float pressureRate = clamp(falloff * uBrushStrength * uActive, 0.0, 1.0);
  pressure = mix(pressure, motion, pressureRate);

  // Relaxation rather than accumulation: the drag under the brush converges on
  // the pointer's own velocity instead of piling past it, so a long slow stroke
  // and a short slow stroke deform the surface by the same amount.
  float dragRate = clamp(falloff * uDragDeposit * uActive, 0.0, 1.0);
  drag = mix(drag, uVelocity, dragRate);

  // The contact. Its own falloff, over its own wider reach, and — unlike the two
  // above — a target that does not vanish when the pointer holds still: presence
  // alone keeps it there. Same capsule, so a fast stroke presses along the whole
  // path it swept rather than only where it ended up.
  float pressReach = uBrushRadius * uPressRadius;
  float pressShape = 1.0 - smoothstep(0.0, pressReach, d);
  pressShape *= pressShape;

  float pressRate = clamp(pressShape * uPressDeposit * uActive, 0.0, 1.0);
  press = mix(press, pressShape * uActive, pressRate);

  gl_FragColor = vec4(pressure, drag, press);
}
`;
