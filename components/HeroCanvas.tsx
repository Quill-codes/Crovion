import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Environment,
  Lightformer,
  Float,
  ContactShadows,
  PerspectiveCamera,
  Line,
  Html
} from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import FluidBlob from "./FluidBlob";
import CTAButton from "./CTAButton";
import { usePointer } from "./PointerProvider";
import SatelliteField from "./SatelliteField";
import { SphereInteractionDriver, SphereInteractionProvider } from "./SphereInteraction";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { frame } from "@/lib/frame";
import FluidCanvas from "@/webgl/FluidCanvas";
import { useLabelResolver } from "@/lib/content/store";
import IntroSeed from "@/webgl/IntroSeed";
import { useSceneTier } from "@/hooks/useSceneTier";
import { headY, scrollLift, stopY, type SceneTier } from "@/lib/scene/tier";
import { family, HEAD_TINT } from "@/lib/palette";

interface HeroCanvasProps {
  scrollYProgress?: MotionValue<number>;
  /**
   * Where the sphere-anchored `Html` cards mount, supplied by `Hero`.
   *
   * Undefined until the container attaches, and drei falls back to the canvas
   * wrapper for that first pass — see the note at the container in `Hero.tsx`
   * for why that is safe and why this is threaded rather than read from context.
   */
  labelPortal?: React.RefObject<HTMLElement>;
  /**
   * Where the per-sphere watermarks mount — a container *below* the canvas, so
   * the blobs paint over them. See the note at the container in `Hero.tsx`.
   */
  watermarkPortal?: React.RefObject<HTMLElement>;
}

/**
 * `SCROLL_LIFT` used to be a literal 26 here, with a note warning that changing
 * it, the chain's Y spacing, or the 700vh in `Hero.tsx` in isolation would strand
 * part of the chain off screen.
 *
 * All three are now one number. `lib/scene/tier.ts` authors the chain's surface
 * gap and its radii; the spacing, the lift and the hero's height are functions of
 * those, so the three cannot fall out of agreement by hand any more. The wide
 * tier still resolves to 6.5 / 26 / 700vh exactly.
 */

/**
 * The key the head sphere's satellite fan is filed under in `SATELLITES`.
 *
 * The numbered stops address their own fans by their card number — "01" … "03" —
 * and the head has no card and no number, so it takes the slot above the chain.
 * It is a key into the *same* table and the *same* `expanded` / `mounted` state
 * machine every other stop uses: opening the services fan closes whichever
 * numbered fan was out, exactly as opening 03 closes 02.
 */
const SERVICES_FAN = "00";

/**
 * Per-60 Hz-frame chase rate for the group's scroll follow.
 *
 * Authored at 60 Hz and raised to `frame.d` at the use site, so the resulting
 * time constant is the same on any refresh rate. See the note there.
 *
 * ⚠️ This is a *measured* value, not a feel knob, and it was 0.05 until the
 * hero's scroll response was instrumented. The headline is bound to native
 * scroll through `position: sticky` and therefore has zero latency; this group
 * is the only thing on the page the scroll reaches through a filter, so the gap
 * between the two is exactly this time constant. Recording the chain during an
 * active scroll caught the group still travelling 336 px *after* `scrollY`,
 * `animatedScroll` and `actualScroll` had all stopped at the same value — a
 * field moving with no input driving it, against type that had not moved a
 * sub-pixel.
 *
 * 0.10 halves the constant to ~158 ms (95 % settled in 475 ms, against 975 ms
 * at 0.05) while keeping a visible trail, so the chain still lags the scroll
 * rather than being bolted to it. Raising it further shortens the trail fast —
 * 0.15 is ~103 ms — and past roughly 0.15 the chain stops reading as a body with
 * mass and starts tracking the scrollbar.
 */
const SCROLL_CHASE = 0.10;

/**
 * The pale display type lying *behind* a numbered sphere.
 *
 * The reference's signature: a small letter-spaced "PROJECTS" over two lines of
 * very large, very light serif carrying that stop's own name, with the blob
 * sitting on top of it so only the part clearing the body is visible. The
 * occlusion is what sells it — the type reads as painted on a surface the sphere
 * rests on rather than as a label floating near it.
 *
 * Type treatment follows the standing watermark in `Hero.tsx` — 12px / 0.2em
 * over 130px serif / 0.8 leading, both in `brand-purple` — so the two read as one
 * device used twice rather than two similar ideas.
 *
 * ⚠️ The alpha is stated *once*, on the colour, and the wrapper carries no
 * `opacity` of its own. That differs from the standing watermark, which multiplies
 * a 25% wrapper by a 10% colour, and the difference is deliberate: two compounding
 * alphas are almost impossible to tune by eye, because the number you edit is
 * never the number you see. That stack came out at 0.25 x 0.10 = 0.025 effective,
 * which on this ground renders #F2EEF1 against a #F5F3F2 page — about one value
 * step, i.e. invisible.
 *
 * Rendered result of a given alpha over the page ground, for whoever tunes this
 * next (brand-purple #6D28D9 on #F5F3F2):
 *
 *     0.025 -> #F2EEF1   the old value: gone
 *     0.12  -> #E5DBEF   present but timid
 *     0.20  -> #DACAED   current: clearly legible display type, still a watermark
 *     0.35  -> #C5ACE9   starts competing with the cards
 *
 * `PROJECTS` carries nearly double the body alpha because it is 12px against
 * 130px: small type needs far more contrast to register at the same apparent
 * weight, and matching the two numerically makes the label vanish under the lines
 * it is supposed to introduce.
 *
 * Note this layer sits *below* the veil (z-2), so wherever the block passes behind
 * the headline it is further muted by the veil's 0.331 composite — roughly a third
 * off. That is desirable and is why the alpha here can be as high as it is without
 * crowding the type.
 *
 * `center` is deliberately off, so the anchor is the block's top-left and the
 * type flows right and down *into* the body rather than sitting centred under it.
 *
 * ⚠️ The horizontal offset flips with the sphere's side, which is a departure
 * from the reference and a forced one. There the blob sits near the middle of the
 * frame, so the watermark can always run off to its left and still be read. This
 * chain alternates hard — 01/03/05 at x ≈ -3, 02/04/06 at x ≈ +3.3 — and a block
 * this wide (~680 px) placed left of an already-left sphere simply walks off the
 * viewport, which is what a fixed offset produced: the only visible part was the
 * tail poking out on the *right*, the mirror image of the reference.
 *
 * So the rule is "extend into the open half of the frame". Right-hand spheres get
 * the reference's own arrangement — block to the left, body covering its right
 * end. Left-hand spheres get it mirrored. Either way the sphere overlaps roughly
 * a third of the type, which is the part that actually sells the depth.
 *
 * `z = -1.2` puts it behind the sphere's own centre depth. The DOM layer already
 * guarantees the ordering; keeping it behind in world space too means its
 * projected offset shifts the way something behind the body should as pointer
 * parallax moves the group.
 */
