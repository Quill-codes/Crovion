"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import FluidBlob from "./FluidBlob";
import ContactForm from "./ContactForm";
import { dropHue, type DropHue, type SatelliteNode } from "@/lib/satellites";
import { useDrops } from "@/lib/content/store";
import { detailHref } from "@/lib/pages/registry";
import { type FanLayout } from "@/lib/scene/tier";
import { frame } from "@/lib/frame";

/**
 * The four-stop gradient a sphere is built from.
 *
 * The chain's bodies. Satellites used to inherit one of these wholesale, then
 * all but its rim; they now carry their own — see `DROP_TINTS` in
 * `lib/satellites.ts` — so this is the chain's type and nothing else's.
 */
export interface Tint {
  inner: string;
  mid: string;
  warm: string;
  rim: string;
}

/**
 * `tan(fov/2)` for the hero camera's fov of 40. See `HeroCanvas`'s
 * `PerspectiveCamera`, which is the only camera a fan is ever mounted under.
 */
const FOV_TAN = Math.tan((40 * Math.PI) / 360);

/**
 * CSS pixels per world unit, for a body `depth` units in front of the camera.
 *
 * This used to be the constant 103, annotated *"fov 40 from z = 12, 900px tall"*
 * — and the annotation was the bug. 103 is only the right number when the canvas
 * is exactly 900 px tall and the drop sits exactly on the composition plane, and
 * the card built on it was therefore too big for its body on every other window:
 * 12 % too big at 801 px of canvas, 50 % at 600. That is what put the names over
 * the rim. It was invisible in the authored geometry because it is not in the
 * authored geometry — no radius or offset is wrong; the world-to-pixel
 * conversion was.
 *
 * Both inputs are live: `size.height` tracks the canvas, and `depth` carries the
 * parent's own z and the drop's, so a drop pushed toward the camera gets the
 * larger card its larger silhouette has earned.
 */
const pxPerUnit = (canvasHeight: number, depth: number) =>
  canvasHeight / (2 * FOV_TAN * depth);

/**
 * How far a drop inflates and deflates, as a fraction of its own radius.
 *
 * The chain's bodies do not do this — they carry the reference's measured drift
 * and an idle *shape* wobble at constant volume, and that is the composition.
 * A drop is a transient thing that arrives when a fan is opened and leaves when
 * it closes, and the pulse is what keeps it from reading as a decal once it has
 * settled: five bodies holding perfectly still is the one state that makes the
 * fan look drawn rather than alive.
 *
 * ── What 6 % is solved against ──
 *
 * The obvious ceiling is the clearance rule the geometry is held to — *"no two
 * neighbouring silhouettes come within 0.6 units"* — where the binding pair is
 * `00-web`/`00-smm` at 0.63 units apart on the wide tier. Two bodies free to
 * peak together would spend 2·A·0.74 of that 0.63, which puts the rule out of
 * reach at any amplitude worth looking at: even 3 % breaches it.
 *
 * They are not free to peak together. `DROP_BREATH_RATE` and the alternating
 * phase below put every drop in exact antiphase with the slot next to it, so
 * the gap between two neighbouring surfaces is `d - r(1+s) - r(1-s)` = `d - 2r`
 * — the amplitude cancels, and **the binding clearance is 0.63 at every instant
 * of the cycle, not on average**. That is the whole reason the rate is shared
 * rather than walked per slot: a per-slot rate looks the same for ten seconds
 * and then drifts the two neighbours into phase, and the guarantee with it.
 *
 * What the amplitude does cost is drop-to-*parent* clearance, which is a gap
 * between a breathing body and a still one and so cannot cancel: the wide
 * tier's worst case falls from 0.40 units to 0.356, i.e. 37 px at this camera
 * against a composite merge distance of 20. That is the number this is actually
 * trading against, and 6 % is where it stops being comfortable.
 *
 * The second ceiling is the type. The name is sized against the body at the
 * *bottom* of the cycle — see `inner` — so every point of amplitude is paid for
 * by every drop's font size all of the time, to buy motion that is only visible
 * at one end of it.
 */
const DROP_BREATH = 0.085;

/**
 * Radians per second, and the same number for every drop on the fan.
 *
 * ~5.6 s a cycle, which is slow enough to be felt rather than watched. It is
 * shared rather than staggered because the antiphase argument in `DROP_BREATH`
 * depends on it being shared; the fan reads as a slow wave passing along the
 * arc rather than as five bodies pulsing independently, which is the better of
 * the two anyway.
 */
const DROP_BREATH_RATE = 1.12;

/**
 * Pixels the composite takes off a body's visible edge, at any size.
 *
 * The drops are not drawn as discs. They go through the field's blur and its
 * isoline threshold like every other body, and both of those work in **screen
 * pixels**: the blur kernel is a fixed radius and the threshold cuts the blurred
 * field at a fixed level, so what they remove from a silhouette is a roughly
 * constant number of pixels rather than a constant fraction of it.
 *
 * That distinction is the whole reason this is not a multiplier. A 5 % inset is
 * 3 px on a wide-tier drop and 1.4 px on a compact one, where the real bite is
 * the same on both — measured, a compact drop whose geometry says 27.7 px
 * renders at about 23, and the 4.7 px difference is what put the last letter of
 * "E-commerce Management" on the soft edge of a body the arithmetic said it was
 * comfortably inside.
 *
 * 5 is that measurement rounded up, which makes it a floor on the trim rather
 * than a fit of it — the direction to be wrong in, since being wrong the other
 * way is a name on the rim.
 */
const DROP_RIM = 5;

/**
 * The name's line height, as a multiple of its own size.
 *
 * Tighter than Tailwind's `leading-tight` at 1.25. A display serif set in two
 * short centred lines wants its lines close enough to read as one shape, and
 * every step down here is height the circle gives back to the type size.
 *
 * A constant rather than a class because the fit pass counts lines with it —
 * see `tryFit` — and a line count derived from a number the stylesheet owns is
 * a line count that silently goes wrong when someone edits the stylesheet.
 */
const NAME_LEADING = 1.14;

