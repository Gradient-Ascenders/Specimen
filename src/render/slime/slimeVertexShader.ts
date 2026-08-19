export const slimeVertexShader = /* glsl */ `
// Three.js supplies position/normal in object space. Every deformation input
// below is also object-local; only the final result and varyings enter world
// space, keeping surface, velocity and impact directions mathematically aligned.
uniform float uTime;
uniform float uWobbleAmplitude;
uniform float uWobbleFrequency;
uniform float uWobbleSpeed;

uniform float uSpeed;
uniform float uLocomotionPhase;
uniform vec3 uMoveDirectionLocal;
uniform vec3 uSurfaceNormalLocal;
uniform vec3 uSurfaceTangentLocal;
uniform float uGrounded;
uniform float uAttached;
uniform float uJumpCharge;
uniform float uSquash;
uniform float uStretch;
uniform vec3 uStretchDirectionLocal;
uniform vec3 uInertiaLocal;
uniform vec3 uImpactPointLocal;
uniform vec3 uImpactNormalLocal;
uniform float uImpactStrength;
uniform float uImpactAge;
uniform float uImpactElasticity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vDeformation;

const float SLIME_RADIUS = 0.45;
const float BASE_MASK_START = -0.36;
const float BASE_MASK_END = 0.02;
const float GROUND_FLATTEN_MAX = 0.035;
const float CHARGE_SQUASH_MAX = 0.30;
const float CHARGE_CENTRE_DROP_MAX = 0.018;
const float SLITHER_AMPLITUDE = 0.022;
const float SLITHER_SPATIAL_FREQUENCY = 11.0;
const float LOCOMOTION_STRETCH_MAX = 0.055;
const float SIDE_SHIFT_MAX = 0.014;
const float INERTIA_SHEAR_MAX = 0.022;
const float STICKY_PEEL_MAX = 0.012;
const float IMPACT_SQUASH_MAX = 0.32;
const float IMPACT_RIPPLE_AMPLITUDE = 0.018;
const float IMPACT_RIPPLE_FREQUENCY = 30.0;
const float IMPACT_RIPPLE_PROPAGATION_SPEED = 18.0;
const float IMPACT_RIPPLE_DISTANCE_DECAY = 4.0;
const float IMPACT_RIPPLE_TIME_DECAY = 6.0;

void evaluateBaseMask(
  float surfaceHeight,
  out float baseMask,
  out float maskDerivative
) {
  float maskT = clamp(
    (surfaceHeight - BASE_MASK_START) /
      (BASE_MASK_END - BASE_MASK_START),
    0.0,
    1.0
  );
  baseMask = maskT * maskT * (3.0 - 2.0 * maskT);
  maskDerivative = 0.0;
  if (maskT > 0.0 && maskT < 1.0) {
    maskDerivative =
      (6.0 * maskT * (1.0 - maskT)) /
      (BASE_MASK_END - BASE_MASK_START);
  }
}

void computeIdleWobble(
  vec3 objectPosition,
  vec3 surfaceNormal,
  vec3 tangentA,
  vec3 tangentB,
  float baseMask,
  float maskDerivative,
  out float displacement,
  out vec3 displacementGradient
) {
  vec3 phaseDirectionA = tangentA + tangentB * 1.37;
  vec3 phaseDirectionB = tangentB - tangentA * 0.82;
  float phaseA =
    dot(objectPosition, phaseDirectionA) * uWobbleFrequency +
    uTime * uWobbleSpeed;
  float phaseB =
    dot(objectPosition, phaseDirectionB) *
      (uWobbleFrequency * 0.73) -
    uTime * (uWobbleSpeed * 0.79);
  float combinedWave = sin(phaseA) * 0.58 + sin(phaseB) * 0.42;
  float amplitude = uWobbleAmplitude *
    (1.0 + uSpeed * 0.28 + uJumpCharge * 0.12);

  vec3 waveGradient =
    cos(phaseA) * 0.58 * uWobbleFrequency * phaseDirectionA +
    cos(phaseB) * 0.42 * (uWobbleFrequency * 0.73) *
      phaseDirectionB;

  displacement = amplitude * combinedWave * baseMask;
  displacementGradient = amplitude * (
    waveGradient * baseMask +
    surfaceNormal * (combinedWave * maskDerivative)
  );
}

void computeSlither(
  vec3 objectPosition,
  vec3 moveDirection,
  vec3 surfaceNormal,
  float baseMask,
  float maskDerivative,
  float support,
  out float displacement,
  out vec3 displacementGradient
) {
  float phase =
    dot(objectPosition, moveDirection) * SLITHER_SPATIAL_FREQUENCY -
    uLocomotionPhase;
  float wave = sin(phase);
  float surfaceMask = 0.35 + baseMask * 0.65;
  float amplitude = SLITHER_AMPLITUDE * uSpeed * support;

  displacement = wave * surfaceMask * amplitude;
  displacementGradient = amplitude * (
    cos(phase) * SLITHER_SPATIAL_FREQUENCY *
      moveDirection * surfaceMask +
    surfaceNormal * (wave * maskDerivative * 0.65)
  );
}

void computeImpactRipple(
  vec3 objectPosition,
  out float displacement,
  out vec3 displacementGradient
) {
  vec3 fromImpact = objectPosition - uImpactPointLocal;
  float distanceFromImpact = max(length(fromImpact), 0.0001);
  vec3 distanceDirection = fromImpact / distanceFromImpact;
  float phase =
    distanceFromImpact * IMPACT_RIPPLE_FREQUENCY -
    uImpactAge * IMPACT_RIPPLE_PROPAGATION_SPEED;
  float distanceEnvelope = exp(
    -distanceFromImpact * IMPACT_RIPPLE_DISTANCE_DECAY
  );
  float timeEnvelope = exp(-uImpactAge * IMPACT_RIPPLE_TIME_DECAY);
  float amplitude = IMPACT_RIPPLE_AMPLITUDE *
    uImpactStrength * uImpactElasticity *
    distanceEnvelope * timeEnvelope;

  displacement = sin(phase) * amplitude;
  displacementGradient = distanceDirection * amplitude * (
    cos(phase) * IMPACT_RIPPLE_FREQUENCY -
    sin(phase) * IMPACT_RIPPLE_DISTANCE_DECAY
  );
}

// Apply centred anisotropic scaling and the corresponding inverse-transpose
// normal transform. Perpendicular scale approximates volume preservation.
void applyAxisScale(
  inout vec3 objectPosition,
  inout vec3 objectNormal,
  vec3 axis,
  float alongScale,
  float perpendicularScale
) {
  float positionAlongAxis = dot(objectPosition, axis);
  objectPosition =
    objectPosition * perpendicularScale +
    axis * positionAlongAxis * (alongScale - perpendicularScale);

  float normalAlongAxis = dot(objectNormal, axis);
  objectNormal = normalize(
    objectNormal / perpendicularScale +
    axis * normalAlongAxis *
      (1.0 / alongScale - 1.0 / perpendicularScale)
  );
}

void main() {
  vec3 sourceNormal = normalize(normal);
  vec3 surfaceNormal = normalize(uSurfaceNormalLocal);
  vec3 tangentA = normalize(
    uSurfaceTangentLocal -
    surfaceNormal * dot(uSurfaceTangentLocal, surfaceNormal)
  );
  vec3 tangentB = normalize(cross(surfaceNormal, tangentA));
  float support = max(uGrounded, uAttached);

  vec3 moveDirection = uMoveDirectionLocal -
    surfaceNormal * dot(uMoveDirectionLocal, surfaceNormal);
  float moveDirectionLength = length(moveDirection);
  moveDirection = moveDirectionLength > 0.0001
    ? moveDirection / moveDirectionLength
    : tangentA;
  vec3 sideDirection = normalize(cross(surfaceNormal, moveDirection));

  float surfaceHeight = dot(position, surfaceNormal);
  float baseMask;
  float maskDerivative;
  evaluateBaseMask(surfaceHeight, baseMask, maskDerivative);

  float idleDisplacement;
  vec3 idleGradient;
  computeIdleWobble(
    position,
    surfaceNormal,
    tangentA,
    tangentB,
    baseMask,
    maskDerivative,
    idleDisplacement,
    idleGradient
  );

  float slitherDisplacement;
  vec3 slitherGradient;
  computeSlither(
    position,
    moveDirection,
    surfaceNormal,
    baseMask,
    maskDerivative,
    support,
    slitherDisplacement,
    slitherGradient
  );

  float impactDisplacement;
  vec3 impactGradient;
  computeImpactRipple(position, impactDisplacement, impactGradient);

  float radialDisplacement =
    idleDisplacement + slitherDisplacement + impactDisplacement;
  vec3 radialGradient = idleGradient + slitherGradient + impactGradient;
  vec3 tangentialGradient = radialGradient -
    sourceNormal * dot(radialGradient, sourceNormal);

  vec3 deformedPosition = position + sourceNormal * radialDisplacement;
  vec3 deformedNormal = normalize(sourceNormal - tangentialGradient);

  float chargeSquash = uJumpCharge * CHARGE_SQUASH_MAX;
  float supportFlatten = support * GROUND_FLATTEN_MAX *
    (0.25 + uSpeed * 0.75);
  float surfaceScale = clamp(
    1.0 - chargeSquash - supportFlatten,
    0.68,
    1.0
  );
  applyAxisScale(
    deformedPosition,
    deformedNormal,
    surfaceNormal,
    surfaceScale,
    inversesqrt(surfaceScale)
  );

  vec3 stretchDirection = normalize(uStretchDirectionLocal);
  float totalStretch = clamp(
    uStretch + uSpeed * support * LOCOMOTION_STRETCH_MAX,
    0.0,
    0.28
  );
  float stretchScale = 1.0 + totalStretch;
  applyAxisScale(
    deformedPosition,
    deformedNormal,
    stretchDirection,
    stretchScale,
    inversesqrt(stretchScale)
  );

  float impactScale = clamp(
    1.0 - uSquash * IMPACT_SQUASH_MAX,
    0.70,
    1.12
  );
  applyAxisScale(
    deformedPosition,
    deformedNormal,
    normalize(uImpactNormalLocal),
    impactScale,
    inversesqrt(impactScale)
  );

  // These centred shears communicate crawling inertia without translating
  // the whole mesh away from the authoritative collider.
  float normalizedHeight = surfaceHeight / SLIME_RADIUS;
  float sideShift = sin(uLocomotionPhase + 1.1) *
    SIDE_SHIFT_MAX * uSpeed * support;
  deformedPosition += sideDirection * sideShift * normalizedHeight;
  deformedPosition += uInertiaLocal * INERTIA_SHEAR_MAX * normalizedHeight;

  float stickyContact = 1.0 - smoothstep(-0.38, -0.02, surfaceHeight);
  deformedPosition += moveDirection * STICKY_PEEL_MAX * uAttached *
    uSpeed * stickyContact *
    sin(uLocomotionPhase - dot(position, moveDirection) * 10.0);

  deformedPosition -= surfaceNormal *
    (uJumpCharge * CHARGE_CENTRE_DROP_MAX * baseMask);

  vec4 worldPosition = modelMatrix * vec4(deformedPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * deformedNormal);
  vDeformation = clamp(
    abs(radialDisplacement) / 0.06 +
    chargeSquash + abs(uSquash) * 0.35 + totalStretch * 0.5,
    0.0,
    1.0
  );

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
