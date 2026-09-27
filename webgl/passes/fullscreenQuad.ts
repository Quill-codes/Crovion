import * as THREE from "three";

/**
 * One clip-space quad, reused by every full-screen pass.
 *
 * Passes swap `mesh.material` rather than each owning a mesh: two triangles and
 * one geometry for the whole chain, and no per-pass scene graph to keep in sync.
 *
 * The camera is only here because `gl.render` demands one — the vertex shader
 * writes clip space directly and never reads it.
 */
export interface FullscreenQuad {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  mesh: THREE.Mesh;
  dispose(): void;
}

export function createFullscreenQuad(): FullscreenQuad {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const placeholder = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, placeholder);

  // A full-screen quad is never off screen, so culling it is pure overhead — and
  // with a pass-through vertex shader its bounding box is meaningless anyway.
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;

  const scene = new THREE.Scene();
  scene.add(mesh);

  return {
    scene,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    mesh,
    dispose() {
      geometry.dispose();
      placeholder.dispose();
    },
  };
}

/** Draw `material` over the whole target. Assumes the target is already bound. */
export function drawQuad(
  gl: THREE.WebGLRenderer,
  quad: FullscreenQuad,
  material: THREE.Material
): void {
  quad.mesh.material = material;
  gl.render(quad.scene, quad.camera);
}
