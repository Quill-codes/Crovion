import * as THREE from "three";
import { PASSTHROUGH_VERT } from "../shaders/passthrough.vert";
import { COMPOSITE_FRAG } from "../shaders/composite.frag";
import { drawQuad, type FullscreenQuad } from "./fullscreenQuad";
import { POINTER_FIELD_MODES, type FluidParams } from "../config/quality";

/**
 * Thresholds the blurred alpha into the fluid silhouette and blends it over the
 * ambient layer already on the canvas.
 *
 * `autoClear` is suspended for exactly this draw — the ambient pass painted the
 * canvas a moment ago and must survive underneath. It is restored immediately,
 * so nothing downstream inherits a renderer in an odd state.
 */
export interface CompositePass {
  material: THREE.ShaderMaterial;
  /**
   * @param trail The pointer field. Its drag channel displaces the UV the fluid
   *   buffers are sampled at — hard for the interior, gently for the silhouette —
   *   which is the entire pointer interaction. The pass count is unchanged; only
   *   the coordinate moves.
   */
  render(
    gl: THREE.WebGLRenderer,
    quad: FullscreenQuad,
    blob: THREE.Texture,
    blurH: THREE.Texture,
    blurred: THREE.Texture,
    trail: THREE.Texture,
    trailWidth: number,
    trailHeight: number,
    aspect: number,
    params: FluidParams,
    /**
     * The intro's global settle, in canvas heights of peak radial refraction and
     * already scaled by how far through the relaxation the intro is. Zero once
     * the intro is over, and zero for every page that does not run one — at which
     * point the term below compiles to a multiply by nothing and the composite is
     * bit-identical to what it was.
     */
    settle: number
  ): void;
  dispose(): void;
}

export function createCompositePass(): CompositePass {
  const material = new THREE.ShaderMaterial({
    vertexShader: PASSTHROUGH_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uBlob: { value: null },
      uBlurH: { value: null },
      uBlurred: { value: null },
      uTrail: { value: null },
      uTrailTexel: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uThreshold: { value: 9 },
      uCutoff: { value: 3.8 },
      uGlow: { value: 0.25 },
      uAura: { value: 0.16 },
      uFuse: { value: 0.85 },
      uDisplacementStrength: { value: 0 },
      uInteriorGain: { value: 2.2 },
      uDragGain: { value: 0.65 },
      uPushGain: { value: 0 },
      uSurfaceGain: { value: 0.3 },
      uPressGain: { value: 0 },
      uPressDepth: { value: 0 },
      uPressRadius: { value: 1.7 },
      uBrushRadius: { value: 0.15 },
      uTrailLift: { value: 0 },
      uSettle: { value: 0 },
      uDebug: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  return {
    material,

    render(
      gl,
      quad,
      blob,
      blurH,
      blurred,
      trail,
      trailWidth,
      trailHeight,
      aspect,
      params,
      settle
    ) {
      const u = material.uniforms;
      u.uBlob.value = blob;
      u.uBlurH.value = blurH;
      u.uBlurred.value = blurred;
      u.uThreshold.value = params.threshold;
      u.uCutoff.value = params.cutoff;
      u.uGlow.value = params.glow;
      u.uAura.value = params.aura;
      u.uFuse.value = params.fuse;
      u.uDebug.value = params.debug;

      u.uTrail.value = trail;
      u.uTrailTexel.value.set(1 / trailWidth, 1 / trailHeight);
      u.uAspect.value = aspect;
      u.uBrushRadius.value = params.brushRadius;
      u.uInteriorGain.value = params.interiorGain;
      u.uDragGain.value = params.dragGain;
      u.uPushGain.value = params.pushGain;
      u.uPressRadius.value = params.pressRadius;
      // The master switch is applied here rather than by skipping the trail pass:
      // the field still needs to decay to zero while disabled, so that re-enabling
      // it does not resurrect a frozen stroke from minutes ago.
      const pointer =
        params.pointerEnabled && POINTER_FIELD_MODES[params.interactionMode]
          ? 1
          : 0;
      u.uDisplacementStrength.value = params.displacementStrength * pointer;
      u.uSurfaceGain.value = params.surfaceGain * pointer;
      u.uPressGain.value = params.pressGain * pointer;
      u.uPressDepth.value = params.pressDepth * pointer;
      u.uTrailLift.value = params.trailLift * pointer;

      // Deliberately outside the `pointer` gate above. The settle is a property
      // of the composite itself and has nothing to do with the cursor, so
      // disabling the pointer layer must not also disable the intro.
      u.uSettle.value = settle;

      gl.setRenderTarget(null);

      const autoClear = gl.autoClear;
      gl.autoClear = false;
      drawQuad(gl, quad, material);
      gl.autoClear = autoClear;
    },

    dispose() {
      material.dispose();
    },
  };
}
