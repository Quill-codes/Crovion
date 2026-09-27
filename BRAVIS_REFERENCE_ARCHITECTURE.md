# BRAVIS REFERENCE STUDY

**Reference:** https://www.bravis.com/en/
**Date of study:** 2026-08-09
**Purpose:** Reverse-engineer the *experience and interaction system* of the reference site to inform an original Crovion implementation.
**Status:** Research only. No Crovion code was written or modified. No dependencies installed.

---

## Method & Evidence Grading

All findings below are graded:

| Grade | Meaning |
|---|---|
| **OBSERVED** | Directly read out of the site's served HTML, CSS, JS, GLSL or binary assets. Quotable. |
| **INFERRED** | A reasoned conclusion built on observed evidence, but not literally stated in the source. |
| **UNKNOWN** | Could not be determined with the tooling available. Explicitly not guessed. |

### What I could do
Full source retrieval and static analysis of the live production site: HTML, all CSS, the Nuxt client bundle and all 10 route chunks, the 346 KB custom WebGL engine, **all 24 GLSL shader files**, the texture assets, `robots.txt`, and both XML sitemaps.

### What I could NOT do — read this before trusting any timing claim
**No browser automation (Playwright/Puppeteer/CDP) was available in this environment.** Therefore:

- I did **not** render the site, take screenshots, move a real cursor, scroll, or emulate devices.
- Every claim about *interaction logic* comes from reading the handler and animation code — which is stronger evidence than eyeballing it.
- But every claim about *rendered visual result* (measured px font sizes at a given viewport, actual observed FPS, real-device touch feel, computed colour after blending) is **INFERRED or UNKNOWN** and is labelled as such.
- **Phase 11 (responsive) is the weakest section.** I have the breakpoint *rules* and the authored mobile coordinate values, not rendered measurements. It is marked accordingly rather than padded out.

Anything below stated as OBSERVED can be re-verified from the files listed in §19.

---

## 1. Executive Summary

Bravis is **not a website with a WebGL decoration on it. It is a WebGL application with a website attached to it.**

That single fact reorganises everything else. The English homepage's content container is literally this:

```html
<div id="contents" class="contents top"></div>
```

Empty. **OBSERVED.** There is no hero text node, no section markup, no image tags. The entire homepage — headline, navigation nodes, the fluid, the labels — is rendered into one WebGL canvas. The DOM on that route carries only the preloader, the header, the language switcher and the footer.

The architecture is a **hybrid of two independent stacks that barely talk to each other**:

1. **A Nuxt 3.12.5 (Vue 3) statically-generated frontend**, served as flat files by nginx, sourcing content from a **headless WordPress** backend. This owns routing, the DOM pages, the header/footer, and smooth scrolling (Lenis).
2. **A hand-written, framework-free Three.js r138 engine** (`glmain.min.js`, 346 KB, ~90 classes, global `_glMain` singleton) that owns the canvas, the fluid, the mouse interaction, the loading screen and the cross-page visual continuity.

These two stacks each load **their own separate copy of GSAP** — 3.7.1 globally for the WebGL engine, 3.12.5 bundled inside Nuxt for the Vue layer. **OBSERVED.**

The famous fluid is, in one sentence:

> **Instanced textured quads → render target → two-pass separable Gaussian blur → a near-binary alpha threshold (`alpha * 80.0 - 10.0`) that fuses overlapping soft blobs into one continuous organic silhouette, with all deformation applied in the fragment stage as UV displacement driven by an accumulated cursor-stamp texture and an animated simplex-noise texture.**

There is **no vertex displacement, no metaball distance field, no fluid simulation, no spring physics, and no mouse uniform.** Everything is 2D compositing under an orthographic camera. This is enormously cheaper than it looks, and that is the central lesson worth stealing.

**Three findings that should most change how we build Crovion:**

1. **The metaball is a blur + alpha-contrast trick, not a signed distance field.** It costs two blur passes and ~7 arithmetic ops, and it scales to any number of blobs at zero incremental shader cost. §6.
2. **The cursor never reaches a shader uniform.** It is rasterised into a half-resolution render target as a pool of expanding, fading brush stamps. That texture *is* the displacement map. This decouples the effect from cursor sample rate entirely and gives a free persistent trail. §6.4.
3. **They cap `devicePixelRatio` at 1 on desktop.** Retina desktop users are rendering at 1× and the design still reads as premium, because the fluid is intentionally soft-edged. §17.

**What is genuinely weak and must not be copied:** accessibility. No `<h1>` on the homepage, zero ARIA attributes, `outline:0` with no focus replacement, no `<main>` landmark, and no site-level `prefers-reduced-motion` handling on a site that is essentially all motion. §16.

---

## 2. Website Sitemap

Source: `https://www.bravis.com/en/sitemap.xml` — **147 URLs. OBSERVED.**

```
/en/                          Homepage — 100% WebGL
├── /en/about/                About (DOM-based, content-heavy)
├── /en/features/             "Features" — full-screen 14-scene WebGL presentation
├── /en/projects/             Project index
│   └── /en/projects/{slug}/  63 project detail pages
├── /en/reports/              Reports/news index
│   └── /en/reports/{slug}/   75 report detail pages
├── /en/recruit/              Recruit
│   └── /en/recruit/entry/    Recruit application form
├── /en/sdgs/                 Sustainability / SDGs
├── /en/contact/              Contact (reCAPTCHA v3 protected)
├── /en/privacy-policy/       Privacy policy
└── /en/kr/                   (cross-language entry present in EN sitemap)
```

**Route counts (OBSERVED):** reports 75 · projects 63 · recruit 2 · about, features, contact, sdgs, privacy-policy, projects-index, home 1 each.

**Verified non-existent** — all returned HTTP 404 (**OBSERVED**), so do not assume these exist by analogy with other agency sites:
`/en/awards/` · `/en/news/` · `/en/works/` · `/en/careers/` · `/en/environment/`

> **Note for Crovion IA:** "Works" is `/projects/`. "News" is `/reports/`. "Sustainability" is `/sdgs/`. **There is no Awards route** — awards appear to be a section inside `/about/`, not a page. **INFERRED** (no awards route exists; `/about/` is by far the largest DOM page at 271 KB).

**Language architecture — OBSERVED.** Four locales on three hosts:
`/` (JP, default) · `/en/` · `/kr/` · and `bravis.net.cn` as a *separate domain* for CN. Each locale has its own WordPress admin (`/manage/{ja,en,kr,cn}/wp-admin/`) and its own sitemap. Locale is passed to the WebGL engine through a global `window.lang`, which then injects a locale-specific stylesheet (`/en/static/gl/css/en.css`) and swaps locale-specific UI textures (`top_features_en.png`, `dom_title_en.png`). **OBSERVED.**

### Hidden / secondary surfaces
- `/manage/{lang}/wp-admin/` — WordPress admin, disallowed in `robots.txt`. **OBSERVED.**
- `/en/_payload.json?<uuid>` — Nuxt's serialised page payload (66 KB on the homepage). **OBSERVED.**
- `/en/_nuxt/*` — 11 JS chunks + 3 CSS files. **OBSERVED.**
- `/en/static/gl/` — the entire WebGL engine, shaders and textures, served outside the Nuxt build. **OBSERVED.**

---

## 3. Page-by-Page Architecture

Per the requested schema. Fields I could not verify without a browser are marked UNKNOWN rather than filled in plausibly.

### 3.1 `/en/` — Homepage

| Field | Finding |
|---|---|
| **ROUTE** | `/en/` |
| **PAGE PURPOSE** | Navigational hub. It is a *vertical journey* through 8 fluid "nodes", each a branded entry point into a service area. It is not a marketing scroller. |
| **CONTENT STRUCTURE** | `#contents.top` is **empty**. All content is WebGL. DOM holds only `#gl-world` (canvas), `#gl-loading`, `#scrollFix.container`, `#fix-stage` (header), `#footer`, `#teleports`. **OBSERVED.** |
| **SECTION ORDER** | Defined in JS as ball coordinates, not markup — see §4. |
| **PRIMARY CTA** | The 8 metaball nodes themselves (`feature`, `corporate branding`, `package branding`, `digital branding`, `global branding`, `company`, `report`, `all projects`). **OBSERVED.** |
| **SECONDARY CTA** | Header nav, hamburger overlay menu, language switcher, footer link blocks (`links1`, `links2`, `sns`, `other`). **OBSERVED.** |
| **INTERACTIONS** | Cursor trail stamping into the effect buffer; click ripple; hover on ball nodes; scroll-velocity coupling. §7. |
| **ANIMATIONS** | Continuous: radial sine ripple, simplex-noise drift, colour-LUT scroll, per-ball float, ball rotation. Nothing is idle. §6. |
| **MEDIA** | No `<img>`, no `<video>` in the content area. Only WebGL textures (WebP/PNG) + inline SVG logo. **OBSERVED.** |
| **SCROLL BEHAVIOR** | Desktop: native scroll smoothed by Lenis; `window.scrollY` read each frame by the engine. Touch: engine's own transform-based scroll with momentum. §8. |
| **RESPONSIVE BEHAVIOR** | A **separate authored `sp:` coordinate set** per ball — not a scaled desktop layout. §15. **OBSERVED.** |
| **TRANSITION BEHAVIOR** | 0.2 s opacity fade of `#contents` + `#fix-stage`; canvas persists across the navigation. §9. **OBSERVED.** |

### 3.2 `/en/features/` — the outlier route

This route does not behave like a page at all, and it is the most technically ambitious thing on the site.

| Field | Finding |
|---|---|
| **PAGE PURPOSE** | A **14-scene (index 0–13) full-screen slide presentation**, driven entirely in WebGL. **OBSERVED** (`glFeatures`, `_sceneNum` 0…13, classes `glFeatureS2`…`glFeatureS7`). |
| **SCROLL BEHAVIOR** | **Scroll is hijacked.** A `wheel` listener converts discrete wheel events into slide changes, with a `Math.abs(deltaY) < 30` noise gate and an **0.8 s GSAP-timed lockout** (`scrollEnableCheck`) between slides. Touch uses a swipe with a 10 px threshold via a synthetic `.gl-f-event` overlay div. **OBSERVED.** |
| **LAYOUT** | `glPageMng.setPage()` forces `#contents` to `height:100svh; min-height:100svh` and sets `footer.style.display = 'none'`. On the final scene the footer is re-enabled and an upward wheel gesture re-enters the deck. **OBSERVED.** |
| **ANIMATIONS** | Per-scene particle systems (`glFeatureS2Particle`…`S6Particle`), morphing colour nodes (`S2Red/Org/Blue`, `S6Red/Org/Purple/Blue`), an animated map (`s6map_frg`), and a title with a colour-gradient fill (`featureTitle_frg`). **OBSERVED.** |
| **NOTE** | Uses `100svh` (small viewport height) — correct handling of mobile browser chrome. **OBSERVED.** Worth copying. |

### 3.3 `/en/about/` — the DOM-heavy counterexample

271 KB of HTML — by far the largest page. **OBSERVED.** This is where Bravis proves the site *can* be conventional: real `<h1>`/`<h2>`/`<h3>` hierarchy (1/11/3), 46 `<img>` elements, a `role=` attribute, and a skip-related token. Images are served **raw from WordPress uploads** (`/manage/en/wp-content/uploads/YYYY/MM/*.jpg`) with **no `srcset`, no `<picture>`, and almost no `loading="lazy"`**. **OBSERVED.** Explicit `width`/`height` attributes are present on some images (good — prevents CLS).

### 3.4 `/en/projects/` and `/en/projects/{slug}/`

Index backed by `glProjectBall` / `glProjectBallMng` / `glProjectOutBall` — project cards have **WebGL blob companions** that track DOM elements (`e.dom = this._parent._all[s]`). **OBSERVED.** So the fluid layer reads DOM positions and renders behind/around the cards; the two layers are spatially coupled.

Detail pages use `glDetail`, `glDetailBall`, `glDetailRelated`, `glDetailRelatedDom` — a hero blob plus blobs bound to the "related projects" list. **OBSERVED.**

### 3.5 `/en/reports/`, `/en/recruit/`, `/en/sdgs/`, `/en/contact/`, `/en/privacy-policy/`

Conventional Nuxt/Vue DOM pages with the persistent WebGL background. `/en/contact/` and `/en/recruit/entry/` load **Google reCAPTCHA v3** (`render=6Lf9swAqAAAAAG-9HGDyYFNqHp8srGo-rEV7MRMy`). **OBSERVED.** Detailed per-section breakdowns of these routes would require rendering — **UNKNOWN.**

---

## 4. Homepage Anatomy

Because `#contents` is empty, the homepage "sections" are **coordinates in `glTopMainBall`**, not markup. This is the authored composition, read directly from the source. **OBSERVED.**

