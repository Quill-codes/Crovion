# Bravis Preloader → Hero Intro Study

**Subject:** `https://www.bravis.com/en/` — the sequence from first paint to the settled hero.
**Scope:** the *intro*, not the steady-state blob morph. Everything from the red curtain to the moment the field becomes autonomous.
**Companion doc:** `BRAVIS_REFERENCE_ARCHITECTURE.md` (engine, shaders, palette, typography). This document does not repeat it.

---

## 0. Evidence grade and method

Almost everything below is **OBSERVED at source level**, not inferred from watching a video. Method, so it can be re-run:

1. Loaded the page in a controlled Chrome tab and read `#gl-loading`'s live computed styles mid-transition — caught the curtain at `opacity: 0.6052`, which proved the exit is an opacity tween rather than a clip or slide.
2. Enumerated `gsap.globalTimeline.getChildren()` **while the exit was still running** and read every tween's `duration`, `delay`, `startTime`, `vars`, and its internal `_pt` property-tween chain — which carries the exact `start` and `change` values. That yields literal from → to numbers, not estimates.
3. Fingerprinted each tween's ease function by sampling it at 21 points and matching against `gsap.parseEase` for every standard ease. All seven matched a named ease with error `0.0000`.
4. Walked the `_glMain` object graph to identify each tween's target by identity (which `Object3D.scale`, which `Euler`, which uniform).
5. Downloaded and read `glmain.min.js` (346 KB, minified but **not** property-mangled) and the Nuxt client bundle, and read the actual `loadEnd`, `contentsStart`, `openingEnd`, `viewStart` implementations verbatim.
6. Re-ran the whole intro deterministically: paused `gsap.globalTimeline`, restored the curtain, re-invoked `_glMain.contentsStart()`, then scrubbed `globalTimeline.time()` and manually pumped `_glMain.animationLoop()` one frame per sample — capturing exact frames at T = 0.00, 0.35, 0.70, 0.90, 1.20, 1.50, 1.80, 2.20, 2.80 s.

So the timings in §7 are **read out of the running code**, and the visual claims in §1–§6 are from frames captured at known timeline positions.

Marks used throughout: **OBSERVED** (read from source or from a frame at a known time) · **INFERRED** (reasoned from observed facts) · **UNKNOWN** (not established).

---

## 1. Red Loading Screen

### Is it a true preloader?

**Yes. OBSERVED.** It is a real asset gate with no synthetic timer anywhere in the path.

```
glMain.init()
  → jsonLoadComp()            // projects.json (synchronous XHR)
  → glPartsMng.firstLoad()    // _pipeline = 4, fixed 4-way concurrency
  → …every _firstItem lands…
  → fLoadCompCheck(): _imgLoadedNum >= _imgNum
  → _glMain.partsLoadComp()
       ├─ animationStart()    // requestAnimationFrame loop begins — FIRST TIME
       └─ createWorld()       // builds glTop/glFeatures/…/glWorld synchronously
            → glWorld.init()  // ← the WebGLRenderer and <canvas> are CREATED HERE
            → setupDummy() → setupVTex() → setupDisplay()
            → _glMain.setupWorld()
                 → contentsStart()   // ← T = 0 for everything below
```

**There is no minimum display time and no maximum.** `partsLoadComp` fires the instant the last critical asset resolves; the curtain lifts on the same synchronous tick. **OBSERVED** — I read the whole chain; there is no `setTimeout`, no floor, no floor-and-ceiling gate.

### Markup and styling — OBSERVED

```html
<div id="gl-loading">
  <div class="gl-loading-bg"></div>
  <div class="gl-loading-logo"><img src="/en/static/gl/image/ui/loading-logo.svg"></div>
  <div class="gl-loading-ring"></div>   <!-- created in JS, not SSR -->
</div>
```

```css
#gl-loading      { position:fixed; inset:0; z-index:99999; }
.gl-loading-bg   { background-color:#e50012; }                 /* flat brand red, no gradient */
.gl-loading-logo { width:412px; top:50%; left:50%; transform:translate(-50%,-50%); }
.gl-loading-ring { width:40px; height:40px; top:calc(50% + 90px);
                   animation:0.6s linear infinite loading-rot; }
```

`#gl-loading` is a direct child of `#__nuxt`, `position: fixed`, `z-index: 99999`. Nothing else on the page comes close — the nav is `z-index: 101`, the route-transition cover is `500`. **OBSERVED.**

### There is no progress indicator

Only a spinning ring. **No percentage, no bar, no counter.** **OBSERVED.** `glPartsMng` tracks `_imgNum` / `_imgLoadedNum` internally, but that number is never surfaced to the user. This is a deliberate choice worth noting: a spinner promises nothing, so a long wait never reads as a *stalled* wait.

### How long does it remain?

**Network- and device-dependent, with no floor.** The gate is 82 critical resources — 57 textures + 24 shader files + JSON — totalling **~1.81 MB decoded**, fetched 4-at-a-time. **OBSERVED** (resource-timing census).

In my session the last critical asset resolved at **~7.9 s** from navigation start, but that tab was backgrounded during load and image decode is throttled there, so **treat that number as an upper bound, not a measurement**. **INFERRED:** on a warm cache and a fast connection this is roughly 1.5–3 s; cold on mobile it is comfortably 5 s+. The exact typical figure is **UNKNOWN**.

### What is underneath during loading?

**Nothing.** **OBSERVED.** The `<canvas>` does not exist yet — `glWorld.init()` creates the `WebGLRenderer` and appends `_render.domElement` to `#gl-world`, and `glWorld` is only constructed inside `createWorld()`, which runs at the *end* of loading. The `#gl-world` div is SSR'd and empty; the header and footer are SSR'd and sitting there statically; `#contents` is empty.

So: while the red is up, the page behind it is a blank fixed div, a nav, and a footer. **The canvas's very first rendered frame is already the intro's first frame.** That is structurally important — see §8.

---

## 2. Loader Exit

Everything fires from one method. **OBSERVED, verbatim from `glmain.min.js`:**

```js
glMain.prototype.contentsStart = function () {
  this._world.contentsStart();      // wires render targets, starts every enterFrame
  this._sceneMng.contentsStart();
  this._event.contentsStart();
  this._scroll.contentsStart();
  this._top.contentsStart();
  this._features.contentsStart();
  this._projects.contentsStart();
  this._detail.contentsStart();
  this._other.contentsStart();
  this._ev = new Event("GL_ON_LOAD");
  window.dispatchEvent(this._ev);                     // ← the Vue side is told
  this._loading.loadEnd();                            // ← DOM curtain exit
  this._world._display.loadEnd();                     // ← global distortion settle
  this._world._dummy._transitionBall.loadEnd();       // ← the WebGL ball collapse
};
```

