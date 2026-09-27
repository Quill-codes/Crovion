/**
 * The metaball composite — where the fluid silhouette is actually made.
 *
 * ### The mechanism
 *
 * `mask = blurredAlpha * uThreshold - uCutoff`
 *
 * A steep linear ramp on the *blurred* alpha channel. Two soft blobs whose
 * blurred alpha each sit below the isoline will, where their falloffs overlap,
 * sum past it and snap into one continuous shape with a smooth neck. The merge
 * is emergent — nothing draws the bridge, and the cost does not grow with the
 * number of blobs.
 *
 * ### Keeping Crovion's purple
 *
 * A naive implementation samples the blurred colour everywhere and the spheres
 * turn into soft mush, losing the Fresnel ramp, the drifting interior flow and
 * the rim that make them Crovion's.
 *
 * So colour comes from two places, chosen per pixel by the *unblurred* alpha:
 *
 * - `sharp.a ≈ 1` — inside the original sphere: use its own crisp colour.
 * - `sharp.a = 0` — the neck between blobs, where no geometry exists: use the
 *   blurred colour, which is the alpha-weighted average of whatever blobs reach
 *   that pixel, so the bridge is tinted by the blobs it joins.
 *
 * The silhouette is the mask's job; the interior is the sphere shader's job.
 * Neither touches the other.
 *
 * ### Colour management
 *
 * The blob shader writes raw unlit values and the pipeline carries them through
 * the render targets untouched (`NoColorSpace`), so tone mapping and the sRGB
 * transfer have to be applied once, here, at the end. That is exactly what the
 * postprocessing composer used to do on its way to the screen, which is why the
 * two three.js chunks below are not optional decoration — without them the
 * purples come out visibly lighter and flatter than the current design.
 *
 * ### Where the pointer enters — and why it is here rather than earlier
 *
 * The pointer field displaces the UV the fluid lookups use, before either is read.
 * Nothing outside the fluid is touched: the offset is a function of the trail's
 * drag channel, which is zero everywhere the cursor has not been, so the composite
 * is bit-identical to Phase 2 wherever the pointer is not.
 *
 * Applying it here — after the blur — is deliberate. Displacing the blob buffer
 * *before* the blur would work, but the blur would then smear the deformation
 * across its own 20 px kernel and most of it would be averaged away; recovering
 * the same visible amplitude would need a much larger offset, which distorts the
 * silhouette far more than intended. Post-blur, the offset is applied to a field
 * that is already smooth, so a small warp survives intact. It is also the only
 * placement that costs no extra pass: the composite was already sampling both
 * buffers, and it now samples them at a different coordinate.
 *
 * ### Two effects, one field, two different amplitudes
 *
 * A real body of thick liquid does two visibly different things when you drag a
 * finger through it, and they do not happen at the same scale. The interior — the
 * shading, the flow, the gradient — moves a *lot*, because that is the material
 * itself being carried along. The outer boundary moves comparatively little,
 * because surface tension and the sheer mass of the rest of the body resist it.
 *
 * Driving both from one offset forces a choice between an interior that barely
 * shifts and a silhouette that sloshes like a flag. So the same displacement is
 * applied twice at two gains:
 *
 * - `uvInterior` — the sharp blob colour, at `uInteriorGain` x the offset. This is
 *   the visible flow: the pink/red gradient inside the body slides with the
 *   cursor.
 * - `uvSurface` — the blurred field the threshold reads, at 1x. This is the
 *   silhouette, and it deforms subtly rather than swinging.
 *
 * ### The silhouette also swells and thins, which a warp alone cannot do
 *
 * Warping the blurred field moves the outline sideways but conserves it — the body
 * cannot get locally fatter, only shifted. Real liquid pushed by a finger piles up
 * ahead of the stroke and thins behind it.
 *
 * That is the **divergence** of the drag field, and it is free here: the four taps
 * already fetched for the gradient carry the drag channels too. Negative
 * divergence means fluid converging on this point — material piling up — so the
 * isoline is nudged outward and the body bulges. Positive divergence thins it. The
 * term is added to the mask *inside* the soft edge band, and since the blurred
 * alpha is zero outside the body the mask there stays far below the cutoff, so
 * this cannot paint fluid into empty space.
 *
 * ### The contact press: what the drag field alone could never say
 *
 * Everything above is driven by *motion*. It describes a finger sweeping through
 * liquid perfectly and a drop *sitting* on it not at all — hold the cursor still
 * and a velocity-driven field is, correctly, zero.
 *
 * The press channel is the other half, and it enters here in two places that are
 * two halves of one physical event:
 *
 *   **Material is shoved aside.** `pressGradient` points uphill, toward the
 *   contact. Sampling *along* it means each pixel shows what used to be nearer the
 *   centre, so the material reads as having moved outward, away from the contact —
 *   which is what a drop pushing into gel does to the gel around it. It runs
 *   through the same `uInteriorGain` split as the drag, so the internal pink flows
 *   generously while the boundary gives only a little.
 *
 *   **The contact itself sinks.** `uPressDepth` subtracts the press from the mask.
 *   Deep inside the body the mask is saturated many times over and this is
 *   invisible; within the soft edge band it pulls the isoline in, so a press near
 *   the silhouette dents it. Subtracting can only ever remove fluid, so like the
 *   divergence term it cannot paint into empty space.
 *
 * Those two together are the drop signature — a depression at the contact, a
 * broader swell of displaced material around it — and, critically, that structure
 * is *static*: it is a function of where the contact is, not of how long it has
 * been there. It follows the cursor, deepens while the cursor rests, and eases out
 * when it leaves. It never travels outward, which is the entire difference between
 * this and a ripple.
 *
 * The press deliberately does **not** reach `uTrailLift`. A brightness that
 * survives a stationary cursor is a cursor glow.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;

/** Sharp, premultiplied: the sphere scene exactly as it rendered. */
uniform sampler2D uBlob;
/** Horizontal blur only — debug view. */
uniform sampler2D uBlurH;
/** Both blur passes: the field the threshold reads. */
uniform sampler2D uBlurred;