| # | Label (`des`) | x (fraction of viewport width) | y (world px) | scale | front α | Mobile `sp:` (x, y, scale) |
|---|---|---|---|---|---|---|
| 0 | `feature` | 0.75 | −380 | 1.30 | 1.00 | 0.62, −510, 0.68 |
| 7 | `all projects` | 0.82 | −512 | 0.45 | 0.65 | 0.72, −292, 0.24 |
| 1 | `corporate branding` | 0.32 | −1080 | 1.00 | 0.65 | 0.28, −958, 0.54 |
| 2 | `package branding` | 0.74 | −1560 | 0.84 | 0.60 | 0.76, −1320, 0.48 |
| 3 | `digital branding` | 0.37 | −2100 | 1.05 | 1.00 | 0.30, −1698, 0.54 |
| 4 | `global branding` | 0.73 | −2660 | 0.90 | 0.65 | 0.72, −2126, 0.52 |
| 5 | `company` | 0.30 | −3280 | 0.84 | 1.00 | 0.27, −2622, 0.46 |
| 6 | `report` | 0.57 | −3980 | 1.05 | 1.00 | 0.73, −3022, 0.55 |

### The composition rules this reveals

1. **Serpentine alternation.** x oscillates right→left→right→left (0.75, 0.32, 0.74, 0.37, 0.73, 0.30) before resolving to near-centre (0.57) at the final node. The eye is deliberately walked side to side down the page. **OBSERVED.**
2. **Irregular vertical rhythm.** Gaps are 700, 480, 540, 560, 620, 700 px — deliberately *not* uniform. A constant gap would read as a list; the variance reads as an organic path. **OBSERVED.**
3. **Scale carries hierarchy, not type size.** `feature` is largest at 1.30; `all projects` is a 0.45 satellite tucked beside it. Importance is expressed by *mass*, not by font scale. **OBSERVED.**
4. **Two textures per node.** Every ball has a `_bg` and a `_front` texture. The `_bg` enters the blur/metaball pipeline; the `_front` is drawn in a separate non-thresholded, colour-inverted pass with its own `front_alpha` (0.60–1.00). This is what gives each blob interior depth instead of reading as a flat sticker. **OBSERVED.**
5. **Mobile is re-authored, not scaled.** Total journey compresses 3980 → 3022 px (−24%) and scales drop ~50%. Node 7 moves from a right-edge satellite (0.82) to 0.72. **OBSERVED.**

### The connective tissue — the signature effect

`glJoint` / `glJointMng` build **7 connections between consecutive nodes**, with **3 joint particles each (21 instances)**:

```
_ballIdList = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[4,7]]
```
**OBSERVED.**

Because joint particles are drawn into the *same* buffer that gets blurred and thresholded, they **fuse with the nodes they sit between**, producing liquid bridges that stretch and snap as you scroll. Note `[4,7]` — node 7 hangs off node 4, not off its scroll neighbour, creating a branch rather than a pure chain.

**This is the single most valuable compositional idea in the reference**, and it is a direct consequence of the metaball technique: connection is *free*, because merging is what the threshold already does.

### DOM ↔ WebGL binding
`glMainBallDom` binds each WebGL ball to a DOM element, and `glMainBallOtherBtn` / `glMainBallSab` handle sub-buttons. **OBSERVED.** The clickable/labelled layer is real DOM positioned over the canvas — which is why the nodes are clickable at all. This is the right pattern and we should copy it.

---

## 5. Hero Architecture

There is no discrete "hero". The first viewport is simply the top of the continuous WebGL world: the background gradient plane, the `feature` node (scale 1.30) at x = 0.75, its `all projects` satellite, ambient particles, and a locale UI texture (`top_features_en.png`). **OBSERVED.**

**Camera:** `THREE.OrthographicCamera` positioned at `(0, 0, 1000)`. **OBSERVED.** There is no perspective camera anywhere in the main world. Everything is 2D compositing — no 3D geometry, no lights, no materials beyond `ShaderMaterial`/`MeshBasicMaterial`.

**Renderer:**
```js
new THREE.WebGLRenderer({ antialias: false, alpha: true })
setClearColor(0xEEEEEE, 0)   // transparent — CSS background shows through
```
**OBSERVED.** `antialias:false` is free performance and costs nothing here because there are no hard polygon edges — every edge in the composition comes from a blurred alpha threshold, which antialiases itself.

**Z-order (OBSERVED from `mesh.position.z`):**

| z | Layer |
|---|---|
| −100 | Background gradient plane (`bg_frg`) |
| −5 … −1 | Background particles, word textures, sand layer |
| 0 | **Main metaball composite** (`display_frg`) |
| +2 | Front ball layer (`frontDisplay_frg`, colour-inverted) |
| +10 | Noise scene mesh (offscreen) |
| +500 | Grain/pattern overlay (`alpha: 0.03`) |

The final layer at z=500 is a tiled repeating texture at **3% opacity** — a full-screen film-grain pass that unifies the whole composite. **OBSERVED.** Cheap, and it is doing a lot of the "premium" work.

---

## 6. Fluid / Water Interaction Analysis

This is the core of the study. **Everything in this section is OBSERVED from the shader source and engine code unless marked otherwise.**

### 6.1 The technology question, answered

| Candidate | Verdict |
|---|---|
| HTML/CSS | **No.** Zero `filter:blur`, `backdrop-filter`, `clip-path`, `mix-blend-mode` in any stylesheet. **OBSERVED.** |
| SVG / SVG filter / displacement map filter | **No.** No `feTurbulence`/`feDisplacementMap` anywhere. |
| Canvas 2D | **No.** |
| **WebGL via Three.js r138** | **Yes.** `/en/static/assets/js/lib/three.min.138.js`. **OBSERVED.** |
| **Custom GLSL** | **Yes.** 24 hand-written `.js` shader files under `/en/static/gl/shader/`. **OBSERVED.** |
| Three.js built-in materials | **Barely** — only `MeshBasicMaterial` for the trail stamps. All visuals use `ShaderMaterial` (26 instances). |
| PixiJS / WebGPU / Video / APNG / Lottie | **No.** No trace of any. |
| Metaball (distance-field / marching squares) | **No — and this is the key finding.** The metaball *look* is achieved by blur + alpha threshold. There is no distance field. |
| Blob mesh / vertex deformation | **No.** All vertex shaders are pass-through. See §6.6. |
| Noise function | **Yes.** Ashima/stegu 3D simplex (`snoise`), MIT-licensed, rendered to a texture. **OBSERVED.** |

**Answer: Three.js r138 + custom GLSL, in a multi-pass 2D render-target pipeline.**

### 6.2 The render pipeline — 6 passes per frame

```
┌─ PASS 1 ── glNoiseSet ────────────────────────────────────────┐
│  512×512 RT · noise_frg.js · 3D simplex snoise(vec3(x,y,t))   │
│  cr=cg=4.0 (frequency) · cb = time, += 0.008·Δ                │
│  ⚠ RENDERS EVERY OTHER FRAME (isRender toggle) → ~30 fps      │
└───────────────────────────────────────────────────────────────┘
┌─ PASS 2 ── glMouseEffect ─────────────────────────────────────┐
│  ½ viewport RT · black base plane + pool of 30 ring stamps    │
│  MeshBasicMaterial, map = burash.webp (512² soft ring)        │
│  → this render target IS the displacement map                 │
└───────────────────────────────────────────────────────────────┘
┌─ PASS 3 ── glDummyScene ──────────────────────────────────────┐
│  Instanced ball sprites (bg textures) → RGBA RT               │
└───────────────────────────────────────────────────────────────┘
┌─ PASS 4 ── MiddleRender ── middle_frg.js ─────────────────────┐
│  HORIZONTAL Gaussian · 31 taps · alpha-weighted               │
└───────────────────────────────────────────────────────────────┘
┌─ PASS 5 ── BlurStageRender ── blurStage_frg.js ───────────────┐
│  VERTICAL Gaussian · 31 taps · alpha-weighted                 │
└───────────────────────────────────────────────────────────────┘
┌─ PASS 6 ── Screen ────────────────────────────────────────────┐
│  bg_frg (gradient) → display_frg (METABALL) → frontDisplay    │
│  → 3% grain overlay                                           │
└───────────────────────────────────────────────────────────────┘
```

### 6.3 How the organic shape is actually generated

`display_frg.js`, line 55 — **the entire metaball effect is this one line:**

```glsl
vec4 colB = vec4( col1.rgb, col1.a * 80.0 - 10.0 );
```

That is a steep linear ramp on the **blurred alpha** channel, clamped implicitly by the blend stage. Solving it:

- alpha ≤ **0.1250** → output α ≤ 0 → fully transparent
- alpha ≥ **0.1375** → output α ≥ 1 → fully opaque
- The visible edge lives in a band **just 0.0125 wide** — a near-binary isoline with ~1.25% of soft ramp left for antialiasing.

**This is the mechanism.** Two soft blurred blobs whose alphas individually sit below 0.125 will, where they overlap, *sum past the threshold* and snap into one continuous shape with a smooth neck between them. It is the GPU equivalent of the classic CSS `blur() + contrast()` "gooey" filter, but done properly in a render target where you control the blur kernel.

**Why this is the right choice, and why we should copy it:**
- Cost is **independent of blob count.** 200 blobs cost the same shader work as 2.
- Blob *shape* is art-directed by painting a texture, not by writing math.
- It antialiases for free, which is why `antialias:false` is safe.
- Merging/necking — the expensive, fiddly part of real metaballs — is emergent.

### 6.4 How the cursor drives it — the important nuance

**The mouse position never becomes a shader uniform.** There is no `uMouse`. Instead:

**Step 1 — capture.** `glEvent` binds `mousedown`/`mousemove`/`mouseup` on `document`, **only when `_device === 'PC'`**:
```js
this._effectX = e.clientX - _glMain._world._width  / 2;
this._effectY = e.clientY - _glMain._world._height / 2;
```
Centre-origin conversion. On non-PC devices these are **hard-set to 0** and only a `click` listener is bound. **OBSERVED.**

**Step 2 — dead zone + throttle.** `glMfObj.setPos()`:
```js
if (|Δx| < 3 && |Δy| < 3) return;          // ignore micro-jitter
if (++count >= 4 * _conf._d2) {            // emit at most every ~4 frames
   ringPool[i].setPos(x * 0.5, y * -0.5);  // ½-res RT, Y flipped
}
```
Pool of **30** ring objects, round-robin. **OBSERVED.**

**Step 3 — each stamp lives and dies.** `glRingObj.enterFrame()`:
```js
rotation.z += 0.02 * Δ;                       // slow spin
opacity  = opacity * 0.98 + 0   * 0.02;       // exponential decay → 0
scale    = scale   * 0.98 + 8.0 * 0.02;       // exponential growth → 8×
if (opacity <= 0.002) retire();
```
Start state: `scale 0.2`, `opacity 0.9`. So each stamp is an **expanding, fading, slowly rotating soft ring** — from ~13 px to a target of 512 px in effect-space (≈1024 px of viewport, since the RT is half-res). **OBSERVED.**

**Step 4 — consumption.** The accumulated RT is sampled in `display_frg`:
```glsl
vec4 effectCol = texture2D( mEffect, vUv );
vec2 effectUv  = vUv + sin(effectCol.r) * 0.025;   // UV displacement
...
float effectLight = effectCol.r * 0.11;            // and a brightness lift
```
So the cursor **both distorts and brightens** the fluid. **OBSERVED.**

**Why this design is clever:** rasterising into a texture decouples the effect from cursor sample rate and from blob count, gives persistence (a trail) for free, survives frame drops gracefully, and lets the falloff curve be *painted* rather than computed.

**The falloff radius is not a math function — it is the alpha channel of `burash.webp`.** I downloaded and inspected it: a 512×512, 24 KB soft **irregular ring/donut** in near-white on transparent. Its lumpiness is what makes ripples look organic rather than like clean circles. **OBSERVED.**

### 6.5 The click ripple

`mousedown` → `glMouseEffect.clickWave()` → `glSelectRingObj`, a **2-slot pool** using GSAP rather than per-frame lerps:
```js
opacity: 0 → 1  over 0.30 s
then     1 → 0  over 1.70 s   ease: Power3.easeInOut
scale:   1 → 8  over 2.00 s   ease: Power3.easeOut
```
Guarded by `if (!mesh.visible)` so a slot cannot be interrupted mid-ripple. **OBSERVED.** This is the **only** cursor-driven effect that survives on touch devices.

### 6.6 Vertex or fragment? — definitively fragment

Every vertex shader in the project is a pass-through. `bgBall_vtx.js` in full:
```glsl
vUv = uv; vAlpha = alphas; vSuv = suv;
vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
gl_Position = projectionMatrix * mvPosition;
```
**No displacement, no noise, no time.** **OBSERVED.** Same for `planeBase_vtx`, `frontBall_vtx`, `jointBall_vtx`, `selectFrontBall_vtx`.

**All deformation is fragment-stage UV displacement.** This matters: it means geometry can stay at `PlaneGeometry(w, h, 1, 1)` — **a single quad, 2 triangles, 4 vertices.** There is no mesh subdivision anywhere. **OBSERVED.**

### 6.7 The always-on motion (no interaction required)

`display_frg` also contains a **global radial ripple** independent of the cursor:
```glsl
const float size = 14.0;
vec2  p  = -1.0 + 2.0 * effectUv;               // centre-origin UV
float ss = sin( -time + length(p * size) );     // concentric wave from centre
vec2  newUv = effectUv + strength * vec2(ss, ss);
```
`strength` is tweened from `0.01` → `0.004` over 1.5 s `Power3.easeInOut` on load. **OBSERVED.** So the fluid breathes permanently, at 14 concentric bands, whether or not anyone touches it.

### 6.8 Where the colour comes from — a texture, not math

