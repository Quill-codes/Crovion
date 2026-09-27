"use client";

import { useRef } from "react";
import {
  useScroll,
  useTransform,
  useSpring,
  type MotionValue,
} from "framer-motion";

interface ScrollProgressOptions {
  offset?: [string, string];
  springConfig?: { damping: number; stiffness: number };
}

interface ScrollProgressReturn {
  progress: MotionValue<number>;
  smoothProgress: MotionValue<number>;
  scrollYProgress: MotionValue<number>;
  ref: React.RefObject<HTMLElement | null>;
}

export function useScrollProgress(
  options: ScrollProgressOptions = {}
): ScrollProgressReturn {
  const {
    offset = ["start end", "end start"],
    springConfig = { damping: 30, stiffness: 100 },
  } = options;

  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: offset as any,
  });

  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const smoothProgress = useSpring(progress, springConfig);

  return { progress, smoothProgress, scrollYProgress, ref };
}
