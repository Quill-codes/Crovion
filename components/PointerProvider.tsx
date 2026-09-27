"use client";

import { createContext, useContext, useEffect, useMemo, useRef, ReactNode } from "react";

interface PointerState {
  /** Normalised device coordinates, -1..1, y up. */
  x: number;
  y: number;
  /**
   * Raw client pixels, kept alongside the NDC pair.
   *
   * NDC is normalised against the *window*, which is only the same thing as
   * canvas space while a canvas happens to fill the viewport. Consumers that map
   * the pointer onto a specific element — the fluid pipeline's trail buffer —
   * need the unnormalised position so they can divide by that element's own box.
   */
  clientX: number;
  clientY: number;
  /** False once the pointer leaves the window, or after a touch ends. */
  inside: boolean;
  /** A button (or finger) is currently held down. */
  down: boolean;
  /**
   * Increments on every press. Frame loops can't listen for events, so they
   * detect a fresh click by comparing this against the value they last saw.
   */
  pressCount: number;
  /** Touch / pen rather than mouse — there is no hover on these. */
  coarse: boolean;
}

const PointerContext = createContext<React.RefObject<PointerState>>({
  current: {
    x: 0,
    y: 0,
    clientX: 0,
    clientY: 0,
    inside: false,
    down: false,
    pressCount: 0,
    coarse: false,
  },
});

export function usePointer() {
  return useContext(PointerContext);
}

export function PointerProvider({ children }: { children: ReactNode }) {
  const pointerRef = useRef<PointerState>({
    x: 0,
    y: 0,
    clientX: 0,
    clientY: 0,
    inside: false,
    down: false,
    pressCount: 0,
    coarse: false,
  });

  useEffect(() => {
    const state = pointerRef.current;
    state.coarse = window.matchMedia("(pointer: coarse)").matches;

    const track = (clientX: number, clientY: number) => {
      state.x = (clientX / window.innerWidth) * 2 - 1;
      state.y = -(clientY / window.innerHeight) * 2 + 1;
      state.clientX = clientX;
      state.clientY = clientY;
      state.inside = true;
    };

    const handlePointerMove = (e: PointerEvent) => {
      track(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      track(touch.clientX, touch.clientY);
    };

    const handlePointerDown = (e: PointerEvent) => {
      track(e.clientX, e.clientY);
      state.down = true;
      state.pressCount += 1;
    };

    const handlePointerUp = (e: PointerEvent) => {
      state.down = false;
      // Lifting a finger ends the interaction outright — unlike a mouse, a touch
      // pointer has no resting position to keep hovering from.
      if (e.pointerType !== "mouse") state.inside = false;
    };

    // Leaving the viewport has to clear `inside`, otherwise the last known
    // position keeps deforming whatever it was over indefinitely.
    const handleLeave = () => {
      state.inside = false;
      state.down = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.addEventListener("mouseleave", handleLeave);
    window.addEventListener("blur", handleLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("mouseleave", handleLeave);
      window.removeEventListener("blur", handleLeave);
    };
  }, []);

  // The context value is a stable ref, so consumers never re-render on movement.
  const value = useMemo(() => pointerRef, []);

  return <PointerContext.Provider value={value}>{children}</PointerContext.Provider>;
}
