# Crovion — Sphere Deformation Plan

**Date:** 2026-08-11 · **revised 2026-08-14**
**Sources:** `ref-frames-2/*.png` (30 captures of bravis.com/en), `ref-frames/*.jpg`
**Status:** Phase 1 in tuning · Phase 2 implemented. See §2a and §2b — the
headline targets in the original draft have both been superseded by direct
measurements of the reference.

> ## ⚠️ The target changed. Read §2a before §2.
>
> The original "9–10 %" target was a **shape change over an unknown time span**.
> It is no longer authoritative. The authoritative target is now
> **~6 % deviation from a circle (acceptable 5–7 %)**, measured per frame — see
> §2a for why, and for the reference numbers it comes from.

---

## 0. The finding that should drive everything

I measured the reference's silhouette rather than describing it, and the result
contradicts the assumption the current interaction work was built on.

**The reference sphere deforms more when you are not touching it than when you
are.** Its dominant visual behaviour is a continuous autonomous morph. The
pointer response is real but secondary — smaller, in the frames available, than
the idle motion it rides on top of.

Everything below is ordered by that.

---

## 1. Method

For each frame:

1. Mask the sphere by hue (`r - g > 45 and r > 150` — the pink mass against a
   near-white ground; robust against the pale iridescent background).
2. Take the centroid **of that frame**, not a fixed point.
3. March outward along 180 bearings, recording the last radius still inside the
   mask → a radial profile `r(θ)`.
4. Divide by the frame's own mean radius.

Steps 2 and 3 matter: the blob floats and breathes. Measuring against a fixed
centre attributes translation to shape change, which is how I first read a
cursor dipole into what turned out to be drift. Normalising by mean radius
removes the ±1.5 % breathing for the same reason.

**Method validation.** Adjacent frames give 0.7 % mean change. The signal below
is 9–13× that, so it is not measurement noise.

⚠️ **Capture rate is unknown.** The 30 PNGs are extracted frames with no reliable
timebase (the visible menu-bar clock is inconsistent across them). Every
"8 frames" below is *8 frames of this capture*, not a duration. Amplitudes are
trustworthy; **rates are not, and must be tuned by eye.**

---

## 2. Measurements

Shape-only change, translation and breathing removed, over 8 frames:

| pair | mean \|Δr\| | max \|Δr\| | note |
|---|---|---|---|
| idle 02→10 (cursor away) | **9.2 %** | 62 % | autonomous |
| idle 03→11 (cursor away) | **9.8 %** | 66 % | autonomous |
| 12→20 (**cursor on the rim**) | **6.0 %** | 70 % | not larger than idle |
| adjacent 12→13 | 0.7 % | 10 % | method floor |

Supporting numbers:

- **Centroid drift:** 49–55 px per 8 frames on a ~590 px radius ≈ 8 % of radius
  of bodily translation. The sphere wanders as well as morphs.
- **Breathing:** mean radius varies ±1.5 %. Small — the silhouette changes
  *shape* far more than it changes *size*.
- **Lobe count:** 9–13 turning points around the outline, i.e. a low-order
  envelope (roughly 3–6 dominant lobes) carrying finer detail, not high-frequency
  noise.
- **Per-frame rate:** 0.7 % between adjacent frames, but 9.2 % over 8 — the
  growth is superlinear, so this is a **coherent slow oscillation**, not a random
  walk. A random walk would land near 0.7 × √8 ≈ 2 %.

### Ours, same metric

| | mean \|Δr\| (equivalent span) | single-frame deviation from a circle |
|---|---|---|
| reference | 9.2–9.8 % | — |
| Crovion today | ~6.6 % | ~9.4 % mean |

⚠️ Our figure is **less reliable than the reference's**: the CTA button is
`#6D4AFF` and sits inside the sphere's footprint, and the satellite blobs share
its hue, so the mask cannot fully isolate the main body (the 90 %+ maxima are
that contamination, not real excursions). Treat ours as "same order, somewhat
under" rather than as a precise number.

**Gap:** we are in the right family but under-amplitude, and — visible by eye in
the captures rather than in the statistics — our lobes are smaller and more
numerous where the reference's are fewer and broader.

---

## 2a. Correction — the authoritative target (2026-08-13)

Everything in §2 above measures **shape change between frames**. That quantity
depends on how much time separates the frames, and §1 already says the capture
timebase is unrecoverable. Building the headline target on it was a mistake.

Three findings retire the 9–10 % number:

1. **It is pair-dependent.** Re-measured with the same hue mask, the plan's cited
   idle pair 02→10 gives **6.33 %**, not 9.2 %. The pair 02→20 gives 9.78 %.
   Picking a different pair moves the "target" by 50 %.
