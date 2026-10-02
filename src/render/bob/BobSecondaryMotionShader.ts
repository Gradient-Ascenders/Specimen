export const BOB_WOBBLE_AMPLITUDE_METRES = 0.0035;
export const BOB_IMPACT_RIPPLE_AMPLITUDE_METRES = 0.006;
export const BOB_IMPACT_RIPPLE_DURATION_SECONDS = 1.2;
const BOB_IMPACT_RIPPLE_DISTANCE_DECAY = 3;
const BOB_IMPACT_RIPPLE_TIME_DECAY = 4;
const BOB_IMPACT_NORMAL_RESPONSE = 3;
const BOB_IMPACT_NORMAL_SLOPE_LIMIT = 0.18;
const BOB_IMPACT_NORMAL_CARRIER_FREQUENCY = 12;
const BOB_IMPACT_NORMAL_CARRIER_TEMPORAL_FREQUENCY = 7.2;
const BOB_IMPACT_NORMAL_CARRIER_TIME_DECAY = 2.2;
const BOB_IMPACT_NORMAL_CARRIER_FADE_START_SECONDS = 0.65;
const BOB_IMPACT_NORMAL_CARRIER_DISTANCE_DECAY = 0.6;
const BOB_IMPACT_NORMAL_CARRIER_RESPONSE = 1.6;
const BOB_IMPACT_NORMAL_CARRIER_SLOPE_LIMIT = 0.8;

