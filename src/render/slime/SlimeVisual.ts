import * as THREE from 'three';

import {
  SlimeMaterial,
  type SlimeMaterialDeformationState,
} from './SlimeMaterial.ts';

const VECTOR_EPSILON_SQ = 1e-8;
const FULL_CYCLE_RADIANS = Math.PI * 2;

export const SLIME_VISUAL_TUNING = {
  speedResponsePerSecond: 10,
  directionResponsePerSecond: 12,
  surfaceNormalResponsePerSecond: 14,
  groundedResponsePerSecond: 18,
  chargeResponsePerSecond: 16,
  inertiaResponsePerSecond: 9,
  maximumVisualAccelerationMetresPerSecondSquared: 42,
  slitherBaseAngularSpeedRadiansPerSecond: 4,
  slitherSpeedGainRadiansPerSecond: 5,
  airborneFullStretchSpeedMetresPerSecond: 9.84,
  airborneStretchMaximum: 0.16,
  launchStretchMaximum: 0.20,
  landingVisibleSpeedMetresPerSecond: 1.5,
  landingFullStrengthSpeedMetresPerSecond: 8.5,
  wallVisibleSpeedMetresPerSecond: 1.8,
  wallFullStrengthSpeedMetresPerSecond: 5.5,
  impactSpringStiffness: 105,
  impactSpringDamping: 12.5,
  launchSpringStiffness: 80,
  launchSpringDamping: 11,
  impactRippleDurationSeconds: 1.2,
  repeatedContactCooldownSeconds: 0.18,
  normalImpactElasticity: 1,
  bounceImpactElasticity: 1.65,
  stickyImpactElasticity: 1.15,
} as const;

export interface Vector3State {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SlimeVisualState {
  velocityWorld: Vector3State;
  surfaceNormalWorld: Vector3State;
  gameplayUpWorld: Vector3State;
  grounded: boolean;
  attached: boolean;
  jumpCharge: number;
  maximumLocomotionSpeedMetresPerSecond: number;
  contactCount: number;
  contactNormalWorld: Vector3State;
  contactSpeedMetresPerSecond: number;
  contactName: string;
  contactSurfaceTag: string;
  landedThisStep: boolean;
}

export type SlimeImpactKind = 'landing' | 'wall' | 'bounce' | 'sticky';

export interface SlimeVisualImpact {
  normalWorld: Vector3State;
  strength: number;
  kind: SlimeImpactKind;
}

export interface SlimeVisualLaunch {
  directionWorld: Vector3State;
  speedMetresPerSecond: number;
  chargeFraction: number;
}

export interface SlimeVisualDiagnostics {
  readonly speed: number;
  readonly locomotionPhase: number;
  readonly grounded: number;
  readonly jumpCharge: number;
  readonly squash: number;
  readonly stretch: number;
  readonly impactStrength: number;
  readonly impactAge: number;
  readonly impactNormalLocal: THREE.Vector3;
  readonly surfaceNormalLocal: THREE.Vector3;
  readonly surfaceTangentLocal: THREE.Vector3;
  readonly moveDirectionLocal: THREE.Vector3;
}

export interface SlimeVisualOptions {
  radiusMetres: number;
  baseColour?: THREE.ColorRepresentation;
}

/**
 * Visual-only bridge from authoritative gameplay facts to shader uniforms.
 * It owns no collision state and never writes back to KinematicBody.
 */
export class SlimeVisual {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, SlimeMaterial>;

