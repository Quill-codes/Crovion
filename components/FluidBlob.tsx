"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePointer } from "./PointerProvider";
import { useSphereTarget } from "./SphereInteraction";
import { SPHERE_DISTORTION, distortionProfile } from "@/lib/sphereDistortion";
import {
  FLUID_LAYER,
  FLUID_PARAMS,
  LEGACY_TOUCH_MODES,
} from "@/webgl/config/quality";
import {
  BIRTH_PARAMS,
  BIRTH_UNREST,
  bornState,
  resolveBirth,
  resolveTravel,
  type BirthState,
} from "@/webgl/config/birth";
import {
  INTRO_SEED_TINT,
  resolveSeed,
  type SeedState,
} from "@/webgl/config/intro";

interface FluidBlobProps {
  position: [number, number, number];
  radius: number;
  floatSpeed?: number;
  floatAmplitude?: number;
  /**
   * Radial pulse — the body inflating and deflating where it sits, as a
   * fraction of its own radius. 0 (the default) is the chain's behaviour.
   *
   * Applied to `uBirthScale`, i.e. to the *displaced* position, so the surface
   * detail scales with the body instead of sliding across a growing one. That
   * is the difference between a blob breathing and a blob being zoomed: the
   * lobes, the rim band and the touch dent all keep their proportion of the
   * silhouette through the whole cycle.
   *
   * It is not the same thing as the idle wobble further down — that one is
   * already on every blob, and it changes the body's *shape* at constant
   * volume. This changes the volume and leaves the shape alone. They compose.
   */
  breathAmplitude?: number;
  /** Radians per second of the pulse above. Ignored at amplitude 0. */
  breathSpeed?: number;
  /**
   * How much of the soap-bubble film this body wears, 0 to 1.
   *
   * 0 — the default, and every sphere on the chain — is the unlit gradient the
   * reference captures were measured against, and every term the film adds
   * collapses to nothing at 0, so a body that does not ask for it is unchanged
   * down to the bit.
   *
   * At 1 the body gains three things a shell has and a ball does not: a pale
   * specular bloom on one shoulder, thin-film interference banded on the
   * grazing angle opposite it, and a bright hairline right at the silhouette.
   * The saturated core is lifted toward the body colour at the same time —
   * a bubble is palest in the middle, where ours pooled its darkest value.
   *
   * It is a per-body property rather than a scene setting because the two looks
   * are meant to coexist: the numbered stops are the composition and stay the
   * measured material, and the drops that fan off them are the bubbles.
   */
  bubble?: number;
  /**
   * A multiplier on the body's own radius, smoothed toward on arrival.
   *
   * Applied to `uBirthScale` — the same channel the breath rides — rather than
   * to the group transform, and that is the whole reason it exists. Scaling the
   * group would take the body's children with it: the pinned labels, the CTA and
   * the satellite fan are all mounted *inside* the blob so they ride its drift,
   * so a parent that shrank by its transform would drag its own open fan in with
   * it. Riding the radius instead resizes the body and nothing else.
   *
   * Damped here rather than by the caller because every caller would otherwise
   * need its own spring for what is one number.
   */
  scale?: number;
  /**
   * How far the body is lifted toward its own rim colour, 0 to 1.
   *
   * ⚠️ This is *not* alpha. The composite's output alpha is the metaball mask,
   * which saturates to 1 well inside any body, and the blob's own alpha is the
   * field that mask is thresholded from — so lowering either makes a body
   * smaller, not see-through. Genuine per-body transparency is not available in
   * this architecture without giving the field a second channel to carry it.
   *
   * What this does instead is the cue rather than the mechanism: a thin membrane
   * shows more of its own light through its middle than a solid one does, so
   * lifting the interior toward `warmColor` reads as looking *through* the body
   * even though every pixel is still opaque. It goes to the warm stop rather
   * than the rim precisely so the body keeps its hue while it thins.
   */
  translucency?: number;
  /**
   * Where in the cycle this body starts, in radians.
   *
   * Left out, the phase comes from the blob's own `seed`, which is what a lone
   * body wants — it is random and it is stable across remounts. A *set* of
   * bodies whose clearances are solved against each other wants the opposite: a
   * caller that hands neighbouring bodies phases π apart keeps the distance
   * between their two surfaces constant through the whole cycle, because what
   * one gains the other gives back at the same instant. See `SatelliteField`.
   */
  breathPhase?: number;
  mouseStrength?: number;
  segments?: number;
  /** Mid-tone of the gradient — the body colour of the blob. */
  color?: string;
  /** Saturated core that drifts inside the blob. */
  innerColor?: string;
  /** Bright grazing-angle rim. */
  rimColor?: string;
  /** Secondary warm tint blended into the rim, gives the iridescent shift. */
  warmColor?: string;
  opacity?: number;
  /**
   * Position in the field's birth sequence — see `webgl/config/birth.ts`.
   *
   * Multiplied by `BIRTH_PARAMS.stagger` to get this blob's delay, so it is a
   * place in the composition's own order rather than an index into a table of
   * times: fractional values are meaningful, and are what lets the connector
   * beads fall between the two bodies they thread.
   *
   * Defaults to the head of the sequence. Anything mounted after the birth
   * window has closed — the satellite fans, the dev merge probe — is simply
   * already born, because the clock is global rather than per-mount.
   */
  birthOrder?: number;
  /**
   * Where this body is born from, in this group's own parent space.
   *
   * The `travel` channel of `resolveBirth` interpolates the position written each
   * frame between this point and wherever the float, the parallax and the slosh
   * put the body — so at travel 0 the blob sits exactly on the origin and at
   * travel 1 it is at its resting composition, with every intermediate frame
   * carrying the full ambient motion rather than a frozen pose sliding across the
   * screen.
   *
   * Omitted means "born in place", which is the pre-intro behaviour and what
   * everything mounted after the birth window closes wants.
   */
  birthOrigin?: [number, number, number];
  /**
   * Intro only — this blob *is* the seed the loading curtain hands off to.
   *
   * Swaps the lifecycle source: instead of growing from a sub-isoline seed on its
   * `birthOrder`, the body starts at screen-filling scale in the curtain's own
   * colour and collapses to a point, unwinding a small rotation as it goes and
   * bridging toward the hero palette on the way down. See `webgl/config/intro.ts`
   * for why that is the whole trick.
   *
   * Everything else about the blob is unchanged, which is the point — it goes
   * through the same blur, the same isoline and the same composite as the chain
   * does, so the moment the chain is born out of it the two merge rather than
   * swapping.
   */
  introSeed?: boolean;
  /**
   * Anything that should ride the body's drift — surface-pinned labels, the CTA.
   *
   * Rendered inside the drifting group rather than beside it. A sibling of
   * `<FluidBlob>` sits at the *undrifted* anchor and the sphere wanders out from
   * under it: at the head of the chain the drift is ±0.22 world units, which is
   * ~25 px of separation at this camera. Children get the float, the pointer
   * parallax and the position damping, and none of the mesh's tumble rotation
   * (that lives on the mesh, not this group), so pinned type stays upright.
   */
  children?: React.ReactNode;
}

// ─── GLSL 3D Simplex Noise (Stefan Gustavson / Ashima Arts) ───
const SIMPLEX = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm3(vec3 p) {
  float v  = snoise(p);
  v += snoise(p * 2.07 + 19.3) * 0.45;
  v += snoise(p * 4.11 + 47.7) * 0.20;
  return v / 1.65;
}
`;

/**
 * The whole blob is defined as a radial displacement of a unit sphere.
 * Working in unit space (rather than along-normal in world space) keeps the
 * finite-difference normal reconstruction below trivial and exact.
 */
const VERTEX = `
uniform float uTime;
uniform float uRadius;
uniform float uNoiseAmp;
uniform float uNoiseFreq;
uniform float uNoiseSpeed;
uniform float uEnvAmp;
uniform float uEnvFreq;
uniform float uEnvSpeed;
uniform vec3  uEnvOffset;
uniform float uDetailAmp;
uniform float uLobeBias;
uniform float uLobeNorm;
uniform float uLobeSpeed;
uniform float uWobble;
uniform vec3  uSlosh;
uniform float uSeed;
uniform vec3  uRipplePoint;
uniform float uRippleStart;
uniform float uRippleStrength;
uniform vec3  uTouchPoint;
uniform vec3  uTouchTrail;
uniform float uTouchAmp;
uniform float uTouchRadius;
uniform float uTouchSmooth;
uniform float uTouchRim;
uniform float uTouchTrailWeight;