`bg_frg.js` samples a **gradient lookup texture** (`bgColor.webp`, 1024×1024, 8.5 KB) and scrolls its UVs:
```glsl
vec2 colDist = colStrength * vec2( sin(-time + length(p*8.0)),
                                   cos(-time + length(p*8.0)) );
vec2 colUv   = vec2(distUv.x + colShiftX, distUv.y - colShiftY) + colDist;
vec3 col     = texture2D(tex, vec2(colUv.x*colScaleX, colUv.y*colScaleY)).rgb
             + noiseCol.r * 0.065;              // dithering grain
```
I inspected `bgColor.webp` directly: **a soft iridescent/holographic pastel band** — prismatic pinks, greens, blues bleeding into near-white. **OBSERVED.**

`colShiftY` is driven by both time **and scroll velocity**:
```js
colVY += 0.0026 * Δ + 0.0004 * _scroll._scrollDis;
if (colVY > 0.8) { colShiftX = Math.random()*0.5 - 0.25; colVY = -0.8; }
```
**OBSERVED.** So the palette drifts continuously, ping-pongs at ±0.8, and **randomises its horizontal offset on each wrap** — meaning the colour never repeats identically. Scrolling faster pushes the palette forward faster.

The `noiseCol.r * 0.065` addition is doing important work: it dithers the gradient and **kills banding**, which is why a smooth 8 KB gradient can be blown up full-screen without visible steps.

**Design lesson:** the "generative" colour is an *artist-painted image* moved by cheap math. Far more controllable than procedural colour, and vastly cheaper.

A `mirror()` helper makes noise UVs ping-pong for seamless tiling:
```glsl
vec2 mirror(vec2 v){ vec2 m = mod(v,2.0); return mix(m, 2.0-m, step(1.0,m)); }
```

### 6.9 The foreground pass

`frontDisplay_frg.js` uses the same displacement but **omits the alpha threshold** (that line is commented out) and **inverts the result**:
```glsl
gl_FragColor = vec4(1.0 - fCol.rgb, col1.a);
```
with noise and cursor *subtracting* light (`max(col - noiseLight - effectLight, 0.0)`). **OBSERVED.** This produces the darker contrasting cores inside the blobs.

### 6.10 The 23 questions, answered from evidence

| # | Question | Answer | Grade |
|---|---|---|---|
| 1 | How is the blob rendered? | Instanced textured quads → FBO → 2-pass blur → alpha threshold | OBSERVED |
| 2 | How is the gradient generated? | Sampled from `bgColor.webp` LUT with animated UVs + noise dither | OBSERVED |
| 3 | How is the organic shape generated? | Painted sprite alpha + blur + `α*80−10` threshold merging | OBSERVED |
| 4 | Static asset or dynamic? | Sprites are **static** WebP; the merged silhouette is **dynamic** | OBSERVED |
| 5 | Is mouse position tracked? | Yes — `document` `mousemove`, **PC only** | OBSERVED |
| 6 | Converted to local coords? | Yes — `clientX − w/2`, then `×0.5` and Y-negated for the ½-res RT | OBSERVED |
| 7 | Does mouse movement change geometry? | **No.** Zero vertex displacement | OBSERVED |
| 8 | Does it change a shader uniform? | **No direct uniform.** It goes through a *texture* (`mEffect`) | OBSERVED |
| 9 | Displacement texture? | Yes — the mouse-effect RT serves exactly this role | OBSERVED |
| 10 | Noise texture? | Yes — 512² animated 3D simplex | OBSERVED |
| 11 | Vertex- or fragment-based? | **Fragment.** Entirely | OBSERVED |
| 12 | Does it use velocity? | **Cursor velocity: only as a 3 px dead-zone gate**, not as magnitude. **Scroll velocity: yes**, `_scrollDis` feeds shaders | OBSERVED |
| 13 | Damping? | Yes — exponential decay on stamps, `_scrollDis`, and Δt itself | OBSERVED |
| 14 | Inertia? | Yes — touch scroll `_throwDis *= 0.975`; smoothed followers | OBSERVED |
| 15 | Spring-back? | **No true spring.** Exponential ease only — no overshoot, no oscillation | OBSERVED |
| 16 | Localised cursor displacement? | Yes — via each stamp's spatial extent | OBSERVED |
| 17 | Radius / falloff? | Yes — **baked into the brush texture's alpha**, not computed | OBSERVED |
| 18 | Ripples? | Yes, two kinds: expanding stamps + global radial sine | OBSERVED |
| 19 | Temporal noise? | Yes — simplex Z axis advances `+0.008·Δ` per frame | OBSERVED |
| 20 | Different on enter/move/leave? | **No `mouseenter`/`mouseleave` handlers exist at all.** Only move + down/up | OBSERVED |
| 21 | Different during scroll? | Yes — scroll velocity drives `shiftY`, colour drift, particle drift | OBSERVED |
| 22 | Reacts to cursor velocity? | Only as a gate. Faster movement spaces stamps further apart because emission is *time*-throttled, so a fast flick leaves a longer, sparser trail | OBSERVED / INFERRED |
| 23 | Changes without interaction? | **Yes** — radial sine + noise drift + colour scroll + per-ball float | OBSERVED |

### 6.11 The technical model

The pipeline the user sketched is close, but the real one differs in two important ways — the cursor is **rasterised**, not passed as a coordinate, and the deformation is **fragment**, not vertex:

```
mousemove (PC only)
      ↓  clientX − width/2, clientY − height/2         [centre-origin]
      ↓  dead zone: skip if |Δx| < 3 && |Δy| < 3
      ↓  throttle: emit at most every 4 frames (Δt-corrected)
      ↓  ×0.5, Y-negate                                [→ half-res RT space]
      ↓
  STAMP a soft irregular ring sprite into a pool of 30
      ↓  per frame: scale ⟶ 8   (exp, k=0.02)
      ↓             opacity ⟶ 0 (exp, k=0.02)
      ↓             rotation += 0.02·Δ
      ↓
  ACCUMULATE into ½-resolution render target  ──────────► mEffect texture
                                                              │
  balls → FBO → blur H (31 tap) → blur V (31 tap) ──► tex     │
                                                              │
  simplex noise (512², 30 fps, z += 0.008·Δ) ──────► noise    │
                                                              ▼
                                        ┌─────── display_frg ───────┐
                                        │ uv += sin(mEffect.r)·0.025│  ← cursor distortion
                                        │ uv += strength·sin(−t+|p·14|) │ ← ambient ripple
                                        │ α   = α·80 − 10           │  ← METABALL THRESHOLD
                                        │ rgb += noise·0.13 + eff·0.11 │ ← grain + cursor light
                                        └───────────────────────────┘
                                                              ▼
                                                    rendered fluid surface
```

---

## 7. Mouse Interaction System

### 7.1 Global handlers — the complete inventory

| Trigger | Bound on | Condition | Result | Tech |
|---|---|---|---|---|
| `mousemove` | `document` | `_device === 'PC'` **and** `!isTransition` | Updates `_effectX/Y` → stamps trail | Custom JS + WebGL |
| `mousedown` | `document` | PC only | `clickWave()` → 2 s expanding ripple | Custom JS + GSAP 3.7.1 |
| `mouseup` | `document` | PC only | Clears `isDown` | Custom JS |
| `click` | `document` | **non-PC only** | `clickWave()` only | Custom JS + GSAP |
| `wheel` | `document` | `/features/` route | Slide advance, 30 px gate, 0.8 s lockout | Custom JS |
| `touchstart/move/end` | `document` | non-PC | Custom momentum scroll | Custom JS + GSAP `set` |

**`mousemove` is suppressed during page transitions** (`if (_glMain.isTransition) return`) — a deliberate choice to keep the transition visually clean. **OBSERVED.**

### 7.2 DOM hover interactions

From CSS. These are the reusable **motion tokens**:

| Property | Duration | Easing | Notes |
|---|---|---|---|
| `opacity` | **0.4 s** | `cubic-bezier(.165,.84,.44,1)` | **easeOutQuart** — most common (5 uses) |
| `transform` | **0.4 s** | `cubic-bezier(.77,0,.175,1)` | **easeInOutCirc** — dramatic, for larger moves |
| `transform` | 0.2 s | `cubic-bezier(.165,.84,.44,1)` | small hovers |
| `color` / `fill` / `background-color` | 0.2 s | `cubic-bezier(.165,.84,.44,1)` | link + icon states |
| generic | 0.3 s | `ease-out` | 4 uses |

**OBSERVED.** The system is disciplined: **two easing curves and three durations (0.2 / 0.3 / 0.4 s)** cover the entire DOM layer. Worth copying verbatim as a token set.

### 7.3 What does NOT exist

- **No custom cursor element.** No cursor-follower div, no `cursor: none`. The native cursor is used throughout. **OBSERVED.**
- **No `mouseenter`/`mouseleave` on the fluid.** The trail simply decays.
- **No hover-driven WebGL uniform.** Ball hover states are `glMainBallDom` DOM/CSS, not shader branches. **OBSERVED.**
- **No magnetic buttons, no cursor-proximity scaling.**

> This is a restraint worth noting: the reference achieves its premium feel with **one** signature interaction done extremely well, not with a pile of micro-interactions.

---

## 8. Scroll Animation System

### 8.1 The stack

| Layer | Implementation | Grade |
|---|---|---|
| Desktop smooth scroll | **Lenis** (bundled in the Nuxt chunk) | OBSERVED |
| Engine scroll read | `_scrollY = window.scrollY`, read once per frame | OBSERVED |
| Touch scroll | **Custom** — engine transforms `#scrollFix` via `gsap.set(y)` | OBSERVED |
| Scroll velocity | `_scrollDis = _scrollDis*0.98 + Δy*0.02` (smoothed) | OBSERVED |
| Scroll→animation link | Manual math in the global RAF loop | OBSERVED |
| Programmatic scroll | GSAP **ScrollToPlugin** | OBSERVED |

### 8.2 ScrollTrigger is NOT used — verified

I checked for the plugin's distinctive markers across the entire Nuxt bundle and the global GSAP file:

| Marker | Nuxt bundle | gsap.min.js |
|---|---|---|
| `scrub` | 0 | 0 |
| `pinSpacing` | 0 | 0 |
| `toggleActions` | 0 | 0 |
| `scrollerProxy` | 0 | 0 |
| `onRefresh` | 0 | 0 |

**OBSERVED.** The 3 literal `ScrollTrigger` string hits are GSAP core's internal plugin-registration stubs (`Ot.ScrollTrigger || qc("scrollTrigger", n)`), present in every GSAP build whether or not the plugin is loaded. **ScrollToPlugin is present** (32 `scrollTo` hits) and is used for programmatic scrolling only.

**There is also no `IntersectionObserver` anywhere** — 0 occurrences across the main bundle and all 10 route chunks. **OBSERVED.** Reveals are done with manual per-frame position math inside the single RAF loop.

### 8.3 Touch scroll implementation

```js
// drag
_moveY = (y2 - y1) + _endY;
// release — momentum
if (|Δ| > 4 && |Δ| < 100) _throwDis = 1.98 * Δ;   // gated: ignore jitter & flings
_throwDis *= 0.975;                                // per-frame decay
_moveY = rect.top + _throwDis;
_moveY = clamp(_moveY, -(contentH - innerH), 0);
gsap.set(scrollWrapp, { y: _moveY });
```
Guarded by `window.visualViewport.scale <= 1` so momentum is disabled while pinch-zoomed. **OBSERVED.** That last detail is a real-device polish point most implementations miss.

### 8.4 What scroll velocity actually drives

```js
particle.position.y += (speedY + 0.4 * _scrollDis) * Δ;      // parallax drift
uniforms.shiftY.value += 0.00015 * _scrollDis * Δ;           // noise UV scroll
colVY += 0.0026 * Δ + 0.0004 * _scrollDis;                   // colour drift
```
**OBSERVED.** Note these are **velocity-coupled, not position-coupled** — the world reacts to *how fast* you scroll, not to where you are. That is what makes it feel like a medium rather than a timeline, and it is the opposite of the ScrollTrigger `scrub` model.

**This is the most important scroll insight in the study.** Position-scrubbed animation feels mechanical; velocity-coupled animation feels physical.

---

## 9. Page Transition System

`glPageMng.transition()` — **OBSERVED:**

```js
gsap.to(this._page,     0.2, { opacity: 0, onComplete: () => { page.innerHTML = '';     page.style.opacity = 1; } });
gsap.to(this._fixStage, 0.2, { opacity: 0, onComplete: () => { fixStage.innerHTML = ''; fixStage.style.opacity = 1; } });
```

### Sequence

```
USER CLICK
   ↓  isTransition = true          → mousemove handler short-circuits
   ↓
CURRENT PAGE RESPONSE
   ↓  #contents  fade → 0 over 0.20 s   (GSAP)
   ↓  #fix-stage fade → 0 over 0.20 s
   ↓  innerHTML cleared, opacity reset to 1
   ↓  every WebGL module's .transition() runs
   ↓    · glTransitionBall plays its own animation
   ↓    · uniforms.alpha tween → 0 (typ. 0.6 s Power2/3.easeInOut)
   ↓    · group.scale → 0.85 (0.6 s Power2.easeInOut)
   ↓
NEW PAGE LOAD (Nuxt client-side route change — no document request)
   ↓  glScroll.transitionNewPage(): re-acquire #scrollFix/#contents, reset scroll to 0
   ↓  glPageMng.setPage(): set height/min-height, toggle footer
   ↓
NEW PAGE ENTRANCE
   ↓  module .viewStart(): uniforms.alpha 0→1 (1.8 s Power2.easeInOut, 0.5 s delay)
   ↓                       noiseAlpha 1→0 (dissolves noise out over 1.8 s)
   ↓                       group.scale 1.2→1 (2.0 s Power2.easeOut)
```

