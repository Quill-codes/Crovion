"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { motion } from "framer-motion";
import FluidBlob from "@/components/FluidBlob";
import { PointerProvider } from "@/components/PointerProvider";
import {
  SphereInteractionDriver,
  SphereInteractionProvider,
} from "@/components/SphereInteraction";
import FluidCanvas from "@/webgl/FluidCanvas";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { Tint } from "@/lib/pages/registry";

/**
 * The body the clicked sphere becomes.
 *
 * The brief for these pages is that the sphere does not disappear when it opens
 * one: it scales up, becomes the page's background body, and settles top-right
 * at low opacity. This is that body.
 *
 * ── Why the whole fluid pipeline and not a plain mesh ──
 *
 * `FluidBlob` draws with a `ShaderMaterial` whose output is an *isoline field*,
 * not a shaded surface — `FluidScene` blurs it, thresholds it and colours it in
 * the composite pass. Mounted in a bare `<Canvas>` the blob renders the raw
 * field and looks nothing like the spheres on the homepage, which defeats the
 * point of the continuity. `FluidCanvas` is the pipeline, and it was written to
 * be mounted anywhere — see its own note about being liftable out of the hero.
 *
 * The cost is bounded by the canvas, not the viewport: every pass in the chain
 * sizes off `useThree().size`, so a canvas occupying a corner of the page runs
 * the same passes over a fraction of the pixels the hero does. No post-
 * processing is added on top; the composite already ends in tone mapping.
 *
 * ── The entrance ──
 *
 * Two motions, and they are deliberately different things. The *body* is born by
 * the field's own birth clock — it grows out of a sub-isoline seed exactly as
 * the chain's spheres do, because nothing here holds that clock (only
 * `LoadingScreen` ever calls `holdBirth`, and it does not exist on this route),
 * so it runs from the first frame. The *frame around it* travels: it arrives
 * larger and further into the page, then settles into the corner and drops to
 * 20%. One is the material arriving, the other is the composition settling, and
 * running them together is what makes it read as a sphere that came from
 * somewhere rather than a decoration that faded up.
 *
 * Decorative throughout, hence `aria-hidden` and `pointer-events-none` on the
 * frame. The blob still deforms under the cursor — `SphereInteractionDriver`
 * resolves the pointer analytically against the sphere's world position rather
 * than through DOM events, so it never needed to catch a pointer event to feel
 * the cursor pass over it.
 */
export default function DetailBlob({ tint }: { tint: Tint }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed z-0 -top-[14vh] -right-[12vw] h-[68vh] w-[68vh] md:h-[86vh] md:w-[86vh]"
      // Under reduced motion the body is already born on its first frame
      // (`FluidScene` sets `birthClock.reduced`), so an animated frame around a
      // static body would be the only thing moving on the page. It is placed
      // instead.
      initial={
        reducedMotion
          ? false
          : { opacity: 0, scale: 1.45, x: "-14%", y: "16%" }
      }
      animate={{ opacity: 0.2, scale: 1, x: "0%", y: "0%" }}
      transition={{
        duration: 1.6,
        ease: [0.16, 1, 0.3, 1],
        // Behind the birth clock's own ~1.15 s formation rather than ahead of
        // it: the frame should still be travelling while the body finishes
        // becoming one, or the sphere lands and then slides, which reads as two
        // events.
        delay: 0.1,
      }}
      style={reducedMotion ? { opacity: 0.2 } : undefined}
    >
      <PointerProvider>
        <SphereInteractionProvider>
          <FluidCanvas>
            <SphereInteractionDriver enabled={!reducedMotion} />

            {/* The hero's camera, so a radius that reads a certain size on the
                homepage reads the same size here. At fov 40 from z = 12 the
                frame is ±4.37 units tall, and a 2.8 body — the head sphere's
                own radius — fills about two thirds of it. */}
            <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={40} />

            {/* No lights and no environment, unlike the hero. This material is
                a `ShaderMaterial` writing a scalar field; the lighting rig in
                `HeroCanvas` is there for the background spheres and the contact
                shadow, and neither of those exists here. */}
            <FluidBlob
              position={[0, 0, 0]}
              radius={2.8}
              // The head sphere's own drift, unchanged. This body is the same
              // substance at the same size, so a different rate would read as a
              // different material.
              floatSpeed={0.2}
              floatAmplitude={0.22}
              mouseStrength={0.12}
              innerColor={tint.inner}
              color={tint.mid}
              warmColor={tint.warm}
              rimColor={tint.rim}
            />
          </FluidCanvas>
        </SphereInteractionProvider>
      </PointerProvider>
    </motion.div>
  );
}
