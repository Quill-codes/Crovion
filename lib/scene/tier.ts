/**
 * The hero composition, at two frame widths.
 *
 * ── Why this file exists ──
 *
 * `PerspectiveCamera.fov` is the *vertical* field of view, so the visible world
 * height is `2 · 12 · tan(20°)` = 8.735 units on every device and the visible
 * *width* is that times the aspect ratio. A 16:9 desktop gets ±7.76 units of
 * width; a 390×844 phone gets ±2.02. The chain was composed against the first
 * and, until this file, was played back unchanged into the second — stop 02
 * showed 12 % of its own diameter on a 360 px Android.
 *
 * Nothing here is a feel knob. Each tier authors four numbers — two radii, the
 * air between bodies, and an x/z per node — and everything else on the chain is
 * derived from them by the helpers below.
 *
 * ── The invariant the derivations are built on ──
 *
 * The desktop chain's three links each leave **exactly 2.5 world units between
 * surfaces**:
 *
 *     head → 01   Δy 7.3 − (2.8 + 2.0) = 2.5
 *     01   → 02   Δy 6.5 − (2.0 + 2.0) = 2.5
 *     02   → 03   Δy 6.5 − (2.0 + 2.0) = 2.5
 *
 * So the chain is not "6.5 apart"; it is 2.5 of air, and 6.5 is what that works
 * out to for radius-2.0 bodies. `surfaceGap` is the authored number and the
 * spacing follows — which is what lets the compact tier shrink its bodies
 * without anyone deciding a new Δy by eye.
 *
 * ── The pace, and three numbers that are really one ──
 *
 * `HeroCanvas`'s own note names the invariant it was holding: *"The ratio
 * between them is the scroll pace — 0.037 world units per vh — and it is the
 * thing being held constant here, not either number."* Two consequences, and
 * together they collapse `SCROLL_LIFT` and the hero's height into functions of
 * the spacing:
 *
 *   1. `SCROLL_LIFT = 4 × stopSpacing` puts the three stops at eye level on
 *      progress 0.25 / 0.50 / 0.75. (4 × 6.5 = 26. ✓)
 *   2. Holding `PACE` **is** holding the parallax ratio — scene pixels moved per
 *      pixel scrolled. Both world-units-per-pixel and vh scale with viewport
 *      height, so they cancel:
 *
 *          ratio = SCROLL_LIFT / (8.735 × heroMultiple) = 26 / (8.735 × 7) = 0.425
 *
 *      on any device. A phone therefore needs no separate feel-tuning: hold the
 *      pace and the parallax is identical to desktop by construction.
 *
 * ⚠️ The `wide` tier reproduces the previous hard-coded composition **exactly**.
 * `stopSpacing(WIDE)` is 6.5, `scrollLift(WIDE)` is 26, `heroVh(WIDE)` is 700 and
 * `stopY` returns −6.5 / −13 / −19.5, which are the literals that used to live in
 * `HeroCanvas` and `Hero`. If a change here moves any of those, it has broken
 * desktop.
 */

/** World units the chain lifts per vh of hero height. 26 / 700, from the desktop tier. */
export const PACE = 26 / 700;

/** Visible world height at the composition plane: `2 · 12 · tan(fov/2)`, fov 40. */
export const VISIBLE_HEIGHT = 2 * 12 * Math.tan((40 * Math.PI) / 360);

/**
 * How a stop's fan of drops is arranged.
 *
 * `stack: null` uses the authored offsets in `lib/satellites.ts` verbatim — the
 * hand-solved outward-bulging arc, whose collision clearances are reasoned in
 * place in that file.
 *
 * That arc cannot be scaled into a phone's frame. Its offsets run to x 6.15
 * against a half-width of 2.02, so every drop of every fan is outside the frame
 * before its own radius is added; and shrinking it to fit would put five bodies
 * of radius 0.74 into a band four units wide, where the composite would fuse them
 * into one blob. So the compact tier replaces the arc with a vertical run down
 * the parent's open half, which is a different *arrangement* of the same objects
 * rather than a different kind of thing.
 */
