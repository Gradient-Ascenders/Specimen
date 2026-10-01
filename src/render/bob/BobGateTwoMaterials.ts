import * as THREE from 'three';

const BOB_WOBBLE_AMPLITUDE_METRES = 0.0035;
const BOB_IMPACT_RIPPLE_AMPLITUDE_METRES = 0.006;
const BOB_IMPACT_RIPPLE_DURATION_SECONDS = 1.2;
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
const BOB_SECONDARY_MOTION_PERIOD_SECONDS = Math.PI * 200;
const BOB_REFLECTION_RESPONSE_PER_SECOND = 4;

interface BobGelUniforms {
  readonly time: THREE.IUniform<number>;
  readonly impactPointLocal: THREE.IUniform<THREE.Vector3>;
  readonly impactStrength: THREE.IUniform<number>;
  readonly impactAge: THREE.IUniform<number>;
}

export interface BobGateTwoMaterialDiagnostics {
  readonly selfLit: boolean;
  readonly catchlightCount: number;
  readonly maximumSecondaryDisplacementMetres: number;
  readonly elapsedTimeSeconds: number;
  readonly impactStrength: number;
  readonly impactAgeSeconds: number;
  readonly reflectionMapName: string | undefined;
  readonly bodyReflectionIntensity: number;
  readonly eyeReflectionIntensity: number;
  readonly targetBodyReflectionIntensity: number;
  readonly targetEyeReflectionIntensity: number;
}

/**
 * Scene-lit cyan gel with only surface-scale secondary deformation.
 *
 * The physical BRDF owns lighting and transmission. The custom vertex work is
 * deliberately limited to a few millimetres of idle wobble and local impact
 * ripple; authored Gate 3 morphs will own every major silhouette change.
 */
export class BobGelBodyMaterial extends THREE.MeshPhysicalMaterial {
  private readonly bobUniforms: BobGelUniforms = {
    time: { value: 0 },
    impactPointLocal: { value: new THREE.Vector3(0, -0.45, 0) },
    impactStrength: { value: 0 },
    impactAge: { value: BOB_IMPACT_RIPPLE_DURATION_SECONDS },
  };

