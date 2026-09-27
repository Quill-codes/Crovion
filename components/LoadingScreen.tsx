"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { holdBirth, releaseBirth } from "@/webgl/config/birth";
import { introAtLeast, introClock } from "@/lib/intro/director";
import { useIntroPhase } from "@/hooks/useIntroPhase";

/**
 * The curtain.
 *
 * ### What changed, and why it is the whole point
 *
 * This used to run a 2800 ms timeline with a **synthetic** progress counter — a
 * dummy object tweened 0 → 100 that was never connected to anything loading —
 * and exit on a hard-coded `setTimeout`. Two other components carried their own
 * copies of that number. The curtain therefore had no idea whether the page
 * behind it was ready, and the sequence read as three animations rather than one
 * because it was three animations.
 *
 * Now the curtain answers to `lib/intro/director.ts`: it lifts when fonts have
 * resolved and both WebGL contexts have painted a frame, with a floor so it
 * cannot flash and a ceiling so a failing device is never trapped behind it.
 *
 * ### The exit is three opacity tweens and nothing else
 *
 * Taken structurally from Bravis, whose entire curtain transition is
 * `gsap.to(el, { opacity: 0 })` three times over. No clip-path, no mask, no
 * blend mode, no shader, no route transition. The sophistication is in the
 * choreography and the colour match, not in the technique.
 *
 * The one thing the old version did that this deliberately does not: **move.**
 * The exit carried `scale: 1.02`, and a curtain that moves is a curtain you can
 * watch leaving. A curtain that only dissolves has no edge and no direction, so
 * the eye has nothing to track and cannot catch the seam.
 *
 * ### Why there is no percentage any more
 *
 * Because there was nothing honest to put in it. With a real readiness gate we
 * *could* show real progress — but the gate now routinely satisfies in a few
 * hundred milliseconds, so an honest counter would snap to 100 and then sit
 * there, and a number that finishes and then waits is worse than no number at
 * all. Bravis shows a bare spinner for exactly this reason: a spinner promises
 * nothing, so a long wait never reads as a *stalled* wait.
 */