### The curtain exit — three opacity tweens, nothing else

**OBSERVED, verbatim:**

```js
glLoading.prototype.loadEnd = function () {
  gsap.to(this._bg,   1.0, { delay: 0.2, opacity: 0,             ease: Power3.easeOut,
                             onComplete: () => this._bg.style.display = "none" });
  gsap.to(this._logo, 1.1, { delay: 0.1, opacity: 0, scale: 0.1, ease: Power3.easeInOut,
                             onComplete: () => this._wrapper.style.display = "none" });
  gsap.to(this._ring, 0.6, {             opacity: 0 });          // gsap default ease: power1.out
};
```

Confirmed independently from the live timeline, including exact start values:

| Target | Property | From → To | Duration | Delay | Ease |
|---|---|---|---|---|---|
| `.gl-loading-ring` | opacity | 1 → 0 | 0.6 s | 0 | `power1.out` |
| `.gl-loading-logo` | opacity + scale | 1 → 0 / 1 → 0.1 | 1.1 s | 0.1 s | `power3.inOut` |
| `.gl-loading-bg` | opacity | 1 → 0 | 1.0 s | 0.2 s | `power3.out` |

All ease identifications matched with error `0.0000`. **OBSERVED.**

### Direct answers

| # | Question | Answer |
|---|---|---|
| 3 | Does the red screen fade? | **Yes — opacity only.** OBSERVED. |
| 4 | Does it slide? | **No.** No transform on `.gl-loading-bg` at any point. OBSERVED. |
| 5 | Does it clip? | **No.** `clip-path: none` throughout; the stylesheets contain zero `clip-path` declarations. OBSERVED. |
| 6 | Does it shrink? | **The bg does not.** The *logo* shrinks (scale → 0.1) while fading. OBSERVED. |
| 7 | clip-path transform? | **No.** OBSERVED. |
| 8 | Reveal from top/bottom/centre? | **From nowhere — it dissolves uniformly.** There is no directional wipe. OBSERVED. |
| 9 | Does the red screen become the fluid? | **Not literally — but visually, yes, and that is the whole trick.** The DOM curtain simply dissolves; what is revealed underneath is a *screen-filling sphere in the same red*. See §3. OBSERVED. |
| 10 | Is there a crossfade? | **Yes** — and it is the only compositing mechanism in the transition. OBSERVED. |
| 11 | Is there a mask? | **No.** No mask, no `mask-image`, no `backdrop-filter`, no `mix-blend-mode` anywhere in the served CSS. OBSERVED. |
| 12 | Is there a WebGL transition (a shader that transitions the curtain)? | **No.** The curtain is pure DOM and never touches WebGL. The WebGL layer runs its *own* concurrent animation; the two are coordinated by start time, not by a shared shader. OBSERVED. |

### The classification (§ "MOST IMPORTANT")

> **F — a combination**, and a deliberately unambitious one:
> **A** (a plain DOM overlay that only fades) **+ a full-screen WebGL layer beneath it that starts moving at the same instant.**
>
> Explicitly **not** C (no shader transition), **not** D (no clip-path or mask), **not** E (no route transition — the homepage never navigates during the intro).

The sophistication is **entirely in the choreography and the colour match**, not in the technique. The technique is `gsap.to(el, {opacity: 0})`.

---

## 3. Hero Reveal — the transition ball

This is the piece that makes the whole thing work, and it is the piece a video study would miss.

**OBSERVED, verbatim:**

```js
glTransitionBall.prototype.loadEnd = function () {
  this._group.rotation.z = 30 * Math.PI / 180;               // 0.5236 rad
  this._group.position.x = _glMain._world._centerX;
  this._group.position.y = _glMain._world._centerY;

  var t = 6 * (Math.max(window.screen.width, window.screen.height) / 1920);
  this._group.scale.x = t;                                   // 4.594 on a 1470-wide screen
  this._group.scale.y = t;

  this._openingTimer = { value: 0 };
  gsap.to(this._openingTimer, 0.8, { value: 1,
          onComplete: () => _glMain.openingEnd() });          // ← schedules the hero

  gsap.to(this._group.scale, 1.4, { x: 0.12, y: 0.12, ease: Power3.easeInOut,
    onComplete: () => {
      gsap.to(this._group.scale, 0.3, { x: 0.01, y: 0.01,
        onComplete: () => { _glMain.removeEnterFrame(this); this._group.visible = false; } });
    }});

  gsap.to(this._group.rotation, 1.5, { z: 0, ease: Power3.easeInOut });
};
```

### What the ball actually is — OBSERVED

Three textured planes in one `Object3D` group, sitting at `z = 11` at the exact viewport centre:

| Mesh | Geometry | Texture | Own rotation |
|---|---|---|---|
| `_mesh`  | `PlaneGeometry(400, 400)` | `transition_bg.webp` (540², alpha) | `+0.01 × delta` per frame |
| `_mesh2` | `PlaneGeometry(400, 400)` | `transition_front.webp` (540², alpha) | `−0.01 × delta` per frame |
| `_mesh3` | `PlaneGeometry(200, 200)`, vertices x-offset `+114`, `z = −1` | `transition_bg.webp` | `+0.02 × delta` per frame |

All three are plain `MeshBasicMaterial` with `transparent: true`. No custom shader, no `onBeforeCompile` (I checked — it is the empty default). **OBSERVED.**

`_mesh3`'s geometry is offset in x and then *rotated about the group origin*, which makes it **orbit** rather than spin in place — a satellite bead, for free, with no position maths.

**Both textures are red-to-pink radial gradient spheres.** I downloaded and inspected them: `transition_bg.webp` is a coral/crimson sphere with a cream rim; `transition_front.webp` is a deeper red/pink sphere. **OBSERVED.** Together, counter-rotating and metaball-merged, they read as one living red body.

### The critical architectural fact

The group lives in **`_dummy._scene`** — the same offscreen scene as the eight hero balls — which renders to `_dummy._render`, which is the input texture for `_display._middleRender` (the metaball threshold pass), then the blur, then the display shader. **OBSERVED.**

> **The transition ball and the hero blobs are the same field.** They pass through the same `α × 80 − 10` threshold and the same 31-tap Gaussian. They are not two layers that swap — they are one liquid that changes shape.