**The critical architectural point:** `#gl-world` sits **outside** `#contents`, so the WebGL canvas is **never destroyed or re-created** during navigation. The fluid is a continuous, persistent background across the whole site — the DOM fades out and in *over* it. **OBSERVED.**

That is the entire trick behind the site's sense of continuity, and it is nearly free. The DOM fade is only 0.2 s — deliberately short, because the *canvas* is carrying the perceived transition (a 1.8–2.0 s scale-and-dissolve), not the DOM.

### Preloader

**OBSERVED** from `base.css` and markup:
```css
#gl-loading      { position:fixed; inset:0; width:100%; height:100%; }
.gl-loading-bg   { background-color:#e50012; }                    /* full-bleed brand red */
.gl-loading-logo { width:412px; top:50%; left:50%;
                   transform:translate(-50%,-50%);
                   backface-visibility:hidden; }
.gl-loading-ring { width:40px; height:40px;
                   top:calc(50% + 90px); left:calc(50% - 20px);
                   background-image:url(../image/ui/loading.webp);
                   animation:0.6s linear infinite l; }             /* continuous spin */
```
Responsive: logo 412 px → 260 px (≤1279) → **43vw** (≤767); ring 40 px → 30 px. **OBSERVED.**

An aggressive full-bleed brand-red takeover — a confident choice that buys time to compile shaders and fetch textures, and doubles as a brand moment.

---

## 10. Navigation System

| Aspect | Finding | Grade |
|---|---|---|
| Structure | `<nav class="header header--page-index">` inside `#fix-stage` | OBSERVED |
| Parts | `.logo`, `.navi`, `.lang-menu > .lang-menu_wrap > .toggle-lang`, `<button class="toggle-menu"><div class="lines">` | OBSERVED |
| Menu overlay | `.menu > .bg + .container + .cover` — three stacked layers | OBSERVED |
| Menu contents | `<h2 class="title">CONTENTS</h2>`, `.links1`, `.links2`, `ul.sns`, `ul.other`, `.langs.langs--nav` | OBSERVED |
| Menu type | **Full-screen overlay** (`.bg` backdrop + `.cover` reveal layer) | INFERRED from structure |
| Open/close mechanism | Vue click handler on `.toggle-menu` (scoped `data-v-6e22488c`) | OBSERVED |
| Exact open/close tween | **UNKNOWN — insufficient evidence.** Animated from a Vue component; I could not isolate the tween without rendering | UNKNOWN |
| Hamburger icon | `.lines` div — CSS bar transform | OBSERVED (markup); animation UNKNOWN |
| Technique | **Not** `clip-path` (0 uses), **not** `backdrop-filter` (0), **not** `mix-blend-mode` (0). Therefore opacity + transform | OBSERVED (by exclusion) |
| Language switcher | `.langs--current-en` state class; `<li><a hreflang="...">` per locale, rendered from a Vue list | OBSERVED |
| Footer nav | Mirrors the overlay: `.links1`, `.links2`, `ul.sns`, `ul.other`, `.langs--footer`, `.btn-pagetop`, `.copyright`, `.logo` | OBSERVED |
| Page-top button | `.btn-pagetop > button` → `glScroll.pageTop()` | OBSERVED |
| Active states | `header--page-index` modifier indicates current route | OBSERVED |
| Focus states | **None.** `outline:0` globally with essentially no replacement | OBSERVED |

The logo is a **large inline SVG with hand-drawn vector outlines** (1020×375 viewBox, `fill-rule="evenodd"` glyph paths) rather than a font or an image — the wordmark is converted to outlines and inlined. **OBSERVED.**

---

## 11. Typography System

### Families — **OBSERVED**

| Family | Source | Role | Weights available |
|---|---|---|---|
| **franklin-gothic-atf** | Adobe Typekit kit `hao5bow` | Primary sans — UI, body, labels | 200, 300, 400, 500, 600 |
| **ivyora-display** | Adobe Typekit kit `hao5bow` | **Display serif** — headings, editorial moments | 300, 400, 500, 700 |
| **Noto Sans JP / Noto Sans SC** | Google Fonts | CJK coverage | 100–900 variable |
| **Noto Sans** | Google Fonts | Latin fallback | 100–900 variable, + italic |

The pairing is the core of the identity: **a high-contrast display serif (ivyora-display) against a wide, neutral grotesque (franklin-gothic-atf)**. That contrast — editorial serif over industrial sans — is what reads as "premium branding agency" rather than "tech startup". This is an *inspirational* takeaway; the specific fonts are licensed to Bravis's Typekit kit and **must not be reused**.

Google Fonts is loaded with `display=swap`. Typekit is not. **OBSERVED.**

### Scale, spacing, line height

**UNKNOWN — insufficient evidence.** Extracting the true responsive type ramp requires computed styles from a rendered page at each breakpoint, which I could not obtain. What I can state:

- There are **no CSS custom properties anywhere** in any stylesheet — zero `--*` declarations. **OBSERVED.** The type scale is hardcoded per selector per media query, not tokenised. This is a maintenance weakness we should *not* copy.
- Viewport-relative sizing is used at least for the preloader logo (`43vw` below 767 px). **OBSERVED.**
- Homepage headline type is **not text at all** — it is baked into textures (`dom_title_en.png`, `top_features_en.png`). **OBSERVED.** So the largest type on the site has no CSS at all, and no accessible text equivalent.

---

## 12. Color System

**OBSERVED** — frequency across all served CSS:

| Colour | Uses | Role |
|---|---|---|
| `#fff` / `#ffffff` | 39 | Dominant text/UI — white over the coloured fluid |
| `#000` | 8 | Text on light surfaces |
| **`#e50012`** | 7 | **Brand red** — preloader background, accents |
| `rgba(255,255,255,0.3)` | 5 | Hairline rules, dividers |
| `rgba(255,255,255,0.8)` / `0.7` / `0.2` | 5 | Layered translucent UI |
| `#eee` | 3 | Light surface (also the WebGL clear colour, `0xEEEEEE`) |
| `rgba(255,0,0,0.2)` / `0.3` | 3 | Red glows/states |
| `#f1f1f1`, `#ccc`, `#999`, `#666` | 5 | Neutral grey ramp |

**WebGL-side colours — OBSERVED:**
- `setClearColor(0xEEEEEE, alpha 0)` — transparent canvas; the CSS background shows through.
- `baseCol: new THREE.Color(0xEFEFEF)` in `bg_frg` (largely superseded by the LUT sample).
- The actual perceived palette comes from **`bgColor.webp`** — a soft iridescent/holographic pastel field.

**The system in one line:** a near-monochrome white/near-white/grey interface with a single saturated red accent, floating over a slowly-drifting iridescent pastel field. All the colour excitement lives in the WebGL layer; the CSS palette is deliberately almost neutral so the two never compete.

Opacity ladder in use: **0.2 / 0.3 / 0.7 / 0.8**, plus `0.03` for the grain overlay and `0.13`/`0.11` for noise/cursor light contributions in-shader. **OBSERVED.**

---

## 13. Layout / Grid System

### Breakpoints — **OBSERVED**, by frequency

| Query | Rules | Role |
|---|---|---|
| `max-width: 767px` | 46 | **Primary mobile** |
| `max-width: 1279px` | 44 | **Primary tablet / small desktop** |
| `max-width: 600px` | 25 | Small phone |
| `max-width: 1200px` | 11 | Layout tightening |
| `max-width: 1280px` | 4 | |
| `max-width: 900px` + `orientation: portrait` | 6 | Portrait tablet |
| `max-width: 1000px` + `orientation: landscape` | 3 | Landscape phone/tablet |
| 1300 / 1500 / 1599 / 1600 / 1700 / 1800 | 1–2 each | Large-screen refinements |
| `min-width: 1500px`, `min-width: 1800px` | 1 each | The only min-width queries — **desktop-first** |

**Two independent breakpoint systems exist**, and they do not agree:

| System | Values | Where |
|---|---|---|
| CSS | 600 / 767 / 900 / 1200 / **1279** / 1280 / 1500–1800 | Stylesheets |
| **WebGL engine** | `_border0 = 600`, `_border1 = 1280` | `glMain` **OBSERVED** |

The engine's `_border0 = 600` gates layout branches like `if (_world._width > _border0) {…} else {…}`. So **CSS breaks at 767 while WebGL breaks at 600** — a genuine inconsistency in the reference. **We should unify these in Crovion**, sharing one source of truth between CSS and JS.

### Device classification — **OBSERVED**

Notably **not** UA sniffing:
```js
const minDim = Math.min(screen.width, screen.height);
const ratio  = minDim / Math.max(screen.width, screen.height);
_device = minDim < 600            ? 'SP'    // phone
        : (ratio >= 0.68 && ratio <= 0.76) ? 'TB'   // tablet, by aspect ratio
        : 'PC';
```
UA is consulted only to set `isWindows`. Using `screen` dimensions + aspect ratio is more robust than UA strings, though it misclassifies touch-capable laptops as PC (which here means they *get* the cursor effect — arguably correct).

### Containers
`.container`, `.wrapper`, `#scrollFix.container`. Only 2 `position:fixed` declarations in all CSS. **OBSERVED.** Exact max-widths and gutters: **UNKNOWN — insufficient evidence** without computed styles.

### Notable absences — **OBSERVED**
`clip-path` 0 · `backdrop-filter` 0 · `mix-blend-mode` 0 · `filter:blur` 0 · `will-change` 0 · CSS custom properties 0.

**This is a genuinely important finding.** The CSS is almost aggressively plain. Every organic, blurred, blended or masked effect on the site is done in WebGL. Nothing is faked with CSS filters — which is exactly why the site performs well, since `backdrop-filter` and CSS `blur()` on large surfaces are among the most expensive things a browser can composite.

---

## 14. Asset Architecture

### WebGL textures — downloaded and measured. **OBSERVED.**

| Asset | Format | Dimensions | Size | Purpose | Notes |
|---|---|---|---|---|---|
| `burash.webp` | WebP | 512×512 | 24 KB | **Cursor trail brush** | Soft irregular ring; its alpha *is* the falloff curve |
| `bgColor.webp` | WebP | 1024×1024 | **8.5 KB** | **Gradient LUT** | Iridescent pastel; tiny because smooth gradients compress |
| `bgBall.webp` | WebP | 512×512 | 35 KB | Background blob sprites | Atlas |
| `bgParticle.webp` | WebP | 64×64 | 2 KB | Ambient particles | |
| `frontBall.webp` | WebP | 1024×1024 | 22 KB | Foreground blob atlas | 2×2 (`mapScale 0.5`) |
| `frontBall_top.webp` | WebP | 1024×1024 | 44 KB | Alt foreground atlas | |
| `jointBall.webp` | WebP | 512×512 | 11 KB | **Liquid bridge sprites** | |
| `jointBall_blur.webp` | WebP | 512×512 | 61 KB | Softened bridge variant | |
| `ball0–3_bg/front.webp` | WebP | 540×540 | ~9 KB ea | The 8 node blobs (4 designs × 2 layers) | |
| `sand.webp` | WebP | 512×512 | **193 KB** | Grain/texture overlay | **Largest texture — high-entropy noise resists compression** |
| `feature_s5ball.webp` | WebP | 540×540 | 11 KB | Features-scene blob | |

**Every texture is WebP and power-of-two (64/512/1024)** except the 540×540 ball sprites. **OBSERVED.** POT dimensions matter — they permit mipmapping and `RepeatWrapping` in WebGL1 without silent downscaling.

**Sprite atlasing — OBSERVED.** `mapScale: 0.5` with per-instance `suv` offsets computed as `(n%2)*0.5, floor(n/2)*0.5` packs **4 variants into one 2×2 atlas**; some layers use `0.5 / (1/3)` for a **2×3, 6-variant** atlas. One texture bind, one draw call, N visual variants.

### Other asset classes — **OBSERVED**

| Class | Finding |
|---|---|
| **Shaders** | 24 `.js` files, `/en/static/gl/shader/` — 174 B to 3.5 KB. Loaded as text at runtime into `_shaderMap`, retrieved by fuzzy name match (`getShader`) |
| **SVG** | Preloader logo, `safari-pinned-tab.svg`, and the footer wordmark **inlined as vector outlines** |
| **Icons** | Favicon set: 16/32/192/256, `apple-touch-icon` |
| **Fonts** | Typekit (`use.typekit.net/hao5bow.css`) + Google Fonts, `display=swap` on Google only |
| **Content images** | Raw WordPress uploads. **No `srcset`, no `<picture>`, no CDN transform, minimal `loading="lazy"`** — a genuine weakness |
| **Video** | **None found** on any route inspected |
| **3D models / JSON** | `glJsonLoader` and `_modelMap` exist in the engine, but no model files were referenced on the routes examined. **UNKNOWN** whether other routes use them |
| **Lottie / animation files** | None |