function SphereWatermark({
  line1,
  line2,
  anchor,
  portal,
}: {
  line1: string;
  /** Second line of the name. Empty for one-word stops — see below. */
  line2: string;
  /**
   * Where the block hangs, in the sphere's own space — supplied by the tier.
   *
   * This used to be a `side: "left" | "right"` prop resolving inline to −1.6 or
   * −6.5, i.e. the open-half rule described above. That rule is still what the
   * wide tier computes; it moved to `lib/scene/tier.ts` because the compact tier
   * has to answer the question differently. At the compact type size the block is
   * 87 % of a phone's width, so there is no open half to extend into and every
   * stop's type is anchored flush at the same screen position instead.
   */
  anchor: readonly [number, number, number];
  portal?: React.RefObject<HTMLElement>;
}) {
  return (
    <Html
      position={anchor as unknown as [number, number, number]}
      className="pointer-events-none"
      zIndexRange={[1, 0]}
      portal={portal}
    >
      <div className="pointer-events-none select-none whitespace-nowrap">
        {/* 10px under `md:`. The near-double alpha this label carries against the
            lines below it is there because 12px needs far more contrast than
            130px to register at the same apparent weight; that argument holds at
            10px against 66px, so only the size steps down. */}
        <div className="text-[10px] md:text-[12px] tracking-[0.2em] text-brand-purple/35 font-semibold ml-2 mb-[-5px]">
          PROJECTS
        </div>
        {/* `min(17vw, 130px)` rather than a `md:` step, because this one needs to
            be continuous: it is display type whose block width has to stay inside
            a frame that varies, and a breakpoint would leave 767px rendering a
            664px block in a 767px frame. 17vw reaches the desktop 130px at 765px
            wide, so the wide tier is unaffected, and at 390px it resolves to 66px
            — where the longest label, PORTFOLIO, measures 339px against a 390px
            frame. Measured before: 664px in that same frame. */}
        <div className="font-serif text-[min(17vw,130px)] leading-[0.8] text-brand-purple/20">
          {line1}
        </div>
        {/* Dropped rather than rendered empty: at 130px on 0.8 leading a blank
            second line is 104px of dead space, and the block is bottom-anchored
            against the sphere, so a one-word stop would sit visibly high. */}
        {line2 && (
          <div className="font-serif text-[min(17vw,130px)] leading-[0.8] text-brand-purple/20">
            {line2}
          </div>
        )}
      </div>
    </Html>
  );
}

/**
 * The card pinned to a numbered sphere's surface.
 *
 * Ink rather than white throughout. The ground here is the sphere, not the page,
 * and the spheres now carry the reference's pale tonal ramp — white measures
 * 2.0:1 against the rose blob where ink measures 8.9:1. It is also what the
 * reference does: its black headline runs straight across the spheres.
 *
 * `zIndexRange` is capped below the navbar's z-50 equivalent so a card riding up
 * on scroll passes *behind* the fixed chrome instead of over it.
 */
function SphereLabel({
  number,
  line1,
  line2,
  depth,
  portal,
  expanded = false,
  onToggle,
}: {
  number: string;
  line1: string;
  line2: string;
  /** How far in front of the sphere's centre the card floats — one body radius. */
  depth: number;
  portal?: React.RefObject<HTMLElement>;
  /** This sphere's satellite fan is open. Swaps the glyph to the collapse mark. */
  expanded?: boolean;
  onToggle?: (number: string) => void;
}) {
  return (
    <Html
      position={[0, 0, depth]} // Just in front of the sphere surface
      center
      className="pointer-events-auto"
      zIndexRange={[100, 0]}
      portal={portal}
    >
      {/* ── The card cannot stay the same fraction of its body ──

          200px sits on a body that projects to 494px at 1080px tall, so on the
          wide tier the card is 40 % of the diameter — which is what makes it read
          as type pinned to a surface rather than a label parked in front of one.

          That fraction cannot be carried down. 40 % of a compact stop's 203px is
          81px, and the card has to hold the numeral, a two-line letter-spaced
          label and a 44px touch target. The floor is set by legibility, not by
          proportion, and it lands at 128px — which is ~63 % of the body.

          So this is a knowing departure rather than an oversight: it is the one
          place the responsive pass breaks a desktop design rule instead of
          re-solving it. The alternative is a larger `stopRadius`, which trades
          directly against the chain's zig-zag — see the note on `COMPACT`. */}
      <div className="flex flex-col items-center w-[128px] md:w-[200px]">
        <span className="font-serif text-[32px] md:text-[46px] leading-none mb-2 text-brand-text">
          {number}
        </span>
        <span className="text-[10px] font-semibold tracking-wider text-center leading-tight mb-5 text-brand-text/80">
          {line1}
          {line2 && (
            <>
              <br />
              {line2}
            </>
          )}
        </span>
        {/* The share control, which is what opens this sphere's satellites.
            Nothing else opens them: the fan has no hover state and no scroll
            trigger, so the drops only ever appear as the answer to a click on
            this button — the reference behaves the same way.

            Open, it becomes the collapse mark rather than a second share icon,
            which is the reference's own affordance for an expanded stop: the
            control that opened it is the control that closes it. */}
        <button
          type="button"
          aria-label={
            expanded
              ? `Collapse ${line1} ${line2}`.trim()
              : `Share ${line1} ${line2}`.trim()
          }
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(number);
          }}
          // 44×44, up from 40. WCAG 2.2 SC 2.5.8 asks for 24 and this always
          // passed it; 44 is the iOS and Material figure, and it is the one that
          // decides whether a thumb hits this or the sphere behind it.
          className={`w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer transition-colors text-brand-text ${
            expanded
              ? "border-brand-text/40 bg-white/70 backdrop-blur-[2px]"
              : "border-brand-text/25 hover:bg-brand-text/10"
          }`}
        >
          {expanded ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          )}
        </button>
      </div>
    </Html>
  );
}

