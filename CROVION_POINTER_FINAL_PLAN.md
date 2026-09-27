# Crovion — Pointer / Fluid Interaction · Final Plan

**Status: AUDIT ONLY. Nothing in this document has been implemented.**

Scope is the cursor↔sphere interaction inside the existing fluid pipeline. The
frozen scroll composition is out of scope and untouched: sphere x/y, SCROLL_LIFT,
Phase 1 morph, Phase 2 drift, sticky hero, z-index, veil, label portal, headline.

---

## Current Pointer Architecture

Three layers exist. Only the middle one is live.

### 1 · CPU — `webgl/pointer/pointerField.ts`

Turns the raw event stream into a physical contact. Tracks `target` (raw),
`current` (damped chase, `pointerSmoothing 13 /s`), `previous` (last frame's
`current`), `velocity` (damped derivative, `velocitySmoothing 7 /s`, scaled by
`velocityScale 0.55`, clamped at `velocityClamp 1`), and `active` (0..1 presence
ramp, `activeSmoothing 7 /s`). All smoothing is `1 - exp(-rate·dt)`, so it is
frame-rate independent. Snaps on re-entry so a returning cursor does not paint a
stroke across the canvas.

`PointerProvider` additionally exposes `down`, `pressCount` and `coarse`.
**`down` and `pressCount` are never read by the fluid pipeline.** There is no
click/impact path into the field today.

### 2 · GPU state — `PointerTrailPass` + `pointerTrail.frag`

One ping-pong pair of **RGBA16F** targets at `trailScale 0.35` of CSS canvas
size (min 64 px). Half-float because the field feeds itself through a retention
just under 1 and 8-bit quantisation stalls that loop.

| Channel | Name | Target it relaxes toward | Gate |
|---|---|---|---|
| `R` | disturbance envelope, 0..1 | `motion = smoothstep(0, motionKnee, ‖velocity‖)` | **velocity** |
| `G,B` | drag vector, signed | `uVelocity` | **velocity** |
| `A` | contact press, 0..1 | `pressShape` — squared smoothstep of distance to the brush capsule | **presence** |

Per frame, every channel is: *diffuse toward a 4-neighbour average (stencil
`SPREAD 1.5` texels) → multiply by a retention → relax toward its target inside
the brush.* The brush is a **capsule** from `pointerPrev` to `pointer`, so a fast
flick deposits a continuous slug instead of a dotted line.

Rates authored per 60 Hz frame and corrected each frame via `frame.d`:
`brushStrength 0.22`, `dragDeposit 0.38`, `trailDecay 0.975`,
`trailDamping 0.95`, `dragDissipate 0.22`, `pressureDissipate 0.04`,
`pressRadius 1.7`, `pressDeposit 0.18`, `pressDecay 0.985`,
`pressDissipate 0.05`, `motionKnee 0.45`.

There is **no `uTime` uniform and no second-order state** anywhere in this pass.

### 3 · GPU consumption — `CompositePass` + `composite.frag`

```glsl
push   = -trail.gb * uDragGain        // directional  0.65
       + pressGradient * uPressGain   // radial-static 0.30
       + gradient * uPushGain;        // radial-travelling 0.00  ← disabled
offset = push * uDisplacementStrength;               // 0.025 canvas heights

uvSurface  = vUv + duv;                      // silhouette, 1×
uvInterior = vUv + duv * uInteriorGain;      // interior,  2.2×

mask = blurred.a*uThreshold - uCutoff
     - divergence * uSurfaceGain              // 0.30  swell / thin
     - trail.a    * uPressDepth;              // 2.20  contact sinks

col += col * trail.r * uTrailLift;            // 0.09  disturbed area brightens
```

### 4 · Legacy 3D dent — currently OFF

`SphereInteraction.tsx` raycasts the cursor against every registered sphere and
publishes a per-sphere `SphereContact { active, point, entered, exited, pressed,
struck }`. `FluidBlob`'s vertex stage consumes it as a Gaussian dent plus an
outward rim ring (`lib/sphereDistortion.ts`), driven by a damped spring, plus a
whole-body wobble on `impactKick`.

`interactionMode` defaults to `POINTER`, and `LEGACY_TOUCH_MODES[POINTER] ===
false`, so **none of this is running**. It is also out of bounds — it deforms
sphere geometry, and its whole-body wobble is on the explicit do-not-want list.
Its value to us is the `struck` / `entered` **events**, which are already
computed and currently discarded.

