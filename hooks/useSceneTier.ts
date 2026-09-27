"use client";

import { useSyncExternalStore } from "react";
import { COMPACT, WIDE, type SceneTier } from "@/lib/scene/tier";

/**
 * Tailwind's `md` boundary, so the 3D composition and the CSS type ladder switch
 * at the same instant. A tier boundary the type does not share would give a
 * window width where the phone's chain carries the desktop's watermark.
 */
const QUERY = "(max-width: 767px)";

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

const getSnapshot = () => (window.matchMedia(QUERY).matches ? COMPACT : WIDE);

/**
 * Server render assumes the wide tier and hydration corrects it.
 *
 * On a phone that means the hero is laid out at 700vh for one commit before it
 * becomes 528vh. It is invisible: `LoadingScreen`'s curtain is over the page for
 * the whole of that window, and the height it corrects to is shorter, so nothing
 * the reader can see reflows under them.
 */
const getServerSnapshot = () => WIDE;

/**
 * Which composition the hero should be built from — see `lib/scene/tier.ts`.
 *
 * Deliberately a **width** media query rather than the R3F viewport, and the
 * distinction is load-bearing:
 *
 *   • `useThree(state => state.viewport)` is right for `IntroSeed`, whose radius
 *     is a continuous function of the frame. The chain's geometry is discrete —
 *     bodies do not slide toward each other as a URL bar retracts — so driving
 *     it from a continuously changing viewport would animate the composition
 *     during a scroll.
 *   • A media query, not `innerWidth`, so nothing reads a stale value mid
 *     URL-bar transition and there is no resize listener to keep.
 *   • Width, not aspect, so a desktop window dragged narrow does not cross the
 *     boundary and remount the chain.
 *
 * Same shape as `usePrefersReducedMotion`, deliberately: one pattern for "the
 * environment changed under us and the scene should follow".
 */
export function useSceneTier(): SceneTier {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
