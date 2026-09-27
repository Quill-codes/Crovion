# Crovion — Drop Detail Pages

**Status:** plan awaiting approval. No code written.
**Date:** 2026-08-25

Remove the third level of the sphere tree, and give every second-level drop a
page of its own that its share button opens.

---

## 1. What exists today

The tree is three deep.

| Level | What it is | Where it lives |
| --- | --- | --- |
| Chain sphere | The head (`"00"`, OUR SERVICES) plus `01` PORTFOLIO, `02` ABOUT US, `03` CONTACT US | `components/HeroCanvas.tsx`, the `chain` memo |
| **First layer of drops** | The fan a chain sphere's share button opens. 16 of them. | `lib/satellites.ts`, `SATELLITES` |
| **Second layer of drops** | Each drop's own `children` fan, opened by that drop's share button. 40 of them. | `lib/satellites.ts`, `SatelliteNode.children` |

The renderer is one recursive component. `SatelliteField` → `DropFan` → `SatelliteDrop`,
and a drop with `children` mounts another `DropFan` inside its own blob. Depth is
carried as a prop and only two things read it: float speed, and the `Html`
z-index band.

Counts per parent, first layer:

- `00` — Performance Marketing, Web Development, Social Media Management, E-commerce Management, Branding (**5**)
- `01` — Testimonials, Meta Ads, Website, Branding/Logo (**4**)
- `02` — Market Study, Positioning, Audience Insight, Competitor Map (**4**)
- `03` — Contact Form, Email, Phone Number (**3**)

**16 first-layer drops → 16 pages.**

---

## 2. Decisions taken

1. **The second layer goes away entirely** — under all four chain spheres, not
   just services. One consistent rule, and the recursion comes out of the
   renderer rather than being left in place unused.
2. **Every first-layer drop gets a page.** Its share button opens that page.
3. **Real Next routes with a matched entrance**, not an overlay and not a
   persistent cross-route canvas. Deep links have to work cold, because the
   share button is the thing that produces them.

## 3. Open item, flagged not blocked

Copy exists for five drops — the five services, supplied in full. The other
eleven have no copy beyond their one-line `detail`. Phase 4 drafts them in the
same voice and puts them in front of you before they ship. Nothing invents a
number, a client name or a case study anywhere.

---

## 4. Routing

One dynamic route, two segments:

```
app/[section]/[slug]/page.tsx
```

- `export const dynamicParams = false` — only the 16 enumerated pairs render.
  Everything else is a 404 rather than a rendered blank.
- `generateStaticParams` enumerates them from the registry, so all 16 prerender.
- Static routes always beat a dynamic segment in the App Router, so the existing
  `/demo` and `/` are unaffected.

Sections map to their parent sphere:

| Parent | Section | Example URL |
| --- | --- | --- |
| `00` | `services` | `/services/performance-marketing` |
| `01` | `work` | `/work/testimonials` |
| `02` | `about` | `/about/market-study` |
| `03` | `contact` | `/contact/email` |

*Alternative considered:* four explicit route folders instead of one dynamic
pair. Same URLs, four near-identical `page.tsx` files. Rejected as repetition
with no safety gained once `dynamicParams` is false.