/**
 * How long one bubble takes to rise the length of a link, in seconds.
 *
 * A link is ~6.5 world units on the wide tier, so this is ~0.7 units a second —
 * slow enough to read as buoyancy rather than as a signal travelling a wire.
 */
const BUBBLE_TRIP = 9.5;

/**
 * Fraction of a trip spent emerging from the lower body and being absorbed into
 * the upper one. The bubble scales over these stretches while it is still
 * *inside* each silhouette, so the composite's field merge draws the neck —
 * it buds off one body and is swallowed by the next rather than popping.
 */
const BUBBLE_EDGE = 0.14;

/**
 * The hairline that threads the chain together, with its bubbles.
 *
 * Two things make this read as the reference's connector rather than as a drawn
 * line. It is nearly invisible — the reference's is a single dark hairline at
 * roughly 8 % against white, the same value `.bravis-line` already uses in CSS —
 * and it carries small blobs *of the same material as the spheres*, so the line
 * reads as a thread the drops are running along rather than as a diagram edge.
 *
 * The beads rise. Each one buds off the lower body (`to`), travels up the thread
 * breathing as it goes, and is absorbed into the body above it (`from`) — so
 * across the whole chain the field reads as feeding the head sphere. Three per
 * link, a third of a trip apart; uneven sizes so they do not read as tick marks.
 * Under reduced motion they hold still at their old uneven fractions.
 */
function Connector({
  from,
  to,
  fromR,
  toR,
  tint,
  birthOrder,
  reducedMotion,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Radius of the upper body, the one the bubbles are absorbed into. */
  fromR: number;
  /** Radius of the lower body, the one the bubbles bud off. */
  toR: number;
  tint: { inner: string; mid: string; warm: string; rim: string };
  /** Birth sequence position of the body this link runs *into*. */
  birthOrder: number;
  reducedMotion: boolean;
}) {
  const beads = [0.28, 0.46, 0.72];
  const groups = useRef<(THREE.Group | null)[]>([]);
  const clock = useRef(0);

  // The run each bubble travels: from just inside the lower body's silhouette
  // to just inside the upper one's, so both ends are hidden by the bodies and
  // only the budding and the merge are seen.
  const run = useMemo(() => {
    const dir = from.clone().sub(to).normalize();
    return {
      start: to.clone().addScaledVector(dir, toR * 0.8),
      end: from.clone().addScaledVector(dir, -fromR * 0.8),
    };
  }, [from, to, fromR, toR]);

  // Where each bead is at t = 0, which is also where it is born and where it
  // rests under reduced motion. Kept at the old fractions of the thread so the
  // intro is unchanged.
  const anchors = useMemo(
    () =>
      beads.map((t) => {
        const p = from.clone().lerp(to, t);
        return {
          position: p.toArray() as [number, number, number],
          origin: [-p.x, -p.y, -p.z] as [number, number, number],
          // The same point, as a fraction of the rising run (0 at the lower body).
          u: THREE.MathUtils.clamp(
            p.clone().sub(run.start).length() / run.start.distanceTo(run.end),
            0,
            1
          ),
        };
      }),
    // `beads` is a literal rebuilt each render and `from`/`to` are the chain's
    // own vectors, which are stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, run]
  );

  useFrame(() => {
    if (reducedMotion) return;
    // Normalised frame time rather than the raw clock, so a restored tab does
    // not jump every bubble a whole trip at once.
    clock.current += frame.d / 60;
    const phase = clock.current / BUBBLE_TRIP;
    anchors.forEach((a, i) => {
      const g = groups.current[i];
      if (!g) return;
      const u = (a.u + phase) % 1;
      // Ease the speed: a little slower leaving and arriving, where the merge is.
      const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      g.position.lerpVectors(run.start, run.end, e);
      g.position.set(
        g.position.x - a.position[0],
        g.position.y - a.position[1],
        g.position.z - a.position[2]
      );
      const s = Math.max(
        0.001,
        Math.min(1, u / BUBBLE_EDGE, (1 - u) / BUBBLE_EDGE)
      );
      g.scale.setScalar(s * s * (3 - 2 * s));
    });
  });

  return (
    <>
      <Line
        points={[from, to]}
        color="#14131A"
        lineWidth={1}
        opacity={0.1}
        transparent
      />
      {beads.map((t, i) => (
        // The wrapper carries the rise and the bud/merge scale; the blob inside
        // keeps its own float, parallax and breath on top of it.
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
        >
          <FluidBlob
            position={anchors[i].position}
            birthOrigin={anchors[i].origin}
            radius={[0.1, 0.14, 0.12][i]}
            floatSpeed={[0.5, 0.6, 0.4][i]}
            floatAmplitude={[0.1, 0.15, 0.12][i]}
            mouseStrength={[0.1, 0.15, 0.12][i]}
            // A visible breath. The default for a body this small is ±8.5 %,
            // which on a bead of 0.1 is under a pixel; ±22 % is a slow, readable
            // inhale. Rates are close but not equal, so the three drift in and
            // out of step on the way up.
            breathAmplitude={0.22}
            breathSpeed={[1.5, 1.3, 1.7][i]}
            breathPhase={i * 2.1}
            bubble={0.9}
            // The beads run *along* the thread, so they arrive between the two
            // bodies they join rather than with either of them — fractional
            // positions in the sequence, spaced by where each bead actually sits
            // on the line. The thread reads as filling in the direction it points.
            birthOrder={birthOrder - 1 + t}
            innerColor={tint.inner}
            color={tint.mid}
            warmColor={tint.warm}
            rimColor={tint.rim}
          />
        </group>
      ))}
    </>
  );
}

/**
 * Sphere arrangement with scroll-based movement
 */