2. **Some captures are duplicates.** 3 of the 30 `ref-frames-2` PNGs are
   byte-identical, and 03/04/05 differ from each other by 0.00 %. Frame index is
   not a reliable proxy for elapsed time.
3. **A stable statistic was available all along.** Deviation from a circle is a
   *per-frame* property. It needs no timebase, so it can be compared directly
   between the reference and us.

### Reference, measured per frame

Same pipeline, using the reference's own hue mask (`r - g > 45 and r > 150`):

| frame | 02 | 06 | 10 | 11 | 12 | 20 |
|---|---|---|---|---|---|---|
| deviation from circle | 5.17 % | 6.06 % | 6.82 % | 7.05 % | 7.51 % | 6.92 % |
| turning points | 20 | 16 | 22 | 23 | 32 | 53 |

**The reference sphere is not round.** It sits at **5.2–7.5 %** off a circle. It
*reads* round because it is very large on screen with a soft glowing edge, so the
same relative undulation looks gentle there and lobed on a smaller, crisper body.

### The target

> **~6 % deviation from a circle. Acceptable band 5–7 %.**
> Above ~7.5 %, back off. Do not chase 9–10 %.

Amplitude is necessary but not sufficient. The shape must also hold:

- 3–6 dominant broad lobes — not one egg-shaped bulge, not fine noise
- low orders (n1–n6) dominant over high (n7–n20), ratio **~4.5 : 1**
- smooth coherent motion, no jitter
- no metaball clipping, satellites and beads intact

### Measuring ours

Ours is now measured off the **`debug = 2` blob-alpha view**, which is a clean
binary mask — the hue-mask contamination §2 warns about (CTA button, satellites
sharing the hue) does not apply to it.

⚠️ **Hide the hero DOM before measuring.** The `<h1>` overlays the sphere and
bites the mask, and because it is static it registers as a constant order-1 term:
`n1` reads **2.9 %** with the heading visible and **0.25 %** with it hidden.
Nearly all of the apparent order-1 asymmetry in an unmasked capture is the
headline, not the body.

---

## Phase 1 — Autonomous silhouette morph

The dominant behaviour, and the one that will move the needle most.

**Target — superseded, see §2a.** ~~9–10 % mean radial deviation~~ →
**~6 % deviation from a circle, band 5–7 %**, evolving coherently. Low order:
3–6 dominant lobes, not fine noise.

**Implemented.** The two-band split below is in `FluidBlob.tsx` and the character
it was built for is confirmed by measurement: low n1–n6 **4.9 %** against high
n7–n20 **0.9 %**, a **4.7 : 1** ratio. That ratio is the thing to protect — it is
what keeps the small-bump lumpiness of the original single band from returning.
Amplitude is tuned by `envAmp` alone, with `detailAmp` scaled alongside it so the
ratio holds.

⚠️ `amp` is **not** a percentage of radius. 3D simplex noise has a standard
deviation near 0.15–0.20, not ±1, so `amp * 1.0` yields ~1.5 % deviation, not
100 %. Every amplitude figure here must be measured, never inferred from the
constant.

**Where.** `components/FluidBlob.tsx` — the vertex stage, which currently
displaces along the normal by `fbm3` at a single scale (`amp`, `freq`).

**Change.** Split displacement into two bands rather than raising `amp`:

- **Envelope band** — 2–4 octaves *below* the current frequency, carrying most of
  the amplitude. This is what produces few-and-broad lobes.
- **Detail band** — roughly the current `fbm3`, at much reduced amplitude, for
  surface life.

Raising `amp` alone is the wrong move and worth stating plainly: it scales the
existing high-frequency field, which yields a *lumpier* sphere, not a
*softer-lobed* one — the opposite of the reference.

**Animate the envelope's phase slowly** and independently per sphere (the `seed`
uniform already exists for this).

**Verify.** Measure deviation from a circle per frame against the 5–7 % band in
§2a. Shape-change-between-frames is still worth recording as a coherence check —
it should grow faster than a random walk — but it is no longer the target.

**Risk.** Large low-order displacement moves the silhouette far enough to break
the metaball threshold's assumptions — watch for the outline detaching from the
blur field at `threshold 9 / cutoff 3.8`. Retune `cutoff` if the body starts
eating its own edge.

---

## Phase 2 — Bodily drift ✅ implemented 2026-08-14

> ### ⚠️ The instruction below was wrong in both directions.
>
> This phase was written as "raise the amplitudes". Measuring the reference's
> drift properly says the vertical amplitude was already right and the
> **horizontal was more than double** it. Phase 2 turned out to be a *subtraction*.

### 2b. The authoritative drift target (2026-08-14)

The original target — "~8 % of radius over the same span" — has the same defect
§2a found in the Phase 1 target: it is a change over an unrecoverable timebase.
The timebase-free equivalent is the **excursion of the centroid**, which is a
property of the capture set rather than of any frame pair.