This is why the frame at T = 0.70 shows the giant red sphere with the *same* organic wobble as the hero blobs, and why nothing "pops" when one becomes the other.

### The global settle

**OBSERVED, verbatim:**

```js
glDisplaySet.prototype.loadEnd = function () {
  gsap.to(this._shader.uniforms.strength, 1.5, { value: this._strength, ease: Power3.easeInOut });
};
```

Measured from the live tween: **`strength` 0.01 → 0.004 over 1.5 s, `power3.inOut`.** **OBSERVED.** This is the full-screen refraction/warp amount in the display shader. The entire composited image is 2.5× more distorted at the moment the curtain lifts, and eases down across the whole reveal. Nothing else on screen is doing this, and you cannot consciously see it — which is exactly the point. See §8.

### Answers

| # | Question | Answer |
|---|---|---|
| 13 | Does the canvas already exist under the red screen? | **No.** It is created at the end of loading, and its first frame is already the intro. OBSERVED. |
| 14 | Does the first bubble exist underneath and get revealed? | **The *transition* ball does** — it is placed at screen-filling scale and starts collapsing on the same tick the curtain starts fading, so by the time the red is 50 % gone it is already visibly a sphere in motion. The **eight hero balls do not exist yet** — they arrive at T = 0.8. OBSERVED. |
| 15 | Does the bubble animate independently of the red transition? | **Yes — separate tweens, started in the same frame, deliberately overlapping.** There is no shared timeline object; the coupling is that both are kicked off by `contentsStart()`. OBSERVED. |

---

## 4. First Bubble Reveal — the hero chain

At **T = 0.8** the `_openingTimer` completes and calls `_glMain.openingEnd()` → `transitionNewPage(true)` → `viewStart()` → `_dummy.viewStart()` → (route status is `"top"`) `_topBallSet.viewStart()`.

**OBSERVED, verbatim:**

```js
glTopMainBall.prototype.viewStart = function () {
  this.isShow = true;
  this._frontBall.viewStart();
  _glMain._top.viewStart();                              // ← the DOM headline (§5)
  this._firstAnimCheck = 0;
  for (var t = 0; t < this._mainBallList.length; t++) this._mainBallList[t].viewStart();
  _glMain.addEnterFrame(this, "startFrame");
};
```

And per ball — **OBSERVED, verbatim:**

```js
glMainBall.prototype.viewStart = function () {
  …
  this._group.position.x = _glMain._world._centerX;      // ← every ball starts AT SCREEN CENTRE
  this._group.position.y = _glMain._world._centerY;
  this._group.visible = true;
  this.onResize();
  var i = this._op.id % 3 * 0.1;                          // ← 3-phase stagger: 0, 0.1, 0.2 s
  gsap.to(this._group.scale, 1.3, { delay: i, x: this._trgScale, y: this._trgScale,
                                    ease: Power3.easeInOut });
  gsap.to(this._group.position, 1.3, { delay: i, x: this._trgX,
                                       y: this._trgY + _glMain._scroll._scrollY,
                                       ease: Power3.easeInOut,
    onComplete: () => { this._parent.viewStartAnimCheck(); this._btn.viewStart(); } });
  if (this._underBall) this._underBall.viewStart();
};
```

**This is the payoff.** All eight hero balls are spawned **at the exact pixel where the transition ball is collapsing**, at scale ≈ 0.1 (a tenth of final), and then fly outward to their composition positions while scaling up, over 1.3 s with a 3-phase 0.1 s stagger.

Verified in the captured frames: at T = 0.90 all eight report `scale 0.10 @ (735, −401)` — the viewport centre, identical for all eight. By T = 1.50 they have spread into a merged multi-coloured metaball mass. **OBSERVED.**

The transition ball is at `scale 0.135` at T = 1.20 and `0.12` at T = 1.50 — i.e. **the red seed is still on screen, collapsing, as the hero balls emerge out of it.** It only disappears at T = 1.7. The two events overlap by ~0.9 s.

### When the balls land

**OBSERVED, verbatim:**

```js
glTopMainBall.prototype.viewStartAnimCheck = function () {
  if (++this._firstAnimCheck >= this._mainBallList.length) {
    for (var t = 0; t < this._mainBallList.length; t++) this._mainBallList[t].viewStartNext();
    this._topLine.viewStart();
    this._joint.viewStart();
    this.setTopH();
    _glMain.removeEnterFrame(this);
    _glMain.addEnterFrame(this, "topFrame");     // ← steady state begins here
  }
};
```

Last ball lands at **T = 0.8 + 0.2 + 1.3 = 2.3 s**, then:

- `viewStartNext()` on each ball — sub-balls and background words fade in
- `glTopLine.viewStart()` — connector line material `opacity → 0.16` over **1.0 s, `power3.out`** **OBSERVED**
- `glJoint.viewStart()` — joint shader `uniforms.alpha → 1` over **0.3 s** **OBSERVED**
- enterFrame swaps `startFrame` → `topFrame`: **the autonomous animation takes over**

Note the ordering discipline: **the connectors between the balls do not appear until every ball has stopped.** Threading lines between moving targets would have read as noise.

---

## 5. Typography Reveal

Fired at **T = 0.8**, inside the same `viewStart()`, before the balls' own tweens are created.

**OBSERVED, verbatim:**

```js
glTop.prototype.viewStart = function () {
  …
  gsap.set([this._bravis, this._copy1, this._copy2, this._copy3, this._sab], { opacity: 0 });
  gsap.to(this._bravis, 0.7, { delay: 0.50, opacity: 1, ease: Power3.easeInOut });
  gsap.to(this._copy1,  0.7, { delay: 0.65, opacity: 1, ease: Power3.easeInOut });
  gsap.to(this._copy2,  0.7, { delay: 0.80, opacity: 1, ease: Power3.easeInOut });
  gsap.to(this._copy3,  0.7, { delay: 0.95, opacity: 1, ease: Power3.easeInOut });
  gsap.to(this._sab,    0.7, { delay: 1.10, opacity: 1, ease: Power3.easeInOut });
  this._contentsWrapp.appendChild(this._title);
  _glMain.addEnterFrame(this, "enterFrame");
};
```