---

## Current Visual Behavior

**1 · What the field stores.** A velocity-driven vector field (drag), a
velocity-driven scalar envelope (disturbance), and a presence-driven scalar
indentation (press). Nothing stores wave state.

**2 · Press — yes.** Channel `A`. Presence-gated, so a stationary cursor
converges on a fixed indentation and holds it. Reaches the screen twice: as
`pressGradient·uPressGain` (material shoved outward, ~12 px of boundary and
~27 px of interior flow on a 900 px canvas) and as `-trail.a·uPressDepth`
(the contact sinks into the silhouette by ~9 px within the soft edge band).
Rise ~0.33 s, half-life ~0.75 s, flat in ~3 s.

**3 · Drag — yes.** Channels `G,B`. `-trail.gb·uDragGain` carries the material
*with* the cursor; `divergence·uSurfaceGain` lets the body pile up ahead of the
stroke and thin behind it. Half-life ~0.23 s.

**4 · Radial ripple — no, and it is deliberately suppressed.** The press does
produce a radial *structure* — a depression with displaced material heaped around
it — but that structure is **static**: a pure function of where the contact is,
not of how long it has been there. It follows the cursor, deepens, and eases out.
Nothing ever detaches and travels.

**5 · The term responsible for radial propagation** is `gradient * uPushGain` in
`composite.frag` — the gradient of the scalar envelope `R`. **`pushGain = 0`.**
The secondary enablers are the two diffusion knobs `pressureDissipate 0.04` and
`pressDissipate 0.05`, both held near zero for the same reason.

The reasoning is documented at length in both shaders and is correct: a scalar
height that is topped up additively and then diffused does not stay a bump — the
peak flattens while the shoulders spread, so the *gradient* (zero at centre,
maximal on the shoulder) walks outward frame after frame. A parked cursor emits
one travelling annulus every few frames, forever. That is an uncontrolled ring
*train*, not a ripple, and it was rightly killed.

**6 · Term affecting the internal material:** `uvInterior` (`interiorGain 2.2`)
sampling the sharp blob colour — the pink/violet gradient and Fresnel slide with
the cursor — plus `col += col·trail.r·uTrailLift` (0.09), a pure multiply on the
colour already there, motion-gated so it cannot become a parked cursor glow.

**7 · Term affecting the outer silhouette:** `uvSurface` (1×) warping the blurred
field the threshold reads, plus the two mask terms `divergence·uSurfaceGain` and
`trail.a·uPressDepth`. Peak boundary movement ~1.6 % of canvas height.

**8 · What is missing.** Four things, and they are all the same missing thing:

- **No temporal state.** The field is first-order (decay + diffusion) — a
  *parabolic* system. It spreads and flattens. A wave is *hyperbolic*: it needs a
  restoring force and a second state (height **and** its rate of change) to
  oscillate and to propagate at a defined speed. There is no such pair.
- **No propagation speed.** Nothing in the pass has units of distance/time.
  Diffusion creep is not propagation; it is why the current knobs can only choose
  between "no ring" and "uncontrolled ring train".
- **No impulse event.** Deposit is continuous relaxation toward presence. There
  is no *drop lands → single impulse → expands → decays* trigger. `down`,
  `pressCount` and the legacy `struck`/`entered` flags exist and are unused.
- **No age-based envelope.** Decay is per-pixel, not per-wavefront, so amplitude
  cannot be made a function of how far a front has travelled.

---

## Desired Reference Behavior

```
cursor / drop
  → local impact                    (A · press — EXISTS)
  → soft water-like deformation     (A · press — EXISTS)
  → fluid displacement              (drag + press — EXISTS)
  → internal gradient reacts        (interiorGain + trailLift — EXISTS)
  → ripple spreads smoothly         (MISSING)
  → amplitude decays                (MISSING)
  → sphere settles back             (press recovery — EXISTS)
```

Part **A (impact / press)** is already built and tuned. Part **B (radial
response)** is the entire gap.

Constraints on B: soft, organic, viscous, premium, localized to the impact,
spreading outward, fading smoothly, propagating through the *connected* material.
Must not read as a CSS ripple, a flat 2D circle, a neon ring, a lens, a cursor
glow, a generic texture distortion, or a global sphere wobble.

