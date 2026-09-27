/**
 * Separable Gaussian blur — ONE shader, run twice with `uDirection` swapped.
 *
 * ### Why a plain RGBA Gaussian is already an alpha-weighted blur
 *
 * The blob target is filled by three.js `NormalBlending`, which is
 * `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`.
 * Drawn onto a transparent-black clear, that leaves `rgb = colour * alpha` —
 * i.e. the buffer is **premultiplied**.
 *
 * Blurring premultiplied RGBA with a straight Gaussian *is* the alpha-weighted
 * average: transparent texels contribute zero colour instead of dragging black
 * into the edges. Dividing by the blurred alpha at the end recovers the straight
 * colour. So the alpha weighting the reference implements explicitly comes out
 * of the blend equation for free, with no extra taps and no divide in the hot
 * loop.
 *
 * ### Tap layout
 *
 * Weights are baked into the source as literals and the loop is unrolled — GLSL
 * ES 1.00 has no array constructors, and unrolled constants beat dynamic
 * indexing anyway. Adjacent tap pairs are collapsed onto a single bilinear
 * sample, so 15 taps per side become 8 fetches per side: 31 effective taps in 17
 * fetches.
 *
 * `uRadius` scales tap *spacing* only, so the blur width is continuously
 * tunable at runtime without recompiling the program.
 */

interface GaussianTaps {
  centre: number;
  pairs: { offset: number; weight: number }[];
}

function gaussianTaps(radiusTaps: number): GaussianTaps {
  const sigma = Math.max(radiusTaps / 2.5, 0.5);

  const discrete: number[] = [];
  for (let i = 0; i <= radiusTaps; i++) {
    discrete.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  }

  // Normalise across the truncated kernel, not the analytic one, so the baked
  // weights sum to exactly 1 and the blur cannot darken or brighten the image.
  let total = discrete[0];
  for (let i = 1; i <= radiusTaps; i++) total += 2 * discrete[i];

  const pairs: { offset: number; weight: number }[] = [];
  for (let i = 1; i <= radiusTaps; i += 2) {
    const w1 = discrete[i] / total;
    const w2 = i + 1 <= radiusTaps ? discrete[i + 1] / total : 0;
    const weight = w1 + w2;
    if (weight <= 1e-6) continue;
    // Sample between the two taps, biased by their relative weight, and let the
    // hardware's bilinear filter do the interpolation for free.
    //
    // Offsets are normalised to 0..1 across the kernel so that `uRadius` reads as
    // the kernel's total reach in source texels rather than its tap spacing —
    // otherwise the outermost tap lands `radiusTaps` times too far out and the
    // pass smears the image into a lattice of ghost copies instead of blurring.
    pairs.push({
      offset: (i * w1 + (i + 1) * w2) / weight / radiusTaps,
      weight,
    });
  }

  return { centre: discrete[0] / total, pairs };
}

/** GLSL needs an unambiguous float literal — `1` would be an int. */
const f = (n: number) => n.toFixed(6);

export function buildBlurFragment(radiusTaps: number): string {
  const { centre, pairs } = gaussianTaps(radiusTaps);

  const taps = pairs
    .map(
      (p) =>
        `  acc += (texture2D(uTex, vUv + spacing * ${f(p.offset)}) + texture2D(uTex, vUv - spacing * ${f(p.offset)})) * ${f(p.weight)};`
    )
    .join("\n");

  return /* glsl */ `
precision highp float;

uniform sampler2D uTex;
/** (1, 0) horizontal, (0, 1) vertical. */
uniform vec2 uDirection;
/** 1 / source resolution. */
uniform vec2 uTexelSize;
/** Tap spacing, in source texels. */
uniform float uRadius;
/** 0 = source untouched, 1 = full Gaussian. */
uniform float uStrength;

varying vec2 vUv;

void main() {
  vec4 centreTap = texture2D(uTex, vUv);
  vec2 spacing = uDirection * uRadius * uTexelSize;

  vec4 acc = centreTap * ${f(centre)};
${taps}

  gl_FragColor = mix(centreTap, acc, uStrength);
}
`;
}