- **Five elements, 0.7 s each, `power3.inOut`, 0.15 s stagger.**
- **Opacity only.** No translate, no scale, no clip, no per-character split. **OBSERVED.**
- The `<h1 class="gl-main-title">` is **built in JS and appended to `#contents` at this moment** — it does not exist in the DOM before T = 0.8. **OBSERVED.**
- The five nodes are `<img>` elements, not text: `top_title_logo.webp` ("BRAVIS"), then three copy images ("THE TOTAL" / "BRANDING" / "COMPANY"), then the services block ("STRATEGY / CREATIVE / &DIGITAL"). The headline is baked into textures. **OBSERVED** (also noted in `BRAVIS_REFERENCE_ARCHITECTURE.md` §11 — and flagged there as an accessibility failure we should not copy).

Verified in captured frames: at T = 1.80 the five opacities are `[0.73, 0.13, 0.003, 0, 0]`; at T = 2.20 they are `[1, 1.00, 0.95, 0.50, 0.05]`; at T = 2.80 all `1`. **OBSERVED.**

---

## 6. Navigation Reveal

**There isn't one.**

- `nav.header` is server-rendered, `position: fixed`, `z-index: 101`, `opacity: 1` from first paint. **OBSERVED.**
- During the entire intro the global GSAP timeline contained **exactly seven tweens** — three curtain, four WebGL. **Not one of them targets the header, the language switcher, or the menu button.** **OBSERVED.**
- Captured frame at T = 0.35 (curtain at `opacity 0.52`): the nav is already fully visible, at full contrast, showing *through* the dissolving red. **OBSERVED.**

So the nav is simply **underneath the curtain the whole time**, and the curtain's own fade is what reveals it. It is at full opacity the instant the red drops below full — which is roughly 0.35 s in, well before anything else on the page exists.

The only Vue-side reaction to load is a state flag, **OBSERVED** in the Nuxt bundle:

```js
window.addEventListener("GL_ON_LOAD", () => { store.isReady.value = true; store.changeCustomScroll(); });
window.pageMoveEnd = () => { store.changeCustomScroll(); store.pageEnd(); };
```

`isReady` gates scroll enablement (Lenis), not any visual entrance. **OBSERVED.**

This is a real design decision, not an oversight: **the chrome is not part of the show.** Animating the nav in would tell the user the page is still arriving. Leaving it static says it was always there and the *content* is what is arriving.

---

## 7. Intro Timeline

`T = 0` is `_glMain.contentsStart()` — the first frame after the last critical asset lands. All values **OBSERVED**.

```
T = −∞ … 0     RED SCREEN
               Flat #e50012, z-index 99999. 412 px SVG wordmark, 40 px ring
               spinning on a 0.6 s CSS keyframe. No canvas exists. No progress
               indicator. Duration = asset load time; no floor, no ceiling.

T = 0.00       ⟨contentsStart⟩ — everything below is kicked off in ONE tick
               ├ WebGLRenderer's first frame renders: a screen-filling red
               │   sphere (scale 4.594, rotation 30°) at exact viewport centre
               ├ GL_ON_LOAD dispatched → Vue isReady = true, Lenis enabled
               ├ ring       opacity 1→0            0.6 s  power1.out
               ├ ball       scale 4.594→0.12       1.4 s  power3.inOut
               ├ ball       rotation.z 30°→0°      1.5 s  power3.inOut
               ├ display    strength 0.01→0.004    1.5 s  power3.inOut
               └ openingTimer 0→1                  0.8 s  (a scheduler, nothing visual)

T = 0.10       LOADER LOGO EXIT
               logo opacity 1→0 + scale 1→0.1      1.1 s  power3.inOut   [ends 1.20]

T = 0.20       RED SCREEN EXIT BEGINS
               bg opacity 1→0                      1.0 s  power3.out     [ends 1.20]

T ≈ 0.35       FIRST BACKGROUND REVEAL  (measured: red at 0.52)
               The nav, the pastel background field and the drifting satellite
               balls become visible through the half-dissolved red. The red
               sphere is now legible as a *sphere*, still nearly full-screen.

T ≈ 0.70       (measured: red at 0.063)  The curtain is effectively gone. The
               red body is at scale 2.36, visibly shrinking and unwinding, with
               the metaball wobble already on its silhouette.

T = 0.80       ⟨openingEnd → transitionNewPage(true) → viewStart⟩
               ├ 8 hero balls spawned AT SCREEN CENTRE at scale ≈ 0.1
               │   each: scale→_trgScale AND position→target
               │         1.3 s power3.inOut, delay = (id % 3) × 0.1
               │         → land at T = 2.10 / 2.20 / 2.30
               ├ <h1 class="gl-main-title"> built and appended to #contents
               └ transitionTimer2 0→1 over 0.2 s → pageMoveEnd() at T = 1.00

T = 1.20       Curtain fully removed from the layout (display: none on both
               .gl-loading-bg and #gl-loading).

T = 1.30       HEADLINE APPEARS — "BRAVIS" logo   opacity 0→1  0.7 s power3.inOut
T = 1.45         copy 1 "THE TOTAL"               0.7 s
T = 1.60         copy 2 "BRANDING"                0.7 s
T = 1.75         copy 3 "COMPANY"                 0.7 s
T = 1.90         services "STRATEGY/CREATIVE/&DIGITAL"  0.7 s   [ends 2.60]

T = 1.40       Transition ball reaches scale 0.12 …
T = 1.40–1.70  … then 0.12→0.01 over 0.3 s, then group.visible = false.
               The red seed is extinguished only AFTER the hero balls are
               already halfway out of it.

T = 1.50       (measured) Hero chain visibly spread; merged multi-coloured
               metaball mass; ball rotation fully unwound; strength at 0.004.

T = 2.10–2.30  BALLS LAND (staggered). On the last one:
               ├ viewStartNext() on all 8 — sub-balls + bg words fade in
               ├ topLine   material opacity → 0.16   1.0 s  power3.out
               ├ joint     shader alpha    → 1       0.3 s
               └ enterFrame: startFrame → topFrame   ← AUTONOMOUS FROM HERE

T = 2.60       HERO FULLY ESTABLISHED — last copy line at full opacity.
```

**NAVIGATION APPEARS: not a step.** It is present from T = 0 and simply stops being covered.

### Overlap map — nothing is ever sequential

```
 0.0   0.5   1.0   1.5   2.0   2.5   3.0
  │     │     │     │     │     │     │
  ████████ ring
  ░████████████ logo
    ░░████████████ red bg
  ██████████████████████ ball collapse (+0.3 s snuff to 1.7)
  ████████████████████ rotation unwind
  ████████████████████ global distortion settle
                ████████████████████████ 8 hero balls fly out (staggered)
                        ██████████ headline (5 × 0.7 s, 0.15 stagger)
                                      ████████████ connectors + joints
                                            ▶ autonomous
```

