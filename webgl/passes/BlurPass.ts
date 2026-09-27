import * as THREE from "three";
import { PASSTHROUGH_VERT } from "../shaders/passthrough.vert";
import { buildBlurFragment } from "../shaders/blur.frag";
import { drawQuad, type FullscreenQuad } from "./fullscreenQuad";

/**
 * The separable Gaussian, as one material used twice.
 *
 * The two passes read buffers of different resolutions — the horizontal pass
 * reads the full-resolution blob target and writes a reduced one, the vertical
 * pass reads and writes that reduced one. Expressing the radius in **screen
 * pixels** and converting to source texels per pass is what keeps the result
 * isotropic; passing a fixed texel radius would make the vertical blur wider
 * than the horizontal by exactly the downscale factor.
 */
export interface BlurPass {
  material: THREE.ShaderMaterial;
  /**
   * @param radiusPx Gaussian reach in screen pixels.
   * @param sourceScale Source texels per screen pixel (dpr × that buffer's scale).
   */
  render(
    gl: THREE.WebGLRenderer,
    quad: FullscreenQuad,
    source: THREE.Texture,
    sourceWidth: number,
    sourceHeight: number,
    target: THREE.WebGLRenderTarget,
    axis: "x" | "y",
    radiusPx: number,
    sourceScale: number,
    strength: number
  ): void;
  dispose(): void;
}

export function createBlurPass(radiusTaps: number): BlurPass {
  const material = new THREE.ShaderMaterial({
    vertexShader: PASSTHROUGH_VERT,
    fragmentShader: buildBlurFragment(radiusTaps),
    uniforms: {
      uTex: { value: null },
      uDirection: { value: new THREE.Vector2(1, 0) },
      uTexelSize: { value: new THREE.Vector2() },
      uRadius: { value: 0 },
      uStrength: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });

  return {
    material,

    render(
      gl,
      quad,
      source,
      sourceWidth,
      sourceHeight,
      target,
      axis,
      radiusPx,
      sourceScale,
      strength
    ) {
      const u = material.uniforms;
      u.uTex.value = source;
      u.uDirection.value.set(axis === "x" ? 1 : 0, axis === "x" ? 0 : 1);
      u.uTexelSize.value.set(1 / sourceWidth, 1 / sourceHeight);
      u.uRadius.value = radiusPx * sourceScale;
      u.uStrength.value = strength;

      gl.setRenderTarget(target);
      drawQuad(gl, quad, material);
    },

    dispose() {
      material.dispose();
    },
  };
}
