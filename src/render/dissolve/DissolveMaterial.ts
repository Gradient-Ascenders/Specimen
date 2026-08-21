import * as THREE from 'three';

import { dissolveFragmentShader } from './dissolveFragmentShader.ts';
import { dissolveNoiseGlsl } from './dissolveNoise.ts';
import { dissolveVertexShader } from './dissolveVertexShader.ts';

export const DEFAULT_DISSOLVE_NOISE_SCALE = 1.75;
export const DEFAULT_DISSOLVE_EDGE_WIDTH = 0.075;
export const DEFAULT_DISSOLVE_EDGE_COLOUR = 0xb7ff57;

const KEY_LIGHT_DIRECTION = new THREE.Vector3(8, 13.5, 8.5).normalize();
const SHADOW_PROGRAM_CACHE_KEY = 'specimen-dissolve-shadow-mask-v1';

interface DissolveMaskUniforms {
  [name: string]: THREE.IUniform;
  uDissolveAmount: THREE.IUniform<number>;
  uNoiseScale: THREE.IUniform<number>;
  uNoiseOffset: THREE.IUniform<THREE.Vector3>;
}

interface DissolveSurfaceUniforms extends DissolveMaskUniforms {
  uEdgeWidth: THREE.IUniform<number>;
  uBaseColour: THREE.IUniform<THREE.Color>;
  uEmissiveColour: THREE.IUniform<THREE.Color>;
  uEdgeColour: THREE.IUniform<THREE.Color>;
  uKeyLightDirection: THREE.IUniform<THREE.Vector3>;
  uKeyLightRadiance: THREE.IUniform<THREE.Color>;
  uHemisphereSkyRadiance: THREE.IUniform<THREE.Color>;
  uHemisphereGroundRadiance: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
}

interface ColourMaterial extends THREE.Material {
  readonly color?: THREE.Color;
  readonly emissive?: THREE.Color;
  readonly emissiveIntensity?: number;
}

export interface DissolveMaterialOptions {
  readonly sourceMaterial: THREE.Material;
  readonly maskUniforms: DissolveMaskUniforms;
  readonly edgeColour?: THREE.ColorRepresentation;
  readonly edgeWidth?: number;
}

export interface DissolveMaterialBundleDiagnostics {
  readonly dissolveAmount: number;
  readonly materialCount: number;
  readonly hasDepthMaterial: boolean;
  readonly hasDistanceMaterial: boolean;
  readonly noiseOffset: readonly [number, number, number];
}

/**
 * Visible, texture-free material for one authored soluble material slot.
 *
 * All slots on one target share the same mask uniforms, so grouped geometry
 * cannot split into contradictory dissolve states.
 */
export class DissolveMaterial extends THREE.ShaderMaterial {
  constructor(options: DissolveMaterialOptions) {
    const source = options.sourceMaterial as ColourMaterial;
    const baseColour = source.color?.clone() ?? new THREE.Color(0x9a6640);
    const emissiveColour = source.emissive?.clone() ?? new THREE.Color(0);
    emissiveColour.multiplyScalar(source.emissiveIntensity ?? 1);

    const uniforms: DissolveSurfaceUniforms = {
      ...options.maskUniforms,
      uEdgeWidth: {
        value: options.edgeWidth ?? DEFAULT_DISSOLVE_EDGE_WIDTH,
      },
      uBaseColour: { value: baseColour },
      uEmissiveColour: { value: emissiveColour },
      uEdgeColour: {
        value: new THREE.Color(
          options.edgeColour ?? DEFAULT_DISSOLVE_EDGE_COLOUR,
        ),
      },
      uKeyLightDirection: { value: KEY_LIGHT_DIRECTION.clone() },
      uKeyLightRadiance: {
        value: new THREE.Color(0xffffff).multiplyScalar(1.15),
      },
      uHemisphereSkyRadiance: {
        value: new THREE.Color(0xddeeff).multiplyScalar(0.48),
      },
      uHemisphereGroundRadiance: {
        value: new THREE.Color(0x25332e).multiplyScalar(0.32),
      },
      uOpacity: { value: source.opacity },
    };

    super({
      name: `dissolve-${source.name || 'authored'}-material`,
      uniforms,
      vertexShader: dissolveVertexShader,
      fragmentShader: dissolveFragmentShader,
      side: source.side,
      transparent: source.transparent || source.opacity < 1,
      depthTest: source.depthTest,
      depthWrite: source.depthWrite,
      toneMapped: true,
    });

    this.shadowSide = source.shadowSide;
  }
}

