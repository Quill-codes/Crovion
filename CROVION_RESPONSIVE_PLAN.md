# Crovion — Responsive / Mobile Plan

**Status: IMPLEMENTED (Phases 1–4). Phase 5 is partially done and flagged.**

The audit and the reasoning below are kept as written — they are the record of
*why* the numbers are what they are. What shipped, and where it departed from the
plan, is recorded per phase in §7 and summarised here.

| | |
|---|---|
| **New** | `lib/scene/tier.ts` (the two compositions + derived geometry), `hooks/useSceneTier.ts` |
| **Changed** | `components/Hero.tsx`, `components/HeroCanvas.tsx`, `components/SatelliteField.tsx`, `components/FooterSection.tsx`, `webgl/FluidCanvas.tsx` |
| **Verified** | `tsc --noEmit` clean; `next build` clean; the 6 pre-existing lint errors are all in untouched files |
| **Wide tier** | Asserted identical: `stopSpacing` 6.5, `scrollLift` 26, `heroVh` 700, stops −6.5 / −13 / −19.5, watermark anchors −1.6 / −6.5. Measured live at 1470×745: hero 700vh, R3F buffer 2199×1117 (dpr 1.5) — both unchanged |
| **Compact tier** | Measured live at 390×740: hero 528vh, R3F buffer 482×925 (dpr 1.25), `scrollWidth` 386 vs `innerWidth` 390 — no document overflow |

**One intentional desktop-visible change:** the sphere card's share control goes
40×40 → 44×44 (§4.4). It is the only edit in this pass that alters the wide tier's
rendering, and it is deliberate.

**Two departures from the plan as written**, both because implementing forced a
measurement the plan had not made — details in §7:

1. The fan stack's numbers were re-solved (§8 decision 2). The plan's shape was
   right; its first triple was not.
2. A quantiser was added to the derived geometry, because "identical" turned out
   to be false by 2.2e-16 without one.

Scope is making the site work on phones and small tablets. The fluid pipeline's
internals are **out of scope and untouched**: birth curve, blur scale, threshold
/ cutoff, pointer field rates, the tonemapped amber, Phase 1 morph amplitudes,
Phase 2 drift budget, the intro timeline. This plan changes *where bodies sit and
how large they are at a given viewport*, and adds a device tier to two renderer
settings. It does not retune a single calibrated constant of the simulation.

---

## 0. Evidence grade and method

Every claim below carries one of:

| Grade | Meaning |
|---|---|
| **OBSERVED** | Read directly out of the source, or measured in a live browser. Numbers quoted verbatim. |
| **DERIVED** | Arithmetic on OBSERVED values. Reproducible; see §10. |
| **INFERRED** | Reasoned from spec or library behaviour, not yet measured on a device. |
| **UNKNOWN** | Named so it is not silently assumed. |

**Method.** `next dev` on `:3000`. The page was rendered inside a same-origin
iframe at 390×844 and 390×740, `devicePixelRatio` 2, and every element in the
tree was measured with `getBoundingClientRect()` against `innerWidth`. Frustum
figures are arithmetic on the camera declared in source.

> ⚠️ **One measurement artifact, recorded so the next reader does not chase it.**
> Inside an iframe, R3F's `Canvas` intermittently reports its container as
> unmeasured and leaves the drawing buffer at the HTML default 300×150. It is an
> iframe/`ResizeObserver` interaction, **not** a site bug: at top level the same
> canvas measures 1466×745 with a 2199×1117 buffer, and inside the iframe a 1px
> width nudge makes it resolve correctly to 386×740 / 579×1110. Any future
> measurement run in an iframe must force that nudge first.

---

## 1. What is already right

Recorded first, because the honest finding is that the *page chrome* is in decent
shape and the *3D composition* is the whole problem.

- **OBSERVED** — the viewport meta is present and correct: Next emits
  `width=device-width, initial-scale=1` automatically; `app/layout.tsx` does not
  need a `viewport` export and does not have one.
- **OBSERVED** — `body { overflow-x: hidden }` (`app/globals.css:63`) is doing
  real work. At 390px the document's `scrollWidth` is 386 — i.e. **nothing
  overflows the document**, it is all being clipped. The page does not sideways-
  scroll today, it just loses content off both edges.
- **OBSERVED** — `Navbar`, `FooterSection` and the detail-page template are
  already built responsively: `clamp()` type ladders, `md:`/`lg:` padding steps,
  `grid-cols-1 md:grid-cols-12`, a full-screen nav overlay that is a phone
  pattern already.
- **OBSERVED** — `webgl/IntroSeed.tsx:73-79` already derives its radius from
  `useThree(state => state.viewport)` and the camera distance rather than from a
  constant. **This is the pattern the rest of the scene should follow**, and it is
  the reason the loading hand-off is the one part of the intro that already
  frames correctly on a phone.

### Breakpoint coverage — OBSERVED

| Prefix | Files | Occurrences |
|---|---|---|
| `sm:` | 0 | **0** |
| `md:` | 7 | 76 |
| `lg:` | 4 | 12 |
| `xl:` | 0 | 0 |

Two readings of that table matter.

1. There is **no `sm:` anywhere**, so the unprefixed base styles *are* the phone
   styles. That is the correct mobile-first shape, and it means most of the fixes
   below are edits to base values with a `md:` restoring the desktop value —
   not a new breakpoint layer.
2. `components/HeroCanvas.tsx` (1211 lines) and `components/SatelliteField.tsx`
   (414 lines) — the two files that carry the entire hero composition — contain
   **no breakpoint of any kind**. Neither does `components/FluidBlob.tsx`. That
   is where all the work is.

