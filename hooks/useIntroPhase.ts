"use client";

import { useSyncExternalStore } from "react";
import {
  getIntroPhase,
  subscribeIntro,
  type IntroPhase,
} from "@/lib/intro/director";

/**
 * The intro director's current phase, as React state.
 *
 * Note what this deliberately does *not* expose: `introClock.t`. The clock ticks
 * at display rate and nothing in the DOM tree needs to see it — the curtain, the
 * headline and the CTA are each a tween that only needs to know *when to start*,
 * which is a phase change, and there are exactly three of those in the whole
 * sequence. Anything that genuinely needs per-frame intro time is inside the
 * canvas and reads `introClock` directly from the pipeline's frame callback.
 *
 * `useSyncExternalStore` rather than an effect-and-state pair because the
 * director is a module singleton that can — and on a warm cache routinely does —
 * leave LOADING before this component's effects have run. The store form reads
 * the current value during render, so a subscriber that mounts late still sees
 * the phase it actually missed rather than the initial one.
 */
export function useIntroPhase(): IntroPhase {
  return useSyncExternalStore(
    subscribeIntro,
    getIntroPhase,
    // Server snapshot. The intro has not started during SSR by definition, and
    // returning the live value here would risk a hydration mismatch on a fast
    // client that has already advanced.
    () => "LOADING" as IntroPhase
  );
}
