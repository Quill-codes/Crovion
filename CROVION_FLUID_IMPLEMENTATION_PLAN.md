# CROVION FLUID IMPLEMENTATION PLAN

**Date:** 2026-08-09
**Reference spec:** `BRAVIS_REFERENCE_ARCHITECTURE.md`
**Phase:** Audit + architecture proposal. **No implementation code written. No dependencies installed. No existing file modified.**
**Method:** Full read of every source file under `app/`, `components/`, `hooks/`, `lib/`, `src/`, `backup/`, plus `package.json`, `next.config.ts`, `tsconfig.json`, `AGENTS.md`, `app/globals.css`.

Every claim below carries a `file:line` citation. Nothing is inferred from file names.

---

## ⚠️ Read this first — one unresolved decision

There is a genuine conflict between two of your instructions, and I am flagging it rather than silently resolving it.

**§10 says:** do not change the existing visual object, the purple identity, or the composition.
**§8 asks for:** the Bravis target pipeline — orthographic 2D, textured sprites, blur, alpha threshold.

Those are not compatible in their pure forms. Bravis's pipeline has **no 3D geometry, no lights, no perspective camera and no shaded spheres**. Crovion's current hero is *entirely* 3D lit spheres under a perspective camera (`components/HeroCanvas.tsx:329`, `components/FluidBlob.tsx:626`). Porting the pipeline literally means deleting the thing §10 says to preserve.

I have therefore designed the target as a **three-stage path (§7)** where the pipeline is adopted *around* the existing spheres rather than instead of them, and only the final optional stage swaps the blob source. Stage A and Stage B change **zero DOM, zero typography, zero colour tokens** and keep the purple shaded spheres exactly as they are today — they gain the fluid *surface behaviour* on top.

**My recommendation: Stage A → Stage B, stop, evaluate. Do not commit to Stage C until B is on screen.**
This is the one question I need answered before coding starts. It is stated again in §21 and in the closing summary.

---

## 1. Current Architecture

### 1.1 Framework and build

| Item | Value | Evidence |
|---|---|---|
| Framework | Next.js **16.2.10**, App Router | `package.json:26` |
| React | **19.2.4** | `package.json:28` |
| Bundler | Turbopack (empty config object) | `next.config.ts:5` |
| Transpile | `transpilePackages: ["three"]` | `next.config.ts:4` |
| Path alias | `@/*` → repo root (**not** `src/`) | `tsconfig.json:22` |
| Styling | Tailwind **4** via `@theme` block, PostCSS | `app/globals.css:1-31`, `postcss.config.mjs` |
| Fonts | `next/font/google` — Outfit (sans), DM Serif Display (serif) | `app/layout.tsx:5-17` |
| Rendering mode | Default; the entire homepage is `"use client"` | `app/page.tsx:1` |

### 1.2 Route structure — and a live footgun

```
app/
├── layout.tsx          ← root layout. Fonts + metadata + <body> ONLY.
├── page.tsx            ← "use client". The entire site.
├── globals.css
└── demo/page.tsx       ← isolated @paper-design/shaders-react "Water" playground

src/                    ← DEAD. Next.js ignores src/app when root app/ exists.
├── app/layout.tsx      (Geist fonts, create-next-app default)
├── app/page.tsx        (create-next-app boilerplate)
├── app/globals.css
└── app/favicon.ico     ← ⚠️ the ONLY favicon in the repo, and it is unreachable

backup/                 ← pre-React prototype: index.html + script.js + styles.css.
                          Vanilla three 0.162 from a CDN import map with
                          EffectComposer/UnrealBloomPass. Not imported by anything.
```

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/src-folder.md:31` states verbatim: *"`src/app` or `src/pages` will be ignored if `app` or `pages` are present in the root directory."* So `src/` is dead weight — **including the favicon**, which is why the app currently has none.

### 1.3 Component map (verified by import graph)

```
app/layout.tsx
  └── app/page.tsx  ("use client")
        ├── LoadingScreen              framer-motion + animejs, 2.8 s fixed timeline
        ├── SilkAuroraBackground       ⚑ WebGL CONTEXT #1 — raw WebGL1, own RAF
        └── SmoothScroll → LenisProvider
              └── <main>
                    ├── Navbar         framer-motion, full-screen overlay menu
                    ├── Hero
                    │     └── PointerProvider          ⚑ scoped to the Hero only
                    │           └── HeroCanvas
                    │                 └── <Canvas>     ⚑ WebGL CONTEXT #2 — R3F
                    │                       ├── SphereInteractionDriver
                    │                       ├── PerspectiveCamera fov 40 @ z=12
                    │                       ├── 5 lights + <Environment res 256>
                    │                       ├── BackgroundSpheres  (6 × meshStandardMaterial)
                    │                       ├── SphereGroup        (7 × FluidBlob + <Line> + <Html>)
                    │                       ├── <ContactShadows>
                    │                       └── <EffectComposer multisampling={4}>
                    │                             Bloom → Vignette → ToneMapping
                    ├── AboutSection   framer-motion scroll + useAnimeEntrance
                    ├── WorkSection    framer-motion + useMouseParallax
                    └── FooterSection  animejs
```

**Two independent WebGL contexts run simultaneously, each with its own `requestAnimationFrame` loop**, plus Lenis's RAF (`hooks/useLenis.tsx:41-46`). Three RAF loops total. The reference runs exactly one (`BRAVIS_REFERENCE_ARCHITECTURE.md` §17.1).

### 1.4 Hooks and lib

| File | Purpose | Used by |
|---|---|---|
| `hooks/useLenis.tsx` | Lenis 1.3.25 lifecycle + `scrollTo` context | `SmoothScroll`, `Navbar` |
| `hooks/usePrefersReducedMotion.ts` | `useSyncExternalStore` over matchMedia — live-reactive, correct | `Hero`, `HeroCanvas` |
| `hooks/useAnimeEntrance.ts` | IntersectionObserver → animejs stagger | `AboutSection`, `WorkSection` |
| `hooks/useMouseParallax.ts` | `mousemove` → framer-motion springs | `WorkSection` |
| `hooks/useScrollProgress.ts` | framer-motion `useScroll` + spring wrapper | **nothing — dead code** |
| `lib/sphereDistortion.ts` | Tuning constants for the pointer dent | `FluidBlob`, `SphereInteraction` |
| `lib/utils.ts` | `cn()` = clsx + twMerge | `webgl-error-boundary` |

### 1.5 Design system (this is what §10 protects)

From `app/globals.css:3-31` — 19 colour tokens under Tailwind 4's `@theme`:

```
--color-brand-bg          #080808     --color-brand-accent        #6D4AFF
--color-brand-surface     #111118     --color-brand-purple        #8b5cf6
--color-brand-text        #f0f0f0     --color-brand-purple-soft   #c4b5fd
--color-brand-muted       #666680     --color-brand-sphere-violet #a78bfa
                                      --color-brand-sphere-purple #7c3aed
--font-sans   Outfit
--font-serif  DM Serif Display
```

Typography: `text-[clamp(52px,9.5vw,150px)]` serif headline, three stacked lines with progressive indent (`components/Hero.tsx:182-192`); `tracking-[0.35em]` uppercase micro-labels; `#6D4AFF` circular CTA (`components/CTAButton.tsx:37`).

**None of this is touched by anything proposed in this document.**

---

## 2. Current Fluid Implementation

### 2.1 Where the purple blob actually lives — exact files

| File | Lines | Role |
|---|---|---|
| **`components/FluidBlob.tsx`** | 637 | **The blob itself.** GLSL vertex + fragment shaders inlined as template literals; one `<mesh>` with `sphereGeometry` + `shaderMaterial`; a per-blob `useFrame` running four spring integrators. |
| **`components/HeroCanvas.tsx`** | 430 | The R3F `<Canvas>`, camera, lights, `<Environment>`, 6 background spheres, 7 `FluidBlob` instances, `<Line>`, `<Html>`, `<ContactShadows>`, `<EffectComposer>`. |
| **`components/SphereInteraction.tsx`** | 189 | Registry + per-frame analytic ray/sphere driver that decides which blob the cursor is on. |
| **`components/PointerProvider.tsx`** | 103 | Window-level pointer capture → a ref holding NDC coords. |
| **`lib/sphereDistortion.ts`** | 95 | The dent's tuning constants and per-radius profile. |
| **`components/Hero.tsx`** | 239 | Mounts `PointerProvider` + `HeroCanvas`; owns all hero DOM and the entrance timeline. |
| **`components/SilkAuroraBackground.tsx`** | 428 | A **separate** full-screen raw-WebGL aurora behind everything. Not part of the blob system but shares the GPU. |

There are **no `.glsl`, `.frag`, or `.vert` files in the repo.** All shader source is inline template literals: `components/FluidBlob.tsx:29-101` (simplex), `:108-247` (vertex), `:254-337` (fragment); `components/SilkAuroraBackground.tsx:9-109`.

### 2.2 Technology classification — answering §2 of your brief precisely

| Candidate | Verdict | Evidence |
|---|---|---|
| CSS | **No** for the blob. CSS `backdrop-filter: blur()` exists but only on glass UI cards and the nav overlay | `app/globals.css:165,172,179`; `Navbar.tsx:86` |
| SVG / SVG filters | **No.** Zero `feTurbulence` / `feDisplacementMap` anywhere | repo-wide grep |
| Canvas 2D | **No** | — |
| **Three.js** | **Yes — 0.185.1** | `package.json:33`; `FluidBlob.tsx:5` |
| **React Three Fiber** | **Yes — 9.6.1** | `package.json:15`; `HeroCanvas.tsx:2` |
| **Drei** | **Yes — 10.7.7.** `Environment`, `Lightformer`, `Float`, `ContactShadows`, `PerspectiveCamera`, `Line`, `Html` | `HeroCanvas.tsx:3-11` |
| **Custom shader** | **Yes.** `ShaderMaterial`, hand-written GLSL, Ashima/stegu simplex | `FluidBlob.tsx:627-633` |
| Texture | **No texture is loaded anywhere in the blob system.** Zero `TextureLoader`, zero `useTexture`, zero files in `public/` beyond 5 Next.js starter SVGs | repo-wide grep; `ls public/` |
| Plane geometry | **No** | — |
| **3D geometry** | **Yes — `sphereGeometry`, heavily tessellated** | `FluidBlob.tsx:626` |
| **Postprocessing** | **Yes.** `@react-three/postprocessing` `EffectComposer` with `multisampling={4}`, `Bloom(mipmapBlur)`, `Vignette`, ACES `ToneMapping` | `HeroCanvas.tsx:412-425` |
| Render targets / FBO ping-pong | **No.** Zero `useFBO`, zero `WebGLRenderTarget`, zero `createPortal` in the whole repo | repo-wide grep |
| Metaball / threshold / merging | **No.** Nothing merges. Blobs are separate opaque meshes sorted by depth | — |

