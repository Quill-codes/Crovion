/**
 * The drops that hang off a numbered sphere once its share button is opened.
 *
 * Modelled on the reference's expanded "04 GLOBAL BRANDING" stop: the big body
 * stays where it is, and a handful of smaller bodies of the *same material* fan
 * out around it, each one carrying its name and a share control of its own.
 *
 * The tree is two deep, and stops here. A chain sphere opens a fan of drops, and
 * a drop's own control leaves the canvas entirely for that drop's page — see
 * `lib/pages/registry.ts`. It used to go one level further, into a fan of leaf
 * drops nested inside each drop's blob; that level is gone. A 60px body holding
 * a two-word name was the smallest a claim could be made in, and the claim is
 * better made on a page than on a speck. What the leaves said now lives in the
 * page's own "What we run" block, where there is room to say why.
 *
 * Each drop wears a round white badge with its picture in it, and its name set
 * beside the badge — the reference's brand-logo stops. The badge was removed
 * once, in favour of the name set on the bare body, and came back with real
 * images: a monogram in a disc was standing in for a logo, a logo is the thing
 * itself. See `image` below; `mark` is what a drop without one shows.
 *
 * Everything here is dummy content — the point is the mechanism and the
 * composition, not the copy. What is not arbitrary is that each set reads as
 * facets of its parent discipline, because that is what makes the fan-out look
 * like a structure rather than decoration.
 *
 * ── Offsets ──
 *
 * Stated in the parent's own frame, in world units, with **+x meaning "toward
 * the open half of the viewport"**. The chain alternates hard (01 and 03 at
 * x ≈ -3, 02 at x ≈ +3.4), so a fixed offset that clears the frame on one
 * sphere walks off it on the next — the same problem `SphereWatermark` solves,
 * solved the same way. `SatelliteField` mirrors x for right-hand parents.
 *
 * The positions are deliberately uneven in angle and distance. Evenly spaced
 * satellites read as a compass rose; the reference's read as drops that happened
 * to settle nearby.
 *
 * The *radii* used to be uneven too, running 0.64 to 1.00, and they are now one
 * number on every drop — see `radius` below for why, and for the clearance the
 * single value was solved against.
 *
 * The spread is wide horizontally and deliberately tight vertically — |y| stays
 * inside ~2.3 while x runs to 4.7. At fov 40 from z = 12 the frame is ±4.37 world
 * units tall against roughly ±7.4 wide, and a parent only sits dead centre at the
 * exact instant of its own reveal: the moment the reader scrolls off that point
 * the whole fan travels with it, so the vertical budget is the one that runs out
 * first and the horizontal one is where the composition can afford to breathe.
 *
 * These are unchanged from when each drop also had to hold a fan of its own. The
 * spacing is now looser than it strictly has to be, and that is deliberate: it is
 * measured against the chain, the frame and the drops' own rendered rims, all of
 * which are still here. Nothing was retuned for the extra room, because nothing
 * needed the extra room.
 */

import { CONTACT } from "@/lib/contact";
import { PASTEL_FAMILIES, type PastelFamily } from "@/lib/palette";