export default function LoadingScreen() {
  const [visible, setVisible] = useState(true);
  const phase = useIntroPhase();

  const bgRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  const hasEntered = useRef(false);
  const hasExited = useRef(false);

  /**
   * The unmount timer, held in a ref and cleared only when this component really
   * goes away.
   *
   * It cannot live in the exit effect's cleanup. That effect depends on `phase`,
   * which changes twice more after the exit starts (EXIT → REVEAL → SETTLED) —
   * so React would tear the effect down and re-run it mid-fade, the cleanup would
   * cancel the timer, and the re-run would bail immediately on `hasExited`. The
   * curtain then stays mounted forever at `opacity: 0`, invisible, on top of
   * everything, eating every pointer event the hero was supposed to receive.
   */
  const unmountAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (unmountAt.current !== null) clearTimeout(unmountAt.current);
    },
    []
  );

  /**
   * The fluid field is mounted and running underneath this curtain from the
   * first frame, so its blobs would be born, formed and settled long before
   * anyone sees them — a birth animation nobody watches is not one.
   *
   * The hold is registered in a *layout* effect, which is the part that has to
   * be right: it must be in place before the canvas takes its first frame, and
   * this component commits ahead of the hero in the tree, so it is. Releasing
   * restarts the clock from zero rather than resuming it (see `releaseBirth`),
   * which also makes the double mount React StrictMode performs in development
   * harmless instead of a head start.
   */
  const holdsBirth = useRef(false);
  useLayoutEffect(() => {
    holdBirth();
    holdsBirth.current = true;
    return () => {
      if (!holdsBirth.current) return;
      holdsBirth.current = false;
      releaseBirth();
    };
  }, []);

  // ── The wordmark arrives ──
  //
  // Sized to finish inside the director's 700 ms floor rather than to a feel:
  // the curtain is allowed to leave the instant that floor elapses, and letters
  // still walking in while the thing they are written on starts dissolving is
  // the one way a loading state can look *unfinished* rather than brief.
  useEffect(() => {
    if (hasEntered.current) return;
    hasEntered.current = true;

    animate(".loading-letter", {
      translateY: [18, 0],
      opacity: [0, 1],
      duration: 420,
      ease: "outCubic",
      // 38 ms, restored when the wordmark went from nine letters to seven.
      // The constraint above is the one that sets this: the last letter starts
      // at (n - 1) x stagger and runs 420 ms. Nine letters at 38 ms landed at
      // 724 ms — past the 700 ms floor, i.e. still arriving while the curtain
      // they are written on had begun to dissolve — which is why this was cut
      // to 30. Seven letters land at 648 ms, so the original cadence fits again
      // with 52 ms to spare.
      delay: stagger(38),
    });
  }, []);

  // ── The curtain leaves ──
  //
  // Fires on the director reaching EXIT, and exactly once. Tested with
  // `introAtLeast` rather than `phase === "EXIT"` because under reduced motion
  // EXIT and REVEAL land in the same tick and an equality test would miss it.
  useEffect(() => {
    if (hasExited.current) return;
    if (!introAtLeast(phase, "EXIT")) return;
    hasExited.current = true;

    // The director's own sample, not a fresh `matchMedia` read. Two independent
    // reads of the same query is a way for the curtain and the schedule it is
    // timed against to disagree — the director samples once, at `startIntro`, and
    // everything downstream has to be answering to that one sample or the reduced
    // path can end up with a 1.1 s wordmark fade over a 0.55 s intro.
    if (introClock.reduced) {
      // Opacity only, all three together, over a third of a second. No scale on
      // the wordmark, no stagger, no delays. See the study's §14: reduced motion
      // removes movement, never information.
      if (meterRef.current)
        animate(meterRef.current, { opacity: [1, 0], duration: 200, ease: "outQuad" });
      if (wordmarkRef.current)
        animate(wordmarkRef.current, { opacity: [1, 0], duration: 250, ease: "outQuad" });
      if (bgRef.current)
        animate(bgRef.current, { opacity: [1, 0], duration: 300, ease: "outQuad" });

      unmountAt.current = setTimeout(() => setVisible(false), 360);
      return;
    }

    // The three tweens, in the order they start. Note that the *meter* goes
    // first and the *background* goes last — the curtain's own ground is the
    // last thing to leave, which is what keeps the dissolve reading as one
    // surface thinning rather than as a stack of elements being cleared.
    if (meterRef.current) {
      animate(meterRef.current, {
        opacity: [1, 0],
        duration: 550,
        ease: "outQuad",
      });
    }

    if (wordmarkRef.current) {
      // Shrinking as it fades, and starting *before* the ground it sits on.
      // Bravis pulls its logo down to a tenth of its size on the way out, which
      // reads as the wordmark being drawn into the collapsing seed rather than
      // simply being switched off — and the seed underneath is, at this exact
      // moment, doing precisely that.
      animate(wordmarkRef.current, {
        opacity: [1, 0],
        scale: [1, 0.1],
        duration: 1100,
        delay: 100,
        ease: "inOutCubic",
      });
    }

    if (bgRef.current) {
      animate(bgRef.current, {
        opacity: [1, 0],
        duration: 1000,
        delay: 200,
        ease: "outCubic",
      });
    }

    // Removed from the layout once the longest tween has landed (0.10 + 1.10).
    // Not earlier: the wordmark is still on screen at 1.0 s, dissolving into a
    // field that is already fully visible through it.
    unmountAt.current = setTimeout(() => setVisible(false), 1260);
  }, [phase]);

  // ── The field is released ──
  //
  // At REVEAL, which the director places 0.8 s after the curtain begins to
  // dissolve — the moment the intro seed has collapsed far enough to read as an
  // origin rather than as a background. This used to be a `setTimeout(…, 500)`
  // hung off the start of the fade, chosen by eye and unrelated to anything the
  // WebGL layer was doing.
  useEffect(() => {
    if (!introAtLeast(phase, "REVEAL")) return;
    if (!holdsBirth.current) return;
    holdsBirth.current = false;
    releaseBirth();
  }, [phase]);

  if (!visible) return null;

  return (
    <div
      // `pointer-events-none` is not decoration. This sits at z-100 over the
      // entire page and spends the last second of its life at an opacity the eye
      // cannot see but the hit-tester can — so for that second it would otherwise
      // be swallowing every hover, click and pointermove the hero's fluid field
      // exists to respond to.
      className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center"
      aria-hidden="true"
    >
      {/* The ground. The radial is nested inside it rather than beside it so the
          two are one surface and fade as one — as siblings they were two layers
          on separate opacity curves, and the wash would have outlived the ground
          it was tinting. */}
      <div ref={bgRef} className="absolute inset-0" style={{ background: "#F5F3F2" }}>
        {/* Subtle radial. Raised from 0.12 to 0.18: a wash this pale disappears
            into an off-white ground at the alpha that read on near-black.

            This is also the colour the intro seed underneath is matched to — see
            `INTRO_SEED_TINT`. The two have to agree, because at the midpoint of
            the crossfade they are the same picture. */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 60% 40%, rgba(109,74,255,0.18), transparent 50%)",
          }}
        />
      </div>

      {/* Wordmark */}
      <div
        ref={wordmarkRef}
        className="relative flex gap-[0.2em] text-2xl md:text-4xl font-semibold tracking-[0.35em] uppercase text-brand-text mb-10"
      >
        {"CROVION".split("").map((letter, i) => (
          <span key={i} className="loading-letter opacity-0">
            {letter}
          </span>
        ))}
      </div>

      {/* The meter.
          Indeterminate, and a CSS keyframe rather than a tween — which is not
          laziness but the same property Bravis's spinner has. A keyframe animates
          off the compositor and needs no `requestAnimationFrame`, so it keeps
          moving through the exact stretch this curtain exists to cover: shader
          compilation and first paint on two WebGL contexts, which is when the
          main thread is least able to service a JS-driven tween. A meter that
          stutters while the page is working reads as a page that has hung. */}
      <div ref={meterRef} className="relative w-40 md:w-56">
        <div className="h-[1px] w-full bg-brand-text/10 rounded-full overflow-hidden">
          <div className="loading-meter h-full w-1/3 rounded-full bg-brand-accent/70" />
        </div>
      </div>
    </div>
  );
}