### Loading strategy — **OBSERVED**
`glPartsMng` implements a **custom loader with `_pipeline = 4`** — a fixed 4-way concurrency limit — over `_imgMap`, `_texMap`, `_modelMap`, `_shaderMap`, tracking `_imgNum`/`_imgLoadedNum` to drive the preloader. A `_firstItem` list defines the critical set (all shaders + core textures) that must land before the red curtain lifts.

---

## 15. Responsive Architecture

> **Caveat, stated plainly:** without browser emulation I have the *rules* and the *authored values*, not rendered measurements. Per-breakpoint typography and spacing are **UNKNOWN**. I would rather leave that gap visible than fill it with plausible-sounding numbers.

### What is definitively known

**1. Mobile is a separately authored composition, not a scaled desktop.** Every homepage node carries a distinct `sp:` block (§4). Total journey compresses **3980 → 3022 px (−24%)**, scales drop ~50%, and node 7 relocates from 0.82 → 0.72. **OBSERVED.** Some elements are pushed deliberately offscreen on mobile with sentinel values (`x: -100, y: 20000`) — i.e. **the design drops elements on small screens rather than shrinking everything.** **OBSERVED.**

**2. The cursor fluid interaction is fully disabled on touch.** **OBSERVED, and this is the most important responsive fact in the study:**
```js
// glEvent.contentsStart
if (_glMain._device == 'PC') {
    document.addEventListener('mousedown', …);
    document.addEventListener('mousemove', …);
    document.addEventListener('mouseup',   …);
} else {
    document.addEventListener('click', …);   // clickWave ONLY
}

// glEvent.mouseMove — belt and braces
if (_device != 'PC') { this._effectX = 0; this._effectY = 0; }
```
Touch users get: the ambient radial ripple, noise drift, colour drift, scroll-velocity coupling, and **click ripples** — but **no cursor trail**. The trail degrades to nothing, and because the ambient motion is always on, its absence is not legible as "something is broken".

**3. DPR is clamped, inversely to expectation.** **OBSERVED:**
```js
_pixelRatio = (_device != 'PC' && devicePixelRatio > 1)
            ? Math.min(devicePixelRatio, 1.5)
            : 1;                                    // PC is FORCED to 1
```
Desktop Retina renders at **1×**. Mobile gets up to 1.5×.

**4. Blur resolution follows from that, and inverts too.** `blurScale = (pixelRatio >= 1.2) ? 0.9 : 0.6`. **OBSERVED.** So desktop blurs at **0.6×** viewport and mobile at **0.9×** — because mobile's higher DPR would otherwise make the blur too coarse relative to physical pixels. Net GPU cost stays comparable across devices.

**5. Orientation-aware rotation.** In `glFeatureTitle.onResize` the title mesh is **rotated −90°** below `_border0`, scaled from `window.innerHeight` instead of width. **OBSERVED.** A landscape-composed element is re-hung vertically on phones rather than shrunk.

**6. `100svh` is used** for the features deck — correct small-viewport handling for mobile browser chrome. **OBSERVED.**

**7. Scroll implementation forks entirely by device** — Lenis + native on PC, custom transform + momentum on touch (§8.3). **OBSERVED.**

**8. Orientation media queries exist** for portrait tablet (≤900px portrait, 6 rules) and landscape phone (≤1000px landscape, 3 rules). **OBSERVED.**

### Per-viewport table

| Viewport | CSS regime | Engine regime | Known changes |
|---|---|---|---|
| 1440 / 1280 px | Base (>1279) | PC, DPR 1, blur 0.6 | Full desktop composition; ball scale factor `width/1920` above 1200 px **OBSERVED** |
| 1024 px | ≤1279 rules | PC | Preloader logo 412→260 px **OBSERVED**; rest UNKNOWN |
| 768 px | ≤1279 (767 not yet triggered) | PC or TB by aspect | UNKNOWN |
| 480 / 390 / 375 px | ≤767 **and** ≤600 | **SP** — `_width < _border0` branch | `sp:` coordinates active; logo 43vw; **no cursor trail**; custom touch scroll; title rotated −90° **OBSERVED** |

Typography, spacing and image sizing at each step: **UNKNOWN — insufficient evidence.**

---

## 16. Accessibility

**This is the reference's weakest dimension by a wide margin, and the section where we should most deliberately diverge.** All findings **OBSERVED**.

| Check | Homepage | About | Assessment |
|---|---|---|---|
| `<h1>` | **0** | 1 | Homepage has **no `<h1>`** — its headline is a texture |
| `<main>` landmark | **0** | **0** | Absent site-wide |
| ARIA attributes | **0** | **0** | **Zero across the entire site** |
| `role=` | 0 | 1 | Essentially unused |
| `tabindex` | 0 | 0 | No managed focus order |
| Focus styles | `outline:0` + one `:focus` selector | same | **Focus indicators removed and not replaced** |
| Skip link | none | one token | Not a working pattern |
| `alt` text | 3 imgs, 1 empty | 46 imgs, **32 empty** | Most content images marked decorative |
| `srcset` / `<picture>` | 0 | 1 | No responsive images |
| `loading="lazy"` | 0 | 1 | Essentially eager-loading everything |
| `lang` | present | present | ✅ Correct, with `hreflang` on locale links |
| `prefers-reduced-motion` | **site-level: none** | — | The single hit in the bundle belongs to **Splide.js 4.1.4's** internals (`"(prefers-reduced-motion: reduce)"`), not to Bravis's own code |

### The two failures that matter most

1. **`outline:0` with no replacement.** Keyboard users cannot see where they are. This is a WCAG 2.4.7 failure and it is trivial to fix with `:focus-visible`.
2. **No reduced-motion path on a site that is entirely motion.** Continuous ripples, drifting noise, scroll-coupled parallax and a spinning preloader, with no way to opt out. For motion-sensitive and vestibular-disorder users this is genuinely inaccessible.

Additionally: because the homepage is 100% WebGL, it presents **no text content at all** to screen readers *or* to search engines. Bravis mitigates the SEO half via `<meta description>` and OG tags — but there is no accessibility mitigation.

### What to retain vs. fix in Crovion

**Retain:** `lang`/`hreflang` correctness; explicit `width`/`height` on images (prevents CLS); semantic heading hierarchy on DOM-based pages; real `<button>` elements.

**Fix — non-negotiable for Crovion:**
- A real `<h1>` on every route, including any WebGL-first page. Visually-hidden if necessary.
- `<main>`, `<nav>`, `<footer>` landmarks + a working skip link.
- **`:focus-visible` styles everywhere.** Never `outline:0` without a replacement.
- **A genuine `prefers-reduced-motion` path** (see §23.18): freeze ambient ripple/noise, disable the trail, keep a static composition. This is a hard requirement, not a nice-to-have.
- Meaningful `alt` on content images; `alt=""` only for genuinely decorative ones.
- `aria-expanded` / `aria-controls` on the menu toggle; focus trap and `Esc` to close in the overlay.
- Canvas marked `aria-hidden="true"` with the real content available as DOM text.

---

## 17. Performance Architecture

The engineering here is the most instructive part of the reference. **All OBSERVED.**

### 17.1 One RAF loop for the entire application

```js
animationType1() {
    this.animationLoop();
    this._anim = requestAnimationFrame(() => _glMain.animationType1());
}
// fallback for ancient browsers
animationType2() { this.animationLoop(); setTimeout(…, 1000/60); }
```
Every animated object registers itself into a single `_enterFrameList` via `addEnterFrame(target, 'methodName')` and is removed via `removeEnterFrame` when idle. **There is exactly one RAF in the app.** Objects that finish animating unregister themselves (e.g. a trail ring at `opacity <= 0.002`), so the loop shrinks when the page is calm.

An `isFrameLock` guard prevents list mutation during iteration.

### 17.2 Frame-rate independence — the best idea in the codebase

```js
let inst = (now - oldTime) / 1000 / 0.016;   // 1.0 @60fps, 2.0 @30fps
if (inst >= 20) inst = 20;                    // clamp: survive tab-restore spikes
this._d  = 0.95 * this._d + 0.05 * inst;      // LOW-PASS the delta itself
this._d2 = 1 / this._d;

// precomputed lerp coefficient pairs, ONCE per frame, for the whole app
this.s099a = 1 - 0.01 * this._d;  this.s099b = 1 - this.s099a;
this.s098a = 1 - 0.02 * this._d;  this.s098b = 1 - this.s098a;
this.s090a = 1 - 0.10 * this._d;  this.s090b = 1 - this.s090a;
// … s096, s095, s085, s080, s075, s070, s060, s050
```

Usage everywhere: `x = x * conf.s090a + target * conf.s090b`.

**Three things are right about this:**
1. **Smoothing the delta itself** (`0.95/0.05`) prevents a single janky frame from visibly kicking every animated value — the classic failure of naive `dt` multiplication.
2. **Clamping at 20** prevents the "return to a background tab and everything teleports" bug.
3. **Precomputing the coefficient table once per frame** means hundreds of objects do one multiply-add each instead of recomputing `Math.pow(k, dt)`. With ~21 joint instances + 30 trail rings + particle systems all smoothing every frame, this is a real saving.

### 17.3 Deliberate resolution sacrifices

| Buffer | Resolution | Rate |
|---|---|---|
| Main canvas | viewport × **DPR 1 on desktop**, ≤1.5 on mobile | 60 fps target |
| Noise RT | 512×512 fixed | **30 fps (every other frame)** |
| Mouse effect RT | **½ viewport** | 60 fps |
| Blur RTs | **0.6×** viewport desktop / 0.9× mobile | 60 fps |

The noise texture updating at half rate is invisible because it is a slowly-drifting low-frequency field consumed at 13% and 6.5% strength.

### 17.4 Draw-call minimisation
`THREE.InstancedMesh` for every repeated element — joints (21), front balls, particles, related-project blobs. Combined with atlasing (§14), a whole particle field is **one draw call**. **OBSERVED.**

### 17.5 Other measures
- `antialias:false` — free, and lossless here (§5).
- `PlaneGeometry(w, h, 1, 1)` everywhere — **4 vertices**, since all deformation is fragment-side.
- Resize mutates `geometry.attributes.position.array` in place + `needsUpdate = true` rather than reallocating geometry. **OBSERVED.**
- `depthWrite: false` on particle layers to avoid sorting artifacts.
- `frustumCulled = false` on `Points` systems — skips useless culling math for full-screen fields.
- `gsap.killTweensOf(target)` before **every** new tween — prevents tween accumulation, the classic GSAP memory/behaviour leak. This is done consistently, everywhere. **OBSERVED.**
- Resize is debounced through `_resizeTimer`; `isFirstResize` and `_oldWidth` guard against mobile browser chrome show/hide firing spurious resizes.

### 17.6 Requested performance table

| Metric | Finding | Grade |
|---|---|---|
| **DESKTOP** | Single RAF; 6 render passes/frame; DPR forced to 1; blur at 0.6× | OBSERVED |
| **TARGET FPS** | 60 (Δt normalised to 0.016 s; `setTimeout` fallback at 1000/60) | OBSERVED |
| **MOBILE** | DPR ≤1.5; blur 0.9×; **cursor trail disabled**; custom touch scroll | OBSERVED |
| **GPU LOAD** | Dominated by 2×31-tap blur at 0.6–0.9× viewport + 6 full-screen passes | INFERRED |
| **CPU LOAD** | Low — no physics, no sim; per-frame work is multiply-adds over a small object list | INFERRED |
| **DPR HANDLING** | Clamped: 1 on PC, `min(dpr, 1.5)` elsewhere | OBSERVED |
| **RESIZE** | Debounced; in-place attribute mutation; all RTs `setSize`d; ortho frusta rebuilt | OBSERVED |
| **EVENT HANDLING** | 3 px dead zone + ~4-frame emission throttle + `isTransition` suppression | OBSERVED |
| **RAF LOOP** | One global loop, self-registering/deregistering targets | OBSERVED |
| **MEMORY** | Fixed pools (30 trail rings, 2 click rings); no per-event allocation; `killTweensOf` discipline | OBSERVED |
| **Actual measured FPS** | **UNKNOWN — insufficient evidence** (no browser available) | UNKNOWN |

### 17.7 Where the reference is genuinely inefficient
- **Two full copies of GSAP** (3.7.1 global + 3.12.5 bundled) — ~63 KB of pure duplication. **OBSERVED.**
- **346 KB unsplit WebGL engine** loaded on every route, including text-only pages like `/privacy-policy/`. **OBSERVED.**
- **24 separate shader HTTP requests**, each 174 B–3.5 KB. Should be one bundle. **OBSERVED.**
- **`sand.webp` is 193 KB** — 8× the next-largest texture. **OBSERVED.**
- **Content images unoptimised**: raw WordPress uploads, no `srcset`, minimal lazy-loading. **OBSERVED.**

---

## 18. Technology Stack Investigation

### Confirmed stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | **Nuxt 3.12.5** (Vue 3) | 3.12.5 |
| Rendering mode | **SSG** — static files via nginx | — |
| CMS | **Headless WordPress** | — |
| 3D | **Three.js r138** | 138 |
| Animation (WebGL) | **GSAP 3.7.1** (global) | 3.7.1 |
| Animation (DOM) | **GSAP 3.12.5** (bundled) + ScrollToPlugin | 3.12.5 |
| Smooth scroll | **Lenis** | UNKNOWN |
| Carousel | **Splide.js** | 4.1.4 |
| Custom engine | `glmain.min.js` — ~90 classes, 346 KB | — |
| Shaders | 24 hand-written GLSL files | — |
| Fonts | Adobe Typekit + Google Fonts | — |
| Analytics | Google Analytics 4 (`G-1KZ4N8JG7V`) | — |
| Anti-spam | reCAPTCHA v3 | — |
| Server | nginx, HTTP/2 | — |

