"use client";

import { useEffect, useRef } from "react";
import {
  useMotionValue,
  useSpring,
  type MotionValue,
} from "framer-motion";

interface MouseParallaxOptions {
  strength?: number;
  damping?: number;
  stiffness?: number;
}

interface MouseParallaxReturn {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rawX: MotionValue<number>;
  rawY: MotionValue<number>;
}

export function useMouseParallax(
  options: MouseParallaxOptions = {}
): MouseParallaxReturn {
  const { strength = 0.05, damping = 25, stiffness = 100 } = options;

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const x = useSpring(rawX, { damping, stiffness });
  const y = useSpring(rawY, { damping, stiffness });

  const strengthRef = useRef(strength);
  strengthRef.current = strength;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = (e.clientX / window.innerWidth - 0.5) * 2;
      const centerY = (e.clientY / window.innerHeight - 0.5) * 2;
      rawX.set(centerX * strengthRef.current * 100);
      rawY.set(centerY * strengthRef.current * 100);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [rawX, rawY]);

  return { x, y, rawX, rawY };
}
