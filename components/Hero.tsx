"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useScroll } from "framer-motion";
import { animate, stagger, createTimeline } from "animejs";
import { PointerProvider } from "./PointerProvider";
import HeroCanvas from "./HeroCanvas";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useIntroPhase } from "@/hooks/useIntroPhase";
import { introAtLeast, startIntro } from "@/lib/intro/director";
import { useSceneTier } from "@/hooks/useSceneTier";
import { heroVh } from "@/lib/scene/tier";

/**
 * Everything the entrance timeline reveals, and starts hidden via `opacity-0`.
 *
 * `.hero-cta` is deliberately absent: it lives inside the R3F scene now, so it
 * mounts with the canvas rather than with this component. See `CTA_REVEAL_AT`.
 */
const HERO_REVEAL_TARGETS = [
  ".hero-brand-letter",
  ".hero-headline-line",
  ".hero-service-line",
  ".hero-diagonal-line",
];

/**
 * The copy timeline, as offsets in ms from the intro director's REVEAL.
 *
 * Five entrances, 700 ms each, 150 ms apart — the shape of the Bravis headline
 * reveal, mapped onto our five blocks. Against the director's own clock that
 * puts the first line at T = 1.30 s and the last at T = 1.90 s, finishing at
 * 2.60 s, which is exactly where the study measures theirs.
 *
 * These used to be offsets from a `setTimeout(…, 2800)` that had no relationship
 * to anything else on the page. They are now offsets from the same origin the
 * curtain, the seed and the chain are scheduled off, so "the headline arrives
 * half a second after the chain is born" is one fact rather than three numbers
 * that had to be kept in agreement by hand.
 */