### Explicitly ruled out — **OBSERVED by zero occurrences**
React · Next.js · Framer Motion · Barba.js · locomotive-scroll · Swiper · PixiJS · WebGPU · **GSAP ScrollTrigger** · IntersectionObserver · Tailwind · CSS custom properties · any CSS-in-JS

---

## 19. Evidence Table

| Technology | Evidence | Confidence | Purpose |
|---|---|---|---|
| Nuxt 3.12.5 | `/en/_nuxt/*.js`, `/en/_payload.json`, `version:"3.12.5"` in bundle | **HIGH** | SPA routing, components, hydration |
| Vue 3 SFC | `data-v-26de9de8`-style scoped attrs throughout markup | **HIGH** | Component styling |
| Static generation (SSG) | nginx + `last-modified: Tue, 23 Jun 2026`, `etag`, `content-length` on HTML | **HIGH** | Pre-rendered flat files |
| Headless WordPress | `robots.txt` → `/manage/{ja,en,kr,cn}/wp-admin/`; images from `/manage/en/wp-content/uploads/` | **HIGH** | Content management |
| Three.js r138 | `<script src="/en/static/assets/js/lib/three.min.138.js">` | **HIGH** | WebGL abstraction |
| GSAP 3.7.1 | `/en/static/assets/js/lib/gsap.min.js` → `GSAP 3.7.1` | **HIGH** | WebGL uniform/property tweening |
| GSAP 3.12.5 | `version:"3.12.5"` inside Nuxt bundle | **HIGH** | DOM animation |
| GSAP ScrollToPlugin | `ScrollToPlugin` + 32 `scrollTo` hits in bundle | **HIGH** | Programmatic scroll |
| **ScrollTrigger NOT used** | 0 hits for `scrub`/`pinSpacing`/`toggleActions`/`scrollerProxy`/`onRefresh` | **HIGH** | — |
| Lenis | 13 hits incl. `data-lenis-prevent`, `lenis-stopped`, full class body | **HIGH** | Desktop smooth scroll |
| Splide.js 4.1.4 | `Splide.js Version : 4.1.4 License : MIT Copyright: 2022 Naotoshi Fujita` | **HIGH** | Carousels |
| Custom GLSL (24 files) | All 24 downloaded HTTP 200 from `/en/static/gl/shader/` | **HIGH** | Fluid, blur, noise, particles |
| Metaball = blur + threshold | `display_frg.js:55` → `col1.a * 80.0 - 10.0` | **HIGH** | Organic merging |
| Separable Gaussian blur | `middle_frg` (uStep.x) + `blurStage_frg` (uStep.y), 16 weights each | **HIGH** | Softening for threshold |
| Ashima/stegu simplex noise | Full MIT header + `snoise(vec3 v)` in `noise_frg.js` | **HIGH** | Animated noise texture |
| Fragment-only deformation | All `*_vtx.js` are pass-through; no displacement | **HIGH** | Cheap deformation |
| Cursor = rasterised stamps | `glMfObj` + `glRingObj` + `burash.webp` → `mEffect` RT | **HIGH** | Trail displacement map |
| Cursor disabled on touch | `if (_device == 'PC')` guard + `_effectX = 0` fallback | **HIGH** | Mobile perf |
| DPR clamped to 1 on desktop | `_pixelRatio = 1` unless non-PC | **HIGH** | GPU budget |
| Noise RT at 30 fps | `isRender` boolean toggle in `glNoiseSet.enterFrame` | **HIGH** | GPU budget |
| Single global RAF | `animationType1` + `_enterFrameList` | **HIGH** | Frame orchestration |
| Δt-normalised lerp table | `glConfig.enterFrame`, `s099a`…`s050b` | **HIGH** | Frame-rate independence |
| Canvas persists across routes | `#gl-world` outside `#contents`; only innerHTML cleared | **HIGH** | Visual continuity |
| Page transition = 0.2 s fade | `gsap.to(page, .2, {opacity: 0})` | **HIGH** | Route change |
| Typekit fonts | `use.typekit.net/hao5bow.css` → franklin-gothic-atf, ivyora-display | **HIGH** | Typography |
| Brand red `#e50012` | 7 CSS uses incl. `.gl-loading-bg` | **HIGH** | Accent + preloader |
| Breakpoints 767 / 1279 | 46 and 44 media-query rules | **HIGH** | Responsive |
| Engine breakpoints 600 / 1280 | `_border0 = 600`, `_border1 = 1280` | **HIGH** | WebGL layout |
| No ARIA / no `<h1>` on home | 0 `aria-`, 0 `<h1>` in served homepage HTML | **HIGH** | A11y gap |
| No site-level reduced-motion | Only hit belongs to Splide's internals | **HIGH** | A11y gap |
| GA4 + reCAPTCHA v3 | `gtag/js?id=G-1KZ4N8JG7V`; `recaptcha/api.js?render=…` | **HIGH** | Analytics / anti-spam |
| Menu is full-screen overlay | `.menu > .bg + .container + .cover`; 0 `clip-path` | **MEDIUM** | Nav (structure seen, tween not) |
| Menu open/close tween | Vue-driven; not isolated | **UNKNOWN** | — |
| Per-breakpoint type scale | Requires computed styles | **UNKNOWN** | — |
| Measured FPS | Requires a browser | **UNKNOWN** | — |

---

## 20. Observed vs Inferred Behavior

### OBSERVED — read directly from source
Nuxt 3.12.5 + Vue 3 + SSG + headless WordPress · Three.js r138 · two GSAP copies · Lenis · Splide 4.1.4 · no ScrollTrigger · no IntersectionObserver · all 24 shaders and their exact contents · `α*80−10` metaball threshold · 31-tap separable Gaussian · Ashima simplex noise at 30 fps · fragment-only deformation · 30-ring cursor stamp pool with 3 px dead zone and 4-frame throttle · 2-slot click ripple with exact GSAP timings · cursor fully disabled on touch · DPR clamped to 1 on desktop · blur at 0.6×/0.9× · single global RAF · Δt-normalised lerp table · empty homepage `#contents` · 8 ball coordinates + mobile variants · 7 joint connections · 0.2 s page fade with persistent canvas · `#e50012` preloader · Typekit families · breakpoint inventory · zero ARIA / zero `<h1>` on home / `outline:0` · all texture dimensions and formats.

### INFERRED — reasoned from observed evidence
- **Menu is a full-screen overlay** using opacity + transform — from `.bg`/`.cover` structure plus the *absence* of `clip-path`/`backdrop-filter`.
- **GPU cost is dominated by the blur passes** — from tap count × buffer resolution.
- **CPU load is low** — no simulation exists; per-frame work is arithmetic over a small registry.
- **Faster cursor movement yields sparser, longer trails** — because emission is time-throttled, not distance-throttled.
- **Awards live inside `/about/`** — no awards route exists and `/about/` is by far the largest page.
- **The 3% grain overlay is doing significant "premium" work** — design judgement, not measurement.

### UNKNOWN — insufficient evidence, not guessed
- Exact menu open/close tween (durations, easings, stagger).
- Per-breakpoint typography scale, line heights, letter spacing, container max-widths, gutters.
- Measured FPS, GPU frame time, memory on real hardware.
- Whether hover states exist on WebGL balls beyond the DOM layer.
- Lenis configuration values (duration, easing, `syncTouch`).
- Section-by-section content structure of `/reports/`, `/sdgs/`, `/recruit/`, `/contact/`.
- Whether `glJsonLoader`/`_modelMap` are used on any route.
- Real-device touch-scroll feel.

---

## 21. Recommended CROVION Architecture

### Guiding principle

The reference's lesson is **not** "use a big WebGL engine". It is:

> **One signature interaction, executed with unusual technical discipline, plus a deliberately plain everything-else.**

Their CSS has zero blur, zero blend modes, zero clip-paths. All the sophistication is concentrated in one place. We should copy that *allocation of effort*, and we should reach for **fewer** libraries than they used, not more.

### Current Crovion baseline (read-only inspection of `package.json`)

Already present: Next.js 16.2.10 · React 19.2.4 · three 0.185 · @react-three/fiber 9 · drei · @react-three/postprocessing · postprocessing · **lenis 1.3.25** · framer-motion 12 · animejs 4 · zustand 5 · Tailwind 4 · leva · stats.js · maath · react-use · @paper-design/shaders-react · @react-spring/three · glsl-noise · clsx · tailwind-merge · lucide-react.

**This is over-provisioned — there are four animation systems installed** (framer-motion, animejs, @react-spring/three, and GSAP-shaped needs). My strongest recommendation is subtraction.

### Recommendations

| Layer | Recommendation | Why |
|---|---|---|
| **Framework** | **Keep Next.js 16 + React 19.** Do **not** switch to Vite/Nuxt. | Already installed and working. Bravis chose Nuxt+SSG; Next's static export gives the identical benefit. Switching buys nothing and costs weeks. ⚠️ Per `AGENTS.md`, **read `node_modules/next/dist/docs/` before writing any Next-specific code** — this version has breaking changes vs. training data. |
| **Rendering** | **Static generation** for all content routes. | Bravis proves nginx-served static HTML is enough. No SSR runtime to operate. |
| **Component arch** | React function components; **WebGL scene graph declared in JSX via R3F, but all per-frame mutation through refs in `useFrame`.** Never `setState` per frame. | R3F gives declarative setup + automatic disposal. The imperative escape hatch gives Bravis-level control. Best of both. |
| **CSS** | **Tailwind 4** + a small hand-written token layer (CSS custom properties) for type scale, spacing, easings, durations. | Bravis's *absence* of tokens is a maintenance flaw — 44 hardcoded media-query blocks. We should tokenise what they hardcoded. |
| **3D** | **three + @react-three/fiber.** Keep. | Non-negotiable for the fluid. |
| **Animation (DOM)** | **framer-motion only.** | Already installed, React-native, handles page transitions and hover well. |
| **Animation (uniforms)** | **A ~40-line custom `tweenUniform` helper**, or animejs if a full library is wanted. **Do not add GSAP.** | GSAP's value here is tweening arbitrary object properties — which animejs already does and which is trivial to write. Adding a 3rd animation lib to reach parity with a reference that itself shipped two redundant copies would be repeating their mistake. |
| **ScrollTrigger** | **Do not use. Not needed.** | §8.2 — the reference achieves all of this without it. Velocity-coupled animation (§8.4) is *better* than scrubbing here and needs ~10 lines. |
| **Smooth scroll** | **Lenis.** Keep — already installed. | Exactly what the reference uses. Best-in-class, tiny. |
| **Reveals** | **IntersectionObserver** via a small `useInView` hook. | Cheaper and simpler than Bravis's manual per-frame math. One of the few places to improve on the reference. |
| **State** | **zustand** for cross-tree state (pointer, scroll velocity, reduced-motion, device class). | Lets DOM components and the R3F tree share state without prop drilling or context re-render storms. |
| **Page transitions** | **framer-motion `AnimatePresence`** over a **persistent canvas mounted in the root layout**. | The single most important structural decision — mirrors `#gl-world` outside `#contents`. §9. |
| **Postprocessing** | **Remove `@react-three/postprocessing` + `postprocessing`** unless bloom is genuinely needed. | Our blur/threshold chain is hand-rolled FBOs. A general-purpose effect composer is redundant weight. |
| **Remove** | `@paper-design/shaders-react`, `@react-spring/three`, `react-use` | The first is a black-box shader lib that will fight a custom pipeline; the second duplicates framer-motion/animejs; the third is a large grab-bag replaceable by 3–4 local hooks. |
| **Dev only** | `leva`, `stats.js` — keep, but **ensure they are excluded from production bundles**. | Essential for tuning shader constants; must not ship. |

### Net stack

**React 19 · Next 16 (static) · three + R3F · framer-motion · Lenis · zustand · Tailwind 4 · custom GLSL + custom FBO pipeline.**

That is **eight** dependencies doing what the reference does with eleven (including two GSAPs), and it drops the ~346 KB monolith in favour of route-split components.

---

## 22. CROVION Component Tree

Designed around the actual findings — note `webgl/passes/` as a first-class concept, because the multi-pass FBO chain (§6.2) is the architecture, not an implementation detail.