---

## 2. The core finding — the camera's `fov` is vertical

**OBSERVED** — `components/HeroCanvas.tsx:1113`:

```tsx
<PerspectiveCamera makeDefault position={[0, 0, 12]} fov={40} />
```

Three.js `PerspectiveCamera.fov` is the **vertical** field of view. The horizontal
extent is `vertical × aspect`. So:

- **DERIVED** — the visible world *height* is `2 · 12 · tan(20°)` = **8.735 units
  at z = 0, on every device**. Aspect ratio cannot change it.
- **DERIVED** — the visible world *width* is `8.735 × aspect`. On a 16:9 desktop
  that is 15.5 units (±7.76). On a 390×844 phone it is **4.04 units (±2.02)**.

The chain was composed against ±7.76 and is played back into ±2.02. Nothing else
about the mobile hero needs explaining.

### Coverage per sphere — DERIVED

Half-width is evaluated at each sphere's own z, so the numbers account for depth.
"Visible" is the fraction of the body's own diameter inside the frame.

| Viewport | aspect | half-width @ z=0 | head (x 3.0, r 2.8) | 01 (x −3.2, r 2.0) | 02 (x 3.4, r 2.0) | 03 (x −2.8, r 2.0) |
|---|---|---|---|---|---|---|
| 1920×1080 | 1.778 | 7.76 | 100% | 100% | 100% | 100% |
| 1466×745 | 1.968 | 8.59 | 100% | 100% | 100% | 100% |
| 768×1024 | 0.750 | 3.28 | 60% | 45% | 44% | 56% |
| **390×844** | 0.462 | **2.02** | **35%** | **16%** | **14%** | **27%** |
| 390×740 (URL bar up) | 0.527 | 2.30 | 41% | 23% | 21% | 34% |
| 360×800 | 0.450 | 1.97 | 34% | 15% | **12%** | 26% |

On a 360px Android, **stop 02 shows 12% of itself.** That is the purple wedge
against the right edge in the current screenshots.

Note the perverse detail: the *portrait tablet* case (768×1024) is worse than it
looks, because it falls above `md:` (768px) and therefore takes the **desktop**
type ladder while having a **phone's** frustum.

---

## 3. Measured DOM overflow at 390px — OBSERVED

Every element whose rect crossed the 390px viewport, measured live.

| Element | Source | left | right | width | verdict |
|---|---|---|---|---|---|
| `PORTFOLIO` sphere watermark block | `HeroCanvas.tsx:170` | 70 | **733** | **664** | 170% of viewport; 52% of it off the right edge |
| `ABOUT` / `US` sphere watermark block | `HeroCanvas.tsx:170,177` | **−309** | 102 | 410 | only 102px (25%) on screen |
| `PROJECTS / COR / BRA` standing watermark | `Hero.tsx:716-723` | −8 | 236 | 244 | left-clipped, and reads as debris |
| `THE TOTAL / BRANDING / COMPANY` footer wordmark | `FooterSection.tsx:139-145` | 70 | **455** | 385 | intentionally cropped, but 65px past the edge is more than the design intends |
| `.hero-diagonal-line` | `Hero.tsx:613-625` | 185 | 452 | 267 | a 55%-height rule rotated −35° from `left:48%` — off-frame at this aspect |

The watermarks are the headline number here: **664px of type inside a 390px
frame.** The component's own comment (`HeroCanvas.tsx:130-139`) already documents
the failure mode — *"a block this wide (~680 px) placed left of an already-left
sphere simply walks off the viewport"* — and solves it for desktop by flipping
the offset with the sphere's side. That rule is correct and should be kept; it
just has no term for a viewport narrower than the block.

---

## 4. Everything else that breaks

### 4.1 `touch-action: none` over the whole hero — OBSERVED style, INFERRED consequence

**OBSERVED** — `webgl/FluidCanvas.tsx:54` passes `style={{ touchAction: "none" }}`
to R3F's `<Canvas>`. Measured in the live DOM, that lands on R3F's container div:

```
div  position:relative;width:100%;height:100%;overflow:hidden;
     pointer-events:auto;touch-action:none;background:transparent
```

…which is `absolute inset-0` inside the hero's `sticky top-0 h-screen`, i.e. it
covers the **entire viewport for the whole 700vh of the hero**.

**OBSERVED** — `lenis@1.3.25` defaults `syncTouch = false`
(`node_modules/lenis/dist/lenis.mjs:433`), and `hooks/useLenis.tsx:47-52` does
**not** override it. It sets `smoothWheel: true` and `touchMultiplier: 1.5`, so
Lenis smooths the *wheel* and leaves **touch scrolling to the browser's own
panning**.

**INFERRED (high confidence, spec-level)** — `touch-action: none` instructs the
browser not to initiate panning for touches that begin on that element. With the
browser owning touch scroll and the element covering the viewport, **a finger
drag anywhere on the hero should not scroll the page.** If that holds, it is the
single most severe defect on this list: the hero is 700vh and it would be
unscrollable by the only input a phone has.

⚠️ This is INFERRED, not measured — it cannot be reproduced with synthetic events
and needs a real touch device or Chrome DevTools touch emulation. **Verify before
building anything else**, because if it is true it changes nothing about the plan
below but it does change what "Phase 1" means.

`touchAction: "none"` is R3F's own documented recommendation, and it exists for a
real reason (pointer capture for drag controls). The fix is not to delete it but
to scope it: the hero has no drag interaction — its pointer input is a *hover
field* — so the container can be `pan-y`, which keeps horizontal gestures for the
canvas and returns vertical panning to the browser.

