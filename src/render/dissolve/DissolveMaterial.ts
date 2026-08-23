import * as THREE from 'three';

import {
  dissolveFragmentDiscard,
  dissolveFragmentEdge,
  dissolveFragmentEdgePars,
  dissolveFragmentPars,
} from './dissolveFragmentShader.ts';
import {
  dissolveVertexPars,
  dissolveVertexPosition,
} from './dissolveVertexShader.ts';

export const DEFAULT_DISSOLVE_NOISE_SCALE = 1.75;
export const DEFAULT_DISSOLVE_EDGE_WIDTH = 0.075;
export const DEFAULT_DISSOLVE_EDGE_COLOUR = 0xb7ff57;
export const DEFAULT_AIM_HIGHLIGHT_COLOUR = 0xd7ff65;
export const DEFAULT_BURN_HIGHLIGHT_COLOUR = 0xb4ff45;

const SURFACE_PROGRAM_CACHE_KEY = 'specimen-dissolve-standard-surface-v3';
const SHADOW_PROGRAM_CACHE_KEY = 'specimen-dissolve-shadow-mask-v2';

interface DissolveMaskUniforms {
  [name: string]: THREE.IUniform;
  uDissolveAmount: THREE.IUniform<number>;
  uNoiseScale: THREE.IUniform<number>;
  uNoiseOffset: THREE.IUniform<THREE.Vector3>;
}

interface CorrosionPresentationUniforms {
  [name: string]: THREE.IUniform;
  uAimHighlightStrength: THREE.IUniform<number>;
  uAimSelectedStrength: THREE.IUniform<number>;
  uAimHighlightColour: THREE.IUniform<THREE.Color>;
  uBurnHighlightStrength: THREE.IUniform<number>;
  uBurnHighlightColour: THREE.IUniform<THREE.Color>;
  uCorrosionPresentationTime: THREE.IUniform<number>;
}

export interface DissolveMaterialOptions {
  readonly sourceMaterial: THREE.MeshStandardMaterial;
  readonly maskUniforms: DissolveMaskUniforms;
  readonly presentationUniforms: CorrosionPresentationUniforms;
  readonly edgeColour?: THREE.ColorRepresentation;
  readonly edgeWidth?: number;
}

export interface DissolveMaterialBundleDiagnostics {
  readonly dissolveAmount: number;
  readonly aimHighlightStrength: number;
  readonly aimSelectedStrength: number;
  readonly burnHighlightStrength: number;
  readonly materialCount: number;
  readonly hasDepthMaterial: boolean;
  readonly hasDistanceMaterial: boolean;
  readonly noiseOffset: readonly [number, number, number];
}

/**
 * A private copy of one authored MeshStandardMaterial with two small shader
 * insertions: the gameplay threshold discard and an emissive corrosion edge.
 * Three.js still owns all scene-light, shadow, fog, map, and PBR evaluation.
 */
export class DissolveMaterial extends THREE.MeshStandardMaterial {
  readonly dissolveAmountUniform: THREE.IUniform<number>;