```
crovion/
├── app/                                  # Next.js routes (App Router)
│   ├── layout.tsx                        # ⚑ mounts <FluidCanvas> ONCE, outside page content
│   ├── page.tsx                          # Home
│   ├── work/
│   │   ├── page.tsx
│   │   └── [slug]/page.tsx
│   ├── studio/page.tsx
│   ├── journal/
│   │   ├── page.tsx
│   │   └── [slug]/page.tsx
│   ├── contact/page.tsx
│   └── globals.css
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── MenuOverlay.tsx               # focus trap + Esc + aria-expanded
│   │   ├── Footer.tsx
│   │   ├── Preloader.tsx                 # brand-colour curtain + progress
│   │   └── PageTransition.tsx            # AnimatePresence wrapper
│   ├── sections/
│   ├── work/
│   │   ├── ProjectCard.tsx               # data-blob-anchor → WebGL binding
│   │   └── ProjectGrid.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Link.tsx                      # transition-aware
│       └── ScrollReveal.tsx              # IntersectionObserver
│
├── webgl/
│   ├── FluidCanvas.tsx                   # <Canvas> root: dpr clamp, ortho cam, alpha
│   ├── FluidScene.tsx                    # orchestrates the pass chain
│   ├── passes/                           # ⚑ the architecture lives here
│   │   ├── NoisePass.tsx                 # 512², every OTHER frame
│   │   ├── PointerTrailPass.tsx          # ½-res stamp accumulation
│   │   ├── BlobPass.tsx                  # instanced sprites → FBO
│   │   ├── BlurPass.tsx                  # separable H then V
│   │   └── CompositePass.tsx             # threshold + displacement → screen
│   ├── objects/
│   │   ├── BlobNode.tsx                  # one node (bg + front layers)
│   │   ├── BlobChain.tsx                 # liquid bridges between nodes
│   │   └── Particles.tsx                 # InstancedMesh field
│   ├── shaders/
│   │   ├── passthrough.vert.glsl
│   │   ├── noise.frag.glsl
│   │   ├── blur.frag.glsl                # ONE shader, direction as a uniform
│   │   ├── composite.frag.glsl           # ⚑ the metaball threshold
│   │   ├── front.frag.glsl
│   │   ├── background.frag.glsl
│   │   └── lib/simplex3d.glsl            # Ashima/stegu — MIT, attribution retained
│   └── config/
│       ├── nodes.ts                      # ⚑ desktop + mobile coordinate sets
│       └── quality.ts                    # DPR, blur scale, pool sizes per tier
│
├── hooks/
│   ├── usePointer.ts                     # dead zone + throttle + normalisation
│   ├── useSmoothScroll.ts                # Lenis lifecycle
│   ├── useScrollVelocity.ts              # smoothed _scrollDis equivalent
│   ├── useResize.ts                       # debounced, visualViewport-aware
│   ├── useReducedMotion.ts               # live-reactive matchMedia
│   ├── useDeviceTier.ts                  # screen-based, per §13
│   └── useInView.ts                      # IntersectionObserver
│
├── lib/
│   ├── store.ts                          # zustand: pointer, scrollVel, tier, motion
│   ├── frame.ts                          # ⚑ Δt normalisation + lerp coefficient table
│   ├── tween.ts                          # minimal uniform tweener
│   └── easing.ts                         # easeOutQuart, easeInOutCirc
│
├── styles/
│   └── tokens.css                        # type scale, spacing, easings, durations
│
└── public/
    └── textures/                         # brush, gradient LUT, blob sprites, grain
```

**Two structural rules, both learned from the reference:**
1. **`<FluidCanvas>` mounts in `app/layout.tsx`, never inside a page.** If it remounts on navigation, the entire continuity effect is lost (§9).
2. **`webgl/config/nodes.ts` holds desktop *and* mobile coordinates as authored data**, exactly as Bravis does — mobile is re-composed, not scaled (§15).

---

## 23. Fluid Interaction Technical Specification

Our implementation. Follows the reference's *model* with three deliberate improvements: a real reduced-motion path, one blur shader instead of two, and cursor velocity actually used.

**1. Rendering surface** — `<canvas>` via R3F, `alpha: true`, `antialias: false`, `OrthographicCamera` at z=1000, transparent clear. Fixed, full-viewport, `pointer-events: none`, `aria-hidden="true"`, mounted in the root layout.

**2. Geometry** — `PlaneGeometry(w, h, 1, 1)` for every full-screen pass. **4 vertices.** All deformation is fragment-side. Blob sprites are `InstancedMesh` quads.

**3. Resolution**

| Buffer | Size | Update rate |
|---|---|---|
| Noise | 512×512 | **every 2nd frame** |
| Pointer trail | 0.5 × viewport | every frame |
| Blob | viewport × dpr | every frame |
| Blur ×2 | 0.6× (desktop) / 0.9× (mobile) | every frame |
| Composite | screen | every frame |

**4. Mouse coordinate system** — `pointermove` on `window` (not `mousemove` — covers pen and touch uniformly). Centre-origin: `px = clientX - w/2`, `py = clientY - h/2`.

**5. Normalisation** — to trail-buffer space: `tx = px * 0.5`, `ty = -py * 0.5` (Y flip for the RT).