### 4.2 `h-screen` on the pinned child — OBSERVED

**OBSERVED** — `components/Hero.tsx:427-428`:

```tsx
<section className="relative h-[700vh] w-full">
  <div className="sticky top-0 h-screen w-full overflow-hidden">
```

`h-screen` is `100vh`. On iOS Safari and Chrome Android `100vh` is the viewport
with the URL bar *retracted*, so on first paint the pinned child is taller than
what the user can see — measured here as a 740 vs 844 difference, **104px, 12% of
the frame**. The scene is vertically centred in a box whose bottom eighth is
under the browser chrome.

`h-dvh` tracks the URL bar and eliminates the offset, but re-lays-out the pinned
element every time the bar animates, which on a scroll-pinned WebGL section is
visible jank. `h-svh` (the *small* viewport, i.e. bar visible) is the correct
choice for a pinned section: stable, never taller than what is on screen, and it
costs a strip of unused space when the bar retracts.

Note this also shifts the frustum: `innerHeight` 740 vs 844 moves the aspect from
0.462 to 0.527 and the half-width from 2.02 to 2.30 (§2 table). Any mobile
geometry must be solved against the **smaller** aspect, or it reframes as the
user scrolls.

### 4.3 Fill-rate budget — OBSERVED, sizing DERIVED

**OBSERVED** — `webgl/FluidCanvas.tsx:53`: `dpr={[1, 1.5]}`, with the comment at
`:45` stating *"DPR capping belongs to the responsive phase"*. `webgl/config/quality.ts:5`
likewise: *"DPR tiers, mobile branches and pool sizes arrive in later phases."*
**This plan is that phase.** The intent is already recorded; only the numbers are
missing.

**OBSERVED** — at 386×740 CSS on a dpr-2 device the R3F buffer resolves to
579×1110 (dpr 1.5). Two WebGL contexts are live simultaneously: this one and
`SilkAuroraBackground`, which caps itself at dpr 2 (`SilkAuroraBackground.tsx:400`)
and measured **780×1480**.

**DERIVED** — per frame the pipeline pays, at minimum: one blob pass at buffer
resolution, two blur passes at `blurScale 0.4` with 17 texture fetches each, two
trail passes at `trailScale 0.35`, and one composite at full resolution — on top
of a second full-resolution fragment-heavy shader for the aurora. The aurora
alone at dpr 2 is 1.15M fragments/frame against the fluid canvas's 643K.

**UNKNOWN** — actual frame time on real hardware. Nobody has measured this on a
phone. The plan proposes tiers; the tiers are proposals until measured.

### 4.4 Touch targets below the minimum — OBSERVED

WCAG 2.2 SC 2.5.8 asks for 24×24 CSS px minimum; the iOS and Material guidance
both ask for 44×44.

| Control | Source | Size |
|---|---|---|
| Sphere card share/collapse button | `HeroCanvas.tsx:255` (`w-10 h-10`) | **40×40** |
| Satellite drop's control | `SatelliteField.tsx:354` (`w-7 h-7`) | **28×28** |
| `CTAButton`'s secondary control | `CTAButton.tsx:79` (`w-8 h-8`) | **32×32** |

All three pass 2.5.8 and all three miss 44×44. The satellite control at 28px is
the one that will actually be missed by a thumb.

### 4.5 Hover-only affordances and the pointer field — OBSERVED

**OBSERVED** — `components/PointerProvider.tsx` is already touch-aware: it tracks
`touchmove` (`:78-80`), clears `inside` on a non-mouse `pointerup` (`:91-93`),
and exposes a `coarse` flag read from `matchMedia("(pointer: coarse)")` (`:63`).

**OBSERVED** — **nothing consumes `coarse`.** It is computed and never read. The
fluid pipeline has no coarse-pointer branch, so on a phone the trail field is
driven only while a finger is down, and the sphere's ambient hover response
(`SphereInteraction`) never fires at all.

**OBSERVED** — hover-only styling that has no touch equivalent:
`hover:bg-brand-text/10` on the share button (`HeroCanvas.tsx:257`),
`group-hover:opacity-100` on the footer nav dots (`FooterSection.tsx:159`),
`.hover-underline` (`globals.css`), `hover:scale-105` on the burger.
None of these are load-bearing — each has a visible resting state — so this is a
polish item, not a defect.

### 4.6 The satellite fan cannot exist at this width — OBSERVED + DERIVED

**OBSERVED** — `lib/satellites.ts` places the head sphere's five drops at x
offsets **3.25, 3.4, 5.15, 5.4, 6.15** in world units, in an arc that bulges
outward.

**DERIVED** — the frame's half-width on a phone is 2.02. **Every drop in every
fan is outside the frame**, before its own radius is added. The fan is not
"cramped" on mobile; it is entirely off-screen.

**OBSERVED** — the arc's geometry is heavily reasoned in place
(`lib/satellites.ts:131-149`): every offset clears the parent's radius plus its
own, no two silhouettes come within 0.6 units, slot 3 is the far point and is
deliberately the smaller body, the first slot came down from y 2.5 to 2.15
because it clipped the top of the frame. **That reasoning does not survive a
scale factor** — shrinking the arc to fit ±2.0 would put five bodies of radius
0.66–0.9 inside a band 4 units wide, and they would merge into one blob.

This is the one part of the composition that needs a different *presentation* on
mobile rather than different numbers. See §8, decision 2.

### 4.7 Loose drops and background spheres — OBSERVED