export interface FanLayout {
  /** Multiplier on each drop's authored radius. */
  radiusScale: number;
  /** Null keeps the authored arc. */
  stack: {
    /** Air between the parent's surface and a drop's, world units. */
    gap: number;
    /** Vertical centre spacing between adjacent drops. */
    ySpacing: number;
  } | null;
}

export interface SceneTier {
  id: "wide" | "compact";

  /** The head of the chain — the hero of the composition, not a stop on it. */
  headRadius: number;
  headX: number;
  headZ: number;

  /** Uniform across the three numbered stops, by direction. */
  stopRadius: number;
  /** x and z per numbered stop, in chain order. y is derived; see `stopY`. */
  stops: readonly { x: number; z: number }[];

  /** Air between the surfaces of any two consecutive bodies. See the note above. */
  surfaceGap: number;

  /** The loose drops — not on the chain; they keep the field from reading as a diagram. */
  drops: readonly { x: number; y: number; z: number; r: number }[];

  /** Depth the numbered card floats in front of its sphere's centre. */
  labelDepth: number;

  /** The head's CTA: diameter in CSS px, and its offset below the head's centre. */
  ctaSize: number;
  ctaY: number;

  watermark: {
    /**
     * Where the watermark block anchors, in the sphere's own space.
     *
     * Wide keeps the reference's rule — the block extends into the *open half*
     * of the frame, so a left-hand sphere's type runs right and a right-hand
     * sphere's runs left. On a phone there is no open half: at the compact type
     * size the block is 87 % of the frame's width, so it is anchored to a fixed
     * world x instead and every stop's type sits flush in the same place.
     */
    anchorX: (sphereX: number) => number;
    anchorY: number;
  };

  fan: FanLayout;
}

/**
 * ≥ 768 px. The desktop composition, unchanged.
 *
 * Portrait tablets (768×1024, aspect 0.75) land here and are cropped — the stops
 * show 44–60 % of themselves. Knowingly left, because a third tier triples the
 * surface being tuned; revisit if tablets become a target.
 */
export const WIDE: SceneTier = {
  id: "wide",

  headRadius: 2.8,
  headX: 3.0,
  headZ: -1.0,

  stopRadius: 2.0,
  stops: [
    { x: -3.2, z: 1.0 },
    { x: 3.4, z: 0.4 },
    { x: -2.8, z: 0.8 },
  ],

  surfaceGap: 2.5,

  drops: [
    { x: -2.2, y: 3.2, z: -0.5, r: 0.55 },
    { x: 1.5, y: -3.8, z: 1.0, r: 0.15 },
    { x: -4.0, y: -9.8, z: 0.6, r: 0.22 },
  ],

  labelDepth: 2.0,

  ctaSize: 115,
  ctaY: -1.0,

  watermark: {
    anchorX: (sphereX) => (sphereX < 0 ? -1.6 : -6.5),
    anchorY: 2.4,
  },

  fan: { radiusScale: 1, stack: null },
} as const;

