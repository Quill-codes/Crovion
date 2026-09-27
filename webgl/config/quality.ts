/**
 * Single source of truth for the fluid pipeline's fixed costs and tunables.
 *
 * Phase 2 scope: everything here serves the metaball proof (blob FBO → blur →
 * threshold). DPR tiers, mobile branches and pool sizes arrive in later phases.
 */

/**
 * Render layers.
 *
 * The pipeline has to separate "things that become fluid" from "things that stay
 * as they are". Thresholding the whole scene would erase the ambient background
 * spheres (opacity 0.03–0.07 — far below any usable isoline) and the contact
 * shadow, which would silently change the composition.
 *
 * `camera.layers.set()` is the cheapest possible way to draw the same scene
 * twice with two different subsets, and it costs nothing per frame.
 */
export const FLUID_LAYER = 1;
export const AMBIENT_LAYER = 0;

/**
 * Any `useFrame` priority above 0 makes R3F hand rendering over to us — it stops
 * calling `gl.render` itself. Everything else in the scene stays at the default
 * priority 0 and therefore still runs *before* this, which is what lets the
 * spheres finish writing their uniforms before we draw them.
 */
export const FLUID_RENDER_PRIORITY = 1;

/**
 * Phase 2.5 — the hand-drawn `<Line>` and the three bead spheres that once faked
 * the connection between the two main blobs.
 *
 * **No longer read by anything.** The connector came back as a first-class part
 * of the composition rather than a fallback: `HeroCanvas` now emits one
 * `<Connector>` per link in the sphere chain, restyled for the light ground and
 * chained across all four spheres. The flag is kept only so the name resolves in
 * older notes; deleting the connectors is now a matter of not rendering them.
 */
export const LEGACY_CONNECTORS = false;

/**
 * The three cursor interactions available for comparison.
 *
 * `LEGACY` is the vertex-stage Gaussian dent that predates the pipeline: it
 * deforms the actual sphere geometry under the cursor, on one sphere at a time.
 * `POINTER` is the Phase 3 trail field, which deforms the composited surface and
 * never touches geometry. `BOTH` is the current default.
 */
export const INTERACTION_MODE = {
  LEGACY: 0,
  POINTER: 1,
  BOTH: 2,
} as const;

export type InteractionMode =
  (typeof INTERACTION_MODE)[keyof typeof INTERACTION_MODE];

/** Indexed by `interactionMode`: is the legacy vertex dent live? */
export const LEGACY_TOUCH_MODES = [true, false, true] as const;
/** Indexed by `interactionMode`: is the pointer field live? */
export const POINTER_FIELD_MODES = [false, true, true] as const;

export const QUALITY = {
  /**
   * Blur render targets, as a fraction of the blob target.
   *
   * The blur is the entire GPU budget of this pipeline, and its output is by
   * definition band-limited — so it is the one buffer that can be shrunk with no
   * visible cost. Sub-resolution also lets the kernel reach further in screen
   * pixels for the same tap count.
   */
  blurScale: 0.4,

  /**
   * Discrete Gaussian taps per side. 15 → 31 effective taps, delivered in 17
   * texture fetches by pairing adjacent taps onto hardware bilinear samples.
   */
  blurRadiusTaps: 15,

  /**
   * Pointer trail targets, as a fraction of the canvas in **CSS pixels** — not of
   * the blob target, so the field's resolution does not swing with device pixel
   * ratio. The trail is a low-frequency pressure field consumed through a
   * gradient; a third of CSS resolution carries it with no visible stepping, and
   * keeps the ping-pong pair small enough that half-float storage is free.
   */
  trailScale: 0.35,

  /** Floor for the trail targets, so a tiny viewport cannot degenerate them. */
  trailMinSize: 64,
} as const;

/**
 * Live-tunable parameters.
 *
 * A plain mutable object rather than React state on purpose: the Leva panel
 * writes into it and the frame loop reads it, so turning a knob never triggers a
 * React render and the render loop never touches the React tree.
 */
