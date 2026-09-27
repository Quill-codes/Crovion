/**
 * The detail page behind every drop on a sphere's fan.
 *
 * One entry per first-layer drop. The share control on a drop opens its page;
 * that is the only thing that opens it, and it is the same affordance the chain
 * sphere's own share control uses one level up — see `SatelliteField`.
 *
 * ── Why the copy lives here and not in the backend ──
 *
 * `RemoteDrop` carries four short fields — `mark`, `label`, `detail`, `kind` —
 * and the admin has a form for each. A page is six blocks of body copy, and
 * putting it behind that API means a schema migration, six more form controls
 * and a validation story for a payload that can arrive malformed from a separate
 * process. The backend goes on owning what a drop is *called*; the repo owns what
 * its page *says*. The two join on `dropId`, which neither side renames.
 *
 * That split also keeps the pages buildable with no service running, which is
 * the same property `lib/content/store.ts` is careful to preserve for the chain.
 *
 * ── Geometry is not here either ──
 *
 * For the same reason it never crosses the content API: `offset` and `radius`
 * are solved against neighbouring bodies and the frame, and belong next to the
 * drop in `lib/satellites.ts`. What this file holds that is visual is the tint,
 * and only because a page's tint is a *page* decision — see the note there.
 */

import { CONTACT } from "@/lib/contact";

/** The four-stop gradient a `FluidBlob` is built from. */
export interface Tint {
  /** Saturated core that drifts inside the body. */
  inner: string;
  /** Mid-tone — the body colour. */
  mid: string;
  /** Warm tint blended into the rim; the shared stop across the whole set. */
  warm: string;
  /** Near-white grazing-angle rim. */
  rim: string;
}

/** One numbered step of "How it works". */
export interface DetailPhase {
  name: string;
  /** The bracketed timing, where the phase has one — "week 1", "ongoing". */
  when?: string;
  body: string;
}

export interface DetailPage {
  /** The drop this page belongs to, as keyed in `lib/satellites.ts`. */
  dropId: string;
  /** First URL segment. Derived from the parent sphere — see `SECTIONS`. */
  section: string;
  /** Second URL segment. Unique within its section. */
  slug: string;
  title: string;
  /** The one-line promise, set under the title. */
  promise: string;
  /** One paragraph of context. */
  hero: string;
  /** Three failure modes, stated plainly. */
  problems: string[];
  /** Five or six concrete work items. */
  runs: string[];
  /** Four numbered phases. */
  phases: DetailPhase[];
  /** Deliverables, as sentences rather than a bulleted inventory. */
  deliverables: string[];
  cta: { line: string; label: string };
  tint: Tint;
}

/**
 * Parent sphere → first URL segment.
 *
 * The number is what the sphere is keyed by everywhere else in the codebase —
 * it identifies the stop and is what the backend files its row under — but it
 * is not a URL anybody should have to read. This is the one place the two
 * vocabularies meet.
 */
export const SECTIONS: Record<string, string> = {
  "00": "services",
  "01": "work",
  "02": "about",
  "03": "contact",
};

/**
 * What a section is called in prose — the eyebrow above a page's title, and the
 * label on its way back to the chain.
 *
 * Not the sphere's own card copy, which the backend may have rewritten. This is
 * navigation: it has to say the same thing on every page in the section and on
 * a cold load with no backend, so it is fixed here.
 */
export const SECTION_LABELS: Record<string, string> = {
  services: "Our Services",
  work: "Portfolio",
  about: "About Us",
  contact: "Contact Us",
};

/* ── Tints ─────────────────────────────────────────────────────────────────
 *
 * The five services run a hue ramp inside one family: Performance at the
 * deepest violet through to Branding at warm pink-violet. Different enough to
 * orient, close enough that the set is obviously one brand.
 *
 * Every one keeps the chain's tonal *structure* — a mid-lightness core climbing
 * through a warm zone to a near-white rim — because that shared warm stop is
 * what makes differently-hued bodies read as samples of the same material. The
 * warm stop drifts from lilac to blush across the ramp rather than staying
 * fixed, which is a smaller departure than it sounds: at the pink end a lilac
 * warm sits *behind* the core in hue and flattens the body.
 *
 * These are authored values and are **not** pre-compensated for the composite's
 * tone mapping, unlike the chain's amber. They do not need to be: the whole
 * ramp is pale and low-saturation, which is the region where the ACES curve is
 * close to linear. The amber note in `HeroCanvas` explains where that stops
 * being true, and nothing here goes near it.
 */
const violetDeep: Tint = {
  inner: "#7C4DE0",
  mid: "#B394F2",
  warm: "#EBD3EE",
  rim: "#F6F1FF",
};

const violet: Tint = {
  inner: "#8C5FEA",
  mid: "#BFA3F5",
  warm: "#EED6EE",
  rim: "#F8F3FF",
};

const violetOrchid: Tint = {
  inner: "#9E63EC",
  mid: "#CBA6F3",
  warm: "#F1D8EC",
  rim: "#FAF4FE",
};

const orchid: Tint = {
  inner: "#B067E4",
  mid: "#D6A9EF",
  warm: "#F4DAEA",
  rim: "#FCF3FC",
};

const pinkViolet: Tint = {
  inner: "#C26BDC",
  mid: "#E0AEEA",
  warm: "#F7DDE6",
  rim: "#FDF2FA",
};

