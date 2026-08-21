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
`;