export const FLUID_PARAMS = {
  /**
   * Gaussian reach in **screen pixels**, converted to source texels per pass so
   * the horizontal and vertical passes stay isotropic despite reading buffers of
   * different resolutions.
   *
   * This is the merge distance: two blobs fuse when their surfaces come within
   * roughly this many pixels of each other.
   */
  blurRadius: 20,

  /** 0 = pass the source through untouched, 1 = full Gaussian. */
  blurStrength: 1,

  /**
   * The metaball. `mask = blurredAlpha * threshold - cutoff`.
   *
   * `cutoff / threshold` is the isoline — the blurred-alpha level that becomes
   * the surface. `1 / threshold` is the width of the soft edge band.
   *
   * Held slightly under 0.5 so the silhouette grows a hair rather than shrinking:
   * blurring and re-thresholding a hard-edged sphere at exactly 0.5 reproduces
   * its original outline, and anything above 0.5 eats into it.
   *
   * These are Crovion's own values, tuned against Crovion's spheres.
   */
  threshold: 9,
  cutoff: 3.8,

  /**
   * Reuses the blur we already paid for as a cheap wide-radius glow, standing in
   * for the bloom that left with the postprocessing composer.
   */
  glow: 0.25,

  /**
   * The soft halo outside each body's silhouette — see uAura in
   * composite.frag.ts for why it lives in the composite and nowhere else.
   *
   * 0.16 is a ceiling on the skirt's alpha, reached only against the isoline and
   * falling to nothing a blur-radius out. Low on purpose: the brief asks for a
   * halo *slightly* larger than the body and explicitly not a neon glow, and the
   * band this rides on is the same 20px kernel the merge uses, so anything much
   * above 0.2 starts reading as the bodies being out of focus rather than as air
   * around them.
   */
  aura: 0.16,

  /**
   * How strongly surfaces buried inside a fused body dissolve into it.
   *
   * These are still depth-sorted 3D spheres, so without this each one keeps its
   * own rim where it is swallowed by a neighbour and the join reads as a seam.
   * 0 leaves that seam fully visible; 1 replaces every deep-interior pixel with
   * the blurred field.
   */
  fuse: 0.85,

  // ── Phase 3 · pointer fluid ──────────────────────────────────────────────

  /**
   * Which cursor interaction is live. See `INTERACTION_MODE`.
   *
   * Two systems currently coexist: the pre-existing vertex-stage dent in
   * `FluidBlob` (`uTouchPoint`), and the Phase 3 pointer field. This exists so
   * they can be judged against each other on screen rather than in the abstract,
   * and so neither has to be deleted before that judgement is made.
   *
   * Defaults to POINTER for the validation pass: judging the new system on its
   * own comes first, since whether stacking it on the legacy dent reads as richer
   * or as muddy is only answerable once its solo behaviour is known.
   */
  interactionMode: INTERACTION_MODE.POINTER as InteractionMode,

  /** Master switch for the whole pointer layer, independent of the mode. */
  pointerEnabled: true,

  /**
   * Brush reach, as a fraction of canvas **height**.
   *
   * Also the normaliser for the displacement gradient downstream, so widening the
   * brush does not silently strengthen the deformation — the two knobs stay
   * independent, which is the only way they are tunable by hand.
   */
  brushRadius: 0.15,

  /**
   * How hard the brush drives the **disturbance envelope** (R) toward the
   * pointer's normalised speed at the brush core, per 60 Hz frame.
   *
   * Deposit is a relaxation, so this is a rate and not an amount: it cannot
   * overshoot, and because the target collapses to zero when the cursor rests, a
   * parked pointer lets the envelope drain rather than pumping it.
   */
  brushStrength: 0.22,

  /**
   * How hard the brush drives the **drag** channel (GB) toward the pointer's
   * velocity, per 60 Hz frame. Higher than `brushStrength`: the material under the
   * cursor should pick up its motion promptly, while the light response that R
   * drives is allowed to build more slowly.
   */
  dragDeposit: 0.38,

  /**
   * Speed — in the same pre-scaled units as `velocityScale` produces — at which
   * the disturbance envelope saturates. A brisk drag lands near 1; a slow,
   * deliberate one lands around 0.4; a resting cursor lands at 0.
   */
  motionKnee: 0.45,

  /**
   * Envelope retention per 60 Hz frame. 0.975 → halves every ~0.45 s.
   *
   * Only reaches the picture through `trailLift`, so this is the "how long does
   * the disturbed area keep catching the light" knob.
   */
  trailDecay: 0.975,

  /**
   * Drag retention per 60 Hz frame — the **viscosity/settle knob**, and the one
   * that decides whether this reads as water or as honey.
   *
   * 0.95 halves the carried motion every ~0.23 s and is gone inside about a
   * second, so the fluid keeps moving for a beat after the cursor stops and then
   * eases to rest. Lower snaps back (thin, watery); higher keeps flowing (thick,
   * and past ~0.98 the deformation stops recovering within a gesture).
   */
  trailDamping: 0.95,

  /**
   * Per-frame bleed toward the neighbourhood average, split by channel.
   *
   * `drag` is the viscosity term proper: it is how a stroke pulls the fluid
   * *beside* it along, a moment later and more weakly, which is what makes the
   * body read as one connected mass rather than a dent travelling over a skin.
   * It wants to be generous.
   *
   * `pressure` spreads the scalar envelope, and spreading a scalar is precisely
   * how a stamp turns into an outward-travelling shell. Kept near zero.
   */
  dragDissipate: 0.22,
  pressureDissipate: 0.04,

  // ── The contact press ─────────────────────────────────────────────────────
  //
  // Everything above this block is driven by cursor *velocity*, and velocity
  // describes a finger sweeping through liquid — not an object resting on it. A
  // parked cursor deposits a velocity of zero and the surface goes flat, which is
  // correct for a drag field and wrong for a drop.
  //
  // These five knobs are the resting half: presence alone indents the fluid, the
  // indentation follows the contact, and it eases back out when the contact
  // leaves. See `pointerTrail.frag` for why relaxing toward a fixed *shape*
  // cannot produce the expanding ring that a stamped, diffusing *height* does.

  /**
   * Press reach, as a multiple of `brushRadius` — so 1.7 x 0.15 is a quarter of
   * the canvas height across.
   *
   * Deliberately much wider than the drag brush. A drop landing in something thick
   * does not leave a pinprick: the material it displaces has to go somewhere, and
   * the deformation is always far broader than the contact patch. A press at the
   * drag brush's own width reads as a small hard dent, which is the failure this
   * value exists to avoid.
   */
  pressRadius: 1.7,

  /**
   * How fast the press converges on that profile, per 60 Hz frame.
   *
   * A rate, not an amount — it cannot overshoot the shape, so this only sets how
   * *quickly* the fluid gives. 0.18 takes roughly a third of a second to reach
   * full depth, which is the difference between something settling into gel and
   * something snapping into rubber.
   */
  pressDeposit: 0.18,

  /**
   * Press retention per 60 Hz frame — the elastic recovery. 0.985 halves every
   * ~0.75 s and is flat inside about three seconds.
   *
   * Slower than `trailDamping` on purpose: thick liquid stops being *carried* long
   * before it stops being *deformed*. Lower makes the surface spring back and reads
   * thin; past ~0.995 the indentation outlives the gesture and the body never
   * looks settled.
   */
  pressDecay: 0.985,

  /**
   * Neighbour bleed for the press channel. **This is the ring knob.**
   *
   * A little is what makes the indentation belong to the surrounding fluid rather
   * than sit on it — the deformation spreads into the connected mass. Too much and
   * the recovery reintroduces the old failure: diffusion flattens the peak while
   * the shoulders spread, so the gradient's maximum walks outward and one visible
   * shell travels away from the contact as it fades. At 0.05 that migration is a
   * couple of texels against a press ~60 wide, which is nothing.
   */
  pressDissipate: 0.05,

  /**
   * How hard the contact shoves material aside.
   *
   * Positive samples toward the contact, so the material reads as pushed *outward*
   * away from it — a drop displacing the gel around itself. Negative pinches the
   * material inward toward the cursor instead.
   *
   * **Calibrated, not guessed.** The press profile's steepest slope is ~7.7 per
   * canvas height, which the composite's brush-radius normaliser turns into a
   * gradient of ~1.97 — nearly twice the magnitude the drag channel can ever reach,
   * since that one is clamped at 1 by `velocityClamp`. Matching `dragGain`'s 0.65
   * here would therefore make a *resting* cursor deform the body almost three times
   * harder than a full-speed flick does, at ~10 % of canvas height, which stops
   * reading as a press and starts reading as a lens.
   *
   * 0.3 puts the resting contact just under a brisk drag: ~12 px of boundary and
   * ~27 px of interior flow on a 900 px canvas. Clearly visible, still a press.
   */
  pressGain: 0.3,

  /**
   * How deep the contact sinks into the silhouette, in mask units.
   *
   * Subtractive, and the mask is saturated several times over inside the body, so
   * this is invisible except within the soft edge band — meaning a press in the
   * middle of a sphere only moves the interior, while a press near the outline
   * dents it. Exactly the right asymmetry, and free.
   *
   * The blurred alpha ramps over roughly `2 x blurRadius`, so the mask moves about
   * 0.22 per screen pixel near the outline: 2.2 pulls it in by ~9 px at full press,
   * against a surround the warp is pushing out by ~12 px. A depression with
   * displaced material heaped around it — the drop signature — and the two are
   * within a few pixels of each other on purpose, since one is the material the
   * other one moved.
   *
   * Deep inside a fused body the mask sits near 5.2 before this subtracts, so the
   * headroom is comfortable and no value on the panel can punch a hole through a
   * sphere. A thin neck is a different matter: pressing on one visibly thins it,
   * which is correct.
   */
  pressDepth: 2.2,

  /** Contact chase rate, 1/s. Lower = more lag between cursor and deformation. */
  pointerSmoothing: 13,
  /**
   * Velocity chase rate, 1/s. This is the inertia: the estimate lags the real
   * cursor going in *and* coming out, so the field keeps being fed for a moment
   * after the pointer stops dead.
   */
  velocitySmoothing: 7,
  /** Presence ramp rate, 1/s — how fast the effect engages and disengages. */
  activeSmoothing: 7,

  /**
   * Maps measured UV/second into the drag channel's working range, where 1.0 is
   * "as much displacement as this effect ever applies".
   *
   * This calibration is the single biggest correction in the pass. At the previous
   * 0.22, a comfortable mouse drag (~1 canvas height per second) produced a drag
   * magnitude near 0.2, while the radial gradient term — normalised by the brush
   * radius — sat near 1.0. The directional term was therefore roughly five times
   * weaker than the radial one at every realistic cursor speed, so whatever the
   * gains said, what actually reached the screen was the radial term: a
   * concentric, outward-spreading dent. At 0.55 a normal drag lands near 0.55 and
   * a flick clamps at 1.0, which puts velocity in charge.
   */
  velocityScale: 0.55,
  /** Ceiling on the scaled velocity. A flick cannot drive the field past this. */
  velocityClamp: 1,

  /**
   * Peak UV offset applied to the fluid **silhouette**, in canvas heights.
   *
   * At full drag this is ~1.6 % of canvas height of boundary movement — enough
   * that the outline visibly gives and stretches along a fast stroke, short of the
   * slosh that would read as the whole body wobbling.
   */
  displacementStrength: 0.025,

  /**
   * Multiplier on that offset for the **interior** colour lookup.
   *
   * The two things the reference does are not the same size: the internal gradient
   * flows a lot, the boundary moves a little. One offset cannot serve both, so the
   * interior gets this much more of it. 1.0 collapses the two back together.
   */
  interiorGain: 2.2,

  /**
   * How strongly the drag field's velocity is carried into the surface.
   *
   * Positive means the fluid moves **with** the cursor — material sticking to a
   * finger dragged through honey. Negative slides the surface backward out from
   * under the pointer instead, which reads as the cursor skating on top of the
   * body rather than through it.
   */
  dragGain: 0.65,

  /**
   * Radial displacement from the envelope's gradient. **Zero on purpose.**
   *
   * This term is the ring generator and the dimple generator, which are the same
   * mechanism seen at two ages. The gradient of a scalar bump points outward from
   * the contact, so any non-zero value here dents (negative) or bulges (positive)
   * the surface concentrically about the cursor; and since the bump flattens and
   * spreads as it decays, the peak of its gradient migrates outward over the next
   * half second, which is an expanding ring whether or not anything ever computed
   * a sine of anything.
   *
   * Left exposed because a small negative value is a legitimate look — it just is
   * not this one.
   */
  pushGain: 0,

  /**
   * How far the drag field's **divergence** may swell or thin the silhouette.
   *
   * The UV warp alone can only shift the outline sideways; this lets the body
   * actually get fatter where fluid piles up ahead of the stroke and thinner where
   * it is pulled apart behind. Costs nothing — it reuses the taps the gradient
   * already fetched. Past ~0.6 the boundary starts to ripple against the trail
   * texel grid.
   */
  surfaceGain: 0.3,

  /**
   * How much the disturbed region brightens — a gain on the colour already
   * composed there, driven by the disturbance envelope.
   *
   * Displacement alone reads as a smudge on a flat interior. Lifting the same
   * purple the surface already has is what makes it read as liquid catching the
   * light — and because it is the fluid's own colour, gated by the fluid's mask
   * and by an envelope that only rises while the pointer is *moving*, it cannot
   * settle into a glow parked under a stationary cursor.
   */
  trailLift: 0.09,

  /**
   * 0 final · 1 blob colour · 2 blob alpha · 3 horizontal-blur alpha
   * 4 vertical-blur alpha · 5 threshold mask · 6 blurred colour
   * 7 disturbance envelope · 8 drag field · 9 displacement magnitude
   * 10 drag divergence · 11 contact press · 12 press gradient
   */
  debug: 0,
};

export type FluidParams = typeof FLUID_PARAMS;
