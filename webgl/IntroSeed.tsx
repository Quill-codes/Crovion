"use client";

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import FluidBlob from "@/components/FluidBlob";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useIntroPhase } from "@/hooks/useIntroPhase";
import { INTRO_PARAMS, introSeedEnabled } from "./config/intro";

/**
 * The body the loading curtain hands off to.
 *
 * At `t = 0` this is a screen-filling drop in the curtain's own colour, sitting
 * at the exact centre of the hero canvas and already turning. Over the next
 * 1.4 s it collapses to a point, unwinding as it goes; at 0.8 s the chain is born
 * out of that point and flies outward; at 1.7 s the seed is snuffed — *after* the
 * chain is already halfway out of it.
 *
 * That overlap is the whole design. Extinguishing the seed before the chain has
 * emerged turns a birth into a cut.
 *
 * ### Why this is an ordinary `FluidBlob`
 *
 * Because then the merge is free. The seed sits on `FLUID_LAYER` like every
 * other blob, so it goes into the same blob target, through the same 31-tap
 * Gaussian, over the same `α × threshold − cutoff` isoline and out through the
 * same composite. The seed and the chain are not two layers that swap — they are
 * one liquid that changes shape, and there is no frame in which one stops and
 * the other starts.
 *
 * Nothing here adds a render target, a pass or a frame callback.
 *
 * ### Placement
 *
 * A direct child of the canvas rather than of the sphere chain's group. The
 * chain's group carries the scroll lift, the pointer parallax and its own slow
 * drift; the seed has to sit on the *canvas* centre, which is the world origin
 * for this camera, and stay there.
 */
export default function IntroSeed() {
  const reducedMotion = usePrefersReducedMotion();
  const phase = useIntroPhase();

  // World units spanned by the canvas at the composition plane, for this camera.
  const viewport = useThree((state) => state.viewport);

  /**
   * Radius that covers the frame, quantised.
   *
   * This is a perspective problem, not a flat one, and getting it wrong is not
   * subtle. The obvious answer — the half-diagonal of the viewport at the
   * composition plane — is far too big: at this camera it lands the radius
   * *beyond* the camera's own distance, which puts the eye inside the sphere.
   * From in there every front face is behind the near plane and every back face
   * is culled, so the seed renders as nothing at all.
   *
   * What actually has to hold is angular. A sphere of radius R at distance d
   * subtends a half-angle of `asin(R / d)`, and it covers the frame when that
   * reaches the angle to the corner, `atan(halfDiag / d)`. Solving for R gives
   * the tangent sphere below — the smallest one whose silhouette touches all four
   * corners — which for a 40° camera comes out at roughly 0.61 d, comfortably
   * clear of the eye.
   *
   * The clamp is the guard rail rather than the mechanism: whatever `coverage` is
   * set to, the body may never grow far enough to engulf the camera again.
   *
   * Quantised to a tenth of a world unit because `radius` is baked into
   * `sphereGeometry`'s args, so a value that moved with every sub-pixel of a
   * resize would rebuild a 128² sphere mid-drag. A tenth of a unit is ~11 screen
   * pixels at this camera, on a body whose whole job is to be bigger than the
   * screen.
   */
  const radius = useMemo(() => {
    const halfDiag = 0.5 * Math.hypot(viewport.width, viewport.height);
    const d = Math.max(viewport.distance, 1e-3);
    const tangent = (halfDiag * d) / Math.hypot(d, halfDiag);
    const r = Math.min(tangent * INTRO_PARAMS.coverage, d * 0.75);
    return Math.round(r * 10) / 10;
  }, [viewport.width, viewport.height, viewport.distance]);

  // Unmounted rather than left dormant. It is invisible from 1.7 s and SETTLED
  // lands at 2.6 s, so this frees a 128² sphere and its shader instance a beat
  // after the last frame that could possibly have needed it — and well clear of
  // the reveal, so the unmount's own re-render never lands inside the animation.
  if (phase === "SETTLED") return null;
  if (!introSeedEnabled(reducedMotion)) return null;

  return (
    <FluidBlob
      introSeed
      position={[0, 0, 0]}
      radius={radius}
      // The palette the colour bridge resolves *to*: the head of the chain, which
      // is the body that will be closest to where the seed collapsed. The bridge
      // starts on `INTRO_SEED_TINT` — the curtain's own colour — and lerps here
      // across the collapse.
      innerColor="#9A6BEE"
      color="#C4A9F7"
      warmColor="#F0D6EE"
      rimColor="#F8F3FF"
      // Dead still, on both counts. A body this size drifting even a fraction of
      // its own radius sweeps a large part of the frame, and the pointer parallax
      // would let the cursor shove the entire screen around during the one moment
      // of the page the viewer has no reason to be pointing at anything. All the
      // motion the seed needs is the collapse, the unwind and its own silhouette.
      floatAmplitude={0}
      mouseStrength={0}
      // Below `FluidBlob`'s own 160 for a body this large. The silhouette wobble
      // lives on the outline, and 128² already puts the seed's equator segments
      // well under a screen pixel — while this is the single most expensive draw
      // on the page, being both full-screen and fully tessellated.
      segments={128}
    />
  );
}