### 2.3 What the current blob actually is

A **displaced, tessellated 3D sphere with unlit gradient shading**.

- Geometry: `sphereGeometry(radius, segs, segs)` where `segs = radius > 1.5 ? 160 : radius > 0.5 ? 96 : 48` (`FluidBlob.tsx:364`, `:626`). The two large blobs are **161 × 161 = 25,921 vertices each**.
- Vertex shader (`:216-246`) normalises each vertex to the unit sphere, evaluates `displace()` **three times** (centre + two tangential neighbours at `eps = 0.07`), and reconstructs the normal by cross product of finite differences. This is a genuinely good technique — the lighting tracks the deformation instead of staying spherical.
- `displace()` (`:173-214`) = domain-warped simplex (3 warp octaves + 2 detail octaves = **5 `snoise` calls**) + an axial standing wave scaled by a CPU spring + an inertial slosh dot product + a click ripple + the pointer dent.
- Fragment shader (`:273-336`) is unlit: Fresnel-driven radial colour ramp between `uColorDeep → uColorMid → uColorWarm → uColorRim`, two `fbm3` flow fields (**3 `snoise` each = 6 per pixel**), wrapped diffuse, hash-based film grain.

**Per-vertex cost: 3 × 5 = 15 `snoise` evaluations.** Across all 7 blobs that is ≈ 70,855 vertices → **≈ 1.06 million simplex-noise evaluations per frame in the vertex stage alone**, before the fragment stage's 6-per-pixel.

### 2.4 The second WebGL context

`components/SilkAuroraBackground.tsx` opens its own `webgl` context (`:232`) with its own program, its own RAF (`:378`), and DPR up to **2** (`:332`). Its fragment shader (`:70-108`) calls `fbm()` — a **5-octave loop** — four separate times per pixel, i.e. **≈ 20 value-noise lookups per pixel across the full viewport at DPR 2**. On a 1920×1080 display that is 8.3 M pixels × 20 noise lookups **per frame**, in a context that has no idea the other context exists.

This is, by a wide margin, the single most expensive thing in the application, and it is decorative background.

---

## 3. Current Mouse Interaction

This is the section that matters most, so it is traced end to end.

### 3.1 Capture — `components/PointerProvider.tsx`

```
window "pointermove"  (:80)   ─┐
window "touchmove"    (:81)   ─┤
window "pointerdown"  (:82)   ─┼─→ track(clientX, clientY)   (:44-48)
window "pointerup"    (:83)   ─┤        x = (clientX / innerWidth)  * 2 - 1
window "pointercancel"(:84)   ─┤        y = -(clientY / innerHeight) * 2 + 1
document "mouseleave" (:85)   ─┤        inside = true
window "blur"         (:86)   ─┘
```

State lives in a **ref**, never in React state (`:31-38`), and the context value is memoised to a stable ref (`:100`) so no consumer re-renders on movement. That part is correct and worth keeping.

Fields: `{ x, y, inside, down, pressCount, coarse }`. `pressCount` (`:63`) is an increment-on-press counter so frame loops can detect a click without listening for events — a nice pattern.

**Normalisation:** NDC, `-1..1`, Y up. That is *screen-space normalised device coordinates for raycasting*, not centre-origin pixels for a render target.

**Throttling:** none. **Dead zone:** none. **Velocity:** not computed here.

**Scope:** `PointerProvider` is mounted **inside `<Hero>`** (`components/Hero.tsx:129`). It does not exist for the rest of the page. `SilkAuroraBackground` therefore cannot use it and registers its own duplicate `pointermove` listener (`SilkAuroraBackground.tsx:228`), as does `useMouseParallax` (`hooks/useMouseParallax.ts:45`). **Three independent `pointermove`/`mousemove` listeners are live on the same page.**

### 3.2 Resolution — `components/SphereInteraction.tsx`

`SphereInteractionDriver` runs one `useFrame` (`:132`):

1. `raycaster.setFromCamera(ndc, camera)` — rebuilt from the live camera every frame (`:145`).
2. For each registered blob: analytic `ray.intersectSphere()` against a bounding sphere padded by `hitPadding: 1.16` (`:153-155`).
3. Front-most hit wins (`:159-164`).
4. Writes into each target's mutable `contact` slot: `active`, `point` (world space), `entered`, `exited`, `pressed`, `struck` (`:171-184`).

The header comment (`:96-107`) explains why this replaced R3F's event system — R3F would raycast 25 k triangles per mouse event and would lose contact on a stationary cursor as the blob drifts. **That reasoning is correct and this driver is a genuinely good piece of engineering.**

### 3.3 Consumption — `components/FluidBlob.tsx:449-620`

Per blob, per frame:

| Step | Lines | What happens |
|---|---|---|
| dt clamp | `:456` | `clamp(rawDelta, 1/240, 1/30)` — both ends, with a documented reason |
| World→local | `:494-497` | `mesh.worldToLocal(contact.point)`, normalised → unit-sphere direction |
| Surface speed | `:508` | `local.distanceTo(prev) / dt` |
| Depth target | `:517-521` | `strength × profile.depthScale × (1 + speedGain) × (pressed ? 1.7 : 1)` |
| Smear trail | `:538-541` | `touchTrail.lerp(touchLocal, 1 - exp(-9.0·dt))` — frame-rate independent |
| Dent spring | `:545-549` | Explicit Euler, k = 82, c = 9.5 (under-damped → one overshoot) |
| Wobble spring | `:564-568` | k = 46, c = 5.2, clamped ±0.55 |
| Slosh spring | `:571-581` | k = 26, c = 6.0, tracks lagged acceleration |
| NaN guard | `:585-596` | Hard reset of every integrator if any goes non-finite |
| Uniform write | `:608-615` | `uTouchPoint`, `uTouchTrail`, `uTouchAmp`, `uWobble`, `uSlosh` |

The GPU side (`:145-170`) is a Gaussian dent plus an analytically-normalised outward rim:

```glsl
core = exp(-x²·s)                                 // the dent
core = max(core, exp(-xt²·s) · trailWeight)       // lagged smear tail
ring = x²·exp(-x²·s)·s·e · uTouchRim              // displaced volume returning
return uTouchAmp · (core - ring);
```

### 3.4 Why this does NOT produce the Bravis fluid — the technical reason

Not "the effect is missing." Six specific, independent architectural causes:

---

**CAUSE 1 — The cursor is a *point uniform*, so it can only ever deform one blob, at one place, with no history.**

`uTouchPoint` is a single `vec3` (`FluidBlob.tsx:391`, written at `:612`). The reference has **no mouse uniform at all** — it rasterises ~30 expanding, fading, rotating brush stamps into a half-resolution render target, and *that texture* is the displacement map (`BRAVIS_REFERENCE_ARCHITECTURE.md` §6.4).

Consequences of the uniform approach that no amount of tuning fixes:

- **No trail.** A single `vec3` holds one position. `touchTrail` (`:539`) is one lagged copy of that same point — a two-sample smear, not a path. The reference's trail is a *pool of 30 independent stamps*, each with its own age, scale, opacity and rotation, so the surface remembers roughly the last second of cursor movement as a spatial field.
- **Exactly one blob responds.** The driver picks the front-most hit and only that target gets `active = true` (`SphereInteraction.tsx:174`). Every other blob's dent is zero. In the reference the trail texture is sampled by the *whole composite*, so the cursor disturbs the entire field at once.
- **The effect dies the instant the cursor leaves a blob.** `contact.active` goes false and the spring pulls the dent to zero in ~200 ms (`:545-549`). The reference's stamps keep living and decaying wherever they were dropped, over empty background included.
- **Coupled to input sample rate.** A dropped frame or a slow `pointermove` stream directly loses deformation. Rasterised stamps are immune — they persist in a buffer.

---

**CAUSE 2 — All deformation is in the VERTEX stage, which caps the effect at the mesh's tessellation and costs ~1 M noise evaluations per frame.**

`touchDisplace` is called from `displace()` inside the vertex shader (`:213`). The reference's vertex shaders are **all pass-through**; 100 % of deformation is fragment-stage UV displacement on a **4-vertex quad** (§6.6).

- The finest deformation Crovion can express is one sphere quad ≈ 1.1° of arc. Anything finer is invisible regardless of shader math.
- Cost scales with **vertex count**: 3 × `displace()` × 5 `snoise` = 15 noise evals per vertex, ≈ 1.06 M/frame across the scene. The reference's equivalent cost is *fixed* — one full-screen pass, independent of how many blobs exist.
- The finite-difference normals (`:221-234`) triple the cost of every vertex. Correct and necessary *for a lit 3D sphere* — and entirely unnecessary in a 2D composite, which has no normals at all.

---

**CAUSE 3 — There is no render-target pipeline, so blobs mathematically cannot merge.**

Zero `WebGLRenderTarget`, zero `useFBO`, zero `createPortal` in the repo. Each blob is an independent opaque mesh with `depthWrite` on (`:632`), depth-sorted against the others.

The metaball look is **one line operating on a blurred alpha channel** (§6.3):

```glsl
vec4 colB = vec4(col1.rgb, col1.a * 80.0 - 10.0);
```

Two soft blobs each individually below the 0.125 alpha isoline **sum past it where they overlap** and snap into one continuous silhouette with a smooth neck. This requires (a) a shared buffer both blobs render into, and (b) a blur that spreads their alpha. Crovion has neither. Two Crovion spheres that overlap produce a *depth-sorted intersection edge* — a hard visible seam — which is the visual opposite of merging.

**This is why the current implementation reads as "3D balls" and the reference reads as "one liquid."**