// All passes evaluate the same source positions and authored morph normal.
// Preserve the established order: secondary offset, then authored position morph.
const secondaryMotionPars = /* glsl */ `
uniform float uBobSecondaryTime;
uniform vec3 uBobImpactPointLocal;
uniform float uBobImpactStrength;
uniform float uBobImpactAge;

float bobSmoothstepDerivative(float edge0, float edge1, float value) {
  float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t > 0.0 && t < 1.0
    ? 6.0 * t * (1.0 - t) / (edge1 - edge0)
    : 0.0;
}

// Evaluate scalar displacement and its object-space lighting slope together
// so the physical material shades the same bounded waves that it renders.
void bobEvaluateSecondaryMotion(
  vec3 bobPosition,
  vec3 bobCarrierNormal,
  out float bobDisplacement,
  out vec3 bobLightingGradient
) {
  // This shader evaluates source positions, where the neutral eye seats occupy
  // x [-0.235, 0.207], y [-0.252, 0.028]. Protect those authored vertices,
  // rather than suppressing the whole front.
  float bobEyeSeatDepthMask =
    1.0 - smoothstep(-0.25, -0.12, bobPosition.z);
  float bobEyeSeatDepthDerivative =
    -bobSmoothstepDerivative(-0.25, -0.12, bobPosition.z);
  float bobEyeSeatCentredX = bobPosition.x + 0.014;
  float bobEyeSeatAbsoluteX = abs(bobEyeSeatCentredX);
  float bobEyeSeatHorizontalMask =
    1.0 - smoothstep(0.25, 0.34, bobEyeSeatAbsoluteX);
  float bobEyeSeatHorizontalDerivative =
    -bobSmoothstepDerivative(0.25, 0.34, bobEyeSeatAbsoluteX) *
    sign(bobEyeSeatCentredX);
  float bobEyeSeatLowerMask = smoothstep(-0.36, -0.27, bobPosition.y);
  float bobEyeSeatUpperMask =
    1.0 - smoothstep(0.06, 0.16, bobPosition.y);
  float bobEyeSeatVerticalMask = bobEyeSeatLowerMask * bobEyeSeatUpperMask;
  float bobEyeSeatVerticalDerivative =
    bobSmoothstepDerivative(-0.36, -0.27, bobPosition.y) *
      bobEyeSeatUpperMask -
    bobEyeSeatLowerMask *
      bobSmoothstepDerivative(0.06, 0.16, bobPosition.y);
  float bobEyeSeatMask = bobEyeSeatDepthMask *
    bobEyeSeatHorizontalMask * bobEyeSeatVerticalMask;
  float bobEyeSeatProtection = 1.0 - bobEyeSeatMask;
  vec3 bobEyeSeatProtectionGradient = -vec3(
    bobEyeSeatDepthMask * bobEyeSeatHorizontalDerivative *
      bobEyeSeatVerticalMask,
    bobEyeSeatDepthMask * bobEyeSeatHorizontalMask *
      bobEyeSeatVerticalDerivative,
    bobEyeSeatDepthDerivative * bobEyeSeatHorizontalMask *
      bobEyeSeatVerticalMask
  );
  float bobContactProtection = smoothstep(-0.45, -0.28, bobPosition.y);
  vec3 bobContactProtectionGradient = vec3(
    0.0,
    bobSmoothstepDerivative(-0.45, -0.28, bobPosition.y),
    0.0
  );

  float bobWobblePhaseA =
    bobPosition.x * 8.3 + bobPosition.y * 6.1 +
    uBobSecondaryTime * 2.2;
  float bobWobblePhaseB =
    bobPosition.z * 7.2 - uBobSecondaryTime * 1.7;
  float bobWobble =
    sin(bobWobblePhaseA) * sin(bobWobblePhaseB) *
    ${BOB_WOBBLE_AMPLITUDE_METRES.toFixed(4)};
  vec3 bobWobbleGradient =
    (cos(bobWobblePhaseA) * sin(bobWobblePhaseB) *
      vec3(8.3, 6.1, 0.0) +
    sin(bobWobblePhaseA) * cos(bobWobblePhaseB) *
      vec3(0.0, 0.0, 7.2)) *
    ${BOB_WOBBLE_AMPLITUDE_METRES.toFixed(4)};
  float bobWobbleProtection = 0.45 + bobContactProtection * 0.55;
  vec3 bobWobbleProtectionGradient =
    bobContactProtectionGradient * 0.55;

  vec3 bobFromImpact = bobPosition - uBobImpactPointLocal;
  float bobImpactDistance = length(bobFromImpact);
  vec3 bobImpactDirection = bobImpactDistance > 0.0001
    ? bobFromImpact / bobImpactDistance
    : vec3(0.0);
  float bobImpactPhase =
    bobImpactDistance * 30.0 - uBobImpactAge * 18.0;
  float bobImpactEnvelope =
    exp(-uBobImpactAge * ${BOB_IMPACT_RIPPLE_TIME_DECAY.toFixed(1)}) *
    exp(-bobImpactDistance * ${BOB_IMPACT_RIPPLE_DISTANCE_DECAY.toFixed(1)});
  float bobImpactAmplitude =
    bobImpactEnvelope * uBobImpactStrength *
    ${BOB_IMPACT_RIPPLE_AMPLITUDE_METRES.toFixed(4)};
  float bobImpactRipple = sin(bobImpactPhase) * bobImpactAmplitude;
  vec3 bobImpactGradient =
    bobImpactDirection * bobImpactAmplitude *
    (cos(bobImpactPhase) * 30.0 -
      sin(bobImpactPhase) *
        ${BOB_IMPACT_RIPPLE_DISTANCE_DECAY.toFixed(1)});

  float bobProtectedWobble =
    bobWobble * bobWobbleProtection * bobEyeSeatProtection;
  vec3 bobProtectedWobbleGradient = (
    bobWobbleGradient * bobWobbleProtection +
    bobWobble * bobWobbleProtectionGradient
  ) * bobEyeSeatProtection +
    bobWobble * bobWobbleProtection * bobEyeSeatProtectionGradient;
  float bobProtectedImpact = bobImpactRipple * bobEyeSeatProtection;
  vec3 bobProtectedImpactGradient =
    bobImpactGradient * bobEyeSeatProtection +
    bobImpactRipple * bobEyeSeatProtectionGradient;

  // Make the transient bend readable at gameplay distance without allowing a
  // steeper lighting normal than the original six-millimetre wave can create.
  vec3 bobImpactLightingGradient =
    bobProtectedImpactGradient * ${BOB_IMPACT_NORMAL_RESPONSE.toFixed(1)};
  bobImpactLightingGradient *= min(
    1.0,
    ${BOB_IMPACT_NORMAL_SLOPE_LIMIT.toFixed(3)} / max(length(bobImpactLightingGradient), 0.0001)
  );

  // The exact six-millimetre ripple above is too fine to move the main gel
  // highlight at gameplay distance. This smooth normal-only carrier shares
  // its impact centre and 0.6 m/s propagation speed, but spans roughly two
  // broad bands across Bob. Normalising its authored-surface tangent prevents
  // the main highlight from disappearing where the impact ray is nearly normal.
  float bobImpactNormalCarrierPhase =
    bobImpactDistance * ${BOB_IMPACT_NORMAL_CARRIER_FREQUENCY.toFixed(1)} -
    uBobImpactAge * ${BOB_IMPACT_NORMAL_CARRIER_TEMPORAL_FREQUENCY.toFixed(1)};
  float bobImpactNormalCarrierLifetime = 1.0 - smoothstep(
    ${BOB_IMPACT_NORMAL_CARRIER_FADE_START_SECONDS.toFixed(2)},
    ${BOB_IMPACT_RIPPLE_DURATION_SECONDS.toFixed(2)},
    uBobImpactAge
  );
  float bobImpactNormalCarrierEnvelope =
    exp(-uBobImpactAge * ${BOB_IMPACT_NORMAL_CARRIER_TIME_DECAY.toFixed(1)}) *
    exp(-bobImpactDistance * ${BOB_IMPACT_NORMAL_CARRIER_DISTANCE_DECAY.toFixed(1)}) *
    bobImpactNormalCarrierLifetime * uBobImpactStrength *
    bobEyeSeatProtection;
  vec3 bobImpactCarrierTangent = bobImpactDirection -
    bobCarrierNormal * dot(bobImpactDirection, bobCarrierNormal);
  float bobImpactCarrierTangentLength = length(bobImpactCarrierTangent);
  bobImpactCarrierTangent = bobImpactCarrierTangentLength > 0.0001
    ? bobImpactCarrierTangent / bobImpactCarrierTangentLength
    : vec3(0.0);
  vec3 bobImpactNormalCarrier = bobImpactCarrierTangent *
    cos(bobImpactNormalCarrierPhase) *
    bobImpactNormalCarrierEnvelope *
    ${BOB_IMPACT_NORMAL_CARRIER_RESPONSE.toFixed(2)};
  bobImpactNormalCarrier *= min(
    1.0,
    ${BOB_IMPACT_NORMAL_CARRIER_SLOPE_LIMIT.toFixed(3)} /
      max(length(bobImpactNormalCarrier), 0.0001)
  );

  bobDisplacement = bobProtectedWobble + bobProtectedImpact;
  bobLightingGradient = bobProtectedWobbleGradient +
    bobImpactLightingGradient + bobImpactNormalCarrier;
}
`;
const secondaryMotionEvaluation = /* glsl */ `
vec3 bobSecondaryBaseNormal = normalize(objectNormal);
float bobSecondaryDisplacement;
vec3 bobSecondaryLightingGradient;
bobEvaluateSecondaryMotion(
  position,
  bobSecondaryBaseNormal,
  bobSecondaryDisplacement,
  bobSecondaryLightingGradient
);
`;
const secondaryPosition = /* glsl */ `
#include <begin_vertex>
transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;
`;