Measured across all 27 unique `ref-frames-2` frames, with two corrections that
matter:

- **Centroid trimmed against the merge.** Pixels beyond 1.15× the median radius
  are dropped and the centre re-solved, iterated. Without this the satellite
  drags the centre when it fuses (§5) and inflates mean radius by ~4 %.
- **Scroll ruled out.** The dark-text centroid holds at 1193.6 ± 0.5 px in every
  frame, so the page never moved. The sphere's translation is real.

| | horizontal | vertical |
|---|---|---|
| peak-to-peak | **7.0 % of R** | **18.0 % of R** |
| standard deviation | **1.9 % of R** | **5.6 % of R** |

> **The reference's drift is anisotropic, ~2.95 : 1 vertical to horizontal.**
> It rises and falls far more than it slides.

This is the finding the phase turns on, and it is invisible in a single number:
an isotropic drift of the correct *magnitude* still reads wrong.

⚠️ **Both peak-to-peak figures are lower bounds.** The centroid moves
monotonically across the capture (cy 989 → 889 px), so the frames catch part of
one traverse, not a full cycle. The **sd ratio is not affected by this** and is
the figure to tune against.

### What was wrong

The drift budget has three contributors and only the first had been counted:
`FluidBlob`'s per-blob float, `SphereGroup`'s common-mode `autoX` / `autoY`, and
`<Float>`. The group term is common-mode — it does not separate the spheres from
each other — but it *does* move them against the static page, which is exactly
what the reference measurement sees, so it belongs in the budget.

