"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";
import { frame, updateFrame } from "@/lib/frame";
import { usePointer } from "@/components/PointerProvider";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  AMBIENT_LAYER,
  FLUID_PARAMS,
  FLUID_RENDER_PRIORITY,
  POINTER_FIELD_MODES,
  QUALITY,
} from "./config/quality";
import { createFullscreenQuad } from "./passes/fullscreenQuad";
import { createBlurPass } from "./passes/BlurPass";
import { createCompositePass } from "./passes/CompositePass";
import { createPointerTrailPass } from "./passes/PointerTrailPass";
import { renderAmbientLayer, renderBlobLayer } from "./passes/BlobPass";
import { createPointerField } from "./pointer/pointerField";
import { useCanvasRect } from "./pointer/useCanvasRect";
import {
  BIRTH_DEBUG,
  BIRTH_PARAMS,
  advanceBirth,
  birthClock,
  restartBirth,
} from "./config/birth";
import { INTRO_PARAMS, introSettle } from "./config/intro";
import { advanceIntro, markIntroReady } from "@/lib/intro/director";

/**
 * Seconds of pointer absence after which the trail pass stops running.
 *
 * Sized against the *slowest* channel, which since the contact press exists is the
 * press: at its default retention it is down to a few thousandths here, well below
 * anything the composite can express, so the wipe that follows is exact rather
 * than a visible snap.
 */
const TRAIL_SETTLE = 6;

/**
 * The pass chain, driven from exactly one frame callback.
 *
 * ```
 *  pointer ──► trail FBO (ping-pong) ───────────────┐
 *                                                   │
 *  fluid layer ──► blob FBO ──► blur H ──► blur V ──┤
 *                     │                             │
 *                     └──────────── sharp colour ───┤
 *  ambient layer ─────────────────► canvas          │
 *                                      ▲            ▼
 *                                      └── displace + threshold + composite
 * ```
 *
 * The trail runs **first**, before anything it will eventually distort. Nothing
 * downstream feeds back into it, so its position in the chain is free — and
 * updating it from this frame's pointer sample, before the composite reads it,
 * is the only ordering that costs zero frames of input latency. It also gives the
 * ping-pong swap one unambiguous place to happen.
 *
 * Note what is *not* here: the pointer never touches the blob pass. The spheres
 * are rendered exactly as they were, and the cursor only changes the coordinate
 * at which the composite samples the result. That is the structural reason the
 * cursor cannot move, scale or rotate them.
 *
 * Multi-pass render-to-texture is the part of this architecture that fights
 * React hardest, so the rules are strict and all in one place:
 *
 * - **One `useFrame`.** A priority above zero makes R3F stop rendering the scene
 *   itself and hand the frame to us. Splitting the chain across several
 *   callbacks would put pass ordering at the mercy of mount order.
 * - **Nothing is allocated in the loop.** Every target, material, scene and
 *   vector is built once and mutated in place.
 * - **No React state.** Tunables live in a mutable module object that Leva
 *   writes and the loop reads.
 * - **The render target is always restored** to the canvas on the way out.
 */
