/** Declarations injected into Three.js's standard and shadow vertex shaders. */
export const dissolveVertexPars = /* glsl */ `
varying vec3 vDissolveLocalPosition;
`;

/**
 * Capture Three.js's fully transformed local position. This is deliberately
 * inserted after morphing, skinning, and displacement but before projection.
 */
export const dissolveVertexPosition = /* glsl */ `
vDissolveLocalPosition = transformed;
`;
