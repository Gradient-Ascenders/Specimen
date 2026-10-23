import * as THREE from 'three';
import type { GelRendering } from '../slime/GelRendering.ts';
import type { SpecimenAsset } from './SpecimenAsset.ts';
import { configureSpecimenSurface, prepareSpecimenEyeCoordinates, type SpecimenSurfaceUniforms } from './SpecimenSurfaceShaders.ts';

/** Alpha composite while retaining participation in Three's opaque capture. */
function configureCaptureBlending(material: THREE.MeshPhysicalMaterial): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

/** Preserve the authored materials, including vertex-painted tips and lightning. */
export class SpecimenMaterials {
  private readonly materials: readonly THREE.MeshPhysicalMaterial[];
  private readonly base = new Map<THREE.MeshPhysicalMaterial, {
    opacity: number; emission: number; transparent: boolean; depthWrite: boolean;
  }>();
  private readonly shadowOpacity = { value: 1 };
  private readonly surfaceUniforms: SpecimenSurfaceUniforms = { time: { value: 0 }, charge: { value: 0 } };

  constructor(asset: SpecimenAsset, gelRendering?: GelRendering) {
    this.materials = [...new Set(asset.meshes.map(mesh => mesh.material))];
    for (const material of this.materials) {
      const shell = /Turquoise-Gel|Yellow-Bolt-Tips/.test(material.name);
      const flow = /Aqua-Flow/.test(material.name);
      const acidShell = /Luminous-Acid/.test(material.name);
      const eye = /Obsidian/.test(material.name);
      material.side = THREE.FrontSide;
      material.roughness = eye ? 0.105 : shell ? 0.115 : flow ? 0.12 : 0.24;
      material.clearcoat = eye ? 0.32 : shell ? 0.42 : flow ? 0.18 : 0.02;
      material.clearcoatRoughness = 0.11;
      material.transmission = 0;
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      if (shell) {
        material.transmission = 0.82; material.thickness = 0.045;
        material.ior = 1.34;
        material.attenuationColor.setRGB(0.38, 0.94, 0.75);
        material.attenuationDistance = 1.5;
        material.emissive.set(0);
        configureCaptureBlending(material);
        gelRendering?.register(material);
      } else if (flow || acidShell) {
        // Three excludes its transparent queue from the transmission capture.
        // Explicit alpha blending in the opaque queue composites the interior
        // before the ONE refractive shell, in both capture and main passes.
        configureCaptureBlending(material);
        material.opacity = flow ? 0.72 : 0.8;
        material.depthWrite = false;
      }
      if (/Fusion-Heart/.test(material.name)) {
        material.emissive.setRGB(0.65, 1, 0.07); material.emissiveIntensity = 9;
      } else if (/Acid-Swirl/.test(material.name)) material.emissiveIntensity = 3;
      else if (acidShell) {
        material.emissive.setRGB(0.4, 1, 0.015); material.emissiveIntensity = 4.5;
      } else if (flow) {
        material.color.setRGB(0.12, 0.85, 0.65);
        material.emissive.setRGB(0.8, 1, 0.98); material.emissiveIntensity = 1.6;
      } else if (/Golden-Discharge/.test(material.name)) {
        material.emissive.setRGB(1, 0.48, 0.006); material.emissiveIntensity = 12;
      } else if (/Charged-Junctions/.test(material.name)) {
        material.emissive.setRGB(1, 0.65, 0.02); material.emissiveIntensity = 18;
      } else material.emissiveIntensity = 0;
      configureSpecimenSurface(material, shell ? 'shell' : flow ? 'flow' : eye ? 'eye' :
        /Golden-Discharge|Charged-Junctions/.test(material.name) ? 'electric' : 'core', this.surfaceUniforms);
      this.base.set(material, { opacity: material.opacity, emission: material.emissiveIntensity,
        transparent: material.transparent, depthWrite: material.depthWrite });
      material.needsUpdate = true;
    }
    for (const mesh of asset.meshes) {
      const name = mesh.material.name;
      if (/Obsidian/.test(name)) prepareSpecimenEyeCoordinates(mesh);
      // Closed inner volumes compose back to front around the opaque heart.
      // Keep the shell's depth writes so effects behind the body stay behind it.
      mesh.renderOrder = /Fusion-Heart/.test(name) ? 10 : /Acid-Swirl/.test(name) ? 11 :
        /Luminous-Acid/.test(name) ? 12 : /Aqua-Flow/.test(name) ? 13 :
        /Golden-Discharge|Charged-Junctions/.test(name) ? 14 : /Obsidian/.test(name) ? 15 : 16;
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
      material.depthWrite = base.depthWrite && value === 1;
    }
  }
  setCharge(value: number): void {
    this.surfaceUniforms.charge.value = value;
    for (const material of this.materials) material.emissiveIntensity = this.base.get(material)!.emission *
      (/Golden-Discharge|Charged-Junctions|Fusion-Heart/.test(material.name) ? 1 + 2 * value * value : 1);
  }
  setTime(seconds: number): void { this.surfaceUniforms.time.value = seconds; }
  setReflectionEnvironment(texture: THREE.Texture | null): void {
    for (const material of this.materials) { material.envMap = texture; material.needsUpdate = true; }
  }
  setReflectionIntensity(body: number, eyes: number): void {
    for (const material of this.materials) material.envMapIntensity = /Obsidian/.test(material.name) ? eyes : body;
  }
}
