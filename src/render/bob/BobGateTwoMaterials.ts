import * as THREE from 'three';

const BOB_WOBBLE_AMPLITUDE_METRES = 0.0035;
const BOB_IMPACT_RIPPLE_AMPLITUDE_METRES = 0.006;
const BOB_IMPACT_RIPPLE_DURATION_SECONDS = 1.2;
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
      clearcoat: 0.4,
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
${shader.vertexShader}
`.replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
// Keep the projecting eye-seat region stable while the rest of the gel skin
// receives millimetre-scale motion.
float bobEyeSeatProtection = smoothstep(-0.25, -0.12, position.z);
float bobContactProtection = smoothstep(-0.45, -0.28, position.y);
float bobWobble =
  sin(position.x * 8.3 + position.y * 6.1 + uBobSecondaryTime * 2.2) *
  sin(position.z * 7.2 - uBobSecondaryTime * 1.7) *
  ${BOB_WOBBLE_AMPLITUDE_METRES.toFixed(4)};
float bobImpactDistance = length(position - uBobImpactPointLocal);
float bobImpactEnvelope =
  exp(-uBobImpactAge * 6.0) * exp(-bobImpactDistance * 5.0);
float bobImpactRipple =
  sin(bobImpactDistance * 30.0 - uBobImpactAge * 18.0) *
  bobImpactEnvelope * uBobImpactStrength *
  ${BOB_IMPACT_RIPPLE_AMPLITUDE_METRES.toFixed(4)};
float bobSecondaryDisplacement =
  (bobWobble * (0.45 + bobContactProtection * 0.55) + bobImpactRipple) *
  bobEyeSeatProtection;
transformed += objectNormal * bobSecondaryDisplacement;
`,
      );
    };
  }

  override customProgramCacheKey(): string {
    return 'bob-gate-two-gel-curl-v1';
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