// ── Birth ── (see webgl/config/birth.ts)
// uBirth is the lifecycle itself, 0 unborn to 1 fully born; uBirthScale is the
// growth of the forming mass and uBirthAmp the master on the unrest below. All
// three are 1 / 1 / anything once the blob has settled, and every term they
// touch collapses back to its original expression at that point — the steady
// state is bit-identical to the build without birth.
uniform float uBirth;
uniform float uBirthScale;
uniform float uBirthAmp;

varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
varying float vDisp;
varying float vTouch;

${SIMPLEX}

/**
 * The cursor pressing into the surface.
 *
 * p is on the unit sphere and so is uTouchPoint, which makes distance() a
 * chord length — 0 at the contact point, 2.0 at the antipode. That is the whole
 * reason the body is authored in unit space: the falloff is a plain distance in
 * the same space the surface is defined in, so the dent is genuinely local to
 * the surface rather than projected onto it from the screen.
 */
float touchDisplace(vec3 p) {
  // Uniform branch — coherent across the whole draw, and skips ~6 exp/distance
  // ops per vertex per displace() call (three of those per vertex) while idle.
  if (abs(uTouchAmp) < 1e-4) return 0.0;

  float inv = 1.0 / uTouchRadius;
  float s   = uTouchSmooth;

  float x = distance(p, uTouchPoint) * inv;
  float x2 = x * x;
  float core = exp(-x2 * s);

  // Smear tail at the lagged contact point, so a fast cursor drags a comet-shaped
  // trough behind it instead of teleporting a perfectly round dimple around.
  float xt = distance(p, uTouchTrail) * inv;
  core = max(core, exp(-xt * xt * s) * uTouchTrailWeight);

  // Rim: zero at the centre, peaks just outside the core, gone soon after. This
  // is the displaced volume coming back out, and it is what separates an elastic
  // membrane from a hole punched through the mesh. Normalised by the analytic
  // peak of x²·exp(-s·x²) (which is 1/(s·e)) so uTouchRim reads directly as
  // "rim height as a fraction of dent depth".
  float ring = x2 * exp(-x2 * s) * s * 2.718281828 * uTouchRim;

  return uTouchAmp * (core - ring);
}

/**
 * Band 1 — the envelope. This is the silhouette.
 *
 * Measurement (CROVION_SPHERE_DEFORMATION_PLAN §2) puts the reference at 3-6
 * dominant lobes carrying finer detail, and the way to get *few and broad* is a
 * frequency below the detail band's, not more amplitude on top of it: scaling
 * the detail field up gives a lumpier sphere, which is the opposite of the
 * reference.
 *
 * Both octaves sit under uNoiseFreq. At uEnvFreq a great circle spans only
 * ~1.6 noise features, so octave one is the gross asymmetry — the body being
 * fatter on one side — and octave two, still below the detail band, supplies
 * the ~3 broad lobes on top of it.
 *
 * No domain warp here, unlike the detail band. Warping at this scale folds a
 * broad lobe back into itself and hands the lumpiness straight back; the
 * evolution comes from drifting through the field instead, which is both
 * cheaper (two snoise calls) and inherently coherent — no frame-to-frame
 * jitter is possible when the only thing moving is the sample point.
 */
float envelopeBand(vec3 p) {
  float te = uTime * uEnvSpeed;

  // Per-sphere spatial offset: the four bodies read the same material out of
  // different neighbourhoods of the field rather than morphing in lockstep.
  vec3 q = p * uEnvFreq + uEnvOffset;

  // Two drift directions rather than one. A single shared drift makes every
  // lobe slide the same way, which reads as the body being dragged past a
  // texture; differential drift makes lobes swell and subside in place.
  vec3 dr0 = vec3( 0.31, -0.22,  0.47) * te;
  vec3 dr1 = vec3(-0.26,  0.38,  0.19) * te;

  float e = snoise(q + dr0);
  e += snoise(q * 1.9 + dr1 + 5.7) * 0.5;
  e /= 1.5;

  // ── Phase 3 — lobe character ──
  //
  // The reference's lobes pool to one side rather than distributing evenly, the
  // same asymmetry the fragment stage already gives the colour bands via
  // offAxis. This is that trick on the vertex displacement: a slowly rotating
  // axis that the fattest part of the body migrates around.
  //
  // Multiplicative, not additive, and that is the whole design of this pass.
  // Adding dot(p, axis) would be the more literal reading of "bias along an
  // axis", but a pure n1 radial term is a *translation* of the body, not a
  // deformation of it — it would push the centroid around and land straight in
  // the drift budget Phase 2 spent an entire phase calibrating (§2b: 1.9% / 5.6%
  // of R, 2.95:1). Scaling the field instead leaves the centroid where it is and
  // only redistributes where the existing lobes carry their amplitude.
  //
  // Nor is it a shift of the sampling position (q += axis * k), the other
  // reading of the plan's wording: translating the field slides every lobe the
  // same way, which is exactly the "body dragged past a texture" failure the
  // two-drift-direction comment above was written to avoid.
  //
  // uLobeNorm holds the field's RMS constant, so this changes character
  // without touching Phase 1's calibrated amplitude — multiplying by a
  // zero-mean cosine would otherwise raise RMS by sqrt(1 + bias^2/3) and
  // silently invalidate the measured 4.9% low-band figure. Energy stays in the
  // low band too: an n3-n5 field times n1 lands on n2-n6, so the 4.7:1
  // low-to-high ratio Phase 1 protects is undisturbed.
  //
  // The axis is tilted off the equator so the pooling sector precesses rather
  // than sweeping a great circle, and runs slower than the lobes themselves
  // evolve — a full revolution well outside the ~10-16s a lobe takes to grow
  // and subside, so the sector reads as consistent while it rotates.
  float ta = uTime * uLobeSpeed + uSeed;
  vec3 axis = normalize(vec3(cos(ta), 0.42, sin(ta)));

  return e * (1.0 + uLobeBias * dot(p, axis)) * uLobeNorm;
}

/**
 * Band 2 — detail. The pre-existing field, unchanged in shape and now carried
 * at roughly a quarter of the envelope's amplitude: surface life and small
 * irregularity, not silhouette.
 *
 * The domain warp is what makes this read as flowing liquid rather than a
 * static lumpy potato, and it is worth keeping precisely because it is no
 * longer driving the outline.
 */
float detailBand(vec3 p) {
  float t = uTime * uNoiseSpeed + uSeed;

  vec3 q = p * uNoiseFreq;
  vec3 warp = vec3(
    snoise(q * 0.7 + vec3(0.0,  0.0,  t * 0.60)),
    snoise(q * 0.7 + vec3(13.1, 7.7,  t * 0.50)),
    snoise(q * 0.7 + vec3(31.3, 21.9, t * 0.70))
  );
  vec3 qw = q + warp * 0.5 + vec3(0.0, 0.0, t * 0.45);
  return (snoise(qw) + snoise(qw * 1.9 + 11.0) * 0.30) / 1.30;
}

// Radial displacement of the unit sphere at unit-space point p.
float displace(vec3 p) {
  float t = uTime * uNoiseSpeed + uSeed;

  // ── Birth unrest ──
  //
  // A body that is still forming has not settled into its resting silhouette,
  // so both bands are carried harder while it is young. Squared, so the extra
  // amplitude leaves smoothly rather than being switched off — at uBirth = 1
  // this is exactly 1.0 and the two-band ratio Phase 1 calibrated is untouched.
  //
  // Deliberately a gain on the *existing* fields rather than a birth-specific
  // shape: the blob has to be morphing with its own character from the first
  // frame it exists, not perform a birth and then start living.
  float unborn = 1.0 - uBirth;
  float unrest = unborn * unborn;
  float bandGain = 1.0 + uBirthAmp * ${BIRTH_UNREST.toFixed(3)} * unrest;

  // Two bands, envelope-dominant. Kept as explicit amplitudes rather than one
  // shared uNoiseAmp so that the springs below — which are tuned against
  // uNoiseAmp — are untouched by any silhouette retune.
  float d = envelopeBand(p) * uEnvAmp * bandGain + detailBand(p) * uDetailAmp * bandGain;

  // One extra low-order band, alive only during the birth.
  //
  // The autonomous morph is slow by design — the envelope takes 10-16 s for a
  // lobe to grow and subside — so across a 1.15 s birth it is barely a frame of
  // itself and a growing body would read as an inflating balloon. This runs an
  // order of magnitude faster and dies with the same squared falloff, which is
  // what makes the mass churn while it gathers.
  //
  // Uniform branch: coherent across the whole draw, so the three displace()
  // calls per vertex pay for it only while a blob is actually being born, and
  // nothing at all afterwards.
  if (unrest > 0.0004) {
    float bt = uTime * 1.6 + uSeed * 3.1;
    d += snoise(p * 1.35 + vec3(0.0, 0.0, bt)) * uEnvAmp * uBirthAmp * 1.15 * unrest;
  }

  // Everything from here is a perturbation of that body, and stays on the
  // original uNoiseAmp scale.
  float d2 = 0.0;

  // Jelly ringing — an axial standing wave whose amplitude is driven by the
  // spring integrator on the CPU side, so impacts actually reverberate.
  float axial = sin(p.y * 3.0 + t * 2.2) * cos(p.x * 2.4 - t * 1.7);
  d2 += axial * uWobble;

  // Inertial slosh: the mass lags behind acceleration, stretching the blob
  // along the motion axis like water in a bag.
  d2 += dot(p, uSlosh);

  // Click ripple — a decaying wave travelling out from the hit point.
  float elapsed = uTime - uRippleStart;
  if (elapsed > 0.0 && elapsed < 4.0) {
    float dh = distance(p, uRipplePoint);
    d2 += sin(dh * 7.0 - elapsed * 8.0)
       * exp(-elapsed * 1.5)
       * exp(-dh * 0.7)
       * uRippleStrength * 0.35;
  }

  // The touch term is added *outside* uNoiseAmp on purpose. The noise amplitude
  // is deliberately tiny on the big blobs (8.5% of radius) to keep them close to
  // round, and scaling the dent by it made the contact ~1% of the radius —
  // present in the maths, invisible on screen.
  return d + d2 * uNoiseAmp + touchDisplace(p);
}

