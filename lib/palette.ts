/**
 * The pastel families every body on the field is painted from.
 *
 * ── Where these came from ──
 *
 * Authored, not measured. That is a deliberate break from the two tables this
 * replaces, and it is worth saying plainly because the old ones carry pages of
 * derivation: the chain's tints in `HeroCanvas` were sampled off `ref-frames-2`
 * and stop 03's amber was inverted through the ACES curve by hand, and
 * `DROP_TINTS` was solved against the Bravis hero sphere's own radial profile at
 * matched luminance. Both are still in the history if they are ever wanted back.
 *
 * They were answering a narrower question. The hero sphere on bravis.com is one
 * deep crimson body carrying the whole composition, and a palette solved against
 * it lands where that body lands — saturated and dark. The brief these values
 * serve is the opposite end of the same site: *soft, airy, editorial, translucent
 * water droplets in a clean space*, explicitly **not** over-saturated. Chasing the
 * hero's chroma is how the fan ended up with a strong orange ball in it.
 *
 * ── How four hexes become a body ──
 *
 * `FluidBlob`'s fragment runs a four-stop radial ramp — deep, mid, warm, rim —
 * with the interior flow noise shifting each boundary so the bands pool and
 * drift rather than sitting in concentric rings. Four authored values per family
 * is therefore not a coincidence, it is the shape of the thing they feed.
 *
 * The assignment is by **relative luminance**, darkest to the core and lightest
 * to the rim, and the ordering is what makes these read as pale rather than as
 * the colour they are named after. The band that covers the most of a body is
 * `warm`, which lays over r 0.45-0.85 at 0.85 strength — most of the disc — and
 * it takes the *second lightest* of the four. The saturated end of each family
 * only ever reaches the core, which the film then lifts a further tenth toward
 * `mid`, and the shaded crescent.
 *
 * That is the whole reason the yellow family reads as cream with a peach shadow
 * instead of an orange ball: #F6A85F is in there, but it is only ever the core
 * of a body whose visible mass is #FFE29A and #FFF4B8.
 */
export interface PastelFamily {
  /** For reading the table, and for nothing else. */
  name: string;
  /** Saturated core. The smallest region on the body. */
  inner: string;
  /** First step out of the core. */
  mid: string;
  /** The widest band — r 0.45-0.85 — and so the body's apparent colour. */
  warm: string;
  /** The pale edge. */
  rim: string;
}

/**
 * Five families, and five is the number the fan needs.
 *
 * The largest fan on the chain is the head's five drops, so a five-entry table
 * rotated by the parent's number puts a different family on every drop that can
 * ever be on screen together, with no repeats to notice. See `dropHue`.
 *
 * The luminance of each stop is noted because the ordering is the load-bearing
 * part — if a family is ever edited, the four values have to stay sorted or the
 * body inverts and the pale one ends up in the core.
 */
export const PASTEL_FAMILIES: readonly PastelFamily[] = [
  // Y 0.380 / 0.523 / 0.556 / 0.763
  { name: "purple", inner: "#B596F2", mid: "#C9B4FF", warm: "#D9B8F5", rim: "#E9DDFF" },
  // Y 0.466 / 0.570 / 0.599 / 0.762
  { name: "pink", inner: "#F49AC9", mid: "#E9B5F5", warm: "#FFB7D4", rim: "#FFD8E8" },
  // Y 0.489 / 0.628 / 0.636 / 0.820
  { name: "blue", inner: "#A9B7F5", mid: "#D6C8FF", warm: "#B9D2FF", rim: "#DDEBFF" },
  // Y 0.484 / 0.632 / 0.780 / 0.894 — the family the brief singles out. Its
  // core is the only genuinely orange value on the page and it never reaches
  // past r 0.5; the body is the two creams above it.
  { name: "yellow", inner: "#F6A85F", mid: "#FFC76B", warm: "#FFE29A", rim: "#FFF4B8" },
  // Y 0.675 / 0.769 / 0.832 / 0.878 — the lightest family of the five, by a
  // wide margin at the core. Left that way: mint is the one hue that turns
  // acidic rather than pale when it is pushed, and a fan of five wants one
  // member that sits back.
  { name: "mint", inner: "#9FE4D1", mid: "#B9EFD5", warm: "#DFF3B7", rim: "#D9F8E9" },
];

/** Read a family by name, for the bodies that are placed rather than indexed. */
export function family(name: string): PastelFamily {
  const f = PASTEL_FAMILIES.find((p) => p.name === name);
  if (!f) throw new Error(`[crovion] no pastel family "${name}"`);
  return f;
}

/**
 * The head sphere's own ramp, and the one body on the field that does not take
 * a family straight off the table.
 *
 * It is the hero of the composition — the largest body, the only one carrying a
 * call to action, and the one on screen at load — so it is allowed more chroma
 * than the five families give. Every stop is a step saturated from `purple`
 * while keeping that family's rim, which is what stops it reading as a sixth
 * colour rather than as the deep end of one the page already uses.
 *
 * It is still nowhere near the saturation of the body it used to be: the point
 * is a membrane with colour *in* it, not a solid violet ball.
 */
export const HEAD_TINT = {
  inner: "#9A6BF0",
  mid: "#B48CFF",
  warm: "#CBA8FA",
  rim: "#E9DDFF",
} as const;