Note what the current code does *instead*: `HeroCanvas.tsx:145-151` draws an explicit `<Line>` between two spheres, and `:154-177` places three tiny "bead" blobs along it. That is a hand-authored substitute for the connection that the threshold gives for free. In the reference, `[[0,1],[1,2],…]` joints are drawn into the *same* buffer as the nodes and fuse automatically (§4).

---

**CAUSE 4 — There is no blur pass, and no cheap way to add one to the current stack.**

Merging needs a wide separable Gaussian (2 × 31 taps at 0.6× viewport in the reference, §6.2). What Crovion has is `Bloom({ mipmapBlur })` in `@react-three/postprocessing` (`HeroCanvas.tsx:413-418`) — which blurs **luminance above a threshold and adds it back**. It brightens; it does not spread alpha, and it cannot be thresholded to an isoline. It is the wrong operator, not an under-tuned one.

---

**CAUSE 5 — Cursor velocity is computed but deliberately throttled to near-invisibility.**

Velocity *is* measured (`:508`, `:557`), which is more than the reference does. But:

- `velocityInfluence: 0.055` capped at `velocityInfluenceMax: 0.7` (`sphereDistortion.ts:53-54`) → at best **+70 %** dent depth on a fast flick, on a base depth of `0.15 × radius`.
- The ambient wobble share for non-touched blobs is `0.18` (`:77`), explicitly to stop the group twitching in unison.

So a slow drift and a fast flick differ by under a tenth of a radius, on one blob. In the reference a flick lays down a *visibly longer, sparser stamp trail* across the whole field because emission is time-throttled rather than distance-throttled (§6.10 Q22).

---

**CAUSE 6 — The ambient field is dead, so the surface has no fluid identity when idle.**

The reference is *never* idle: a global radial sine ripple at 14 concentric bands runs permanently (§6.7), the noise texture drifts on its Z axis, and the colour LUT scrolls. Crovion's idle motion is `Math.sin(t·0.42) · 0.022 + Math.sin(t·0.27) · 0.015` — a **±3.7 % breathe** (`:605`) — plus a slow tumble (`:618-619`). Below the perceptual floor at typical viewing size.

An always-on ambient field is also what makes the *mobile* fallback work: with the trail disabled on touch, the absence of the cursor effect is not legible as breakage because the medium is visibly alive anyway (§15.2). Crovion has nothing to fall back to.

---

### 3.5 Secondary issues found in the same pass

| # | Issue | Evidence |
|---|---|---|
| a | Three independent pointer listeners on one page | `PointerProvider:80`, `SilkAurora:228`, `useMouseParallax:45` |
| b | Three independent RAF loops | `useLenis:43`, `SilkAurora:378`, R3F internal |
| c | `PointerProvider` scoped inside `Hero`, so pointer state is unavailable site-wide | `Hero.tsx:129` |
| d | `EffectComposer multisampling={4}` at DPR ≤ 1.5 → a 4× MSAA target ≈ **75 MB** of VRAM at 1080p | `HeroCanvas.tsx:412` |
| e | `<ContactShadows>` with default `frames` re-renders a shadow pass every frame at `scale={30}` for `opacity={0.06}` | `HeroCanvas.tsx:402-409` |
| f | Reduced motion disables the *driver* but leaves 1 M noise evals/frame and both RAF loops running | `HeroCanvas.tsx:326` |
| g | Hero entrance is a hardcoded `setTimeout(…, 2800)` matched by hand to `LoadingScreen`'s 2800 ms | `Hero.tsx:123` vs `LoadingScreen.tsx:68` |
| h | `dpr={[1, 1.5]}` on desktop; the reference forces **1** on desktop, ≤1.5 on mobile | `HeroCanvas.tsx:315` |
| i | `antialias: true` — pointless once edges come from a blurred threshold | `HeroCanvas.tsx:316` |

---

## 4. Bravis Architecture Summary

Condensed from the reference study for side-by-side use. Full detail in `BRAVIS_REFERENCE_ARCHITECTURE.md` §5–§9, §17.

**Six render passes per frame, all 2D, under one orthographic camera at z = 1000:**

```
1. NOISE      512² RT · 3D simplex · z += 0.008·Δ · renders EVERY OTHER FRAME
2. TRAIL      ½-viewport RT · black base + pool of 30 soft ring sprites
                              scale 0.2→8, opacity 0.9→0, both exp k=0.02
                              ⇒ this RT *is* the displacement map
3. BLOBS      instanced textured quads (bg sprites) → RGBA RT
4. BLUR H     31-tap alpha-weighted separable Gaussian
5. BLUR V     31-tap alpha-weighted separable Gaussian
6. SCREEN     gradient LUT → METABALL THRESHOLD → front layer → 3 % grain
```

**The metaball, in full:** `alpha = blurredAlpha * 80.0 - 10.0`. Transparent below α 0.1250, opaque above α 0.1375 — a 0.0125-wide edge band. Cost is **independent of blob count**; merging and necking are emergent; it self-antialiases (which is why `antialias:false` is safe).

**The cursor:** `clientX - w/2, clientY - h/2` → 3 px dead zone → ~4-frame throttle → `×0.5, Y-negate` → stamp a soft irregular ring into a 30-slot pool. Consumed as `uv += sin(trail.r) * 0.025` plus a brightness lift of `trail.r * 0.11`. **Disabled entirely on touch devices.**

**Everything else that matters:** geometry is `PlaneGeometry(w,h,1,1)` — 4 vertices, everywhere. All vertex shaders are pass-through. DPR forced to **1** on desktop, ≤1.5 on mobile; blur at **0.6×** desktop / 0.9× mobile. One global RAF with a low-passed, clamped Δt and a precomputed lerp-coefficient table. Canvas lives **outside** the routed content so it never remounts on navigation; page transitions are a 0.2 s DOM fade over 1.8–2.0 s canvas moves. Scroll is **velocity**-coupled, not position-scrubbed.

**What must not be copied:** their textures, their constants as final values, their fonts, their `#e50012`, their composition, their code — and their accessibility, which is a site-wide failure (no `<h1>`, zero ARIA, `outline:0`, no reduced-motion path).

---

## 5. Crovion vs Bravis Comparison

Every cell carries code evidence.

| System | Bravis | Current Crovion | Gap |
|---|---|---|---|
| **Rendering** | WebGL, Three r138, **one** context, **one** RAF | WebGL ×**2** contexts — R3F (`HeroCanvas.tsx:314`) + raw WebGL1 (`SilkAurora.tsx:232`) — plus **3** RAF loops (`useLenis:43`, `SilkAurora:378`, R3F) | Consolidate to one context, one loop |
| **Three.js** | r138, plain, no framework | **0.185.1** via R3F 9.6.1 + drei 10.7.7 (`package.json:33,15,14`) | None — R3F is strictly better tooling. Keep. |
| **Camera** | `OrthographicCamera` @ (0,0,1000); no perspective anywhere | `PerspectiveCamera` fov 40 @ z=12 (`HeroCanvas.tsx:329`) | Pipeline passes need an ortho fullscreen quad. Can coexist. |
| **Fluid blobs** | Textured sprite quads, 4 verts, instanced, atlased | `sphereGeometry(r, 160, 160)` × 7 — **70,855 verts** (`FluidBlob.tsx:364,626`) | ~17,700× more vertices for a softer result |
| **Blob merging** | Blur + `α*80−10` threshold; free, emergent, count-independent | **None.** Opaque depth-sorted meshes; connection faked with an explicit `<Line>` + 3 bead meshes (`HeroCanvas.tsx:145-177`) | **The single largest gap.** No FBO ⇒ merging is impossible today |
| **Mouse** | Rasterised into a ½-res RT as 30 pooled ring stamps; **no mouse uniform** | `uTouchPoint: vec3` uniform on **one** blob (`FluidBlob.tsx:391,612`) | Point → field. Requires a trail FBO |
| **Mouse displacement** | Render target sampled as `uv += sin(trail.r)*0.025` | Gaussian dent in the **vertex** shader (`FluidBlob.tsx:145-170`) | Vertex → fragment; uniform → texture |
| **Blur** | 2-pass separable Gaussian, 31 taps, alpha-weighted, 0.6× viewport | **None.** `Bloom(mipmapBlur)` blurs *luminance*, not alpha (`HeroCanvas.tsx:413`) | Wrong operator entirely. Must be built |
| **Noise** | 512² RT, 3D simplex, **half-rate** | In-shader: 15 `snoise`/vertex + 6/pixel, **full rate**, never cached (`FluidBlob.tsx:181-188,282-283`) | Bake to a texture ⇒ ~1 M evals/frame → 1 texture fetch |
| **Fragment deformation** | **Yes** — 100 % of it | Fragment only tints (`pit`/`bump`, `FluidBlob.tsx:322-325`); no UV displacement | Must be added |
| **Vertex deformation** | **No** — every `*_vtx` is pass-through | **Yes, everything** — 3 × `displace()` + finite-difference normals (`FluidBlob.tsx:229-234`) | Exact inversion of the reference |
| **Scroll velocity** | `_scrollDis = _scrollDis*0.98 + Δy*0.02`, drives colour/noise/parallax | **Not computed.** Only scroll *position* via framer-motion `scrollYProgress` → a lift multiplier (`HeroCanvas.tsx:59`) | Position-scrubbed, not velocity-coupled |
| **Persistent canvas** | `#gl-world` **outside** `#contents`; never destroyed | `<Canvas>` inside `Hero` inside `<main>` inside `page.tsx` (`Hero.tsx:134`) | Unmounts on any future route change |
| **DPR strategy** | Desktop **forced to 1**; mobile `min(dpr, 1.5)`; blur 0.6×/0.9× | `dpr={[1,1.5]}` for all devices (`HeroCanvas.tsx:315`); aurora at `min(dpr,2)` (`SilkAurora.tsx:332`) | Desktop over-rendering; no blur tier |
| **Mobile** | Trail pass **skipped entirely**; click ripple retained; separately authored `sp:` composition | Same code path everywhere. `coarse` is captured (`PointerProvider.tsx:42`) but **never read by anything** | No mobile branch exists |
| **Page transitions** | 0.2 s DOM fade over a persistent canvas; per-module 1.8–2.0 s uniform tweens | **None.** Single route; canvas would remount | Nothing to preserve; build it right |
| **Reduced motion** | **None** (their worst failure) | `usePrefersReducedMotion` is live-reactive and wired to the driver + entrance (`Hero.tsx:51`, `HeroCanvas.tsx:326`) | **Crovion is ahead here. Protect this.** |
| **Frame timing** | Low-passed clamped Δt + precomputed lerp table, shared app-wide | Per-component `clamp(delta, 1/240, 1/30)` (`FluidBlob.tsx:456`); no shared table | Correct instinct, not centralised |
| **Textures** | 12 WebP, POT, atlased, 4-way concurrent preloader | **Zero.** `public/` holds 5 unused Next starter SVGs | All art assets still to be authored |
| **Postprocessing** | None. Hand-rolled passes only | `EffectComposer multisampling={4}` + Bloom + Vignette + ToneMapping (`HeroCanvas.tsx:412`) | Redundant with, and obstructive to, a custom chain |

