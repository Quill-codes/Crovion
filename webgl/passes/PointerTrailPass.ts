import * as THREE from "three";
import { PASSTHROUGH_VERT } from "../shaders/passthrough.vert";
import { POINTER_TRAIL_FRAG } from "../shaders/pointerTrail.frag";
import { drawQuad, type FullscreenQuad } from "./fullscreenQuad";

/**
 * The one pass Phase 3 adds to the chain.
 *
 * It owns a ping-pong pair of half-float targets and swaps them internally, so
 * the caller only ever asks for "the current trail texture". Nothing is allocated
 * per frame — the two targets come from the caller (built once by `useFBO`) and
 * every uniform is written in place.
 *
 * ### Why half-float rather than the RGBA8 the rest of the chain uses
 *
 * The field feeds itself: every frame's output is next frame's input, multiplied
 * by a retention coefficient just under 1. At 8 bits that loop stalls — a decay
 * of 0.97 applied to 1/255 rounds straight back to 1/255 and the trail never
 * reaches zero, leaving a permanent ghost of wherever the cursor has been. The
 * drag channels are worse, because they are signed and settle around zero where
 * quantisation is most visible as a fixed directional bias. Half-float removes
 * the whole class of problem, and at roughly a third of viewport resolution the
 * extra bandwidth is not measurable.
 */
export interface PointerTrailUniforms {
  /** Smoothed pointer in canvas UV, this frame and last. */
  pointerX: number;
  pointerY: number;
  pointerPrevX: number;
  pointerPrevY: number;
  /** Smoothed velocity, aspect-corrected UV, pre-scaled and clamped. */
  velocityX: number;
  velocityY: number;
  aspect: number;
  brushRadius: number;
  /** Per-frame rates, already corrected for this frame's duration. */
  brushStrength: number;
  dragDeposit: number;
  decay: number;
  damping: number;
  pressureDissipate: number;
  dragDissipate: number;
  pressDeposit: number;
  pressDecay: number;
  pressDissipate: number;
  /** Press reach as a multiple of `brushRadius`. Not a per-frame rate. */
  pressRadius: number;
  /** Speed at which the disturbance envelope saturates. Not a per-frame rate. */
  motionKnee: number;
  active: number;
}

export interface PointerTrailPass {
  material: THREE.ShaderMaterial;
  /** The texture the last `render` wrote. Valid to sample from any later pass. */
  readonly texture: THREE.Texture;
  /**
   * Wipe both targets to zero.
   *
   * Required on the very first frame (a fresh render target's contents are
   * undefined), after a resize (`WebGLRenderTarget.setSize` drops the old
   * texture), and after context restoration (every GPU resource is gone).
   * Skipping it leaves uninitialised memory feeding back into itself.
   */
  reset(gl: THREE.WebGLRenderer): void;
  render(
    gl: THREE.WebGLRenderer,
    quad: FullscreenQuad,
    uniforms: PointerTrailUniforms
  ): void;
  dispose(): void;
}

export function createPointerTrailPass(
  targetA: THREE.WebGLRenderTarget,
  targetB: THREE.WebGLRenderTarget
): PointerTrailPass {
  const material = new THREE.ShaderMaterial({
    vertexShader: PASSTHROUGH_VERT,
    fragmentShader: POINTER_TRAIL_FRAG,
    uniforms: {
      uPrev: { value: null },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPointerPrev: { value: new THREE.Vector2(0.5, 0.5) },
      uVelocity: { value: new THREE.Vector2() },
      uTexel: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uBrushRadius: { value: 0.16 },
      uBrushStrength: { value: 0.2 },
      uDragDeposit: { value: 0.35 },
      uTrailDecay: { value: 0.96 },
      uTrailDamping: { value: 0.95 },
      uPressureDissipate: { value: 0.04 },
      uDragDissipate: { value: 0.22 },
      uPressRadius: { value: 1.7 },
      uPressDeposit: { value: 0.18 },
      uPressDecay: { value: 0.985 },
      uPressDissipate: { value: 0.05 },
      uMotionKnee: { value: 0.45 },
      uActive: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });

  const targets = [targetA, targetB];
  // Index of the target holding the *current* field. `render` writes the other.
  let read = 0;

  return {
    material,

    get texture() {
      return targets[read].texture;
    },

    reset(gl) {
      const previous = gl.getRenderTarget();
      for (const target of targets) {
        gl.setRenderTarget(target);
        // Colour only — these targets carry no depth or stencil.
        gl.clear(true, false, false);
      }
      gl.setRenderTarget(previous);
    },

    render(gl, quad, u) {
      const write = 1 - read;
      const source = targets[read];
      const destination = targets[write];
      const uniforms = material.uniforms;

      uniforms.uPrev.value = source.texture;
      uniforms.uPointer.value.set(u.pointerX, u.pointerY);
      uniforms.uPointerPrev.value.set(u.pointerPrevX, u.pointerPrevY);
      uniforms.uVelocity.value.set(u.velocityX, u.velocityY);
      uniforms.uTexel.value.set(1 / destination.width, 1 / destination.height);
      uniforms.uAspect.value = u.aspect;
      uniforms.uBrushRadius.value = u.brushRadius;
      uniforms.uBrushStrength.value = u.brushStrength;
      uniforms.uDragDeposit.value = u.dragDeposit;
      uniforms.uTrailDecay.value = u.decay;
      uniforms.uTrailDamping.value = u.damping;
      uniforms.uPressureDissipate.value = u.pressureDissipate;
      uniforms.uDragDissipate.value = u.dragDissipate;
      uniforms.uPressRadius.value = u.pressRadius;
      uniforms.uPressDeposit.value = u.pressDeposit;
      uniforms.uPressDecay.value = u.pressDecay;
      uniforms.uPressDissipate.value = u.pressDissipate;
      uniforms.uMotionKnee.value = u.motionKnee;
      uniforms.uActive.value = u.active;

      gl.setRenderTarget(destination);
      drawQuad(gl, quad, material);

      read = write;
    },

    dispose() {
      material.dispose();
    },
  };
}