export function injectBobSecondaryMotionVertexShader(
  vertexShader: string,
  shadowPass = false,
): string {
  if (shadowPass) {
    // Three.js depth/distance shaders normally omit normals without a
    // displacement map. Bob needs the authored morph normal in every pass.
    vertexShader = vertexShader.replace(
      /#ifdef USE_DISPLACEMENTMAP\s*#include <beginnormal_vertex>\s*#include <morphnormal_vertex>\s*#include <skinnormal_vertex>\s*#endif/,
      '#include <beginnormal_vertex>\n#include <morphnormal_vertex>\n#include <skinnormal_vertex>',
    );
  }
  return `${secondaryMotionPars}\n${vertexShader}`
    .replace('#include <morphnormal_vertex>',
      `#include <morphnormal_vertex>\n${secondaryMotionEvaluation}${shadowPass ? '' : /* glsl */ `
vec3 bobSecondaryTangentialGradient =
  bobSecondaryLightingGradient -
  bobSecondaryBaseNormal * dot(
    bobSecondaryLightingGradient,
    bobSecondaryBaseNormal
  );
objectNormal = normalize(
  bobSecondaryBaseNormal - bobSecondaryTangentialGradient
);
`}`)
    .replace('#include <begin_vertex>', secondaryPosition);
}