---

## 6. Current Problems

Ranked by impact on the goal.

| # | Problem | Severity | Root cause |
|---|---|---|---|
| 1 | Blobs cannot merge or neck | **BLOCKER** | No FBO, no blur, no threshold (§3.4 C3/C4) |
| 2 | Cursor affects one blob at one point with no memory | **BLOCKER** | Point uniform instead of a rasterised field (§3.4 C1) |
| 3 | ~1.06 M `snoise`/frame in the vertex stage | **HIGH** | 15 evals × 70,855 verts (§2.3) |
| 4 | Aurora background ≈ 20 noise lookups/pixel at DPR 2, second context, second RAF | **HIGH** | `SilkAurora.tsx:70-108,332,378` |
| 5 | Deformation resolution capped by tessellation | **HIGH** | Vertex-stage displacement (§3.4 C2) |
| 6 | 4× MSAA target ≈ 75 MB VRAM at 1080p | **HIGH** | `HeroCanvas.tsx:412` |
| 7 | Canvas is not persistent | **MEDIUM-HIGH** | Mounted inside `Hero` (`Hero.tsx:134`) |
| 8 | Idle field visually dead (±3.7 % breathe) | **MEDIUM-HIGH** | `FluidBlob.tsx:605` — also removes the mobile fallback |
| 9 | No mobile branch despite capturing `coarse` | **MEDIUM** | `PointerProvider.tsx:42` never read |
| 10 | Scroll is position-scrubbed, not velocity-coupled | **MEDIUM** | `HeroCanvas.tsx:59` |
| 11 | Three pointer listeners, three RAF loops | **MEDIUM** | Duplicated input plumbing |
| 12 | `ContactShadows` re-renders a shadow pass every frame for `opacity 0.06` | **MEDIUM** | `HeroCanvas.tsx:402` |
| 13 | 11 installed dependencies with zero imports | **MEDIUM** | See §7 of the brief / dependency table below |
| 14 | Reduced motion disables interaction but not cost | **MEDIUM** | `HeroCanvas.tsx:326` |
| 15 | `src/` shadow tree; the only favicon is unreachable | **LOW-MEDIUM** | Next ignores `src/app` when root `app/` exists |
| 16 | `package.json` still named `"temp-app"` | **LOW** | `package.json:2` |
| 17 | Entrance timing hardcoded to 2800 ms in two files | **LOW** | `Hero.tsx:123` / `LoadingScreen.tsx:68` |
| 18 | No `webglcontextlost` handling on either context | **LOW-MEDIUM** | — |

---

## 7. Target Architecture

### 7.1 The transformation, stated plainly

```
CURRENT
───────
window pointermove
   └→ NDC ref (-1..1)                        PointerProvider.tsx:44
        └→ analytic ray/sphere test          SphereInteraction.tsx:145-164
             └→ contact {point, pressed}     SphereInteraction.tsx:171-184
                  └→ world→local unit vec    FluidBlob.tsx:494-497
                       └→ damped springs     FluidBlob.tsx:545-581
                            └→ uTouchPoint / uTouchAmp uniforms
                                 └→ VERTEX shader Gaussian dent
                                      └→ 25,921-vert sphere
                                           └→ EffectComposer (MSAA 4 + Bloom)
                                                └→ screen

                          ↓  ↓  ↓

TARGET
──────
window pointermove  (one listener, app-level)
   └→ centre-origin px  (clientX - w/2, clientY - h/2)
        └→ dead zone |Δ| < 3 px   +   Δt-corrected ~4-frame throttle
             └→ velocity  →  modulates initial stamp scale & opacity
                  └→ STAMP into a 30-slot pooled InstancedMesh
                       └→ ┌──────────────────────────────────┐
                          │ PASS 1  NOISE     512², half-rate │
                          │ PASS 2  TRAIL     0.5× viewport   │ ← the displacement map
                          │ PASS 3  BLOBS     → RGBA FBO      │
                          │ PASS 4  BLUR H    0.6× viewport   │
                          │ PASS 5  BLUR V    0.6× viewport   │
                          │ PASS 6  COMPOSITE → screen        │
                          │         uv += sin(trail.r)·A      │
                          │         uv += S·sin(-t+|p·14|)    │
                          │         α = α·T − C   ← METABALL  │
                          │         rgb += noise·N + trail·L  │
                          └──────────────────────────────────┘
```

### 7.2 The three stages — how §8 and §10 are reconciled

**STAGE A — Pointer field + ambient life. Zero visual identity change.**

Keep the existing scene exactly as it renders today. Add:
- one app-level pointer store (centre-origin px + velocity + dead zone + throttle),
- the trail FBO with the 30-stamp pool,
- the half-rate noise FBO,
- one full-screen composite pass that renders the *existing scene texture* with `uv += sin(trail.r)·A`, the ambient radial ripple, and the noise/trail brightness lift.