/* ── work · the rose ramp ────────────────────────────────────────────────
 *
 * 01 is rose on the chain, so its four pages are rose. The ramp runs
 * magenta-rose to a warm coral-rose — a shorter travel than the services'
 * violet-to-pink, because rose has less room before it turns either purple
 * (where it would read as a services page) or orange (where it would read as
 * a contact one). Four bodies inside that narrower band still separate,
 * because a reader only ever sees one at a time.
 */
const roseMagenta: Tint = {
  inner: "#DE5F9E",
  mid: "#F09FC4",
  warm: "#FAD7DE",
  rim: "#FEF2F7",
};

const rose: Tint = {
  inner: "#E8749F",
  mid: "#F4AAC0",
  warm: "#FBDBD4",
  rim: "#FFF4F8",
};

const roseWarm: Tint = {
  inner: "#EE8598",
  mid: "#F7B7B8",
  warm: "#FCE0CE",
  rim: "#FFF5F4",
};

const roseBlush: Tint = {
  inner: "#F29A94",
  mid: "#F9C6B6",
  warm: "#FCE6CE",
  rim: "#FFF6F1",
};

/* ── about · the orchid ramp ─────────────────────────────────────────────
 *
 * 02 sits between the head's violet and 03, and its pages inherit that
 * position: the ramp starts nearly violet and ends nearly pink, so the set
 * reads as the hinge of the chain rather than as a fifth colour family.
 */
const orchidViolet: Tint = {
  inner: "#A96BE2",
  mid: "#D2A7F1",
  warm: "#F1D8EA",
  rim: "#FBF3FD",
};

// 02's own chain tint, reused unchanged: the middle of a four-step ramp is the
// one slot where the parent's colour is the right answer rather than a lazy one.
const orchidMid: Tint = {
  inner: "#B96BD6",
  mid: "#DFA5EC",
  warm: "#F6D8E4",
  rim: "#FDF2FA",
};

const orchidPink: Tint = {
  inner: "#C86ACB",
  mid: "#E6A6E5",
  warm: "#F8DAE2",
  rim: "#FDF2F9",
};

const orchidMauve: Tint = {
  inner: "#D26FBE",
  mid: "#EDABDD",
  warm: "#FADCE1",
  rim: "#FEF3F8",
};

/* ── contact · the warm ramp, and why it is not the chain's amber ────────
 *
 * 03's own tint is the one set on the chain that is **pre-compensated for
 * the composite's tone mapping** — its hexes are the ACES curve inverted on
 * measured targets, and they are documented at length in `HeroCanvas` as
 * values you must not read as the colours you will see. Copying them here
 * would have been the obvious move and it is the wrong one twice over.
 *
 * First, this ramp does not need the compensation. The correction exists
 * because amber is the only saturated hue on the page and the curve flattened
 * it to mustard; these three are pale and low-saturation, which is the region
 * where ACES is close to linear — the same argument the services ramp above
 * rests on. Second, `DetailBlob` settles its body at 20% opacity against a
 * near-white page, so a hue tuned to survive a full-strength composite has
 * nothing to survive here.
 *
 * So this is a warm ramp in 03's family rather than 03's own four hexes:
 * apricot through peach to sand, separated on *value* more than hue. That is
 * the same differentiation the removed 04-06 stops used, and it is what keeps
 * three warm bodies apart without pushing any of them into a saturation the
 * tone mapping would then have an opinion about.
 */
const amberSoft: Tint = {
  inner: "#D07F2A",
  mid: "#EAAE64",
  warm: "#F6D796",
  rim: "#FFF2DC",
};

const apricot: Tint = {
  inner: "#D98C3E",
  mid: "#F0BA7C",
  warm: "#F9DEAA",
  rim: "#FFF5E5",
};

const sand: Tint = {
  inner: "#C8904A",
  mid: "#E5C289",
  warm: "#F5E1B6",
  rim: "#FFF7EA",
};

/* ── The pages ────────────────────────────────────────────────────────────
 *
 * Sixteen — one per drop, so every drop on the chain now carries a share
 * control. That completeness is the point rather than a coincidence: the fan
 * reads as a set of names now that the detail line is gone, and a name with no
 * page behind it is a dead end the reader has no way to see coming.
 *
 * Ordered by section, and inside a section by the drop's own order on the fan,
 * so this file reads in the order a visitor meets them.
 *
 * Voice rules, carried from the sphere blurbs and holding for anything added
 * here: short declarative sentences; name the failure mode before naming the
 * fix; no invented numbers and no invented case studies. The last clause does
 * real work in the `work` section, where a fabricated result would stop reading
 * as placeholder copy and start reading as a claim — so those four pages
 * describe method, which is true whatever logos eventually sit on them.
 */