function SphereGroup({
  scrollYProgress,
  labelPortal,
  watermarkPortal,
  tier,
}: {
  scrollYProgress?: MotionValue<number>;
  labelPortal?: React.RefObject<HTMLElement>;
  watermarkPortal?: React.RefObject<HTMLElement>;
  /**
   * Threaded from `HeroCanvas` rather than read from `useSceneTier` here, so the
   * whole scene and the section height in `Hero` are guaranteed to be resolving
   * the same tier on the same commit. Two independent subscriptions could
   * disagree for a frame across the boundary, and a chain solved for one frame
   * width inside a section sized for the other is exactly the failure this file
   * exists to remove.
   */
  tier: SceneTier;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pointerRef = usePointer();
  const reducedMotion = usePrefersReducedMotion();

  // ── Which stop has its satellites out ──
  //
  // One at a time, by design. Two fans open at once put eight drops and eight
  // cards into a frame that holds one sphere comfortably, and their connector
  // threads cross — the reference expands exactly one stop and collapses the
  // previous one on its way.
  // The card names, as edited in the backend's admin. Returns its argument
  // unchanged whenever that service is not serving, so the chain table below
  // stays the copy this page renders on its own — see `useLabelResolver`.
  const resolveLabel = useLabelResolver();

  const [expanded, setExpanded] = useState<string | null>(null);

  // Which fan is *mounted*, which trails `expanded` rather than matching it.
  //
  // React unmounts a child the instant its parent stops rendering it, so driving
  // the satellites straight off `expanded` would delete them mid-collapse and the
  // fan would vanish rather than retract. `mounted` therefore lags: the drops stay
  // in the tree, `open` goes false, they play their exit, and only then does the
  // row swap or clear.
  //
  // The two delays differ because they are two different waits. 260 ms is enough
  // of the retraction to read before the next stop's fan replaces it — waiting for
  // the full exit there makes clicking one share button after another feel stuck.
  // 640 ms is the whole exit, which is what an actual close has to play out.
  const [mounted, setMounted] = useState<string | null>(null);

  useEffect(() => {
    if (expanded === mounted) return;
    // Nothing on screen to retract, so mount on the next tick — the drops start
    // at zero scale regardless, which is why a tick costs nothing visually and
    // buys a state update that is not synchronous inside an effect.
    const delay = mounted === null ? 0 : expanded ? 260 : 640;
    const t = setTimeout(() => setMounted(expanded), delay);
    return () => clearTimeout(t);
  }, [expanded, mounted]);

  const toggleSatellites = useCallback((number: string) => {
    setExpanded((current) => (current === number ? null : number));
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;

    const t = state.clock.elapsedTime;
    const px = pointerRef.current?.x ?? 0;
    const py = pointerRef.current?.y ?? 0;

    // Slow drifting.
    //
    // Common-mode: this moves the whole composition, so it does not separate the
    // spheres from each other — but it does move them against the static page,
    // which is exactly what the reference measurement sees, so it counts toward
    // each sphere's on-screen wander and has to be budgeted with the per-blob
    // float rather than tuned by feel.
    //
    // X was 0.12, which on its own put the head sphere's horizontal sd at 3.0%
    // of radius — already above the reference's 1.9% total before the blob's own
    // float was added. Y is untouched: the vertical budget was on target.
    const autoX = Math.sin(t * 0.08) * 0.045;
    const autoY = Math.cos(t * 0.06) * 0.08;

    // Mouse parallax
    const pointerX = px * 0.25;
    const pointerY = py * 0.15;

    // Scroll parallax (moves scene UP as we scroll down).
    //
    // The lift is not a feel knob — it is solved from the chain's geometry, and
    // it is now solved in one place: `scrollLift` is four times the tier's stop
    // spacing, which is what lands the three stops at eye level on progress 0.25,
    // 0.50 and 0.75. `Hero`'s section height comes off the same expression via
    // `heroVh`, holding the scroll *pace* — 0.037 world units per vh — constant
    // across tiers.
    //
    // That pace was already named as the invariant here when the lift was a
    // literal 26 against a literal 700vh. What was not written down is that
    // holding it also holds the *parallax ratio*, scene pixels moved per pixel
    // scrolled: world-units-per-pixel and vh both scale with viewport height, so
    // they cancel and the ratio is 0.425 on every device. A phone therefore needs
    // no separate tuning here — see `lib/scene/tier.ts` for the derivation.
    const scrollOffset = scrollYProgress
      ? scrollYProgress.get() * scrollLift(tier)
      : 0;

    // Smooth damping for position
    groupRef.current.position.x +=
      ((autoX + pointerX) - groupRef.current.position.x) * 0.02;

    // We add the scrollOffset to the target Y position.
    //
    // ⚠️ The 0.05 is authored per *60 Hz frame*, not per second, and this is the
    // one smoothing step in the hero that the page scroll feeds — `scrollOffset`
    // above is the only scroll term in the chain. Applied raw it made the sphere
    // chain's scroll response a function of refresh rate: measured on a 60 Hz
    // display the group retained 0.950 of its error per frame at the original
    // 0.05 (a 325 ms time constant), and the identical code on a 120 Hz panel
    // converged in half the wall-clock time, because it took the same bite twice
    // as often.
    //
    // `frame.d` is Δt expressed in 60 Hz frames, so raising the *retention* to it
    // is the exact correction rather than an approximation: at d = 1 this returns
    // `SCROLL_CHASE` unchanged, and at any other d it returns the factor that
    // lands the group in the same place at the same wall-clock instant. It is the
    // same form
    // the fluid pipeline already uses for every one of its rates — see the
    // `1 - Math.pow(1 - params.brushStrength, frame.d)` block in `FluidScene`.
    //
    // Deliberately not `frame.k098` / `k090`: those are precomputed for retentions
    // of 0.98 and 0.90, and they are linear approximations of this expression
    // rather than the expression itself.
    //
    // `frame.d` is written by `updateFrame` inside `FluidScene`'s callback, which
    // runs at `FLUID_RENDER_PRIORITY` — above this component's default priority,
    // so what is read here is the previous frame's value. That is fine and is why
    // the low-pass in `updateFrame` matters: `d` is itself smoothed at 0.05 per
    // frame, so one frame of staleness is far below the noise it already removes.
    const targetY = autoY + pointerY + scrollOffset;
    const scrollChase = 1 - Math.pow(1 - SCROLL_CHASE, frame.d);
    groupRef.current.position.y +=
      (targetY - groupRef.current.position.y) * scrollChase;

    groupRef.current.rotation.z = Math.sin(t * 0.05) * 0.008;
  });

  // ── The chain ──
  //
  // Four spheres on one descending zig-zag — the head plus three numbered stops —
  // which is the reference's whole composition: the line never doubles back, and
  // each sphere sits on the opposite side from the one above it so the connector
  // always crosses the viewport rather than running down one edge.
  //
  // Y spacing is one reveal per scroll step. The group lifts by
  // `scrollYProgress * SCROLL_LIFT`, so a sphere at y = -6.5 arrives at eye level
  // when the lift reaches 6.5 — the spacing below and SCROLL_LIFT are the same
  // number expressed twice, and changing one without the other strands the tail
  // of the chain off screen. Three stops at 6.5 apart put the deepest at -19.5,
  // which is what sets SCROLL_LIFT to 26 and the hero to 700vh; see both notes
  // above.
  //
  // ⚠️ Radii below the head are now uniform at 2.0, by direction, and this
  // reverses the argument that used to sit here. That argument was: radii shrink
  // down the chain because in the reference the spheres read as receding rather
  // than repeating, and equal radii make a chain look like a list. It is still a
  // fair description of the risk — six identical bodies have nothing but their
  // labels to tell them apart on silhouette alone. What carries the difference
  // instead is per-sphere `seed`: envelope offset, envelope speed and the Phase 3
  // lobe precession are all seeded per blob, so the bodies are the same size
  // without being the same shape at any given instant. With the chain down to
  // three stops the risk it describes is smaller than it was at six, but the
  // mechanism carrying it is unchanged.
  //
  // The head keeps its 2.8. It is the hero of the composition rather than a stop
  // on the list, and it is also the body Phase 1 and Phase 2 were calibrated
  // against — its `amp` bucket (radius > 2.4) would change if it were resized.
  //
  // Hues run purple / blue / pink / yellow down the chain, drawn from the shared
  // pastel table in `lib/palette.ts` rather than authored here. They alternate
  // cool and warm so the line does not run through one neighbourhood, and every
  // body is a four-stop ramp whose widest band takes the second-lightest value
  // of its family — which is what keeps a body reading as a pale membrane
  // rather than as the colour it is named after.
  const chain = useMemo(() => {
    // ── The chain's four bodies, now painted from the shared pastel table ──
    //
    // These used to be four hand-authored gradients sampled off `ref-frames-2`,
    // with stop 03's amber inverted through the ACES curve by hand so it would
    // land on a measured target. That work answered "what colour is the Bravis
    // hero sphere"; the brief these serve now is the other end of the same site —
    // soft, airy, translucent, explicitly not saturated — and the hero's chroma
    // is the thing that was making the head read as a solid ball. The derivation
    // is in the history if the measured version is ever wanted back.
    //
    // Families are picked so the chain alternates cool and warm on the way down
    // rather than running through one neighbourhood: purple at the head, blue,
    // pink, yellow. The fan that opens off each stop rotates its own five
    // families independently — see `dropHue` — so a stop and its drops are never
    // required to agree, which is what keeps an open fan reading as a set of
    // objects rather than as one tinted region.
    const stops = [
      { tint: family("blue"), label: { number: "01", line1: "PORTFOLIO", line2: "" } },
      { tint: family("pink"), label: { number: "02", line1: "ABOUT", line2: "US" } },
      { tint: family("yellow"), label: { number: "03", line1: "CONTACT", line2: "US" } },
    ];
    const violet = HEAD_TINT;

    // The chain, and where each of its bodies is born.
    //
    // `origin` is the intro seed's collapse point — the canvas centre, i.e. the
    // world origin — expressed in each node's *own* group space, which is just
    // its position negated. The chain group's own transform is left out of that
    // conversion on purpose: at the moment the chain is born the group is at
    // rest, its scroll lift is zero and its drift is a fraction of a world unit,
    // so carrying the exact inverse would cost a matrix decomposition per blob
    // per frame to move the launch point by less than a tenth of a sphere radius.
    const withOrigin = <T extends { p: THREE.Vector3 }>(node: T) => ({
      ...node,
      origin: [-node.p.x, -node.p.y, -node.p.z] as [number, number, number],
    });

    // Positions and radii come from the tier; tint and copy do not. The split is
    // the point — a phone is a different *frame*, not a different page, so the
    // hues, the names and the numbering are shared and only the geometry forks.
    //
    // Y is derived rather than authored: `stopY` puts stop i at −(i+1) × spacing
    // and `headY` puts the head one surface gap above the first stop. On the wide
    // tier those return 0.8 / −6.5 / −13 / −19.5, the literals that used to be
    // written here.
    return [
      {
        p: new THREE.Vector3(tier.headX, headY(tier), tier.headZ),
        r: tier.headRadius,
        tint: violet,
        label: null,
      },
      ...stops.map((stop, i) => ({
        p: new THREE.Vector3(tier.stops[i].x, stopY(tier, i), tier.stops[i].z),
        r: tier.stopRadius,
        tint: stop.tint,
        label: stop.label,
      })),
    ].map(withOrigin);
  }, [tier]);

  return (
    // Left alone in Phase 2, against the plan's instruction to raise it.
    //
    // The plan told this phase to raise `floatingRange` because it read the
    // spheres as under-target. Measuring the reference properly says the
    // opposite — the head sphere was already at 1.08x the reference vertically
    // once the group drift and the per-blob float were added up, and the whole
    // phase turned out to be about *removing* horizontal motion, not adding any.
    //
    // Float's own contribution is 0.08 x 0.2 = ±0.016 units, 0.4% of the head
    // sphere's radius in sd. It is a rounding error in the budget either way,
    // and it carries the rotation, so it stays as it is.
    <Float
      speed={0.6}
      rotationIntensity={0.08}
      floatIntensity={0.2}
      floatingRange={[-0.08, 0.08]}
    >
      <group ref={groupRef}>
        {/* The chain, drawn from the table above.

            Connectors are emitted first so every hairline sits behind every
            sphere: the line has to disappear *into* each blob rather than cross
            over it, which is what makes the drops read as threaded onto it. */}
        {chain.slice(0, -1).map((node, i) => (
          <Connector
            key={`link-${i}`}
            from={node.p}
            to={chain[i + 1].p}
            fromR={node.r}
            toR={chain[i + 1].r}
            tint={chain[i + 1].tint}
            birthOrder={i + 1}
            reducedMotion={reducedMotion}
          />
        ))}

        {chain.map((node, i) => (
          <group key={`node-${i}`} position={[node.p.x, node.p.y, node.p.z]}>
            <FluidBlob
              position={[0, 0, 0]}
              radius={node.r}
              // Flat below the head, where it used to ramp `0.15 + i * 0.05`.
              //
              // That ramp's whole defence was size: smaller spheres further down
              // the chain sit closer to the cursor's own scale, so they need to
              // react less or they read as jelly. With 01-03 all at radius 2.0
              // the premise is gone, and the ramp had become an argument for
              // nothing — on the six-stop chain it would have run the tail at
              // 0.45, three times the head's rate, on a body the same size as the
              // one above it. Bodies of equal size get equal motion; the
              // difference between them comes from `seed`, not from their index.
              floatSpeed={i === 0 ? 0.15 : 0.20}
              // Phase 2 — bodily drift, as a fraction of each body's own radius.
              //
              // This replaces a `Math.max(0.15 + i * 0.02, r * 0.08)` floor that
              // only ever raised the head of the chain. The floor's own defence
              // was that rescaling would cost the lower chain motion, and it
              // would — but the motion it was protecting was out of band. That
              // shape held absolute drift roughly *constant* down the chain
              // (0.15 -> 0.21 world units) while the radii fell 2.8 -> 1.45, so
              // relative drift climbed: vertical sd ran 5.7 / 6.0 / 7.9 / 10.2%
              // of radius against the reference's 5.6%. The tail was 1.8x over.
              //
              // A flat fraction puts every body at 5.66%. It is also the same
              // discipline §2a applies to Phase 1 amplitude — the measured band
              // is a ceiling as well as a floor — and it matters more on the
              // small spheres, not less: the plan's own argument is that a given
              // relative motion reads *stronger* on a smaller, crisper body.
              //
              // Speed is untouched. The drift stays a slow ~42s traverse.
              floatAmplitude={node.r * 0.08}
              // Flat below the head for the same reason as `floatSpeed`: the
              // ramp was indexed as a proxy for size, and the sizes are equal
              // now. Left ramping, the six-stop chain's last body would have
              // taken 0.13 against the head's 0.04 — the tail chasing the cursor
              // three times as hard as the hero does.
              mouseStrength={i === 0 ? 0.04 : 0.055}
              // The film, on the chain for the first time. It was gated to the
              // satellite fan while it was being tuned against the reference;
              // the brief is that *every* body should read as a translucent
              // membrane rather than a lit ball, and the head sphere — the
              // largest, most saturated thing on the page — is the body the
              // complaint was actually about.
              //
              // The head takes a touch more than the stops, which is the depth
              // ladder the brief asks for: the hero of the composition carries
              // the strongest lighting and the widest halo, and the bodies
              // behind it carry less. Breath is left to `FluidBlob`'s own
              // size ladder and per-blob seed.
              bubble={i === 0 ? 1 : 0.85}
              // ── Yielding the emphasis to an open fan ──
              //
              // A parent gives up ~12 % of its radius while its own fan is out.
              // It is the other half of the drops' own swell: the fan is the
              // thing being read at that moment, and a hero body at full size
              // next to five drops at full size is two things competing rather
              // than one opening into the other. The reference does the same on
              // its expanded stop — the big body recedes and the satellites take
              // the frame.
              //
              // Riding the radius rather than the group transform is what keeps
              // it honest: the fan is mounted *inside* this blob so it rides the
              // body's drift, and a parent that shrank by its transform would
              // pull the fan it just opened in with it. See FluidBlob's `scale`.
              scale={
                (i === 0 ? expanded === SERVICES_FAN : expanded === node.label?.number)
                  ? 0.88
                  : 1
              }
              // The head reads as the thinnest membrane on the page, which is
              // what a body this large has to do to stay airy — at 2.8 radius it
              // is most of the frame, and a solid one at that size is a wall.
              translucency={i === 0 ? 0.7 : 0.4}
              // The chain's own order, unchanged. The head of the chain is the
              // one body on screen at load and so is the one that has to be
              // born first; everything below it is off-screen at t = 0 and its
              // stagger only matters to whether the field looks switched on all
              // at once when the page is scrolled during the first second.
              birthOrder={i}
              // Intro only — the point this body flies out of. See
              // `BirthState.travel`: the chain is born *at* the pixel the seed
              // collapsed into, not in place, which is what makes the sequence
              // read as cause and effect rather than as two animations that
              // happen to be adjacent.
              birthOrigin={node.origin}
              innerColor={node.tint.inner}
              color={node.tint.mid}
              warmColor={node.tint.warm}
              rimColor={node.tint.rim}
            >
              {/* Nested rather than placed beside the blob, because only the
                  blob drifts.

                  `FluidBlob` runs its float on a group *inside* itself, so a
                  sibling sits at the undrifted anchor and the sphere wanders out
                  from under it — 0.45 world units peak-to-peak at the head of
                  the chain, ~51 px at this camera, on type that is supposed to
                  be pinned to the surface. As children they ride the float, the
                  pointer parallax and the damping, and are unaffected by the
                  mesh's tumble, which is applied to the mesh and not to this
                  group. Phase 2 is what made this visible: it is the phase that
                  makes the bodies move independently of their anchors. */}
              {node.label && (
                <SphereWatermark
                  line1={resolveLabel(node.label).line1}
                  line2={resolveLabel(node.label).line2}
                  anchor={[
                    tier.watermark.anchorX(node.p.x),
                    tier.watermark.anchorY,
                    -1.2,
                  ]}
                  portal={watermarkPortal}
                />
              )}

              {node.label && (
                <SphereLabel
                  {...resolveLabel(node.label)}
                  depth={tier.labelDepth}
                  portal={labelPortal}
                  expanded={expanded === node.label.number}
                  onToggle={toggleSatellites}
                />
              )}

              {/* The satellite fan, nested inside the blob for the same reason the
                  card and the watermark are: only the blob drifts. A sibling would
                  anchor its threads to a point the parent has already floated away
                  from, and the hairlines would visibly detach from the body they
                  are supposed to grow out of.

                  Mounted only for the stop the share button opened — see `mounted`
                  above for why that is a separate piece of state from `expanded`. */}
              {node.label && mounted === node.label.number && (
                <SatelliteField
                  parent={node.label.number}
                  open={expanded === node.label.number}
                  side={node.p.x < 0 ? "left" : "right"}
                  parentRadius={node.r}
                  parentZ={node.p.z}
                  layout={tier.fan}
                  portal={labelPortal}
                  reducedMotion={reducedMotion}
                />
              )}

              {/* The head sphere's own satellite fan — our services.

                  Deliberately the same component, the same table and the same
                  two pieces of state as the numbered stops' fans above; the head
                  is simply a parent whose share control happens to be the CTA on
                  its own body rather than a card pinned to its surface. See
                  `SERVICES_FAN`. */}
              {i === 0 && mounted === SERVICES_FAN && (
                <SatelliteField
                  parent={SERVICES_FAN}
                  open={expanded === SERVICES_FAN}
                  side={node.p.x < 0 ? "left" : "right"}
                  parentRadius={node.r}
                  parentZ={node.p.z}
                  layout={tier.fan}
                  portal={labelPortal}
                  reducedMotion={reducedMotion}
                />
              )}

              {/* The "OUR SERVICES" call to action, anchored to the head of the
                  chain rather than to a fixed screen slot.

                  This is the head sphere's name. It carries no card and no
                  watermark the way the numbered stops do — the hero wordmark
                  already occupies that band of the frame — so the face of the
                  CTA is the only place the body is named, and it is set over
                  two lines because "OUR SERVICES" does not fit across a 115 px
                  circle at 12 px on 0.2em tracking.

                  It used to sit in `Hero.tsx` at `right: 28vw; top: 50%`, which
                  held still while the sphere underneath it lifted by SCROLL_LIFT
                  — so the two separated as soon as you scrolled. Parented here
                  it inherits the group's scroll lift, the pointer parallax, the
                  blob's own drift and the Float, and stays on the body it
                  belongs to.

                  Anchored at the sphere's own centre depth (z = 0) on purpose:
                  an offset in front of the surface, the way `SphereLabel` does
                  it, sits closer to the camera and magnifies the projected
                  offset, so the button would drift off-centre as the sphere
                  moves. */}
              {i === 0 && (
                <Html
                  position={[0, tier.ctaY, 0]}
                  center
                  className="pointer-events-auto"
                  zIndexRange={[100, 0]}
                  portal={labelPortal}
                >
                  <div className="hero-cta opacity-0">
                    {/* This is the head's share control. It is styled as the
                        reference's CTA rather than as a numbered card's share
                        glyph, but it drives the identical toggle, so the fan it
                        opens is the same mechanism with the same timing. */}
                    <CTAButton
                      text="OUR"
                      subtext="SERVICES"
                      // 92 on the compact tier. The wide 115 is 17 % of a head
                      // that projects to 692px; the same fraction of a compact
                      // head's 254px is 43px, which will not hold "SERVICES" at
                      // any size worth reading. 92 is 36 % — larger relative to
                      // its body than desktop, for the same legibility-floor
                      // reason the numbered card is (see `SphereLabel`).
                      size={tier.ctaSize}
                      expanded={expanded === SERVICES_FAN}
                      ariaLabel={
                        expanded === SERVICES_FAN
                          ? "Close Our Services"
                          : "Open Our Services"
                      }
                      onClick={() => toggleSatellites(SERVICES_FAN)}
                    />
                  </div>
                </Html>
              )}
            </FluidBlob>
          </group>
        ))}

        {/* Loose drops. Not on the chain — they give the field somewhere to go
            besides the line, which the reference uses to keep the composition
            from reading as a strict diagram. */}
        <FluidBlob
          position={[tier.drops[0].x, tier.drops[0].y, tier.drops[0].z]}
          radius={tier.drops[0].r}
          // The loose drops are not on the chain, so their place in the
          // sequence comes from where they sit in the composition instead:
          // each falls just after the body it is nearest to vertically, so the
          // field fills top to bottom the way the chain does.
          birthOrder={0.45}
          floatSpeed={0.45}
          floatAmplitude={0.45}
          mouseStrength={0.12}
          // The loose drops are the smallest bodies on the field, so they take
          // the top of `FluidBlob`'s own breath ladder. The halo is a composite
          // term rather than a per-body one — see uAura in composite.frag.ts.
          bubble={0.9}
          translucency={0.5}
          innerColor={family("purple").inner}
          color={family("purple").mid}
          warmColor={family("purple").warm}
          rimColor={family("purple").rim}
        />
        <FluidBlob
          position={[tier.drops[1].x, tier.drops[1].y, tier.drops[1].z]}
          radius={tier.drops[1].r}
          birthOrder={1.3}
          floatSpeed={0.8}
          floatAmplitude={0.6}
          mouseStrength={0.2}
          // The loose drops are the smallest bodies on the field, so they take
          // the top of `FluidBlob`'s own breath ladder. The halo is a composite
          // term rather than a per-body one — see uAura in composite.frag.ts.
          bubble={0.9}
          translucency={0.5}
          innerColor={family("mint").inner}
          color={family("mint").mid}
          warmColor={family("mint").warm}
          rimColor={family("mint").rim}
        />
        <FluidBlob
          position={[tier.drops[2].x, tier.drops[2].y, tier.drops[2].z]}
          radius={tier.drops[2].r}
          birthOrder={2.3}
          floatSpeed={0.7}
          floatAmplitude={0.5}
          mouseStrength={0.18}
          // The loose drops are the smallest bodies on the field, so they take
          // the top of `FluidBlob`'s own breath ladder. The halo is a composite
          // term rather than a per-body one — see uAura in composite.frag.ts.
          bubble={0.9}
          translucency={0.5}
          innerColor={family("pink").inner}
          color={family("pink").mid}
          warmColor={family("pink").warm}
          rimColor={family("pink").rim}
        />

      </group>
    </Float>
  );
}

// ─── Background Sphere config ───
// Each sphere has a fixed position, depth, radius, and unique animation phases.
// Deeper Z = less mouse parallax = convincing depth layering.
//
// These are depth hints, and a depth hint has to be *quieter than the ground it
// sits on*. Against near-black that meant near-black violets at 3–7 % — anything
// brighter would have read as an object. Against near-white the identical values
// invert into grey discs: the darkest thing on the page after the type, floating
// in the middle of the composition with no edge to justify them.
//
// So the palette flips with the ground. Pale lavender and periwinkle now, lifted
// a little in opacity because a pale tint on white has far less contrast to spend
// than a dark one on black did, and carrying most of their presence in `emissive`
// so they stay luminous instead of taking a grey cast off the scene's lights.
const BG_SPHERES = [
  { pos: [4.5, 1.5, -7],   r: 2.4,  opacity: 0.15, color: "#cdbdf6", emissive: "#a78bfa", phase: 0.0 },
  { pos: [-3.5, -5.0, -9], r: 2.8,  opacity: 0.11, color: "#dad0f9", emissive: "#b9a5f0", phase: 1.7 },
  { pos: [-5.0, 3.0, -11], r: 1.8,  opacity: 0.13, color: "#cfe0f2", emissive: "#a9c6e8", phase: 3.2 },
  { pos: [6.0, -3.0, -10], r: 1.5,  opacity: 0.11, color: "#e6dbf8", emissive: "#c4b5fd", phase: 4.8 },
  { pos: [0.0, 5.5, -12],  r: 2.0,  opacity: 0.09, color: "#ded5f6", emissive: "#b9a5f0", phase: 2.4 },
  { pos: [-2.0, -1.0, -6], r: 1.2,  opacity: 0.17, color: "#cdbdf6", emissive: "#a78bfa", phase: 5.5 },
] as const;

/**
 * A single animated background sphere.
 * Uses meshStandardMaterial so it responds to scene lighting.
 * Has subtle floating, breathing, rotation, and mouse parallax.
 */
function AnimatedBgSphere({
  position,
  radius,
  opacity,
  color,
  emissive,
  phase,
}: {
  position: readonly [number, number, number];
  radius: number;
  opacity: number;
  color: string;
  emissive: string;
  phase: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointerRef = usePointer();

  // Depth factor: deeper spheres (more negative Z) get less mouse influence
  const depthFactor = useMemo(() => {
    const z = Math.abs(position[2]);
    return Math.max(0.02, 1.0 / (z * 0.4));
  }, [position]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const px = pointerRef.current?.x ?? 0;
    const py = pointerRef.current?.y ?? 0;

    // Subtle floating — each sphere has unique phase offset
    const floatX = Math.sin(t * 0.06 + phase) * 0.08;
    const floatY = Math.cos(t * 0.045 + phase * 1.3) * 0.1;
    const floatZ = Math.sin(t * 0.035 + phase * 0.7) * 0.04;

    // Mouse parallax — inversely proportional to depth
    const mouseX = px * 0.15 * depthFactor;
    const mouseY = py * 0.1 * depthFactor;

    // Smooth damped position
    const target = {
      x: position[0] + floatX + mouseX,
      y: position[1] + floatY + mouseY,
      z: position[2] + floatZ,
    };
    meshRef.current.position.x += (target.x - meshRef.current.position.x) * 0.015;
    meshRef.current.position.y += (target.y - meshRef.current.position.y) * 0.015;
    meshRef.current.position.z += (target.z - meshRef.current.position.z) * 0.015;

    // Breathing scale — very subtle ±2%
    const breathe = 1.0 + Math.sin(t * 0.08 + phase * 2.0) * 0.02;
    meshRef.current.scale.setScalar(breathe);

    // Slow rotation
    meshRef.current.rotation.x = t * 0.012 + phase;
    meshRef.current.rotation.y = t * 0.018 + phase * 0.5;
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1], position[2]]}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={0.3}
        roughness={0.85}
        metalness={0.1}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Animated background spheres — deep-layered, subtly alive.
 * Replaces the old static CanvasBackdrop.
 */
function BackgroundSpheres() {
  return (
    <group>
      {BG_SPHERES.map((s, i) => (
        <AnimatedBgSphere
          key={i}
          position={s.pos}
          radius={s.r}
          opacity={s.opacity}
          color={s.color}
          emissive={s.emissive}
          phase={s.phase}
        />
      ))}
    </group>
  );
}

export default function HeroCanvas({
  scrollYProgress,
  labelPortal,
  watermarkPortal,
}: HeroCanvasProps) {
  const reducedMotion = usePrefersReducedMotion();

  // Resolved once here and threaded down, rather than subscribed to again inside
  // the canvas — see the `tier` prop on `SphereGroup`.
  const tier = useSceneTier();

  return (
    <SphereInteractionProvider>
      <div className="absolute inset-0 z-0">
        {/*
          FluidCanvas owns the renderer configuration and mounts the metaball
          pass chain. Everything below is the same scene as before — it is now
          rendered through the pipeline rather than straight to the screen.
        */}
        <FluidCanvas>
          {/*
            Resolves the cursor against every registered sphere, once per frame.
            Mounted first so its frame callback subscribes before the spheres do
            and they read a contact computed this frame rather than last. Disabled
            under prefers-reduced-motion, which leaves the spheres in their
            ambient state.
          */}
          <SphereInteractionDriver enabled={!reducedMotion} />

          {/*
            The intro seed — the screen-filling body the loading curtain hands
            off to, which collapses to the point the chain below is born out of.
            Mounted here rather than inside `SphereGroup` because it belongs to
            the *canvas* centre and must not inherit the chain's scroll lift,
            parallax or drift. Unmounts itself once the intro has settled.
          */}
          <IntroSeed />

          {/* Camera */}
          <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={40} />

          {/* Moody purple-tinted lighting */}
          <ambientLight intensity={0.6} color="#a0a0c0" />
          <directionalLight
            position={[5, 5, 5]}
            intensity={1.4}
            color="#c8c0f0"
          />
          <pointLight
            position={[-4, 3, 3]}
            intensity={0.8}
            color="#8B5CF6"
          />
          <pointLight
            position={[5, -2, 4]}
            intensity={0.5}
            color="#6366f1"
          />
          <pointLight
            position={[0, 5, 2]}
            intensity={0.3}
            color="#c4b5fd"
          />

          {/* Environment with lightformers — purple iridescent reflections */}
          <Environment resolution={256}>
            <group rotation={[Math.PI / 2, 0, 0]}>
              <Lightformer
                form="circle"
                intensity={2.5}
                position={[0, 5, -5]}
                scale={5}
                color="#8B5CF6"
              />
              <Lightformer
                form="circle"
                intensity={1.8}
                position={[-5, 2, -2]}
                scale={3}
                color="#6366f1"
              />
              <Lightformer
                form="ring"
                intensity={1.2}
                position={[5, 3, 2]}
                scale={6}
                color="#e0e0ff"
              />
              <Lightformer
                form="rect"
                intensity={1.0}
                position={[0, -4, -3]}
                scale={[12, 3, 1]}
                color="#1a1035"
              />
              <Lightformer
                form="circle"
                intensity={0.6}
                position={[3, 0, 5]}
                scale={4}
                color="#c4b5fd"
              />
            </group>
          </Environment>

          {/* Animated background spheres */}
          <BackgroundSpheres />

          {/* Foreground glass spheres */}
          <SphereGroup
            scrollYProgress={scrollYProgress}
            labelPortal={labelPortal}
            watermarkPortal={watermarkPortal}
            tier={tier}
          />

          {/* Soft floor shadow — purple tinted */}
          <ContactShadows
            position={[0, -10, 0]}
            opacity={0.06}
            scale={30}
            blur={3}
            far={10}
            color="#4c1d95"
          />

          {/*
            The postprocessing composer used to sit here. It has to go: it claims
            the frame the same way the fluid pipeline does, and only one of them
            can own rendering. Its two visible contributions are carried over —
            ACES tone mapping and the sRGB transfer now happen at the end of the
            composite shader, and the bloom is replaced by a wide glow taken from
            the blur the pipeline already computes (`uGlow`).
          */}
        </FluidCanvas>
      </div>
    </SphereInteractionProvider>
  );
}