`HeroCanvas.tsx:906-937` places three loose drops, one at **x −4.0**; `BG_SPHERES`
(`:965-972`) run to **x ±6.0**. The background spheres sit at z −6 to −12 where
the frustum is wider (half-width 3.19 at z −7 on a phone), so they degrade
gracefully; the loose drop at −4.0 does not. Low severity, but they are part of
"the field has somewhere to go besides the line" and half of them are currently
outside the line's frame.

---

## 5. Target — the mobile composition

### 5.1 The three rules the desktop composition already obeys

Reverse-engineered from the source, stated so the mobile solve is a re-application
rather than an invention.

1. **Containment.** Every chain body is fully inside the frame on desktop
   (§2 table: 100% across the board). The composition never crops a numbered stop.
2. **Alternation.** `HeroCanvas.tsx:523-526` — *"each sphere sits on the opposite
   side from the one above it so the connector always crosses the viewport rather
   than running down one edge."* The offset must stay a meaningful fraction of the
   radius or the zig-zag flattens into a column.
3. **Constant surface gap — a previously undocumented invariant.**

   **DERIVED** — vertical centre spacing minus the two radii, for each link:

   | Link | Δy | radii | surface gap |
   |---|---|---|---|
   | head → 01 | 7.3 | 2.8 + 2.0 | **2.5** |
   | 01 → 02 | 6.5 | 2.0 + 2.0 | **2.5** |
   | 02 → 03 | 6.5 | 2.0 + 2.0 | **2.5** |

   All three are exactly 2.5. The chain is not "6.5 apart"; it is *2.5 of air
   between surfaces*, and 6.5 is what that works out to for radius-2.0 bodies.
   This is the number to carry to mobile, not the 6.5.

### 5.2 Solving the mobile chain

Solved against the **worst-case phone aspect, 0.450** (360×800), so the result
holds on every phone rather than only on the one it was tuned against. Rules:

- **Presence** — at the worst-case aspect the head's diameter is ~0.76 of the
  frame's width and a stop's is ~0.61. On a phone the body has to own the width
  or it reads as a bead.
- **Edge-kiss** — a stop may cross the frame edge by at most 15% of its own
  diameter. Rule 1 relaxes from "fully contained" to "visibly whole", which is
  what buys back the alternation Rule 2 needs.
- **Card fit** — a stop's projected diameter must leave the card reading as
  something sitting *on* a body. See §5.5 for why this rule cannot be expressed
  as "the same fraction as desktop".

Projected pixel sizes below use **px per world unit = viewport height ÷ 8.735**
(§2). That is 123.6 at 1080px tall, 91.6 at 800, and **84.7 at 740** — the last
being the honest phone case once §4.2's `h-svh` fix lands and the pinned box
equals the *visible* viewport rather than the URL-bar-retracted one.

| | desktop (unchanged) | mobile (proposed) | reason |
|---|---|---|---|
| head radius | 2.8 | **1.5** | 3.0 units = 76% of the frame's width; projects to 275px at 360×800, 254px at 390×740 |
| stop radius | 2.0 | **1.2** | 2.4 units = 61% of the frame's width; projects to 220px at 360×800 and 203px at 390×740 — see §8 decision 3 |
| head x | +3.0 | **+0.9** | half-width at z −1 is 2.13; 0.9 + 1.5 = 2.4, inside the edge-kiss allowance |
| stop x | ∓3.2 / 3.4 / 2.8 | **∓0.95** | half-width at z 1.0 is 1.80; 0.95 + 1.2 = 2.15 → crosses by 0.35 = 15% of diameter, exactly at the allowance |
| stop x ÷ radius | 1.60 | **0.79** | the zig-zag is weaker than desktop's and this is unavoidable at 0.45 aspect; it is the quantity to argue about if the result looks like a column |
| surface gap | 2.5 | **2.5** | the invariant, carried |
| stop spacing (Δy) | 6.5 | **4.9** | = 2.5 + 1.2 + 1.2 |
| head → 01 (Δy) | 7.3 | **5.2** | = 2.5 + 1.5 + 1.2 |
| stop y | −6.5, −13.0, −19.5 | **−4.9, −9.8, −14.7** | |
| head y | +0.8 | **+0.3** | keeps head → 01 at 5.2 |

**Merge check — DERIVED, and it clears.** Bringing the bodies closer in x raises
the question of whether chain neighbours will fuse in the metaball composite.
Nearest mobile pair (01 → 02): centres 1.9 apart in x and 4.9 in y = 5.26 units,
minus 2.4 of radii = **2.86 units of surface gap**, which at 96.6 px/unit
(844px ÷ 8.735 units) is **276 screen px**. `FLUID_PARAMS.blurRadius` is **20px**.
The gap is ~14× the merge distance. Desktop's equivalent is 650px. No merge risk;
confirm with `MergeProbe` anyway during Phase 2.

### 5.3 The pace constant, and three numbers that should be one

**OBSERVED** — `HeroCanvas.tsx:455-474` derives `SCROLL_LIFT = 26` from the chain
spacing and the 700vh hero, and explicitly names the invariant:

> *"The ratio between them is the scroll **pace** — 0.037 world units per vh — and
> it is the thing being held constant here, not either number."*

**DERIVED** — three facts follow, and they resolve what would otherwise be the
hardest question in this plan:

1. `SCROLL_LIFT = 4 × stop spacing` puts the three stops at eye level on progress
   0.25 / 0.50 / 0.75. (26 = 4 × 6.5. ✓)
