/**
 * Tuning surface for the pointer-driven surface distortion on the hero blobs.
 *
 * Everything here is authored in *unit-sphere* space: the blob shader builds the
 * body as a radial displacement of a unit sphere and multiplies by the radius at
 * the end, so a strength of 0.1 means "one tenth of this blob's radius" no
 * matter how big the blob is, and a distance of 1.0 is a chord length across the
 * unit sphere (2.0 reaches the antipode).
 */
export const SPHERE_DISTORTION = {
  /** Peak inward depth of the dent, as a fraction of the blob's radius. */
  distortionStrength: 0.15,

  /**
   * Chord radius of the dent on the unit sphere. Roughly 0.5 covers a quarter
   * of the visible face; much above 1.0 stops reading as a local touch and
   * starts looking like the whole blob is being squashed.
   */
  distortionRadius: 0.52,

  /**
   * Gaussian falloff tightness — `exp(-(d/r)^2 * smoothness)`. Higher values
   * concentrate the dent and leave a longer, softer skirt around it.
   */
  distortionSmoothness: 2.6,

  /**
   * Height of the outward rim around the dent, as a fraction of the dent depth.
   * This is what sells "elastic membrane": the volume pushed in at the contact
   * point has to go somewhere, so it swells in a ring just outside the core.
   */
  distortionRim: 0.42,

  /** Spring stiffness driving the dent depth toward its target. */
  returnStiffness: 82,

  /**
   * Spring damping. Kept under the critical value (~2*sqrt(stiffness) ≈ 18) so
   * the release overshoots once and settles, instead of deflating linearly.
   */
  returnDamping: 9.5,

  /** Rate (per second) at which the smear tail chases the contact point. */
  trailChase: 9.0,

  /** Depth of the smear tail relative to the main dent. */
  trailWeight: 0.55,

  /**
   * Extra depth from how fast the contact point slides across the surface,
   * in unit-sphere lengths per second. Capped by `velocityInfluenceMax`.
   */
  velocityInfluence: 0.055,
  velocityInfluenceMax: 0.7,

  /** Depth multiplier while the pointer is held down. */
  pressMultiplier: 1.7,

  /**
   * Ray-test radius padding. The shaded silhouette bulges past the base radius
   * because of the noise displacement, so the hit sphere has to as well —
   * otherwise the surface visibly stops responding near its own outline.
   */
  hitPadding: 1.16,

  /**
   * Kick given to the blob's whole-body wobble spring when the pointer arrives
   * at or leaves the surface, so contact rings through the body.
   */
  impactKick: 0.85,

  /**
   * How much of the ambient "pointer moved anywhere on screen" wobble the
   * non-touched blobs keep. Full strength on every blob would make the whole
   * group twitch in unison and drown out the blob actually being touched.
   */
  ambientWobbleShare: 0.18,
} as const;

/**
 * Relative dent geometry per blob size.
 *
 * A dent of a fixed *relative* size looks wrong across two orders of magnitude
 * of radius: on the 2.8-unit main blob it should be a local dimple, while a
 * 0.1-unit bead has no room for one and should simply squash toward the cursor.
 */
export function distortionProfile(radius: number): {
  radiusScale: number;
  depthScale: number;
} {
  if (radius < 0.2) return { radiusScale: 2.1, depthScale: 1.5 };
  if (radius < 0.8) return { radiusScale: 1.45, depthScale: 1.2 };
  if (radius < 2.4) return { radiusScale: 1.0, depthScale: 1.0 };
  return { radiusScale: 0.82, depthScale: 0.95 };
}
