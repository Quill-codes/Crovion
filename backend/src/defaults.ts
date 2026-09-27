/**
 * The content the database is seeded with on first run.
 *
 * This is a *copy* of what `lib/satellites.ts` and the chain table in
 * `components/HeroCanvas.tsx` currently hold, and the duplication is deliberate:
 * the backend is a separate process with its own package and no import path into
 * the site, and the site keeps its own copy as the fallback it renders when this
 * service is not running. Two copies of the same starting values is the price of
 * either half working alone.
 *
 * After the first seed this file is inert — it is never re-applied, so editing it
 * does nothing to a database that already exists. `npm run reset` is what starts
 * over from here.
 *
 * What is *not* here, and is not editable from the admin, is geometry: every
 * drop's offset, radius and tint stay in the site's code. Those values are
 * collision-checked against their neighbours and pre-compensated for the
 * composite's tone mapping, and a text field is the wrong instrument for them.
 * A drop added here takes the next free slot on its parent's tuned arc.
 *
 * The contact stop's three drops now name the real address, number and studio
 * address. On the site those come from `lib/contact.ts`; here they are written
 * out, for the same reason everything else in this file is — the backend cannot
 * import across the package boundary. Change one and change the other.
 */
export interface DefaultDrop {
  id: string;
  mark: string;
  label: string;
  detail: string;
  /** `form` swaps the drop's detail line for the contact form. Exactly one exists. */
  kind: "detail" | "form";
}

export interface DefaultStop {
  key: string;
  line1: string;
  line2: string;
  drops: DefaultDrop[];
}

/**
 * How many drops each parent's arc has room for.
 *
 * Not a database column and not editable: it is a property of the offsets in
 * `lib/satellites.ts`, where each parent has a hand-placed arc whose positions
 * clear the parent's own body, each other, and the stops above and below. The
 * head has five because its radius is 2.8 against the numbered stops' 2.0, so its
 * arc is scaled out and has more room to distribute along.
 *
 * The admin refuses to add past this. Overshooting does not throw anywhere — the
 * site simply has no offset to place the extra drop at, so it would stack on top
 * of the last one.
 */
export const SLOT_CAP: Record<string, number> = {
  "00": 5,
  "01": 4,
  "02": 4,
  "03": 4,
};

export const DEFAULT_STOPS: DefaultStop[] = [
  {
    // The head of the chain. It has no number card, so no name of its own — its
    // share control is the OUR SERVICES button on its body.
    key: "00",
    line1: "",
    line2: "",
    drops: [
      {
        id: "00-prf",
        mark: "PRF",
        label: "Performance Marketing",
        detail: "Paid media bought against revenue, not impressions.",
        kind: "detail",
      },
      {
        id: "00-web",
        mark: "WEB",
        label: "Web Development",
        detail: "Sites that stay fast once real content lands on them.",
        kind: "detail",
      },
      {
        id: "00-smm",
        mark: "SMM",
        label: "Social Media Management",
        detail: "A calendar someone actually keeps, and replies that arrive same-day.",
        kind: "detail",
      },
      {
        id: "00-ecm",
        mark: "ECM",
        label: "E-commerce Management",
        detail: "Listings, stock and checkout run as one operation rather than three.",
        kind: "detail",
      },
      {
        id: "00-brd",
        mark: "BRD",
        label: "Branding",
        detail: "One mark, a palette and type that hold together everywhere.",
        kind: "detail",
      },
    ],
  },
  {
    key: "01",
    line1: "PORTFOLIO",
    line2: "",
    drops: [
      {
        id: "01-tst",
        mark: "TST",
        label: "Testimonials",
        detail: "What the last ten clients said, in their own words.",
        kind: "detail",
      },
      {
        id: "01-mta",
        mark: "MTA",
        label: "Meta Ads",
        detail: "Paid social bought against revenue, not impressions.",
        kind: "detail",
      },
      {
        id: "01-web",
        mark: "WEB",
        label: "Website",
        detail: "Sites that stay fast once real content lands on them.",
        kind: "detail",
      },
      {
        id: "01-brd",
        mark: "BRD",
        label: "Branding/Logo",
        detail: "One mark, a palette and type that hold together everywhere.",
        kind: "detail",
      },
    ],
  },
  {
    key: "02",
    line1: "ABOUT",
    line2: "US",
    drops: [
      {
        id: "02-mkt",
        mark: "MKT",
        label: "Market Study",
        detail: "Where the category is crowded, and where it is empty.",
        kind: "detail",
      },
      {
        id: "02-pos",
        mark: "POS",
        label: "Positioning",
        detail: "The one sentence everything else has to agree with.",
        kind: "detail",
      },
      {
        id: "02-aud",
        mark: "AUD",
        label: "Audience Insight",
        detail: "Who is actually buying, as opposed to who was meant to.",
        kind: "detail",
      },
      {
        id: "02-cmp",
        mark: "CMP",
        label: "Competitor Map",
        detail: "The field drawn to scale, including the parts nobody claims.",
        kind: "detail",
      },
    ],
  },
  {
    key: "03",
    line1: "CONTACT",
    line2: "US",
    drops: [
      {
        id: "03-frm",
        mark: "FRM",
        label: "Contact Form",
        detail:
          "Four fields and a send button. No account, no newsletter. Or find us at 118-B/3, First Floor, Shahpur Jat, New Delhi – 110049.",
        // The one drop that opens the lead form instead of a detail line.
        kind: "form",
      },
      {
        id: "03-eml",
        mark: "EML",
        label: "Email",
        detail:
          "contact@crovion.com — read by a person, answered inside one working day.",
        kind: "detail",
      },
      {
        id: "03-tel",
        mark: "TEL",
        label: "Phone Number",
        detail:
          "+91 82659 17894 — weekdays, 09:00 to 18:00, whichever timezone you are in.",
        kind: "detail",
      },
    ],
  },
];