/**
 * < 768 px. Solved for the worst-case phone aspect, 0.450 (360×800), so the
 * result holds on every phone rather than only on the one it was tuned against.
 *
 * Three rules, the first two lifted off the desktop composition and the third
 * relaxed because at this aspect they cannot all hold at once:
 *
 *   • **Presence.** The head's diameter is 76 % of the frame's width and a
 *     stop's is 61 %. On a phone the body has to own the width or it reads as a
 *     bead.
 *   • **Alternation.** Each stop sits on the opposite side from the one above,
 *     so the connector crosses the frame rather than running down one edge.
 *   • **Edge-kiss.** Desktop keeps every body fully inside the frame. Here a
 *     stop may cross the edge by up to 15 % of its own diameter, and that
 *     allowance is exactly what buys back the alternation — at 0.45 aspect,
 *     containment and a visible zig-zag are in direct competition.
 *
 * Frustum half-widths at aspect 0.450, evaluated at each body's own z:
 *
 *     head  z −1.0  →  2.13     |x| + r = 0.90 + 1.5 = 2.40   crosses  9 % of ⌀
 *     01    z  1.0  →  1.80     |x| + r = 0.95 + 1.2 = 2.15   crosses 14 % of ⌀
 *     02    z  0.4  →  1.90     |x| + r = 1.00 + 1.2 = 2.20   crosses 12 % of ⌀
 *     03    z  0.8  →  1.83     |x| + r = 0.90 + 1.2 = 2.10   crosses 11 % of ⌀
 *
 * ⚠️ `x ÷ radius` is 0.79 here against desktop's 1.60. The zig-zag *is* weaker
 * and it is not a mistake — it is the price of Presence at this aspect. It is
 * also the first number to reach for if the chain reads as a column: raising the
 * x offsets costs containment, lowering the radii costs presence and the card's
 * fit on the body, and there is no third direction.
 *
 * ⚠️ `headRadius: 1.5` sits precisely on `FluidBlob`'s `radius > 1.5`
 * tessellation boundary, and the test is strict, so this resolves to 96 segments
 * rather than 160. That is deliberate — it is a 40 % cut in vertex work on
 * exactly the devices that need it, and at 254 px projected the head does not
 * need 160. Nudge to 1.55 to buy the finer mesh back.
 *
 * ⚠️ This also moves the head into a different morph bucket: `FluidBlob`'s
 * `amp` ladder gives `radius > 2.4` → 0.085 and `radius > 1.0` → 0.11, so the
 * compact head morphs at 0.11 where the desktop head — the body Phase 1 and
 * Phase 2 were calibrated against — morphs at 0.085. The ladder exists so that
 * *"relative deformation falls off with size"*, i.e. a smaller body is meant to
 * get a louder amp so it reads the same at its size, so this is the ladder
 * working rather than a regression. It is flagged because it is a calibrated
 * value changing, and if the compact head reads loud the fix is an explicit
 * `amp` for it, not an edit to the ladder every other body shares.
 */
export const COMPACT: SceneTier = {
  id: "compact",

  headRadius: 1.5,
  headX: 0.9,
  headZ: -1.0,

  stopRadius: 1.2,
  // Magnitudes deliberately uneven, as they are on the wide tier: a chain whose
  // offsets are all the same number reads as a rendered diagram.
  stops: [
    { x: -0.95, z: 1.0 },
    { x: 1.0, z: 0.4 },
    { x: -0.9, z: 0.8 },
  ],

  surfaceGap: 2.5,

  // Radii are close to the wide tier's on purpose. They already render ~30 %
  // smaller in pixels — px per world unit is 84.7 at 740 px tall against 123.6 at
  // 1080 — so scaling them by the chain's own factor as well would delete them.
  // The largest is brought to 0.33 to hold its 27 % ratio against a stop, and the
  // other two are left alone: 0.15 is below `FluidBlob`'s `isTiny` cut of 0.2 and
  // 0.22 is above it, and scaling would have flipped the second across that line
  // and changed its character rather than its size.
  drops: [
    { x: -1.3, y: 2.4, z: -0.5, r: 0.33 },
    { x: 0.85, y: -2.85, z: 1.0, r: 0.15 },
    { x: -1.5, y: -7.4, z: 0.6, r: 0.22 },
  ],

  labelDepth: 1.2,

  ctaSize: 92,
  ctaY: -0.54,

  watermark: {
    // −2.2 in the group's space, i.e. the same screen position for every stop.
    // See the note on `anchorX` above for why the open-half rule is dropped here.
    anchorX: (sphereX) => -2.2 - sphereX,
    // Scaled with the body, so the block sits on the sphere the way it does on
    // the wide tier rather than floating clear above a smaller one.
    anchorY: 2.4 * (1.2 / 2.0),
  },

  /**
   * Solved against the same clearance rule the authored arc holds — *"no two
   * neighbouring silhouettes come within 0.6 units"* — rather than picked by eye.
   * The first pass at 0.6 / 1.35 looked reasonable and measured 0.33 units
   * between adjacent drops, half the rule, which the composite's 20px blur would
   * have fused into a single lobe.
   *
   * The window is narrow, because the two constraints pull opposite ways: more
   * `ySpacing` separates the drops from each other and pushes the ends of the run
   * toward the chain bodies above and below. Across all four fans this triple
   * measures
   *
   *     drop ↔ drop    0.83 units (70 px)   rule ≥ 0.60
   *     drop ↔ chain   1.08 units (92 px)   rule ≥ 0.60
   *     frame edge     0.18 units of margin in hand
   *
   * — all at 360×800, the worst case, and against a merge distance of 20px.
   *
   * The first two improved (from 0.65 and 0.62) when the drops went to a single
   * authored radius: the run's clearance is set by its *largest* body, and 0.74
   * is below the 1.00 that used to set it. See `SatelliteNode.radius`.
   *
   * `radiusScale` 0.50 puts every drop at 63px against a stop's 203px, i.e. 31 %
   * — the wide tier's drops are 37 % of a numbered stop, so the hierarchy reads
   * the same. Pushing clearance further is possible but only by shrinking the
   * drops, and the drops are already the constraint on the name that has to fit
   * inside one. At this size `SatelliteField`'s fit pass is pinned to its floor,
   * and the drop's control has to leave the body to make room for the name —
   * see `controlOutside` there. Raising `radiusScale` is the direction that
   * would buy the type back, and it costs drop-to-chain clearance: the run's
   * lowest body is already the tightest pair in the compact composition.
   */
  fan: {
    radiusScale: 0.5,
    stack: { gap: 0.35, ySpacing: 1.5 },
  },
} as const;

