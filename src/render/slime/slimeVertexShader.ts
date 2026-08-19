export const slimeVertexShader = /* glsl */ `
uniform float uTime;
uniform float uWobbleAmplitude;
uniform float uWobbleFrequency;
uniform float uWobbleSpeed;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vSurfaceWobble;

// Evaluated in object space so the wave pattern stays attached while the
// slime moves. The gradient is the analytic derivative of the displacement
// field and is used to tilt the normal with the deformed surface.
void evaluateWobble(
  in vec3 objectPosition,
  out float signedWobble,
  out vec3 displacementGradient
) {
  float phaseA =
    (objectPosition.x + objectPosition.z * 1.37) * uWobbleFrequency +
    uTime * uWobbleSpeed;
  float phaseB =
    (objectPosition.z - objectPosition.x * 0.82) *
      (uWobbleFrequency * 0.73) -
    uTime * (uWobbleSpeed * 0.79);

  float waveA = sin(phaseA);
  float waveB = sin(phaseB);
  float combinedWave = waveA * 0.58 + waveB * 0.42;

  // The 0.45 m sphere reaches y=-0.45. Keeping the bottom band still avoids
  // an obvious gap or sliding at the collider's floor-contact region.
  const float maskStart = -0.36;
  const float maskEnd = 0.02;
  float maskT = clamp(
    (objectPosition.y - maskStart) / (maskEnd - maskStart),
    0.0,
    1.0
  );
  float baseMask = maskT * maskT * (3.0 - 2.0 * maskT);
  float maskDerivative = 0.0;
  if (maskT > 0.0 && maskT < 1.0) {
    maskDerivative =
      (6.0 * maskT * (1.0 - maskT)) / (maskEnd - maskStart);
  }

  float waveDerivativeX =
    cos(phaseA) * 0.58 * uWobbleFrequency +
    cos(phaseB) * 0.42 * (-0.82 * uWobbleFrequency * 0.73);
  float waveDerivativeZ =
    cos(phaseA) * 0.58 * (1.37 * uWobbleFrequency) +
    cos(phaseB) * 0.42 * (uWobbleFrequency * 0.73);

  signedWobble = combinedWave * baseMask;
  displacementGradient = uWobbleAmplitude * vec3(
    waveDerivativeX * baseMask,
    combinedWave * maskDerivative,
    waveDerivativeZ * baseMask
  );
}

void main() {
  vec3 objectNormal = normalize(normal);
  float signedWobble;
  vec3 displacementGradient;
  evaluateWobble(position, signedWobble, displacementGradient);

  vec3 deformedObjectPosition =
    position + objectNormal * (uWobbleAmplitude * signedWobble);

  // For a normal-displaced surface, subtracting the tangential displacement
  // gradient gives a low-cost first-order normal correction. The model uses
  // only rigid/uniform scale, so mat3(modelMatrix) is valid object-to-world.
  vec3 tangentialGradient = displacementGradient -
    objectNormal * dot(displacementGradient, objectNormal);
  vec3 deformedObjectNormal = normalize(
    objectNormal - tangentialGradient
  );

  vec4 worldPosition = modelMatrix * vec4(deformedObjectPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * deformedObjectNormal);
  vSurfaceWobble = signedWobble;

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
