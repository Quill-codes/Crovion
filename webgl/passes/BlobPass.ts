import type * as THREE from "three";
import { AMBIENT_LAYER, FLUID_LAYER } from "../config/quality";

/**
 * Draws the live scene twice from the same camera, once per layer.
 *
 * This is the whole reason the pipeline can be introduced without redesigning
 * anything: the existing `FluidBlob` spheres opt into `FLUID_LAYER` and become
 * the metaball's input, while the ambient background spheres, the contact shadow
 * and everything else stay on `AMBIENT_LAYER` and reach the screen untouched.
 *
 * `camera.layers.set()` costs one bitmask write. `WebGLRenderer.projectObject`
 * layer-tests each object but still recurses into its children, so only the leaf
 * meshes need a layer assignment — groups, `<Float>` wrappers and `<Html>`
 * anchors are unaffected.
 */

/**
 * Render only the fluid blobs into `target`.
 *
 * The target is cleared to transparent black, so three.js `NormalBlending`
 * leaves it **premultiplied** (`rgb = colour * alpha`) — which is what makes the
 * downstream Gaussian an alpha-weighted blur for free. See `blur.frag.ts`.
 */
export function renderBlobLayer(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget
): void {
  camera.layers.set(FLUID_LAYER);
  gl.setRenderTarget(target);
  // autoClear is on, so `render` clears colour + depth for us.
  gl.render(scene, camera);
}

/**
 * Render everything that is *not* fluid, straight to the canvas.
 *
 * Runs before the composite so the fluid can be blended over it, and keeps the
 * canvas alpha intact so the CSS/aurora layer behind still shows through.
 */
export function renderAmbientLayer(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
): void {
  camera.layers.set(AMBIENT_LAYER);
  gl.setRenderTarget(null);
  gl.render(scene, camera);
}