**6. Cursor smoothing** — the reference does **not** smooth the cursor (it stamps raw positions and lets the stamps' lifetimes do the smoothing). **We adopt that** — it is correct and cheaper. Smooth only if the trail reads as jittery.

**7. Velocity** — **an improvement on the reference.** Bravis only uses velocity as a 3 px gate. We compute it and use it:
```ts
const vel = Math.hypot(px - prevX, py - prevY);
stamp.scale0   = lerp(0.2, 0.5, clamp(vel / 60, 0, 1));   // faster → bigger
stamp.opacity0 = lerp(0.6, 1.0, clamp(vel / 60, 0, 1));   // faster → stronger
```
This makes a flick feel different from a drift, which the reference does not deliver.

**8. Influence radius** — set by the brush texture's footprint × current scale (0.2 → 8). No math radius.

**9. Falloff** — **painted into the brush texture's alpha**, not computed. Ship an original irregular soft ring (see §27 — we must author our own, not reuse `burash.webp`).

**10. Displacement** — fragment stage:
```glsl
vec2 uv = vUv + sin(texture2D(uTrail, vUv).r) * uDisplaceAmt;   // ~0.025
```

**11. Noise** — Ashima/stegu 3D simplex (**MIT — retain the licence header**), `z += 0.008 * dt`, rendered to a 512² target at half rate, consumed for both UV drift and additive grain (~0.13).

**12. Damping** — Δt-corrected exponential smoothing via a precomputed coefficient table (§17.2):
```ts
// once per frame
const d = clamp(smoothed(delta / 0.016), 0, 20);
K.k098 = 1 - 0.02 * d;   // then: x = x * K.k098 + target * (1 - K.k098)
```

**13. Spring-back** — the reference has **none**, and I recommend we match it. Exponential decay reads as *fluid*; a spring with overshoot reads as *rubber*. Wrong material.

**14. Animation loop** — R3F's single `useFrame`, with `frameloop="always"`. Pass order strictly: noise → trail → blobs → blur H → blur V → composite. Never `setState` in the loop.

**15. Resize** — debounced ~150 ms; resize all FBOs; rebuild ortho frustum; mutate position attributes in place with `needsUpdate = true`. Ignore resizes where only height changed by < 100 px on touch (mobile browser chrome).

**16. DPR** — `min(devicePixelRatio, tier.maxDpr)`; **desktop capped at 1**, mobile at 1.5, matching the reference. Expose in Leva during development so the trade-off is a decision, not an accident.

**17. Mobile fallback** — no pointer trail (skip the trail pass entirely, bind the trail sampler to a 1×1 black texture); tap ripples retained; reduced blob/particle counts; ambient ripple and colour drift retained.

**18. Accessibility fallback** — **the reference has none; this is where we must diverge.** On `prefers-reduced-motion: reduce`:
- Freeze `uTime` (ambient ripple stops).
- Disable the trail and click ripples.
- Freeze noise (render once, never update).
- Render **one** static composed frame, then drop to `frameloop="demand"`.
- Keep the full visual composition — the design should not degrade, only the motion.
- Watch the media query live and restore on change.

**19. Performance optimisation** — instancing + atlasing; half-rate noise; sub-resolution blur; fixed object pools (no per-event allocation); `depthWrite: false` on particles; `frustumCulled = false` on full-screen fields; pause the loop when the canvas is off-screen or the tab is hidden.

### Pseudocode — per frame

```
// ── once per frame, shared by everything ─────────────────
d       = clamp(smooth(delta / 0.016), 0, 20)
K.k098  = 1 - 0.02 * d
K.k090  = 1 - 0.10 * d
scrollVel = scrollVel * K.k098 + (scrollY - scrollYPrev) * (1 - K.k098)

// ── input (desktop, non-reduced-motion only) ─────────────
on pointermove:
    p    = (clientX - w/2, clientY - h/2)
    vel  = |p - pPrev|
    if (|Δx| < 3 && |Δy| < 3) skip                   // dead zone
    if (framesSinceEmit >= 4 / d):                   // Δt-corrected throttle
        s = pool.next()                              // ring buffer of 30
        s.pos     = (p.x * 0.5, -p.y * 0.5)
        s.scale   = lerp(0.2, 0.5, clamp(vel/60,0,1))
        s.opacity = lerp(0.6, 1.0, clamp(vel/60,0,1))
        s.rot     = random() * TAU

// ── stamp lifetimes ──────────────────────────────────────
for s in pool.alive:
    s.rot     += 0.02 * d
    s.scale    = s.scale   * K.k098 + 8.0 * (1 - K.k098)
    s.opacity  = s.opacity * K.k098 + 0.0 * (1 - K.k098)
    if s.opacity <= 0.002: s.retire()

// ── pass chain ───────────────────────────────────────────
if (frameIndex % 2 == 0):
    uNoiseZ += 0.008 * d
    render(noiseScene → noiseFBO)                    // 512²

render(trailScene → trailFBO)                        // ½ res, accumulates
render(blobScene  → blobFBO)
render(blur, {src: blobFBO,  dir: (1/w, 0)} → blurA) // horizontal
render(blur, {src: blurA,    dir: (0, 1/h)} → blurB) // vertical

// ── composite (the metaball) ─────────────────────────────
uTime += (reducedMotion ? 0 : 0.01 * d)
render(composite, {
    tex:   blurB,
    noise: noiseFBO,
    trail: trailFBO,
    time:  uTime,
    scrollVel
} → screen)
```

### Composite fragment — the essential ~10 lines

```glsl
vec4 trail = texture2D(uTrail, vUv);
vec4 noise = texture2D(uNoise, vUv * uAspect);

vec2  uv = vUv + sin(trail.r) * 0.025;               // cursor displacement
vec2  p  = -1.0 + 2.0 * uv;
float s  = sin(-uTime + length(p * 14.0));           // ambient radial ripple
uv += uStrength * vec2(s, s);                        // uStrength ~0.004

vec4 c = texture2D(uTex, uv);

float alpha = c.a * uThreshold - uCutoff;            // ★ 80.0 / 10.0 → METABALL
vec3  rgb   = min(c.rgb + noise.r * 0.13 + trail.r * 0.11, 1.0);

gl_FragColor = vec4(rgb, alpha);
```

**Expose `uThreshold` and `uCutoff` in Leva.** Their ratio sets the isoline (`cutoff/threshold` = the alpha level at which the surface appears) and their magnitude sets edge hardness. This is *the* art-direction control for the entire look — 80/10 is Bravis's taste, and ours should be tuned independently, which also helps ensure the result is visually our own (§27).

---

## 24. Animation Specification

### Motion tokens

```css
--ease-out-quart:  cubic-bezier(0.165, 0.84, 0.44, 1);   /* primary */
--ease-in-out-circ: cubic-bezier(0.77, 0, 0.175, 1);      /* large moves */
--dur-fast:   0.2s;   /* colour, fill, small transforms  */
--dur-base:   0.3s;
--dur-slow:   0.4s;   /* opacity, larger transforms      */
```
Derived from the reference's CSS (§7.2). Two curves and three durations is a *complete* system — resist adding more.

### WebGL timing (mirroring observed reference values)

| Event | Property | Duration | Easing |
|---|---|---|---|
| Load complete | `uStrength` 0.01 → 0.004 | 1.5 s | easeInOutCubic |
| Enter view | `uAlpha` 0 → 1 | 1.8 s (0.5 s delay) | easeInOutQuad |
| Enter view | `noiseAlpha` 1 → 0 | 1.8 s | easeInOutQuad |
| Enter view | `scale` 1.2 → 1 | 2.0 s | easeOutQuad |
| Leave / transition | `uAlpha` → 0 | 0.6 s | easeInOutQuad |
| Leave / transition | `scale` → 0.85 | 0.6 s | easeInOutQuad |
| Click ripple | `opacity` 0→1, then →0 | 0.3 s, then 1.7 s | linear, easeInOutCubic |
| Click ripple | `scale` 1 → 8 | 2.0 s | easeOutCubic |
| Page fade | `#content` opacity → 0 | **0.2 s** | linear |

**The 0.2 s page fade against 1.8–2.0 s canvas moves is the key ratio.** The DOM gets out of the way fast; the canvas carries the perceived transition slowly. Inverting this would feel sluggish.

### Continuous ambient (never idle)
`uTime += 0.01·d` · `noiseZ += 0.008·d` · `colourDrift += 0.0026·d + 0.0004·scrollVel` (ping-pong ±0.8 with randomised X on wrap) · per-node float via `sin`.

**Always tween uniform *objects*, and always kill prior tweens on the same target before starting a new one** — the reference does this without exception and it is the difference between stable and progressively-degrading motion.

---

## 25. Implementation Roadmap

Sequenced so that the highest-risk item is proven before anything is built on top of it.

| Phase | Deliverable | Exit criterion |
|---|---|---|
| **0 — Foundations** | Read `node_modules/next/dist/docs/` per `AGENTS.md`. Prune dependencies (§21). Establish tokens, `lib/frame.ts`, zustand store, device tiers. | Clean build; one Δt source of truth. |
| **1 — Canvas shell** | `<FluidCanvas>` in root layout, ortho camera, DPR clamp, resize, Leva + stats wired. | Canvas survives client-side navigation without remounting. |
| **2 — ⚠ Metaball spike** | **Prove the whole thing early.** Blob FBO → blur H → blur V → threshold composite. Static blobs only. | Two separate blobs visibly **merge with a smooth neck**. **This is the make-or-break moment — do not proceed until it works.** |
| **3 — Ambient life** | Noise pass (half-rate), gradient LUT background, radial ripple, grain overlay. | Composition is alive with zero input; stable 60 fps. |
| **4 — Pointer system** | Trail FBO, 30-stamp pool, dead zone, throttle, velocity modulation, click ripple. | Trail reads as fluid; no allocation in the hot path. |
| **5 — Composition** | `nodes.ts` desktop + mobile sets; `BlobNode`; `BlobChain` bridges. | Nodes fuse into a chain while scrolling. |
| **6 — Scroll** | Lenis; `useScrollVelocity`; velocity→uniform coupling; `useInView` reveals. | Scrolling fast visibly energises the field. |
| **7 — Pages & transitions** | Routes, header, overlay menu, footer, `AnimatePresence` 0.2 s fade over the persistent canvas. | Navigation never interrupts the fluid. |
| **8 — Responsive** | Mobile composition, touch tuning, trail disabled on touch, `100svh`, orientation handling. | Real-device check on iOS + Android. |
| **9 — Accessibility** | `:focus-visible`, landmarks, `<h1>` on every route, ARIA on the menu, **full reduced-motion path**. | Keyboard-only pass + reduced-motion pass both clean. |
| **10 — Performance** | Texture budget, code splitting, preloader, profiling on mid-tier hardware. | 60 fps desktop; ≥30 fps mid-tier mobile; Lighthouse pass. |

**Phase 2 is the gate.** Everything downstream assumes the threshold trick works and performs. Prove it on real hardware before committing to the visual direction.

---

## 26. Risks / Technical Challenges

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Blur cost at high resolution.** Two 31-tap passes are the GPU budget. Naively at full res on a 4K display this will not hold 60 fps. | **HIGH** | Copy the reference exactly: cap DPR at 1 on desktop, blur at 0.6× viewport. Make tap count a tier-based constant. |
| 2 | **Threshold tuning is finicky.** `α*80−10` gives a 0.0125-wide edge band. Too steep → aliased, crunchy edges. Too shallow → mush, no merging. | **HIGH** | Expose both constants in Leva from day one. Tune against real sprites, not placeholders. |
| 3 | **FBO ping-pong inside R3F.** Multi-pass render-to-texture fights React's declarative model; render order and `setRenderTarget(null)` restoration are easy to get wrong. | **HIGH** | Use `createPortal` + `useFBO`; drive all passes from **one** `useFrame` with an explicit priority; always restore the render target. |
| 4 | **Reduced-motion is architectural, not a toggle.** Retrofitting it after the pass chain exists is painful. | **MEDIUM-HIGH** | Build it in Phase 2 as a first-class branch, not Phase 9. Phase 9 verifies; it does not implement. |
| 5 | **Mobile GPU/thermal limits.** Six passes per frame will throttle on mid-tier Android. | **MEDIUM-HIGH** | Tier system: fewer blobs, no trail pass, smaller FBOs, and an fps watchdog that degrades tier automatically. |
| 6 | **Canvas remount on navigation kills continuity** — the single easiest way to lose the entire effect. | **MEDIUM** | Mount in root layout only. Add a regression test asserting canvas identity across route changes. |
| 7 | **WebGL context loss** (tab backgrounding, mobile memory pressure). The reference has no visible handling. | **MEDIUM** | Handle `webglcontextlost`/`restored`; keep a CSS gradient fallback underneath. **Improve on the reference here.** |
| 8 | **Homepage with no text = no SEO, no screen-reader content.** If we copy the empty-`#contents` pattern we inherit this. | **MEDIUM** | Render real DOM text (visually-hidden where needed) alongside the canvas. Never let the canvas be the only content. |
| 9 | **Texture memory.** Several 1024² RGBA textures decompress to ~4 MB each in VRAM regardless of file size. | **MEDIUM** | Budget deliberately; prefer 512² where the source is soft; consider single-channel textures for masks/brushes. |
| 10 | **Four animation libraries currently installed** — bundle bloat and inconsistent easing vocabularies. | **MEDIUM** | Execute the §21 pruning in Phase 0, before any of it gets load-bearing. |
| 11 | **Next 16 API drift.** `AGENTS.md` explicitly warns this version differs from training data. | **MEDIUM** | Read `node_modules/next/dist/docs/` before writing route/layout code. Non-negotiable. |
| 12 | **Shader iteration is slow** without hot reload. | **LOW-MEDIUM** | Set up GLSL HMR + Leva-bound uniforms early; it pays for itself in Phase 2 alone. |

---

## 27. What NOT To Copy

### BRAVIS REFERENCE vs CROVION ORIGINAL

#### ✅ What we CAN legitimately take inspiration from

**Interaction philosophy** — one signature interaction executed with unusual discipline, rather than many micro-interactions. Cursor as a *persistent trace* in a medium rather than an instantaneous highlight.

**Technical technique** — blur + alpha-threshold metaballing; rasterising the pointer into a displacement buffer; fragment-only deformation; Δt-normalised lerp tables; velocity-coupled (not position-scrubbed) scroll animation; half-rate noise; DPR clamping; a persistent canvas outside the routed content. **These are general graphics-programming techniques, most of them long-published — the blur/threshold goo trick and Ashima/stegu simplex noise both predate this site and are freely available.**

**Motion principles** — exponential decay over springs; short DOM fades against long canvas moves; always-on ambient life; the 0.2 s / 1.8 s ratio.

**Information architecture patterns** — a homepage as a navigational journey rather than a marketing scroller; scale-as-hierarchy; serpentine composition; irregular vertical rhythm; separately authored mobile compositions.

**Design principles** — near-neutral UI palette so the generative layer carries all colour; display-serif against neutral-grotesque pairing *as a strategy*; a full-bleed branded preloader; a subtle grain unifier.

#### ❌ What MUST remain 100% original

| Category | Rule |
|---|---|
| **Brand** | Crovion's own name, logo, wordmark, and the inline SVG outlines. **Never** reuse Bravis's SVG paths. |
| **Colour** | `#e50012` is Bravis's brand red. Choose Crovion's own accent. The *strategy* (neutral UI + one accent) is transferable; the value is not. |
| **Typography** | `franklin-gothic-atf` and `ivyora-display` are licensed to Bravis's Typekit kit `hao5bow`. **We must license our own fonts.** The serif/grotesque *pairing strategy* is fair to adopt. |
| **Textures** | **Do not use `burash.webp`, `bgColor.webp`, or any `ball*.webp`.** Author our own brush, our own gradient LUT, our own blob sprites. These are original artwork. |
| **Code** | Do not copy `glmain.min.js` or reproduce their shader files verbatim. Write our own passes from the documented *model*. Where we use published algorithms (Ashima/stegu simplex), retain the MIT licence header. |
| **Constants** | `α*80−10`, `strength 0.004`, `size 14.0`, pool size 30, the 16 Gaussian weights — these are *their* art direction. Use them as starting points in Leva, then **tune to Crovion's own look**. Landing on identical values would be both a legal and a creative failure. |
| **Content** | All copy, project case studies, imagery, client names, report articles. |
| **Composition** | The 8-node coordinate table in §4 is *their* layout. Ours must be independently composed. |
| **Structure** | Do not replicate their sitemap. Crovion's IA should follow Crovion's services. |

**The test to apply:** *Could an informed observer see our site and Bravis's side by side and call ours a copy?* If yes, we have gone too far. We are taking a **technique** and a **philosophy** — not a design.

---

## 28. Final Recommended Stack

| Layer | Choice | Status | Rationale |
|---|---|---|---|
| Framework | **Next.js 16.2.10** | ✅ installed | Already in place; static export matches the reference's SSG. Read `node_modules/next/dist/docs/` first. |
| UI | **React 19.2.4** | ✅ installed | — |
| 3D | **three 0.185 + @react-three/fiber 9** | ✅ installed | Declarative setup, imperative `useFrame` control. |
| Helpers | **@react-three/drei** | ✅ installed | `useFBO` in particular. |
| Smooth scroll | **Lenis 1.3.25** | ✅ installed | Exactly what the reference uses. |
| DOM animation | **framer-motion 12** | ✅ installed | Page transitions, hover, `AnimatePresence`. |
| Uniform tweening | **custom `lib/tween.ts`** (or animejs) | ✅ available | ~40 lines. **Do not add GSAP.** |
| State | **zustand 5** | ✅ installed | Shared pointer/scroll/tier/motion state. |
| Styling | **Tailwind 4 + `styles/tokens.css`** | ✅ installed | Tokenise what the reference hardcoded. |
| Shaders | **Hand-written GLSL** + Ashima/stegu simplex (MIT) | — | The core of the work. |
| Dev tooling | **leva, stats.js** | ✅ installed | Dev-only; must not ship. |
| **Remove** | `@paper-design/shaders-react`, `@react-spring/three`, `react-use`, `@react-three/postprocessing`, `postprocessing` | ⚠️ | Redundant with, or actively obstructive to, a custom pass chain. |
| **Do NOT add** | **GSAP · ScrollTrigger · locomotive-scroll · Swiper · PixiJS** | ❌ | Nothing in the reference requires any of them. ScrollTrigger in particular is provably unnecessary — Bravis ships none. |

### The three decisions that matter most

1. **Persistent canvas in the root layout.** Everything about the site's continuity depends on it.
2. **Blur + alpha threshold, not distance fields.** Cheap, scalable, art-directable, self-antialiasing.
3. **Pointer rasterised into a buffer, not passed as a uniform.** Decouples the effect from input rate and gives persistence for free.

---

## Appendix A — Evidence Sources

All files were retrieved from the live production site on 2026-08-09 and analysed locally.

```
https://www.bravis.com/en/                                        (130 KB HTML)
https://www.bravis.com/en/{about,projects,features,recruit,
                            sdgs,contact,privacy-policy,reports}/
https://www.bravis.com/en/projects/kddi/
https://www.bravis.com/robots.txt
https://www.bravis.com/sitemap.xml                                (40 KB)
https://www.bravis.com/en/sitemap.xml                             (30 KB, 147 URLs)
https://www.bravis.com/en/_payload.json                           (66 KB)
https://www.bravis.com/en/_nuxt/BrkqG5qn.js                       (329 KB — Nuxt + Lenis + GSAP + Splide)
https://www.bravis.com/en/_nuxt/{10 route chunks}.js
https://www.bravis.com/en/_nuxt/{entry,common,Footer}.*.css
https://www.bravis.com/en/static/gl/js/glmain.min.js              (346 KB — the engine)
https://www.bravis.com/en/static/assets/js/lib/three.min.138.js
https://www.bravis.com/en/static/assets/js/lib/gsap.min.js        (63 KB — GSAP 3.7.1)
https://www.bravis.com/en/static/gl/css/base.css                  (38 KB)
https://www.bravis.com/en/static/gl/shader/*.js                   (all 24 GLSL files)
https://www.bravis.com/en/static/gl/image/*.webp                  (12 textures, measured)
https://use.typekit.net/hao5bow.css
```

**Key source citations**
- Metaball threshold — `display_frg.js:55` → `vec4 colB = vec4(col1.rgb, col1.a * 80.0 - 10.0);`
- Separable blur — `middle_frg.js` (`uStep.x`) + `blurStage_frg.js` (`uStep.y`), 16 weights, 31 taps each
- Simplex noise — `noise_frg.js`, Ashima Arts / stegu, MIT
- Cursor stamps — `glMfObj`, `glRingObj`, `glSelectRingObj` in `glmain.min.js`
- Δt lerp table — `glConfig.enterFrame` in `glmain.min.js`
- Touch disabling — `glEvent.contentsStart` / `glEvent.mouseMove`
- DPR clamp — `glWorld` renderer init
- Page transition — `glPageMng.transition`
- Homepage composition — `glTopMainBall.init`

---

## Appendix B — Open Questions Requiring Browser Automation

If a Playwright/Puppeteer MCP server is connected later, these are the specific gaps worth closing, in priority order:

1. **Menu open/close tween** — record durations, easings, stagger, and the reveal mechanism.
2. **Responsive typography ramp** — computed `font-size` / `line-height` / `letter-spacing` at 1440 / 1280 / 1024 / 768 / 480 / 390 / 375 px.
3. **Real FPS + GPU frame time** — desktop and throttled mobile, via CDP performance traces.
4. **Container max-widths and gutters** — computed box metrics.
5. **Ball hover states** — whether hovering a node changes anything beyond the DOM layer.
6. **Lenis configuration** — runtime inspection of the instance options.
7. **Per-section content structure** of `/reports/`, `/sdgs/`, `/recruit/`, `/contact/`.
8. **Real-device touch feel** — momentum tuning on iOS vs Android.

---

*End of study. No Crovion source files were created or modified. No dependencies were installed.*
