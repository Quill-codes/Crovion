"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";

interface LenisContextValue {
  lenis: Lenis | null;
  scrollTo: (target: string | number | HTMLElement) => void;
}

const LenisContext = createContext<LenisContextValue>({
  lenis: null,
  scrollTo: () => {},
});

export function useLenis() {
  return useContext(LenisContext);
}

export function LenisProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const reqRef = useRef<number>(0);

  useEffect(() => {
    // Lenis keeps its own scroll position and animates the native one toward it.
    // That makes any scroll it did not perform itself a desync: the next wheel
    // event animates from Lenis's stale value, and the whole page — including
    // `position: sticky` children like the pinned hero — visibly slides through
    // the viewport before settling. It reads as the hero text drifting.
    //
    // Browser scroll restoration is the common trigger. Reload part-way down the
    // page and the browser restores `scrollY` natively while Lenis initialises at
    // 0, so the first scroll lurches. Own the restore instead, and start Lenis
    // and the document from the same place.
    const priorRestoration = history.scrollRestoration;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    const instance = new Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
    });

    setLenis(instance);

    function raf(time: number) {
      instance.raf(time);
      reqRef.current = requestAnimationFrame(raf);
    }

    reqRef.current = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(reqRef.current);
      instance.destroy();
      if ("scrollRestoration" in history) {
        history.scrollRestoration = priorRestoration;
      }
    };
  }, []);

  const scrollTo = (target: string | number | HTMLElement) => {
    if (lenis) {
      lenis.scrollTo(target, { duration: 1.4 });
    }
  };

  return (
    <LenisContext.Provider value={{ lenis, scrollTo }}>
      {children}
    </LenisContext.Provider>
  );
}