export const DETAIL_PAGES: DetailPage[] = [
  {
    dropId: "00-prf",
    section: "services",
    slug: "performance-marketing",
    title: "Performance Marketing",
    promise: "Paid media bought against revenue, not impressions.",
    hero:
      "Most ad accounts look busy and spend fine. The problem shows up one layer down: the metric on the dashboard isn't the metric that pays salaries. We run Meta and Google against contribution margin, and we'll tell you when a channel isn't worth its budget.",
    problems: [
      "ROAS reported by the platform double-counts. Meta and Google both claim the same order.",
      "Creative fatigue burns budget quietly for two weeks before the reporting shows it.",
      "The account gets restructured every time someone new touches it, so nothing accumulates learning.",
    ],
    runs: [
      "Meta: full-funnel structure — prospecting, retargeting, and a broad-signal campaign that isn't fighting the others for the same audience",
      "Google: Search on intent terms, Shopping on feed quality, PMax only where it isn't cannibalising brand",
      "Creative testing on a fixed cadence — new hooks shipped weekly, not when performance drops",
      "Landing page and offer testing, because the ad is rarely the constraint",
      "Blended-ROAS and MER tracking against your actual COGS",
      "Server-side tracking and CAPI setup so signal survives iOS and cookie loss",
    ],
    phases: [
      {
        name: "Audit",
        when: "week 1",
        body: "Account structure, tracking accuracy, unit economics. You get the findings whether or not you hire us.",
      },
      {
        name: "Rebuild",
        when: "weeks 1–2",
        body: "Clean structure, correct conversion events, a creative brief for the first test batch.",
      },
      {
        name: "Scale",
        when: "ongoing",
        body: "Budget moves toward what's profitable, weekly creative refresh, bid and audience changes logged so we know what caused what.",
      },
      {
        name: "Report",
        when: "monthly",
        body: "Spend, blended ROAS, contribution margin, and what we're changing next month.",
      },
    ],
    deliverables: [
      "Live dashboard with blended numbers.",
      "Weekly creative batch.",
      "Monthly review call with the actual decisions written down.",
      "Full account ownership stays with you.",
    ],
    cta: {
      line: "Send us your ad account. You'll get the audit back in a week.",
      label: "Send the account",
    },
    tint: violetDeep,
  },
  {
    dropId: "00-web",
    section: "services",
    slug: "web-development",
    title: "Web Development",
    promise: "Sites that stay fast once real content lands on them.",
    hero:
      "Every site is fast on launch day. The test is month six — after forty products, a blog, three tracking scripts and a review widget. We build for that state, not the demo.",
    problems: [
      "The Lighthouse score was 98 at handover and 41 once the marketing team started using the site.",
      "Design was signed off in Figma with no plan for what happens when a product title runs to three lines.",
      "The developer left and nobody can edit a heading without opening a code editor.",
    ],
    runs: [
      "Next.js builds with real image, font and script discipline",
      "Shopify and headless commerce front-ends",
      "CMS setup your team can actually use — editable blocks, not a wall of fields",
      "Core Web Vitals held to target on the templates that carry traffic, measured with real user data",
      "Analytics, consent and conversion tracking wired in at build time",
      "Handover with documentation, so you aren't locked to us",
    ],
    phases: [
      {
        name: "Scope",
        body: "Page inventory, what each template must do, what content will realistically be dumped into it.",
      },
      {
        name: "Design",
        body: "Mobile-first, edge cases drawn — long titles, empty states, a six-item cart — before anything is built.",
      },
      {
        name: "Build",
        body: "Component library first, pages assembled from it. Staging link from week one.",
      },
      {
        name: "Launch & hold",
        body: "Redirects mapped, speed budget locked, 30 days of post-launch fixes included.",
      },
    ],
    deliverables: [
      "Source code in your repo.",
      "A component library you can extend.",
      "Speed budget documented per template.",
      "Redirect map, and a recorded training session.",
    ],
    cta: {
      line: "Send your current URL. We'll show you what's costing you load time.",
      label: "Send the URL",
    },
    tint: violet,
  },
  {
    dropId: "00-smm",
    section: "services",
    slug: "social-media-management",
    title: "Social Media Management",
    promise: "A calendar someone actually keeps, and replies that arrive same-day.",
    hero:
      "Most social contracts die the same way: month one is a beautiful grid, month four is reposted product shots and unanswered DMs. The work is operational, not creative. We staff it that way.",
    problems: [
      "The calendar is approved on the 28th and posted on the 3rd, so nothing is topical.",
      "Comments and DMs sit for four days. That's where the buying intent was.",
      "Every post looks like an ad, so nothing gets saved or shared.",
    ],
    runs: [
      "Monthly content calendar, approved a week ahead — not the day before",
      "Short-form video as the default format: hooks, edits, captions, thumbnails",
      "Community management with a same-day reply window on weekdays",
      "Formats that earn saves — teardowns, how-we-did-it, behind the build — mixed with product",
      "Organic-to-paid pipeline: whatever performs organically gets tested as an ad",
      "Monthly report on saves, shares and profile-to-site clicks, not follower count",
    ],
    phases: [
      {
        name: "Audit & positioning",
        body: "What your account is actually for, and which three content pillars serve it.",
      },
      {
        name: "Pilot month",
        body: "A range of formats shipped fast to find what your audience responds to.",
      },
      {
        name: "Lock the cadence",
        body: "The winning formats become the recurring calendar; the rest get cut.",
      },
      {
        name: "Compound",
        body: "Top organic posts move into paid, and the paid learnings feed the next calendar.",
      },
    ],
    deliverables: [
      "Calendar in a shared doc.",
      "Edited assets delivered ahead of schedule.",
      "Inbox handled on weekdays.",
      "One monthly report that fits on a page.",
    ],
    cta: {
      line: "Tell us your handle. We'll send back three post ideas we'd run first.",
      label: "Send the handle",
    },
    tint: violetOrchid,
  },
  {
    dropId: "00-ecm",
    section: "services",
    slug: "ecommerce-management",
    title: "E-commerce Management",
    promise: "Listings, stock and checkout run as one operation rather than three.",
    hero:
      "The store, the marketplace listings and the ad account are usually three different people's problems. That's why the bestseller goes out of stock mid-campaign and nobody notices until the ROAS drops. We run them as one loop.",
    problems: [
      "Ads keep spending on a SKU that went out of stock on Tuesday.",
      "Amazon, Flipkart and the D2C site show three different prices and two different titles.",
      "Checkout drops most of its carts and nobody has looked at the funnel in a year.",
    ],
    runs: [
      "Catalog and feed management across Shopify, Amazon and Flipkart — one source of truth",
      "Listing quality: titles, A+ content, images sized for each surface, correct category mapping",
      "Inventory-aware ad rules so spend pauses when stock does",
      "Checkout and PDP conversion work — form fields, payment options, COD handling, shipping clarity",
      "Returns and RTO analysis, since RTO is where D2C margin actually goes",
      "Post-purchase: review capture, repeat-purchase flows, subscription where the category supports it",
    ],
    phases: [
      {
        name: "Map",
        body: "Every SKU, every channel, current price, title and stock state. Usually the first surprise.",
      },
      {
        name: "Fix the leaks",
        body: "Broken listings, feed errors, checkout friction, in that order.",
      },
      {
        name: "Connect",
        body: "Inventory signals wired into the ad account and the site.",
      },
      {
        name: "Grow",
        body: "Expand the catalog on the channels that earn it, cut the ones that don't.",
      },
    ],
    deliverables: [
      "Single catalog sheet everyone works from.",
      "Feed health monitoring.",
      "Monthly view of contribution margin by SKU and by channel, including RTO.",
    ],
    cta: {
      line: "Share a read-only view of your store. We'll come back with the top five leaks.",
      label: "Share the store",
    },
    tint: orchid,
  },
  {
    dropId: "00-brd",
    section: "services",
    slug: "branding",
    title: "Branding",
    promise: "One mark, a palette and type that hold together everywhere.",
    hero:
      "A logo is the cheap part. The expensive part is what happens when eleven people need to make assets and there's no rule for any of it. We build the system and the file structure that keeps it intact.",
    problems: [
      "The logo has four unofficial versions in circulation and two of them are stretched.",
      "Packaging, the site and Instagram look like three different companies.",
      "Every new designer re-picks the fonts because nobody wrote down which ones.",
    ],
    runs: [
      "Positioning first — who it's for, what it replaces, what it refuses to be",
      "Wordmark, monogram and lockups sized for favicon through hoarding",
      "Colour system with accessible contrast pairs, not just a hex list",
      "Type scale and pairing, with fallbacks that actually exist on the web",
      "Packaging and label design where the category needs it",
      "Guidelines as a working file — templates and components, not a 60-page PDF nobody opens",
    ],
    phases: [
      {
        name: "Discovery",
        body: "Category audit, competitor shelf, what your customers already say about you.",
      },
      {
        name: "Direction",
        body: "Two territories, presented in context — packshot, feed, site header — rather than on a white slide.",
      },
      {
        name: "Build",
        body: "The chosen route developed into a full system.",
      },
      {
        name: "Roll out",
        body: "Files, templates, and a session with whoever will use them daily.",
      },
    ],
    deliverables: [
      "Logo suite in every needed format.",
      "Colour and type tokens ready for code.",
      "Social and packaging templates.",
      "A guidelines doc your team will actually open.",
    ],
    cta: {
      line: "Show us what you have now. We'll tell you if you need a rebrand or just a rulebook.",
      label: "Show us the files",
    },
    tint: pinkViolet,
  },

  /* ── 01 · Portfolio ──────────────────────────────────────────────────
   *
   * The same four blocks as the services set, in a different register. 01 is
   * the record of work and 00 is what we sell, so where the two overlap by
   * name — `01-web` against `00-web`, `01-brd` against `00-brd` — the pages
   * are deliberately not paraphrases of each other: the services page argues
   * for buying the thing, this one describes how it is actually run and what
   * you are handed at the end.
   *
   * No client names, no case studies and no results. The drops carry dummy
   * copy (see the head of `lib/satellites.ts`) and a portfolio page is the
   * one place where inventing a number stops being a placeholder and starts
   * being a claim. Everything below is method, which is true regardless of
   * which logos eventually sit on it.
   */
  {
    dropId: "01-tst",
    section: "work",
    slug: "testimonials",
    title: "Testimonials",
    promise: "What the last ten clients said, in their own words.",
    hero:
      "Proof is the cheapest thing an agency can produce and the thing most of them skip. The reason is timing: the useful sentence exists for about two weeks after something works, and nobody is holding a recorder then. We collect it on a schedule instead.",
    problems: [
      "The testimonials page is five unattributed sentences, so a reader discounts all of them.",
      "The happiest client is asked for a quote six months late, when they no longer remember what changed.",
      "Praise gets collected and then filed on a page nothing links to.",
    ],
    runs: [
      "Recorded interviews with clients who agreed to be named — the quote comes out of a conversation, not a form",
      "A written case note per engagement: the brief, what changed, and what the client says happened",
      "Video cutdowns sized for the site, the deck and social, from the same recording",
      "Review capture placed at the point in the relationship where people are actually pleased",
      "Written permission on file before anything is published",
      "Placement discipline — the right proof beside the claim it supports, not one page holding all of it",
    ],
    phases: [
      {
        name: "Ask",
        when: "week 1",
        body: "Who to approach, and what we would want each of them to be able to say.",
      },
      {
        name: "Interview",
        body: "A short recorded call run off prompts rather than a script. The useful line is never the prepared one.",
      },
      {
        name: "Edit",
        body: "Cut to the quote, then cleared with the client before it exists anywhere public.",
      },
      {
        name: "Place",
        body: "Live on the pages making the claim it backs, and in the deck.",
      },
    ],
    deliverables: [
      "Approved quotes carrying a name, a role and a company.",
      "Video and stills wherever the client agreed to appear.",
      "One case note per engagement, in a single format.",
      "Signed permission for every asset, kept on file.",
    ],
    cta: {
      line: "Name the client you would most want a reader to hear from. We'll draft the ask.",
      label: "Draft the ask",
    },
    tint: roseMagenta,
  },
  {
    dropId: "01-mta",
    section: "work",
    slug: "meta-ads",
    title: "Meta Ads",
    promise: "Paid social bought against revenue, not impressions.",
    hero:
      "Meta takes the largest share of most budgets and gets the least scrutiny. The account is rarely the problem. The reporting layer between the account and the P&L is, and it is where we start.",
    problems: [
      "Platform-reported ROAS counts an order the P&L only counts once.",
      "One creative carries the whole account, and there is nothing queued behind it when it fatigues.",
      "The structure is rebuilt every quarter, so the delivery system relearns from zero each time.",
    ],
    runs: [
      "Prospecting, retargeting and a broad-signal campaign kept out of each other's auctions",
      "Creative shipped to a schedule — hooks, angles and formats tested in batches rather than one at a time",
      "Conversions API and server-side events, so signal survives the browser",
      "Offer and landing-page tests, because the ad is usually not the constraint",
      "Blended MER read against your COGS instead of the dashboard's number",
      "A change log, so every shift in performance has a cause written next to it",
    ],
    phases: [
      {
        name: "Audit",
        when: "week 1",
        body: "Structure, tracking accuracy and unit economics. You keep the findings either way.",
      },
      {
        name: "Rebuild",
        when: "weeks 1–2",
        body: "Clean campaign structure, correct events, and a brief for the first creative batch.",
      },
      {
        name: "Test",
        when: "ongoing",
        body: "Budget follows contribution margin. Creative refreshes weekly whether or not performance has dropped.",
      },
      {
        name: "Report",
        when: "monthly",
        body: "Spend, blended return, margin, and the decisions taken for next month.",
      },
    ],
    deliverables: [
      "A dashboard showing blended numbers rather than platform ones.",
      "A weekly creative batch.",
      "The change log, readable by someone who was not on the call.",
      "Account ownership stays with you throughout.",
    ],
    cta: {
      line: "Send read access to the ad account. You'll have the audit back in a week.",
      label: "Send the account",
    },
    tint: rose,
  },
  {
    dropId: "01-web",
    section: "work",
    slug: "website",
    title: "Website",
    promise: "Sites that stay fast once real content lands on them.",
    hero:
      "This is the build side of the portfolio — what a site we ship is made of, and the state it is in when we hand it over. Every site is fast on launch day. The one that matters is the one still fast in month six.",
    problems: [
      "The site was quick at handover and slow once the marketing team started using it.",
      "Nobody drew the three-line product title, the empty state or the six-item cart, so the design broke on real content.",
      "Changing a heading needs a developer, so the site goes stale between redesigns.",
    ],
    runs: [
      "Next.js and Shopify front-ends, built component-first",
      "Every template drawn against its worst realistic content before anything is coded",
      "A CMS the marketing team can use without a handbook",
      "A speed budget per template, held against real user data rather than lab runs",
      "Analytics, consent and conversion tracking wired in at build time",
      "Repo, documentation and a recorded walkthrough at handover",
    ],
    phases: [
      {
        name: "Brief",
        body: "What the site has to do, and which templates carry the traffic that pays for it.",
      },
      {
        name: "Prototype",
        body: "A staging link inside the first week, so the argument is about a real page rather than a picture of one.",
      },
      {
        name: "Build",
        body: "Component library first, pages assembled out of it.",
      },
      {
        name: "Handover",
        body: "Redirects mapped, speed budget locked, and thirty days of fixes after launch.",
      },
    ],
    deliverables: [
      "Source in your repository, not ours.",
      "A component library your next developer can extend.",
      "The speed budget written down per template.",
      "A redirect map and a recorded training session.",
    ],
    cta: {
      line: "Send the URL you have now. We'll show you where the load time is going.",
      label: "Send the URL",
    },
    tint: roseWarm,
  },
  {
    dropId: "01-brd",
    section: "work",
    slug: "branding-logo",
    title: "Branding/Logo",
    promise: "One mark, a palette and type that hold together everywhere.",
    hero:
      "Identity work is judged on the day it is presented and lived with for years afterwards. What decides the second part is not the mark — it is whether anyone can produce a correct asset without asking the designer who made it.",
    problems: [
      "Four unofficial versions of the logo are in circulation and two of them are stretched.",
      "Packaging, the site and the social feed look like three different companies.",
      "Every new designer re-picks the fonts, because nobody wrote down which ones.",
    ],
    runs: [
      "Positioning first — who it is for, what it replaces, what it refuses to be",
      "Wordmark, monogram and lockups sized from favicon to hoarding",
      "A colour system with accessible pairs, rather than a list of hex values",
      "A type scale with fallbacks that actually exist on the web",
      "Packaging and label artwork where the category needs it",
      "Guidelines as a working file — templates and components, not a PDF nobody opens",
    ],
    phases: [
      {
        name: "Discovery",
        body: "Category audit, the competitor shelf, and what customers already say about you unprompted.",
      },
      {
        name: "Direction",
        body: "Two territories shown in context — packshot, feed, site header — rather than on a white slide.",
      },
      {
        name: "Build",
        body: "The chosen route developed into a full system, edge cases included.",
      },
      {
        name: "Roll out",
        body: "Files, templates, and a session with whoever will be using them daily.",
      },
    ],
    deliverables: [
      "The logo suite in every format you will be asked for.",
      "Colour and type tokens ready to drop into code.",
      "Social and packaging templates.",
      "A guidelines file your team will actually open.",
    ],
    cta: {
      line: "Show us the files in circulation now. We'll say whether you need a rebrand or a rulebook.",
      label: "Show us the files",
    },
    tint: roseBlush,
  },

  /* ── 02 · About Us ───────────────────────────────────────────────────
   *
   * The strategy set, and the only section whose four pages are stages of one
   * argument rather than four separate offers: the market study finds the
   * space, the audience work says who is standing in it, the competitor map
   * says who else claims it, and positioning is the sentence that comes out
   * the other end. They are ordered on the fan accordingly, and each page's
   * copy assumes the reader may arrive at any of them first.
   */
  {
    dropId: "02-mkt",
    section: "about",
    slug: "market-study",
    title: "Market Study",
    promise: "Where the category is crowded, and where it is empty.",
    hero:
      "Most category research is a deck of things everyone in the room already believed, with charts attached. A study earns its cost only when it can name a place to stand that is not currently occupied — and say plainly when there isn't one.",
    problems: [
      "The research confirms the plan that was already made, because that is what it was scoped to do.",
      "Category size is quoted from a report nobody has read past the summary.",
      "The findings never reach the people writing the ads, so nothing downstream changes.",
    ],
    runs: [
      "Demand mapping: what people search, ask and complain about, in their own words",
      "Category structure — the segments that actually behave differently, not the ones the industry names",
      "Price and margin ladder across the shelf, including the tiers nobody occupies",
      "Distribution reality: where the category is genuinely bought, channel by channel",
      "Regulatory and seasonal constraints that decide what can be claimed and when",
      "A written point of view at the end, with the gaps we would not chase and why",
    ],
    phases: [
      {
        name: "Frame",
        when: "week 1",
        body: "The three questions the study has to answer. Everything outside them is out of scope in writing.",
      },
      {
        name: "Gather",
        body: "Search and social demand, the live shelf, pricing, and conversations with people who buy the category.",
      },
      {
        name: "Cut",
        body: "Findings reduced to what changes a decision. The rest is kept in an appendix rather than presented.",
      },
      {
        name: "Hand over",
        body: "A working session with whoever will act on it — media, product and copy in the same room.",
      },
    ],
    deliverables: [
      "A short written study, structured around decisions rather than chapters.",
      "The demand and pricing data as a sheet you keep.",
      "A one-page summary that survives being forwarded.",
      "The list of opportunities we ruled out, with the reasoning.",
    ],
    cta: {
      line: "Tell us the category and the decision waiting on it. We'll scope the study to that.",
      label: "Scope the study",
    },
    tint: orchidViolet,
  },
  {
    dropId: "02-pos",
    section: "about",
    slug: "positioning",
    title: "Positioning",
    promise: "The one sentence everything else has to agree with.",
    hero:
      "Positioning is not a tagline and it is not a mission. It is the sentence that makes some work obviously right and other work obviously wrong — and if it never rules anything out, it is not doing the job.",
    problems: [
      "The statement is true of every competitor, so it decides nothing.",
      "Three teams are each running a different implicit position, and none of them know it.",
      "It was agreed in a workshop and never written anywhere the copywriter would find it.",
    ],
    runs: [
      "The frame of reference: what a customer is actually choosing between, which is often not your category",
      "The point of difference, stated so that a competitor could not print it",
      "The reasons to believe it, checked against what you can actually evidence",
      "What the position rules out — the segments, claims and channels it costs you",
      "Message hierarchy for the site, the deck and paid media, all derived from one line",
      "A test: the position read to people who buy the category, to see whether it survives contact",
    ],
    phases: [
      {
        name: "Input",
        body: "The market study, the audience work and the competitor map, or the equivalent of them from your side.",
      },
      {
        name: "Draft",
        body: "Two or three candidate positions, each written with the trade-off it imposes stated next to it.",
      },
      {
        name: "Pressure-test",
        body: "Each candidate run against real messaging and real objections, not against a whiteboard.",
      },
      {
        name: "Commit",
        body: "One sentence, signed off, and the message hierarchy built underneath it.",
      },
    ],
    deliverables: [
      "The positioning statement, on one page.",
      "The message hierarchy the rest of the work is written from.",
      "The explicit list of what this position gives up.",
      "Rewritten site and deck headlines, so it lands somewhere immediately.",
    ],
    cta: {
      line: "Send your current statement. We'll tell you what it rules out, if anything.",
      label: "Send the statement",
    },
    tint: orchidMid,
  },
  {
    dropId: "02-aud",
    section: "about",
    slug: "audience-insight",
    title: "Audience Insight",
    promise: "Who is actually buying, as opposed to who was meant to.",
    hero:
      "Almost every brand has a target customer and a real one, and they are rarely the same person. The gap is expensive: it is why the creative tests badly, why the site converts a different segment than the ads chase, and why retention looks unexplainable.",
    problems: [
      "The persona has a name, a stock photo and no purchase behaviour attached to it.",
      "The best-performing ad speaks to a segment nobody has approved on paper.",
      "Nobody has spoken to a customer who churned, so the reason is a guess.",
    ],
    runs: [
      "Purchase and repeat data cut by segment, before any research is commissioned",
      "Interviews with recent buyers, and — more usefully — with people who nearly bought",
      "Review and support-ticket mining, which is the cheapest honest source you already own",
      "Jobs-to-be-done framing: what the purchase is being hired to do",
      "The objection list, ranked by how often it actually kills a sale",
      "Segment definitions written so media and creative can both target them",
    ],
    phases: [
      {
        name: "Look at the data",
        body: "Who buys, who repeats, who returns. Usually the first correction to the persona.",
      },
      {
        name: "Talk to people",
        body: "A short run of interviews across buyers, near-buyers and churned customers.",
      },
      {
        name: "Synthesise",
        body: "Segments defined by behaviour and objection, not by age bracket.",
      },
      {
        name: "Apply",
        body: "The segments handed to media as targeting and to creative as briefs, in the same week.",
      },
    ],
    deliverables: [
      "Segment definitions written in language a media buyer can use.",
      "The ranked objection list, with the evidence behind each one.",
      "Verbatim quotes, which are also the best source of headlines you have.",
      "A note on who to stop chasing.",
    ],
    cta: {
      line: "Send your current persona doc and a month of order data. We'll show you the gap.",
      label: "Send the persona",
    },
    tint: orchidPink,
  },
  {
    dropId: "02-cmp",
    section: "about",
    slug: "competitor-map",
    title: "Competitor Map",
    promise: "The field drawn to scale, including the parts nobody claims.",
    hero:
      "A competitor deck is usually a screenshot of five homepages. A map is different: it places everyone on the axes customers actually decide along, which is what makes the empty space on it visible — and the empty space is the entire point of drawing it.",
    problems: [
      "The axes were chosen because they make you look good, so the map has no diagnostic value.",
      "It lists the competitors you think about, not the ones customers compare you against.",
      "It was drawn once, and the field has moved since.",
    ],
    runs: [
      "The real consideration set, taken from customers rather than from the industry's own list",
      "Axes derived from purchase criteria, chosen before anyone is plotted on them",
      "Messaging teardown: the claim each player leads with, and what they can evidence",
      "Price, offer and guarantee compared on like terms",
      "Paid and organic footprint — where each one is actually visible, and what it costs them",
      "The white space named, with an honest note on why it may be empty for a good reason",
    ],
    phases: [
      {
        name: "Define the field",
        body: "Who customers say they considered. This is where the list usually changes.",
      },
      {
        name: "Choose the axes",
        body: "The two criteria that decide most purchases, fixed before plotting so the map cannot be flattered.",
      },
      {
        name: "Plot and read",
        body: "Everyone placed on the same evidence, and the gaps read off the result.",
      },
      {
        name: "Refresh",
        body: "Re-drawn on a set cadence, because a map from last year is a map of last year.",
      },
    ],
    deliverables: [
      "The map itself, as an editable file rather than a flat image.",
      "A one-page teardown per significant competitor.",
      "The comparison sheet behind the plot, so anyone can check the placement.",
      "A short note on which gap is worth taking and which is empty for a reason.",
    ],
    cta: {
      line: "Name the three you think you compete with. We'll tell you who your customers named.",
      label: "Name the three",
    },
    tint: orchidMauve,
  },

  /* ── 03 · Contact Us ─────────────────────────────────────────────────
   *
   * Three channels, three pages, and the shortest copy in the file. These are
   * not offers, so the blocks carry what an offer page would spend on
   * persuasion: what actually happens when you use this channel, and how long
   * it takes. A contact page that oversells is a contact page nobody trusts.
   *
   * `03-frm` is the drop whose `kind` is `"form"`. It keeps its two controls
   * for the reason `SatelliteField` documents — the form button opens the
   * short form on the drop, and the share control opens this page — and this
   * page is the long version of the same conversation.
   */
  {
    dropId: "03-frm",
    section: "contact",
    slug: "contact-form",
    title: "Contact Form",
    promise: "Four fields and a send button. No account, no newsletter.",
    hero:
      "The form on the sphere is deliberately short, because a long form at first contact is a filter that removes the wrong people. This page is the same conversation with room to say more — and the same promise about what happens to it afterwards.",
    problems: [
      "The enquiry form asks for company size and budget band before it has earned either.",
      "Submitting it subscribes you to something you did not ask for.",
      "The reply is an automated acknowledgement and then nothing for a fortnight.",
    ],
    runs: [
      "Name, email, and what you are trying to do. That is the whole requirement",
      "Anything else you want to add is optional and stays optional",
      "It goes to a person's inbox, not to a queue with a ticket number",
      "No mailing list, no drip sequence, no retargeting pixel fired on submit",
      "One reply inside a working day, from whoever would actually run the work",
      `Not a form person? ${CONTACT.email}, ${CONTACT.phone}, or ${CONTACT.addressLine}`,
      "A no is a real answer here — if it is not a fit we will say so rather than book a call",
    ],
    phases: [
      {
        name: "You send it",
        body: "Four fields. Nothing is required beyond what we need to reply usefully.",
      },
      {
        name: "We read it",
        when: "same day",
        body: "By a person. If a question would unblock a better answer, that is what comes back first.",
      },
      {
        name: "We reply",
        when: "one working day",
        body: "With a view, not a calendar link. The call comes after there is something to discuss.",
      },
      {
        name: "Or we don't",
        body: "If it is outside what we do, you get a straight answer and, where we have one, a pointer elsewhere.",
      },
    ],
    deliverables: [
      "A reply from a named person inside one working day.",
      "Your details used to answer you and for nothing else.",
      "No subscription of any kind attached to sending it.",
    ],
    cta: {
      line: "Tell us what you are trying to do. Two sentences is enough to start.",
      label: "Send the brief",
    },
    tint: amberSoft,
  },
  {
    dropId: "03-eml",
    section: "contact",
    slug: "email",
    title: "Email",
    promise: `${CONTACT.email} — read by a person, answered inside one working day.`,
    hero:
      "Email is the channel we are best at, and the one we make the firmest promise about. It is also the right one for anything with an attachment, a URL or a question that needs thinking about before it is answered.",
    problems: [
      "The address on the site is a black hole and everyone knows it.",
      "The reply arrives from a shared alias with no name on it, so there is nobody to follow up with.",
      "A technical question gets answered by someone who has to relay every detail to someone else.",
    ],
    runs: [
      `${CONTACT.email}, monitored on weekdays`,
      "A reply inside one working day, from a person who signs their name",
      "Account access, URLs and files are fine to send — that is what this channel is for",
      "Questions that need a specialist get routed once, not relayed repeatedly",
      "Threads stay with the same person rather than being reassigned mid-conversation",
      "Nothing sent to us is added to a list",
    ],
    phases: [
      {
        name: "You write",
        body: "As much or as little detail as you have. Links and files are welcome.",
      },
      {
        name: "It reaches a person",
        when: "same day",
        body: "Weekdays. There is no ticketing layer between you and whoever answers.",
      },
      {
        name: "You get an answer",
        when: "one working day",
        body: "An actual answer where the question has one, and a clear next step where it doesn't.",
      },
      {
        name: "It stays with them",
        body: "The same person carries the thread through, including into the work if it becomes work.",
      },
    ],
    deliverables: [
      `A named reply from ${CONTACT.email} inside one working day.`,
      "One thread, one person, start to finish.",
      "Your files and access treated as confidential by default.",
    ],
    cta: {
      line: "Write to us with whatever you have. A URL and a sentence is a fine start.",
      label: "Write to us",
    },
    tint: apricot,
  },
  {
    dropId: "03-tel",
    section: "contact",
    slug: "phone",
    title: "Phone Number",
    promise: `${CONTACT.phone} — weekdays, 09:00 to 18:00, whichever timezone you are in.`,
    hero:
      "Some things are faster said than typed. The phone is for those — a scoping question, a decision that has stalled, or a conversation that has been going round in email for three days. It is not a gate you have to pass to reach anyone.",
    problems: [
      "The number rings a switchboard that takes a message and passes it on.",
      "The only way to speak to anyone is to book a slot two weeks out.",
      "The call happens and nothing from it is ever written down.",
    ],
    runs: [
      `${CONTACT.phone}, on weekday hours stated honestly — outside them you get a callback rather than a queue`,
      "No booking required for a short question",
      "A scheduled call where the subject deserves preparation, with an agenda sent first",
      "Whoever would run the work is on the call, not only whoever sold it",
      "A written summary afterwards, so decisions survive the call",
      "No call is required before you can get a proposal",
    ],
    phases: [
      {
        name: "You call",
        body: `${CONTACT.phone}, weekdays 09:00 to 18:00. Short questions do not need an appointment.`,
      },
      {
        name: "Or we call you",
        body: "Outside hours, or where the topic wants preparation, we agree a time and send an agenda.",
      },
      {
        name: "We talk",
        body: "With the person who would do the work in the room.",
      },
      {
        name: "It gets written down",
        body: "A short summary by email, so nothing agreed on a call lives only in memory.",
      },
    ],
    deliverables: [
      "A conversation with someone who can answer, not take a message.",
      "An agenda in advance for anything scheduled.",
      "A written summary of what was decided.",
    ],
    cta: {
      line: "Prefer to talk? Send a time that suits you and we'll call.",
      label: "Send a time",
    },
    tint: sand,
  },
];

/**
 * Every page as a `{ section, slug }` pair, for `generateStaticParams`.
 *
 * Derived rather than listed a second time: the route enumerates exactly what
 * this file holds, so a page added here is a page that prerenders, with no
 * second edit that can be forgotten.
 */
export function detailParams(): { section: string; slug: string }[] {
  return DETAIL_PAGES.map(({ section, slug }) => ({ section, slug }));
}

/** The page at a URL, or `undefined` if that pair was never authored. */
export function findDetailPage(
  section: string,
  slug: string
): DetailPage | undefined {
  return DETAIL_PAGES.find((p) => p.section === section && p.slug === slug);
}

/**
 * The href for a drop's page, or `null` where none is written yet.
 *
 * `null` is the signal the fan reads to decide whether that drop carries a
 * share control at all — a button that opens nothing is worse than no button.
 * Every drop currently in `lib/satellites.ts` has a page, so nothing returns
 * `null` today; the branch stays because adding a drop is one edit and writing
 * its page is another, and the gap between them should be a missing control
 * rather than a 404.
 */
export function detailHref(dropId: string): string | null {
  const page = DETAIL_PAGES.find((p) => p.dropId === dropId);
  return page ? `/${page.section}/${page.slug}` : null;
}