**At no point is exactly one thing happening.** Every element's entrance starts while at least two others are mid-flight. This is the single most copyable property of the sequence.

---

## 8. Technical Implementation

### The mechanism, end to end

| Layer | Technology | Role in the intro |
|---|---|---|
| Curtain | **Plain DOM div + GSAP opacity tweens** | Dissolves. That is all it does. |
| Spinner | **CSS `@keyframes` (`0.6s linear infinite`)** | Runs without rAF — so it keeps spinning even before the render loop exists. |
| Seed ball | **Three.js: 3 textured planes in one group, `MeshBasicMaterial`** | Fills the screen in the curtain's colour, collapses to a point at centre. |
| Field | **Metaball threshold (`α × 80 − 10`) + 31-tap separable Gaussian** | Merges the seed and the hero balls into one continuous liquid. |
| Settle | **One `strength` uniform in the display fragment shader** | Global refraction eased 0.01 → 0.004 over the whole reveal. |
| Scheduling | **GSAP tween `onComplete` chains** — no timeline object | `openingTimer` (0.8 s) and `transitionTimer2` (0.2 s) are pure schedulers with no visual target. |
| Framework hook | **`window.dispatchEvent(new Event("GL_ON_LOAD"))`** | The Vue/Nuxt app learns the engine is up; it flips `isReady` and enables Lenis. Nothing visual. |
| Loading | **Custom 4-way concurrent loader over textures + shader source files** | The one true gate. |

### What is conspicuously absent

- **No `clip-path`.** Zero declarations in the served CSS. **OBSERVED.**
- **No mask, no `backdrop-filter`, no `mix-blend-mode`.** **OBSERVED.**
- **No GSAP timeline object** for the intro — every tween is independent, coordinated only by shared start time and `delay`. **OBSERVED.**
- **No route transition.** `#gl-world` sits outside `#contents`, so nothing unmounts. **OBSERVED.**
- **No CSS transitions** doing any of the work.
- **No anime.js.** Two copies of GSAP are on the page; that is the only tween engine.
- **No `IntersectionObserver`, no `ScrollTrigger`.** **OBSERVED** (also in the companion doc).
- **No reduced-motion path of any kind.** **OBSERVED.** The intro plays identically for everyone.

### Why it feels so smooth — the actual reasons

1. **The curtain never moves. It only dissolves.** There is no edge, no wipe direction, no shape to track. The eye has nothing to follow, so it cannot catch the seam.

2. **What is behind it is the same colour.** The first WebGL frame is a screen-filling sphere in the same red family as `#e50012`. At the crossfade midpoint the two layers are nearly indistinguishable. **This is the entire illusion**: the curtain doesn't hand off to a page, it hands off to *itself, rendered as an object*.

3. **Motion is introduced under cover of the fade.** The ball begins shrinking and unwinding its 30° rotation at T = 0, while the red is still at ~100 %. By the time you can see it at all (T ≈ 0.35) it is already 2/3 of the way through the eased part of its curve. **You never see the motion start** — you catch it mid-flight, which the brain reads as continuity rather than as an event.

4. **Everything is one liquid.** The seed and the eight hero balls go through the same threshold and blur. The handoff is a *merge*, not a swap — there is no frame where object A stops and object B starts.

5. **One origin point.** The seed collapses at the exact pixel from which the hero balls emerge. The sequence reads as cause and effect: the red screen becomes a drop, the drop bursts into the composition. A cut would read as two unrelated animations.

6. **Deliberate overlap, everywhere.** See the overlap map in §7. No element waits for another to finish. There is no dead frame in which the page looks "between states".

7. **`power3.inOut` on every structural move.** Slow start, slow finish. Combined with (3), the fast middle of the curve is spent behind the curtain and the *visible* portion is almost entirely deceleration.

8. **The chrome doesn't participate.** The nav is static and already there. Nothing signals "still loading" once the red is gone.

9. **A slow global settle nothing else is doing.** The display `strength` easing 0.01 → 0.004 over 1.5 s gives the whole composite a subtle, unified relaxation that outlasts every individual element's entrance and is not consciously perceptible. It is the visual equivalent of a reverb tail.

10. **Nothing overshoots.** No `back`, no `elastic`, no bounce anywhere in the intro. Everything approaches its resting state from one side and stops.

---

## 9. Observed vs Inferred

### OBSERVED (source-level or frame-at-known-time)

- The complete `contentsStart` / `loadEnd` / `openingEnd` / `viewStart` / `viewStartAnimCheck` call chain, verbatim.
- Every tween in the intro: target, from-value, to-value, duration, delay, ease (all eases matched a named GSAP ease with error 0.0000).
- The transition ball's construction: 3 planes, 400/400/200 units, two red-pink gradient textures, `MeshBasicMaterial`, per-frame counter-rotation rates, `z = 11`, the `+114` vertex offset that makes mesh 3 orbit.
- `scale = 6 × max(screen.width, screen.height) / 1920` — note it reads `window.screen`, not the viewport.
- Hero balls spawn at viewport centre at scale ≈ 0.1 with a `(id % 3) × 0.1` stagger.
- The headline is five `<img>` nodes, built in JS at T = 0.8, opacity-only, 0.7 s each, 0.15 s stagger.
- The nav has no entrance animation and is visible at T ≈ 0.35.
- The canvas does not exist during loading.
- There is no minimum or maximum preloader duration and no progress readout.
- No clip-path / mask / blend-mode / route transition / reduced-motion path.
- 82 critical resources, ~1.81 MB decoded, `_pipeline = 4`.

### INFERRED

- **Typical red-screen duration ≈ 1.5–3 s warm, 5 s+ cold mobile.** My 7.9 s measurement was taken in a backgrounded tab and is an upper bound.
- **The 30° initial rotation exists to guarantee visible motion.** A radially symmetric sphere shrinking is nearly motionless to the eye; the unwinding rotation is what makes it read as a *body* rather than a zoom. The two textures counter-rotating support the same goal.
- **`_openingTimer`'s 0.8 s is a tuned hand-off point, not a physical constraint.** It is a bare scheduler; 0.8 s is where the seed has shrunk enough (scale ≈ 0.85) to look like an origin rather than a background.
- **`transition_bg` / `transition_front` were authored to sit between the brand red and the hero palette** — they are redder than the hero blobs and lighter than `#e50012`, i.e. a deliberate colour bridge.
- **The `strength` 0.01 starting value is chosen so the first frame is *slightly* wrong** and resolves — a "coming into focus" cue.

### UNKNOWN