  private readonly radiusMetres: number;
  private readonly material: SlimeMaterial;
  private readonly inverseWorldQuaternion = new THREE.Quaternion();
  private readonly worldVelocity = new THREE.Vector3();
  private readonly previousWorldVelocity = new THREE.Vector3();
  private readonly tangentialVelocity = new THREE.Vector3();
  private readonly targetDirection = new THREE.Vector3(0, 0, -1);
  private readonly targetSurfaceNormal = new THREE.Vector3(0, 1, 0);
  private readonly inertiaTarget = new THREE.Vector3();
  private readonly moveDirectionWorld = new THREE.Vector3(0, 0, -1);
  private readonly surfaceNormalWorld = new THREE.Vector3(0, 1, 0);
  private readonly surfaceTangentWorld = new THREE.Vector3(0, 0, 1);
  private readonly stretchDirectionWorld = new THREE.Vector3(0, 1, 0);
  private readonly inertiaWorld = new THREE.Vector3();
  private readonly impactNormalWorld = new THREE.Vector3(0, 1, 0);
  private readonly directionRotationAxis = new THREE.Vector3();
  private readonly directionReferenceAxis = new THREE.Vector3();
  private readonly directionRotation = new THREE.Quaternion();

  private readonly deformationState: SlimeMaterialDeformationState = {
    speed: 0,
    locomotionPhase: 0,
    moveDirectionLocal: new THREE.Vector3(0, 0, -1),
    surfaceNormalLocal: new THREE.Vector3(0, 1, 0),
    surfaceTangentLocal: new THREE.Vector3(0, 0, 1),
    grounded: 1,
    attached: 0,
    jumpCharge: 0,
    squash: 0,
    stretch: 0,
    stretchDirectionLocal: new THREE.Vector3(0, 1, 0),
    inertiaLocal: new THREE.Vector3(),
    impactPointLocal: new THREE.Vector3(0, -0.45, 0),
    impactNormalLocal: new THREE.Vector3(0, 1, 0),
    impactStrength: 0,
    impactAge: SLIME_VISUAL_TUNING.impactRippleDurationSeconds,
    impactElasticity: SLIME_VISUAL_TUNING.normalImpactElasticity,
  };

  private impactSpring = 0;
  private impactSpringVelocity = 0;
  private launchSpring = 0;
  private launchSpringVelocity = 0;
  private contactCooldownSeconds = 0;
  private previousContactName = 'none';

  constructor(options: SlimeVisualOptions) {
    this.radiusMetres = options.radiusMetres;
    this.material = new SlimeMaterial({ baseColour: options.baseColour });
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(options.radiusMetres, 24, 16),
      this.material,
    );
    this.mesh.name = `player-slime-visual-radius-${options.radiusMetres}m`;
    this.mesh.userData.radiusMetres = options.radiusMetres;
    this.deformationState.impactPointLocal.set(
      0,
      -options.radiusMetres,
      0,
    );
  }

  get diagnostics(): SlimeVisualDiagnostics {
    return this.deformationState;
  }

  setPosition(position: Vector3State): void {
    this.mesh.position.set(position.x, position.y, position.z);
  }

  setBaseColour(colour: THREE.ColorRepresentation): void {
    this.material.setBaseColour(colour);
  }

  setOpacity(opacity: number): void {
    this.material.setOpacity(opacity);
  }

  update(deltaSeconds: number, state: SlimeVisualState): void {
    this.material.update(deltaSeconds);
    this.updateWorldBasis(state);
    this.updateContinuousState(deltaSeconds, state);
    this.updateContactImpact(deltaSeconds, state);
    this.updateSprings(deltaSeconds);
    this.previousWorldVelocity.copy(this.worldVelocity);
  }