---

## Exact Difference

One sentence: **the pipeline has a static radial dent that follows the cursor,
and needs a radial disturbance that leaves the cursor.**

Concretely, the delta is a *travelling* term, which requires:

| Needed | Present today |
|---|---|
| second-order (wave) state: height + velocity | none — only decayed scalars |
| propagation speed `c` | none |
| discrete impulse trigger on contact | none — continuous relaxation only |
| occupancy gating so the front follows the fused body | none |
| amplitude envelope vs. age and radius | none |

**Re-enabling `pushGain` is the wrong fix and must not be the plan.** It reaches
for the accidental ring — driven by a continuously-refilled envelope, with no
speed control, no impulse boundary, and a ring train under a held cursor. What is
wanted is a *correct* wave with a defined speed and a single front per impact.
The two look superficially similar in a still frame and behave nothing alike in
motion.

---

## Minimal Changes Required

Five changes. No geometry, no camera, no lights, no colours, no Fresnel, no blur
kernel, no threshold/cutoff values, no scroll composition.

### C1 · New wave state target — `webgl/passes/RipplePass.ts` (new)

A second ping-pong pair, **RG16F**, same `trailScale 0.35` dimensions as the
trail. `R = height`, `G = previous height`. Damped discrete wave equation:

```
h' = 2h - hPrev + c²·∇²h        // ∇² from the same 4-neighbour stencil
h' = (h' - rest)·waveDamping + rest
```

Plus an additive impulse stamped only on the frames an impact fires.

*Why a second target rather than reusing the trail's channels:* RGBA is full, and
`R` (the envelope driving `trailLift`) is the one channel the interaction still
needs for the light response. An RG16F pair at 0.35 scale (~514×280 at 1470 wide)
is ~1.2 MB and one extra full-screen draw of a 5-tap shader. Negligible.

*Why a real wave rather than a stamped-and-diffused scalar:* it is the only form
that gives an independently tunable **speed**, a **single** front per impulse, and
a front that dies on its own instead of being refilled.

### C2 · Occupancy gating

The wave pass samples last frame's `blurTargetB.alpha` and scales `c²` by it, so
the disturbance propagates through the fused body and stops at its boundary —
including across the necks between merged spheres, which is the "spreads through
the connected material" behaviour. One frame stale; invisible at these speeds.

### C3 · Impulse trigger — `FluidScene.tsx`

CPU-side, in the existing single `useFrame`. Fire one impulse when:

- **entry** — smoothed pointer occupancy crosses the isoline upward (the drop
  landing), or
- **click** — `pointer.pressCount` increments (already tracked, currently unused), or
- **shed** — optional, while dragging fast: at most one impulse per
  `impulseCooldown`, amplitude scaled by speed.

A hard cooldown (~180 ms) is what structurally prevents a ring train. Occupancy
is read by sampling the blur target at the pointer UV once per frame, or — cheaper
and already computed — by reusing the legacy `SphereInteraction` raycast's
`entered` / `struck` flags **without** re-enabling its vertex dent.

### C4 · Composite consumption — `composite.frag`

Two new terms, both defaulted low, both gated by the fluid's own mask:

```glsl
vec2 rippleGradient = gradientOf(uRipple.r) * uRippleRadiusNorm;
push += rippleGradient * uRippleGain;          // joins the existing offset,
                                               // so it inherits the 1× / 2.2×
                                               // silhouette / interior split
mask -= ripple.r * uRippleDepth;               // alongside uPressDepth
col  += col * abs(ripple.r) * uRippleLift;     // crest catches light
```

Routing it through the **existing** `uDisplacementStrength` / `uInteriorGain`
split is what makes it read as the same material rather than a second effect
pasted on: the interior gradient flows 2.2× further than the boundary, exactly as
the drag and press already do.

### C5 · Config + debug — `webgl/config/quality.ts`

New params (below), plus Leva bindings and debug views **13** (wave height,
signed, recentred on grey) and **14** (ripple displacement magnitude). Existing
debug taps 0–12 unchanged.

---

## Parameters To Tune