void main() {
  vec3 pu = normalize(position);

  // Finite-difference normals. Without this the lighting stays spherical while
  // the silhouette deforms, which instantly reads as fake.
  vec3 up = abs(pu.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tang  = normalize(cross(up, pu));
  vec3 bitan = cross(pu, tang);

  float eps = 0.07;
  vec3 pa = normalize(pu + tang  * eps);
  vec3 pb = normalize(pu + bitan * eps);

  float d  = displace(pu);
  vec3 P  = pu * (1.0 + d);
  vec3 Pa = pa * (1.0 + displace(pa));
  vec3 Pb = pb * (1.0 + displace(pb));

  vec3 nLocal = normalize(cross(Pa - P, Pb - P));

  // Growth lives here, on the radius, and not on the object transform: the
  // metaball reads a screen-space alpha field, so what has to change is how
  // much of the field this body fills. Scaling the group would do that too, but
  // it would also drag the pinned labels, the CTA and the satellite fan with
  // it — and it would scale the *displacement* along with the body, so the
  // newborn would carry a perfectly self-similar silhouette instead of a
  // relatively rougher one. Applied after the unit-space displacement, the
  // deformation above stays proportional to the unit sphere while the body it
  // rides on grows, which is why a small blob reads as more liquid than a large
  // one — the same falloff the per-size amp ladder already encodes.
  vec3 displaced = P * uRadius * uBirthScale;

  vDisp    = d;
  vTouch   = touchDisplace(pu);
  vLocal   = P;
  vNormalW = normalize(mat3(modelMatrix) * nLocal);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vPosW = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

/**
 * Unlit gradient shading, matching the reference: saturated drifting core,
 * soft mid body, bright grazing rim with a warm secondary tint. Deliberately
 * no specular and no environment reflection — the reference has neither.
 */
const FRAGMENT = `
uniform float uTime;
uniform vec3  uColorDeep;
uniform vec3  uColorMid;
uniform vec3  uColorRim;
uniform vec3  uColorWarm;
uniform float uOpacity;
uniform float uRimPower;
uniform float uSeed;
uniform float uGrain;
uniform float uSheenAmp;
uniform float uSheenSpeed;

// ── Soap-bubble film ── (see the bubble prop on FluidBlobProps)
uniform float uBubble;
// ── Membrane translucency ── (see the translucency prop)
uniform float uThin;

// ── Birth ── (see webgl/config/birth.ts)
// uBirthDensity is the material density of the body, and it never reaches the
// screen as transparency: the composite's own alpha is the threshold mask, and
// the colour it shows is recovered by dividing the premultiplied buffer back
// out. So this changes how far the blurred field reaches past the isoline —
// how *big* the silhouette is — and not how pale the blob looks.
uniform float uBirth;
uniform float uBirthDensity;

varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
varying float vDisp;
varying float vTouch;

${SIMPLEX}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower);

  // Interior flow — the saturated core drifts around inside the body
  // independently of the silhouette, which is what sells "liquid".
  float t = uTime * 0.10 + uSeed;
  float flow = fbm3(vLocal * 1.25 + vec3(0.0, 0.0, t)) * 0.5 + 0.5;
  float flow2 = fbm3(vLocal * 2.4 + vec3(9.1, 3.3, -t * 0.8)) * 0.5 + 0.5;

  // Wrapped diffuse from upper-right — soft, subsurface-like, no hard terminator.
  float wrap = dot(N, normalize(vec3(0.45, 0.72, 0.55))) * 0.5 + 0.5;
  wrap = pow(wrap, 0.75);

  // Radial ramp: saturated core → body → warm → bright rim, using the fresnel
  // term as the radial coordinate (0 facing the camera, 1 at the silhouette).
  // The flow noise shifts each band boundary so the gradient drifts and pools
  // instead of sitting in fixed concentric rings.
  // Pure fresnel gives rings concentric to the view axis; the reference pools
  // its bands to one side instead. Bias the radial coordinate along a fixed
  // off-axis direction so the warm zone gathers up-right and the saturated
  // core settles down-left.
  float offAxis = dot(N, normalize(vec3(0.55, 0.60, 0.25))) * 0.5 + 0.5;
  float r = clamp(fres * 0.78 + offAxis * 0.30 + (flow - 0.5) * 0.18, 0.0, 1.0);

  float w1 = flow * 0.20;
  float w2 = flow2 * 0.18;

  // The film lifts the saturated core toward the body colour before the ramp
  // even starts. A soap bubble is palest in the middle — the shell is thinnest
  // facing you and there is the least of it to colour — where this gradient
  // pools its deepest value dead centre, which is what made the drops read as
  // balls with a bright edge rather than as shells.
  //
  // A tenth of the way, and two earlier passes are why. 0.45 took the chroma
  // out of the whole body; 0.25 still measured 24-55 % saturation on the
  // rendered core against the reference's 89 %. The crescent on the shaded side
  // further down is what carries the roundness this used to buy, and it costs
  // no chroma because it spends the deep colour rather than the pale one. At
  // uBubble 0 this is uColorDeep unchanged.
  vec3 col = mix(uColorDeep, uColorMid, uBubble * 0.10);
  col = mix(col, uColorMid,  smoothstep(0.10, 0.50 + w1, r));
  // The warm zone is the widest band in the ramp — it lays over r 0.45-0.85 at
  // 0.85 strength, which is most of the body — and on a pale warm it is also
  // the single biggest desaturator on the sphere. That is right for the chain,
  // whose stops were measured with it. It is wrong for a bubble: the reference
  // holds 73-89 % saturation from its core out to r 0.75 and only lets go in
  // the last tenth, so a band that washes the body out at 0.45 is the opposite
  // of the thing being matched. Halved under the film, untouched without it.
  col = mix(col, uColorWarm, smoothstep(0.45, 0.85 + w2, r) * 0.85 * (1.0 - uBubble * 0.5));
  col = mix(col, uColorRim,  smoothstep(0.80, 1.05, r) * 0.70);

  // Thin even edge on top of the asymmetric pooling, so the silhouette still
  // reads all the way round without a thick uniform halo.
  col = mix(col, uColorRim, smoothstep(0.88, 1.0, fres) * 0.55);

  // ── Membrane translucency ──
  //
  // A lift of the whole body toward its own light chromatic stop, weighted to
  // the middle.
  // (1 - fres) is 1 facing the camera and 0 at the silhouette, so this is
  // strongest exactly where a real membrane is thinnest and there is least of it
  // to colour — and it leaves the grazing edge alone, which is the part that
  // should stay dense. Squared so it stays a lift of the middle rather than a
  // wash over everything.
  //
  // At uThin 0 this is nothing at all, which is every body that does not ask.
  //
  // Toward warm, not rim. The first pass lifted toward the rim colour, which
  // on every family here is a near-white — so turning it up made the body thin
  // *and* colourless, which is the opposite of what a thin membrane does. A soap
  // film does not lose its colour as it thins; it loses its *density*. Warm is
  // the light, chromatic stop, so lifting toward it reads as looking through the
  // body while the hue survives.
  float thin = (1.0 - fres) * (1.0 - fres) * uThin;
  col = mix(col, uColorWarm, thin * 0.50);

  // Light wrap last, so the lit side glows without washing the core out.
  col *= 0.72 + wrap * 0.5;

  // ── Silhouette sheen ──
  //
  // The reference's outline catches the light: toward the edge the body
  // brightens and desaturates into a warm cream, and it does so in one sector
  // rather than evenly around the circumference.
  //
  // Measured off ref-frames-2, sampling core (0.45R) against rim (0.94R) on
  // 15-degree bearings, background and headline pixels rejected:
  //
  //     rim brightening   +30 luminance mean, +80 on the bearing that catches it
  //     saturation        0.46 core -> 0.31 rim, a 33% drop
  //     rim colour        red pegged near 250 while green and blue climb —
  //                       cream, not white
  //
  // The sector *travels*: peak bearing runs 225 -> 240 -> 195 -> 180 degrees
  // across frames 02-14, so this is a moving highlight and not a fixed one. That
  // is the whole reason it is an animated term rather than another static
  // addition to the ramp above.
  //
  // Deliberately applied after the light wrap. Before it, the unlit side scales
  // the sheen down by up to 0.72 and the highlight dims exactly when it travels
  // away from the key light — but the reference's peak migrates all the way
  // around, holding its strength, so it cannot be a function of the light
  // direction.
  //
  // Rotates on its own rate rather than sharing Phase 3's lobe axis. The two are
  // unrelated in the reference — one is where the body is fattest, the other is
  // where its edge catches light — and locking them would make the fat side
  // permanently the bright side, which reads as a single hard light source.
  float ts = uTime * uSheenSpeed + uSeed;
  vec2 az = N.xy / max(length(N.xy), 1e-4);
  float sector = dot(az, vec2(cos(ts), sin(ts))) * 0.5 + 0.5;

  // Gated on fresnel so it lives on the outline only, and floored at 0.22 rather
  // than 0 — the measurement never found a bearing with *no* lift, only weak
  // ones (+5 at the quietest against +80 at the peak).
  float edge = smoothstep(0.42, 0.96, fres);
  float sheen = edge * mix(0.22, 1.0, smoothstep(0.10, 0.95, sector)) * uSheenAmp;

  // Two halves, matching the two things the measurement saw: a pull toward the
  // warm cream carries the desaturation, the rim add carries the luminance.
  col = mix(col, uColorWarm, sheen * 0.55);
  col += uColorRim * sheen * 0.16;

  // ── Soap-bubble film ──
  //
  // Everything here is gated on uBubble and is skipped outright at 0, so the
  // chain's spheres are the measured material and nothing below can drift them
  // off it. What it adds is the three cues that separate a shell from a ball.
  if (uBubble > 0.0) {
    // **One key, from the upper left.** Fixed in world space rather than
    // per-body, because five bubbles lit from five directions stop reading as
    // one scene — and because the mesh's slow tumble then moves the surface
    // under a highlight that stays put, which is what a real one does. The
    // gradient above has no light source at all; this is the first thing on the
    // body that does.
    vec3 L = normalize(vec3(-0.42, 0.78, 0.60));
    float ndh = max(dot(N, normalize(L + V)), 0.0);

    // How much of this point faces the key, and its complement. Both are used
    // three times below, which is the only reason they are named.
    float lambert = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float away = 1.0 - lambert;

    // **The saturated crescent**, on the shaded side. This is the term that
    // makes the body read as round once the core has been lightened: a bubble's
    // colour is strongest where you are looking through the most film, which is
    // the far wall on the side turned away from the light. Squared, so it stays
    // a crescent hugging the shaded edge instead of a wash over half the body.
    col = mix(col, uColorDeep, away * away * 0.28 * uBubble);

    // Two broad lobes, and deliberately **no hot spot**. An earlier pass ran
    // these at exponents 7 and 55, which put a small bright disc on the upper
    // shoulder — a mirror highlight, and a mirror highlight is the single cue
    // that makes a translucent body read as polished plastic instead of water.
    // A water membrane scatters: it is lit from within over a wide area rather
    // than reflecting a point source back at you.
    //
    // 3 and 14 are both wide enough that neither resolves to a disc at any size
    // the field draws, and the pair still has a centre — the softer lobe carries
    // the illuminated quarter and the tighter one keeps it from being a flat
    // wash with no direction in it.
    float bloom = pow(ndh, 3.0) * 0.55 + pow(ndh, 14.0) * 0.45;

    // **Thin-film interference**, banded on the grazing angle and drifting with
    // the body's own interior flow, so the bands travel the way a real film's
    // do rather than sitting in fixed rings. The cosine palette is the cheap
    // standard one; what stops it looking like an oil slick is pulling it most
    // of the way to this body's own rim colour first — the reference's
    // iridescence is a tint on a pale edge, not a rainbow.
    float film = fres * 2.6 + flow2 * 0.45 + uTime * 0.045 + uSeed;
    vec3 iris = 0.5 + 0.5 * cos(6.2831853 * film + vec3(0.0, 2.094, 4.188));
    iris = mix(uColorRim, iris, 0.40);

    // Weighted away from the key. It is where a film actually shows its colour:
    // the lit shoulder is washed out by the bloom sitting on it, and the
    // shadowed edge is the only place the interference survives being lit.
    col = mix(col, iris, smoothstep(0.30, 0.92, fres) * mix(0.40, 1.0, away) * uBubble * 0.5);

    // **The film's own outline** — a bright hairline in the last few per cent of
    // the silhouette. This is the cheapest of the three and does the most work:
    // a ball's edge is where its shading runs out, a bubble's edge is a thing
    // you can see.
    col = mix(col, uColorRim, smoothstep(0.90, 1.0, fres) * uBubble * 0.65);

    // The bloom last, over the interference and the outline both, so it reads
    // as light landing on the surface rather than as one more stop in the
    // gradient underneath it.
    col = mix(col, vec3(1.0), bloom * uBubble * 0.55);
  }

  // Stretched regions brighten slightly, like a thinning membrane.
  col += vec3(0.06, 0.05, 0.09) * clamp(vDisp * 3.0, 0.0, 1.0);

  // The dent under the cursor pools a little darker and the rim around it a
  // little brighter. The reconstructed normals already light the deformation
  // correctly; this only deepens the contact so it reads at a glance against
  // the blob's own drifting gradient.
  float pit  = clamp(-vTouch * 7.0, 0.0, 1.0);
  float bump = clamp( vTouch * 9.0, 0.0, 1.0);
  col *= 1.0 - pit * 0.22;
  col += uColorRim * bump * 0.10;

  // Film grain — the reference has a visible fine grain over everything.
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  // Feather only the extreme grazing sliver so the silhouette reads soft
  // without breaking depth sorting between overlapping blobs.
  //
  // ── The birth's third channel: edge firmness ──
  //
  // While the body is young the feather is far wider and far deeper, so its
  // alpha ramps down over most of the grazing half rather than the last sliver.
  // Downstream that is the difference between a hard disc and a diffuse cloud
  // of material: the blurred field gets a broad shallow skirt, which sits under
  // the isoline, so the surface the threshold finds is well inside the geometry
  // and tightens onto it as the feather narrows. That is the "mass condensing
  // into a silhouette" half of the effect, and it is the reason growth alone
  // does not read as an inflating balloon.
  //
  // Both endpoints are the original values at uBirth = 1, so nothing here
  // survives into the steady state.
  // ── Why the aura is not here ──
  //
  // A halo drawn as its own mesh would be composited into the same alpha field
  // the isoline reads, so it would not sit *behind* the body — it would sum with
  // it and the threshold would return a bigger body. That much was expected.
  //
  // What was not: shaping it out of this feather does not work either, and it
  // fails in the opposite direction. Alpha here **is** the field. Widening the
  // grazing ramp removes alpha from the outer band, which pulls the isoline
  // *in* — the first attempt at this put an aura term on featherKnee and
  // featherAmt,
  // and every body on the field thinned until the threshold lost it. There are
  // no fragments outside the silhouette to add field with, so an outward halo
  // cannot be made from inside this shader at all.
  //
  // It belongs in the composite, which is the one stage that has a blurred field
  // extending past the isoline and is already sampling it. See uAuraStrength
  // in composite.frag.ts.
  float featherKnee = mix(0.55, 0.90, uBirth);
  float featherAmt  = mix(0.72, 0.35, uBirth);
  float alpha = uOpacity * uBirthDensity
    * (1.0 - smoothstep(featherKnee, 1.0, fres) * featherAmt);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

export default function FluidBlob({
  position,
  radius,
  floatSpeed = 1,
  floatAmplitude = 1,
  breathAmplitude,
  breathSpeed,
  breathPhase,
  bubble = 0,
  scale = 1,
  translucency = 0,
  mouseStrength = 0.1,
  segments,
  color = "#a78bfa",
  innerColor = "#7c3aed",
  rimColor = "#f4efff",
  warmColor = "#f5c8e0",
  opacity = 1,
  birthOrder = 0,
  birthOrigin,
  introSeed = false,
  children,
}: FluidBlobProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const pointerRef = usePointer();

  // Registers this blob with the interaction field. The driver writes the hit
  // into `target.contact` once per frame; nothing here re-renders.
  //
  // The intro seed registers at radius 0, i.e. never wins a hit. It has to
  // register at all — the hook cannot be called conditionally — but it must not
  // be *hittable*: the driver tests against the geometry radius rather than the
  // live birth scale and takes the front-most hit, so a screen-filling body at
  // z = 0 would claim every pointer sample on the page, and would go on claiming
  // them after it had collapsed to nothing and turned invisible.
  const target = useSphereTarget(introSeed ? 0 : radius, meshRef);

  const [seed] = useState(() => Math.random() * 100);

  // ── Breath, when the caller does not say ──
  //
  // Every body on the field breathes now, and almost none of them should have to
  // ask. The amplitude ladder is by size and runs the way the brief sets it out —
  // roughly ±4.5 % on the large bodies, ±6 % on the medium, ±8.5 % on the small —
  // which is the same principle as `amp`'s morph ladder a few lines up: a given
  // *relative* change reads louder on a smaller, crisper body, so the number has
  // to grow as the body shrinks or the small ones look inert next to the large.
  //
  // Rate and phase both come off `seed`, the per-blob random the envelope, the
  // lobe precession and the sheen are already seeded from. That is what keeps a
  // field of them from inhaling together: two bodies share a cycle only if they
  // drew the same seed, and the rate spread means even those two drift apart
  // inside one period rather than staying locked. 0.70-1.26 rad/s is a 5.0-9.0 s
  // cycle, and the pair of sines below means the motion never repeats on either
  // one of them alone.
  //
  // A caller that needs the relationship to be exact — the satellite fan, whose
  // clearances are solved against each other — passes all three explicitly.
  // The live value behind `scale`. Damped rather than snapped: the callers that
  // move it are interaction states — a fan opening, a parent yielding the
  // emphasis to it — and a body that changes size in one frame reads as a
  // glitch rather than as mass moving.
  const scaleSmooth = useRef(scale);

  // The target, mirrored into a ref.
  //
  // The frame callback reads this rather than the prop directly, and that is not
  // defensive coding — reading the prop did not work. Measured on the page with
  // the head at a target of 0.88, its rendered diameter came back at 0.984 of
  // the closed state, i.e. the loop was still seeing the value `scale` held when
  // the body mounted. A ref is the value the loop is *meant* to read: the frame
  // callback is not part of React's render output and has no business closing
  // over render-scoped props that change underneath it.
  const scaleTarget = useRef(scale);
  useEffect(() => {
    scaleTarget.current = scale;
  }, [scale]);

  const breath = useMemo(() => {
    const sizeAmp = radius > 1.5 ? 0.045 : radius > 0.5 ? 0.062 : 0.085;
    return {
      amp: breathAmplitude ?? sizeAmp * (0.85 + ((seed * 0.53) % 1) * 0.3),
      speed: breathSpeed ?? 0.70 + ((seed * 0.29) % 1) * 0.56,
      phase: breathPhase ?? seed * 2.1,
    };
  }, [radius, breathAmplitude, breathSpeed, breathPhase, seed]);


  // Tessellation — the silhouette morphs, so it needs real geometry to morph
  // with. Affordable now that the transmission passes are gone.
  const segs = segments ?? (radius > 1.5 ? 160 : radius > 0.5 ? 96 : 48);

  // Tiny beads read as noise if they wobble as hard as the big blobs.
  const isTiny = radius < 0.2;
  // Relative deformation falls off with size, matching the reference: the big
  // blob stays close to round while the small one goes full teardrop.
  const amp = isTiny ? 0.05 : radius > 2.4 ? 0.085 : radius > 1.0 ? 0.11 : 0.16;
  const freq = isTiny ? 0.9 : 0.6;

  // ─── Two-band silhouette (Phase 1) ───
  // The envelope owns the outline and the detail band rides on it at ~4.5× less
  // amplitude. Everything here is expressed relative to the old single-band
  // `amp`/`freq` so the existing per-size falloff still applies.
  //
  // Both numbers below are measured, not guessed. The first pass ran at 0.42×
  // and amp*1.18 and profiled at 2.85% shape change with the harmonic content
  // sitting on n1/n2/n3 — right character, too broad and far too shallow.
  //
  // Frequency: 0.42× put a great circle at ~1.6 noise features, so order 1-2
  // dominated and the body read as an egg. 0.60× moves the dominant content to
  // n3/n4/n5 — the 3-6 broad lobes the plan measures — while both envelope
  // octaves (0.60× and 1.14×) stay at or under the detail band, so the
  // high-frequency lumpiness does not come back as the silhouette driver.
  //
  // Amplitude targets the reference's own measured circularity: 5-7% deviation
  // from a circle, ~6% at centre (plan §2a). Not the old 9-10%, which was a
  // shape-change-over-unknown-time figure and is retired.
  //
  // `amp` is not a percentage of radius — 3D simplex noise has a standard
  // deviation near 0.15-0.20, not ±1 — so these multipliers only mean something
  // measured. The ladder so far, on an unoccluded silhouette:
  //
  //     amp * 1.0  →  1.50%   ← CURRENT, spherical by choice
  //     amp * 3.0  →  2.78%
  //     amp * 3.2  →  3.58%
  //     amp * 3.5  →  3.16%
  //     amp * 4.0  →  5.28%   matches the reference band, but reads lobed here
  //
  // The body is held near-circular deliberately. 4.0 sits inside the reference's
  // own measured 5.2-7.5% band, so it is not over-deformed by the numbers — but
  // the reference sphere is far larger on screen with a much softer glowing
  // edge, and the same relative undulation reads as gentle there and as lobed on
  // a smaller, crisper body. That is a design call, and it overrides the metric.
  //
  // Only the amplitude changes. Frequency, speed, the two-band split and the
  // 4.55:1 envelope:detail ratio are all untouched, so the *character* of the
  // motion is identical to the high-amplitude build — broad low-order undulation
  // on a slow aperiodic drift, with no small-bump lumpiness. It is the same
  // deformation, quieter.
  const envFreq = freq * 0.6;
  const envAmp = amp * 1.0;

  // Scaled with the envelope, not held at a fixed value: the two-band ratio is
  // the thing being protected. Measured at 4.7:1 low-to-high, which is what
  // keeps the original single band's small-bump lumpiness from coming back.
  // Pinning detail while the envelope climbs would push the ratio past 13:1 and
  // quietly delete the surface life.
  const detailAmp = amp * 0.22;

  // ─── Lobe character (Phase 3) ───
  // How hard the envelope pools toward the rotating axis. At 0.45 the leading
  // side carries 1.45x the field and the trailing side 0.55x, a ~2.6:1 spread —
  // visibly asymmetric without any risk of the sign inverting, which is what
  // happens past 1.0 as the trailing multiplier crosses zero and lobes turn
  // inside out.
  //
  // ⚠️ Set by the same reasoning as the rest of this file, NOT measured. The
  // plan's §"Reproducing the measurements" pass is what decides it, and the
  // criterion is Phase 3's own: the profile maximum should hold a consistent
  // sector that rotates slowly, rather than jumping between opposite bearings
  // frame to frame. Treat 0.45 as the starting point of a ladder, the way
  // `amp` was laddered above.
  const lobeBias = 0.45;

  // Holds the field's RMS across the bias, so Phase 1's amplitude ladder above
  // still means what it says. E[dot(p, axis)^2] = 1/3 over the sphere, so the
  // uncompensated multiply would inflate RMS by sqrt(1 + bias^2/3) — 3.3% at
  // this bias. Small, but it would land as a free amplitude bump inside the
  // 5-7% band the plan treats as a ceiling as well as a floor.
  const lobeNorm = 1 / Math.sqrt(1 + (lobeBias * lobeBias) / 3);

  // ~84s per revolution at the nominal rate, against the ~10-16s a lobe takes
  // to grow and subside: the sector has to outlive the lobes sitting in it or
  // the migration reads as flicker rather than as travel. Varied per sphere on
  // the same principle as `envSpeed` — four bodies precessing in lockstep would
  // read as one rotating object.
  const lobeSpeed = 0.075 * (0.85 + ((seed * 0.61) % 1) * 0.3);

  // Slow, and slightly different per sphere so they never beat in phase. The
  // capture timebase is unknown (plan §1) so no rate can be derived from the
  // measurements; this is set by eye at roughly half the detail band's rate —
  // ~10-16s for a lobe to grow and subside, against the detail band's ~6s.
  const envSpeed = 0.13 * (0.8 + ((seed * 0.37) % 1) * 0.45);

  // Independent neighbourhood of the noise field per sphere — same material,
  // different organism.
  const envOffset = useMemo(
    () =>
      new THREE.Vector3(
        Math.sin(seed * 1.7) * 37.0,
        Math.cos(seed * 2.9) * 41.0,
        Math.sin(seed * 4.3) * 29.0
      ),
    [seed]
  );

  // ─── Silhouette sheen ───
  // Solved against the measurement in the fragment stage: at full strength the
  // two sheen terms lift the rim by roughly +68/255 luminance on the catching
  // bearing and +15 on the quietest, against the reference's +80 and +5, and
  // drop saturation by about a third — which is what was measured.
  //
  // Beads get a third of it. The effect is a wide soft band in the reference,
  // and on a body a few dozen pixels across a band that wide is the whole
  // sphere: it stops reading as an edge catching light and starts reading as the
  // bead simply being paler than its neighbours.
  const sheenAmp = isTiny ? 0.25 : 0.75;

  // ~63s per revolution, deliberately not the ~84s of the Phase 3 lobe axis.
  // Two slow rotations at the same rate would fuse into one apparent motion.
  const sheenSpeed = 0.10 * (0.85 + ((seed * 0.83) % 1) * 0.3);

  // A dimple of fixed relative size looks wrong across the whole size range, so
  // the dent geometry scales with the blob: local dent on the big body, whole-body
  // squash on a bead.
  const profile = useMemo(() => distortionProfile(radius), [radius]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRadius: { value: radius },
      uNoiseAmp: { value: amp },
      uNoiseFreq: { value: freq },
      uNoiseSpeed: { value: 0.32 },
      uEnvAmp: { value: envAmp },
      uEnvFreq: { value: envFreq },
      uEnvSpeed: { value: envSpeed },
      uEnvOffset: { value: envOffset },
      uDetailAmp: { value: detailAmp },
      uLobeBias: { value: lobeBias },
      uLobeNorm: { value: lobeNorm },
      uLobeSpeed: { value: lobeSpeed },
      uWobble: { value: 0 },
      uSlosh: { value: new THREE.Vector3() },
      uSeed: { value: seed },
      uRipplePoint: { value: new THREE.Vector3(0, 0, 1) },
      uRippleStart: { value: -100 },
      uRippleStrength: { value: 0 },
      uTouchPoint: { value: new THREE.Vector3(0, 0, 1) },
      uTouchTrail: { value: new THREE.Vector3(0, 0, 1) },
      uTouchAmp: { value: 0 },
      uTouchRadius: { value: SPHERE_DISTORTION.distortionRadius * profile.radiusScale },
      uTouchSmooth: { value: SPHERE_DISTORTION.distortionSmoothness },
      uTouchRim: { value: SPHERE_DISTORTION.distortionRim },
      uTouchTrailWeight: { value: SPHERE_DISTORTION.trailWeight },
      uColorDeep: { value: new THREE.Color(innerColor) },
      uColorMid: { value: new THREE.Color(color) },
      uColorRim: { value: new THREE.Color(rimColor) },
      uColorWarm: { value: new THREE.Color(warmColor) },
      uOpacity: { value: opacity },
      uRimPower: { value: isTiny ? 1.6 : 2.2 },
      uGrain: { value: 0.022 },
      uSheenAmp: { value: sheenAmp },
      uSheenSpeed: { value: sheenSpeed },
      uBubble: { value: bubble },
      uThin: { value: translucency },
      // Seeded born, not unborn. The frame loop pulls them down on its first
      // pass — which runs before the pipeline renders anything, since the blobs
      // sit at the default priority and the pass chain at priority 1 — so this
      // is never seen. It matters only as the failure mode: if the loop never
      // runs, a blob is a normal blob rather than an invisible one.
      uBirth: { value: 1 },
      uBirthScale: { value: 1 },
      uBirthDensity: { value: 1 },
      uBirthAmp: { value: BIRTH_PARAMS.strength },
    }),
    [
      radius,
      amp,
      freq,
      envAmp,
      envFreq,
      envSpeed,
      envOffset,
      detailAmp,
      lobeBias,
      lobeNorm,
      lobeSpeed,
      sheenAmp,
      sheenSpeed,
      bubble,
      translucency,
      isTiny,
      seed,
      innerColor,
      color,
      rimColor,
      warmColor,
      opacity,
      profile,
    ]
  );

  // ─── Jelly physics state ───
  // A damped spring on the wobble amplitude so impacts ring out and settle,
  // rather than the constant sine wobble the old version used.
  const wobble = useRef(0);
  const wobbleVel = useRef(0);

  // ─── Pointer contact state ───
  // Signed dent depth (negative = pressed inward) on its own damped spring, so
  // the surface eases in under the cursor and springs back past flat once when
  // the cursor leaves instead of deflating linearly.
  const touchAmp = useRef(0);
  const touchVel = useRef(0);
  // Contact direction as a unit vector in the mesh's own local space, which is
  // the space the vertex shader displaces in.
  const touchLocal = useRef(new THREE.Vector3(0, 0, 1));
  const touchTrail = useRef(new THREE.Vector3(0, 0, 1));
  const prevTouchLocal = useRef(new THREE.Vector3(0, 0, 1));

  // Slosh tracks acceleration with lag, giving the blob apparent mass.
  const slosh = useRef(new THREE.Vector3());
  const sloshVel = useRef(new THREE.Vector3());

  const smoothPos = useRef(new THREE.Vector3(...position));
  const prevPos = useRef(new THREE.Vector3(...position));
  const velocity = useRef(new THREE.Vector3());
  const prevVelocity = useRef(new THREE.Vector3());
  const accel = useRef(new THREE.Vector3());

  // Scratch — reused every frame. Allocating these inside useFrame churned a few
  // hundred vectors a second across the seven blobs.
  const sloshTarget = useRef(new THREE.Vector3());
  const sloshDelta = useRef(new THREE.Vector3());
  const localHit = useRef(new THREE.Vector3());

  const lastPointerX = useRef(0);
  const lastPointerY = useRef(0);

  // Birth lifecycle, resolved in place every frame. One struct per blob, reused —
  // `resolveBirth` writes into it rather than returning a fresh object.
  const birth = useRef<BirthState>(
    bornState({ shape: 1, scale: 1, density: 1, travel: 1 })
  );

  // Intro seed lifecycle, on the same reuse-a-struct discipline. Allocated for
  // every blob rather than only the seed because one struct is four numbers and
  // branching the allocation would put a conditional hook in the way.
  const seedState = useRef<SeedState>({
    scale: 1,
    rotation: 0,
    bridge: 1,
    visible: true,
  });

  // The point this body travels out of, in the parent's space. Held as a vector
  // so the per-frame lerp allocates nothing.
  const travelFrom = useRef(
    new THREE.Vector3(
      birthOrigin?.[0] ?? 0,
      birthOrigin?.[1] ?? 0,
      birthOrigin?.[2] ?? 0
    )
  );
  useLayoutEffect(() => {
    travelFrom.current.set(
      birthOrigin?.[0] ?? 0,
      birthOrigin?.[1] ?? 0,
      birthOrigin?.[2] ?? 0
    );
  }, [birthOrigin]);

  // The blob's own palette, kept aside so the seed's colour bridge has somewhere
  // to interpolate *to*. The uniforms themselves are the interpolation target and
  // are overwritten every frame while the bridge runs, so they cannot also serve
  // as the reference copy.
  const palette = useRef({
    deep: new THREE.Color(innerColor),
    mid: new THREE.Color(color),
    rim: new THREE.Color(rimColor),
    warm: new THREE.Color(warmColor),
  });
  const curtain = useRef({
    deep: new THREE.Color(INTRO_SEED_TINT.inner),
    mid: new THREE.Color(INTRO_SEED_TINT.mid),
    rim: new THREE.Color(INTRO_SEED_TINT.rim),
    warm: new THREE.Color(INTRO_SEED_TINT.warm),
  });
  useLayoutEffect(() => {
    palette.current.deep.set(innerColor);
    palette.current.mid.set(color);
    palette.current.rim.set(rimColor);
    palette.current.warm.set(warmColor);
  }, [innerColor, color, rimColor, warmColor]);

  // Opt this mesh into the metaball input pass. The pipeline draws the scene
  // twice from the same camera — once for the layer that becomes fluid, once for
  // everything that stays as it is — so the ambient background spheres and the
  // contact shadow are never fed through the alpha threshold, which would have
  // erased them (their opacity sits far below any usable isoline).
  //
  // Only the drawn mesh needs this: the renderer layer-tests each object but
  // still descends into its children, so the wrapping groups are unaffected.
  useLayoutEffect(() => {
    meshRef.current?.layers.set(FLUID_LAYER);
  }, []);

  /**
   * Hand the material the *same* uniform holders this component writes.
   *
   * R3F does not attach the `uniforms` prop by reference. It shallow-copies
   * each holder into a stable object of its own (`uniforms[name] = {...u}`,
   * see `applyProps`), so `material.uniforms.uTime` is a different object from
   * the one the frame loop below assigns to — and every **scalar** written per
   * frame is silently dropped on the way to the GPU. Vector and colour holders
   * survive by accident, because spreading a holder copies the reference its
   * `value` points at, which is what made this so quiet: the slosh and the
   * contact point kept moving while uTime sat at 0, so the bodies still had
   * *some* life and the frozen morph read as "subtle".
   *
   * Pointing the material back at these holders restores the contract the whole
   * component is written against — one memoised object, mutated in place, no
   * per-frame allocation, no React render. Re-applying the prop later is a
   * no-op rather than a re-copy, since `Object.assign(target, source)` with the
   * two now being the same object changes nothing.
   */
  /* eslint-disable react-hooks/immutability -- The material is a GPU resource
     hanging off a ref, not render output; re-pointing its uniform table is the
     same class of mutation as the layer assignment above. */
  useLayoutEffect(() => {
    const material = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (material) material.uniforms = uniforms;
  }, [uniforms]);
  /* eslint-enable react-hooks/immutability */

  /* eslint-disable react-hooks/immutability -- Writing shader uniforms and
     integrator state from the frame loop is the whole point of this component:
     they are GPU-bound mutable slots driven at display rate, not render output. */
  useFrame((state, rawDelta) => {
    if (!groupRef.current || !meshRef.current) return;

    // Clamp both ends: the upper bound stops a backgrounded tab from exploding
    // the integrators on return, the lower bound stops a zero-length first
    // frame from producing Infinity in the velocity/acceleration divisions —
    // a single NaN here poisons the slosh spring permanently.
    const dt = Math.min(Math.max(rawDelta, 1 / 240), 1 / 30);
    const t = state.clock.getElapsedTime();

    const px = pointerRef.current?.x ?? 0;
    const py = pointerRef.current?.y ?? 0;

    // ── Target position: idle float + pointer parallax ── (Phase 2)
    //
    // The two constants on floatX are both measured off the reference, whose
    // centroid was tracked across all 27 unique `ref-frames-2` captures with the
    // fused satellite trimmed out of the centroid (it inflates mean radius by
    // ~4% when it merges, and drags the centre with it).
    //
    // Amplitude — the reference's wander is strongly *anisotropic*: 18.0% of
    // radius peak-to-peak vertically against 7.0% horizontally, a 2.6:1 ratio
    // (2.98:1 on standard deviations, which is the fairer figure — the capture
    // catches one partial traverse, so both peak-to-peak numbers are lower
    // bounds while the sd ratio is not). It rises and falls far more than it
    // slides. The old 0.5 gave 2:1 before the group's own drift was counted and
    // 1.45:1 after, i.e. near-isotropic. 0.30 puts the pair at 2.94:1.
    //
    // Frequency — 0.7 against floatY's 1.0 is 7:10, so the screen path is a
    // closed Lissajous figure that exactly retraces every 419 s. 0.61 does not
    // close inside any plausible session, so the body never repeats a path.
    //
    // Neither can lock to the Phase 1 envelope: that evolves by drifting through
    // a 3D noise field, which is aperiodic, so there is no frequency for a
    // sinusoid to phase-lock onto.
    const floatX = Math.cos(t * floatSpeed * 0.61 + seed) * floatAmplitude * 0.30;
    const floatY = Math.sin(t * floatSpeed + seed) * floatAmplitude;
    const floatZ = Math.sin(t * floatSpeed * 0.5 + seed) * 0.15;

    const targetX = position[0] + floatX + px * mouseStrength;
    const targetY = position[1] + floatY + py * mouseStrength;
    const targetZ = position[2] + floatZ;

    prevPos.current.copy(smoothPos.current);
    prevVelocity.current.copy(velocity.current);

    smoothPos.current.x += (targetX - smoothPos.current.x) * 0.03;
    smoothPos.current.y += (targetY - smoothPos.current.y) * 0.03;
    smoothPos.current.z += (targetZ - smoothPos.current.z) * 0.03;

    groupRef.current.position.copy(smoothPos.current);

    // ── Travel ── (intro only, see `webgl/config/birth.ts`)
    //
    // The body is born at the point the intro seed collapsed into and moves out
    // to its composition position, rather than swelling into existence where it
    // will eventually sit. One origin point is what turns two animations into
    // cause and effect.
    //
    // Read through `resolveTravel` rather than off the `BirthState` struct the
    // block near the bottom of this callback fills, because the two want opposite
    // positions in the frame. Birth scales what the morph and the springs
    // produced and therefore has to run last; travel interpolates the *position*
    // those same systems just wrote, so it has to run here, the moment after they
    // write it. Both are pure functions of the shared clock and allocate nothing,
    // so resolving the channel at its own natural site costs a multiply.
    //
    // Interpolating the written position — rather than the target the springs are
    // chasing — is the load-bearing detail. It keeps the float, the parallax and
    // the slosh fully alive during the flight, so what crosses the screen is a
    // living drop rather than a frozen pose sliding; and it keeps the travel
    // velocity out of the slosh integrator below, which is tuned for drift an
    // order of magnitude slower and would land the body wobbling.
    if (birthOrigin && !introSeed) {
      const travel = resolveTravel(birthOrder);
      if (travel < 1) {
        groupRef.current.position.lerpVectors(
          travelFrom.current,
          smoothPos.current,
          travel
        );
      }
    }

    // ── Derive velocity / acceleration for the slosh ──
    velocity.current.subVectors(smoothPos.current, prevPos.current).divideScalar(dt);
    accel.current.subVectors(velocity.current, prevVelocity.current).divideScalar(dt);

    // ── Pointer contact ──
    const contact = target.contact;
    let depth = 0;

    // Development-only A/B switch between this vertex-stage dent and the Phase 3
    // pointer field. Held here rather than upstream in the driver so that
    // `entered` / `exited` / `struck` keep firing normally and the springs still
    // settle — switching modes must not leave an integrator mid-flight.
    const legacyTouch = LEGACY_TOUCH_MODES[FLUID_PARAMS.interactionMode];

    if (contact.active && legacyTouch) {
      // World → local every frame. The contact is anchored in *world* space by
      // the driver, so re-deriving the local direction here keeps the dent
      // planted under the cursor while the body spins, floats and scrolls
      // underneath it — and keeps it correct through camera moves and resizes,
      // since the driver's ray is rebuilt from the live camera each frame.
      const local = localHit.current.copy(contact.point);
      meshRef.current.worldToLocal(local);
      const len = local.length();
      if (len > 1e-6) local.divideScalar(len);

      if (contact.entered) {
        // First frame of contact: no history, so seed it rather than measuring a
        // bogus surface speed against wherever the last contact happened to be.
        prevTouchLocal.current.copy(local);
        touchTrail.current.copy(local);
        wobbleVel.current -= SPHERE_DISTORTION.impactKick;
      }

      // How fast the contact slides across the surface, in unit lengths/second.
      const surfaceSpeed = local.distanceTo(prevTouchLocal.current) / dt;
      prevTouchLocal.current.copy(local);
      touchLocal.current.copy(local);

      const speedGain = Math.min(
        surfaceSpeed * SPHERE_DISTORTION.velocityInfluence,
        SPHERE_DISTORTION.velocityInfluenceMax
      );

      depth =
        SPHERE_DISTORTION.distortionStrength *
        profile.depthScale *
        (1 + speedGain) *
        (contact.pressed ? SPHERE_DISTORTION.pressMultiplier : 1);

      if (contact.struck) {
        uniforms.uRipplePoint.value.copy(local);
        uniforms.uRippleStart.value = t;
        uniforms.uRippleStrength.value = 1.0;
        // Kick the spring so the whole body rings, not just the impact point.
        wobbleVel.current -= 2.6;
      }
    } else if (contact.exited && legacyTouch) {
      // Leave touchLocal where it was: the dent has to spring back from where it
      // actually is, and from here on it rides with the surface as it rotates.
      wobbleVel.current += SPHERE_DISTORTION.impactKick * 0.6;
    }

    // Smear tail chases the contact point. Frame-rate independent, so the trail
    // has the same length whether the display runs at 60 or 120Hz.
    const chase = 1 - Math.exp(-SPHERE_DISTORTION.trailChase * dt);
    touchTrail.current.lerp(touchLocal.current, chase);
    const trailLen = touchTrail.current.length();
    if (trailLen > 1e-6) touchTrail.current.divideScalar(trailLen);

    // ── Integrate the dent spring toward its target depth ──
    const touchTargetAmp = -depth;
    touchVel.current +=
      (-SPHERE_DISTORTION.returnStiffness * (touchAmp.current - touchTargetAmp) -
        SPHERE_DISTORTION.returnDamping * touchVel.current) *
      dt;
    touchAmp.current += touchVel.current * dt;

    // ── Pointer speed feeds the jelly spring ──
    // Only at full strength on the blob actually being touched; the rest keep a
    // sliver of it as ambience, so the group doesn't twitch in unison and drown
    // out the one under the cursor.
    const dxp = px - lastPointerX.current;
    const dyp = py - lastPointerY.current;
    const pointerSpeed = Math.sqrt(dxp * dxp + dyp * dyp) / dt;
    lastPointerX.current = px;
    lastPointerY.current = py;
    const wobbleShare = contact.active ? 1 : SPHERE_DISTORTION.ambientWobbleShare;
    wobbleVel.current += Math.min(pointerSpeed * 0.01, 0.9) * dt * 30.0 * wobbleShare;

    // ── Integrate the wobble spring (underdamped → visible ringing) ──
    const k = 46.0;
    const c = 5.2;
    wobbleVel.current += (-k * wobble.current - c * wobbleVel.current) * dt;
    wobble.current += wobbleVel.current * dt;
    wobble.current = THREE.MathUtils.clamp(wobble.current, -0.55, 0.55);

    // ── Integrate the slosh spring toward lagged acceleration ──
    sloshTarget.current.copy(accel.current).multiplyScalar(-0.0016).clampLength(0, 0.22);
    const sk = 26.0;
    const sc = 6.0;
    sloshDelta.current
      .copy(slosh.current)
      .multiplyScalar(-sk)
      .addScaledVector(sloshVel.current, -sc)
      .addScaledVector(sloshTarget.current, sk)
      .multiplyScalar(dt);
    sloshVel.current.add(sloshDelta.current);
    slosh.current.addScaledVector(sloshVel.current, dt);

    // Hard reset if any spring ever goes non-finite, so a transient numeric
    // blowup self-heals instead of freezing the blob for the rest of the session.
    if (
      !Number.isFinite(slosh.current.lengthSq()) ||
      !Number.isFinite(wobble.current) ||
      !Number.isFinite(touchAmp.current)
    ) {
      slosh.current.set(0, 0, 0);
      sloshVel.current.set(0, 0, 0);
      wobble.current = 0;
      wobbleVel.current = 0;
      touchAmp.current = 0;
      touchVel.current = 0;
    }
    slosh.current.clampLength(0, 0.3);

    // The spring is allowed to overshoot for the elastic rebound, but not far
    // enough to turn the blob inside out.
    const touchLimit = SPHERE_DISTORTION.distortionStrength * profile.depthScale * 2.4;
    touchAmp.current = THREE.MathUtils.clamp(touchAmp.current, -touchLimit, touchLimit);

    // Idle breathing keeps the blob alive when nothing is happening.
    const breathe = Math.sin(t * 0.42 + seed) * 0.022 + Math.sin(t * 0.27 + seed * 1.7) * 0.015;

    // ── Birth ──
    //
    // Read from the shared clock rather than measured from this component's own
    // mount: the whole field has to agree on when it was born, and a mount time
    // is whenever React happened to commit. Costs one struct write per blob per
    // frame and allocates nothing.
    //
    // Deliberately below everything above it. The morph, the springs and the
    // drift have all already run and written their state for this frame, and
    // birth only scales what they produced — which is the structural reason the
    // blob is morphing *during* its birth rather than after it.
    if (introSeed) {
      // The seed is not being born, it is leaving — so `shape` stays at 1 and the
      // body carries the same settled silhouette wobble the hero blobs do. That
      // shared character is what makes the merge at T = 0.8 invisible: the giant
      // red-equivalent sphere and the chain that comes out of it are the same
      // material at two sizes, not two objects that happen to overlap.
      const sd = resolveSeed(seedState.current);
      groupRef.current.visible = sd.visible;
      if (!sd.visible) return;

      uniforms.uBirth.value = 1;
      uniforms.uBirthScale.value = sd.scale;
      uniforms.uBirthDensity.value = 1;
      uniforms.uBirthAmp.value = 0;

      // The unwind. Applied to the group rather than the mesh so it composes with
      // — rather than fights — the slow x/y tumble written at the end of this
      // callback, which is the motion the body already had.
      groupRef.current.rotation.z = sd.rotation;

      // The colour bridge. Bravis authored theirs into two static textures
      // deliberately pitched between the brand red and the hero palette; ours is
      // a lerp, which is strictly better because it can start *exactly* on the
      // curtain's own colour instead of near it.
      uniforms.uColorDeep.value
        .copy(curtain.current.deep)
        .lerp(palette.current.deep, sd.bridge);
      uniforms.uColorMid.value
        .copy(curtain.current.mid)
        .lerp(palette.current.mid, sd.bridge);
      uniforms.uColorRim.value
        .copy(curtain.current.rim)
        .lerp(palette.current.rim, sd.bridge);
      uniforms.uColorWarm.value
        .copy(curtain.current.warm)
        .lerp(palette.current.warm, sd.bridge);
    } else {
      const b = resolveBirth(birthOrder, birth.current);
      uniforms.uBirth.value = b.shape;
      uniforms.uBirthScale.value = b.scale;
      uniforms.uBirthDensity.value = b.density;
      uniforms.uBirthAmp.value = BIRTH_PARAMS.strength;
    }

    // ── Breath ──
    //
    // Multiplied into whatever the lifecycle above wrote rather than assigned
    // over it, so a body that is still being born breathes *as* it arrives
    // instead of snapping to full size for the pulse. At amplitude 0 — every
    // body on the chain — this is a multiply by 1 and the steady state is
    // unchanged.
    //
    // Phase falls back to the blob's own `seed` — the same number the envelope,
    // the lobe precession and the sheen are seeded from — so a body breathes out
    // of step with its neighbours without the caller having to say anything. A
    // caller that needs the relationship to be exact passes `breathPhase`.
    if (breath.amp > 0) {
      // Two sines an irrational ratio apart rather than one. A single sine is a
      // loop, and at these periods it is a loop short enough to see; the second
      // term at 0.41x the rate and a third of the weight means the envelope does
      // not come back to the same shape, which is the difference between a body
      // that breathes and a body that pulses.
      const b =
        Math.sin(t * breath.speed + breath.phase) * 0.75 +
        Math.sin(t * breath.speed * 0.41 + breath.phase * 1.7) * 0.25;
      uniforms.uBirthScale.value *= 1 + b * breath.amp;
    }

    // ── Emphasis ──
    //
    // Frame-rate independent, so the approach takes the same wall-clock time on
    // a 60 Hz panel and a 120 Hz one — the same `1 - (1 - k)^dt` form the scroll
    // chase uses. ~0.35 s to close most of the gap, which is slow enough to read
    // as the body swelling or yielding rather than as a state flipping.
    scaleSmooth.current +=
      (scaleTarget.current - scaleSmooth.current) * (1 - Math.pow(0.0001, dt));
    uniforms.uBirthScale.value *= scaleSmooth.current;

    // ── Push to uniforms ──
    uniforms.uTime.value = t;
    uniforms.uWobble.value = wobble.current * 0.55 + breathe;
    uniforms.uSlosh.value.copy(slosh.current);
    uniforms.uTouchAmp.value = touchAmp.current;
    uniforms.uTouchPoint.value.copy(touchLocal.current);
    uniforms.uTouchTrail.value.copy(touchTrail.current);

    uniforms.uRippleStrength.value *= 1.0 - dt * 0.5;

    // Slow tumble so the surface flow is never seen from a fixed angle.
    meshRef.current.rotation.x = t * 0.025;
    meshRef.current.rotation.y = t * 0.04;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={groupRef} position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, segs, segs]} />
        <shaderMaterial
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite
        />
      </mesh>
      {children}
    </group>
  );
}