const COPY_AT = {
  brand: 500,
  headline: 650,
  service: 1100,
  diagonal: 1200,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TEMPORARY DIAGNOSTIC — the headline-drift investigation. Delete with the
// `MinimalHeadline` component and the three `textMode` reads below. ⚠️
//
// Stripped out of production entirely by the `IS_DEV` guard: the toggle is never
// installed, `textMode` never leaves "NORMAL", and every branch below collapses
// to exactly what shipped before. Nothing here is reachable from a built bundle.
//
// `MINIMAL` is the load-bearing mode. The production headline's lines carry an
// inline `transform: translateY(0px)` left behind by the anime.js entrance, and
// an identity transform is still a transform — it creates a stacking context and
// can hand the text its own composited layer, which is a mechanism for the glyphs
// to be rasterised or snapped differently from the rest of the sticky container
// during scroll. The minimal headline has no transform, no animation, no anime
// classes and no motion library anywhere in its subtree, while keeping the exact
// wrapper chain so its box lands on the same pixel.
const IS_DEV = process.env.NODE_ENV === "development";

type TextMode = "NORMAL" | "TEXT_ONLY" | "MINIMAL";

/**
 * The diagnostic headline: same text, same typography, same centring chain,
 * none of the machinery.
 *
 * The sibling blocks are kept — plain, unanimated — because the whole text block
 * is vertically centred as one unit, so dropping them would move the h1 and
 * invalidate the comparison.
 */
function MinimalHeadline() {
  return (
    <div className="absolute inset-0 z-[3] flex items-center pointer-events-none">
      <div className="w-full px-8 md:px-14 lg:px-20">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-3 md:mb-4 flex gap-[0.15em]">
            {"PORTFOLIO".split("").map((letter, i) => (
              <span
                key={i}
                className="text-brand-accent text-xs md:text-sm font-semibold tracking-[0.35em] uppercase inline-block"
              >
                {letter}
              </span>
            ))}
          </div>

          <h1 className="font-serif text-brand-text font-normal leading-[0.88] tracking-[-0.03em] text-[clamp(52px,9.5vw,150px)] m-0 flex flex-col">
            <span className="block overflow-hidden pb-1">THE TOTAL</span>
            <span className="block overflow-hidden pb-1 pl-[0.3em] md:pl-[0.6em]">
              BRANDING
            </span>
            <span className="block overflow-hidden pb-1 pl-[0.15em] md:pl-[0.3em]">
              COMPANY
            </span>
          </h1>

          <div className="mt-8 md:mt-10 pl-[1em] md:pl-[2em]">
            <div className="flex flex-col items-center w-fit gap-[2px] text-brand-text/75 uppercase tracking-[0.35em] text-[10px] md:text-xs font-medium">
              <span className="block">Strategy</span>
              <span className="block">Creative</span>
              <span className="block">&amp;Digital</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const hasAnimated = useRef(false);
  const hasRevealedCta = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  // Which composition is on screen — and therefore how tall this section has to
  // be. See `lib/scene/tier.ts`: the height is not a choice, it is `SCROLL_LIFT`
  // divided by the scroll pace, and `SCROLL_LIFT` is four times the chain's stop
  // spacing. The wide tier resolves to exactly the 700vh that used to be written
  // here as a literal.
  const tier = useSceneTier();

  // One clock for the whole intro. This component used to own two of its own —
  // a `setTimeout(…, 2800)` for the copy and a `CTA_REVEAL_AT = 3600` rAF poll —
  // neither of which knew anything about the curtain they were waiting on.
  const phase = useIntroPhase();

  // Idempotent, and the page that owns the curtain calls it too. Here as well
  // because everything below is scheduled off the director, so a hero mounted on
  // a page that forgot to start it would sit at LOADING forever with its copy and
  // its sphere overlays permanently hidden. Whoever commits first wins; the second
  // call is a no-op.
  useLayoutEffect(() => {
    startIntro();
  }, []);

  /**
   * Have the spheres stopped moving?
   *
   * The watermarks, the numbered cards and the CTA are DOM, projected onto their
   * spheres by drei's `Html` — so they ride the `travel` channel with the bodies
   * they are pinned to, and during the flight all six of them are stacked on the
   * single point the chain is coming out of. Six overlapping display-serif
   * watermarks at the centre of the frame is not a subtle artefact.
   *
   * So they are held until the chain lands, which is also what the reference
   * does: Bravis fades its background words in from `viewStartNext()`, fired on
   * the last ball completing its own move, and threads its connector lines only
   * once every body has stopped. Type pinned to a moving target reads as noise.
   */
  const settled = introAtLeast(phase, "SETTLED");

  /**
   * Opacity only, and a plain CSS transition rather than a tween: this is one
   * property on two container elements, so there is nothing for an animation
   * library to coordinate. 800 ms matches the study's own figure for the
   * connectors coming in behind the landed chain.
   */
  const overlayReveal = {
    opacity: settled ? 1 : 0,
    transition: "opacity 800ms cubic-bezier(0.33, 1, 0.68, 1)",
  } as const;

  // ⚠️ TEMPORARY DIAGNOSTIC — see the block above. Delete with it. ⚠️
  // Dev-only, defaults to NORMAL, and the setter is only ever called from the
  // console, so this never re-renders on its own.
  const [textMode, setTextMode] = useState<TextMode>("NORMAL");
  useEffect(() => {
    if (!IS_DEV) return;
    const w = window as Window & { __textMode?: (m: TextMode) => string };
    w.__textMode = (m) => {
      setTextMode(m);
      return `TEXT DEBUG · ${m}`;
    };
    console.info(
      "[crovion] TEXT DEBUG ready — __textMode('NORMAL' | 'TEXT_ONLY' | 'MINIMAL')"
    );
    return () => {
      delete w.__textMode;
    };
  }, []);
  // `TEXT_ONLY` blanks the surround; `MINIMAL` swaps the headline itself.
  const hideSurround = textMode === "TEXT_ONLY";
  const minimalText = textMode === "MINIMAL";
  const surround = hideSurround ? ({ visibility: "hidden" } as const) : undefined;

  // ─── Where the sphere-anchored cards get mounted ───
  //
  // drei resolves an `Html`'s DOM parent as `portal?.current || events.connected
  // || gl.domElement.parentNode`, so without a portal every card lands inside the
  // canvas wrapper. That wrapper is a stacking context at z-1, which puts the
  // cards *under* the veil at z-2 no matter what `zIndexRange` they carry — their
  // z-99 is scoped to the wrapper and cannot escape it. The veil then dimmed the
  // moving field and the card copy by one and the same factor, and no alpha
  // separated the two: at 0.55/0.34 the 10px copy fell to 1.69:1.
  //
  // Handing drei a container mounted above the veil breaks that coupling, which
  // is the whole point — veil strength becomes a free variable again.
  //
  // This is state and not a plain ref on purpose. `target` is computed during
  // render and consumed by a layout effect keyed on it, and a ref mutation does
  // not re-render — so if the node were not attached by the time the R3F scene
  // first rendered, the cards would mount in the canvas wrapper and stay there.
  // A state node re-renders on attach, drei recomputes `target`, and its effect
  // moves the element. Null on the first pass is therefore fine and self-heals.
  // ─── Where the per-sphere watermarks get mounted ───
  //
  // A second drei portal, identical in mechanism to `labelLayer` below and
  // differing only in which side of the canvas it sits on. The cards mount
  // *above* the canvas so they stay crisp; these mount *below* it, at z-0, so
  // the blob paints over them and the type reads as lying behind the body — the
  // occlusion is the whole effect, and it is free: no mask, no clip, just
  // painting order.
  //
  // This extends the stack downward rather than reordering it. Everything that
  // was already agreed keeps its relationship:
  //   watermark (z-0) → WebGL (z-1) → veil (z-2) → cards (z-2) → headline (z-3)
  const [watermarkLayer, setWatermarkLayer] = useState<HTMLDivElement | null>(
    null
  );
  const watermarkPortal = useMemo(
    () =>
      watermarkLayer
        ? ({ current: watermarkLayer } as React.RefObject<HTMLElement>)
        : undefined,
    [watermarkLayer]
  );

  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);
  const labelPortal = useMemo(
    () =>
      labelLayer
        ? ({ current: labelLayer } as React.RefObject<HTMLElement>)
        : undefined,
    [labelLayer]
  );

  // Framer Motion scroll parallax
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // The hero text is deliberately *not* driven by scroll. It is part of the
  // composition rather than a passing document element: it holds its position
  // for the whole pinned range while the sphere chain travels up past it, which
  // is what makes the chain read as moving through a fixed frame rather than the
  // whole hero sliding as one plate.
  //
  // It used to carry a 64px settle drift across progress 0 → 0.8. That coupled
  // the type to the scroll, and with the chain also lifting it read as two
  // things sliding at different rates.
  //
  // `scrollYProgress` still drives `SCROLL_LIFT` in HeroCanvas, and that is
  // solved against the height here — four spheres, three reveal steps.
  //
  // ⚠️ 1400vh → 700vh is paired with 52 → 26 on the lift, because stops 04-06
  // were removed and the chain now ends at y = -19.5. Pace is
  // `SCROLL_LIFT / height` and it is the field's on-screen velocity: halving both
  // holds it at 0.037 world units per vh, so the three surviving reveals arrive
  // at the same progress fractions and at the same speed as before, on a page
  // 700vh shorter — which is what brings the footer up.
  //
  // The earlier asymmetric move is what set that pace and still stands behind it:
  // the height went 1000vh → 1400vh *without* the lift, taking velocity from
  // 0.052 to 0.037 — the same reveals, travelled 29 % slower.
  //
  // Velocity is what is being reduced because it is what induced motion scales
  // with. The headline is measured immobile in layout, in paint and in composited
  // output during active scroll — 958 frames of continuous motion, one unique
  // rect.top, glyph pixels identical — so the chain's speed is the only lever left
  // on the perception.
  //
  // `SCROLL_LIFT` itself cannot be lowered *further* to slow the field. The
  // deepest sphere now sits at y = -19.5 and reaches eye level at progress
  // 19.5 / lift, so anything below ~23 strands stop 03 outside the pinned range
  // and 26 lands it at 0.75 with headroom to spare. Lengthening the page is the
  // only way to slow the field without losing a reveal.

  // ── The copy entrance ──
  //
  // Scheduled off the intro director's REVEAL rather than off a `setTimeout` that
  // guessed when the curtain would be gone. See `COPY_AT`.
  useEffect(() => {
    if (hasAnimated.current) return;
    if (!introAtLeast(phase, "REVEAL")) return;
    hasAnimated.current = true;

    // The reveal targets all start at `opacity-0`, so reduced motion can't just
    // skip the timeline — it has to land them in their final state instead, or
    // the entire hero copy stays invisible.
    //
    // A short fade rather than an instant snap: 250 ms, all five blocks together,
    // no translate and no stagger. That is the study's §14 rule applied literally
    // — reduced motion removes movement, never information. Every element that
    // appears in the full sequence still appears; it just arrives by fading, in
    // place, at once.
    if (reducedMotion) {
      animate(HERO_REVEAL_TARGETS.join(", "), {
        opacity: 1,
        translateY: 0,
        scale: 1,
        scaleY: 1,
        duration: 250,
        ease: "outQuad",
      });
      return;
    }

    // No `defaults` block: anime v4 renamed `easing` to `ease` and ignores the
    // old key, so declaring it here only produced a type error while doing
    // nothing. Each step below sets its own ease — and note that they now use
    // `ease`, not `easing`: the old key was silently inert on every step here,
    // so what actually shipped was anime's default curve throughout.
    const tl = createTimeline();

    // Brand name. A tight stagger — the word has to arrive as a word, not as
    // seven letters being counted out.
    tl.add(
      ".hero-brand-letter",
      {
        translateY: [14, 0],
        opacity: [0, 1],
        duration: 700,
        ease: "inOutCubic",
      },
      stagger(22, { start: COPY_AT.brand })
    );

    // Headline. Three lines, 150 ms apart — the study's stagger exactly.
    //
    // The rise is 36 px, down from 100. Every structural move in this intro is
    // `power3.inOut` with no overshoot and a short throw, and a 100 px swoop on
    // display type at `clamp(52px, 9.5vw, 150px)` was by a wide margin the
    // largest travel anywhere in the sequence — it read as its own animation
    // rather than as part of one. Bravis's headline is opacity-only; 36 px keeps
    // a rise for the type to arrive on without making it the loudest thing in a
    // frame where a chain of blobs is supposed to be.
    tl.add(
      ".hero-headline-line",
      {
        translateY: [36, 0],
        opacity: [0, 1],
        duration: 700,
        ease: "inOutCubic",
      },
      stagger(150, { start: COPY_AT.headline })
    );

    // Service text
    tl.add(
      ".hero-service-line",
      {
        translateY: [12, 0],
        opacity: [0, 1],
        duration: 700,
        ease: "inOutCubic",
      },
      stagger(80, { start: COPY_AT.service })
    );

    // Diagonal line
    tl.add(
      ".hero-diagonal-line",
      {
        scaleY: [0, 1],
        opacity: [0, 0.15],
        duration: 900,
        ease: "outCubic",
      },
      COPY_AT.diagonal
    );
  }, [phase, reducedMotion]);

  // ─── CTA reveal ───
  // The button is anchored to the first sphere, which means it is rendered by
  // drei's `Html` and does not exist in the DOM until the canvas has mounted its
  // scene. anime resolves a selector at `add()` time, so leaving this in the
  // timeline above silently animated nothing and the button sat at `opacity-0`
  // forever. Wait for the node instead, then run the step it used to have.
  //
  // *When* it fires is no longer a number. It is SETTLED — the director's last
  // phase, which lands once the chain has finished travelling out of the seed and
  // come to rest. That ordering is deliberate and it is the only one available:
  // the button is pinned to the head of the chain, so revealing it while that
  // body is still flying across the screen would launch the CTA out of the seed
  // too. It waits for its anchor to stop.
  //
  // The rAF poll survives, narrowed to what it was always actually for — waiting
  // for a DOM node that R3F has not created yet. It no longer measures time.
  useEffect(() => {
    if (hasRevealedCta.current) return;
    if (!introAtLeast(phase, "SETTLED")) return;

    let raf = 0;

    const tick = () => {
      const el = document.querySelector<HTMLElement>(".hero-cta");
      if (!el) {
        raf = requestAnimationFrame(tick);
        return;
      }

      hasRevealedCta.current = true;
      animate(
        el,
        reducedMotion
          ? { opacity: [0, 1], duration: 200, ease: "outQuad" }
          : {
              // Was `spring({ stiffness: 180, damping: 16 })`, and the spring is
              // gone on purpose. Nothing else in this intro overshoots — no back,
              // no elastic, no bounce anywhere — and every body on screen
              // approaches its resting state from one side and stops. A single
              // element bouncing at the end of a sequence built on that rule does
              // not read as emphasis; it reads as belonging to a different page.
              scale: [0, 1],
              opacity: [0, 1],
              duration: 700,
              ease: "inOutCubic",
            }
      );
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reducedMotion]);

  return (
    <PointerProvider>
      <section
        ref={sectionRef}
        className="relative w-full"
        style={{ height: `${heroVh(tier)}vh` }}
      >
        {/* `h-svh`, not `h-screen`.

            `h-screen` is `100vh`, which on iOS Safari and Chrome Android is the
            viewport with the URL bar *retracted* — measured here as 844 against a
            visible 740, so the pinned child was 104 px (12 % of the frame) taller
            than what the reader could see and the composition sat centred in a box
            whose bottom eighth was under the browser chrome.

            `h-dvh` tracks the bar and removes the offset, but re-lays-out this
            element every time the bar animates, which on a scroll-pinned WebGL
            section is visible jank. `h-svh` is the *small* viewport — bar visible —
            so it is stable, never taller than what is on screen, and costs only a
            strip of unused space once the bar retracts.

            It also fixes the frustum, which is the part that matters to the scene:
            `innerHeight` 740 against 844 moves the aspect from 0.462 to 0.527 and
            the frame's half-width from 2.02 to 2.30 world units. The compact tier
            is solved against the *smaller* aspect for that reason — see the note
            on `COMPACT`. */}
        <div className="sticky top-0 h-svh w-full overflow-hidden">
          {/* 3D Canvas — Spheres layer */}
          <div className="absolute inset-0 z-[1]" style={surround}>
            <HeroCanvas
              scrollYProgress={scrollYProgress}
              labelPortal={labelPortal}
              watermarkPortal={watermarkPortal}
            />
          </div>

          {/* Sphere-anchored watermark layer.

              Sits at z-0, under the canvas at z-1, so every blob paints over the
              type behind it. Same `absolute inset-0` box as the canvas and the
              card layer, so drei's projection resolves identically in all three
              and the watermark tracks its sphere without any offset of its own.

              Ordered before the glow in the markup on purpose: the glow is also
              z-0, so painting order decides between them, and the watermark
              wants to be the deepest thing in the composition. */}
          <div
            ref={setWatermarkLayer}
            className="pointer-events-none absolute inset-0 z-[0]"
            aria-hidden="true"
            style={overlayReveal}
          />

          {/* ── Background headline — TEMPORARILY REMOVED ──
              Commented rather than deleted: `components/` is untracked, so a
              delete is not recoverable from git. Uncomment to restore, and change
              the two inner `*}` markers back into comment terminators — they are
              escaped only so they do not close this wrapper early.

              With this gone the page has no `h1` at all: the foreground headline
              above is still commented out, so nothing else supplies the heading.

              The original note follows, unchanged.
          ── The headline, as ground rather than figure ──

              Same words, same face, same place it always occupied — but painted
              at z-0, under the canvas, so every sphere passes in front of it.
              That is the whole change: it stopped being the top of the stack and
              became the bottom of it.

              Deliberately static in the strongest sense available. It carries no
              `hero-headline-line` class, so the anime entrance cannot resolve it;
              no `opacity-0`, so nothing has to animate it into view; no transform,
              no scroll binding, no portal. It is laid out once and never touched
              again, which is what makes it a fixed ground for the moving field to
              cross rather than a participant in the motion.

              Colour matches the per-sphere watermarks exactly (`brand-purple/20`,
              rendering ~#DACAED on this page) so the two read as one background
              system at two scales rather than as a faded headline sitting next to
              some watermarks.

              ⚠️ The two `invisible` blocks are load-bearing and are not leftovers.
              The text column is centred as a *unit*, so the headline's vertical
              position was always a function of the brand row above it and the
              service lines below. Rendering the h1 alone in the same flex centre
              drops it ~28px at this viewport. Reproducing the siblings at
              `visibility: hidden` keeps them in flow, which reproduces the exact
              original placement at every breakpoint with no magic number — and
              hidden content is not exposed to assistive tech, so they cost
              nothing but the space they are there to hold.

              The `h1` keeps its element and its text rather than becoming a
              decorative div: this is still the page's heading, and hiding it from
              the accessibility tree to make it decorative would leave the document
              with no heading at all. ──
          <div className="pointer-events-none absolute inset-0 z-[0] flex items-center">
            <div className="w-full px-8 md:px-14 lg:px-20">
              <div className="max-w-[1400px] mx-auto">
                {/* Layout spacer — holds the brand row's space. See note above. *}
                <div className="invisible mb-3 md:mb-4 flex gap-[0.15em]" aria-hidden="true">
                  {"PORTFOLIO".split("").map((letter, i) => (
                    <span
                      key={i}
                      className="text-xs md:text-sm font-semibold tracking-[0.35em] uppercase inline-block"
                    >
                      {letter}
                    </span>
                  ))}
                </div>

                <h1 className="font-serif text-brand-purple/20 font-normal leading-[0.88] tracking-[-0.03em] text-[clamp(52px,9.5vw,150px)] m-0 flex flex-col select-none">
                  <span className="block overflow-hidden pb-1">THE TOTAL</span>
                  <span className="block overflow-hidden pb-1 pl-[0.3em] md:pl-[0.6em]">
                    BRANDING
                  </span>
                  <span className="block overflow-hidden pb-1 pl-[0.15em] md:pl-[0.3em]">
                    COMPANY
                  </span>
                </h1>

                {/* Layout spacer — holds the service block's space. *}
                <div
                  className="invisible mt-8 md:mt-10 pl-[1em] md:pl-[2em]"
                  aria-hidden="true"
                >
                  <div className="flex flex-col items-center w-fit gap-[2px] uppercase tracking-[0.35em] text-[10px] md:text-xs font-medium">
                    <span className="block">Strategy</span>
                    <span className="block">Creative</span>
                    <span className="block">&amp;Digital</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ── end temporarily removed ── */}

          {/* Atmospheric purple glow overlays — bridges aurora into 3D scene */}
          <div
            className="pointer-events-none absolute inset-0 z-[0]"
            style={{
              ...surround,
              background: `
                radial-gradient(ellipse 60% 50% at 72% 34%, rgba(139,92,246,0.08), transparent 60%),
                radial-gradient(ellipse 50% 40% at 20% 72%, rgba(79,70,229,0.06), transparent 50%)
              `,
            }}
          />

          {/* Stationary type anchor.

              The headline is already pinned — measured immobile for the whole
              range — but it does not *read* that way, because the sphere chain
              lifts past it at roughly half of scroll speed across most of the
              frame. A large coherent field moving one way makes a static element
              inside it look like it is moving the other way, so the type appears
              to sink. Nothing is animating it; the surround is.

              This is the fix for the perception rather than the geometry, and it
              works on the two things induced motion actually depends on: how
              salient the moving surround is, and whether the eye has a static
              reference nearby. It is a soft luminance veil sitting between the
              canvas (z-1) and the type (z-3), so it mutes the spheres only where
              they pass directly behind the headline, and it is itself a fixed
              piece of structure the eye can lock onto.

              It lives inside the sticky child, so it is anchored to the viewport
              and takes no part in the scroll transform — the whole point. It is
              deliberately not a card: two overlapping ellipses with a long
              falloff to `transparent`, no border, no shadow, no backdrop-filter,
              so there is no edge anywhere for it to read as a panel.

              It paints before the diagonal line and the watermark so those stay
              on top of it rather than being washed out.

              The two alphas compound rather than add: the ellipses overlap at
              the centre, so what lands there is 1-(1-p)(1-s), not p. The first
              pass at 0.55/0.34 was therefore really 0.70 on screen, which is
              what flattened the sphere cards passing behind the type — at that
              strength the 10px card copy measured 1.69:1 against its sphere,
              well under the 4.5:1 it needs. 0.24/0.12 composites to 0.331 and
              measures ~4.64:1, so the cards stay legible while the field behind
              the headline loses a third of its contrast.

              ⚠️ 0.24/0.12 is the ceiling, not a midpoint. The alphas compound and
              card legibility falls ~8 points of contrast ratio per unit of
              composite alpha, so 0.26/0.13 composites to 0.356 and lands at
              ~4.44:1 — already under the 4.5:1 the 10px card copy needs. There is
              no headroom left in this knob.

              Raising the two alphas together is the one tuning knob — the
              geometry is already centred on the type block, and moving it
              decouples the veil from what it is anchoring. Note that it buys
              motion damping and costs card legibility at exactly the same rate:
              the cards are drei `Html`, so their z-99 is scoped inside the
              canvas wrapper's own stacking context at z-1 and can never rise
              above this layer. The veil dims them and the spheres by one and the
              same factor, and no alpha separates the two. */}
          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            aria-hidden="true"
            style={{
              ...surround,
              background: `
                radial-gradient(ellipse 52% 46% at 27% 45%, rgba(248,247,251,0.24), transparent 72%),
                radial-gradient(ellipse 34% 30% at 24% 44%, rgba(248,247,251,0.12), transparent 70%)
              `,
            }}
          />

          {/* Diagonal decorative line — purple tinted.

              `hidden md:block`, and hidden is the honest answer rather than a
              retreat. It is a 55 %-height hairline struck from `left: 48%` at
              −35°, and at a phone's width that geometry puts its far end 62 px
              past the right edge — measured. There is no mobile placement for it,
              because the frame has no spare margin for a bleed element: scaling it
              to fit keeps a compromised version of something whose whole purpose
              is to be incidental. */}
          <div
            className="hero-diagonal-line absolute z-[2] opacity-0 hidden md:block"
            style={{
              ...surround,
              left: "48%",
              top: "55%",
              width: "1px",
              height: "55%",
              background: "rgba(139,92,246,0.15)",
              transformOrigin: "top center",
              transform: "rotate(-35deg)",
            }}
          />

          {/* Text content layer — sits ON TOP of the spheres, and stays put. */}
          <div
            className="absolute inset-0 z-[3] flex items-center pointer-events-none"
            style={minimalText ? { visibility: "hidden" } : undefined}
          >
            <div className="w-full px-8 md:px-14 lg:px-20">
              <div className="max-w-[1400px] mx-auto">
                {/* ── Brand name — TEMPORARILY REMOVED ──
                    Commented rather than deleted; `components/` is untracked so a
                    delete would not be recoverable. Uncomment to restore, and change
                    the inner `*}` markers back into comment terminators — they are
                    escaped only so they do not close this wrapper early.

                {/* Brand name — PORTFOLIO in red spaced letters (like BRAVIS) *}}
                <div className="mb-3 md:mb-4 flex gap-[0.15em]">
                  {"PORTFOLIO".split("").map((letter, i) => (
                    <span
                      key={i}
                      className="hero-brand-letter text-brand-accent text-xs md:text-sm font-semibold tracking-[0.35em] uppercase opacity-0 inline-block"
                    >
                      {letter}
                    </span>
                  ))}
                </div>
                ── end temporarily removed ── */}

                {/* ── Main headline — TEMPORARILY REMOVED ──
                    Commented rather than deleted: `components/` is untracked, so
                    a delete is not recoverable from git. Uncomment this block to
                    restore; nothing else has to change with it.

                    The brand letters above and the service lines below are left
                    in place, so with this gone the remaining copy re-centres in
                    the flex column — the block is centred as a unit, and the h1
                    was most of its height.

                    The entrance timeline still carries a `.hero-headline-line`
                    step. anime resolves selectors at `add()` time and animates
                    nothing when a selector matches nothing, which is the same
                    tolerated no-op documented at `.hero-cta`, so the step is
                    harmless and is left alone for the restore.

                {/* Main headline — Bravis-style massive serif stacked *}
                <h1 className="font-serif text-brand-text font-normal leading-[0.88] tracking-[-0.03em] text-[clamp(52px,9.5vw,150px)] m-0 flex flex-col">
                  <span className="hero-headline-line block overflow-hidden pb-1 opacity-0">
                    THE TOTAL
                  </span>
                  <span className="hero-headline-line block overflow-hidden pb-1 pl-[0.3em] md:pl-[0.6em] opacity-0">
                    BRANDING
                  </span>
                  <span className="hero-headline-line block overflow-hidden pb-1 pl-[0.15em] md:pl-[0.3em] opacity-0">
                    COMPANY
                  </span>
                </h1>
                ── end temporarily removed ── */}

                {/* ── Service text — TEMPORARILY REMOVED ──
                    Commented rather than deleted; `components/` is untracked so a
                    delete would not be recoverable. Uncomment to restore, and change
                    the inner `*}` markers back into comment terminators — they are
                    escaped only so they do not close this wrapper early.

                {/* Service text — stacked, with indent like Bravis *}}
                <div className="mt-8 md:mt-10 pl-[1em] md:pl-[2em]">
                  <div className="flex flex-col items-center w-fit gap-[2px] text-brand-text/75 uppercase tracking-[0.35em] text-[10px] md:text-xs font-medium">
                    <span className="hero-service-line opacity-0 block">
                      Strategy
                    </span>
                    <span className="hero-service-line opacity-0 block">
                      Creative
                    </span>
                    <span className="hero-service-line opacity-0 block">
                      &amp;Digital
                    </span>
                  </div>
                </div>
                ── end temporarily removed ── */}
              </div>
            </div>
          </div>

          {/* The CTA is no longer positioned here. It is anchored to the first
              sphere inside `HeroCanvas`, so it travels with the body it sits on
              instead of holding a fixed screen slot the sphere scrolls out of. */}

          {/* Background faded text on the extreme left */}
          {/* Watermark. The alphas here are multiplied by the container's, and on
              a near-white ground the old 10% left it at roughly 1% — invisible
              rather than subtle. */}
          {/* `hidden md:block` for the same reason as the diagonal line above: at
              130 px this block measures 244 px and starts 8 px off the left edge,
              so on a phone it reads as debris rather than as a bleed. The
              sphere-anchored watermarks in `HeroCanvas` carry the same device at a
              size the compact tier does solve for, so nothing is lost by dropping
              the standing one. */}
          <div
            className="absolute z-[2] left-[-2%] bottom-[2%] pointer-events-none opacity-25 select-none hidden md:block"
            style={surround}
          >
             <div className="text-[12px] tracking-[0.2em] text-brand-purple/20 font-semibold ml-2 mb-[-5px]">PROJECTS</div>
             <div className="font-serif text-[130px] leading-[0.8] text-brand-purple/10">COR</div>
             <div className="font-serif text-[130px] leading-[0.8] text-brand-purple/10">BRA</div>
          </div>

          {/* Sphere-anchored card layer.

              drei mounts each `Html` here instead of inside the canvas wrapper.
              Left in the wrapper they sat at z-1 and the veil at z-2 dimmed the
              card copy and the moving field by the same factor — no alpha
              separated the two, because a card's `zIndexRange` is scoped inside
              that wrapper and cannot escape it.

              Ordering is done with DOM position, not with a bigger number. This
              box shares z-2 with the veil, the diagonal line and the watermark,
              so among those four it is painting order that decides, and it is
              last — above the veil, so the cards keep their own contrast at any
              veil strength. The type at z-3 still wins outright, which is what
              keeps the headline the top-level anchor when a card crosses it.

              That is why this sits after the watermark rather than just after
              the veil: the watermark is also z-2 and comes later in the markup,
              so a container placed higher up would paint *under* it. Moving this
              block, or giving it a z of its own, is what breaks the order.

              Placement is unaffected by any of this. drei writes `translate3d`
              in canvas pixel space measured from the top left of the renderer,
              and this box is `absolute inset-0` in the same sticky parent as the
              canvas — the two rects are coincident, so the projection resolves
              identically. Sizing or offsetting this container is what would
              shift every card.

              `pointer-events-none` so the empty area stays transparent to the
              cursor and the pointer system keeps reading the sphere field
              through it; each card re-enables `pointer-events-auto` on itself,
              exactly as it did when it lived in the canvas wrapper.

              The sticky parent is itself a stacking context, so none of these
              locals can climb over the fixed navbar at z-50 — the behaviour the
              cards' `zIndexRange` cap was protecting. */}
          <div
            ref={setLabelLayer}
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{ ...surround, ...overlayReveal }}
          />

          {/* ⚠️ TEMPORARY DIAGNOSTIC — delete with the block at the top. ⚠️ */}
          {IS_DEV && minimalText ? <MinimalHeadline /> : null}
        </div>
      </section>
    </PointerProvider>
  );
}