- The exact `_trgScale` / `_trgX` / `_trgY` per ball at each breakpoint (readable, but not needed for this study).
- Whether `_frontBall` has its own `viewStart` entrance or is a no-op on first load (`glTopMainBall.viewStart` calls it, but I did not isolate the implementation).
- Whether the mobile intro differs beyond the `window.screen`-derived seed scale.
- Real-world preloader duration distribution across devices/connections.

---

## 10. Crovion Equivalent Architecture

### What we have today, and what is wrong with it

| File | Current behaviour | Problem |
|---|---|---|
| `components/LoadingScreen.tsx` | Anime.js timeline: letters in, spring progress bar, **fake 0→100 % counter**, exit at a hard-coded `setTimeout(…, 2800)`, then a framer-motion `opacity → 0, scale → 1.02` over 0.6 s. Calls `releaseBirth()` 500 ms into the fade. | The 2800 ms is **synthetic** — it is not tied to whether anything is actually ready. The percentage is a lie (it animates a dummy object). The curtain `scale: 1.02` **moves**, which is exactly the thing Bravis never does. |
| `components/Hero.tsx` | `setTimeout(…, 2800)` starts the anime.js copy timeline; `CTA_REVEAL_AT = 3600` polls with rAF for the drei `Html` node. | A second, independent hard-coded clock that must stay in sync with the first by hand. |
| `components/Navbar.tsx` | framer-motion `transition: { duration: 0.8, delay: 3 }` | A **third** magic number, and it animates the chrome — the opposite of the Bravis decision. |
| `webgl/config/birth.ts` | `holdBirth` / `releaseBirth` gate a module-level birth clock; blobs grow **in place** from a sub-isoline seed. | The mechanism is excellent and should be kept. What is missing is **travel**: Bravis's balls do not grow in place, they grow *while flying out of a single point*. |

**Three hard-coded clocks (2800 / 2800 / 3000) that must agree, none of which knows whether the page is ready.** That is the actual thing to fix, and it is also the thing that makes the current intro feel like three animations rather than one.

### Proposed architecture — an Intro Director

One module owns one clock and one phase machine. Everything else subscribes.

```
lib/intro/director.ts  (new, framework-free — no React, no Three)

  Phases:  LOADING → EXIT → REVEAL → SETTLED

  readiness gate (all must be true to leave LOADING):
    • document.fonts.ready resolved
    • fluid pipeline reports first-frame-rendered
    • SilkAuroraBackground reports first-frame-rendered
    • minimum dwell elapsed  (≈ 700 ms — never let the curtain flash)
  escape hatch:
    • maximum wait (≈ 6000 ms) — a slow device still gets in, degraded

  On READY:  t0 = now, phase = EXIT, and every consumer schedules off ONE clock.
```

Bravis has no minimum and no maximum because it is a single hand-written engine that controls its own boot. We are a React app with fonts, two canvases, hydration and Lenis, so we need both bounds. **This is a deliberate divergence, not a copy.**

### The Crovion seed — our transition ball

The single most important thing to port, and it must be built **inside the existing fluid field**, not as a separate mesh:

- **One extra blob** contributed to `webgl/passes/BlobPass.ts`, flagged `intro`, not a new render target and not a new pass.
- Starts at **screen-filling radius**, positioned at the exact centre of the hero canvas.
- Carries the **loading curtain's own colour** so the crossfade has nothing to reveal — the Crovion curtain is `#F5F3F2` with a `rgba(109,74,255,0.18)` radial, so the seed should be that violet-tinted off-white, brightening toward the hero palette as it collapses. (Bravis's advantage is a saturated brand red; ours is a pale ground, so the colour match matters *more*, not less — a pale curtain over a saturated blob would show the seam instantly.)
- Given a **small initial rotation** (Bravis uses 30°) so the collapse reads as a body turning, not a zoom.
- Collapses to a point over ~1.4 s, then is snuffed over ~0.3 s **after** the hero chain has already emerged.

Because it goes through the same threshold and blur as the chain, the merge is free — the same reason Bravis's works.

### Birth from a point, not in place

`resolveBirth()` currently returns `{ shape, scale, density }`. Add a fourth, intro-only channel:

- **`travel`** — 0 at spawn, 1 at rest — used by `FluidScene` to `lerp` each blob's position from the seed's collapse point to its composition position.
- Reuse the existing `birthOrder` for the stagger, but tighten it toward Bravis's 3-phase feel: the chain should read as *one burst*, not a countable sequence. The existing `stagger: 0.16` comment already argues for exactly this.
- Keep the existing growth/density curve unchanged — it solves a different problem (crossing the isoline convincingly) and solves it well.

### Nav and chrome

**Remove the Navbar entrance entirely.** It sits under the curtain at full opacity and is revealed by the curtain's own fade. This is the cheapest single improvement in the whole plan.

### Curtain exit

Match the structure, not the numbers-as-dogma:

- **Background: opacity only.** Drop the `scale: 1.02`. A curtain that moves is a curtain you can see leaving.
- **Wordmark: opacity + scale → 0.1**, starting slightly *before* the background. Bravis shrinks the logo as it fades, which reads as the logo being pulled into the collapsing seed.
- **Progress meter: fastest out, no delay.**

On the fake percentage: with a real readiness gate we could show real progress — but the honest option is Bravis's, which is to show **no number at all**. A number that finishes and then waits is worse than no number.

---

## 11. Recommended Animation Sequence

`T = 0` is the Intro Director's `READY`. Values are starting points calibrated from §7, adjusted for our pale ground and our slower, larger blobs.