| Param | Start | Meaning / failure mode at the extremes |
|---|---|---|
| `waveSpeed` | 0.55 | Front speed in canvas heights/s. Too high reads electronic; too low reads like a spreading stain. |
| `waveDamping` | 0.982 | Per-60 Hz retention. Sets how many oscillations survive. Above ~0.995 the body never settles. |
| `waveDispersion` | 0.15 | Small blur folded into the Laplacian — softens the front so it reads viscous, not like a hard shockwave. This is the "premium vs. neon ring" knob. |
| `impulseRadius` | 0.10 | Impulse footprint as a fraction of canvas height. Narrower than `pressRadius` (0.255) so the ripple is born *inside* the press dent. |
| `impulseStrength` | 0.35 | Peak height of one impact. |
| `impulseCooldown` | 0.18 s | Minimum spacing between impulses. **The ring-train guard.** |
| `rippleGain` | 0.25 | Weight in `push`. Deliberately below `pressGain` 0.30 — the resting press should stay the dominant contact reading. |
| `rippleDepth` | 0.8 | Mask contribution. Well under `pressDepth` 2.2 so a ripple crossing a thin neck cannot sever it. |
| `rippleLift` | 0.06 | Crest brightening. Under `trailLift` 0.09. |
| `rippleEnabled` | true | Master switch, independent of `pointerEnabled`. |

Everything currently on the panel keeps its value. Nothing in `FLUID_PARAMS` is
retuned by this work.

---

## Render Pipeline

```
 pointer ──► trail FBO (ping-pong, RGBA16F) ──────────────────┐
        └──► impulse? ──► ripple FBO (ping-pong, RG16F) ──────┤
                                 ▲                            │
                     occupancy (last frame's blurred α)       │
                                 │                            │
 fluid layer ──► blob FBO ──► blur H ──► blur V ──────────────┤
                    │                                         │
                    └───────────────── sharp colour ──────────┤
 ambient layer ────────────────────────► canvas               │
                                            ▲                 ▼
                                            └── displace + threshold + composite
```

Changes to the existing chain: **one new pass**, inserted immediately after the
trail pass and before the blob render. Still exactly one `useFrame`, still zero
allocation in the loop, still `FLUID_RENDER_PRIORITY`. The blob, blur H, blur V,
ambient and composite passes keep their order, their inputs and their parameters.

The ripple target joins the existing reset paths — first frame, resize, and
context restoration — and the existing `TRAIL_SETTLE` idle wipe, sized against
the slowest channel, which after this change is the wave rather than the press.

---

## Validation Tests

**Correctness**

1. **Pointer absent → bit-identical to today.** With the cursor off-canvas the
   ripple field is provably zero, so the composite output must match the current
   build pixel-for-pixel. Compare screenshots.
2. **No ring train.** Hold the cursor stationary on a sphere for 10 s. Exactly one
   front may be emitted (on entry). Debug 13 must show the field return to flat
   and stay flat. This is the single most important test — it is the failure the
   existing architecture was built to avoid.
3. **Bounded lifetime.** One impulse must decay below visibility within ~2.5 s and
   to exact zero within `TRAIL_SETTLE`.
4. **Occupancy respected.** A ripple must not appear outside the fluid silhouette,
   and must be visible crossing a neck between two merged spheres.
5. **No fluid painted into empty space.** `rippleDepth` is subtractive only, like
   `pressDepth`; verify against debug 5 that the mask outside the body never rises.

**Visual**

6. Impact reads as *drop into gel*: depression at contact, displaced material
   around it, then one soft front leaving and fading.
7. Front is soft-shouldered at `waveDispersion 0.15` — no hard rim, no bright
   annulus, no lens edge.
8. Interior gradient moves visibly more than the silhouette (the 2.2× split holds
   for the ripple as it does for drag and press).
9. Does not read as: CSS ripple, flat circle, neon ring, lens, cursor glow,
   generic texture distortion, global wobble. Judge on a recording, not a still.

**Non-regression — the frozen composition**

10. `SCROLL_LIFT` still 52; sphere x/y unchanged; Phase 1 and Phase 2 untouched.
11. Headline, veil (0.20 / 0.10), label portal, z-index order unchanged.
12. Card positions still track their spheres; CTA still locked to the head sphere.
13. No sticky regression; no layout shift.

**Performance**

14. One extra 5-tap draw at 0.35 scale. Measure with `stats.js` — expect < 0.3 ms
    on integrated graphics. If it is not, the ripple target drops to 0.25 scale
    before any other knob moves.
15. Reduced-motion and coarse-pointer paths still skip the whole pointer layer.