/**
 * The fan of drops that opens off one numbered sphere.
 *
 * Same body, same material, same interaction registration as the chain's own
 * spheres — a satellite is a `FluidBlob` with the parent's tint and a smaller
 * radius, so it deforms under the cursor and takes ripples exactly as the parent
 * does. That is the whole point of reusing the component rather than drawing a
 * cheap disc: the reference's satellites are unmistakably the same substance as
 * the body they came out of.
 *
 * ── One level, and where the second one went ──
 *
 * This used to recurse. A drop with `children` mounted another copy of this
 * component inside its own blob, giving a three-deep tree with a `depth` prop
 * threaded through it and a one-open-at-a-time rule holding the third level's
 * solved offsets apart.
 *
 * All of that is gone. A drop's control is now a link to that drop's page — an
 * ordinary `next/link` anchor that happens to be sitting on a blob — so the fan
 * is one level deep everywhere and the component has no tree state left to keep.
 * What the removal takes with it is worth listing, because none of it is coming
 * back: the `expanded`/`mounted` pair and their retract delays, the render-time
 * reset that stopped a reopened fan arriving with its children already out, the
 * `depth` prop and the float-speed and z-index bands that read it, and the
 * detail line — first its collapse, which only existed to clear room for
 * children, and then the line itself. A drop shows its name and its control;
 * everything it has to say is on the page behind that control.
 *
 * Mounted as a child of the parent's `FluidBlob`, so the fan rides the parent's
 * float, the group's pointer parallax and the scroll lift without any tracking
 * of its own.
 */
export default function SatelliteField({
  parent,
  open,
  side,
  parentRadius,
  parentZ,
  layout,
  portal,
  reducedMotion = false,
}: {
  /** The parent's number — "01" … "03". Selects the row out of `SATELLITES`. */
  parent: string;
  /** Target state. False plays the fan back in rather than unmounting it. */
  open: boolean;
  /** Which half of the frame the parent sits in. Mirrors the offsets. */
  side: "left" | "right";
  /** The body this fan grows out of. Sets how far a stacked drop has to clear it. */
  parentRadius: number;
  /**
   * The parent's own z in world space.
   *
   * Only used to size the drops' cards. A fan is mounted inside the parent's
   * blob, so a drop's distance from the camera is the parent's z plus the drop's
   * own — and that distance is what decides how many pixels the body projects to,
   * which is what the card has to fit inside. See `pxPerUnit`.
   */
  parentZ: number;
  /** How the fan is arranged at this frame width — see `lib/scene/tier.ts`. */
  layout: FanLayout;
  portal?: React.RefObject<HTMLElement>;
  reducedMotion?: boolean;
}) {
  // Copy from the backend when it is serving, the built-in table when it is not,
  // and the local geometry either way — see `useDrops`. A parent with no table
  // entry has no placed positions and therefore no fan.
  const nodes = useDrops(parent);

  /**
   * The fan's placed geometry, per drop.
   *
   * ── Why the authored arc cannot simply be scaled ──
   *
   * `lib/satellites.ts` solves an outward-bulging arc by hand, and its clearances
   * are reasoned in place: every offset clears the parent's radius plus its own,
   * no two neighbouring silhouettes come within 0.6 units once float and morph
   * are accounted for, slot 3 is the far point and is deliberately the smaller
   * body to buy slots 2-4 their spacing, and the first slot came down from y 2.5
   * because the rendered body — wider than `radius`, because the blob displaces
   * outward — clipped the top of the frame.
   *
   * None of that reasoning survives a scale factor. The arc runs to x 6.15 against
   * a phone's half-width of 2.02, so every drop of every fan is outside the frame
   * before its own radius is added; and shrinking it to fit would put five bodies
   * of radius 0.66–0.9 into a band four units wide, where the composite's blur
   * would fuse them into one blob and the fan would stop being a fan.
   *
   * ── The stack ──
   *
   * So the compact tier keeps the objects and changes the arrangement: a vertical
   * run down the parent's open half, centred on the parent, each drop clearing the
   * parent's surface by `gap`. The x offset is still computed per drop rather than
   * shared — it used to inherit a slight bulge from the authored radii, and now
   * that every drop carries the same radius it resolves to a straight run, which
   * is the honest arrangement for a stack of equal bodies.
   *
   * `stack: null` returns the authored offsets untouched, so the wide tier is
   * provably unchanged by any of this.
   */
  const placed = useMemo(() => {
    const { radiusScale, stack } = layout;

    return nodes.map((node, i) => {
      const radius = node.radius * radiusScale;
      if (!stack) return { radius, offset: node.offset };

      return {
        radius,
        offset: [
          parentRadius + radius + stack.gap,
          (i - (nodes.length - 1) / 2) * stack.ySpacing,
          // Depth variety is kept but flattened with the bodies, so a stacked
          // drop does not sit further from the composition plane than its own
          // radius.
          node.offset[2] * radiusScale,
        ] as [number, number, number],
      };
    });
  }, [nodes, layout, parentRadius]);

  if (nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node, i) => (
        <SatelliteDrop
          key={node.id}
          node={node}
          index={i}
          placedOffset={placed[i].offset}
          placedRadius={placed[i].radius}
          parentRadius={parentRadius}
          open={open}
          // The drop's own hue, rotated off the parent's number so no two fans
          // open in the same order. See `dropHue`.
          hue={dropHue(parent, i)}
          side={side}
          parentZ={parentZ}
          portal={portal}
          reducedMotion={reducedMotion}
        />
      ))}
    </>
  );
}

/**
 * One drop, its thread back to the parent, and its card.
 *
 * ── Why the whole thing scales rather than just the blob ──
 *
 * The animated group sits at the *parent's* centre and holds both the connector
 * and the drop, which is positioned at its full offset inside it. Scaling that
 * group therefore does two things at once with one number: the drop grows from
 * nothing, and it travels outward from the parent's surface as it grows, with the
 * hairline extending behind it. Animating the blob's own scale in place would
 * have given a drop that inflates where it already is — the connector would be
 * full-length from the first frame and the fan would not read as coming *out* of
 * the body.
 *
 * The card is exempt. drei's `Html` has no `distanceFactor` here, so it renders
 * at a fixed pixel size no matter what the group's scale is: the name tracks the
 * drop's projected position while staying crisp at full size, and the reveal is
 * carried by opacity instead. Scaling type from zero would have looked like a
 * popup; this looks like the label was always pinned to a drop that just arrived.
 */
