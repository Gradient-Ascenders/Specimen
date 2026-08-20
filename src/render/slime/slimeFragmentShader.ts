export const slimeFragmentShader = /* glsl */ `
uniform vec3 uBaseColour;
uniform float uOpacity;
uniform vec3 uKeyLightDirection;
uniform vec3 uKeyLightRadiance;
uniform vec3 uHemisphereSkyRadiance;
uniform vec3 uHemisphereGroundRadiance;
uniform float uSpecularStrength;
uniform float uShininess;
uniform float uRimStrength;
uniform float uRimPower;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vDeformation;

void main() {
  vec3 normalWorld = normalize(vWorldNormal);
  vec3 viewDirectionWorld = normalize(cameraPosition - vWorldPosition);
  vec3 lightDirectionWorld = normalize(uKeyLightDirection);

  float hemisphereMix = normalWorld.y * 0.5 + 0.5;
  vec3 hemisphereRadiance = mix(
    uHemisphereGroundRadiance,
    uHemisphereSkyRadiance,
    hemisphereMix
  );

  float diffuseFactor = max(dot(normalWorld, lightDirectionWorld), 0.0);
  vec3 surfaceColour = uBaseColour * (1.0 + vDeformation * 0.055);
  vec3 diffuse = surfaceColour * (
    hemisphereRadiance + uKeyLightRadiance * diffuseFactor
  );

  // A tight, neutral dielectric highlight reads as a wet coating rather than
  // coloured metallic reflection.
  vec3 halfVectorWorld = lightDirectionWorld + viewDirectionWorld;
  vec3 halfDirectionWorld = halfVectorWorld /
    max(length(halfVectorWorld), 0.0001);
  float specularFactor = pow(
    max(dot(normalWorld, halfDirectionWorld), 0.0),
    uShininess
  );
  specularFactor *= uSpecularStrength * (0.2 + diffuseFactor * 0.8);
  vec3 wetSpecular =
    mix(vec3(1.0), uBaseColour, 0.08) *
    uKeyLightRadiance *
    specularFactor;

  // Fresnel grows toward grazing angles, so the rim follows both the camera
  // and the corrected deformed normal rather than a fixed screen direction.
  float fresnel = pow(
    1.0 - max(dot(normalWorld, viewDirectionWorld), 0.0),
    uRimPower
  );
  vec3 rimColour = mix(uBaseColour, vec3(0.78, 1.0, 0.96), 0.72);
  vec3 rim = rimColour * fresnel * uRimStrength *
    (0.35 + hemisphereRadiance * 0.65);

  gl_FragColor = vec4(diffuse + wetSpecular + rim, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