`EffectComposer` is replaced by this hand-rolled composite (Bloom's contribution can be folded in or dropped — it is currently `intensity 0.35`, barely visible against `#080808`). Colours, typography, DOM, layout, camera, spheres: **untouched**. The whole surface starts responding to the cursor as a field, with a trail, everywhere — including over background.

**Delivers §3.4 causes 1, 5, 6. Does not deliver 3, 4 (merging).**

**STAGE B — Alpha blur + threshold. The merging, on the existing spheres.**

Render the sphere scene into an RGBA FBO with alpha, run blur H + blur V on it, and threshold the blurred alpha in the composite. Overlapping spheres' blurred alpha ramps sum past the isoline and **neck together**. Colour is sampled from the un-thresholded buffer so the purple Fresnel gradient survives intact; only the *silhouette* becomes fluid.

At this point the explicit `<Line>` and its 3 bead meshes (`HeroCanvas.tsx:145-177`) can be deleted — the bridge becomes emergent, which is exactly the reference's `glJoint` insight (§4).

**Delivers causes 3 and 4. This is the make-or-break gate.**

**STAGE C — Optional. Swap the blob source to 2D sprites.**

Only if, after B, the 3D spheres still read as "balls" rather than "liquid." Replaces `sphereGeometry` with instanced textured quads and drops the 70,855 vertices to ~28. **This is the stage that changes the visual object**, so it is a separate decision with its own approval, not an assumed continuation.

### 7.3 Target tree (additive — no existing file moves in Stage A/B)

```
app/
├── layout.tsx                       MODIFY (Stage A): mount <FluidCanvas> + <PointerBridge>
│                                            once, outside {children}
└── page.tsx                         MODIFY (Stage A): drop SilkAuroraBackground

webgl/                               NEW — the pipeline lives here
├── FluidCanvas.tsx                  <Canvas> root: DPR clamp, ortho pass camera, alpha
├── FluidScene.tsx                   ONE useFrame, explicit pass order, RT restore
├── passes/
│   ├── NoisePass.tsx                512², every other frame
│   ├── PointerTrailPass.tsx         0.5× viewport, 30-stamp InstancedMesh pool
│   ├── BlobPass.tsx                 renders the blob scene → RGBA FBO
│   ├── BlurPass.tsx                 ONE shader, direction as a uniform, used twice
│   └── CompositePass.tsx            threshold + displacement + ripple → screen
├── shaders/
│   ├── passthrough.vert.glsl
│   ├── noise.frag.glsl              (Ashima/stegu MIT header retained)
│   ├── blur.frag.glsl
│   ├── composite.frag.glsl          ⚑ the metaball threshold
│   └── lib/simplex3d.glsl           lifted verbatim from FluidBlob.tsx:29-101
├── objects/
│   └── StampPool.tsx                pooled ring sprites, zero per-event allocation
└── config/
    ├── quality.ts                   DPR / blurScale / poolSize / tapCount per tier
    └── nodes.ts                     desktop + mobile blob coordinates (Stage C)

lib/
├── store.ts                         NEW — zustand: pointer, scrollVel, tier, reducedMotion
└── frame.ts                         NEW — low-passed clamped Δt + lerp coefficient table

hooks/
├── usePointerField.ts               NEW — dead zone, throttle, velocity, centre-origin
├── useScrollVelocity.ts             NEW — smoothed _scrollDis equivalent, off Lenis
└── useDeviceTier.ts                 NEW — screen-dimension based, per reference §13

public/textures/                     NEW — brush.webp, gradient LUT, grain (ORIGINAL ART)
```

---

## 8. Render Pipeline

Per frame, in strict order, driven by **one** `useFrame` with explicit priority so React's declarative model never decides render order.

```
── shared, once per frame ─────────────────────────────────────
d         = clamp(lowpass(delta / 0.016), 0, 20)      // lib/frame.ts
K.k098    = 1 - 0.02·d ;  K.k090 = 1 - 0.10·d
scrollVel = scrollVel·K.k098 + (scrollY - prevScrollY)·(1-K.k098)

── PASS 1 · NOISE ────────────────── 512×512 · EVERY OTHER FRAME
   uNoiseZ += 0.008·d
   simplex3d → noiseFBO

── PASS 2 · TRAIL ────────────────── 0.5 × viewport · every frame
   base quad (black, alpha 0) + 30-slot InstancedMesh of ring stamps
   per stamp:  rot += 0.02·d
               scale   = scale·K.k098   + 8.0·(1-K.k098)
               opacity = opacity·K.k098 + 0.0·(1-K.k098)
               retire when opacity <= 0.002
   → trailFBO                                    ⚑ THE DISPLACEMENT MAP

── PASS 3 · BLOBS ────────────────── viewport × dpr · RGBA
   Stage A/B: the existing sphere scene, rendered to target
   Stage C:   instanced textured quads
   → blobFBO

── PASS 4 · BLUR H ───────────────── 0.6× desktop / 0.9× mobile
   blur.frag, uDir = (1/w, 0), alpha-weighted → blurA

── PASS 5 · BLUR V ───────────────── same shader, uDir = (0, 1/h) → blurB

── PASS 6 · COMPOSITE ────────────── screen
   setRenderTarget(null)  ← always, unconditionally
   background gradient → metaball → front tint → grain overlay
```

**The composite fragment — the ~10 lines that are the whole effect:**

```glsl
vec4 trail = texture2D(uTrail, vUv);
vec4 noise = texture2D(uNoise, vUv * uAspect);

vec2  uv = vUv + sin(trail.r) * uDisplaceAmt;       // cursor displacement
vec2  p  = -1.0 + 2.0 * uv;
float s  = sin(-uTime + length(p * uRippleBands));  // ambient radial ripple
uv += uStrength * vec2(s, s);

vec4 c = texture2D(uBlurred, uv);

float alpha = c.a * uThreshold - uCutoff;           // ★ METABALL
vec3  rgb   = min(c.rgb + noise.r * uNoiseLift + trail.r * uTrailLift, 1.0);

gl_FragColor = vec4(rgb, alpha);
```

`uThreshold` / `uCutoff` are **the** art-direction control. Their ratio sets which alpha level becomes the surface; their magnitude sets edge hardness. Bravis's 80/10 is a *starting point in Leva*, not a target — landing on their exact values would be both a creative and a legal failure (reference §27).

**R3F-specific correctness rules** (reference risk #3, which is rated HIGH):
- All six passes in **one** `useFrame`, never one per component.
- Off-screen scenes mounted via `createPortal`, drawn with `gl.render(scene, camera)`.
- `gl.setRenderTarget(null)` restored on every path, including early returns.
- FBOs via drei `useFBO`, resized in a debounced resize handler, disposed on unmount.
- Never call `setState` inside the loop.

---

## 9. Pointer Trail System

Replaces `uTouchPoint`/`uTouchAmp` (`FluidBlob.tsx:391-393`) as the primary cursor mechanism.

**Capture** — one listener, app-level, in `lib/store.ts`. `pointermove` on `window` (covers mouse, pen and touch uniformly — better than the reference's `mousemove`). Reuse `PointerProvider`'s existing ref discipline verbatim; only the coordinate space and gating change.

```
px = clientX - innerWidth/2          // centre-origin pixels, NOT NDC
py = clientY - innerHeight/2
vel = hypot(px - pxPrev, py - pyPrev)

if (|Δx| < 3 && |Δy| < 3) return                    // dead zone: kills jitter
if (framesSinceEmit < 4 / d) return                 // Δt-corrected throttle
if (tier === 'touch' || reducedMotion) return       // ⚑ mobile / a11y branch
```

**Emit** into a fixed 30-slot ring buffer — **no allocation in the hot path**, matching the reference's pooling discipline (§17.5):

```
s.pos     = (px * 0.5, -py * 0.5)                   // half-res RT space, Y flipped
s.rot     = random() * TAU
s.scale   = lerp(0.2, 0.5, clamp(vel/60, 0, 1))     // ⚑ our improvement on Bravis
s.opacity = lerp(0.6, 1.0, clamp(vel/60, 0, 1))     // flick ≠ drift
```

**Lifetime**, per frame — exponential decay, no springs. The reference has no spring anywhere in the trail, and it is right: exponential decay reads as *fluid*, a spring with overshoot reads as *rubber* — the wrong material. (Note this deliberately contradicts `sphereDistortion.ts:41`, whose under-damped overshoot is correct for an elastic membrane and wrong for a liquid.)

**The brush texture is the falloff.** Not a math function — a 512×512 single-channel soft irregular ring, **authored originally for Crovion**. Its lumpiness is what makes ripples read organic instead of like clean circles. Do not reuse `burash.webp` or any Bravis asset.

**Click ripple** — a separate 2-slot pool, opacity 0→1 over 0.3 s then →0 over 1.7 s, scale 1→8 over 2.0 s, guarded so a slot can't be interrupted mid-ripple. **This is the one cursor effect that survives on touch.** `PointerProvider.tsx:63`'s `pressCount` already provides exactly the frame-loop-friendly click signal this needs.

---

## 10. Blur System

**One** shader file with direction as a uniform, used twice — the reference ships two nearly-identical files (`middle_frg` + `blurStage_frg`), which is duplication worth avoiding.

| Parameter | Value | Rationale |
|---|---|---|
| Taps | 31 desktop / 15 mobile | Tier constant in `webgl/config/quality.ts` |
| Actual samples | **16 / 8** via linear-sampled Gaussian | Bilinear pairs halve the fetch count for identical output — a free win the reference does not take |
| Resolution | **0.6×** viewport desktop, **0.9×** mobile | Inverted, exactly as the reference: mobile's higher DPR needs a finer blur to stay smooth relative to physical pixels; net GPU cost stays comparable |
| Weighting | **Alpha-weighted** | Critical. Un-weighted RGB blur drags colour out of transparent regions and dirties the threshold edge |
| Format | RGBA8 | Half-float is unnecessary; the threshold quantises anyway |

**The blur radius is the merge distance.** Wider blur ⇒ blobs fuse from further apart ⇒ longer, thinner necks. This and the threshold pair are the two knobs that define the entire look, and both belong in Leva from the first commit.

---

## 11. Metaball Threshold System

```glsl
float alpha = blurredAlpha * uThreshold - uCutoff;
```

Two soft blobs each individually below the isoline sum past it where they overlap, and snap into one continuous shape with a smooth neck. That is the whole mechanism.

**Why this and not signed distance fields / marching squares:**
- Cost is **independent of blob count** — 200 blobs cost what 2 cost.
- Blob shape is art-directed by painting a texture (or, in Stage A/B, by the sphere's own shading), not by writing math.
- It **antialiases for free**, which is why `antialias: false` becomes safe and the current `antialias: true` (`HeroCanvas.tsx:316`) becomes pointless.
- Necking — the expensive, fiddly part of real metaballs — is emergent.

**The isoline is `uCutoff / uThreshold`**; the edge band width is `1 / uThreshold`. Too steep ⇒ crunchy aliased edges. Too shallow ⇒ mush with no merging. Tune against real Crovion sprites at real sizes, never against placeholders.

**Consequence to plan for:** once this lands, `<Line>` + the three bead meshes (`HeroCanvas.tsx:145-177`) become redundant. The bridge that is currently hand-authored becomes free.

---

## 12. Displacement System

Fragment-stage UV displacement. **No vertex displacement anywhere in the new pipeline.**

```glsl
vec2 uv = vUv + sin(texture2D(uTrail, vUv).r) * uDisplaceAmt;   // ≈ 0.02–0.03
```

Why `sin()` on the trail value rather than the raw value: it soft-clamps to ±1 so overlapping stamps summing past 1.0 cannot produce runaway distortion, and it introduces a gentle non-linearity that keeps the ripple from reading as a linear smear.

The cursor also **brightens**: `rgb += trail.r * uTrailLift` (≈ 0.11). Displacement alone reads as a smudge; the brightness lift is what makes it read as *disturbed liquid catching light*.

**Two ambient displacements run permanently, cursor or not:**
```glsl
float s = sin(-uTime + length(p * uRippleBands));   // ~14 concentric bands
uv += uStrength * vec2(s, s);                       // uStrength ≈ 0.004
```
`uStrength` tweens 0.01 → 0.004 over 1.5 s on load, so the surface settles rather than starting flat.

**What is retired:** `FluidBlob.tsx:145-170` `touchDisplace()`, and with it the world→local conversion (`:494-497`), the dent spring (`:545-549`) and the smear-tail chase (`:538-541`). Under Stage C the surrounding raycast driver retires too — but see §18: it should be *kept as-is* for Stages A and B, and it may well be worth keeping permanently as a **hover/click hit-test** for the DOM-bound clickable nodes, which is exactly the role `glMainBallDom` plays in the reference (§4).

---

## 13. Noise System

**Bake it.** This is the single largest CPU/GPU saving available.

| | Current | Target |
|---|---|---|
| Where | Inline in vertex + fragment shaders | 512×512 RGBA render target |
| Rate | Every frame | **Every other frame** |
| Cost | 15 `snoise`/vertex × 70,855 verts ≈ **1.06 M/frame**, plus 6/pixel | 512² × 1 `snoise`, every 2nd frame ≈ **131 k/frame** |
| Consumed as | Direct evaluation | One `texture2D` fetch |

Half-rate is invisible because the field is low-frequency and consumed at 6–13 % strength.

The simplex implementation to bake is **already in the repo** — `components/FluidBlob.tsx:29-101`, Ashima Arts / Stefan Gustavson, MIT. Move it verbatim to `webgl/shaders/lib/simplex3d.glsl` **with its attribution comment intact** (`FluidBlob.tsx:28`).

Three consumers:
1. **UV drift** — `uv += (noise.rg - 0.5) * uNoiseWarp`, `z += 0.008·d`.
2. **Additive grain** — `rgb += noise.r * 0.13`. This is what kills gradient banding and lets an 8 KB gradient fill a 4K screen without visible steps.
3. **Sprite variation** (Stage C) — per-instance noise offset so identical sprites don't read as clones.

---

## 14. Scroll Interaction

**The change is from position-scrubbed to velocity-coupled.** The reference study calls this its most important scroll insight (§8.4), and it is right: position-scrubbed animation feels mechanical, velocity-coupled animation feels physical.

**Current:** `scrollYProgress.get() * 6.0` → a group lift (`HeroCanvas.tsx:59`), plus `useTransform(scrollYProgress, [0,0.6], [0,64])` on the hero text (`Hero.tsx:41`).

**Target — additive, keeps both of the above:**

```ts
// hooks/useScrollVelocity.ts, fed from the existing Lenis instance
scrollVel = scrollVel * K.k098 + (scrollY - prevScrollY) * (1 - K.k098)
```

Consumed as:
```
uNoiseShiftY += 0.00015 · scrollVel · d      // noise UV scroll
uColourDrift += 0.0026·d + 0.0004·scrollVel  // palette drift, ping-pong ±0.8,
                                             // randomised X offset on each wrap
                                             // ⇒ the colour never repeats identically
```

Lenis already exposes velocity, so no new listener is needed — `hooks/useLenis.tsx:32-37` just needs to publish it into the store. **Do not add GSAP ScrollTrigger.** The reference ships none, and proves it is unnecessary (§8.2).

Reveals stay on `useAnimeEntrance`'s IntersectionObserver (`hooks/useAnimeEntrance.ts:38`) — cheaper and simpler than the reference's manual per-frame position math, and one of the few places Crovion is already ahead.

---

## 15. Responsive Strategy

`PointerProvider.tsx:42` already computes `coarse` from `(pointer: coarse)` and **nothing reads it**. That value becomes the mobile branch.

| Tier | Detection | DPR | Blur | Trail | Blob source |
|---|---|---|---|---|---|
| **Desktop** | `min(screen.w, screen.h) ≥ 600` and not coarse | **1** | 0.6× / 31 taps | **Full**, 30 stamps | Full |
| **Tablet** | aspect ratio 0.68–0.76 | 1.25 | 0.75× / 15 taps | Click ripple only | Full |
| **Phone** | `min(screen.w, screen.h) < 600` | **1.5** | 0.9× / 15 taps | **Skipped entirely** — bind a 1×1 black texture | Reduced count |

Detection follows the reference's `screen`-dimension + aspect-ratio method rather than UA sniffing (§13) — more robust, and it deliberately classifies touch-capable laptops as desktop, which is the right call because they *do* have a cursor.

**Skip the trail pass, don't zero it.** Binding a 1×1 black texture removes a whole render target and its draw call rather than rendering an empty one.

**Breakpoints must be a single source of truth.** The reference has CSS breaking at 767 while its engine breaks at 600 — a genuine inconsistency it admits to. Crovion should export the values from `webgl/config/quality.ts` and consume the same numbers in Tailwind, so this cannot drift.

**Keep** the existing `clamp()`-based fluid typography (`Hero.tsx:182`) — it is already correct and is protected by §10.

---

## 16. Performance Strategy

### 16.1 Budget at 1920×1080

| Buffer | Resolution | Pixels | Rate | Notes |
|---|---|---|---|---|
| Main canvas | 1920×1080 @ **DPR 1** | 2.07 M | 60 fps | Desktop forced to 1 |
| Noise FBO | 512×512 | 0.26 M | **30 fps** | ⇒ 0.13 M/frame effective |
| Trail FBO | 960×540 | 0.52 M | 60 fps | Sparse — ~31 quads |
| Blob FBO | 1152×648 (0.6×) | 0.75 M | 60 fps | |
| Blur A / B | 1152×648 | 0.75 M each | 60 fps | The GPU budget lives here |
| Composite | 1920×1080 | 2.07 M | 60 fps | ~4 texture fetches |

**Blur is the dominant cost:** 0.75 M px × 16 linear-sampled taps × 2 passes ≈ **24 M texel fetches/frame**. Naive 31-tap would be 46 M. This is why 0.6× resolution and linear-sampled taps are both non-negotiable.

### 16.2 Draw calls and textures

| | Current | Target (Stage C) |
|---|---|---|
| Draw calls/frame | ≈ 30+ — 6 bg spheres + 7 blobs + Line + Html + ContactShadows (~3) + EffectComposer chain (~12, incl. Bloom mip chain) + aurora (1, separate context) | **≈ 12** — noise 1, trail 2, blobs 2, blur 2, composite 4 |
| Vertices/frame | **70,855** at 15 `snoise` each | **~28** (7 quads) |
| `snoise`/frame | ≈ 1.06 M vertex + 6/px fragment | ≈ 131 k (one 512² pass, half-rate) |
| WebGL contexts | **2** | **1** |
| RAF loops | **3** | **1** |
| Texture VRAM | MSAA target ≈ **75 MB** + Environment cubemap + Bloom mip chain | ≈ **20 MB** total (all FBOs + brush + LUT + grain) |

The MSAA figure: `multisampling={4}` (`HeroCanvas.tsx:412`) at DPR 1.5 on a 1080p display → 2880×1620 × 4 bytes × 4 samples ≈ **74.6 MB**, for a scene whose every edge is about to be replaced by a blurred alpha threshold.

### 16.3 How we get premium interaction without a heavy site

1. **Delete the second context.** Fold the aurora into the pipeline's background pass. Removes ~20 noise lookups/pixel at DPR 2, one context and one RAF.
2. **Cap DPR at 1 on desktop.** The reference does this and still reads as premium — because a soft-edged fluid has no hard edges to alias. Halves fragment cost versus DPR 1.5.
3. **Blur at 0.6×.** ~64 % fewer pixels through the most expensive passes.
4. **Bake the noise, half-rate it.** ~1.06 M evals/frame → ~131 k.
5. **Delete `EffectComposer`.** −75 MB VRAM, −~12 draw calls, and it stops fighting the custom chain.
6. **Fixed pools, zero hot-path allocation.** 30 trail + 2 click slots. Already the discipline in `FluidBlob.tsx:439-441`.
7. **Precomputed lerp table in `lib/frame.ts`.** One multiply-add per smoothed value instead of `Math.pow(k, dt)` — the reference's best single idea (§17.2), including low-passing Δt itself (`0.95/0.05`) and clamping at 20 so a restored background tab doesn't teleport everything.
8. **Pause when hidden.** `document.visibilitychange` + an IntersectionObserver on the canvas. Neither context does this today.
9. **`antialias: false`, `depthWrite: false` on particle layers, `frustumCulled = false` on full-screen fields.**
10. **`ContactShadows` → `frames={1}`** if kept at all. It renders a shadow pass every frame for `opacity 0.06`.

### 16.4 Fallbacks

- **Desktop fallback:** WebGL unavailable → the existing `WebGLErrorBoundary` pattern (`components/ui/silk-aurora-utils/webgl-error-boundary.tsx`) generalised to a CSS radial-gradient still frame in brand purple. This component already exists and works; reuse it rather than writing a new one.
- **Mobile fallback:** trail pass skipped, blur at 0.9× with 15 taps, reduced blob count, click ripple retained.
- **Context loss:** handle `webglcontextlost` / `webglcontextrestored`, keep a CSS gradient underneath. Neither context does this today; the reference doesn't either — an easy place to be better.
- **FPS watchdog:** rolling frame-time average; two consecutive seconds under threshold ⇒ drop a tier. Guard against oscillation with hysteresis.

---

## 17. Accessibility Strategy

**Crovion is currently ahead of the reference here, and that lead must not be lost during the port.** `hooks/usePrefersReducedMotion.ts` is live-reactive via `useSyncExternalStore` with a correct `getServerSnapshot`, and it is already wired to both the interaction driver (`HeroCanvas.tsx:326`) and the entrance timeline (`Hero.tsx:51`). The reference has **no reduced-motion path at all** on a site that is entirely motion.

**Reduced motion must be built in at Stage A, not retrofitted at the end.** The reference study rates this MEDIUM-HIGH risk precisely because retrofitting a pass chain is painful.

On `prefers-reduced-motion: reduce`:

| | Behaviour |
|---|---|
| `uTime` | Frozen — ambient ripple stops |
| Trail | Disabled; sampler bound to a 1×1 black texture |
| Click ripple | Disabled |
| Noise | Rendered **once**, never updated |
| Loop | One composed frame, then `frameloop="demand"` |
| Composition | **Fully preserved** — the design does not degrade, only the motion |
| Live change | Watched via matchMedia; restores without reload (already true) |

Note the current gap this closes: today reduced motion disables the *driver* but leaves 1 M noise evals/frame and both RAF loops running — the cost stays, only the interaction goes.

**Additional requirements, none of which the reference meets:**
- Canvas `aria-hidden="true"` and `pointer-events: none`. Already correct on the aurora (`SilkAurora.tsx:421-424`); apply the same to `FluidCanvas`.
- Real DOM text alongside the canvas — never canvas-only content. Crovion already does this right: a real `<h1>` at `Hero.tsx:182`. **Do not adopt the reference's empty-`#contents` pattern**; it costs both SEO and screen-reader access.
- `:focus-visible` styles. `app/globals.css` currently defines none, and `CTAButton.tsx:33` sets `outline-none` — the exact WCAG 2.4.7 failure the reference commits. **Fix this rather than inheriting it.**
- `<main>` landmark: present (`app/page.tsx:38`). `<nav>`: present (`Navbar.tsx:29`). `aria-expanded` on the menu toggle: already present (`Navbar.tsx:57`). Still missing: focus trap and `Esc`-to-close on the overlay.

---

## 18. Files To Modify

Ordered by stage. Stage A and B touch **no** typography, colour, copy, layout or DOM structure.

### Stage A

| File | Change | Why |
|---|---|---|
| `app/layout.tsx` | Mount `<FluidCanvas>` + pointer bridge once, outside `{children}` | Persistent canvas is the single most important structural decision. Fonts/metadata untouched. |
| `app/page.tsx` | Remove `<SilkAuroraBackground>`; the background becomes a pipeline pass | Kills the second WebGL context and RAF loop |
| `components/PointerProvider.tsx` | Add centre-origin px + velocity + dead zone + throttle alongside the existing NDC fields; hoist out of `Hero` to app level | NDC is right for raycasting, wrong for a trail RT. Both are needed. Ref discipline (`:31,:100`) kept verbatim. |
| `components/HeroCanvas.tsx` | **Remove `<EffectComposer>` block (`:412-425`)**; render the scene to `blobFBO` instead of the screen; `antialias: false`; `dpr` from tier config; `<ContactShadows frames={1}>` or removed | The composite replaces the composer. −75 MB VRAM, −12 draw calls. Lights, camera, sphere layout, colours **unchanged**. |
| `hooks/useLenis.tsx` | Publish scroll velocity into the store | Enables velocity coupling with no new listener |
| `app/globals.css` | **Additive only** — motion tokens + `:focus-visible`. Zero changes to the `@theme` block | §10: colours and fonts are frozen |

### Stage B

| File | Change | Why |
|---|---|---|
| `components/HeroCanvas.tsx` | Delete `<Line>` (`:145-151`) and the 3 bead `FluidBlob`s (`:154-177`) | The threshold makes the bridge emergent — the reference's `glJoint` insight |
| `components/FluidBlob.tsx` | Ensure blob alpha is authored for thresholding: soften the grazing feather (`:333`), `depthWrite: false`, drop `uGrain` (grain moves to the composite overlay) | Blur+threshold needs a soft alpha ramp to neck. Colour ramp `:300-313` **unchanged**. |
| `lib/sphereDistortion.ts` | Reduce `distortionStrength` toward zero as the trail takes over; keep the file | Its constants stay useful for hover/press feedback even after the trail lands |

### Stage C (only if approved after B)

| File | Change |
|---|---|
| `components/FluidBlob.tsx` | Vertex displacement + finite-difference normals retired; component becomes a sprite-instance descriptor |
| `components/SphereInteraction.tsx` | Repurposed from "drives the dent" to "hit-tests DOM-bound clickable nodes" — the `glMainBallDom` role |
| `components/HeroCanvas.tsx` | Sphere layout replaced by `webgl/config/nodes.ts` coordinates |

### Not modified, at any stage

`components/Hero.tsx` DOM (`:162-234`) · `components/Navbar.tsx` · `components/CTAButton.tsx` · `components/AboutSection.tsx` · `components/WorkSection.tsx` · `components/FooterSection.tsx` · `components/LoadingScreen.tsx` · the `@theme` block · both font choices · every `clamp()` type size · the `#6D4AFF` accent and all purple tokens.

---

## 19. Files To Create

Nothing below exists yet; nothing below is created in this phase.

**Pipeline**
```
webgl/FluidCanvas.tsx                    <Canvas> root — DPR clamp, ortho pass camera, alpha, a11y attrs
webgl/FluidScene.tsx                     ONE useFrame, explicit pass order, guaranteed RT restore
webgl/passes/NoisePass.tsx               512², half-rate
webgl/passes/PointerTrailPass.tsx        0.5× RT, 30-stamp pool
webgl/passes/BlobPass.tsx                scene → RGBA FBO
webgl/passes/BlurPass.tsx                one component, used twice, direction as uniform
webgl/passes/CompositePass.tsx           threshold + displacement + ripple + grain → screen
webgl/objects/StampPool.tsx              pooled InstancedMesh ring sprites
```

**Shaders**
```
webgl/shaders/passthrough.vert.glsl
webgl/shaders/noise.frag.glsl
webgl/shaders/blur.frag.glsl
webgl/shaders/composite.frag.glsl        ⚑ the metaball threshold
webgl/shaders/background.frag.glsl       gradient LUT + drift (absorbs the aurora)
webgl/shaders/lib/simplex3d.glsl         moved from FluidBlob.tsx:29-101, MIT header intact
```

**Config / state / hooks**
```
webgl/config/quality.ts                  DPR, blurScale, tapCount, poolSize, breakpoints — single source of truth
webgl/config/nodes.ts                    desktop + mobile coordinates (Stage C)
lib/store.ts                             zustand: pointer, scrollVel, tier, reducedMotion
lib/frame.ts                             ⚑ low-passed clamped Δt + lerp coefficient table
lib/tween.ts                             ~40-line uniform tweener with kill-on-retarget
hooks/usePointerField.ts                 dead zone, throttle, velocity, centre-origin
hooks/useScrollVelocity.ts               smoothed scroll velocity off Lenis
hooks/useDeviceTier.ts                   screen-dimension + aspect based
```

**Assets — all ORIGINAL Crovion artwork, none derived from the reference**
```
public/textures/brush.webp               512² soft irregular ring. Its alpha IS the falloff curve.
public/textures/gradient.webp            1024² purple/indigo LUT built from the existing @theme tokens
public/textures/grain.webp               512² tiling grain for the 3 % overlay
public/textures/blob-atlas.webp          Stage C only — 2×2 sprite atlas
app/icon.ico                             ⚑ move src/app/favicon.ico here so it actually loads
```

---

## 20. Files To Remove

**Nothing is deleted in this phase.** These are candidates, each requiring explicit approval.

| Path | Recommendation | Reason |
|---|---|---|
| `src/` (4 files) | **DELETE** — safe | Next ignores `src/app` when root `app/` exists (docs `src-folder.md:31`). Move `favicon.ico` to `app/icon.ico` **first** — it is the only favicon in the repo. |
| `backup/` (3 files) | **ARCHIVE, don't delete** | Vanilla three 0.162 prototype with `UnrealBloomPass`. Not imported. Real historical value; move out of the build tree. |
| `hooks/useScrollProgress.ts` | **DELETE** | Zero importers |
| `components/SilkAuroraBackground.tsx` | **KEEP the file, unmount it** (Stage A) | 428 lines of working WebGL and a good error-boundary pattern. Its *look* should be reproduced as the pipeline's background pass. Delete only after that pass ships. |
| `components/ui/water.tsx` + `app/demo/page.tsx` | **KEEP for now, remove before launch** | The only `@paper-design/shaders-react` consumers. A useful reference playground; must not ship. |
| `public/*.svg` (5 Next.js starter SVGs) | **DELETE** | Unused boilerplate |
| `ref-frames/`, `ref-frames-2/` (38 images) | **KEEP, exclude from deploy** | Reference material. Add to `.gitignore`/deploy ignore rather than the bundle. |

---

## 21. Implementation Sequence

**Phase 0 — Foundations.** Per `AGENTS.md`, read `node_modules/next/dist/docs/` before writing any Next-specific code — this version has breaking changes vs. training data, and the `src/app` precedence rule above is a live example. Create `lib/frame.ts`, `lib/store.ts`, `webgl/config/quality.ts`, `hooks/useDeviceTier.ts`. Move the simplex GLSL out of `FluidBlob.tsx`. Wire Leva + stats.js dev-only.
*Exit:* clean build, one Δt source of truth, tier detection reports correctly on a phone.

**Phase 1 — Canvas shell.** `<FluidCanvas>` in `app/layout.tsx`. Ortho pass camera, DPR clamp, debounced resize, `webglcontextlost` handling, `aria-hidden`.
*Exit:* canvas mounts once and survives a client-side navigation without remounting.

**Phase 2 — ⚠ THE GATE: prove the metaball.** Blob FBO → blur H → blur V → threshold composite. Static blobs, no pointer, no noise.
*Exit:* **two separate blobs visibly merge with a smooth neck, at 60 fps on real hardware.** Do not proceed until this is on screen. Everything downstream assumes it.

**Phase 3 — Stage A composite over the existing scene.** Route `HeroCanvas`'s render into `blobFBO`; remove `EffectComposer`; ambient radial ripple; noise pass; background pass absorbing the aurora; unmount `SilkAuroraBackground`.
*Exit:* the hero looks **identical to today** apart from the ambient ripple; one WebGL context; one RAF; frame time down.

**Phase 4 — Pointer trail.** Trail FBO, 30-stamp pool, dead zone, throttle, velocity modulation, click ripple, brush texture authored.
*Exit:* the trail reads as fluid across the whole field; zero allocation in the hot path (verify with a heap profile).

**Phase 5 — Stage B threshold on the spheres.** Soften blob alpha; enable threshold; delete `<Line>` and the beads; tune `uThreshold`/`uCutoff`/blur radius in Leva.
*Exit:* spheres fuse and neck while floating. **Decision point on Stage C.**

**Phase 6 — Scroll.** Velocity publishing off Lenis; velocity→uniform coupling.
*Exit:* scrolling fast visibly energises the field.

**Phase 7 — Responsive.** Tier branches, trail skipped on touch, mobile blur/DPR, `100svh`, orientation handling.
*Exit:* verified on real iOS + Android hardware, not an emulator.

**Phase 8 — Accessibility verification.** (Implementation happened in Phase 2 — this phase only *verifies*.) Add `:focus-visible`, overlay focus trap + Esc.
*Exit:* keyboard-only pass and reduced-motion pass both clean.

**Phase 9 — Performance + cleanup.** Dependency pruning, texture budget, FPS watchdog, visibility pausing, `src/` and `demo/` removal, favicon fix, `package.json` rename.
*Exit:* 60 fps desktop, ≥30 fps mid-tier mobile, Lighthouse pass.

---

## 22. Testing Plan

| # | Test | Method | Pass criterion |
|---|---|---|---|
| 1 | **Merge** | Two blobs animated toward each other | A smooth neck forms and breaks. No hard seam at any distance. |
| 2 | **Threshold band** | Sweep `uThreshold` 20→200 in Leva | A usable range exists with neither crunchy aliasing nor mush |
| 3 | **Trail persistence** | Flick the cursor, then stop | Trail decays over ~1 s; nothing snaps to zero on cursor-stop |
| 4 | **Velocity legibility** | Slow drift vs fast flick, side by side | Visibly different — the stated improvement on the reference |
| 5 | **No hot-path allocation** | Chrome heap profile, 60 s of movement | Flat sawtooth; no growth attributable to the pointer path |
| 6 | **Canvas persistence** | Client-side navigation | Same canvas element identity before/after. Assert in a test. |
| 7 | **Reduced motion** | Toggle the OS setting **while the page is open** | Motion stops within one frame, composition intact, `frameloop` drops to demand, restores on toggle back |
| 8 | **Touch** | Real iOS + Android | No trail pass allocated; click ripple works; ≥30 fps |
| 9 | **DPR** | Retina desktop | Renders at DPR 1; no visible aliasing (soft edges make this safe) |
| 10 | **Resize** | Drag-resize; rotate a phone; scroll to trigger mobile browser chrome | All FBOs resize; no leaks; no spurious resize from chrome show/hide |
| 11 | **Context loss** | `WEBGL_lose_context` extension | Graceful fallback, then restore |
| 12 | **Frame budget** | stats.js + Chrome GPU trace | Desktop < 16.6 ms; blur passes < 40 % of frame |
| 13 | **VRAM** | `about:gpu` / Safari inspector | ≤ 30 MB texture memory (from ≈ 75 MB MSAA alone today) |
| 14 | **Tab restore** | Background 5 min, return | Nothing teleports — Δt clamp at 20 works |
| 15 | **Visual regression** | Screenshot diff vs today at 1440/1280/768/390 | **Typography, colours, layout, copy: pixel-identical.** Only the blob layer differs. |
| 16 | **Keyboard** | Tab through the whole page | Every interactive element has a visible focus ring |
| 17 | **Lighthouse** | Mobile + desktop | No regression vs the current baseline |
| 18 | **Originality** | Side-by-side with the reference | *Could an informed observer call ours a copy?* Must be **no**. |

---

## 23. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **§10 vs §8 conflict** — a literal port deletes the visual object §10 protects | **HIGH** | The Stage A/B/C split (§7.2). Stage C is a separate approval, not an assumed continuation. **Unresolved — needs your decision.** |
| 2 | **Blur cost.** Two 31-tap passes are the entire GPU budget | **HIGH** | DPR 1 desktop, blur 0.6×, linear-sampled taps (16 not 31), tap count as a tier constant |
| 3 | **Threshold tuning is finicky.** The edge band is ~1/uThreshold wide | **HIGH** | Leva from commit one. Tune against real sprites at real sizes. |
| 4 | **FBO ping-pong inside R3F** fights the declarative model; render order and `setRenderTarget(null)` are easy to get wrong | **HIGH** | `createPortal` + `useFBO`; **one** `useFrame` with explicit priority; restore the target on every path including early returns |
| 5 | **3D spheres may not threshold convincingly.** Their alpha is 1 in the interior with only a grazing feather (`FluidBlob.tsx:333`) | **MEDIUM-HIGH** | Prove in Phase 2 with the *actual* sphere output, not placeholder sprites. If it fails, that is the honest trigger for Stage C. |
| 6 | **Reduced motion is architectural, not a toggle** | **MEDIUM-HIGH** | Built in Phase 2. Phase 8 only verifies. |
| 7 | **Mobile thermals.** Six passes will throttle mid-tier Android | **MEDIUM-HIGH** | Tier system + FPS watchdog with hysteresis |
| 8 | **Removing `EffectComposer` changes the look** — Bloom/Vignette/ACES currently contribute | **MEDIUM** | Screenshot-diff before/after; re-create any wanted lift inside the composite (a vignette is 2 lines) |
| 9 | **Canvas remount kills continuity** — the easiest way to lose the whole effect | **MEDIUM** | Root layout only + a regression test on canvas identity |
| 10 | **Aurora removal changes the page background** | **MEDIUM** | The background pass must reproduce it *before* unmounting. Its shader (`SilkAurora.tsx:70-108`) is the spec — port the gradient to a LUT rather than re-running 20 noise lookups/pixel. |
| 11 | **Texture memory.** 1024² RGBA = ~4 MB VRAM regardless of file size | **MEDIUM** | Single-channel for brush and grain; 512² where the source is soft |
| 12 | **11 unused dependencies** | **MEDIUM** | Prune in Phase 0, before anything becomes load-bearing |
| 13 | **Next 16 API drift.** `AGENTS.md` warns explicitly; `src/app` precedence is a live example | **MEDIUM** | Read `node_modules/next/dist/docs/` before route/layout work. Non-negotiable. |
| 14 | **Shader iteration is slow** without hot reload | **LOW-MEDIUM** | GLSL HMR + Leva-bound uniforms in Phase 0; pays for itself in Phase 2 alone |
| 15 | **Legal/creative originality** | **MEDIUM** | Author every texture. Tune every constant away from 80/10. Never copy their GLSL. Keep the Ashima MIT header. |

---

## 24. Final Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ app/layout.tsx                    fonts · metadata · <html lang="en">        ║
║   ├── <PointerBridge/>            ONE window pointermove → lib/store.ts      ║
║   ├── <FluidCanvas/>  ⚑ PERSISTENT — outside {children}, never remounts      ║
║   └── {children}                  routed DOM fades over the canvas          ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        │                                                           │
   ═══ DOM LAYER (untouched by §10) ═══            ═══ WEBGL LAYER (new) ═══
   Navbar · Hero copy · <h1> · CTAButton           ONE context · ONE RAF
   About · Work · Footer · LoadingScreen                    │
   Tailwind @theme · Outfit · DM Serif                      │
   framer-motion + animejs                                  │
        │                                                   │
        └── pointer-events on top of ──────────►            │
                                                            ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  INPUT                                                                    │
  │  pointermove → (clientX-w/2, clientY-h/2) → dead zone 3px                 │
  │              → throttle 4/d frames → velocity → tier & motion gate        │
  │              → STAMP into 30-slot pool  (touch/reduced-motion: skipped)   │
  └───────────────────────────────┬──────────────────────────────────────────┘
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  ONE useFrame — six passes, strict order, RT always restored              │
  │                                                                           │
  │  ① NOISE   512²  half-rate  z += .008·d ──────────────► noiseFBO ──┐      │
  │                                                                     │      │
  │  ② TRAIL   0.5×  30 stamps: scale .2→8, opacity .9→0 ─► trailFBO ──┤      │
  │                              ⚑ THE DISPLACEMENT MAP                 │      │
  │                                                                     │      │
  │  ③ BLOBS   Stage A/B: existing purple spheres, unchanged            │      │
  │            Stage C:   instanced sprite quads      ────► blobFBO     │      │
  │                                          │                          │      │
  │  ④ BLUR H  0.6× · 16 linear taps · alpha-weighted ──► blurA         │      │
  │  ⑤ BLUR V  same shader, uDir = (0, 1/h)          ──► blurB ─┐       │      │
  │                                                             │       │      │
  │  ⑥ COMPOSITE → screen                                       ▼       ▼      │
  │     ┌───────────────────────────────────────────────────────────────┐    │
  │     │ uv  += sin(trail.r) · uDisplaceAmt      ← cursor displacement  │    │
  │     │ uv  += uStrength · sin(-t + |p·14|)     ← ambient ripple       │    │
  │     │ α    = α · uThreshold - uCutoff         ★ METABALL — merging   │    │
  │     │ rgb += noise.r·0.13 + trail.r·0.11      ← grain + cursor light │    │
  │     └───────────────────────────────────────────────────────────────┘    │
  │     background LUT (absorbs the aurora) → metaball → front → 3% grain     │
  └──────────────────────────────────────────────────────────────────────────┘
                                  ▼
                     ONE CANVAS · DPR 1 desktop / 1.5 mobile
                     antialias:false — edges come from the threshold
                     aria-hidden · pointer-events:none
                     reduced motion → one static frame, frameloop:"demand"
```

---

## Appendix — Dependency Audit

Verified by a full import-graph grep across `app/`, `components/`, `hooks/`, `lib/`, `src/`.

| Package | Status | Where used | Recommendation |
|---|---|---|---|
| `three` 0.185.1 | **USED** | `FluidBlob:5`, `HeroCanvas:19`, `SphereInteraction:5` | **KEEP** — required |
| `@react-three/fiber` 9.6.1 | **USED** | `HeroCanvas:2`, `FluidBlob:4`, `SphereInteraction:4` | **KEEP** — required |
| `@react-three/drei` 10.7.7 | **PARTIALLY USED** | `HeroCanvas:3-11` — 7 helpers | **KEEP** — `useFBO` is central to the new pipeline. `Environment`/`ContactShadows`/`Lightformer` become unnecessary at Stage C. |
| `@react-three/postprocessing` 3.0.4 | **USED** | `HeroCanvas:12-17` | **DO NOT USE FOR FLUID.** Remove in Phase 3. Its Bloom blurs *luminance*, not alpha, and its composer fights a hand-rolled chain. −75 MB VRAM. |
| `postprocessing` 6.39.2 | **USED** (enums only) | `HeroCanvas:18` — `BlendFunction`, `ToneMappingMode` | **REMOVE** with the above |
| `framer-motion` 12.42.2 | **USED** | Navbar, Hero, CTAButton, LoadingScreen, About, Work, `useMouseParallax`, `useScrollProgress` | **KEEP** — the DOM animation layer. §10 depends on it. |
| `animejs` 4.5.0 | **USED** | Hero, LoadingScreen, Footer, `useAnimeEntrance` | **KEEP** — also covers uniform tweening; **do not add GSAP** |
| `lenis` 1.3.25 | **USED** | `useLenis:11` | **KEEP** — exactly what the reference uses |
| `zustand` 5.0.14 | **UNUSED** | — | **KEEP** — becomes `lib/store.ts` (pointer / scrollVel / tier / motion) |
| `@react-spring/three` 10.1.2 | **UNUSED** | — | **REMOVE** — duplicates framer-motion + animejs |
| `@paper-design/shaders-react` 0.0.77 | **PARTIALLY USED** | `ui/water.tsx:3` → `app/demo/page.tsx:4` only | **DO NOT USE FOR FLUID.** A black-box shader lib that will fight a custom pass chain. Remove with `demo/`. |
| `glsl-noise` 0.0.0 | **UNUSED** | — | **REMOVE** — v0.0.0, and the simplex we need is already inline at `FluidBlob:29-101` |
| `leva` 0.10.1 | **UNUSED** | — | **KEEP, dev-only.** Essential for tuning `uThreshold`/`uCutoff`/blur radius. Must be tree-shaken out of production. |
| `stats.js` 0.17.0 | **UNUSED** | — | **KEEP, dev-only** — needed for the Phase 2 perf gate |
| `maath` 0.10.8 | **UNUSED** | — | **REMOVE** |
| `react-use` 17.6.1 | **UNUSED** | — | **REMOVE** — large grab-bag; the repo already writes its own hooks |
| `lucide-react` 1.24.0 | **UNUSED** | — | **REMOVE** — icons are inline SVG (`HeroCanvas:121-127`, `Navbar:61-72`) |
| `clsx` + `tailwind-merge` | **USED** | `lib/utils.ts:1-2` → `webgl-error-boundary` | **KEEP** — tiny |
| `@types/three` 0.185.0 | **USED** | Ambient types | **KEEP** |

**Verdict: no new dependency is required to build the entire target architecture.** Everything needed — `three`, `@react-three/fiber`, `drei`'s `useFBO` + `createPortal`, `zustand`, `lenis`, `leva` — is already installed. 6 packages are removable, 2 are dev-only, 1 goes with the demo route. Nothing is removed in this phase.

---

*End of plan. No implementation code written. No packages installed. No existing file modified.*