function SatelliteDrop({
  node,
  index,
  placedOffset,
  placedRadius,
  parentRadius,
  open,
  hue,
  side,
  parentZ,
  portal,
  reducedMotion,
}: {
  node: SatelliteNode;
  index: number;
  /**
   * Where this drop sits, already resolved for the current tier — the authored
   * offset on the wide tier, a stacked position on the compact one. Still in the
   * data's own "+x is toward the open half" convention, so it is mirrored below
   * exactly as the authored offset was.
   */
  placedOffset: readonly [number, number, number];
  /** This drop's radius after the tier's `radiusScale`. */
  placedRadius: number;
  /** The body this fan grows out of. Sets where the connector's beads start. */
  parentRadius: number;
  open: boolean;
  /**
   * This drop's own four stops.
   *
   * The drops used to be painted in the parent's tint outright, which gave a fan
   * of identical bodies. Then all but the rim came from here. Now the rim does
   * too — the argument, the palette and the measurement it was solved against
   * are all in `lib/satellites.ts`.
   */
  hue: DropHue;
  side: "left" | "right";
  /** The parent's world z. Combined with this drop's, it gives the card its scale. */
  parentZ: number;
  portal?: React.RefObject<HTMLElement>;
  reducedMotion: boolean;
}) {
  const animRef = useRef<THREE.Group>(null);
  const [formOpen, setFormOpen] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLDivElement | null>(null);

  /**
   * Whether the card's DOM actually exists yet.
   *
   * drei's `Html` has no DOM container on its first commit: it creates one in a
   * layout effect of its own and portals its children in on the render after
   * that. A ref on a child of that portal is therefore still null when this
   * component's own layout effect first runs — and a ref that is populated later
   * re-runs nothing, so the fit pass below simply never happened. It only ever
   * ran on a later resize, which is exactly what it looked like: every name
   * solved correctly the instant the window was touched, and sat at its unfitted
   * starting size until then.
   *
   * This is the dependency that fixes that. The callback ref flips it on the
   * commit the node arrives, and the pass runs then.
   */
  const [attached, setAttached] = useState(false);

  const attachCard = (el: HTMLDivElement | null) => {
    cardRef.current = el;
    if (el) setAttached(true);
  };

  // The two live inputs to the card's size. Both are subscriptions rather than
  // frame reads: the canvas height changes on resize and the camera never moves,
  // so this re-renders when the window changes and at no other time. Reading them
  // in `useFrame` instead would rewrite the card's width and font size 60 times a
  // second to the same values, and each write is a layout.
  const canvasHeight = useThree((s) => s.size.height);
  const cameraZ = useThree((s) => s.camera.position.z);

  // One drop on the chain opens the lead form instead of a line of text. It is a
  // property of the drop rather than a check on its id, because the admin can
  // move it — see `SatelliteNode.kind`.
  const isForm = node.kind === "form";

  // This drop's page. Every drop has one now, so every drop carries a share
  // control — which is what the name on the body is for once the detail line is
  // gone. `null` stays a real state rather than a non-null assertion: it is what
  // a drop added ahead of its copy resolves to, and it carries no control rather
  // than one that opens a 404. See the note on `detailHref`.
  const href = detailHref(node.id);

  // Spring state, kept out of React: this is written 60 times a second and
  // nothing needs to re-render when it changes.
  const scale = useRef(reducedMotion ? 1 : 0.0001);
  const velocity = useRef(0);
  const elapsed = useRef(0);

  // `+x` in the data means "toward the open half of the frame", so a right-hand
  // parent takes the mirror image. Same rule the watermark follows, and for the
  // same reason: a fixed offset that clears the viewport on 01 walks off it on 02.
  const offset = useMemo<[number, number, number]>(
    () => [placedOffset[0] * (side === "left" ? 1 : -1), placedOffset[1], placedOffset[2]],
    [placedOffset, side]
  );

  /**
   * The run the thread's bubbles rise along, and how many ride it.
   *
   * They used to be three large static beads sized to overlap into one fused
   * neck. They are small bubbles now, the same treatment as the chain's own
   * `Connector`: each buds off this drop, rises the thread breathing as it goes,
   * and is absorbed into the parent. Both ends sit just inside the two open-state
   * silhouettes (parent at 0.88, drop at 1.18 — see `scale` on both), so only
   * the budding and the merge are ever seen.
   */
  const bubbleRun = useMemo(() => {
    const len = Math.hypot(offset[0], offset[1], offset[2]);
    if (!(len > 0)) return null;
    const from = parentRadius * 0.88 * 0.8;
    const to = len - placedRadius * 1.18 * 0.8;
    if (!(to - from > 0.05)) return null;
    const at = (d: number) =>
      new THREE.Vector3(offset[0], offset[1], offset[2]).multiplyScalar(d / len);
    return {
      // Rising means drop → parent.
      start: at(to),
      end: at(from),
      count: to - from > 1.3 ? 3 : 2,
    };
  }, [offset, parentRadius, placedRadius]);

  // Restart the stagger clock on every toggle.
  useEffect(() => {
    elapsed.current = 0;
  }, [open]);

  // A drop on its way out closes its form, so it does not come back
  // mid-conversation.
  //
  // Adjusted during render against the previous prop rather than in an effect.
  // It is not synchronisation with anything external — it is one piece of state
  // that is invalid the moment another changes — and an effect would render the
  // stale value once before correcting it.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open && formOpen) setFormOpen(false);
  }

  useFrame((_, delta) => {
    const group = animRef.current;
    if (!group) return;

    if (reducedMotion) {
      group.scale.setScalar(open ? 1 : 0.0001);
      group.visible = open;
      if (cardRef.current) {
        cardRef.current.style.opacity = open ? "1" : "0";
        cardRef.current.style.pointerEvents = open ? "auto" : "none";
      }
      return;
    }

    // Clamped so a stalled tab returning a multi-second delta cannot fling the
    // spring — the same guard `frame.ts` applies to the fluid pipeline's clock.
    const dt = Math.min(delta, 1 / 30);
    elapsed.current += dt;

    // Stagger. Opening reads outward, one drop after another; closing is tighter
    // so the fan collapses as one gesture rather than unravelling.
    const delay = open ? index * 0.07 : index * 0.035;
    const target = elapsed.current >= delay ? (open ? 1 : 0) : open ? 0 : 1;

    // Under-damped on the way out (ζ ≈ 0.74) so each drop overshoots slightly and
    // settles, which is what makes it read as mass arriving. Over-damped on the
    // way back (ζ ≈ 1.14) — a bouncing exit reads as a glitch.
    const k = open ? 90 : 110;
    const c = open ? 14 : 24;
    velocity.current += (target - scale.current) * k * dt - velocity.current * c * dt;
    scale.current += velocity.current * dt;

    const s = Math.max(scale.current, 0.0001);
    group.scale.setScalar(s);
    // Culled once it is closed, so a fan's worth of invisible blobs is not being
    // displaced, lit and composited behind every collapsed sphere on the chain.
    group.visible = s > 0.005;

    if (cardRef.current) {
      // Type arrives late and leaves early: at s < 0.35 the drop is still a speck
      // and a full-size name floating over it has nothing to belong to.
      const a = Math.min(1, Math.max(0, (s - 0.35) / 0.5));
      cardRef.current.style.opacity = String(a);
      cardRef.current.style.pointerEvents = a > 0.9 ? "auto" : "none";
    }
  });

  // ── Sizing the card against the body it sits on ──
  //
  // The drop's projected radius, in CSS pixels, at this canvas height and this
  // drop's own distance from the camera. Everything below is a fraction of it,
  // so the card tracks the body on every window instead of on the one 900px-tall
  // window the old constant assumed. See `pxPerUnit`.
  const bodyRadius = placedRadius * pxPerUnit(canvasHeight, cameraZ - (parentZ + offset[2]));

  // The circle the type actually has to live in: the body at the *bottom* of its
  // breath, minus what the composite takes off the edge.
  //
  // Sizing against `bodyRadius` would size the type against the largest the drop
  // ever gets, which is the one instant per cycle at which a block that exactly
  // fits actually fits — every other frame the body is smaller than the number
  // the name was solved against. See `DROP_BREATH` and `DROP_RIM`.
  //
  // Floored well above zero so that a drop caught mid-arrival, or a canvas
  // measured before layout has settled, produces a small circle rather than a
  // negative one — the fit pass divides by nothing, but `2√(R² - h²)` on a
  // negative R² is a NaN width, and a NaN width is a card that vanishes.
  const inner = Math.max(12, bodyRadius * (1 - DROP_BREATH) - DROP_RIM);

  // The block's starting width: the largest *square* that fits inside that
  // circle, whose four corners sit exactly on it.
  //
  // A starting point rather than the answer. The old rule was `body * 0.92`,
  // i.e. 92 % of the body's **diameter**, which is 1.30x this; a centred box that
  // wide has its corners well outside the circle — at radius 0.76 it put them
  // 79.4 px out on a 78.3 px body — and the corners are exactly where a wrapped
  // two-line name puts its first and last glyphs. The square is the conservative
  // fix for that. The fit pass then widens it, because the square is *only* the
  // right answer for a block as tall as it is wide, and a one- or two-line name
  // never is. See `solveWidth`.
  const fit = inner * Math.SQRT2;

  // The control, sized with the body rather than pinned at 28 px.
  //
  // A fixed 28 px face is 26 % of a wide-tier drop and 44 % of a compact one,
  // where it was taking more of the block's height than the name it belongs to
  // and pushing that name off the top of the body. It scales now, and the floor
  // is what keeps it a control rather than a dot. The *hit* area does not scale:
  // a transparent ring inside the button takes it back out to 44 px at every
  // size — see `DropControl`.
  const ctrl = Math.round(Math.min(28, Math.max(17, inner * 0.36)));

  // Between the name and whatever sits under it. Proportional, so the block does
  // not acquire a 6 px gutter it cannot afford on a 60 px body.
  const gap = Math.max(3, Math.round(ctrl * 0.22));

  // A hairline between the name and the control, at a third of the block's width.
  //
  // Present only where there is height to spend on it: it is 1 px of rule and one
  // `gap` of air, which is nothing on a wide-tier drop and is the difference
  // between two lines and three on a compact one. `fit` rather than a breakpoint,
  // because the thing it has to fit inside is the body, not the window.
  const rule = fit >= 76;

  // ── Where the control goes ──
  //
  // On the compact tier a drop projects to about 55 px across. A control is 17 px
  // of that and its gap is 4 more, which is 38 % of the block's height budget
  // spent on a thing that is not the name — and the name is what the drop is
  // for. With both inside the body, "Performance Marketing" solved to 8 px type
  // scaled bodily to 0.73 and broken mid-word twice: contained, and unreadable.
  //
  // So below this size the control leaves the block and hangs off the bottom of
  // the body instead, and the name gets the whole circle. It is still the drop's
  // control — it is positioned from the body's own centre and rides everything
  // the body rides — it is simply not competing with the name for the one
  // resource the compact tier is short of.
  //
  // 56 px is where the two-line name stops fitting alongside it rather than a
  // breakpoint: the wide tier's drops are 89 px and every tablet width in
  // between clears it, so in practice this is the phone stack and nothing else.
  const controlOutside = fit < 56;

  // The starting size for the name, refined downward by the measured pass below.
  //
  // This is deliberately larger than the old flat `fit * 0.12` ramp. That ramp
  // had to be small enough for the longest name on the fan at every window,
  // so every *short* name — "Email", "Website", "Branding" — was set at the
  // worst case's size on a body with room to spare. Starting at the ceiling and
  // measuring down instead sizes each name to itself: the long ones land where
  // the ramp had them, the short ones come up.
  //
  // The ceiling came down from 17 / 0.17 when the drops became bubbles. A
  // shell's whole effect is the light crossing it, and type set edge to edge
  // covers the part of the body where that reads — the reference sets its names
  // at roughly 9 % of a bubble's diameter and leaves the rest of the circle
  // alone. 0.14 of the inscribed square is 9.3 % of the diameter, which is that
  // measurement expressed in the number this code actually has.
  const maxName = Math.round(Math.min(15, Math.max(10, fit * 0.14)));

  // The floor. Below this the name is decoration rather than a label, and the
  // transform backstop in the fit pass takes over.
  //
  // 7 rather than 8 because of one measurement: with the control moved out, the
  // widest word on the fan ("Performance") is 47 px at 8 px against the 45 px
  // the compact circle allows a two-line block, and it is 41 px at 7. One step
  // is the difference between a clean two-line break and the first pass failing
  // outright and handing the name to `overflow-wrap: anywhere`. Nothing above
  // the compact tier ever reaches it.
  const minName = 7;

  // ── The fit pass ──
  //
  // Measured rather than derived. The old budget was an em table read off three
  // authored strings ("E-commerce Management" at 11.5 em, "Branding/Logo" at
  // 6.6 em) — and the labels are not authored any more: `useDrops` serves them
  // from the backend when it is up, so an admin can rename a drop to something
  // no constant here anticipated. A number measured from the DOM is right for
  // whatever string, font and locale actually rendered; a number fitted to three
  // strings is right until someone edits one.
  //
  // Runs on layout rather than in an effect because it reads and writes geometry:
  // in `useEffect` the first, too-large size is painted and then corrected, which
  // on a fan of five is five names visibly snapping down a size on open.
  //
  // `fontSize` and `width` are written straight to the nodes rather than held in
  // state. A state round-trip per step would mean dozens of renders per drop per
  // resize, and nothing else on the page depends on either value.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const name = nameRef.current;
    if (!card || !name) return;

    // The form drop in its open state is the one documented overhang on the fan —
    // four fields and a send row do not fit on a 110 px blob at any type size —
    // so there is nothing to fit it to.
    if (isForm && formOpen) {
      card.style.width = "260px";
      card.style.transform = "";
      return;
    }

    let cancelled = false;

    /**
     * The widths the block is offered, as fractions of the body's diameter,
     * widest first.
     *
     * The inscribed square — 0.707 — used to be the only one, and it is the
     * right box for a block as tall as it is wide and no other. A name is one or
     * two lines over a small control: on a wide-tier drop that is a 47 px block
     * inside a 58 px radius, where the circle will carry a box 102 px wide
     * against the square's 82. Every one of those pixels is a line break avoided
     * or a type size gained, and refusing them is why short names used to be set
     * at the longest name's size.
     *
     * A sweep rather than a solve, because the thing being solved is not
     * monotone in the way a fixed point needs. Height falls as width rises, but
     * in *steps* — a line at a time — and the allowance the circle gives falls
     * continuously, so iterating from either end walks into a corner: start
     * narrow and the block is too tall to earn the width that would shorten it;
     * start at the diameter, where the allowed height is zero, and every step
     * makes it worse. Five candidates read straight off the geometry cost five
     * layout reads and cannot get stuck.
     *
     * The list stops at 0.62 because a column narrower than that turns every
     * name into a stack of fragments, and a fragment stack that technically fits
     * is not a better outcome than the backstop.
     */
    const widths = [0.95, 0.88, 0.8, Math.SQRT1_2, 0.62];

    /**
     * Try one type size: does any of those widths put the whole block inside the
     * circle, inside `maxLines`, and — when `clean` — without a word hanging out
     * of its column?
     *
     * A centred box is inside iff its half-diagonal is within the radius. Widest
     * first, so the first width that fits is also the one that wraps the name
     * into the fewest lines.
     *
     * `scrollWidth > clientWidth` on a wrapping block means exactly one thing: a
     * word is wider than the column and is overflowing it. That is what `clean`
     * forbids, and the only thing it forbids.
     *
     * The candidate left applied when everything fails is the narrowest column
     * at the smallest size, which is what the backstop then measures.
     */
    const tryFit = (size: number, maxLines: number, clean: boolean) => {
      name.style.fontSize = `${size}px`;
      const lineBudget = size * NAME_LEADING * maxLines + 1;
      for (const k of widths) {
        const w = Math.max(16, Math.round(2 * inner * k));
        card.style.width = `${w}px`;
        const h = card.offsetHeight;
        if (
          (w / 2) ** 2 + (h / 2) ** 2 <= inner * inner &&
          name.offsetHeight <= lineBudget &&
          (!clean || name.scrollWidth <= name.clientWidth)
        ) {
          return true;
        }
      }
      return false;
    };

    /** The largest size at or below `maxName` that satisfies those three. */
    const shrink = (maxLines: number, clean: boolean) => {
      name.style.overflowWrap = clean ? "normal" : "anywhere";
      for (let size = maxName; size >= minName; size -= 1) {
        if (tryFit(size, maxLines, clean)) return true;
      }
      return false;
    };

    const solve = () => {
      // ── Four passes, in order of what a reader would rather have ──
      //
      // Each pass sweeps the type size from the ceiling down and stops at the
      // first size that satisfies it, so within a pass the type is as large as
      // the constraint allows; the passes then relax the constraint one step at
      // a time. The order is the argument.
      //
      // **Two lines, then three.** Size alone is the wrong thing to maximise:
      // the widest column the circle allows at a large size is a narrow one, so
      // maximising size hands you "E-" / "com-" / "merce" / "Management" at 13 px
      // where 11 px would have set "E-commerce" over "Management". A line count
      // is the cheap proxy for the shape of the block, and two is what a centred
      // name on a circle wants.
      //
      // **Then any number of lines**, which is the same solve without the shape
      // preference — a genuinely long name on a genuinely small body.
      //
      // **Then `overflow-wrap: anywhere`**, and only then. It is the guarantee
      // that nothing leaves the body, and it is also a licence to break a word at
      // any letter — which is what it did unprompted: "Branding/Logo" came out as
      // "Branding/Lo" over "go" on a drop with room to set it whole one size
      // down. The browser already knows the good breaks; this pass exists for the
      // case where there are none, and a word broken mid-letter is then the
      // honest outcome rather than a default.
      if (!shrink(2, true) && !shrink(3, true) && !shrink(99, true)) {
        shrink(99, false);
      }

      // The backstop, and the reason "the name cannot leave the body" is a
      // guarantee here rather than a calculation that holds for the strings we
      // happen to ship. A 54 px drop carrying a three-line name and a control
      // genuinely has no type size that fits, so the block is scaled bodily to
      // the space there is. It is the last resort and it looks like one — which
      // is the point: it is visibly cramped instead of invisibly outside.
      const half = Math.hypot(card.offsetWidth, card.offsetHeight) / 2;
      card.style.transform = half > inner ? `scale(${(inner / half).toFixed(4)})` : "";
    };

    solve();

    // Type metrics before the webfont lands are Georgia's, and Georgia is narrow
    // enough that a name can pass the fit and then fail it when DM Serif Display
    // arrives. Cheap to re-run and it happens once per session.
    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(() => {
        if (!cancelled) solve();
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    attached,
    inner,
    fit,
    maxName,
    ctrl,
    gap,
    rule,
    controlOutside,
    node.label,
    isForm,
    formOpen,
    href,
  ]);

  // The width the block is *first* laid out at. The fit pass owns it from its
  // first run — see `solveWidth` — and this is only what the very first paint
  // uses, before layout has been read.
  //
  // The form is the one thing that cannot live inside the body: four fields and
  // a send row do not fit on a 110 px blob at any type size, so it keeps the
  // explicit overhang it always had. Nothing else is allowed one.
  const cardWidth = isForm && formOpen ? 260 : Math.round(fit);

  return (
    <group ref={animRef} scale={reducedMotion && open ? 1 : 0.0001}>
      {/* The thread back to the parent. Same hairline as the chain's connectors —
          #14131A at 10 % — so a fan reads as more of the same structure rather
          than as a second kind of link. Drawn first so it disappears *into* both
          bodies instead of crossing over them. */}
      <Line
        points={[
          [0, 0, 0],
          offset,
        ]}
        color="#14131A"
        lineWidth={1}
        opacity={0.1}
        transparent
      />

      {/* ── The liquid connection ──

          Small bodies of the drop's own material, spaced along the thread across
          the gap between the parent's surface and this drop's. They are not
          decoration: the composite thresholds a *blurred* alpha field, so two
          bodies whose falloffs overlap sum past the isoline and fuse with a
          smooth neck. Dropping beads into the gap is what gives the field
          something to overlap with — the bridge is emergent, nothing draws it,
          and the parent and its drop end up reading as one body of liquid pulling
          apart rather than as two circles joined by a line.

          It is the same trick the chain's own `Connector` uses between numbered
          stops, which is why the hairline stays underneath: at 10 % it is the
          reference's own line weight, and with the beads over it, it reads as the
          thread they are running along.

          Mounted inside the animated group, so they grow and travel outward with
          the fan on the same spring the drop does. */}
      {bubbleRun && (
        <RisingBubbles
          run={bubbleRun}
          radius={placedRadius}
          hue={hue}
          seed={index}
          reducedMotion={reducedMotion}
        />
      )}

      <FluidBlob
        position={offset}
        radius={placedRadius}
        // Faster and looser than the chain's 0.20 / 8 % of radius. The parents are
        // held to the reference's measured drift because they are the composition;
        // the satellites are transient and are meant to feel lighter, so they get
        // roughly 1.5x the rate at the same relative amplitude.
        floatSpeed={0.3 + index * 0.05}
        floatAmplitude={placedRadius * 0.12}
        mouseStrength={0.09}
        // The pulse. Off entirely under `prefers-reduced-motion`, which is the
        // same rule the arrival spring follows a few lines up — a body changing
        // size on a loop is exactly the class of motion that setting is about.
        //
        // One rate for the whole fan, and alternate slots exactly half a cycle
        // apart. That pairing is what makes the clearance between any two
        // neighbouring drops invariant under the breath rather than merely
        // unlikely to collapse — the full argument is at `DROP_BREATH`, and it
        // is the reason neither of these is the seeded per-blob value.
        // ── The swell ──
        //
        // The drops carry ~18 % more radius while the fan is out, against the
        // ~12 % the parent gives up at the same moment. The two are one gesture:
        // the emphasis moves from the body to the set that came out of it.
        //
        // It rides the radius rather than this group's spring on purpose. The
        // spring scales the *group*, which holds the connector and places the
        // drop at its full offset — that is what makes a drop travel outward as
        // it grows — so pushing it past 1 would fling the whole fan further out
        // and take the solved offsets with it. The radius grows the bodies where
        // they already are.
        scale={open && !reducedMotion ? 1.18 : 1}
        // A drop is a thin thing; it gets more of the membrane lift than the
        // stops and less than the head, which is the size order.
        translucency={0.6}
        breathAmplitude={reducedMotion ? 0 : DROP_BREATH}
        breathSpeed={DROP_BREATH_RATE}
        breathPhase={index * Math.PI}
        // The soap-bubble film, and the one place on the page it is switched
        // on. The chain's spheres stay the material the reference captures were
        // measured against — they are the composition, and the measurement is
        // the only thing holding them to it — while the drops that fan off them
        // become shells: a pale specular bloom on the upper-left shoulder,
        // thin-film interference banded on the opposite edge, and a bright
        // hairline at the silhouette. See `FluidBlob`'s `bubble`.
        bubble={1}
        // All four stops from the drop's own hue now. The rim used to come from
        // the parent — see `DropHue` in `lib/satellites.ts` for the measurement
        // that ended that.
        innerColor={hue.inner}
        color={hue.mid}
        warmColor={hue.warm}
        rimColor={hue.rim}
      >
        <Html
          // Dead centre of the body, and **not** pushed toward the camera.
          //
          // It used to sit at `+0.9 r`, which is 0.67 world units in front of the
          // blob. `Html` has no `distanceFactor` here, so that offset bought no
          // size change — but it is still a different point in space, and a point
          // in front of the body does not project to the same pixel the body's
          // centre does. The displacement is `z / (z - 0.67)` on the drop's
          // distance from the optical axis, i.e. ~6 % *outward*: on a drop 400 px
          // off centre the name was pinned 25 px away from the body it names,
          // always in the direction of the nearest rim. That is the other half of
          // why the names read as falling out — the block was inside the body it
          // was measured against and beside the body it was drawn on.
          //
          // Nothing depended on the offset. The card is DOM in a portal, so it is
          // not depth-tested against the canvas, and the drops' stacking order
          // still comes from their own authored z.
          position={[0, 0, 0]}
          center
          className="pointer-events-none"
          // Under the parent card's 100: where a drop overlaps its own parent, the
          // numbered card is the thing that has to stay readable. There is no
          // third band any more, because there is no third level to give one to.
          zIndexRange={[90, 0]}
          portal={portal}
        >
          {/* Everything is in flow and centred, so `Html center` puts the block's
              own midpoint on the drop's centre — which is what puts the name on
              the body. This is why the badge's disappearance changed the layout
              rather than just deleting a div: the old card centred a *badge* and
              positioned the name out of flow beside it, precisely so a long name
              could not drag the badge off its own drop. With the badge gone there
              is nothing to protect, and the name can simply be the thing that is
              centred. */}
          <div
            ref={attachCard}
            className="relative select-none flex flex-col items-center text-center"
            style={{ opacity: 0, pointerEvents: "none", width: cardWidth }}
          >
            {/* Ink on the drop, not white — same reasoning as `SphereLabel`: the
                ground here is a pale blob, where white measures about 2:1 and ink
                measures nearly 9:1. That gap only widened when the drops took
                their own hues: the palette's cores run darker than the chain's
                near-white bodies, and white type would have gone from thin to
                unreadable on the periwinkle and the coral. */}
            <div
              ref={nameRef}
              // Full-strength ink, and it went back to full when the palette
              // was re-solved against the reference. At 80 % it was a weight
              // choice that suited pale pastel bodies; against the deepest of
              // the new ones it measures 4.46:1, which is under AA. Restored,
              // the same drop measures 5.7:1 and the palest 7.6:1.
              className="font-serif text-brand-text"
              style={{
                // ── The two properties that stop the name leaving sideways ──
                //
                // This is a flex item, and a flex item's `min-width` defaults to
                // `auto`, i.e. to its *min-content* width — the longest word.
                // "Performance" at 10 px is 59 px, so on a 35 px block the name
                // simply grew to 59 px and hung 12 px out of each side of the
                // body, whatever width the card was given and whatever the fit
                // pass measured. The pass could not see it either: the name's own
                // `scrollWidth` matched its `clientWidth`, because the element had
                // been allowed to *become* 59 px rather than to overflow.
                //
                // Pinned to the column, the overflow becomes visible to the pass
                // as well as invisible on screen, which is what makes the two-pass
                // solve above measure anything real.
                minWidth: 0,
                width: "100%",
                // The starting size. The fit pass above rewrites this node's
                // `fontSize` directly, and React leaves it alone on re-render
                // unless this number itself changed.
                fontSize: maxName,
                lineHeight: NAME_LEADING,
                // A hair of tracking, which is what a display face wants when it
                // is dropped from its poster size to 13 px — the counters close
                // up otherwise and "Management" turns into a texture.
                letterSpacing: "0.012em",
                // Hyphenation, which only ever fires when a word does not fit
                // its column. On the wide tier no name reaches that state, so
                // this changes nothing there. On the compact tier every long
                // name does, and the choice is between a hyphenated break and
                // `overflow-wrap: anywhere` cutting "Marketing" into "Marketin"
                // and "g" — one of those is typography and the other is damage.
                //
                // Deliberately no `lang` attribute: the hyphenation dictionary
                // comes from the inherited language, which is the document's,
                // which is the one the copy is actually in. Pinning it to "en"
                // here would hyphenate translated labels against English rules.
                hyphens: "auto",
                // `balance` is why this is worth doing at all on a circle: it
                // splits "Social Media Management" into two lines of even length
                // instead of one long line and one orphan, and an even pair of
                // lines is a *rectangle*, which is the shape that fits inside a
                // circle best. The ragged pair is what used to hang a single word
                // out past the rim.
                textWrap: "balance",
                // Lifts ink off the saturated part of the body. The palette's
                // cores drift under the type as the blob's envelope moves, so
                // this is a constant rather than a measured contrast fix: it is
                // half a pixel of white directly under the glyph, which reads as
                // the type sitting *on* the surface instead of printed through
                // it.
                textShadow: "0 0.5px 1.5px rgba(255,255,255,0.6)",
                // The starting value only. The fit pass owns this property
                // from its first run — it is what the two passes switch between
                // — and `anywhere` is where it ends up on a body too small for
                // any clean break. See the pass for the argument.
                overflowWrap: "normal",
              }}
            >
              {node.label}
            </div>

            {/* The hairline. Nothing but punctuation between the name and its
                control — but it is what turns two stacked things into a set, and
                a centred rule is the one rule shape that agrees with a circle.
                Dropped entirely where the body cannot spare the height. */}
            {rule && (
              <div
                className="bg-brand-text/20"
                style={{ width: Math.round(fit * 0.3), height: 1, marginTop: gap }}
              />
            )}

            {/* The one drop that carries a form. The detail line that used to sit
                here is gone: a two- or three-line caption under every name turned
                the fan into a wall of copy, and the drop's claim is made properly
                on its own page. What is left on the canvas is the name. The form
                stays, because that is a conversation and not a caption. */}
            {isForm && (
              <div
                className="overflow-hidden text-brand-text/70"
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.4,
                  // 340 — four controls, a send row and enough slack for a
                  // per-field error. `overflow: hidden` is what makes the height
                  // animate, and a tighter cap silently guillotines the last line.
                  maxHeight: formOpen ? 340 : 0,
                  opacity: formOpen ? 1 : 0,
                  transition: "max-height 320ms ease, opacity 240ms ease",
                }}
              >
                <ContactForm source={node.id} />
              </div>
            )}

            {(href || isForm) && (
              <div
                className={
                  controlOutside
                    ? "absolute left-1/2 flex items-center"
                    : "flex items-center"
                }
                style={
                  controlOutside
                    ? {
                        gap: Math.max(4, Math.round(ctrl * 0.22)),
                        // The card is centred on the body, so its own 50 % *is*
                        // the body's centre — which makes this one number the
                        // control's distance from that centre in body radii. At
                        // 0.86 the face straddles the rim and hangs below it,
                        // which is what keeps it reading as this drop's control
                        // rather than as a bead that happens to be nearby.
                        top: `calc(50% + ${Math.round(bodyRadius * 0.86)}px)`,
                        transform: "translateX(-50%)",
                      }
                    : { gap: Math.max(4, Math.round(ctrl * 0.22)), marginTop: gap }
                }
              >
                {/* The form drop needs a control of its own, because its share
                    control is spoken for: it goes to the contact page, where the
                    long version of the form lives, and the form on the drop is a
                    second thing to open. Every other drop has exactly one. */}
                {isForm && (
                  <DropControl
                    size={ctrl}
                    as="button"
                    label={formOpen ? `Close the ${node.label}` : `Open the ${node.label}`}
                    expanded={formOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormOpen((v) => !v);
                    }}
                    filled
                  >
                    <path d="M4 4h16v12H7l-3 3z" />
                  </DropControl>
                )}

                {/* This drop's share control, and it is a real anchor.
                    `next/link` renders an `<a href>`, which is what makes the
                    gesture honest: the control is called share, so it has to
                    survive a middle click, a right-click-copy and a long-press —
                    all of which a button that pushed the route would have
                    swallowed. It sits inside the canvas, but drei's `Html`
                    portals it into ordinary DOM and R3F bridges the router
                    context across its reconciler, so the link is a link.

                    `stopPropagation` keeps the click off the blob underneath,
                    which registers pointer interactions of its own. */}
                {href && (
                  <DropControl
                    size={ctrl}
                    as="link"
                    href={href}
                    label={`Open the ${node.label} page`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </DropControl>
                )}
              </div>
            )}
          </div>
        </Html>
      </FluidBlob>
    </group>
  );
}

