import * as THREE from 'three';

import { slimeFragmentShader } from './slimeFragmentShader.ts';
import { slimeVertexShader } from './slimeVertexShader.ts';

export const DEFAULT_SLIME_BASE_COLOUR = 0x72ead0;
export const DEFAULT_SLIME_WOBBLE_AMPLITUDE_METRES = 0.034;
export const DEFAULT_SLIME_WOBBLE_FREQUENCY = 7.2;
export const DEFAULT_SLIME_WOBBLE_SPEED = 2.15;
export const DEFAULT_SLIME_SPECULAR_STRENGTH = 0.95;
export const DEFAULT_SLIME_SHININESS = 72;
export const DEFAULT_SLIME_RIM_STRENGTH = 0.72;
export const DEFAULT_SLIME_RIM_POWER = 2.35;

// The secondary wave runs at 0.79 = 79/100 of the primary speed. After the
// primary completes 100 cycles, the secondary has completed exactly 79, so
// both deformation and its derivative are phase-continuous at this wrap.
const WOBBLE_COMMON_PERIOD_SECONDS =
  (Math.PI * 2 * 100) / DEFAULT_SLIME_WOBBLE_SPEED;

const KEY_LIGHT_DIRECTION = new THREE.Vector3(8, 13.5, 8.5).normalize();

interface SlimeUniforms {
  [name: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uBaseColour: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
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
  uSpeed: THREE.IUniform<number>;
  uLocomotionPhase: THREE.IUniform<number>;
  uMoveDirectionLocal: THREE.IUniform<THREE.Vector3>;
  uSurfaceNormalLocal: THREE.IUniform<THREE.Vector3>;
  uSurfaceTangentLocal: THREE.IUniform<THREE.Vector3>;
  uGrounded: THREE.IUniform<number>;
  uAttached: THREE.IUniform<number>;
  uJumpCharge: THREE.IUniform<number>;
  uSquash: THREE.IUniform<number>;
  uStretch: THREE.IUniform<number>;
  uStretchDirectionLocal: THREE.IUniform<THREE.Vector3>;
  uInertiaLocal: THREE.IUniform<THREE.Vector3>;
  uImpactPointLocal: THREE.IUniform<THREE.Vector3>;
  uImpactNormalLocal: THREE.IUniform<THREE.Vector3>;
  uImpactStrength: THREE.IUniform<number>;
  uImpactAge: THREE.IUniform<number>;
  uImpactElasticity: THREE.IUniform<number>;
}

export interface SlimeMaterialOptions {
  baseColour?: THREE.ColorRepresentation;
  wobbleAmplitudeMetres?: number;
}

export interface SlimeMaterialDeformationState {
  speed: number;
  locomotionPhase: number;
  moveDirectionLocal: THREE.Vector3;
  surfaceNormalLocal: THREE.Vector3;
  surfaceTangentLocal: THREE.Vector3;
  grounded: number;
  attached: number;
  jumpCharge: number;
  squash: number;
  stretch: number;
  stretchDirectionLocal: THREE.Vector3;
  inertiaLocal: THREE.Vector3;
  impactPointLocal: THREE.Vector3;
  impactNormalLocal: THREE.Vector3;
  impactStrength: number;
  impactAge: number;
  impactElasticity: number;
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
      uOpacity: { value: 1 },
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
      uSpeed: { value: 0 },
      uLocomotionPhase: { value: 0 },
      uMoveDirectionLocal: { value: new THREE.Vector3(0, 0, -1) },
      uSurfaceNormalLocal: { value: new THREE.Vector3(0, 1, 0) },
      uSurfaceTangentLocal: { value: new THREE.Vector3(0, 0, 1) },
      uGrounded: { value: 1 },
      uAttached: { value: 0 },
      uJumpCharge: { value: 0 },
      uSquash: { value: 0 },
      uStretch: { value: 0 },
      uStretchDirectionLocal: { value: new THREE.Vector3(0, 1, 0) },
      uInertiaLocal: { value: new THREE.Vector3() },
      uImpactPointLocal: { value: new THREE.Vector3(0, -0.45, 0) },
      uImpactNormalLocal: { value: new THREE.Vector3(0, 1, 0) },
      uImpactStrength: { value: 0 },
      uImpactAge: { value: 10 },
      uImpactElasticity: { value: 1 },
    };

    super({
      name: 'wet-wobbling-slime-material',
      uniforms: slimeUniforms,
      vertexShader: slimeVertexShader,
      fragmentShader: slimeFragmentShader,
      transparent: true,
    });

    this.slimeUniforms = slimeUniforms;
  }

  /** Advance visual time without allocating or touching gameplay state. */
  update(deltaSeconds: number): void {
    this.elapsedTimeSeconds =
      (this.elapsedTimeSeconds + deltaSeconds) %
      WOBBLE_COMMON_PERIOD_SECONDS;
    this.slimeUniforms.uTime.value = this.elapsedTimeSeconds;
  }

  /** Copy bounded visual-controller state into existing uniform values. */
  setDeformationState(state: SlimeMaterialDeformationState): void {
    this.slimeUniforms.uSpeed.value = state.speed;
    this.slimeUniforms.uLocomotionPhase.value = state.locomotionPhase;
    this.slimeUniforms.uMoveDirectionLocal.value.copy(
      state.moveDirectionLocal,
    );
    this.slimeUniforms.uSurfaceNormalLocal.value.copy(
      state.surfaceNormalLocal,
    );
    this.slimeUniforms.uSurfaceTangentLocal.value.copy(
      state.surfaceTangentLocal,
    );
    this.slimeUniforms.uGrounded.value = state.grounded;
    this.slimeUniforms.uAttached.value = state.attached;
    this.slimeUniforms.uJumpCharge.value = state.jumpCharge;
    this.slimeUniforms.uSquash.value = state.squash;
    this.slimeUniforms.uStretch.value = state.stretch;
    this.slimeUniforms.uStretchDirectionLocal.value.copy(
      state.stretchDirectionLocal,
    );
    this.slimeUniforms.uInertiaLocal.value.copy(state.inertiaLocal);
    this.slimeUniforms.uImpactPointLocal.value.copy(state.impactPointLocal);
    this.slimeUniforms.uImpactNormalLocal.value.copy(
      state.impactNormalLocal,
    );
    this.slimeUniforms.uImpactStrength.value = state.impactStrength;
    this.slimeUniforms.uImpactAge.value = state.impactAge;
    this.slimeUniforms.uImpactElasticity.value = state.impactElasticity;
  }

  /** Recolour the same material instance for a future slime identity. */
  setBaseColour(colour: THREE.ColorRepresentation): void {
    this.slimeUniforms.uBaseColour.value.set(colour);
  }

  setOpacity(opacity: number): void {
    const boundedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    this.opacity = boundedOpacity;
    this.slimeUniforms.uOpacity.value = boundedOpacity;
  }
}