/** The pointer field. R = disturbance envelope, GB = drag, A = contact press. */
uniform sampler2D uTrail;
/** 1 / trail resolution. */
uniform vec2 uTrailTexel;
/** Canvas width / height. */
uniform float uAspect;

uniform float uThreshold;
uniform float uCutoff;
uniform float uGlow;
/**
 * The aura: a soft skirt of alpha *outside* the isoline, tinted by whatever body
 * put the field there.
 *
 * This is the only stage in the pipeline that can carry one. The blob fragment
 * cannot: alpha there **is** the metaball field, so anything it adds at the edge
 * moves the isoline instead of sitting behind it, and anything it removes thins
 * the body until the threshold loses it. A halo drawn as its own mesh has the
 * same problem from the other direction — it would be blurred and thresholded
 * along with everything else and simply fuse into a bigger body.
 *
 * Here, the field already extends past the isoline; it is just being discarded.
 * Reading it back as a low alpha in the band below the cutoff costs one
 * smoothstep, needs no new texture, and is automatically per-body, per-size and
 * correctly tinted: the colour at those pixels is the blurred average of the
 * bodies that reach them, which for a lone body is its own rim.
 */
uniform float uAura;

/** How strongly buried surfaces dissolve into the merged body. */
uniform float uFuse;

/** Peak UV offset applied to the silhouette, in canvas heights. */
uniform float uDisplacementStrength;
/**
 * The global settle — peak radial refraction, in canvas heights, already scaled
 * by wherever the intro is in its relaxation. Zero at rest, and zero for the
 * entire life of the page once the intro has finished.
 */
uniform float uSettle;
/** Multiplier on that offset for the interior colour. > 1: the inside flows more. */
uniform float uInteriorGain;
/** Weight of the directional (drag) and radial (gradient) displacement terms. */
uniform float uDragGain;
uniform float uPushGain;
/** How far drag divergence is allowed to swell or thin the silhouette. */
uniform float uSurfaceGain;
/** How strongly the contact shoves material aside, and how deep it sinks in. */
uniform float uPressGain;
uniform float uPressDepth;
/** Press reach as a multiple of uBrushRadius — the gradient's normaliser. */
uniform float uPressRadius;
/** Normaliser for the finite differences — see below. */
uniform float uBrushRadius;
/** How much the disturbed region brightens. */
uniform float uTrailLift;

uniform int uDebug;

varying vec2 vUv;

/**
 * Premultiplied -> straight. Below roughly one 8-bit step the division amplifies
 * quantisation into garish colour, and those pixels are masked out anyway, so
 * they are simply dropped.
 */
vec3 straighten(vec4 c) {
  return c.a > 0.004 ? c.rgb / c.a : vec3(0.0);
}