export default function FluidScene() {
  const renderer = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const blobWidth = Math.max(1, Math.round(size.width * dpr));
  const blobHeight = Math.max(1, Math.round(size.height * dpr));
  const blurWidth = Math.max(1, Math.round(blobWidth * QUALITY.blurScale));
  const blurHeight = Math.max(1, Math.round(blobHeight * QUALITY.blurScale));

  // Deliberately off CSS pixels, not device pixels: the trail is a low-frequency
  // field and its resolution should not swing with the display's DPR.
  const trailWidth = Math.max(
    QUALITY.trailMinSize,
    Math.round(size.width * QUALITY.trailScale)
  );
  const trailHeight = Math.max(
    QUALITY.trailMinSize,
    Math.round(size.height * QUALITY.trailScale)
  );
  const aspect = size.width / Math.max(size.height, 1);

  // RGBA8 throughout: the sphere shader clamps its output to 0..1, so half-float
  // would buy nothing and cost double the bandwidth through the blur — the one
  // place in this pipeline where bandwidth actually matters.
  //
  // `useFBO` builds each target once and resizes it on these dimensions
  // changing, then disposes it on unmount, so resize and teardown are handled.
  const blobTarget = useFBO(blobWidth, blobHeight, {
    type: THREE.UnsignedByteType,
    generateMipmaps: false,
  });
  const blurTargetA = useFBO(blurWidth, blurHeight, {
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const blurTargetB = useFBO(blurWidth, blurHeight, {
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });

  // Half-float, unlike the rest of the chain: this target feeds itself every
  // frame through a decay just under 1, and 8-bit quantisation makes that loop
  // stall short of zero. See `PointerTrailPass`.
  const trailSettings = {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  };
  const trailTargetA = useFBO(trailWidth, trailHeight, trailSettings);
  const trailTargetB = useFBO(trailWidth, trailHeight, trailSettings);

  const quad = useMemo(() => createFullscreenQuad(), []);
  const blur = useMemo(() => createBlurPass(QUALITY.blurRadiusTaps), []);
  const composite = useMemo(() => createCompositePass(), []);
  const trail = useMemo(
    () => createPointerTrailPass(trailTargetA, trailTargetB),
    [trailTargetA, trailTargetB]
  );
  const pointerField = useMemo(() => createPointerField(), []);

  const pointerRef = usePointer();
  const reducedMotion = usePrefersReducedMotion();
  const getCanvasRect = useCanvasRect(renderer.domElement);

  /**
   * A fresh render target's contents are undefined, `setSize` throws the old
   * texture away, and context loss takes every resource with it. In all three
   * cases the ping-pong pair has to be wiped before it is read, or uninitialised
   * memory feeds back into itself. Setting the flag is cheap; the frame loop
   * consumes it at the one point where a render target is legal to bind.
   */
  const trailNeedsReset = useRef(true);
  useEffect(() => {
    trailNeedsReset.current = true;
  }, [trailWidth, trailHeight, trailTargetA, trailTargetB]);

  /**
   * Seconds the pointer has been absent. Past the settle window the trail pass
   * stops running entirely — otherwise a touch device, a reduced-motion visitor
   * or simply a cursor parked outside the window would pay a full-screen draw
   * every frame for a field that is provably zero.
   */
  const trailIdle = useRef(0);

  /**
   * Has the pipeline reported itself up to the intro director yet?
   *
   * The `fluid` readiness gate is the shader-compilation gate, and it is the one
   * signal in the set that cannot be faked with a timer. Every program in the
   * chain — the sphere shader, both blur passes, the trail, the composite — is
   * linked lazily by three.js on its first draw, and that first draw is easily a
   * few hundred milliseconds of compilation. Bravis gets this for free by
   * constructing its renderer inside its own load gate, so the first frame it
   * ever draws is already the intro's first frame. We have to say so explicitly:
   * the curtain may not lift until one complete pass chain has been through.
   *
   * Reported at the *end* of the callback, after the composite has drawn, because
   * the composite is the last program to link.
   */
  const reportedReady = useRef(false);

  useEffect(() => {
    return () => {
      quad.dispose();
      blur.dispose();
      composite.dispose();
      trail.dispose();
    };
  }, [quad, blur, composite, trail]);

  /**
   * The birth clock has no way to ask React anything from inside the frame
   * loop, so the one accessibility signal it needs is pushed in from here —
   * where the pipeline already subscribes to it — rather than re-subscribing
   * per blob. Live, so flipping the OS setting mid-session takes effect without
   * a reload, exactly as it does for the pointer field above.
   */
  useEffect(() => {
    birthClock.reduced = reducedMotion;
  }, [reducedMotion]);

  /**
   * The tuning surface, on the console.
   *
   * This replaces the Leva panel that used to hang in the corner of every dev
   * build. The panel was three folders of sliders writing straight into these
   * same mutable objects, so the objects themselves are the whole control
   * surface — `__fluid.blurRadius = 90` lands on the next frame exactly as the
   * slider did, and `__fluid.debug = 5` is the same shader tap. What is lost is
   * the discoverability of a list of named knobs, and what is gained is not
   * covering the composition being tuned with a panel.
   *
   * Pairs with `window.__intro` from the director — see `installIntroDevtools`.
   * Dev only; the whole block is dropped from a production build.
   */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as Window & {
      __fluid?: typeof FLUID_PARAMS;
      __birth?: typeof birthClock;
      __birthParams?: typeof BIRTH_PARAMS;
      __birthReplay?: () => string;
      __introParams?: typeof INTRO_PARAMS;
    };
    w.__fluid = FLUID_PARAMS;
    w.__birth = birthClock;
    w.__birthParams = BIRTH_PARAMS;
    w.__birthReplay = () => {
      restartBirth();
      return "BIRTH · replaying";
    };
    w.__introParams = INTRO_PARAMS;
    return () => {
      delete w.__fluid;
      delete w.__birth;
      delete w.__birthParams;
      delete w.__birthReplay;
      delete w.__introParams;
    };
  }, []);

  // Transparent clear, set once. Every pass depends on it: the blob target must
  // start at zero alpha for the premultiplied-blur trick to hold, and the canvas
  // must stay transparent so the background layer behind still shows through.
  useEffect(() => {
    renderer.setClearColor(0x000000, 0);
  }, [renderer]);

  // Without `preventDefault` on `webglcontextlost` the browser will not restore
  // the context at all, and the canvas stays black for the rest of the session.
  useEffect(() => {
    const canvas = renderer.domElement;

    const onLost = (event: Event) => {
      event.preventDefault();
      console.warn("[crovion/fluid] WebGL context lost — waiting for restore");
    };
    const onRestored = () => {
      console.warn("[crovion/fluid] WebGL context restored");
      // Every GPU resource was destroyed with the context. three.js rebuilds the
      // targets lazily, but their contents come back undefined — and the trail is
      // the one buffer in this pipeline that reads its own previous frame, so it
      // is also the only one that would carry that garbage forward indefinitely.
      trailNeedsReset.current = true;
    };

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [renderer]);

  useFrame((state, delta) => {
    updateFrame(delta);

    // The field's single lifecycle clock, advanced here for the same reason
    // everything else is: one callback owns the frame, so there is exactly one
    // place a time step can happen. The blobs read it at the default priority,
    // i.e. one callback earlier, which costs a frame of lag and buys the
    // guarantee that no blob can ever see a half-stepped clock.
    advanceBirth(delta);

    // The intro's clock, on the same discipline and for the same reason: one
    // callback owns the frame, so there is exactly one place a time step can
    // happen. This is the only pump the director has in the normal case — its
    // watchdog exists purely for the degraded one, where this callback has stopped
    // running because the context was lost or never came up at all.
    //
    // Like the birth clock, what the blobs read is one callback stale: they sit at
    // the default priority and this runs at FLUID_RENDER_PRIORITY, so the seed
    // collapses on last frame's `t`. That costs a frame of lag and buys the
    // guarantee that no blob can ever see a half-stepped clock.
    advanceIntro(delta);

    const { gl, scene, camera } = state;
    const params = FLUID_PARAMS;

    if (trailNeedsReset.current) {
      trail.reset(gl);
      trailNeedsReset.current = false;
    }

    // ── 0 · the pointer field ──
    //
    // Raw delta, clamped at both ends: the smoothing below is exponential in dt,
    // so a stalled frame would otherwise snap the contact straight onto the
    // cursor and lose exactly the inertia this exists to create.
    const dt = Math.min(Math.max(delta, 1 / 240), 1 / 20);
    const pointer = pointerRef.current;

    // The pointer arrives in client pixels; the brush works in canvas UV with the
    // GL origin at the bottom left, hence the Y flip.
    const rect = getCanvasRect();
    const uvX = (pointer.clientX - rect.left) / rect.width;
    const uvY = 1 - (pointer.clientY - rect.top) / rect.height;

    // A small margin keeps the brush alive just off the edge, so a stroke that
    // leaves the canvas decays where it left rather than stopping dead on the
    // boundary. Coarse pointers are excluded outright — there is no hover on a
    // touchscreen, and a tap would paint a stroke the user cannot see themselves
    // making.
    const present =
      params.pointerEnabled &&
      // Dev-only birth isolation: the cursor is the loudest thing on this page
      // and judging a one-second formation with a trail field running through it
      // is not a fair look at it. Defaults OFF, so this is a no-op in production.
      BIRTH_PARAMS.debug !== BIRTH_DEBUG.ONLY_BIRTH &&
      POINTER_FIELD_MODES[params.interactionMode] &&
      !reducedMotion &&
      !pointer.coarse &&
      pointer.inside &&
      uvX > -0.1 &&
      uvX < 1.1 &&
      uvY > -0.1 &&
      uvY < 1.1;

    pointerField.update(dt, present, uvX, uvY, aspect, params);

    trailIdle.current = pointerField.active > 0 ? 0 : trailIdle.current + dt;

    // TRAIL_SETTLE seconds of absence is comfortably longer than the slowest
    // decay the panel exposes takes to reach a value the composite cannot
    // express, so one final wipe is exact rather than approximate — and it stops
    // a frozen residue lingering once the pass goes quiet.
    if (trailIdle.current > TRAIL_SETTLE) {
      if (trailIdle.current - dt <= TRAIL_SETTLE) trail.reset(gl);
    } else {
      // Rates are authored per 60 Hz frame and raised to this frame's share of
      // one, which is what makes the trail decay at the same wall-clock speed on
      // a 60 Hz and a 144 Hz display.
      trail.render(gl, quad, {
        pointerX: pointerField.current.x,
        pointerY: pointerField.current.y,
        pointerPrevX: pointerField.previous.x,
        pointerPrevY: pointerField.previous.y,
        velocityX: pointerField.velocity.x,
        velocityY: pointerField.velocity.y,
        aspect,
        brushRadius: params.brushRadius,
        brushStrength: 1 - Math.pow(1 - params.brushStrength, frame.d),
        dragDeposit: 1 - Math.pow(1 - params.dragDeposit, frame.d),
        decay: Math.pow(params.trailDecay, frame.d),
        damping: Math.pow(params.trailDamping, frame.d),
        // Diffusion is a rate, not a retention, so it scales linearly with the
        // frame's share of one — and is capped well short of 1, where blending
        // fully onto a 4-neighbour average turns the ping-pong into a checkerboard
        // oscillator instead of a smoother.
        pressureDissipate: Math.min(params.pressureDissipate * frame.d, 0.5),
        dragDissipate: Math.min(params.dragDissipate * frame.d, 0.5),
        pressRadius: params.pressRadius,
        pressDeposit: 1 - Math.pow(1 - params.pressDeposit, frame.d),
        pressDecay: Math.pow(params.pressDecay, frame.d),
        pressDissipate: Math.min(params.pressDissipate * frame.d, 0.5),
        motionKnee: params.motionKnee,
        active: pointerField.active,
      });
    }

    // ── 1 · the blobs, alone, into their own target ──
    renderBlobLayer(gl, scene, camera, blobTarget);

    // ── 2 · horizontal blur ──
    // `sourceScale` is source texels per screen pixel, so a radius authored in
    // screen pixels lands identically in both passes despite the downscale.
    blur.render(
      gl,
      quad,
      blobTarget.texture,
      blobTarget.width,
      blobTarget.height,
      blurTargetA,
      "x",
      params.blurRadius,
      dpr,
      params.blurStrength
    );

    // ── 3 · vertical blur ──
    blur.render(
      gl,
      quad,
      blurTargetA.texture,
      blurTargetA.width,
      blurTargetA.height,
      blurTargetB,
      "y",
      params.blurRadius,
      dpr * QUALITY.blurScale,
      params.blurStrength
    );

    // ── 4 · everything that is not fluid, straight to the canvas ──
    renderAmbientLayer(gl, scene, camera);

    // ── 5 · displace by the pointer field, threshold, blend over the ambient ──
    composite.render(
      gl,
      quad,
      blobTarget.texture,
      blurTargetA.texture,
      blurTargetB.texture,
      trail.texture,
      trailWidth,
      trailHeight,
      aspect,
      params,
      introSettle(reducedMotion) * INTRO_PARAMS.settleStrength
    );

    // ── 6 · leave the renderer pointing at the canvas ──
    gl.setRenderTarget(null);
    camera.layers.set(AMBIENT_LAYER);

    // ── 7 · tell the director the pipeline is up ──
    //
    // Every program in the chain has now linked and drawn at least once, which is
    // the thing the curtain is actually waiting for. See `reportedReady`.
    if (!reportedReady.current) {
      reportedReady.current = true;
      markIntroReady("fluid");
    }
  }, FLUID_RENDER_PRIORITY);

  return null;
}