export interface SatelliteNode {
  /**
   * Stable key. Also the join to this drop's page — `detailHref` looks the id up
   * in the page registry, and the backend files its row under the same string.
   */
  id: string;
  /**
   * The monogram in the drop's white badge, drawn only when the drop has no
   * `image`. The backend has a `mark` column and an admin form that writes it,
   * so this is the fallback an admin can always edit.
   */
  mark?: string;
  /**
   * The picture in the drop's white badge — a client logo, a service icon.
   *
   * A public path, served from `public/`. The shipped files under `/drops/` are
   * placeholders named after the drop's id, so a real logo goes in by replacing
   * the file and nothing here has to change. A drop without one shows its `mark`
   * in the badge instead.
   *
   * Local only, like the geometry: the backend has no column for it, and
   * `useDrops` carries it across by id rather than by slot, so a reordered fan
   * keeps each picture on the drop it belongs to.
   */
  image?: string;
  /** The name, set beside the drop's badge. */
  label: string;
  /**
   * The line that used to sit under the name on the drop.
   *
   * **No longer rendered**, for the same reason `mark` is not: the canvas is a
   * set of names now. Set at 10.5px under a body as small as 60px it wrapped to
   * two or three lines, and a fan of four turned into a wall of copy that the
   * eye had to read past to see the composition. The claim is made on the drop's
   * own page, where there is room to make it properly.
   *
   * The field stays because the backend has a `detail` column and an admin form
   * that writes it, and the drop pages are still being written against it.
   */
  detail?: string;
  /**
   * What this drop's share button opens.
   *
   * `"detail"` — the default, and every drop but one — reveals `detail` beside
   * the badge. `"form"` swaps that for the contact form, which posts to the
   * backend's `/api/leads`. It is a per-drop property rather than a special case
   * keyed on the id because the admin can move it: the FRM drop is where it sits
   * now, not where it has to sit.
   */
  kind?: "detail" | "form";
  /** Offset from the parent's centre. +x is the open half of the frame. */
  offset: [number, number, number];
  /**
   * Undeformed radius. **The same on every drop**, and deliberately so.
   *
   * It used to be authored per drop, 0.64 to 1.00, on the reasoning that a fan of
   * equal bodies reads as a diagram. In practice the 1.56x spread read as an
   * accident rather than as a hierarchy — nothing on the fan ranks the drops, so
   * unequal sizes were making a claim the content does not support — and it also
   * made the type on them uneven, because the name's size was a ramp on this
   * number. (It no longer is: `SatelliteField` measures the name against the
   * circle it has to sit in. The uniformity argument stands on its own.)
   *
   * 0.74 is the largest single value that holds the file's own clearance rule —
   * *"no two neighbouring silhouettes come within 0.6 units"* — on both scene
   * tiers, with margin. The binding pair is `00-web`/`00-smm` on the wide tier,
   * whose centres are 2.11 apart: 2.11 - 2(0.74) = 0.63. At 0.75 that falls to
   * 0.61 and at 0.76 it breaks the rule, so this is the ceiling and not a taste.
   * Every drop still clears its parent's surface (worst case 0.40 on the wide
   * tier, 0.36 on the compact stack), and drop-to-chain clearance improved on
   * both tiers, because the largest bodies came down further than the smallest
   * went up.
   *
   * Kept well under the parent's 2.0 so the hierarchy holds: 37 % of a numbered
   * stop, 26 % of the head.
   */
  radius: number;
}

/**
 * The drops for each stop, keyed by the parent's number.
 *
 * Four is the ceiling for a numbered stop, because they sit 6.5 world units
 * apart on the chain: a fan wide enough to hold more starts colliding with the
 * stop above and below, and the connector threads cross. Fewer is free — 03
 * carries three, because contact has three channels and no fourth.
 *
 * The table stops at 03. Stops 04-06 were removed from the chain in HeroCanvas
 * and their fans went with them — a fan keyed to a parent that no longer exists
 * is never mounted, because `SatelliteField` is only rendered from a chain node.
 *
 * `"00"` is the head of the chain — the OUR SERVICES body, addressed by
 * `SERVICES_FAN` in `HeroCanvas`. It is the one exception to that count, and
 * holds five. Two things buy it the extra slot. Its radius is 2.8 against the
 * numbered stops' 2.0, so its offsets are scaled out from theirs anyway — a drop
 * placed at 01's distances would be sitting on the body rather than beside it —
 * and the extra distance opens a longer arc to distribute along. And it has no
 * stop above it: the collision budget that caps the others at four is spent in
 * both directions, where the head only has to clear 01, 7.3 units below.
 *
 * Sixteen drops, and therefore sixteen pages. The registry keys off the ids
 * below, so adding a drop here is what makes its page addressable — and a drop
 * with no entry there simply carries no control, rather than a dead one.
 */
