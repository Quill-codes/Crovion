/**
 * Full-screen pass vertex shader.
 *
 * Shaders live in `.ts` modules rather than `.glsl` files because importing
 * `.glsl` under Turbopack needs a webpack loader (`raw-loader`) added to
 * `next.config.ts`, and this phase is not permitted to add dependencies. This
 * also matches how `components/FluidBlob.tsx` already carries its GLSL.
 *
 * The quad is a `PlaneGeometry(2, 2)` spanning clip space directly, so the
 * position passes straight through with no camera transform. 4 vertices, and no
 * dependency on whichever camera `gl.render` is handed.
 */
export const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
