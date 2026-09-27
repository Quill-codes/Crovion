"use client";

import { useEffect, useRef, type RefObject } from "react";
import { animate, stagger } from "animejs";

interface AnimeEntranceOptions {
  targets?: string; // CSS selector relative to the container ref
  translateY?: number[];
  opacity?: number[];
  delay?: number;
  staggerDelay?: number;
  duration?: number;
  easing?: string;
  once?: boolean; // Only trigger once (default true)
  threshold?: number; // IntersectionObserver threshold (default 0.2)
}

export function useAnimeEntrance(
  options: AnimeEntranceOptions = {}
): RefObject<HTMLElement | null> {
  const {
    targets = ".anime-target",
    translateY = [40, 0],
    opacity = [0, 1],
    delay = 0,
    staggerDelay = 80,
    duration = 900,
    easing = "easeOutCubic",
    once = true,
    threshold = 0.2,
  } = options;

  const containerRef = useRef<HTMLElement>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !(once && hasTriggered.current)) {
            hasTriggered.current = true;

            const elements = container.querySelectorAll(targets);
            if (elements.length === 0) return;

            animate(elements, {
              translateY,
              opacity,
              delay: stagger(staggerDelay, { start: delay }),
              duration,
              easing,
            });
          }
        });
      },
      { threshold }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [targets, translateY, opacity, delay, staggerDelay, duration, easing, once, threshold]);

  return containerRef;
}