  /** Convert fixed-step world state through the current rendered orientation. */
  present(): void {
    this.mesh.getWorldQuaternion(this.inverseWorldQuaternion).invert();
    this.copyWorldDirectionToLocal(
      this.moveDirectionWorld,
      this.deformationState.moveDirectionLocal,
    );
    this.copyWorldDirectionToLocal(
      this.surfaceNormalWorld,
      this.deformationState.surfaceNormalLocal,
    );
    this.copyWorldDirectionToLocal(
      this.surfaceTangentWorld,
      this.deformationState.surfaceTangentLocal,
    );
    this.copyWorldDirectionToLocal(
      this.stretchDirectionWorld,
      this.deformationState.stretchDirectionLocal,
    );
    this.deformationState.inertiaLocal
      .copy(this.inertiaWorld)
      .applyQuaternion(this.inverseWorldQuaternion);
    this.copyWorldDirectionToLocal(
      this.impactNormalWorld,
      this.deformationState.impactNormalLocal,
    );
    this.deformationState.impactPointLocal
      .copy(this.deformationState.impactNormalLocal)
      .multiplyScalar(-this.radiusMetres);
    this.material.setDeformationState(this.deformationState);
  }

  onImpact(impact: SlimeVisualImpact): void {
    const strength = THREE.MathUtils.clamp(impact.strength, 0, 1);
    if (strength <= 0) return;

    this.copyDirection(impact.normalWorld, this.impactNormalWorld);
    this.deformationState.impactStrength = strength;
    this.deformationState.impactAge = 0;
    this.deformationState.impactElasticity =
      this.elasticityForImpact(impact.kind);

    const springStrength = strength *
      this.deformationState.impactElasticity;
    this.impactSpring = Math.max(this.impactSpring, springStrength);
    this.impactSpringVelocity = Math.max(
      this.impactSpringVelocity,
      springStrength * 1.5,
    );
    this.contactCooldownSeconds =
      SLIME_VISUAL_TUNING.repeatedContactCooldownSeconds;
  }

  onLaunch(launch: SlimeVisualLaunch): void {
    this.copyDirection(launch.directionWorld, this.stretchDirectionWorld);
    const speedStrength = THREE.MathUtils.clamp(
      launch.speedMetresPerSecond /
        SLIME_VISUAL_TUNING.airborneFullStretchSpeedMetresPerSecond,
      0,
      1,
    );
    this.launchSpring = Math.max(
      this.launchSpring,
      Math.max(speedStrength * 0.7, launch.chargeFraction),
    );
    this.launchSpringVelocity = Math.max(
      this.launchSpringVelocity,
      this.launchSpring * 1.2,
    );
  }

  onLanding(normalWorld: Vector3State, impactSpeedMetresPerSecond: number): void {
    this.onImpact({
      normalWorld,
      strength: this.normalizeImpactStrength(
        impactSpeedMetresPerSecond,
        SLIME_VISUAL_TUNING.landingVisibleSpeedMetresPerSecond,
        SLIME_VISUAL_TUNING.landingFullStrengthSpeedMetresPerSecond,
      ),
      kind: 'landing',
    });
  }