void main() {
  // ── Pointer displacement ──
  //
  // Everything here is computed in aspect-corrected space, where a circle is
  // round, and converted back to UV at the end.
  //
  // Both finite differences are central differences over one trail texel,
  // rescaled from "per texel" to "per unit of screen height" and then multiplied
  // by the brush radius. That last step is what makes the strength knobs mean
  // something stable: a brush twice as wide has half the slope, so without it the
  // same uDisplacementStrength would produce half the deformation, and the
  // controls could not be tuned independently.
  vec4 trail = texture2D(uTrail, vUv);

  vec4 tL = texture2D(uTrail, vUv - vec2(uTrailTexel.x, 0.0));
  vec4 tR = texture2D(uTrail, vUv + vec2(uTrailTexel.x, 0.0));
  vec4 tD = texture2D(uTrail, vUv - vec2(0.0, uTrailTexel.y));
  vec4 tU = texture2D(uTrail, vUv + vec2(0.0, uTrailTexel.y));

  float perX = uBrushRadius / (2.0 * uTrailTexel.x * uAspect);
  float perY = uBrushRadius / (2.0 * uTrailTexel.y);

  vec2 gradient = vec2((tR.r - tL.r) * perX, (tU.r - tD.r) * perY);
  float divergence = (tR.g - tL.g) * perX + (tU.b - tD.b) * perY;

  // The press is deposited over a wider brush, so its slope is correspondingly
  // shallower; scaling by the same factor keeps uPressGain calibrated in the same
  // units as uDragGain instead of drifting every time the reach is retuned.
  vec2 pressGradient =
    vec2((tR.a - tL.a) * perX, (tU.a - tD.a) * perY) * uPressRadius;

  // Directional — the whole effect.
  //
  // The sign is the load-bearing part. To make the material at a point appear to
  // have moved *forward* along the stroke, the pixel there must show what used to
  // be behind it, so the sample coordinate walks backward: hence -drag. Positive
  // uDragGain therefore means "the fluid is carried with the cursor", which is
  // what dragging a finger through honey does. Flipping the sign gives the
  // opposite reading — the surface sliding backward out from under the pointer.
  //
  // Press — the contact shoving material outward, away from itself.
  //
  // Same sign logic as the drag: to make the material read as having moved *out*,
  // the sample walks *in*, which is along +pressGradient since the gradient points
  // uphill toward the contact. A negative gain reverses it into a pinch, drawing
  // the material toward the cursor instead.
  //
  // This term is what a stationary cursor produces, and unlike the two below it is
  // anchored to the contact rather than to the age of the field.
  //
  // Radial — off by default, and it is the ring generator.
  //
  // The gradient of the scalar channel points outward from the contact, so this
  // term dents (negative) or bulges (positive) the surface concentrically about
  // the cursor. Because the scalar channel decays and spreads, that concentric
  // structure travels outward as it ages, which is exactly the expanding water
  // ring this pass exists not to produce. Kept as a knob, defaulted to zero.
  vec2 push =
    -trail.gb * uDragGain + pressGradient * uPressGain + gradient * uPushGain;
  vec2 offset = push * uDisplacementStrength;

  vec2 duv = vec2(offset.x / uAspect, offset.y);

  // ── The global settle ──
  //
  // Bravis eases one strength uniform in its display shader from 0.010 to 0.004
  // across the whole reveal: the entire composited image is 2.5x more distorted
  // at the instant the curtain lifts, and relaxes over 1.5 s. You cannot
  // consciously see it, and that is exactly the point — it is a slow, unified
  // relaxation that outlasts every individual element's entrance and gives the
  // picture a single "coming into focus". The visual equivalent of a reverb tail.
  //
  // A cubic barrel term rather than an affine scale, and the distinction is
  // load-bearing. A plain c * k is a zoom, and a zoom is the one thing this
  // sequence must never look like — the seed is already collapsing, and a second
  // whole-frame scale on top of it would read as the camera moving. Weighting by
  // dot(c, c) leaves the centre of the frame — where the seed, and then the
  // chain, actually are — untouched and warps only the periphery, which is
  // refraction rather than motion.
  //
  // Applied equally to both lookups below rather than through uInteriorGain:
  // this is a property of the whole composite, not of the fluid's response to a
  // cursor, so the silhouette and the interior have to settle together or the
  // body's edge would slide against its own shading.
  vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 lens = c * dot(c, c) * uSettle;
  vec2 dLens = vec2(lens.x / uAspect, lens.y);

  // The interior flows further than the boundary does — see the header.
  vec2 uvSurface = vUv + duv + dLens;
  vec2 uvInterior = vUv + duv * uInteriorGain + dLens;

  vec4 sharp = texture2D(uBlob, uvInterior);
  vec4 blurred = texture2D(uBlurred, uvSurface);

  // ── The metaball ──
  //
  // The divergence term rides inside the soft edge band: fluid converging here
  // (negative divergence) pushes the isoline out and the body swells, fluid
  // spreading apart thins it. Outside the body blurred.a is zero, so the mask sits
  // at -uCutoff and no plausible divergence can lift it above the isoline.
  //
  // The press rides alongside it and only ever subtracts: the contact sinks into
  // the body, and where there is no body there is nothing to sink.
  float mask = clamp(
    blurred.a * uThreshold
      - uCutoff
      - divergence * uSurfaceGain
      - trail.a * uPressDepth,
    0.0,
    1.0
  );

  vec3 blurCol = straighten(blurred);
  vec3 sharpCol = straighten(sharp);

  // Crisp where the sphere really is, blurred average where only the field is.
  float coverage = clamp(sharp.a, 0.0, 1.0);
  vec3 col = mix(blurCol, sharpCol, coverage);

  // ── Dissolve buried surfaces ──
  //
  // The silhouette merges, but the colour underneath does not: these are still
  // depth-sorted 3D spheres, so each one keeps drawing its own Fresnel rim where
  // it is buried inside its neighbour. That leaves a bright seam down the join
  // and the result reads as two balls touching rather than one body.
  //
  // Two conditions have to hold together, and using either alone is wrong.
  //
  //   interior — the blurred field saturates well inside a fused body but sits
  //   near the isoline at any outer silhouette, so this protects the real rim.
  //   On its own it also covers the entire middle of a lone sphere, and fading
  //   that to a 0.4x-resolution average flattens the interior flow and the
  //   organic silhouette into a plain ball.
  //
  //   discontinuity — a buried rim is exactly where the sharp colour departs
  //   from its own neighbourhood average, because the average smooths across the
  //   depth step. Inside a lone sphere the shading is smooth, so the two agree
  //   and nothing is touched.
  //
  // Their product isolates buried surfaces and leaves everything else intact.
  float interior = smoothstep(0.92, 1.0, blurred.a);
  float discontinuity = smoothstep(0.05, 0.20, length(sharpCol - blurCol));
  col = mix(col, blurCol, interior * discontinuity * uFuse);

  // The blur is already paid for; reuse it as a wide, cheap halo.
  //
  // Gated by (1 - coverage) so it only lights the skirt *around* the geometry.
  // Applied flat it lifts every interior pixel instead, which reads as a washed
  // out sphere — the bloom this replaces only ever touched highlights.
  col += blurCol * blurred.a * uGlow * (1.0 - coverage);

  // The disturbed surface catches the light.
  //
  // A gain on the colour already composed for this pixel, not an added colour of
  // its own. That distinction matters: adding the *blurred* colour would inject a
  // soft 0.4x-resolution patch over the sharp interior, flattening the Fresnel
  // rim and the drifting flow inside the sphere exactly where the cursor is —
  // and a soft bright patch that follows the cursor is a cursor glow, which is
  // the one thing this effect must not become. A pure multiply cannot shift hue
  // or blur anything; it can only make purple that is already there brighter.
  //
  // Outside the fluid the mask is zero, so this contributes nothing at all.
  col += col * trail.r * uTrailLift;

  // ── The aura ──
  //
  // The band runs from a quarter of the isoline's field value up to the isoline
  // itself, derived rather than authored so it tracks the threshold pair instead
  // of going stale the moment either is retuned. (1 - mask) keeps it strictly
  // outside — inside the body it is zero and the silhouette is untouched — and
  // the ceiling is low by design: this is a breath of tinted air around a
  // droplet, not a glow.
  float iso = uCutoff / max(uThreshold, 1e-4);
  float aura = smoothstep(iso * 0.25, iso, blurred.a) * (1.0 - mask) * uAura;

  gl_FragColor = vec4(col, max(mask, aura));

  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Debug taps sit after the colour conversion so they show the pipeline's real
  // values rather than gamma-encoded ones.
  if (uDebug == 1) gl_FragColor = vec4(sharpCol, 1.0);
  else if (uDebug == 2) gl_FragColor = vec4(vec3(sharp.a), 1.0);
  else if (uDebug == 3) gl_FragColor = vec4(vec3(texture2D(uBlurH, vUv).a), 1.0);
  else if (uDebug == 4) gl_FragColor = vec4(vec3(blurred.a), 1.0);
  else if (uDebug == 5) gl_FragColor = vec4(vec3(mask), 1.0);
  else if (uDebug == 6) gl_FragColor = vec4(blurCol, 1.0);
  // Drag and divergence are signed; recentre on grey so both signs are readable.
  else if (uDebug == 7) gl_FragColor = vec4(vec3(trail.r), 1.0);
  else if (uDebug == 8) gl_FragColor = vec4(trail.gb * 0.5 + 0.5, 0.5, 1.0);
  else if (uDebug == 9) gl_FragColor = vec4(vec3(length(offset) * 20.0), 1.0);
  else if (uDebug == 10) gl_FragColor = vec4(vec3(divergence * 0.5 + 0.5), 1.0);
  else if (uDebug == 11) gl_FragColor = vec4(vec3(trail.a), 1.0);
  else if (uDebug == 12) gl_FragColor = vec4(pressGradient * 0.5 + 0.5, 0.5, 1.0);
}
`;
