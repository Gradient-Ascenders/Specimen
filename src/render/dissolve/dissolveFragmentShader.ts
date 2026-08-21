import { dissolveNoiseGlsl } from './dissolveNoise.ts';

export const dissolveFragmentShader = /* glsl */ `
uniform float uDissolveAmount;
uniform float uNoiseScale;
uniform float uEdgeWidth;
uniform vec3 uNoiseOffset;
uniform vec3 uBaseColour;
uniform vec3 uEmissiveColour;
uniform vec3 uEdgeColour;
uniform vec3 uKeyLightDirection;
uniform vec3 uKeyLightRadiance;
uniform vec3 uHemisphereSkyRadiance;
uniform vec3 uHemisphereGroundRadiance;
uniform float uOpacity;

varying vec3 vLocalPosition;
varying vec3 vWorldNormal;

${dissolveNoiseGlsl}

void main() {
  float mask = dissolveMask(vLocalPosition);

  // The gameplay amount is the only threshold authority. A strict zero guard
  // guarantees a completely intact reset even at a rare zero-valued mask.
  if (uDissolveAmount > 0.0 && mask <= uDissolveAmount) {
    discard;
  }

  vec3 normalWorld = normalize(vWorldNormal);
  vec3 lightDirectionWorld = normalize(uKeyLightDirection);
  float hemisphereMix = normalWorld.y * 0.5 + 0.5;
  vec3 hemisphereRadiance = mix(
    uHemisphereGroundRadiance,
    uHemisphereSkyRadiance,
    hemisphereMix
  );
  float diffuseFactor = max(dot(normalWorld, lightDirectionWorld), 0.0);
  vec3 litSurface = uBaseColour * (
    hemisphereRadiance + uKeyLightRadiance * diffuseFactor
  );

  float edgeDistance = max(mask - uDissolveAmount, 0.0);
  float edgeBand = 1.0 - smoothstep(0.0, uEdgeWidth, edgeDistance);
  float dissolveActive = step(0.0001, uDissolveAmount) *
    (1.0 - step(0.9999, uDissolveAmount));
  edgeBand *= dissolveActive;

  // The emissive green-white band remains legible when Cultivation's direct
  // lighting is dim or occluded; it does not alter the discard threshold.
  vec3 corrosionEdge = uEdgeColour * edgeBand * 1.65;
  vec3 colour = litSurface + uEmissiveColour + corrosionEdge;

  gl_FragColor = vec4(colour, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