`params` is a Promise in this version and is awaited — checked against
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`,
not assumed.

---

## 5. Content model

New file, `lib/pages/registry.ts`. One entry per drop, keyed by the drop id that
already exists in `lib/satellites.ts` and in the backend's `drops` table — so
the key is stable and nothing has to be renamed on either side.

```ts
interface DetailPage {
  dropId: string;        // "00-prf" — the join back to the sphere
  section: string;       // "services"
  slug: string;          // "performance-marketing"
  title: string;         // "Performance Marketing"
  promise: string;       // one line
  hero: string;          // one paragraph
  problems: string[];    // three failure modes
  runs: string[];        // 5–6 work items
  phases: { name: string; body: string }[];  // four
  deliverables: string;  // what you get
  cadence?: string;
  cta: { line: string; label: string; href: string };
  tint: Tint;            // the page's own four-stop gradient
}
```

Content lives in the repo, not the backend. The backend's `RemoteDrop` carries
`label`, `detail`, `mark` and `kind` — four short fields — and extending its
schema and admin forms to hold six blocks of body copy is a project of its own.
Out of scope here; noted as a possible later phase.

### Tints

The five service pages take distinct hue shifts inside the purple family, per
the brief: Performance the deepest violet through to Branding at warm
pink-violet. The eleven non-service pages inherit their parent sphere's existing
tint — rose for `01`, orchid for `02`, amber for `03` — so a page reads as
having come out of the sphere that opened it.

The chain's own tint objects stay where they are in `HeroCanvas`. The registry
holds its own values rather than importing them, because `03`'s amber is
pre-compensated for the composite's tone mapping and those numbers are only
correct inside that pipeline.

---

## 6. Page composition

Your six-block skeleton, identical across all 16 so the set reads as one system.

1. **Hero** — name, promise, context paragraph
2. **The problem** — three failure modes
3. **What we run** — the work items
4. **How it works** — four numbered phases
5. **What you get** — deliverables and cadence
6. **CTA** — one line, one button

Chrome, matching the homepage:

- `SilkAuroraBackground` — same four colours and settings as `app/page.tsx`
- `Navbar`
- `SmoothScroll` wrapper — **required**, not cosmetic: `FooterSection` calls
  `useLenis().scrollTo`, and outside the provider that resolves to the default
  no-op context and the footer's TOP link silently dies
- `FooterSection` — the same component, unmodified

**One visual per section, maximum.** Phase 3.

---

## 7. The entrance blob

The page mounts its own small `<Canvas>` with one `FluidBlob` in the page's
tint. It enters scaled up and settles top-right at ~20% opacity, and reverses on
back-navigation.

Verified, not assumed: `FluidBlob` pulls `usePointer` and `useSphereTarget`, and
**both have safe context defaults** — `PointerContext` ships a default ref, and
`useSphereTarget` falls back to an orphan registry, which makes the blob inert
rather than broken without the hero's providers. So the page needs a `Canvas`
and nothing else from the hero's plumbing.

`usePrefersReducedMotion` already exists and gates the animation to a static
placement.

---

## 8. Phases

Each phase is a reviewable stopping point, and I ask before starting the next.
The site is never left in a state where a button on screen does nothing.

### Phase 1 — Route, page shell, five service pages
- `lib/pages/registry.ts` with the five service entries, full copy as supplied
- `app/[section]/[slug]/page.tsx` + `generateStaticParams` + `dynamicParams = false`
- `components/detail/DetailPage.tsx` — the six blocks
- Chrome: silk background, navbar, `SmoothScroll`, footer
- Entrance blob
- Per-page `generateMetadata` — title, description, OG

Homepage untouched. Pages reachable by URL only, so this reviews in isolation.

**Done when:** the five URLs render, look right, and `next build` is clean.

### Phase 2 — Remove the second layer, wire the share buttons
- Strip every `children` array from `lib/satellites.ts`, and the field from
  `SatelliteNode`. The file's header comment documents a three-deep tree at
  length and gets rewritten, not left lying.
- `SatelliteField.tsx`: remove the recursion, the `expanded`/`mounted`
  sub-fan state, the `depth` prop and its two readers, and the detail-line
  collapse that existed to make room for children.
- `lib/content/store.ts`: drop `children` from the zip in `useDrops` and correct
  the comment that explains why third-level drops came from the local table.
- Repoint each drop's share button at its page.
- The 03 Contact Form drop keeps its inline form button. It is a second control
  and always was; its share button now goes to `/contact/contact-form`, which is
  where the long version of the form lives.

**Done when:** the fan is one level deep everywhere, every drop's share button
lands on its page, and nothing references a removed prop.

### Phase 3 — One visual per page
Built from your visual-direction notes:

- Performance — the platform-ROAS vs. blended-ROAS divergence. The gap is the pitch.
- Web Development — before/after request waterfall, or the 4G/3G comparison slider
- Social — the reply-latency thread with the timestamp gap closing
- E-commerce — the catalog → channels → ads → checkout loop, with a node going red and the ad node pausing. This one earns a real diagram.
- Branding — one product across five surfaces, obviously the same brand

**Done when:** each page carries at most one visual and it survives mobile.

### Phase 4 — Copy for the remaining eleven
Drafted in the same voice, same skeleton, presented for approval as a document
before it becomes pages. Placeholders stay visibly placeholders.

### Phase 5 — Continuity and polish
- Sphere scale-up into the page blob, reversed on back-navigation
- Reduced-motion path
- Prefetch on the share controls
- Deep-link check: cold load of every URL, back/forward, and the return to the
  correct scroll position on the chain

---

## 9. Risks

| Risk | Handling |
| --- | --- |
| Lenis restores scroll to 0 on mount, so returning from a page could dump the reader at the top of the chain | Phase 5 explicitly tests it; `LenisProvider` already sets `scrollRestoration = "manual"` and owns the restore, so the fix belongs there |
| A second WebGL context per page on top of the silk background | One small canvas, one blob, no post-processing. Measured in Phase 1 before it is kept |
| The backend serves `drops` copy that no longer matches page copy | Registry keys off drop id, and page copy is local. A backend rename changes the sphere's label only — the page is unaffected |
| Removing `children` breaks the admin | It does not. `useDrops` already documents that third-level drops never crossed the API boundary |
