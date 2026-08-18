import * as THREE from 'three';

import { slimeFragmentShader } from './slimeFragmentShader';
import { slimeVertexShader } from './slimeVertexShader';

export const DEFAULT_SLIME_BASE_COLOUR = 0x72ead0;
export const DEFAULT_SLIME_WOBBLE_AMPLITUDE_METRES = 0.034;
export const DEFAULT_SLIME_WOBBLE_FREQUENCY = 7.2;
export const DEFAULT_SLIME_WOBBLE_SPEED = 2.15;
export const DEFAULT_SLIME_SPECULAR_STRENGTH = 0.95;
export const DEFAULT_SLIME_SHININESS = 72;
export const DEFAULT_SLIME_RIM_STRENGTH = 0.72;
export const DEFAULT_SLIME_RIM_POWER = 2.35;

const MAX_SHADER_TIME_SECONDS = 4096;

const KEY_LIGHT_DIRECTION = new THREE.Vector3(8, 13.5, 8.5).normalize();

interface SlimeUniforms {
  [name: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uBaseColour: THREE.IUniform<THREE.Color>;
  uWobbleAmplitude: THREE.IUniform<number>;
  uWobbleFrequency: THREE.IUniform<number>;
  uWobbleSpeed: THREE.IUniform<number>;
  uKeyLightDirection: THREE.IUniform<THREE.Vector3>;
  uKeyLightRadiance: THREE.IUniform<THREE.Color>;
  uHemisphereSkyRadiance: THREE.IUniform<THREE.Color>;
  uHemisphereGroundRadiance: THREE.IUniform<THREE.Color>;
  uSpecularStrength: THREE.IUniform<number>;
  uShininess: THREE.IUniform<number>;
  uRimStrength: THREE.IUniform<number>;
  uRimPower: THREE.IUniform<number>;
}

export interface SlimeMaterialOptions {
  baseColour?: THREE.ColorRepresentation;
  wobbleAmplitudeMetres?: number;
}

/**
 * Handwritten, texture-free slime surface for the deformable visual mesh.
 *
 * The shader uses an explicit world-space approximation of RenderLayer's
 * clinical hemisphere fill and directional key. It does not consume arbitrary
 * scene lights; keeping this contract small makes every lighting term visible
 * and explainable. The material owns its uniform values and is disposed by the
 * scene that owns the slime mesh.
 */
export class SlimeMaterial extends THREE.ShaderMaterial {
  private readonly slimeUniforms: SlimeUniforms;
  private elapsedTimeSeconds = 0;

  constructor(options: SlimeMaterialOptions = {}) {
    const slimeUniforms: SlimeUniforms = {
      uTime: { value: 0 },
      uBaseColour: {
        value: new THREE.Color(
          options.baseColour ?? DEFAULT_SLIME_BASE_COLOUR,
        ),
      },
      uWobbleAmplitude: {
        value:
          options.wobbleAmplitudeMetres ??
          DEFAULT_SLIME_WOBBLE_AMPLITUDE_METRES,
      },
      uWobbleFrequency: { value: DEFAULT_SLIME_WOBBLE_FREQUENCY },
      uWobbleSpeed: { value: DEFAULT_SLIME_WOBBLE_SPEED },
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
      uSpecularStrength: { value: DEFAULT_SLIME_SPECULAR_STRENGTH },
      uShininess: { value: DEFAULT_SLIME_SHININESS },
      uRimStrength: { value: DEFAULT_SLIME_RIM_STRENGTH },
      uRimPower: { value: DEFAULT_SLIME_RIM_POWER },
    };

    super({
      name: 'wet-wobbling-slime-material',
      uniforms: slimeUniforms,
      vertexShader: slimeVertexShader,
      fragmentShader: slimeFragmentShader,
    });

    this.slimeUniforms = slimeUniforms;
  }

  /** Advance visual time without allocating or touching gameplay state. */
  update(deltaSeconds: number): void {
    this.elapsedTimeSeconds =
      (this.elapsedTimeSeconds + deltaSeconds) % MAX_SHADER_TIME_SECONDS;
    this.slimeUniforms.uTime.value = this.elapsedTimeSeconds;
  }

  /** Recolour the same material instance for a future slime identity. */
  setBaseColour(colour: THREE.ColorRepresentation): void {
    this.slimeUniforms.uBaseColour.value.set(colour);
  }
}
