import type { GelRendering } from '../slime/GelRendering.ts';
import * as THREE from 'three';
import { GelMaterialSet } from '../slime/GelMaterials.ts';
import { GEL_LANDING_RIPPLE_SECONDS } from '../slime/GelElasticMotion.ts';
import { injectVoltMotionVertexShader, VOLT_SECONDARY_PROTECTION_SHADER } from './VoltMotionShader.ts';

export const VOLT_BASE_COLOR = new THREE.Color().setRGB(1, 0.72, 0.003, THREE.LinearSRGBColorSpace);

/** Authored poses and protected elastic gel share live visible/shadow uniforms. */
export class VoltMaterialSet extends GelMaterialSet {
  private readonly baseOffset: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3() };
  private readonly crestLag: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2() };
  private readonly landingRipple: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(0, GEL_LANDING_RIPPLE_SECONDS) };

  constructor(emission: THREE.Texture, roughness: THREE.Texture, rendering?: GelRendering) {
    super({
      name: 'Volt',
      body: { name: 'Volt-Golden-Gel', color: VOLT_BASE_COLOR, attenuationColor: VOLT_BASE_COLOR,
        metalness: 0, ior: 1.38, roughness: 1, roughnessMap: roughness,
        clearcoat: 0.32, clearcoatRoughness: 0.12, transmission: 0.55,
        emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.95, emissiveMap: emission },
      eyes: { name: 'Volt-Obsidian-Eyes', color: new THREE.Color().setRGB(0.004, 0.0025, 0.001, THREE.LinearSRGBColorSpace),
        roughness: 0.16, clearcoat: 0.35, clearcoatRoughness: 0.12 },
      secondaryMotion: {
        wobbleAmplitudeMetres: 0.0015, impactAmplitudeMetres: 0.003,
        protectionShader: VOLT_SECONDARY_PROTECTION_SHADER,
      },
    }, rendering);
    emission.colorSpace = THREE.SRGBColorSpace;
    roughness.colorSpace = THREE.NoColorSpace;
    for (const material of [this.body, this.bodyDepth, this.bodyDistance]) {
      const hook = material.onBeforeCompile;
      const key = material.customProgramCacheKey.bind(material);
      material.customProgramCacheKey = () => `${key()}-elastic-v1`;
      material.onBeforeCompile = (shader, renderer) => {
        hook(shader, renderer);
        shader.uniforms.uVoltBaseOffset = this.baseOffset;
        shader.uniforms.uVoltCrestLag = this.crestLag;
        shader.uniforms.uVoltLandingRipple = this.landingRipple;
        shader.vertexShader = injectVoltMotionVertexShader(shader.vertexShader, material !== this.body);
      };
    }
  }

  setMotion(baseOffsetWorld: THREE.Vector3, yaw: number, crestLag: number, rippleStrength: number, rippleAge: number): void {
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    this.baseOffset.value.set(cosine * baseOffsetWorld.x - sine * baseOffsetWorld.z, baseOffsetWorld.y,
      sine * baseOffsetWorld.x + cosine * baseOffsetWorld.z);
    this.crestLag.value.set(0, crestLag);
    this.landingRipple.value.set(rippleStrength, rippleAge);
  }

  override reset(): void {
    super.reset();
    this.baseOffset.value.set(0, 0, 0); this.crestLag.value.set(0, 0);
    this.landingRipple.value.set(0, GEL_LANDING_RIPPLE_SECONDS);
  }
}