/** Seconds for one bubble to rise from a drop into its parent. */
const BUBBLE_TRIP = 4.2;

/** Fraction of a trip spent budding off the drop, and again being absorbed. */
const BUBBLE_EDGE = 0.16;

/**
 * Small bubbles that bud off a drop, rise its thread breathing, and merge into
 * the parent.
 *
 * The fan's version of the chain `Connector`'s rising beads. Each bubble rides a
 * wrapper group that carries the rise and the bud/merge scale, so the blob inside
 * keeps its own float, parallax and breath. The scale ramps happen while the
 * bubble is still inside a silhouette, which is what lets the composite's field
 * merge draw the neck instead of the bubble popping in or out.
 *
 * Rendered inside the drop's animated group, so they open and close with the fan
 * on the same spring. Under reduced motion they hold still, evenly spaced.
 */
function RisingBubbles({
  run,
  radius,
  hue,
  seed,
  reducedMotion,
}: {
  run: { start: THREE.Vector3; end: THREE.Vector3; count: number };
  /** The drop's own radius; bubble sizes are fractions of it. */
  radius: number;
  hue: DropHue;
  /** Offsets the phase per drop so the fan's threads are not in lockstep. */
  seed: number;
  reducedMotion: boolean;
}) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const clock = useRef(seed * 1.37);

  const bubbles = useMemo(
    () =>
      Array.from({ length: run.count }, (_, k) => {
        const u0 = (k + 0.5) / run.count;
        const p = run.start.clone().lerp(run.end, u0);
        return {
          u0,
          anchor: p.toArray() as [number, number, number],
          r: radius * [0.2, 0.24, 0.18][k % 3],
        };
      }),
    [run, radius]
  );

  useFrame(() => {
    if (reducedMotion) return;
    // Normalised frame time, so a restored tab does not jump a whole trip.
    clock.current += frame.d / 60;
    const phase = clock.current / BUBBLE_TRIP;
    bubbles.forEach((b, k) => {
      const g = groups.current[k];
      if (!g) return;
      const u = (b.u0 + phase) % 1;
      const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      g.position.lerpVectors(run.start, run.end, e);
      g.position.x -= b.anchor[0];
      g.position.y -= b.anchor[1];
      g.position.z -= b.anchor[2];
      const s = Math.max(0.001, Math.min(1, u / BUBBLE_EDGE, (1 - u) / BUBBLE_EDGE));
      g.scale.setScalar(s * s * (3 - 2 * s));
    });
  });

  return (
    <>
      {bubbles.map((b, k) => (
        <group
          key={k}
          ref={(g) => {
            groups.current[k] = g;
          }}
        >
          <FluidBlob
            position={b.anchor}
            radius={b.r}
            floatSpeed={0.35 + k * 0.08}
            floatAmplitude={b.r * 0.18}
            mouseStrength={0.14}
            // A visible breath: ±22 %, rates close but not equal so the bubbles
            // on one thread drift in and out of step.
            breathAmplitude={0.22}
            breathSpeed={1.4 + k * 0.2}
            breathPhase={seed + k * 2.1}
            bubble={0.7}
            translucency={0.55}
            innerColor={hue.inner}
            color={hue.mid}
            warmColor={hue.warm}
            rimColor={hue.rim}
          />
        </group>
      ))}
    </>
  );
}