// ── Derived geometry ──
//
// Everything below is a function of the four authored numbers. Nothing here
// should ever become a literal.

/**
 * Quantise to 1e-6, and it is not cosmetic.
 *
 * `stopY(0) + surfaceGap + headRadius + stopRadius` evaluates to
 * 0.7999999999999998 rather than 0.8 — binary floating point, 2.2e-16 out, which
 * is around 3e-14 of a pixel and could not matter less on screen. What it does
 * cost is the *check*: the wide tier is supposed to reproduce the literals this
 * module replaced, and "0.7999999999999998 ≈ 0.8" is a claim someone has to
 * re-derive every time instead of an equality a test can assert.
 *
 * 1e-6 world units is ~1e-4 px at this camera, so nothing authored here can be
 * meaningfully quantised away.
 */
const q = (v: number) => Math.round(v * 1e6) / 1e6;

/** Vertical centre spacing between consecutive numbered stops. */
export const stopSpacing = (t: SceneTier) => q(t.surfaceGap + 2 * t.stopRadius);

/**
 * World units the chain travels upward across the pinned scroll range.
 *
 * Four times the spacing, which is what lands the three stops at eye level on
 * progress 0.25 / 0.50 / 0.75. Solving it exactly against the pin's release
 * (19.5 / 0.86 ≈ 23 on the wide tier) is the tempting version and it is wrong —
 * the deepest sphere would reach eye level at the instant the pin releases, so it
 * is never on screen settled. The headroom is the point.
 */
export const scrollLift = (t: SceneTier) => q(4 * stopSpacing(t));

/** The hero section's height in vh, holding `PACE`. Wide resolves to exactly 700. */
export const heroVh = (t: SceneTier) => Math.round(scrollLift(t) / PACE);

/** Centre height of numbered stop `i` (0-based), so stop `i` lands at eye level on `(i+1)/4`. */
export const stopY = (t: SceneTier, i: number) => q(-(i + 1) * stopSpacing(t));

/** The head sits one surface gap above the first stop. */
export const headY = (t: SceneTier) =>
  q(stopY(t, 0) + t.surfaceGap + t.headRadius + t.stopRadius);