/** Owns the visible materials and matching directional/point shadow passes. */
export class DissolveMaterialBundle {
  readonly surfaceMaterials: readonly DissolveMaterial[];
  readonly depthMaterial: THREE.MeshDepthMaterial;
  readonly distanceMaterial: THREE.MeshDistanceMaterial;

  private readonly maskUniforms: DissolveMaskUniforms;
  private disposed = false;

  constructor(
    sourceMaterials: readonly THREE.Material[],
    targetId: string,
  ) {
    if (sourceMaterials.length === 0) {
      throw new Error('Dissolve targets require at least one material.');
    }

    this.maskUniforms = {
      uDissolveAmount: { value: 0 },
      uNoiseScale: { value: DEFAULT_DISSOLVE_NOISE_SCALE },
      uNoiseOffset: { value: createDeterministicNoiseOffset(targetId) },
    };
    this.surfaceMaterials = sourceMaterials.map(
      (sourceMaterial) =>
        new DissolveMaterial({
          sourceMaterial,
          maskUniforms: this.maskUniforms,
        }),
    );
    this.depthMaterial = createDepthMaterial(this.maskUniforms);
    this.distanceMaterial = createDistanceMaterial(this.maskUniforms);
  }

  get dissolveAmount(): number {
    return this.maskUniforms.uDissolveAmount.value;
  }

  get diagnostics(): DissolveMaterialBundleDiagnostics {
    const offset = this.maskUniforms.uNoiseOffset.value;
    return {
      dissolveAmount: this.dissolveAmount,
      materialCount: this.surfaceMaterials.length,
      hasDepthMaterial: true,
      hasDistanceMaterial: true,
      noiseOffset: [offset.x, offset.y, offset.z],
    };
  }

  setDissolveAmount(amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new Error('Dissolve render progress must be finite.');
    }
    this.maskUniforms.uDissolveAmount.value = THREE.MathUtils.clamp(
      amount,
      0,
      1,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.surfaceMaterials) material.dispose();
    this.depthMaterial.dispose();
    this.distanceMaterial.dispose();
  }
}

function createDeterministicNoiseOffset(id: string): THREE.Vector3 {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const component = (shift: number): number =>
    (((hash >>> shift) & 0x3ff) / 1023) * 19.0;
  return new THREE.Vector3(component(0), component(10), component(20));
}

function createDepthMaterial(
  uniforms: DissolveMaskUniforms,
): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial();
  material.name = 'dissolve-directional-depth-material';
  configureShadowShader(material, uniforms);
  return material;
}

function createDistanceMaterial(
  uniforms: DissolveMaskUniforms,
): THREE.MeshDistanceMaterial {
  const material = new THREE.MeshDistanceMaterial();
  material.name = 'dissolve-point-distance-material';
  configureShadowShader(material, uniforms);
  return material;
}

function configureShadowShader(
  material: THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial,
  uniforms: DissolveMaskUniforms,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolveAmount = uniforms.uDissolveAmount;
    shader.uniforms.uNoiseScale = uniforms.uNoiseScale;
    shader.uniforms.uNoiseOffset = uniforms.uNoiseOffset;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vDissolveLocalPosition;',
      )
      .replace(
        '#include <project_vertex>',
        'vDissolveLocalPosition = transformed;\n#include <project_vertex>',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDissolveAmount;
uniform float uNoiseScale;
uniform vec3 uNoiseOffset;
varying vec3 vDissolveLocalPosition;
${dissolveNoiseGlsl}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float dissolveShadowMask = dissolveMask(vDissolveLocalPosition);
if (uDissolveAmount > 0.0 && dissolveShadowMask <= uDissolveAmount) {
  discard;
}`,
      );
  };
  material.customProgramCacheKey = () => SHADOW_PROGRAM_CACHE_KEY;
}
