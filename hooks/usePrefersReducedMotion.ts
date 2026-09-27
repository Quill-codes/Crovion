"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

/** Server render and first paint assume motion is fine, then hydration corrects it. */
const getServerSnapshot = () => false;

/**
 * Tracks `prefers-reduced-motion`, live — the user can flip the OS setting while
 * the page is open and the decorative motion should react without a reload.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