2. Pace = `SCROLL_LIFT ÷ heroVh` = 26/700 = **0.03714 units per vh**.
3. Holding that pace **is** holding the parallax ratio — scene pixels moved per
   pixel scrolled. Both world-units-per-pixel and vh scale with viewport height,
   so they cancel: `ratio = SCROLL_LIFT ÷ (8.735 × heroMultiple)` = 26/(8.735×7) =
   **0.425 on any device**. A phone therefore needs no separate feel-tuning; if
   the pace is held, the parallax is identical to desktop by construction.

So the mobile numbers are not three independent choices:

```
stop spacing  4.9              ← the only authored number
SCROLL_LIFT   4 × 4.9  = 19.6
hero height   19.6 / 0.03714 ≈ 528vh
```

**The proposal is to express this relationship in code rather than keep three
numbers in agreement by hand** — a `PACE` constant, `SCROLL_LIFT` derived from
spacing, and the hero's height derived from `SCROLL_LIFT`. Desktop then falls out
of the same expressions unchanged (6.5 → 26 → 700vh, exactly), so this is a
refactor that provably preserves current behaviour before it adds a second tier.

### 5.4 Typography ladder

| Element | now | proposed | note |
|---|---|---|---|
| Sphere watermark line | `text-[130px]` | `text-[min(19.5vw,130px)]` | 76px at 390 → the `PORTFOLIO` block goes 664px → 388px (99.5% of frame). Reaches the desktop 130px at ≥667px wide, so no breakpoint is needed |
| Watermark eyebrow `PROJECTS` | `text-[12px]` | `text-[10px] md:text-[12px]` | keeps the near-double alpha ratio the comment at `HeroCanvas.tsx:115-119` argues for |
| Watermark anchor offset | `HeroCanvas.tsx:161` — `[-1.6 or -6.5, 2.4, -1.2]` | tier the −6.5 | the "extend into the open half" rule (`HeroCanvas.tsx:127-141`) is right and is kept; −6.5 was solved for a 15.5-unit frame |
| Standing `COR/BRA` | `text-[130px]`, `left-[-2%]` | `text-[76px]`, `left-[-4%]` | or hide below `md:` — see §8 decision 4 |
| Sphere card | `HeroCanvas.tsx:221-222` — `width: 200px`, number `46px` | **`128px` / `32px`** under `md:` | see §5.5 |
| Card share button | `w-10 h-10` | `w-11 h-11` | 44×44 |
| Satellite control | `w-7 h-7` | `w-11 h-11` on coarse pointers | 28 → 44 |
| Footer wordmark | `FooterSection.tsx:140` — `clamp(80px,15vw,220px)`, `translate-x-[18%]` | `translate-x-[8%]` under `md:` | keeps the deliberate crop, loses the 65px overhang |
| `.hero-diagonal-line` | `left:48%`, `-35°` | tier or drop below `md:` | decorative; see §8 decision 4 |

### 5.5 The card cannot stay the same fraction of its body — DERIVED

**OBSERVED** — the card is 200px wide (`HeroCanvas.tsx:221`) on a body that
projects to 494px on a 1080px-tall desktop. The card is **40% of the body's
diameter**, and that ratio is what makes it read as type *pinned to a surface*
rather than a label parked in front of one.

**DERIVED** — that fraction cannot be carried to a phone. 40% of a 203px body is
**81px**, and the card has to hold a 34px numeral, a two-line 10px letter-spaced
label ("CONTACT US"), and a 44×44 touch target. The floor is set by legibility,
not by proportion, and it lands around 128px.

So the proposal is a **knowing departure**: the card goes from 40% of the body on
desktop to **~63% on a phone** (128 ÷ 203). It is the one place in this plan where
a desktop design rule is broken rather than re-solved, and it is called out here
so it is not mistaken for an oversight. The alternative — a bigger body — is §8
decision 3, and it trades directly against the zig-zag.

### 5.6 Two things the radius change gives away for free — OBSERVED

Both fall out of `components/FluidBlob.tsx` keying off `radius`, and neither is
something this plan has to author.

**Tessellation drops, which is the right direction on a phone.**
`FluidBlob.tsx:667`:

```ts
const segs = segments ?? (radius > 1.5 ? 160 : radius > 0.5 ? 96 : 48);
```

Desktop's four chain bodies (2.8, 2.0, 2.0, 2.0) all take **160** segments. The
mobile radii (1.5, 1.2, 1.2, 1.2) all take **96** — a 40% cut in vertex work
across the whole chain, automatically, on exactly the devices that need it.

⚠️ **The head at 1.5 sits precisely on that boundary**, and the test is
`radius > 1.5`, so 1.5 resolves to 96 while 1.51 resolves to 160. Sitting a tuned
value on a strict inequality is fragile. Pick it deliberately — 1.5 for the
cheaper mesh, or nudge to 1.55 to keep the head at 160 — and say which in the
code.

**The morph-amplitude ladder re-buckets the head, and probably correctly.**
`FluidBlob.tsx:673`:

```ts
const amp = isTiny ? 0.05 : radius > 2.4 ? 0.085 : radius > 1.0 ? 0.11 : 0.16;
```

| body | desktop radius → amp | mobile radius → amp |
|---|---|---|
| head | 2.8 → **0.085** | 1.5 → **0.11** |
| stops | 2.0 → 0.11 | 1.2 → 0.11 |

The stops do not move. **The head does**, from 0.085 to 0.11 — a 29% rise in
silhouette morph amplitude — and `HeroCanvas.tsx:546` warns about exactly this:
*"its `amp` bucket (radius > 2.4) would change if it were resized."*

