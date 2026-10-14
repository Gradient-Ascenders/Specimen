export const GOOP_MAXIMUM_BASE_OFFSET_METRES = 0.08;

const baseFunctions = /* glsl */ `
uniform vec2 uGoopBaseOffset;

float goopBaseMask(float y) {
  // Shift only the pooled skirt, below the eyes and crest, along the floor.
  return 1.0 - smoothstep(-0.41, -0.31, y);
}
`;

const baseNormal = /* glsl */ `
float goopBaseHeight = clamp((position.y + 0.41) / 0.10, 0.0, 1.0);
float goopBaseSlope = -6.0 * goopBaseHeight * (1.0 - goopBaseHeight) / 0.10;
// Inverse transpose of the horizontal offset's vertical gradient.
objectNormal.y -= goopBaseSlope * dot(uGoopBaseOffset, objectNormal.xz);
objectNormal = normalize(objectNormal);
`;

/** The lower slime trails movement; visible and shadow passes share the offset. */
export function injectGoopBaseVertexShader(vertexShader: string, shadowPass: boolean): string {
  return (baseFunctions + vertexShader)
    .replace('transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;',
      'transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;\ntransformed.xz += goopBaseMask(transformed.y) * uGoopBaseOffset;')
    .replace('#include <defaultnormal_vertex>', `${shadowPass ? '' : baseNormal}\n#include <defaultnormal_vertex>`);
}