  constructor(options: DissolveMaterialOptions) {
    super();
    this.copy(options.sourceMaterial);
    this.name = `dissolve-${options.sourceMaterial.name || 'authored'}-material`;
    this.dissolveAmountUniform = options.maskUniforms.uDissolveAmount;

    const edgeWidthUniform: THREE.IUniform<number> = {
      value: options.edgeWidth ?? DEFAULT_DISSOLVE_EDGE_WIDTH,
    };
    const edgeColourUniform: THREE.IUniform<THREE.Color> = {
      value: new THREE.Color(
        options.edgeColour ?? DEFAULT_DISSOLVE_EDGE_COLOUR,
      ),
    };

    this.onBeforeCompile = (shader) => {
      shader.uniforms.uDissolveAmount = options.maskUniforms.uDissolveAmount;
      shader.uniforms.uNoiseScale = options.maskUniforms.uNoiseScale;
      shader.uniforms.uNoiseOffset = options.maskUniforms.uNoiseOffset;
      shader.uniforms.uDissolveEdgeWidth = edgeWidthUniform;
      shader.uniforms.uDissolveEdgeColour = edgeColourUniform;
      shader.uniforms.uAimHighlightStrength =
        options.presentationUniforms.uAimHighlightStrength;
      shader.uniforms.uAimSelectedStrength =
        options.presentationUniforms.uAimSelectedStrength;
      shader.uniforms.uAimHighlightColour =
        options.presentationUniforms.uAimHighlightColour;
      shader.uniforms.uBurnHighlightStrength =
        options.presentationUniforms.uBurnHighlightStrength;
      shader.uniforms.uBurnHighlightColour =
        options.presentationUniforms.uBurnHighlightColour;
      shader.uniforms.uCorrosionPresentationTime =
        options.presentationUniforms.uCorrosionPresentationTime;

      shader.vertexShader = injectDissolveVertexShader(shader.vertexShader);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${dissolveFragmentPars}\n${dissolveFragmentEdgePars}`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\n${dissolveFragmentDiscard}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n${dissolveFragmentEdge}`,
        );
    };
    this.customProgramCacheKey = () => SURFACE_PROGRAM_CACHE_KEY;
  }
}

/** Owns the visible materials and matching directional/point shadow passes. */
export class DissolveMaterialBundle {
  readonly surfaceMaterials: readonly DissolveMaterial[];
  readonly depthMaterial: THREE.MeshDepthMaterial;
  readonly distanceMaterial: THREE.MeshDistanceMaterial;

  private readonly maskUniforms: DissolveMaskUniforms;
  private readonly presentationUniforms: CorrosionPresentationUniforms;
  private disposed = false;

  constructor(sourceMaterials: readonly THREE.Material[], targetId: string) {
    if (sourceMaterials.length === 0) {
      throw new Error('Dissolve targets require at least one material.');
    }

    const standardMaterials = sourceMaterials.map((sourceMaterial) => {
      if (
        !(sourceMaterial instanceof THREE.MeshStandardMaterial) ||
        sourceMaterial.type !== 'MeshStandardMaterial'
      ) {
        throw new Error(
          `Dissolve target "${targetId}" requires explicitly authored MeshStandardMaterial surfaces.`,
        );
      }
      return sourceMaterial as THREE.MeshStandardMaterial;
    });

    this.maskUniforms = {
      uDissolveAmount: { value: 0 },
      uNoiseScale: { value: DEFAULT_DISSOLVE_NOISE_SCALE },
      uNoiseOffset: { value: createDeterministicNoiseOffset(targetId) },
    };
    this.presentationUniforms = {
      uAimHighlightStrength: { value: 0 },
      uAimSelectedStrength: { value: 0 },
      uAimHighlightColour: {
        value: new THREE.Color(DEFAULT_AIM_HIGHLIGHT_COLOUR),
      },
      uBurnHighlightStrength: { value: 0 },
      uBurnHighlightColour: {
        value: new THREE.Color(DEFAULT_BURN_HIGHLIGHT_COLOUR),
      },
      uCorrosionPresentationTime: { value: 0 },
    };
    this.surfaceMaterials = standardMaterials.map(
      (sourceMaterial) =>
        new DissolveMaterial({
          sourceMaterial,
          maskUniforms: this.maskUniforms,
          presentationUniforms: this.presentationUniforms,
        }),
    );
    this.depthMaterial = createDepthMaterial(
      this.maskUniforms,
      standardMaterials[0],
    );
    this.distanceMaterial = createDistanceMaterial(
      this.maskUniforms,
      standardMaterials[0],
    );
  }

  get dissolveAmount(): number {
    return this.maskUniforms.uDissolveAmount.value;
  }

