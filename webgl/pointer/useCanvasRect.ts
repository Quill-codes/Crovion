"use client";

import { useCallback, useEffect, useRef } from "react";

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The canvas's position in client coordinates, read lazily.
 *
 * The pointer arrives in client pixels and the brush needs canvas UV, so the
 * canvas's own box is needed every frame. `getBoundingClientRect` forces a layout
 * flush, and calling it unconditionally inside the render loop is the classic way
 * to turn a 1 ms frame into a 4 ms one on a page that also runs smooth scrolling.
 *
 * The box only moves when the page resizes or scrolls, so both are watched and
 * the measurement is deferred until the next reader asks for it. Steady state on
 * a still page is zero layout reads; during a scroll it is one per frame, which
 * is exactly the minimum required to stay correct while the hero's sticky
 * container unpins.
 *
 * Returned as a getter rather than a value because it is consumed from a frame
 * loop, where a React state update per scroll event would be absurd.
 */
export function useCanvasRect(element: HTMLElement | null): () => CanvasRect {
  const rect = useRef<CanvasRect>({ left: 0, top: 0, width: 1, height: 1 });
  const stale = useRef(true);

  useEffect(() => {
    if (!element) return;

    stale.current = true;
    const invalidate = () => {
      stale.current = true;
    };

    window.addEventListener("resize", invalidate);
    // Captured, because the page may scroll a nested container rather than the
    // document — a scroll event on any ancestor can move the canvas.
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });

    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate, { capture: true });
    };
  }, [element]);

  return useCallback(() => {
    if (element && stale.current) {
      const box = element.getBoundingClientRect();
      rect.current.left = box.left;
      rect.current.top = box.top;
      rect.current.width = box.width || 1;
      rect.current.height = box.height || 1;
      stale.current = false;
    }
    return rect.current;
  }, [element]);
}
