"use client";

import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import FluidScene from "./FluidScene";
import { useSceneTier } from "@/hooks/useSceneTier";

/**
 * Device-pixel-ratio ceiling per tier.
 *
 * ⚠️ **The compact figure is provisional and unmeasured.** Nobody has profiled
 * this pipeline on a phone: per frame it pays a blob pass at buffer resolution,
 * two blur passes at `blurScale` 0.4 with 17 fetches each, two trail passes at
 * `trailScale` 0.35 and a full-resolution composite — while `SilkAuroraBackground`
 * runs a second fragment-heavy shader in its own context at dpr 2. 1.25 is a
 * deliberately cautious step down from the wide tier's 1.5 (≈31 % fewer
 * fragments) rather than a number derived from a budget.
 *
 * Tune this against a real device before trusting it, and if it is not enough the
 * next levers are `QUALITY.blurScale` and dropping to one WebGL context on the
 * compact tier — not pushing this lower, which starts to show on the blob edges.
 */
const DPR: Record<"wide" | "compact", [number, number]> = {
  wide: [1, 1.5],
  compact: [1, 1.25],
};

interface FluidCanvasProps {
  children: ReactNode;
}

/**
 * The canvas that owns the fluid pipeline.
 *
 * Everything the renderer needs configured lives here rather than at the call
 * site, so this component can be lifted into the root layout later without
 * dragging renderer settings through the hero. That move — mounting the canvas
 * outside the routed content so it survives navigation — is the structural point
 * of the architecture, but it is deliberately *not* made yet: hoisting it means
 * moving the whole hero scene with it, and this phase is only proving the pass
 * chain.
 *
 * Renderer settings are carried over from the hero verbatim.
 *
 * ── `touch-action: pan-y`, and why it is not `none` ──
 *
 * R3F recommends `none`, and it is right whenever a canvas owns a drag gesture:
 * the browser must not steal the pointer stream halfway through one. This canvas
 * owns no drag. Its pointer input is a *hover field* — `PointerProvider` tracks
 * position and `PointerTrailPass` paints a decaying trail — and nothing in it
 * needs a gesture the browser would otherwise claim.
 *
 * What `none` did cost is severe. R3F puts this style on its container, which is
 * `absolute inset-0` inside the hero's pinned child, so it covers the entire
 * viewport for the whole 700vh of the hero. Lenis runs `syncTouch: false` — the
 * default, and `useLenis` does not override it — so Lenis smooths the *wheel* and
 * leaves touch scrolling to the browser's own panning. `touch-action: none` tells
 * the browser not to pan for touches beginning on the element. Between them: a
 * finger drag anywhere on the hero scrolled nothing, on the only input a phone
 * has.
 *
 * `pan-y` returns vertical panning to the browser and keeps everything else,
 * which is the exact split this canvas wants.
 */
export default function FluidCanvas({ children }: FluidCanvasProps) {
  const tier = useSceneTier();

  return (
    <Canvas
      dpr={DPR[tier.id]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ touchAction: "pan-y", background: "transparent" }}
    >
      {/*
        Mounted first for readability; ordering is actually guaranteed by its
        frame priority, which runs it after every default-priority callback in
        the tree has finished writing its uniforms.
      */}
      <FluidScene />
      {children}
    </Canvas>
  );
}
