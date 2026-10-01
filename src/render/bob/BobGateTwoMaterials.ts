import * as THREE from 'three';

import {
  BOB_WOBBLE_AMPLITUDE_METRES,
  BOB_IMPACT_RIPPLE_AMPLITUDE_METRES,
  BOB_IMPACT_RIPPLE_DURATION_SECONDS,
  injectBobSecondaryMotionVertexShader,
} from './BobSecondaryMotionShader.ts';

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
      shader.vertexShader = injectBobSecondaryMotionVertexShader(shader.vertexShader);
    };
  }

  override customProgramCacheKey(): string {
    return 'bob-gel-secondary-surface-v6';
  }

  /** Shadow passes borrow the live uniform objects; only update() advances them. */
  configureShadowMaterial(
    material: THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial,
    opacity: THREE.IUniform<number>,
  ): void {
    configureBobShadowFade(material, opacity, true);
    const fade = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      shader.uniforms.uBobSecondaryTime = this.bobUniforms.time;
      shader.uniforms.uBobImpactPointLocal = this.bobUniforms.impactPointLocal;
      shader.uniforms.uBobImpactStrength = this.bobUniforms.impactStrength;
      shader.uniforms.uBobImpactAge = this.bobUniforms.impactAge;
      shader.vertexShader = injectBobSecondaryMotionVertexShader(shader.vertexShader, true);
      fade(shader, renderer);
    };
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

/** Owns the shared visible/shadow materials and their presentation-only state. */
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
  readonly bodyDepth = new THREE.MeshDepthMaterial({ name: 'Bob-Gel-Depth' });
  readonly bodyDistance = new THREE.MeshDistanceMaterial({ name: 'Bob-Gel-Distance' });
  readonly eyeDepth = new THREE.MeshDepthMaterial({ name: 'Bob-Eye-Depth' });
  readonly eyeDistance = new THREE.MeshDistanceMaterial({ name: 'Bob-Eye-Distance' });
  private readonly shadowOpacity: THREE.IUniform<number> = { value: 1 };
  private targetBodyReflectionIntensity = 0;
  private targetEyeReflectionIntensity = 0;

  constructor() {
    this.body.configureShadowMaterial(this.bodyDepth, this.shadowOpacity);
    this.body.configureShadowMaterial(this.bodyDistance, this.shadowOpacity);
    configureBobShadowFade(this.eyeDepth, this.shadowOpacity, false);
    configureBobShadowFade(this.eyeDistance, this.shadowOpacity, false);
  }

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
    this.shadowOpacity.value = boundedOpacity;
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

function configureBobShadowFade(
  material: THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial,
  opacity: THREE.IUniform<number>,
  secondaryMotion: boolean,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBobShadowOpacity = opacity;
    // Object-space coverage stays fixed while the light/camera moves. Both
    // shadow types and the eye seats use one fade, with exact opaque/hidden ends.
    shader.vertexShader = `varying vec3 vBobShadowPosition;\n${shader.vertexShader}`
      .replace('#include <project_vertex>',
        'vBobShadowPosition = position;\n#include <project_vertex>');
    shader.fragmentShader = /* glsl */ `
uniform float uBobShadowOpacity;
varying vec3 vBobShadowPosition;
${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>', /* glsl */ `
#include <clipping_planes_fragment>
if (uBobShadowOpacity < 1.0) {
  vec3 bobCell = floor(vBobShadowPosition * 256.0);
  float bobCoverage = fract(sin(dot(bobCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  if (uBobShadowOpacity <= 0.0 || bobCoverage >= uBobShadowOpacity) discard;
}
`);
  };
  material.customProgramCacheKey = () => secondaryMotion
    ? 'bob-gel-secondary-shadow-fade-v1'
    : 'bob-eye-shadow-fade-v1';
}
