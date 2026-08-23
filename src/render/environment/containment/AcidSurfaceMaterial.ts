import * as THREE from 'three';

import {
  acidSurfaceFragmentColour,
  acidSurfaceFragmentEmission,
  acidSurfaceFragmentNormal,
  acidSurfaceFragmentPars,
  acidSurfaceFragmentRoughness,
  acidSurfaceVertexPars,
  acidSurfaceVertexPosition,
} from './acidSurfaceShader.ts';

export const DEFAULT_ACID_DEEP_COLOUR = 0x1f2d09;
export const DEFAULT_ACID_MID_COLOUR = 0x506719;
export const DEFAULT_ACID_FILM_COLOUR = 0x91ad3b;
export const DEFAULT_ACID_BUBBLE_COLOUR = 0xc0cf63;
export const DEFAULT_ACID_FLOW_SPEED = 0.082;
export const DEFAULT_ACID_FLOW_SCALE = 0.17;
export const DEFAULT_ACID_BUBBLE_SCALE = 5.2;
export const DEFAULT_ACID_BUBBLE_STRENGTH = 0.64;
export const DEFAULT_ACID_EMISSION_STRENGTH = 0.025;

const ACID_PROGRAM_CACHE_KEY = 'specimen-room-3-acid-standard-surface-v1';

interface AcidSurfaceUniforms {
  [name: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uDeepColour: THREE.IUniform<THREE.Color>;
  uMidColour: THREE.IUniform<THREE.Color>;
  uFilmColour: THREE.IUniform<THREE.Color>;
  uBubbleColour: THREE.IUniform<THREE.Color>;
  uFlowSpeed: THREE.IUniform<number>;
  uFlowScale: THREE.IUniform<number>;
  uBubbleScale: THREE.IUniform<number>;
  uBubbleStrength: THREE.IUniform<number>;
  uEmissionStrength: THREE.IUniform<number>;
}

export interface AcidSurfaceMaterialOptions {
  readonly foundationMap?: THREE.Texture;
  readonly microNormalMap?: THREE.Texture;
}

export interface AcidSurfaceMaterialDiagnostics {
  readonly timeSeconds: number;
  readonly flowSpeed: number;
  readonly flowScale: number;
  readonly bubbleScale: number;
  readonly bubbleStrength: number;
  readonly emissionStrength: number;
}

/**
 * Room 3's texture-light procedural liquid surface.
 *
 * The handwritten colour/motion/bubble stages extend MeshStandardMaterial so
 * Three.js retains ownership of the room's real lights, tone mapping, PBR
 * specular response, fog, and output colour transform.
 */
export class AcidSurfaceMaterial extends THREE.MeshStandardMaterial {
  private readonly acidUniforms: AcidSurfaceUniforms;
  private elapsedTimeSeconds = 0;

  constructor(options: AcidSurfaceMaterialOptions = {}) {
    const parameters: THREE.MeshStandardMaterialParameters = {
      name: 'room-3-hazardous-chemical-liquid',
      color: 0x3d5215,
      emissive: 0x111a03,
      emissiveIntensity: 0.025,
      roughness: 0.3,
      metalness: 0,
      normalScale: new THREE.Vector2(0.018, 0.018),
    };
    if (options.foundationMap) parameters.map = options.foundationMap;
    if (options.microNormalMap) parameters.normalMap = options.microNormalMap;
    super(parameters);

    this.acidUniforms = {
      uTime: { value: 0 },
      uDeepColour: { value: new THREE.Color(DEFAULT_ACID_DEEP_COLOUR) },
      uMidColour: { value: new THREE.Color(DEFAULT_ACID_MID_COLOUR) },
      uFilmColour: { value: new THREE.Color(DEFAULT_ACID_FILM_COLOUR) },
      uBubbleColour: { value: new THREE.Color(DEFAULT_ACID_BUBBLE_COLOUR) },
      uFlowSpeed: { value: DEFAULT_ACID_FLOW_SPEED },
      uFlowScale: { value: DEFAULT_ACID_FLOW_SCALE },
      uBubbleScale: { value: DEFAULT_ACID_BUBBLE_SCALE },
      uBubbleStrength: { value: DEFAULT_ACID_BUBBLE_STRENGTH },
      uEmissionStrength: { value: DEFAULT_ACID_EMISSION_STRENGTH },
    };

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.acidUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\n${acidSurfaceVertexPars}`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>\n${acidSurfaceVertexPosition}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${acidSurfaceFragmentPars}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>\n${acidSurfaceFragmentColour}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\n${acidSurfaceFragmentRoughness}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>\n${acidSurfaceFragmentNormal}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n${acidSurfaceFragmentEmission}`,
        );
    };
    this.customProgramCacheKey = () => ACID_PROGRAM_CACHE_KEY;
  }

  get diagnostics(): AcidSurfaceMaterialDiagnostics {
    return {
      timeSeconds: this.acidUniforms.uTime.value,
      flowSpeed: this.acidUniforms.uFlowSpeed.value,
      flowScale: this.acidUniforms.uFlowScale.value,
      bubbleScale: this.acidUniforms.uBubbleScale.value,
      bubbleStrength: this.acidUniforms.uBubbleStrength.value,
      emissionStrength: this.acidUniforms.uEmissionStrength.value,
    };
  }

  /** Advance the existing uniform object from the level's shared fixed step. */
  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('Acid surface deltaSeconds must be finite and non-negative.');
    }
    this.elapsedTimeSeconds += deltaSeconds;
    this.acidUniforms.uTime.value = this.elapsedTimeSeconds;
  }
}