The ladder's own comment (`FluidBlob.tsx:671-672`) says it exists so that
*"relative deformation falls off with size"* — i.e. a smaller body is **supposed**
to get a louder amp so it reads the same at its size. So the re-bucket is the
ladder working as designed, not a regression. What is nonetheless true is that
the mobile head is no longer running the 0.085 that Phase 1 and Phase 2 were
calibrated against, so it must be *looked at* rather than assumed. See §9.

---

## 6. How the tier is expressed

The mechanism matters as much as the numbers, because the wrong one causes a
canvas remount on every URL-bar animation.

**Proposed** — a single `lib/scene/tier.ts` exporting a frozen config object per
tier and a `useSceneTier()` hook over
`matchMedia("(max-width: 767px)")` via `useSyncExternalStore`, mirroring
`hooks/usePrefersReducedMotion.ts` exactly — same shape, same SSR-safe
`getServerSnapshot`, no new pattern to learn.

Three properties this has to have, each of which rules out an alternative:

- **It must not be `useThree(state => state.viewport)`.** `IntroSeed` can use
  that because its radius is a continuous function of the frame and re-evaluating
  it per frame is correct. The chain's geometry is *discrete* — bodies do not
  slide toward each other as the URL bar retracts — and driving it from a
  continuously-changing viewport would animate the composition during a scroll.
- **It must be a media query, not `innerWidth`,** so it does not read a stale
  value during the URL-bar transition and does not need a resize listener.
- **It must key off width alone, not aspect.** Keying off aspect means a desktop
  window dragged narrow crosses the tier boundary mid-session and remounts the
  chain. Width matches the `md:` breakpoint the CSS already uses, so the type
  ladder and the scene switch at the same instant.

**Tier boundary: 768px**, i.e. Tailwind's `md`. This deliberately puts portrait
tablets (768×1024, aspect 0.75) on the **desktop** tier, where §2 shows the stops
at 44–60% visible. That is a knowingly bad outcome and is §8 decision 5.

**Remount cost — INFERRED.** Changing `radius` on a `FluidBlob` changes a value
that the birth animation bakes (`HeroCanvas.tsx:788-793` notes the float group
structure; `birth.ts` keys amplitude buckets off `radius > 2.4`). Crossing the
tier boundary mid-session may therefore restart the birth animation. On a phone
the boundary is never crossed; on a desktop it happens only while dragging a
window across 768px. Acceptable, but it must be *checked* rather than assumed —
the head sphere's mobile radius of 1.5 falls in a different amp bucket than its
desktop 2.8, which is exactly the thing `HeroCanvas.tsx:540-542` warns about.

---

## 7. Phases

Each phase is independently shippable and independently revertable.

### Phase 1 — Scroll and frame correctness ✅

Shipped as written. `touch-action: none` → `pan-y` (`FluidCanvas.tsx`), `h-screen`
→ `h-svh` (`Hero.tsx`), the diagonal line and the standing `COR / BRA` watermark
`hidden md:block`, and the footer wordmark's overhang `translate-x-[8%]` under
`md:`.

⚠️ **§4.1 is still INFERRED.** The `pan-y` change is correct either way and costs
nothing, but nobody has yet confirmed on a real device that touch scrolling was
broken — synthetic events cannot reproduce it. This is the one item on the list
whose *premise* remains unverified.

Measured after: at 390×740 the only element crossing the viewport is the footer
wordmark at 27px over, down from 65px — i.e. the deliberate crop, at the size the
design intends. `scrollWidth` 386 against `innerWidth` 390.

### Phase 1 (as planned)
*The page must be usable on a phone before it is beautiful on one.*

1. Verify §4.1 on a real device or DevTools touch emulation. If confirmed, change
   the R3F container to `touch-action: pan-y`.
2. `h-screen` → `h-svh` on the pinned hero child.
3. Clip or tier the four measured overflows in §3 that are pure decoration:
   diagonal line, standing watermark, footer wordmark overhang.

**Acceptance:** a finger drag scrolls the hero end to end; nothing is clipped by
the URL bar; `scrollWidth === innerWidth` at 360, 390 and 430.

### Phase 2 — The mobile chain ✅

Shipped. `lib/scene/tier.ts` authors four numbers per tier — two radii, the
surface gap, and an x/z per node — and derives `stopSpacing`, `scrollLift`,
`heroVh`, `stopY` and `headY` from them. `SCROLL_LIFT`'s literal 26 and `Hero`'s
literal `h-[700vh]` are both gone.

**Departure — the quantiser.** The plan said desktop must come out *bit-identical*
and the refactor should land alone so that is checkable. It landed alone, the
check was written, and it **failed**: `stopY(0) + surfaceGap + headRadius +
stopRadius` evaluates to `0.7999999999999998`, not `0.8`. The error is 2.2e-16
world units — about 3e-14 of a pixel, i.e. nothing on screen — but it turns the
guarantee into an approximation nobody can assert. Derived values are now
quantised to 1e-6 (~1e-4 px at this camera), and the equality holds exactly.

**Merge check, run as required.** At 360×800, 91.6 px per world unit, against
`blurRadius` 20px: the closest pair anywhere in the compact field (stop 01 and the
third loose drop) leaves **104px of surface gap, 5.2× the merge distance**. No
fusion risk, and the number is now in the record rather than assumed.

### Phase 2 (as planned)
1. `lib/scene/tier.ts` + `useSceneTier()` (§6).
2. Refactor `SCROLL_LIFT` and the hero's height to derive from spacing and `PACE`
   (§5.3) — **desktop values must come out bit-identical**; this is the checkable
   part and it lands before any new number does.
