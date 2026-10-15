import { GEL_MAXIMUM_BASE_OFFSET_METRES, GEL_MAXIMUM_JUMP_BASE_OFFSET_METRES } from '../slime/GelElasticMotion.ts';

export const GOOP_MAXIMUM_BASE_OFFSET_METRES = GEL_MAXIMUM_BASE_OFFSET_METRES;
export const GOOP_MAXIMUM_JUMP_BASE_OFFSET_METRES = GEL_MAXIMUM_JUMP_BASE_OFFSET_METRES;
export const GOOP_MAXIMUM_BASE_DISPLACEMENT_METRES = Math.hypot(
  GOOP_MAXIMUM_BASE_OFFSET_METRES, GOOP_MAXIMUM_JUMP_BASE_OFFSET_METRES,
);

const baseFunctions = /* glsl */ `
uniform vec3 uGoopBaseOffset;

float goopBaseMask(float y) {
  // Shift only the pooled skirt, below the eyes and crest.
  return 1.0 - smoothstep(-0.41, -0.31, y);
}
`;

const baseNormal = /* glsl */ `
float goopBaseHeight = clamp((position.y + 0.41) / 0.10, 0.0, 1.0);
float goopBaseSlope = -6.0 * goopBaseHeight * (1.0 - goopBaseHeight) / 0.10;
// Inverse transpose of the offset's vertical gradient, including jump drag.
// At the maximum upward offset this denominator stays at least 0.4.
objectNormal.y -= goopBaseSlope * dot(uGoopBaseOffset, objectNormal) /
  (1.0 + goopBaseSlope * uGoopBaseOffset.y);
objectNormal = normalize(objectNormal);
`;

/** The lower slime trails movement; visible and shadow passes share the offset. */
export function injectGoopBaseVertexShader(vertexShader: string, shadowPass: boolean): string {
  return (baseFunctions + vertexShader)
    .replace('transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;',
      'transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;\ntransformed += goopBaseMask(transformed.y) * uGoopBaseOffset;')
    .replace('#include <defaultnormal_vertex>', `${shadowPass ? '' : baseNormal}\n#include <defaultnormal_vertex>`);
}
