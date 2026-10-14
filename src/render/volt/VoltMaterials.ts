import * as THREE from 'three';
import { GelMaterialSet } from '../slime/GelMaterials.ts';

export const VOLT_BASE_COLOR = new THREE.Color().setRGB(1, 0.72, 0.003, THREE.LinearSRGBColorSpace);

/** Authored morphs supply all motion. Zero secondary displacement protects the
 * 2 mm eye seats, contact plane and rounded crest in every render pass. */
export class VoltMaterialSet extends GelMaterialSet {
  constructor(emission: THREE.Texture, roughness: THREE.Texture) {
    super({
      name: 'Volt',
      body: { name: 'Volt-Golden-Gel', color: VOLT_BASE_COLOR, attenuationColor: VOLT_BASE_COLOR,
        metalness: 0, ior: 1.38, roughness: 1, roughnessMap: roughness,
        clearcoat: 0.32, clearcoatRoughness: 0.12, transmission: 0.55,
        emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.95, emissiveMap: emission },
      eyes: { name: 'Volt-Obsidian-Eyes', color: new THREE.Color().setRGB(0.004, 0.0025, 0.001, THREE.LinearSRGBColorSpace),
        roughness: 0.16, clearcoat: 0.35, clearcoatRoughness: 0.12 },
      secondaryMotion: {
        wobbleAmplitudeMetres: 0, impactAmplitudeMetres: 0,
        protectionShader: `
          float bobEyeSeatProtection = 0.0;
          vec3 bobEyeSeatProtectionGradient = vec3(0.0);
          float bobContactProtection = 0.0;
          vec3 bobContactProtectionGradient = vec3(0.0);
        `,
      },
    });
    emission.colorSpace = THREE.SRGBColorSpace;
    roughness.colorSpace = THREE.NoColorSpace;
  }
}
