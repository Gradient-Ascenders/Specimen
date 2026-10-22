import * as THREE from 'three';
import type { GelRendering } from '../slime/GelRendering.ts';
import type { SpecimenAsset } from './SpecimenAsset.ts';

/** Preserve the authored nine material regions, including vertex-painted tips. */
export class SpecimenMaterials {
  private readonly materials: readonly THREE.MeshPhysicalMaterial[];
  private readonly base = new Map<THREE.MeshPhysicalMaterial, { opacity: number; emission: number; transparent: boolean }>();
  private readonly shadowOpacity = { value: 1 };

  constructor(asset: SpecimenAsset, gelRendering?: GelRendering) {
    this.materials = [...new Set(asset.meshes.map(mesh => mesh.material))];
    for (const material of this.materials) {
      const shell = /Turquoise-Gel|Yellow-Bolt-Tips/.test(material.name);
      const flow = /Aqua-Flow/.test(material.name);
      const acidShell = /Luminous-Acid/.test(material.name);
      const eye = /Obsidian/.test(material.name);
      material.side = THREE.FrontSide;
      material.roughness = eye ? 0.16 : shell ? 0.14 : 0.24;
      material.clearcoat = 1;
      if (shell) {
        material.transmission = 0.78; material.thickness = 0.24;
        material.ior = 1.33; material.transparent = true; material.opacity = 0.94;
        material.depthWrite = false;
        material.emissive.set(0x287568);
        gelRendering?.register(material);
      } else {
        // One refractive shell captures opaque inner regions. Nested transmission
        // would drop the green heart from Three's screen-space capture.
        material.transmission = 0;
        material.transparent = flow || acidShell;
        material.opacity = flow ? 0.56 : acidShell ? 0.24 : 1;
        material.depthWrite = !material.transparent;
      }
      if (/Fusion-Heart/.test(material.name)) material.emissiveIntensity = 2.2;
      else if (/Acid-Swirl/.test(material.name)) material.emissiveIntensity = 0.9;
      else if (acidShell) material.emissiveIntensity = 0.55;
      else if (flow) material.emissiveIntensity = 0.65;
      else if (/Golden-Discharge|Charged-Junctions/.test(material.name)) material.emissiveIntensity = 2.8;
      else if (shell) material.emissiveIntensity = 0.2;
      this.base.set(material, { opacity: material.opacity, emission: material.emissiveIntensity, transparent: material.transparent });
      material.needsUpdate = true;
    }
    for (const mesh of asset.meshes) {
      const casts = /Specimen-Body|Specimen-Eye/.test(mesh.name);
      mesh.castShadow = casts; mesh.receiveShadow = casts;
      mesh.userData.characterShadowCaster = casts;
      mesh.userData.characterCameraFade = true;
      if (casts) {
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial();
        for (const material of [mesh.customDepthMaterial, mesh.customDistanceMaterial]) {
          material.onBeforeCompile = shader => {
            shader.uniforms.uSpecimenOpacity = this.shadowOpacity;
            shader.fragmentShader = `uniform float uSpecimenOpacity;\n${shader.fragmentShader}`.replace(
              '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
              float coverage = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233))) * 43758.5453);
              if (uSpecimenOpacity <= 0.0 || coverage >= uSpecimenOpacity) discard;`);
          };
          material.customProgramCacheKey = () => 'specimen-shadow-fade-v1';
        }
      }
    }
  }

  setOpacity(value: number): void {
    this.shadowOpacity.value = value;
    for (const material of this.materials) {
      const base = this.base.get(material)!;
      const transparent = base.transparent || value < 1;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = base.opacity * value;
      material.depthWrite = !transparent;
    }
  }
  setCharge(value: number): void {
    for (const material of this.materials) material.emissiveIntensity = this.base.get(material)!.emission *
      (/Golden-Discharge|Charged-Junctions|Fusion-Heart/.test(material.name) ? 1 + 2 * value * value : 1);
  }
  setReflectionEnvironment(texture: THREE.Texture | null): void {
    for (const material of this.materials) { material.envMap = texture; material.needsUpdate = true; }
  }
  setReflectionIntensity(body: number, eyes: number): void {
    for (const material of this.materials) material.envMapIntensity = /Obsidian/.test(material.name) ? eyes : body;
  }
}
