"use client";

import { useEffect, useLayoutEffect } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import LoadingScreen from "@/components/LoadingScreen";
import SmoothScroll from "@/components/SmoothScroll";
import SilkAuroraBackground from "@/components/SilkAuroraBackground";
import FooterSection from "@/components/FooterSection";
import { startIntro } from "@/lib/intro/director";
import { hydrateContent } from "@/lib/content/store";

export default function Home() {
  /**
   * Start the one clock the whole intro is scheduled off.
   *
   * A layout effect, and it has to be: the readiness gate's floor is measured
   * from here, and the fluid pipeline can report its first frame before a passive
   * effect on this component would have run. `startIntro` is idempotent, so the
   * double mount React StrictMode performs in development is a no-op rather than
   * a restarted clock.
   *
   * The `loaded` boolean this replaces was never read by anything — the curtain
   * called back into it, it set state, and no consumer looked. The phase machine
   * carries that state properly now, and the components that care subscribe to it
   * directly rather than being handed a prop from here.
   */
  useLayoutEffect(() => {
    startIntro();
  }, []);

  /**
   * Pull the editable copy from the content backend, if one is running.
   *
   * A passive effect, unlike the intro clock above, because nothing about the
   * first paint waits on it: the page renders its built-in copy immediately and
   * swaps in whatever the service returns when it arrives. `hydrateContent`
   * swallows its own failures and is idempotent, so an absent backend and
   * StrictMode's double mount are both no-ops.
   */
  useEffect(() => {
    hydrateContent();
  }, []);

  return (
    <>
      <LoadingScreen />

      {/* Fixed WebGL silk background — always behind everything.
          Light, iridescent paper: the two off-whites are the ground, the two
          pastels are what the refracted veils are tinted toward. */}
      <SilkAuroraBackground
        baseColor="#F5F3F2"
        midColor="#EBE9EE"
        sheenColor="#D8D2F2"
        accentColor="#CFE0F2"
        speed={0.8}
        intensity={0.9}
        grain={0.5}
        vignette={0.7}
        mouseInfluence={0.7}
      />

      <SmoothScroll>
        {/* The page is the sphere journey, closed by the footer plate.
            About / Work remain removed and are parked intact in
            backup/removed-sections/ rather than deleted, because components/ is
            untracked and git could not bring them back.

            The footer was rebuilt rather than restored from that folder: the
            parked version was a light-ground "LET'S TALK" contact block, and
            what was asked for is the reference's full-bleed colour plate. The
            old file is left where it is. */}
        <main className="relative z-10 min-h-screen">
          <Navbar />
          <Hero />
          <FooterSection />
        </main>
      </SmoothScroll>
    </>
  );
}