  get diagnostics(): DissolveMaterialBundleDiagnostics {
    const offset = this.maskUniforms.uNoiseOffset.value;
    return {
      dissolveAmount: this.dissolveAmount,
      aimHighlightStrength:
        this.presentationUniforms.uAimHighlightStrength.value,
      aimSelectedStrength:
        this.presentationUniforms.uAimSelectedStrength.value,
      burnHighlightStrength:
        this.presentationUniforms.uBurnHighlightStrength.value,
      materialCount: this.surfaceMaterials.length,
      hasDepthMaterial: true,
      hasDistanceMaterial: true,
      noiseOffset: [offset.x, offset.y, offset.z],
    };
  }

  setCorrosionPresentation(
    aimStrength: number,
    selectedStrength: number,
    burnStrength: number,
    timeSeconds: number,
  ): void {
    for (const [name, value] of [
      ['aim strength', aimStrength],
      ['selected strength', selectedStrength],
      ['burn strength', burnStrength],
      ['presentation time', timeSeconds],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new Error(`Dissolve ${name} must be finite.`);
      }
    }
    this.presentationUniforms.uAimHighlightStrength.value =
      THREE.MathUtils.clamp(aimStrength, 0, 1);
    this.presentationUniforms.uAimSelectedStrength.value =
      THREE.MathUtils.clamp(selectedStrength, 0, 1);
    this.presentationUniforms.uBurnHighlightStrength.value =
      THREE.MathUtils.clamp(burnStrength, 0, 1);
    this.presentationUniforms.uCorrosionPresentationTime.value =
      Math.max(0, timeSeconds);
  }

  clearCorrosionPresentation(): void {
    this.setCorrosionPresentation(0, 0, 0, 0);
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
  source: THREE.MeshStandardMaterial,
): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial();
  copyShadowSurfaceProperties(material, source);
  material.name = 'dissolve-directional-depth-material';
  configureShadowShader(material, uniforms);
  return material;
}

function createDistanceMaterial(
  uniforms: DissolveMaskUniforms,
  source: THREE.MeshStandardMaterial,
): THREE.MeshDistanceMaterial {
  const material = new THREE.MeshDistanceMaterial();
  copyShadowSurfaceProperties(material, source);
  material.name = 'dissolve-point-distance-material';
  configureShadowShader(material, uniforms);
  return material;
}

function copyShadowSurfaceProperties(
  material: THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial,
  source: THREE.MeshStandardMaterial,
): void {
  material.side = source.side;
  material.shadowSide = source.shadowSide;
  material.depthTest = source.depthTest;
  material.depthWrite = source.depthWrite;
  material.alphaTest = source.alphaTest;
  material.map = source.map;
  material.alphaMap = source.alphaMap;
  material.displacementMap = source.displacementMap;
  material.displacementScale = source.displacementScale;
  material.displacementBias = source.displacementBias;
  material.clipShadows = source.clipShadows;
  material.clippingPlanes = source.clippingPlanes;
  material.clipIntersection = source.clipIntersection;
}

function injectDissolveVertexShader(vertexShader: string): string {
  return vertexShader
    .replace(
      '#include <common>',
      `#include <common>\n${dissolveVertexPars}`,
    )
    .replace(
      '#include <project_vertex>',
      `${dissolveVertexPosition}\n#include <project_vertex>`,
    );
}

function configureShadowShader(
  material: THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial,
  uniforms: DissolveMaskUniforms,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolveAmount = uniforms.uDissolveAmount;
    shader.uniforms.uNoiseScale = uniforms.uNoiseScale;
    shader.uniforms.uNoiseOffset = uniforms.uNoiseOffset;

    shader.vertexShader = injectDissolveVertexShader(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${dissolveFragmentPars}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>\n${dissolveFragmentDiscard}`,
      );
  };
  material.customProgramCacheKey = () => SHADOW_PROGRAM_CACHE_KEY;
}