```
LOADING        Curtain #F5F3F2 + violet radial. CROVION letters, meter.
               Fluid field held at t = 0 by holdBirth(). Nav present beneath.
               Duration = real readiness, floor 700 ms, ceiling 6000 ms.

T = 0.00   EXIT
           ├ meter        opacity 1→0              0.55 s  easeOutQuad
           ├ seed blob    live at screen-filling radius, rotated ~25–30°
           ├ seed blob    radius → point           1.40 s  easeInOutCubic
           ├ seed blob    rotation → 0             1.50 s  easeInOutCubic
           ├ composite    distortion elevated→rest 1.50 s  easeInOutCubic
           └ intro timer  0→1                      0.80 s  (scheduler only)

T = 0.10   ├ wordmark     opacity 1→0, scale 1→0.1 1.10 s  easeInOutCubic
T = 0.20   └ curtain bg   opacity 1→0              1.00 s  easeOutCubic   [gone 1.20]

T ≈ 0.35   FIRST BACKGROUND REVEAL — nav, aurora field and satellites read
           through the half-dissolved curtain; the seed is already turning.

T = 0.80   REVEAL  ⟨releaseBirth() fires HERE, not 500 ms into the fade⟩
           ├ blob chain born AT the seed's collapse point
           │   travel 0→1 and existing birth growth, ~1.30 s easeInOutCubic
           │   stagger ~0.10 s in 3 phases (one burst, not a countable queue)
           └ headline timeline scheduled off the same clock

T = 1.30   ├ CROVION brand letters   opacity (+ small translateY)  0.70 s
T = 1.45   ├ "THE TOTAL"                                           0.70 s
T = 1.60   ├ "BRANDING"                                            0.70 s
T = 1.75   ├ "COMPANY"                                             0.70 s
T = 1.90   └ Strategy / Creative / &Digital                        0.70 s   [ends 2.60]

T = 1.40   Seed reaches its floor radius …
T = 1.40–1.70  … then snuffs out. It must still be visible while the chain
           emerges — extinguishing it early is what turns a birth into a cut.

T = 2.10–2.30  CHAIN LANDS (staggered) → on the last one:
           ├ connectors / beads fade in            ~0.80 s
           ├ CTA button reveal                     (replaces CTA_REVEAL_AT poll)
           └ phase = SETTLED — autonomous morph + pointer field take over

T = 2.60   HERO FULLY ESTABLISHED.
```

### Non-negotiables carried over from the study

1. **The curtain fades. It does not move, clip, slide or scale.**
2. **The seed is the curtain's colour** at the moment the crossfade begins.
3. **The seed's motion starts while the curtain is still opaque** — the viewer catches it mid-flight.
4. **The chain is born from the seed's collapse point**, not in place.
5. **The seed outlives the chain's birth** by ~0.6 s.
6. **The nav does not animate.**
7. **Everything overlaps.** If a gap appears in the overlap map, close it.
8. **No overshoot anywhere** — no spring, no back, no elastic in the intro. (Note: the current CTA reveal uses `spring({ stiffness: 180, damping: 16 })`. That is a deliberate divergence if kept — decide consciously, since it is the one element that would bounce.)

### Where we should NOT copy Bravis

- **Baked-texture typography.** Their headline is `.webp` images with no accessible text. Ours is real DOM text and must stay that way.
- **No reduced-motion path.** Theirs is genuinely inaccessible. See §14.
- **No load ceiling.** A React app with fonts and two canvases needs one.
- **Zero `<h1>` semantics on the homepage.** Ours already has a proper `<h1>`; keep it.

---

## 12. Exact Files To Modify Later

**Nothing in this section has been touched. This is a plan.**

### New

| Path | Purpose |
|---|---|
| `lib/intro/director.ts` | The single clock + `LOADING → EXIT → REVEAL → SETTLED` phase machine, readiness gate (fonts, both canvases, min dwell, max wait), and a tiny subscribe API. Framework-free. |
| `hooks/useIntroPhase.ts` | React binding — subscribe to phase and to `t` without re-rendering per frame. |
| `webgl/config/intro.ts` | Intro-only tunables (seed radius multiplier, initial rotation, collapse/snuff durations, distortion ramp), same live-tunable contract as `FLUID_PARAMS` / `BIRTH_PARAMS`. |

### Modified

| Path | Change |
|---|---|
| `components/LoadingScreen.tsx` | Replace the synthetic 2800 ms timeline with the director's readiness gate. Drop `scale: 1.02` from the exit. Restructure the exit into the three-tween form (meter / wordmark / background). Stop owning `releaseBirth` scheduling — the director does it at `REVEAL`. Decide the fate of the fake `%` counter. |
| `components/Hero.tsx` | Delete `setTimeout(…, 2800)` and `CTA_REVEAL_AT = 3600`. Schedule the copy timeline off the director's `REVEAL` phase at the §11 offsets. Keep the existing `reducedMotion` branch that lands targets in final state. |
| `components/Navbar.tsx` | Remove the framer-motion `initial/animate/transition` with `delay: 3`. The nav renders at full opacity under the curtain. |
| `components/HeroCanvas.tsx` | Move the CTA reveal from the rAF `performance.now()` poll onto the director. Report first-frame-rendered to the director. |
| `webgl/config/birth.ts` | Add the `travel` channel to `BirthState` and `resolveBirth`. Keep `holdBirth` / `releaseBirth`, `birthClock`, and the growth/density curve exactly as they are. Possibly retune `stagger` toward a 3-phase burst. |
| `webgl/FluidScene.tsx` | Apply `travel` — lerp each blob's position from the seed's collapse point to its resting position. Feed the intro clock alongside `advanceBirth(delta)` in the existing single `useFrame`. **Do not add a second frame loop.** |
| `webgl/passes/BlobPass.ts` | Accept the seed as one additional field contributor with its own radius/colour/rotation, driven by the intro clock. No new render target, no new pass. |
| `webgl/passes/CompositePass.ts` + `webgl/shaders/composite.frag.ts` | Expose (or ramp, if it already exists) a global distortion strength uniform so the whole composite can settle across 1.5 s — the `_display.strength` equivalent. |
| `webgl/FluidCanvas.tsx` | Report first-frame-rendered to the director. |
| `components/SilkAuroraBackground.tsx` | Report first-frame-rendered to the director. It is a separate canvas; if it paints after the curtain lifts, the background pops. |
| `app/page.tsx` | Mount the director; simplify or remove the `loaded` boolean once phases carry the state. |

### Explicitly NOT modified

`components/FluidBlob.tsx` · `components/PointerProvider.tsx` · `components/SphereInteraction.tsx` · `components/SatelliteField.tsx` · `webgl/pointer/*` · `webgl/passes/PointerTrailPass.ts` · `webgl/passes/BlurPass.ts` · scroll choreography (`hooks/useScrollProgress.ts`, `SCROLL_LIFT`, the sticky headline chain) · the veil · headline layering.

The intro must be **additive**: a seed contributor plus a position channel plus a clock. If the plan starts requiring changes to the pointer field or the scroll pin, the design is wrong.

---

## 13. Performance Considerations

1. **Shader compilation must finish behind the curtain.** Bravis gets this for free — its renderer is constructed *inside* the load gate, so the first frame ever drawn is the intro's first frame and every program is already linked. Ours must render at least one full pipeline frame while the curtain is up. That is precisely what the readiness gate's "first-frame-rendered" signal is for; without it the curtain will lift onto a compile stall.