3. Add the mobile tier's chain table from §5.2, plus mobile positions for the
   three loose drops.
4. `MergeProbe` check on the 01→02 pair.

**Acceptance:** all four bodies ≥ 85% visible at 360×800 and 390×844; the three
stops still arrive at eye level on progress 0.25/0.50/0.75; desktop screenshots
are pixel-identical to `main`.

### Phase 3 — Type, cards, targets ✅

The §5.4 ladder shipped as written, with one refinement. The satellite control
keeps its 28px **face** — shrinking the fan's visual weight was never the goal —
and gains a transparent `before:-inset-2` ring, so the hit area is 44×44 while the
drawn control is unchanged. The sphere card's control is a real 40 → 44.

`text-[min(17vw,130px)]` is deliberately not a `md:` step: a breakpoint would
leave 767px rendering a 664px block in a 767px frame. 17vw reaches 130px at 765px
wide, so the wide tier never sees a different value.

### Phase 3 (as planned)
The §5.4 ladder, plus the 44×44 touch targets.

**Acceptance:** no element's rect crosses the viewport at 360px except the two
deliberate crops (sphere watermark, footer wordmark); every interactive control
is ≥ 44×44 on a coarse pointer.

### Phase 4 — The fan ✅

Decision 2(a) — the vertical stack. `FanLayout` on the tier decides; `stack: null`
returns the authored offsets untouched, so the wide tier's hand-solved arc is
provably unaffected.

**Departure — the numbers were wrong and had to be re-solved.** The plan proposed
`radiusScale` 0.6 with `ySpacing` 1.35 and it looked reasonable. Measured against
the clearance rule the authored arc actually holds — *"no two neighbouring
silhouettes come within 0.6 units"* — it gives **0.33 units between adjacent
drops, half the rule**, which the 20px blur would have fused into one lobe. The
plan asserted the arc's clearances "have to be solved the same way" and then did
not solve them.

The feasible window is narrow, because the two constraints pull opposite ways:
more `ySpacing` separates the drops from each other and pushes the ends of the run
into the chain bodies above and below. A sweep over `radiusScale` × `ySpacing` ×
`gap`, evaluated across all four fans, gives **0.50 / 1.50 / 0.35**:

| | measured | rule |
|---|---|---|
| drop ↔ drop | 0.65 units (60px) | ≥ 0.60 |
| drop ↔ chain | 0.62 units (57px) | ≥ 0.60 |
| frame edge | 0.18 units of margin | ≥ 0 |
| smallest name | 10px | ≥ 9 (`nameSize` floor) |

