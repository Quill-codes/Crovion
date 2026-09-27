"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * One element's arrival on scroll.
 *
 * The rest of the site reveals through `useAnimeEntrance`, which observes a
 * container and staggers everything inside it carrying a marker class. That
 * shape does not fit here: these pages are long, the blocks are far apart, and a
 * container-level observer either fires while most of its children are still
 * two screens down or has to be repeated per block until it is the same thing
 * written less directly. Per-element is what this page actually wants, and
 * framer-motion — already a dependency, already how the navbar and the CTA move
 * — expresses it in one prop.
 *
 * `once` throughout. Copy that re-animates every time it re-enters the viewport
 * is copy that fights being re-read.
 *
 * Under reduced motion `initial` is `false`, which means framer renders the
 * element at its animate state with no transition and never applies the hidden
 * style at all — not a zero-duration tween, which still writes a transform.
 */
export default function Reveal({
  children,
  delay = 0,
  onMount = false,
  className,
}: {
  children: ReactNode;
  delay?: number;
  /**
   * Play on mount rather than on entering the viewport. For the hero.
   *
   * Above-the-fold copy must not be gated on an IntersectionObserver. It is
   * already on screen, so there is no arrival to wait for — and gating it means
   * the first thing the reader sees depends on an observer callback landing,
   * which on a cold load competes with two WebGL contexts compiling shaders on
   * the same main thread. Observed exactly that during Phase 1: the title,
   * promise and paragraph were still at zero opacity three seconds in, on a page
   * that had never been scrolled.
   *
   * Below the fold `whileInView` is right and stays.
   */
  onMount?: boolean;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const shown = { opacity: 1, y: 0 };

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 26 }}
      animate={onMount ? shown : undefined}
      whileInView={onMount ? undefined : shown}
      // 0.25 rather than a sliver: these are text blocks, and firing on the
      // first pixel means the reveal has finished before the block is readable.
      viewport={onMount ? undefined : { once: true, amount: 0.25 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