  reset(): void {
    this.material.setOpacity(1);
    this.worldVelocity.set(0, 0, 0);
    this.previousWorldVelocity.set(0, 0, 0);
    this.tangentialVelocity.set(0, 0, 0);
    this.moveDirectionWorld.set(0, 0, -1);
    this.surfaceNormalWorld.set(0, 1, 0);
    this.surfaceTangentWorld.set(0, 0, 1);
    this.stretchDirectionWorld.set(0, 1, 0);
    this.inertiaWorld.set(0, 0, 0);
    this.impactNormalWorld.set(0, 1, 0);
    this.deformationState.speed = 0;
    this.deformationState.locomotionPhase = 0;
    this.deformationState.moveDirectionLocal.set(0, 0, -1);
    this.deformationState.surfaceNormalLocal.set(0, 1, 0);
    this.deformationState.surfaceTangentLocal.set(0, 0, 1);
    this.deformationState.grounded = 1;
    this.deformationState.attached = 0;
    this.deformationState.jumpCharge = 0;
    this.deformationState.squash = 0;
    this.deformationState.stretch = 0;
    this.deformationState.stretchDirectionLocal.set(0, 1, 0);
    this.deformationState.inertiaLocal.set(0, 0, 0);
    this.deformationState.impactNormalLocal.set(0, 1, 0);
    this.deformationState.impactPointLocal.set(0, -this.radiusMetres, 0);
    this.deformationState.impactStrength = 0;
    this.deformationState.impactAge =
      SLIME_VISUAL_TUNING.impactRippleDurationSeconds;
    this.deformationState.impactElasticity =
      SLIME_VISUAL_TUNING.normalImpactElasticity;
    this.impactSpring = 0;
    this.impactSpringVelocity = 0;
    this.launchSpring = 0;
    this.launchSpringVelocity = 0;
    this.contactCooldownSeconds = 0;
    this.previousContactName = 'none';
    this.present();
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private updateWorldBasis(state: SlimeVisualState): void {
    this.worldVelocity.set(
      state.velocityWorld.x,
      state.velocityWorld.y,
      state.velocityWorld.z,
    );

    const sourceNormal = state.grounded || state.attached
      ? state.surfaceNormalWorld
      : state.gameplayUpWorld;
    this.targetSurfaceNormal
      .set(sourceNormal.x, sourceNormal.y, sourceNormal.z)
      .normalize();
  }

  private updateContinuousState(
    deltaSeconds: number,
    state: SlimeVisualState,
  ): void {
    const surfaceBlend = this.exponentialBlend(
      SLIME_VISUAL_TUNING.surfaceNormalResponsePerSecond,
      deltaSeconds,
    );
    this.smoothUnitDirectionTowards(
      this.surfaceNormalWorld,
      this.targetSurfaceNormal,
      surfaceBlend,
      this.surfaceTangentWorld,
    );
    this.surfaceTangentWorld
      .projectOnPlane(this.surfaceNormalWorld)
      .normalize();

    this.tangentialVelocity
      .copy(this.worldVelocity)
      .projectOnPlane(this.surfaceNormalWorld);
    const tangentialSpeed = this.tangentialVelocity.length();
    const targetSpeed = THREE.MathUtils.clamp(
      tangentialSpeed / state.maximumLocomotionSpeedMetresPerSecond,
      0,
      1,
    );
    const speedBlend = this.exponentialBlend(
      SLIME_VISUAL_TUNING.speedResponsePerSecond,
      deltaSeconds,
    );
    this.deformationState.speed = THREE.MathUtils.lerp(
      this.deformationState.speed,
      targetSpeed,
      speedBlend,
    );
    this.deformationState.locomotionPhase = (
      this.deformationState.locomotionPhase +
      deltaSeconds * (
        SLIME_VISUAL_TUNING.slitherBaseAngularSpeedRadiansPerSecond +
        this.deformationState.speed *
          SLIME_VISUAL_TUNING.slitherSpeedGainRadiansPerSecond
      )
    ) % FULL_CYCLE_RADIANS;

    if (this.tangentialVelocity.lengthSq() > VECTOR_EPSILON_SQ) {
      this.targetDirection.copy(this.tangentialVelocity).normalize();
      const directionBlend = this.exponentialBlend(
        SLIME_VISUAL_TUNING.directionResponsePerSecond,
        deltaSeconds,
      );
      this.smoothUnitDirectionTowards(
        this.moveDirectionWorld,
        this.targetDirection,
        directionBlend,
      );
      this.moveDirectionWorld.projectOnPlane(
        this.surfaceNormalWorld,
      );
      if (
        this.moveDirectionWorld.lengthSq() >
        VECTOR_EPSILON_SQ
      ) {
        this.moveDirectionWorld.normalize();
      }
    }

    const groundedBlend = this.exponentialBlend(
      SLIME_VISUAL_TUNING.groundedResponsePerSecond,
      deltaSeconds,
    );
    this.deformationState.grounded = THREE.MathUtils.lerp(
      this.deformationState.grounded,
      state.grounded ? 1 : 0,
      groundedBlend,
    );
    this.deformationState.attached = THREE.MathUtils.lerp(
      this.deformationState.attached,
      state.attached ? 1 : 0,
      groundedBlend,
    );
    this.deformationState.jumpCharge = THREE.MathUtils.lerp(
      this.deformationState.jumpCharge,
      THREE.MathUtils.clamp(state.jumpCharge, 0, 1),
      this.exponentialBlend(
        SLIME_VISUAL_TUNING.chargeResponsePerSecond,
        deltaSeconds,
      ),
    );

    const velocityLength = this.worldVelocity.length();
    if (
      !state.grounded &&
      !state.attached &&
      velocityLength > VECTOR_EPSILON_SQ
    ) {
      this.targetDirection.copy(this.worldVelocity).normalize();
      this.stretchDirectionWorld
        .lerp(this.targetDirection, speedBlend)
        .normalize();
    } else if (this.deformationState.speed > 0.01) {
      this.stretchDirectionWorld
        .lerp(this.moveDirectionWorld, speedBlend)
        .normalize();
    }

    const visualSupport = Math.max(
      this.deformationState.grounded,
      this.deformationState.attached,
    );
    const airborneStretch = (1 - visualSupport) *
      THREE.MathUtils.clamp(
        velocityLength /
          SLIME_VISUAL_TUNING.airborneFullStretchSpeedMetresPerSecond,
        0,
        1,
      ) * SLIME_VISUAL_TUNING.airborneStretchMaximum;
    this.deformationState.stretch = THREE.MathUtils.clamp(
      airborneStretch +
        Math.max(0, this.launchSpring) *
          SLIME_VISUAL_TUNING.launchStretchMaximum,
      0,
      0.24,
    );

    this.inertiaTarget
      .subVectors(this.previousWorldVelocity, this.worldVelocity)
      .multiplyScalar(
        1 /
          (deltaSeconds *
            SLIME_VISUAL_TUNING.maximumVisualAccelerationMetresPerSecondSquared),
      );
    if (this.inertiaTarget.lengthSq() > 1) this.inertiaTarget.normalize();
    this.inertiaWorld.lerp(
      this.inertiaTarget,
      this.exponentialBlend(
        SLIME_VISUAL_TUNING.inertiaResponsePerSecond,
        deltaSeconds,
      ),
    );
  }

  private updateContactImpact(
    deltaSeconds: number,
    state: SlimeVisualState,
  ): void {
    this.contactCooldownSeconds = Math.max(
      0,
      this.contactCooldownSeconds - deltaSeconds,
    );

    if (state.contactCount <= 0) {
      this.previousContactName = 'none';
      return;
    }

    const newContact = state.contactName !== this.previousContactName;
    this.previousContactName = state.contactName;
    if (
      state.landedThisStep ||
      this.contactCooldownSeconds > 0 ||
      (!newContact &&
        state.contactSpeedMetresPerSecond <
          SLIME_VISUAL_TUNING.wallFullStrengthSpeedMetresPerSecond)
    ) {
      return;
    }

    const strength = this.normalizeImpactStrength(
      state.contactSpeedMetresPerSecond,
      SLIME_VISUAL_TUNING.wallVisibleSpeedMetresPerSecond,
      SLIME_VISUAL_TUNING.wallFullStrengthSpeedMetresPerSecond,
    );
    if (strength <= 0) return;

    this.onImpact({
      normalWorld: state.contactNormalWorld,
      strength,
      kind: state.contactSurfaceTag === 'bouncy'
        ? 'bounce'
        : state.attached && state.contactSurfaceTag === 'sticky'
          ? 'sticky'
          : 'wall',
    });
  }

  private updateSprings(deltaSeconds: number): void {
    this.impactSpringVelocity += (
      -SLIME_VISUAL_TUNING.impactSpringStiffness * this.impactSpring -
      SLIME_VISUAL_TUNING.impactSpringDamping * this.impactSpringVelocity
    ) * deltaSeconds;
    this.impactSpring += this.impactSpringVelocity * deltaSeconds;
    this.impactSpring = THREE.MathUtils.clamp(this.impactSpring, -0.3, 1.65);

    this.launchSpringVelocity += (
      -SLIME_VISUAL_TUNING.launchSpringStiffness * this.launchSpring -
      SLIME_VISUAL_TUNING.launchSpringDamping * this.launchSpringVelocity
    ) * deltaSeconds;
    this.launchSpring += this.launchSpringVelocity * deltaSeconds;
    this.launchSpring = THREE.MathUtils.clamp(this.launchSpring, -0.25, 1.2);

    this.deformationState.squash = this.impactSpring;
    this.deformationState.impactAge = Math.min(
      SLIME_VISUAL_TUNING.impactRippleDurationSeconds,
      this.deformationState.impactAge + deltaSeconds,
    );
    if (
      this.deformationState.impactAge >=
      SLIME_VISUAL_TUNING.impactRippleDurationSeconds
    ) {
      this.deformationState.impactStrength = 0;
    }
  }

  private copyWorldDirectionToLocal(
    directionWorld: Vector3State,
    target: THREE.Vector3,
  ): void {
    target
      .set(directionWorld.x, directionWorld.y, directionWorld.z)
      .applyQuaternion(this.inverseWorldQuaternion)
      .normalize();
  }

  private copyDirection(direction: Vector3State, target: THREE.Vector3): void {
    target.set(direction.x, direction.y, direction.z).normalize();
  }

  private normalizeImpactStrength(
    speedMetresPerSecond: number,
    visibleSpeedMetresPerSecond: number,
    fullStrengthSpeedMetresPerSecond: number,
  ): number {
    return THREE.MathUtils.clamp(
      (speedMetresPerSecond - visibleSpeedMetresPerSecond) /
        (fullStrengthSpeedMetresPerSecond - visibleSpeedMetresPerSecond),
      0,
      1,
    );
  }

  private elasticityForImpact(kind: SlimeImpactKind): number {
    if (kind === 'bounce') {
      return SLIME_VISUAL_TUNING.bounceImpactElasticity;
    }
    if (kind === 'sticky') {
      return SLIME_VISUAL_TUNING.stickyImpactElasticity;
    }
    return SLIME_VISUAL_TUNING.normalImpactElasticity;
  }

  private exponentialBlend(
    responsePerSecond: number,
    deltaSeconds: number,
  ): number {
    return 1 - Math.exp(-responsePerSecond * deltaSeconds);
  }

  /**
   * Rotate between unit directions without the antiparallel lock produced by
   * normalized linear interpolation (important when floor up becomes ceiling
   * down). When supplied, the tangent is parallel-transported by the same
   * rotation. The reused axis/quaternion keep this update allocation-free.
   */
  private smoothUnitDirectionTowards(
    current: THREE.Vector3,
    target: THREE.Vector3,
    blend: number,
    transportedDirection?: THREE.Vector3,
  ): void {
    const dot = THREE.MathUtils.clamp(current.dot(target), -1, 1);
    if (dot > 0.99999) {
      current.copy(target);
      return;
    }

    this.directionRotationAxis.crossVectors(current, target);
    if (this.directionRotationAxis.lengthSq() <= VECTOR_EPSILON_SQ) {
      this.directionReferenceAxis.set(
        Math.abs(current.x) < 0.9 ? 1 : 0,
        Math.abs(current.x) < 0.9 ? 0 : 1,
        0,
      );
      this.directionRotationAxis.crossVectors(
        current,
        this.directionReferenceAxis,
      );
    }

    this.directionRotationAxis.normalize();
    this.directionRotation.setFromAxisAngle(
      this.directionRotationAxis,
      Math.acos(dot) * blend,
    );
    current.applyQuaternion(this.directionRotation).normalize();
    transportedDirection?.applyQuaternion(this.directionRotation).normalize();
  }
}