/**
 * One round control on a drop — the share link, or the form drop's own toggle.
 *
 * Extracted because there are two of them and they now take a size, which is the
 * part worth explaining. The face scales with the body it sits on: a flat 28 px
 * is a quarter of a wide-tier drop and nearly half a compact one, and at the
 * compact end it was taking the height the name needed.
 *
 * The **hit area does not scale**. `ring` is a transparent child with a negative
 * inset, which takes the target back out to 44 × 44 however small the face is —
 * clicks on it bubble to the control, and because it is a child rather than
 * padding, the flex centring and the border stay exactly where they were. That
 * split is the whole point: the guidance is about the target, the composition is
 * about the face, and they do not have to be the same rectangle.
 */
function DropControl({
  size,
  as,
  href,
  label,
  expanded,
  onClick,
  filled,
  children,
}: {
  size: number;
  as: "button" | "link";
  href?: string;
  label: string;
  expanded?: boolean;
  onClick: (e: React.MouseEvent) => void;
  /** The form toggle carries a ground of its own, so it reads as the primary. */
  filled?: boolean;
  /** The glyph, on a 24-unit viewBox. */
  children: React.ReactNode;
}) {
  const ring = Math.max(0, Math.round((44 - size) / 2));

  const className = [
    "pointer-events-auto relative rounded-full border border-brand-text/25",
    "flex items-center justify-center cursor-pointer transition-colors",
    "text-brand-text/80 hover:text-brand-text",
    filled
      ? "bg-white/50 backdrop-blur-[2px] hover:bg-white/75"
      : "hover:bg-white/60",
  ].join(" ");

  const inner = (
    <>
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{ inset: -ring }}
      />
      <svg
        // 0.4 of the face, which is the proportion the 11 px glyph had inside
        // the old 28 px button — the one number worth carrying over from it.
        width={Math.round(size * 0.4)}
        height={Math.round(size * 0.4)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </>
  );

  if (as === "link" && href) {
    return (
      <Link
        href={href}
        aria-label={label}
        onClick={onClick}
        className={className}
        style={{ width: size, height: size }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
      className={className}
      style={{ width: size, height: size }}
    >
      {inner}
    </button>
  );
}