  constructor() {
    super({
      name: 'Bob-Gel-Body',
      color: 0x18cddd,
      roughness: 0.28,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      transmission: 0.28,
      thickness: 0.42,
      attenuationColor: 0x20cbd4,
      attenuationDistance: 1.35,
      ior: 1.34,
      specularIntensity: 0.86,
      emissive: 0x000000,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 1,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    this.onBeforeCompile = (shader) => {
      shader.uniforms.uBobSecondaryTime = this.bobUniforms.time;
      shader.uniforms.uBobImpactPointLocal =
        this.bobUniforms.impactPointLocal;
      shader.uniforms.uBobImpactStrength = this.bobUniforms.impactStrength;
      shader.uniforms.uBobImpactAge = this.bobUniforms.impactAge;
      shader.vertexShader = /* glsl */ `
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
${shader.vertexShader}
`
        .replace(
          '#include <morphnormal_vertex>',
          /* glsl */ `
#include <morphnormal_vertex>
// Start from Three.js's authored morph normal, then tilt it by the tangential
// slope of the same object-space wave used for the vertex displacement.
vec3 bobSecondaryBaseNormal = normalize(objectNormal);
float bobSecondaryDisplacement;
vec3 bobSecondaryLightingGradient;
bobEvaluateSecondaryMotion(
  position,
  bobSecondaryBaseNormal,
  bobSecondaryDisplacement,
  bobSecondaryLightingGradient
);
vec3 bobSecondaryTangentialGradient =
  bobSecondaryLightingGradient -
  bobSecondaryBaseNormal * dot(
    bobSecondaryLightingGradient,
    bobSecondaryBaseNormal
  );
objectNormal = normalize(
  bobSecondaryBaseNormal - bobSecondaryTangentialGradient
);
`,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
#include <begin_vertex>
transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;
`,
        );
    };
  }

  override customProgramCacheKey(): string {
    return 'bob-gate-two-gel-ripple-normals-v5';
  }

  update(deltaSeconds: number): void {
    const elapsedSeconds = Math.max(deltaSeconds, 0);
    this.bobUniforms.time.value =
      (this.bobUniforms.time.value + elapsedSeconds) %
      BOB_SECONDARY_MOTION_PERIOD_SECONDS;
    this.bobUniforms.impactAge.value = Math.min(
      this.bobUniforms.impactAge.value + elapsedSeconds,
      BOB_IMPACT_RIPPLE_DURATION_SECONDS,
    );
    if (
      this.bobUniforms.impactAge.value >=
      BOB_IMPACT_RIPPLE_DURATION_SECONDS
    ) {
      this.bobUniforms.impactStrength.value = 0;
    }
  }

  setImpact(pointLocal: THREE.Vector3, strength: number): void {
    this.bobUniforms.impactPointLocal.value.copy(pointLocal);
    this.bobUniforms.impactStrength.value = THREE.MathUtils.clamp(
      strength,
      0,
      1,
    );
    this.bobUniforms.impactAge.value = 0;
  }

  resetSecondaryMotion(): void {
    this.bobUniforms.time.value = 0;
    this.bobUniforms.impactPointLocal.value.set(0, -0.45, 0);
    this.bobUniforms.impactStrength.value = 0;
    this.bobUniforms.impactAge.value = BOB_IMPACT_RIPPLE_DURATION_SECONDS;
  }

  get elapsedTimeSeconds(): number {
    return this.bobUniforms.time.value;
  }

  get impactStrength(): number {
    return this.bobUniforms.impactStrength.value;
  }

  get impactAgeSeconds(): number {
    return this.bobUniforms.impactAge.value;
  }
}

/** Owns the two shared Gate 2 materials and their presentation-only state. */
export class BobGateTwoMaterialSet {
  readonly body = new BobGelBodyMaterial();
  readonly eyes = new THREE.MeshPhysicalMaterial({
    name: 'Bob-Glossy-Eyes',
    color: 0x010308,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 0.82,
    clearcoatRoughness: 0.12,
    ior: 1.4,
    specularIntensity: 0.92,
    emissive: 0x000000,
    emissiveIntensity: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
  private targetBodyReflectionIntensity = 0;
  private targetEyeReflectionIntensity = 0;

  get diagnostics(): BobGateTwoMaterialDiagnostics {
    const bodySelfLit =
      this.body.emissiveIntensity > 0 && this.body.emissive.getHex() !== 0;
    const eyesSelfLit =
      this.eyes.emissiveIntensity > 0 && this.eyes.emissive.getHex() !== 0;
    return {
      selfLit: bodySelfLit || eyesSelfLit,
      catchlightCount: 0,
      maximumSecondaryDisplacementMetres:
        BOB_WOBBLE_AMPLITUDE_METRES +
        BOB_IMPACT_RIPPLE_AMPLITUDE_METRES,
      elapsedTimeSeconds: this.body.elapsedTimeSeconds,
      impactStrength: this.body.impactStrength,
      impactAgeSeconds: this.body.impactAgeSeconds,
      reflectionMapName: this.body.envMap?.name || undefined,
      bodyReflectionIntensity: this.body.envMapIntensity,
      eyeReflectionIntensity: this.eyes.envMapIntensity,
      targetBodyReflectionIntensity: this.targetBodyReflectionIntensity,
      targetEyeReflectionIntensity: this.targetEyeReflectionIntensity,
    };
  }

  update(deltaSeconds: number): void {
    this.body.update(deltaSeconds);
    const blend = 1 - Math.exp(
      -BOB_REFLECTION_RESPONSE_PER_SECOND * Math.max(0, deltaSeconds),
    );
    this.body.envMapIntensity = THREE.MathUtils.lerp(
      this.body.envMapIntensity,
      this.targetBodyReflectionIntensity,
      blend,
    );
    this.eyes.envMapIntensity = THREE.MathUtils.lerp(
      this.eyes.envMapIntensity,
      this.targetEyeReflectionIntensity,
      blend,
    );
  }

  setReflectionEnvironment(environmentMap: THREE.Texture | null): void {
    if (
      this.body.envMap === environmentMap &&
      this.eyes.envMap === environmentMap
    ) {
      return;
    }
    this.body.envMap = environmentMap;
    this.eyes.envMap = environmentMap;
    this.body.needsUpdate = true;
    this.eyes.needsUpdate = true;
  }

  setReflectionIntensity(
    bodyIntensity: number,
    eyeIntensity: number,
    snap = false,
  ): void {
    this.targetBodyReflectionIntensity = THREE.MathUtils.clamp(
      bodyIntensity,
      0,
      2,
    );
    this.targetEyeReflectionIntensity = THREE.MathUtils.clamp(
      eyeIntensity,
      0,
      2,
    );
    if (!snap) return;
    this.body.envMapIntensity = this.targetBodyReflectionIntensity;
    this.eyes.envMapIntensity = this.targetEyeReflectionIntensity;
  }

  setImpact(pointLocal: THREE.Vector3, strength: number): void {
    this.body.setImpact(pointLocal, strength);
  }

  reset(): void {
    this.body.resetSecondaryMotion();
    this.setOpacity(1);
    this.setReflectionIntensity(
      this.targetBodyReflectionIntensity,
      this.targetEyeReflectionIntensity,
      true,
    );
  }

  setOpacity(opacity: number): void {
    const boundedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    this.body.opacity = boundedOpacity;
    // Transmission requires a transparent program even at full presentation
    // opacity, so keep this flag stable across camera-proximity fades.
    this.body.transparent = true;
    this.body.depthWrite = boundedOpacity >= 1;
    this.eyes.opacity = boundedOpacity;
    const eyesTransparent = boundedOpacity < 1;
    if (this.eyes.transparent !== eyesTransparent) {
      this.eyes.transparent = eyesTransparent;
      this.eyes.needsUpdate = true;
    }
    this.eyes.depthWrite = boundedOpacity >= 1;
  }
}