export const SATELLITES: Record<string, SatelliteNode[]> = {
  // ── 00 — the head of the chain, i.e. the services sphere ──
  //
  // The five services, top to bottom in the order they are listed; the fan's
  // stagger runs on array index, so this order is also the order they arrive in.
  //
  // The head sits at x = +3.0, so `SatelliteField` mirrors these and the fan
  // opens into the left half of the frame, away from the CTA on the body itself.
  // Every offset clears 2.8 + 0.74 = 3.54 — the nearest, the first slot, sits at
  // 4.07 — and no two neighbouring silhouettes come within 0.6 units of each
  // other once their float and morph are accounted for.
  //
  // This fan is where the uniform radius is decided: five bodies on one arc is
  // the tightest packing on the chain, so `00-web`/`00-smm` is the pair that sets
  // the ceiling at 0.74. See `radius`.
  //
  // The arc bulges outward at the middle rather than running as a constant
  // radius: five bodies spread over the vertical band the frame allows would
  // otherwise have to sit closer together than their own diameters. Slot 3 is
  // the far point at x 6.15, and the arc — not a smaller body there — is now what
  // buys slots 2-4 their spacing.
  //
  // The first slot stays at y 2.15. It came down from 2.5, where it clipped the
  // top of the frame: the *rendered* body is wider than `radius`, because the
  // blob displaces outward and carries a soft rim past its own silhouette. That
  // ceiling is why the arc is extended downward instead — the bottom has room,
  // where the lowest drop still clears stop 01's top edge by ~1 unit.
  //
  // For the same rim reason nothing is placed below-right of another drop: the
  // names always run to the right of their badge, so a body there lands in its
  // neighbour's type.
  "00": [
    {
      id: "00-prf",
      mark: "PRF",
      image: "/drops/00-prf.svg",
      label: "Performance Marketing",
      detail: "Paid media bought against revenue, not impressions.",
      offset: [3.4, 2.15, 0.6],
      radius: 0.74,
    },
    {
      id: "00-web",
      mark: "WEB",
      image: "/drops/00-web.svg",
      label: "Web Development",
      detail: "Sites that stay fast once real content lands on them.",
      offset: [5.4, 0.85, -0.45],
      radius: 0.74,
    },
    {
      id: "00-smm",
      mark: "SMM",
      image: "/drops/00-smm.svg",
      label: "Social Media Management",
      detail: "A calendar someone actually keeps, and replies that arrive same-day.",
      offset: [6.15, -0.85, 0.55],
      radius: 0.74,
    },
    {
      id: "00-ecm",
      mark: "ECM",
      image: "/drops/00-ecm.svg",
      label: "E-commerce Management",
      detail: "Listings, stock and checkout run as one operation rather than three.",
      offset: [5.15, -2.45, -0.4],
      radius: 0.74,
    },
    {
      id: "00-brd",
      mark: "BRD",
      image: "/drops/00-brd.svg",
      label: "Branding",
      detail: "One mark, a palette and type that hold together everywhere.",
      offset: [3.25, -3.55, 0.5],
      radius: 0.74,
    },
  ],
  // ── 01 — the portfolio stop ──
  //
  // These used to be a copy of the head sphere's fan, from when the head was
  // itself named PORTFOLIO. It is now OUR SERVICES and carries the five services
  // above, so the two sets have separated: this one is the work, that one is what
  // we sell. They are no longer required to agree.
  "01": [
    {
      id: "01-tst",
      mark: "TST",
      image: "/drops/01-tst.svg",
      label: "Testimonials",
      detail: "What the last ten clients said, in their own words.",
      offset: [3.7, 1.95, 0.6],
      radius: 0.74,
    },
    {
      id: "01-mta",
      mark: "MTA",
      image: "/drops/01-mta.svg",
      label: "Meta Ads",
      detail: "Paid social bought against revenue, not impressions.",
      offset: [4.6, -0.59, -0.4],
      radius: 0.74,
    },
    {
      id: "01-web",
      mark: "WEB",
      image: "/drops/01-web.svg",
      label: "Website",
      detail: "Sites that stay fast once real content lands on them.",
      offset: [2.9, -2.46, 0.7],
      radius: 0.74,
    },
    {
      id: "01-brd",
      mark: "BRD",
      image: "/drops/01-brd.svg",
      label: "Branding/Logo",
      detail: "One mark, a palette and type that hold together everywhere.",
      offset: [-2.1, 2.29, -0.5],
      radius: 0.74,
    },
  ],
  "02": [
    {
      id: "02-mkt",
      mark: "MKT",
      image: "/drops/02-mkt.svg",
      label: "Market Study",
      detail: "Where the category is crowded, and where it is empty.",
      offset: [3.9, 1.78, 0.5],
      radius: 0.74,
    },
    {
      id: "02-pos",
      mark: "POS",
      image: "/drops/02-pos.svg",
      label: "Positioning",
      detail: "The one sentence everything else has to agree with.",
      offset: [4.4, -0.85, -0.5],
      radius: 0.74,
    },
    {
      id: "02-aud",
      mark: "AUD",
      image: "/drops/02-aud.svg",
      label: "Audience Insight",
      detail: "Who is actually buying, as opposed to who was meant to.",
      offset: [2.6, -2.46, 0.8],
      radius: 0.74,
    },
    {
      id: "02-cmp",
      mark: "CMP",
      image: "/drops/02-cmp.svg",
      label: "Competitor Map",
      detail: "The field drawn to scale, including the parts nobody claims.",
      offset: [-2.1, 2.29, -0.6],
      radius: 0.74,
    },
  ],
  // ── 03 — the contact stop ──
  //
  // Three drops, not four: the three ways to actually reach us, and there is no
  // fourth. The set that used to sit here was the digital-product fan (UX, web
  // platforms, design systems, app prototypes), left over from when 03 was named
  // DIGITAL PRODUCT.
  //
  // They take slots 1-3 of the four-position arc unchanged — top, far point,
  // bottom — because that arc is what carries the vertical spread. The slot that
  // was dropped is the fourth, the one placed back across the parent at x -2.1:
  // it is the only position on the wrong side of the body, and it exists to stop
  // a four-drop fan reading as a single stiff arc. Three drops on an even arc do
  // not have that problem, so removing it costs nothing and keeps every remaining
  // drop in the open half of the frame.
  //
  // The address and number a drop names come from `lib/contact.ts`, not from
  // literals typed here. The detail lines still say when and how each channel
  // answers — that register is what the rest of the table is written in — but a
  // drop called "Email" that never shows the address made the reader go looking
  // for the footer to act on it. Sourcing both from one module is what keeps
  // this from being the second place the address is written and the first place
  // it goes stale.
  "03": [
    {
      id: "03-frm",
      mark: "FRM",
      image: "/drops/03-frm.svg",
      label: "Contact Form",
      detail: `Four fields and a send button. No account, no newsletter. Or find us at ${CONTACT.addressLine}.`,
      kind: "form",
      offset: [3.6, 2.04, 0.7],
      radius: 0.74,
    },
    {
      id: "03-eml",
      mark: "EML",
      image: "/drops/03-eml.svg",
      label: "Email",
      detail: `${CONTACT.email} — read by a person, answered inside one working day.`,
      offset: [4.7, -0.42, -0.3],
      radius: 0.74,
    },
    {
      id: "03-tel",
      mark: "TEL",
      image: "/drops/03-tel.svg",
      label: "Phone Number",
      detail: `${CONTACT.phone} — weekdays, 09:00 to 18:00, whichever timezone you are in.`,
      offset: [2.8, -2.46, 0.6],
      radius: 0.74,
    },
  ],
};

/**
 * A drop's four stops. Structurally identical to `PastelFamily`, and kept as its
 * own name because a drop is what consumes it.
 */
export type DropHue = Omit<PastelFamily, "name">;

/**
 * This drop's family: the pastel table rotated by its parent.
 *
 * Within a fan the index walks the table, so no two drops on screen at once can
 * share a family — the largest fan is the head's five and the table is five.
 *
 * The rotation is what stops the four fans opening in the same five colours in
 * the same order. `Number(parent) * 2` steps two families per stop, which is
 * co-prime with five and so gives all four stops a different starting point. It
 * is deterministic rather than seeded, because a drop's colour has to survive a
 * remount — a fan is unmounted the moment it closes.
 *
 * ── What this replaces ──
 *
 * A seven-entry table solved against the Bravis hero sphere's radial profile at
 * matched luminance. It did what it was asked and the fan came out deep and
 * saturated, which is the wrong end of the reference for a set of satellites —
 * see the note at the top of `lib/palette.ts`.
 */
export function dropHue(parent: string, index: number): DropHue {
  const offset = (Number(parent) || 0) * 2;
  return PASTEL_FAMILIES[(offset + index) % PASTEL_FAMILIES.length];
}

