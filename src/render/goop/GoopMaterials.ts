import type { GelRendering } from '../slime/GelRendering.ts';
import * as THREE from 'three';
import { GelMaterialSet, type GelMaterialProfile } from '../slime/GelMaterials.ts';
import { GOOP_EYE_BOUNDS } from './GoopAsset.ts';
import { injectGoopBaseVertexShader } from './GoopBaseMotion.ts';
import { injectGoopEyeBlinkShader, injectGoopPolishVertexShader } from './GoopPolishShader.ts';

export const GOOP_BASE_COLOR = new THREE.Color().setRGB(0.045, 0.60, 0.001, THREE.LinearSRGBColorSpace);
const smoothstep = THREE.MathUtils.smoothstep;

/** Protect complete eye bounds with a smooth margin, sole, forelock and crest. */
export function goopMotionProtection(position: THREE.Vector3): number {
  const bounds = new THREE.Box3().union(GOOP_EYE_BOUNDS[0]).union(GOOP_EYE_BOUNDS[1]);
  const eye = (1 - smoothstep(Math.abs(position.x), bounds.max.x + 0.025, bounds.max.x + 0.09)) *
    smoothstep(position.y, bounds.min.y - 0.085, bounds.min.y - 0.025) *
    (1 - smoothstep(position.y, bounds.max.y + 0.025, bounds.max.y + 0.085)) *
    (1 - smoothstep(position.z, bounds.max.z + 0.025, bounds.max.z + 0.085));
  const spine = (1 - smoothstep(Math.abs(position.x), 0.08, 0.18)) *
    smoothstep(position.z, 0.32, 0.48);
  return (1 - eye) * (1 - spine) * smoothstep(position.y, -0.45, -0.32) *
    (1 - smoothstep(position.y, 0.04, 0.12));
}

const eyeMin = Math.min(...GOOP_EYE_BOUNDS.map(b => b.min.y));
const eyeMax = Math.max(...GOOP_EYE_BOUNDS.map(b => b.max.y));
const eyeX = Math.max(...GOOP_EYE_BOUNDS.map(b => Math.max(Math.abs(b.min.x), Math.abs(b.max.x))));
const eyeZ = Math.max(...GOOP_EYE_BOUNDS.map(b => b.max.z));
const protectionFunction = /* glsl */ `
float goopProtection(vec3 p) {
  float eye = (1.0 - smoothstep(${eyeX + 0.025}, ${eyeX + 0.09}, abs(p.x))) *
    smoothstep(${eyeMin - 0.085}, ${eyeMin - 0.025}, p.y) *
    (1.0 - smoothstep(${eyeMax + 0.025}, ${eyeMax + 0.085}, p.y)) *
    (1.0 - smoothstep(${eyeZ + 0.025}, ${eyeZ + 0.085}, p.z));
  float spine = (1.0 - smoothstep(0.08, 0.18, abs(p.x))) * smoothstep(0.32, 0.48, p.z);
  return (1.0 - eye) * (1.0 - spine) * smoothstep(-0.45, -0.32, p.y) *
    (1.0 - smoothstep(0.04, 0.12, p.y));
}
`;
const protectionShader = /* glsl */ `
  float bobEyeSeatProtection = goopProtection(bobPosition);
  // Central differences include the smooth mask's slope in physical lighting.
  vec3 bobEyeSeatProtectionGradient = vec3(
    goopProtection(bobPosition + vec3(0.001, 0.0, 0.0)) - goopProtection(bobPosition - vec3(0.001, 0.0, 0.0)),
    goopProtection(bobPosition + vec3(0.0, 0.001, 0.0)) - goopProtection(bobPosition - vec3(0.0, 0.001, 0.0)),
    goopProtection(bobPosition + vec3(0.0, 0.0, 0.001)) - goopProtection(bobPosition - vec3(0.0, 0.0, 0.001))
  ) / 0.002;
  float bobContactProtection = 1.0;
  vec3 bobContactProtectionGradient = vec3(0.0);
`;
const profile: GelMaterialProfile = {
  name: 'Goop',
  body: { name: 'Goop-Gel-Body', color: GOOP_BASE_COLOR, attenuationColor: GOOP_BASE_COLOR,
    roughness: 0.26, clearcoat: 0.25, clearcoatRoughness: 0.18 },
  eyes: { name: 'Goop-Glossy-Eyes', color: 0x010101, roughness: 0.23, clearcoat: 0.18 },
  secondaryMotion: { wobbleAmplitudeMetres: 0.0015, impactAmplitudeMetres: 0.003,
    protectionShader },
};

export class GoopMaterialSet extends GelMaterialSet {
  private readonly baseOffset: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3() };
  private readonly crestLag: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2() };
  private readonly landingRipple: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(0, 0.65) };
  private readonly eyeClosure: THREE.IUniform<number> = { value: 0 };

  constructor(rendering?: GelRendering) {
    super(profile, rendering);
    // The shared wave evaluation accepts identity-specific protection functions.
    for (const material of [this.body, this.bodyDepth, this.bodyDistance]) {
      const hook = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey.bind(material);
      material.customProgramCacheKey = () => `${cacheKey()}-polish-v1`;
      material.onBeforeCompile = (shader, renderer) => {
        hook(shader, renderer);
        shader.uniforms.uGoopBaseOffset = this.baseOffset;
        shader.uniforms.uGoopCrestLag = this.crestLag;
        shader.uniforms.uGoopLandingRipple = this.landingRipple;
        shader.vertexShader = injectGoopPolishVertexShader(
          injectGoopBaseVertexShader(protectionFunction + shader.vertexShader, material !== this.body), material !== this.body);
      };
    }
    for (const [index, material] of [this.eyes, this.eyeDepth, this.eyeDistance].entries()) {
      const hook = material.onBeforeCompile;
      material.customProgramCacheKey = () => `goop-eye-blink-${index}-v1`;
      material.onBeforeCompile = (shader, renderer) => {
        hook(shader, renderer);
        shader.uniforms.uGoopEyeClosure = this.eyeClosure;
        injectGoopEyeBlinkShader(shader);
      };
    }
  }

  setPolish(crestLag: THREE.Vector2, eyeClosure: number, rippleStrength: number, rippleAge: number): void {
    this.crestLag.value.copy(crestLag);
    this.eyeClosure.value = eyeClosure;
    this.landingRipple.value.set(rippleStrength, rippleAge);
  }

  setBaseOffset(offsetWorld: THREE.Vector3, facingYaw: number): void {
    if (offsetWorld.lengthSq() === 0) { this.baseOffset.value.set(0, 0, 0); return; }
    const sine = Math.sin(facingYaw), cosine = Math.cos(facingYaw);
    this.baseOffset.value.set(cosine * offsetWorld.x - sine * offsetWorld.z,
      offsetWorld.y,
      sine * offsetWorld.x + cosine * offsetWorld.z);
  }

  override reset(): void {
    super.reset();
    this.baseOffset.value.set(0, 0, 0);
    this.crestLag.value.set(0, 0); this.eyeClosure.value = 0; this.landingRipple.value.set(0, 0.65);
  }
}