Summing all three (sd, as % of each body's own radius):

| sphere | r | before | | after | | ref |
|---|---|---|---|---|---|---|
| | | sd_x | sd_y | sd_x | sd_y | 1.9 / 5.6 |
| head | 2.8 | 4.15 | 6.02 | **2.04** | **6.02** | 1.07× / 1.08× |
| 01 | 2.0 | 5.20 | 6.67 | 2.33 | 6.35 | 1.22× / 1.13× |
| 02 | 1.7 | 6.37 | 8.60 | 2.53 | 6.60 | 1.33× / 1.18× |
| 03 | 1.45 | 7.78 | 10.99 | 2.77 | 6.92 | 1.46× / 1.23× |

Anisotropy went from **1.45 : 1** to **2.95 : 1** on the head sphere, against the
reference's 2.95 : 1.

Two separate errors:

1. **Horizontal drift was 2.2–4.1× the reference.** `floatX` carried 0.5× the
   float amplitude where the reference implies ~0.3×, and `autoX` at 0.12 alone
   exceeded the entire horizontal budget.
2. **The chain's relative drift climbed as the spheres shrank.** The previous
   `Math.max(0.15 + 0.02i, 0.08r)` floor held *absolute* drift roughly constant
   (0.15 → 0.21 units) while radii fell 2.8 → 1.45, so the tail ran at 1.8× the
   reference vertically. A flat `0.08r` puts all four at 5.66 %.

The residual 1.2–1.5× on the lower chain is the common-mode group term being a
larger fraction of a smaller radius. Removing it would push the head sphere under
target; it is left as is.

### Changes

- `FluidBlob.tsx` — `floatX` amplitude 0.5 → **0.30**, and its frequency ratio
  0.7 → **0.61**. At 0.7 against `floatY`'s 1.0 the screen path is a closed
  Lissajous figure that exactly retraces every 419 s; 0.61 does not close inside
  any plausible session.
- `HeroCanvas.tsx` — `autoX` 0.12 → **0.045**; `floatAmplitude` → **`node.r * 0.08`**.
- `<Float>` **left alone**, against this phase's original instruction.
- `FluidBlob` gained a **`children`** prop rendered inside the drifting group —
  see below.

**Decoupling from Phase 1** needs nothing: the envelope evolves by drifting
through a 3D noise field, which is aperiodic, so there is no frequency for a
sinusoid to phase-lock onto.

### The bug this phase exposed

`SphereLabel` and the CTA were siblings of `<FluidBlob>`, but the float runs on a
group *inside* `FluidBlob`. **The spheres were drifting out from under their own
labels** — 0.45 units peak-to-peak at the head of the chain, ~51 px at this
camera, on type that is supposed to be pinned to the surface. The CTA's own
comment claimed it inherited "the drift"; it inherited the group's, not the
body's. Both are now children of `FluidBlob`.

This is why Phase 2 is not the "two-number change" this plan called it: it is the
phase that makes bodies move independently of their anchors, so every anchored
thing has to be re-parented with it.

**Verification.** Amplitudes are analytic — closed-form sd of the sum of the
three contributors, checked against the reference table above. The running app
confirms the re-parenting renders correctly and that the CTA's offset from the
sphere centre is constant (+0.311 R, +0.312 R on two frames). ⚠️ The drift
amplitude itself was **not** confirmed in-browser: a backgrounded tab suspends
rAF, and the position damping (`smoothPos += (target − smoothPos) * 0.03`) is
per-frame, so a starved frame loop under-reports the excursion by an order of
magnitude. Re-measure from a foreground tab before trusting any on-screen number.

---

## Phase 3 — Lobe character

Phase 1 gets the amplitude and order right; this gets the *shape* of the lobes.

The reference's lobes are asymmetric — they pool to one side rather than
distributing evenly, the same way its colour bands do. `FluidBlob`'s fragment
stage already does this for colour (`offAxis` biases the radial coordinate along
a fixed direction). **Apply the same trick to the vertex displacement:** bias the
envelope's sampling position along a slowly-rotating axis so the fattest part of
the body migrates around it.

**Verify.** The profile's maximum should sit in a consistent sector that rotates
slowly, rather than jumping between opposite bearings frame to frame.

---

## Phase 4 — Pointer response (recalibrate, do not rebuild)

The press/drag field in `webgl/shaders/pointerTrail.frag` +
`webgl/shaders/composite.frag` is **already the right mechanism** — a sustained
contact press plus a directional drag, with no ring generator. This phase is
calibration, not construction.

The measurement says the cursor's contribution should be **at or below the idle
morph**, not above it: 6.0 % measured with the cursor on the rim versus 9.2 %
idle. Two consequences:

1. Do **not** raise `pressGain` / `displacementStrength` chasing visibility. Once
   Phase 1 lands, the interaction will read as *modulating a living body*, which
   is what the reference does, rather than as the only thing moving.
2. Re-judge the current values **after** Phase 1, never before. Tuned against a
   near-static sphere they will almost certainly be too strong against a morphing
   one.

⚠️ **Honest limit.** I could not isolate the reference's true pointer response.
The only frames with the cursor on the sphere also contain 8 frames of idle
morph, and the idle morph is larger. Separating them needs either frames with a
known timebase, or a capture where the cursor moves while the idle animation is
paused. **The 6.0 % figure is an upper bound on the cursor's contribution, not a
measurement of it.**

---

## Phase 5 — Merge and neck

Already implemented and working: blur + threshold in `webgl/passes/` produces
metaball fusion, and `uFuse` dissolves buried rims. The reference shows the big
sphere fusing with its lower-right satellite exactly this way — the inflated
"+54 % max radius" in my first pass was this merge, not deformation.

**Nothing to build.** One check once Phase 1 lands: larger silhouette
displacement changes where necks form, so re-verify that satellites still fuse
rather than clip.

---

## Phase 6 — Connector

Restored and live (`Connector` in `HeroCanvas.tsx`): a `#14131A` hairline at 0.1
opacity with three unevenly-spaced beads made of the same blob material.

**Remaining, optional:** in the reference the thread is not perfectly straight —
it sags slightly between spheres. A 2–3 segment curve through a midpoint offset
perpendicular to the run would close the gap.

---

## Sequencing

```
Phase 2 (drift)        DONE — and not cheap: it exposed the label/CTA
      ↓                re-parenting (§2b)
Phase 1 (morph)        the dominant behaviour — the real work
      ↓
Phase 3 (lobe bias)    character pass on top of Phase 1
      ↓
Phase 4 (pointer)      RE-TUNE, only meaningful after 1 and 3
      ↓
Phase 5 / 6            verification and polish
```

Do not start at Phase 4. The pointer field is the most recently touched code and
therefore the most tempting, and it is the one phase the measurements say is
already close to correct.

---

## Reproducing the measurements

~40 lines of PIL + numpy. Pipeline:

1. **Mask.** Ours: `debug = 2` blob alpha, threshold all channels > 180.
   Reference: hue, `r - g > 45 and r > 150`.
2. **Largest connected component**, so satellites do not capture the centroid.
3. **Per-frame centroid** — the blob floats; a fixed centre turns translation
   into apparent shape change.
4. **180-bearing outward march**, recording the *last* radius still inside the
   mask, which steps over interior holes (the CTA button).
5. **Normalise by that frame's mean radius**, removing the ±1.5 % breathing.
6. **Compare** pairwise for shape change, and take the **angular FFT** of
   `r(θ) − 1` for lobe order.

Use the FFT, not turning-point counting, to judge lobe order: at low deviation
the mask edge is antialiased and JPEG-compressed, and turning points count that
noise. At 1.5 % deviation they read 29–55 while everything above n7 sums to under
1 %.

Conditions for measuring ours: pointer field off, mouse stationary, no scroll,
hero DOM hidden (§2a), and discard frames within ~1 s of any cursor movement —
the wobble spring (`k = 46, c = 5.2`) needs that long to settle.
