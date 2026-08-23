import { dissolveNoiseGlsl } from './dissolveNoise.ts';

/** Shared declarations injected into visible, depth, and distance passes. */
export const dissolveFragmentPars = /* glsl */ `
uniform float uDissolveAmount;
uniform float uNoiseScale;
uniform vec3 uNoiseOffset;
varying vec3 vDissolveLocalPosition;
${dissolveNoiseGlsl}
`;

/** Gameplay-owned threshold. A strict zero guard guarantees an intact reset. */
export const dissolveFragmentDiscard = /* glsl */ `
float dissolveSurfaceMask = dissolveMask(vDissolveLocalPosition);
if (uDissolveAmount > 0.0 && dissolveSurfaceMask <= uDissolveAmount) {
  discard;
}
`;

/** Extra surface-only uniforms; shadow passes need only the shared mask. */
export const dissolveFragmentEdgePars = /* glsl */ `
uniform float uDissolveEdgeWidth;
uniform vec3 uDissolveEdgeColour;
uniform float uAimHighlightStrength;
uniform float uAimSelectedStrength;
uniform vec3 uAimHighlightColour;
uniform float uBurnHighlightStrength;
uniform vec3 uBurnHighlightColour;
uniform float uCorrosionPresentationTime;
`;

/** Add a high-contrast corrosion band without replacing standard lighting. */
export const dissolveFragmentEdge = /* glsl */ `
float dissolveEdgeDistance = max(dissolveSurfaceMask - uDissolveAmount, 0.0);
float dissolveEdgeBand = 1.0 - smoothstep(
  0.0,
  uDissolveEdgeWidth,
  dissolveEdgeDistance
);
float dissolveIsActive = step(0.0001, uDissolveAmount) *
  (1.0 - step(0.9999, uDissolveAmount));
totalEmissiveRadiance += uDissolveEdgeColour *
  dissolveEdgeBand * dissolveIsActive * 1.65;

// Aim presentation reuses the target-local dissolve field without changing its
// threshold. Candidates receive sparse corrosion contours; selection adds a
// clearly different diagonal hatch and pulse so the state is not colour-only.
float aimContourPhase = abs(fract(dissolveSurfaceMask * 5.0) - 0.5);
float aimContour = 1.0 - smoothstep(0.012, 0.035, aimContourPhase);
float aimHatchPhase = abs(
  fract((vDissolveLocalPosition.x + vDissolveLocalPosition.y * 0.72 +
    vDissolveLocalPosition.z * 0.43) * 5.2) - 0.5
);
float aimHatch = 1.0 - smoothstep(0.018, 0.055, aimHatchPhase);
float aimPulse = 0.82 + 0.18 * sin(uCorrosionPresentationTime * 7.0);
float aimPattern = mix(aimContour * 0.38, max(aimContour, aimHatch * 0.72),
  uAimSelectedStrength);
totalEmissiveRadiance += uAimHighlightColour * aimPattern *
  uAimHighlightStrength * mix(1.0, aimPulse * 1.25, uAimSelectedStrength);

// A bounded target-local sizzle bridges a valid impact into the gameplay-owned
// dissolve boundary. Presentation strength is event/progress-derived on CPU.
float burnSpeckle = smoothstep(
  0.68,
  0.9,
  dissolveValueNoise(
    vDissolveLocalPosition * 4.2 +
      vec3(0.0, uCorrosionPresentationTime * 0.55, 0.0) + uNoiseOffset
  )
);
float burnPulse = 0.76 + 0.24 * sin(uCorrosionPresentationTime * 15.0);
totalEmissiveRadiance += uBurnHighlightColour * burnSpeckle * burnPulse *
  uBurnHighlightStrength * 1.8;
`;