Largest drop is 92px against a stop's 220px — 42%, where the wide tier's largest
is 50% of its parent, so the hierarchy reads the same. Better clearance is
available (the sweep's best is `radiusScale` 0.44) but only by shrinking the drops
until the smallest name hits its 9px floor.

### Phase 4 (as planned)
Whichever of §8 decision 2 is chosen.

**Acceptance:** every drop in every fan is reachable and legible at 360px; no two
drops merge in the composite.

### Phase 5 — Performance tiers ⚠️ PARTIAL

The DPR tier shipped — `wide` keeps `[1, 1.5]`, `compact` takes `[1, 1.25]`,
verified live at 482×925 for a 386×740 canvas.

⚠️ **It shipped in the wrong order and that is worth stating plainly.** This
phase's own first step is *measure, then tune*, and the measurement has not been
made — nobody has profiled this pipeline on a phone. 1.25 is a cautious step down
(~31 % fewer fragments), not a number derived from a budget, and the code says so
at the constant. Steps 2 and 3 — `blurScale` / `trailScale` tiers, and wiring the
computed-but-unread `coarse` flag (§4.5) — are **not done**, deliberately: they
change how the fluid reads, and doing that on a guess is exactly what this
document exists to prevent.

### Phase 5 (as planned)
1. Measure first: frame time on real hardware, both contexts live. Currently
   **UNKNOWN** and nothing should be tuned before it is known.
2. Then, guided by the measurement: `dpr` cap on the mobile tier, `blurScale`
   and `trailScale` tiers, and a decision on whether both WebGL contexts should
   be live simultaneously on a phone.
3. Wire the already-computed-but-unread `coarse` flag (§4.5) to whatever the
   pointer field should do without a hovering cursor.

**Acceptance:** a stated frame-time budget, met on a named device.

---

## 8. Open decisions — resolved

All five were implemented on the recommendation given, since the go-ahead came
without a call on them. Each is cheap to reverse and the reversal point is named.

**1 · Stop spacing — TAKEN: preserve the surface gap.** Shipped as
`surfaceGap: 2.5` on both tiers, giving compact spacing 4.9, lift 19.6, hero
528vh. *To reverse:* set `COMPACT.surfaceGap` to `6.5 - 2 * stopRadius` = 4.1 and
the hero returns to 700vh.

§5.2 preserves the 2.5-unit surface gap, giving spacing 4.9 → `SCROLL_LIFT` 19.6
→ hero **528vh**. The alternative is to keep spacing at 6.5 (and therefore
`SCROLL_LIFT` 26 and 700vh untouched), which leaves 4.3 units of air between
radius-1.2 bodies where desktop has 2.5 between radius-2.0 ones — a much sparser
field, but a smaller change and one that touches neither the lift nor the page
height. *Recommendation: preserve the gap.* On a narrow frame density is what
makes the chain read as a chain, and §5.3 makes re-deriving the other two numbers
mechanical rather than a re-tune.

**2 · The satellite fan — TAKEN: (a), the vertical stack.** Shipped, with the
numbers re-solved from a sweep rather than the plan's first guess; see Phase 4.
*To reverse:* `COMPACT.fan.stack = null` restores the authored arc.

§4.6 shows the arc cannot be scaled into ±2.0 without the drops merging. Options:
**(a)** a vertical stack running down the open half of the frame, one drop per
~1.5 units, which keeps the drops as bodies and abandons the arc; **(b)** the fan
opens as a flat sheet of names over the sphere — no drops, no threads — which
abandons the spatial metaphor but is unambiguously legible and tappable;
**(c)** the fan is desktop-only and a stop's card links straight to its detail
page on mobile. *Recommendation: (a).* It keeps the drops as the same objects the
rest of the page is made of, and `SatelliteField` already mirrors by `side`, so a
vertical arrangement in the open half is a change to the offset table rather than
to the component.

**3 · Stop radius — TAKEN: 1.2.** Measured in place, the compact chain reads as a
zig-zag rather than a column, so the concern did not materialise. This remains the
number most likely to want adjusting, and it is one edit in `COMPACT`.

At 0.45 aspect, body size and alternation trade against each other directly.
Radius 1.2 with x ±0.95 gives x/r = 0.79 (desktop 1.60). Radius 1.4 gives a
better card fit and a more present body but forces x ≤ ±0.82, i.e. x/r = 0.59 and
a chain that is nearly a column. *Recommendation: 1.2*, but this is the number
most likely to want adjusting once it is on screen, and it is cheap to change.

**4 · Standing watermark and diagonal line — TAKEN: hidden below `md:`.**

Both are decorative, both currently clip, and neither has a natural mobile
placement — the frame has no spare margin for a bleed element. *Recommendation:
hide both below `md:`.* Scaling them keeps a compromised version of something
whose whole purpose is to be incidental.

**5 · Portrait tablets — TAKEN: left as they are, on the wide tier.** Still the
weakest spot in this pass. *To revisit:* the boundary is one string, `QUERY` in
`hooks/useSceneTier.ts`.

A 768px tier boundary puts them on the desktop scene, where the stops are 44–60%
visible (§2). Options: leave it (the composition is cropped but not broken), move
the boundary to `lg:` (1024px) so portrait tablets get the mobile scene at a size
where it will look under-filled, or add a third tier. *Recommendation: leave it
for now and revisit after Phase 3* — it is a real gap, but a third tier triples
the surface being tuned and tablets are not the target.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| §4.1 is wrong and touch scroll already works | low | costs one verification step; `pan-y` is harmless either way |
| The head's morph amp re-buckets from 0.085 to 0.11 at radius 1.5 (`FluidBlob.tsx:673`) — Phase 1/2 were calibrated at 0.085 | **medium** | §5.6 argues the ladder is working as designed; verify by eye on the mobile tier in Phase 2 rather than assuming, and if it reads loud, pass an explicit `amp` for the mobile head rather than editing the ladder |
| The head at radius 1.5 sits exactly on the `radius > 1.5` tessellation boundary (`FluidBlob.tsx:667`) | low | §5.6 — choose the side deliberately and comment it |
| The derived-`SCROLL_LIFT` refactor changes desktop by a rounding error | medium | Phase 2 step 2 lands alone, with desktop screenshots diffed before any mobile number is added |
| Two WebGL contexts is simply too much for a mid-range phone, and no amount of DPR tiering saves it | **medium** | Phase 5 measures before tuning; the fallback is a static gradient for the aurora on the mobile tier |
| The mobile chain reads as a column rather than a zig-zag | medium | §8 decision 3; cheap to re-tune |
| `SatelliteField`'s offset tables are hand-solved for collisions (`lib/satellites.ts:131-149`); a mobile table has to be solved the same way | medium | solve it the same way, and re-run the 0.6-unit silhouette check rather than eyeballing |

---

## 10. Reproducing the measurements

**Frustum table (§2).** `fov` 40 vertical, camera z 12:

```js
const T = Math.tan(40 * Math.PI / 360);        // 0.36397
const halfWidth  = (z, aspect) => (12 - z) * T * aspect;
const halfHeight = (z)         => (12 - z) * T;
// visible height at z=0 is 2 * halfHeight(0) = 8.735 on every device
```

**DOM overflow table (§3).** With the dev server up, in a 390×740 same-origin
iframe (and after the 1px width nudge described in §0):

```js
const vw = frame.contentWindow.innerWidth;
[...frame.contentDocument.querySelectorAll('*')]
  .map(el => [el, el.getBoundingClientRect()])
  .filter(([, r]) => r.width && (r.right > vw + 1 || r.left < -1));
```

**Surface-gap invariant (§5.1).** Chain nodes are `HeroCanvas.tsx:669-687`;
gap = `|Δy| − rᵢ − rⱼ` for each consecutive pair.

**Pace (§5.3).** `SCROLL_LIFT` is `HeroCanvas.tsx:49` (26); the hero's height is
`Hero.tsx:427` (`h-[700vh]`). Pace = 26 ÷ 700 = 0.03714.

**Breakpoint counts (§1).**

```sh
for p in "sm:" "md:" "lg:" "xl:"; do
  echo -n "$p "; grep -ro "$p" app components | wc -l
done
for f in components/*.tsx components/detail/*.tsx app/*.tsx; do
  grep -q "md:\|lg:\|sm:" "$f" || echo "no breakpoint: $f"
done
```