2. **The first post-reveal frame is the most expensive one on the page** — it is the only frame with the curtain compositing, both canvases live, the seed at maximum screen coverage, and the headline nodes entering. Budget for it.

3. **A screen-filling blob is a full-screen fragment cost** through the threshold and blur passes. Bravis mitigates this by clamping DPR to 1 on desktop and running the blur at 0.6× / 0.9×. If the seed measurably costs frames at T = 0, consider dropping the blur scale for the duration of `EXIT` only and restoring it at `SETTLED`.

4. **One RAF loop.** `FluidScene` already has exactly one `useFrame` and `advanceBirth` is driven from it. The director must not add a second loop; it should be pumped from the same callback (or from a single shared rAF), not from `setInterval` or a per-component `requestAnimationFrame`.

5. **Background-tab deltas are already handled** — `advanceBirth` clamps to `1/20 s`. Give the intro clock the same clamp, or a tab restored mid-intro will skip the entire reveal in one step. (This is not hypothetical: it is exactly what I had to work around to study Bravis.)

6. **Do not append DOM mid-animation.** Bravis builds and appends the `<h1>` at T = 0.8, which forces a layout in the middle of eight concurrent tweens. Ours should keep the headline mounted at `opacity: 0` from first render and only animate opacity — cheaper and jank-free.

7. **Fonts.** `next/font` with `display: swap` means a swap can land *after* the curtain lifts and reflow the headline mid-reveal. Gating on `document.fonts.ready` in the readiness check removes that class of bug entirely.

8. **The max-wait escape hatch needs a defined degraded path** — if 6 s elapses without readiness, lift the curtain anyway and let the reveal run at whatever fidelity the device manages. Never hold the user hostage to a canvas that will not initialise.

9. **Two canvases.** `SilkAuroraBackground` and the fluid pipeline are independent WebGL contexts. Both must be painting before the curtain lifts, or one will pop in behind the other.

10. **Texture budget.** Bravis's curtain is buying time for 1.81 MB of textures over a 4-way pipeline. We are procedural and have almost no texture payload — which means **our curtain has far less real work to hide behind**, and the readiness gate will often satisfy in a few hundred ms. That is why the 700 ms minimum dwell exists: without it the curtain flashes, and a flash is worse than a wait.

---

## 14. Reduced Motion Strategy

Bravis has **no reduced-motion path at all** (**OBSERVED** — the media query appears nowhere, and the intro plays identically for everyone). A ~2.6 s sequence of a screen-filling body collapsing to a point and bursting outward is close to a worst case for vestibular sensitivity. **We do not copy this.**

We already have the plumbing: `hooks/usePrefersReducedMotion.ts`, `birthClock.reduced`, `bornState()`, and a `reducedMotion` branch in the Hero timeline that lands targets in their final state rather than skipping the animation (the right pattern — targets start at `opacity-0`, so "skip" would mean "invisible forever").

### Under `prefers-reduced-motion: reduce`

| Element | Full motion | Reduced |
|---|---|---|
| Readiness gate | min 700 ms / max 6000 ms | **unchanged** — correctness, not motion |
| Curtain background | opacity, 1.0 s, delay 0.2 | opacity, **0.30 s**, no delay |
| Wordmark | opacity + scale → 0.1, 1.1 s | opacity only, **0.25 s**, **no scale** |
| Meter | opacity, 0.55 s | opacity, 0.20 s |
| **Seed blob** | screen-filling → point, 1.4 s, rotating | **does not exist** — never instantiated |
| **Blob chain** | born from the collapse point, travelling, staggered | **`bornState()` at final position** — already fully formed when the curtain lifts (`birthClock.reduced` already does exactly this) |
| Global distortion | 1.5 s ramp | **at resting value from frame one** |
| Headline | 5 × 0.7 s, 0.15 s stagger, translateY | **one 0.25 s opacity fade, all five together, no translate** |
| Nav | (never animated) | unchanged |
| CTA | spring scale 0 → 1 | opacity only, 0.2 s, **no spring** |
| Autonomous morph | continuous | **the separate existing decision** — not this document's scope, but if it is reduced, `SETTLED` must land on the reduced steady state, not on the full one |

**Total reduced-motion intro: ~0.55 s, opacity only, zero translation, zero scale, zero rotation.**

The rule: reduced motion **removes movement, never information**. Every element that appears in the full sequence still appears — it just arrives by fading, in place, at once.

### Testing checklist for later

- `prefers-reduced-motion: reduce` toggled **before** load, and **during** the intro (the current `usePrefersReducedMotion` behaviour on a mid-flight change needs verifying).
- Max-wait path: throttle to a failing WebGL context and confirm the curtain still lifts at 6 s with a usable page.
- Backgrounded-tab restore mid-intro — confirm the clamp prevents a skipped reveal.
- Font swap landing after reveal — should be impossible once gated on `document.fonts.ready`.

---

## Appendix — Bravis intro constants, for reference only

Copy the *structure*, not these numbers. They are tuned to a saturated red curtain, a 400-unit textured plane and eight small balls; ours are a pale ground and a chain of large blobs.

```
curtain.ring        opacity 1→0          0.60 s  power1.out    delay 0.00
curtain.logo        opacity 1→0          1.10 s  power3.inOut  delay 0.10
                    scale   1→0.1
curtain.bg          opacity 1→0          1.00 s  power3.out    delay 0.20

seed.scale          6·max(sw,sh)/1920 → 0.12     1.40 s  power3.inOut  delay 0.00
                    → 0.01                        0.30 s  (default)     at 1.40
seed.rotation.z     30° → 0°                      1.50 s  power3.inOut  delay 0.00
display.strength    0.010 → 0.004                 1.50 s  power3.inOut  delay 0.00
openingTimer        0 → 1                         0.80 s  power1.out    (scheduler)
transitionTimer2    0 → 1                         0.20 s  (scheduler, from T=0.80)

hero ball ×8        scale 0.1 → trg               1.30 s  power3.inOut  delay (id%3)·0.1
                    position centre → trg         1.30 s  power3.inOut  delay (id%3)·0.1
headline ×5         opacity 0 → 1                 0.70 s  power3.inOut  delay 0.50 + n·0.15
                                                                        (from T = 0.80)
topLine             opacity 0 → 0.16              1.00 s  power3.out    (on chain landing)
joint.alpha         0 → 1                         0.30 s  (default)     (on chain landing)

seed mesh spin      +0.01 / −0.01 / +0.02 rad per normalised frame
```

---

**Status: research complete. No implementation code written. No existing file modified.**
