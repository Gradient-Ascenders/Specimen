import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  moveAngleTowards,
  shortestAngleDelta,
} from '../BlobFacing.ts';
import type {
  SlimeVisualDiagnostics,
  SlimeVisualImpact,
  SlimeVisualLaunch,
  SlimeVisualState,
  Vector3State,
} from '../slime/SlimeVisual.ts';
import {
  SlimeBurstPresentation,
  type SlimeBurstDiagnostics,
} from '../slime/SlimeBurstPresentation.ts';
import {
  disposeBobGateOneAsset,
  type BobGateOneAsset,
} from './BobGateOneAsset.ts';
import {
  BOB_BODY_POSES,
  BOB_EXPRESSIONS,
  validateBobMorphAsset,
  type BobBodyPose,
  type BobExpression,
} from './BobMorphAsset.ts';
import {
  BobGateTwoMaterialSet,
  type BobGateTwoMaterialDiagnostics,
} from './BobGateTwoMaterials.ts';

const BOB_AUTHORED_ASSET_URL = new URL(
  '../../../assets/characters/bob/bob-authored.glb',
  import.meta.url,
).href;
const DEATH_RUPTURE_SECONDS = 0.075;
const DEATH_TIMING_EPSILON_SECONDS = 1e-9;
const LAUNCH_SECONDS = 0.18;
const LANDING_SECONDS = 0.28;
const DAMAGE_SECONDS = 0.22;
const LOCOMOTION_CYCLE_DISTANCE_METRES = 1.2;
const LOCOMOTION_DISTANCE_EPSILON_METRES = 1e-6;
const LOCOMOTION_CRUISE_STRENGTH = 0.6;
const LOCOMOTION_ACCELERATION_STRENGTH = 0.75;
const LOCOMOTION_FULL_ACCELERATION_METRES_PER_SECOND_SQUARED = 32;
const LOCOMOTION_STRENGTH_RELEASE_PER_SECOND = 7;
const LOCOMOTION_REVERSAL_STRENGTH_RELEASE_PER_SECOND = 48;
const LOCOMOTION_START_SPEED_METRES_PER_SECOND = 0.16;
const LOCOMOTION_STOP_SPEED_METRES_PER_SECOND = 0.08;
const LOCOMOTION_HEADING_HYSTERESIS_RADIANS = THREE.MathUtils.degToRad(5);
const LOCOMOTION_REVERSAL_RADIANS = THREE.MathUtils.degToRad(120);
const LOCOMOTION_TURN_SPEED_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(540);
const LOCOMOTION_REVERSAL_NEUTRAL_STRENGTH = 0.025;

export type BobCharacterLoader = () => Promise<THREE.Group>;

export interface BobCharacterPresentationState extends SlimeVisualState {
  /** Authoritative fixed-step position used only to measure travelled distance. */
  readonly positionWorld: Vector3State;
}

export interface BobCharacterPresentationDiagnostics
  extends SlimeVisualDiagnostics {
  readonly visible: boolean;
  readonly deathBurst: SlimeBurstDiagnostics;
  readonly materials: BobGateTwoMaterialDiagnostics | undefined;
  readonly locomotionStrength: number;
  readonly facingYawRadians: number;
  readonly reversing: boolean;
}

async function loadDefaultBobAsset(): Promise<THREE.Group> {
  return (await new GLTFLoader().loadAsync(BOB_AUTHORED_ASSET_URL)).scene;
}

/**
 * Reusable visual-only boundary for Bob.
 *
 * Authored poses consume authoritative snapshots and events. The kinematic
 * body and gameplay timing remain external; shaders add only surface detail.
 */
export class BobCharacterPresentation {
  readonly root = new THREE.Group();
  readonly radiusMetres: number;

  private readonly mesh = new THREE.Group();
  private readonly inverseWorldQuaternion = new THREE.Quaternion();
  private readonly velocityWorld = new THREE.Vector3();
  private readonly tangentialVelocityWorld = new THREE.Vector3();
  private readonly surfaceNormalWorld = new THREE.Vector3(0, 1, 0);
  private readonly moveDirectionWorld = new THREE.Vector3(0, 0, -1);
  private readonly impactNormalWorld = new THREE.Vector3(0, 1, 0);
  private readonly impactPointLocal = new THREE.Vector3(0, -0.45, 0);
  private readonly previousPositionWorld = new THREE.Vector3();
  private readonly travelledWorld = new THREE.Vector3();
  private readonly diagnosticsState = {
    speed: 0,
    locomotionPhase: 0,
    grounded: 1,
    jumpCharge: 0,
    squash: 0,
    stretch: 0,
    impactStrength: 0,
    impactAge: 1.2,
    impactNormalLocal: new THREE.Vector3(0, 1, 0),
    surfaceNormalLocal: new THREE.Vector3(0, 1, 0),
    surfaceTangentLocal: new THREE.Vector3(0, 0, 1),
    moveDirectionLocal: new THREE.Vector3(0, 0, -1),
  } satisfies SlimeVisualDiagnostics;

  private asset: BobGateOneAsset | undefined;
  private materialSet: BobGateTwoMaterialSet | undefined;
  private readonly deathBurst = new SlimeBurstPresentation();
  private readonly materials = new Set<THREE.Material>();
  private preparation: Promise<void> | undefined;
  private opacity = 1;
  private deathElapsedSeconds = 0;
  private deathActive = false;
  private impactPending = false;
  private disposed = false;
  private launchRemaining = 0;
  private launchStrength = 0;
  private landingRemaining = 0;
  private landingCompression = 0;
  private damageRemaining = 0;
  private damageStrength = 0;
  private hasPreviousPosition = false;
  private locomotionStrength = 0;
  private previousTangentialSpeed = 0;
  private locomotionMoving = false;
  private currentFacingYawRadians = 0;
  private previousFacingYawRadians = 0;
  private targetFacingYawRadians = 0;
  private hasTravelHeading = false;
  private reversing = false;
  private readonly poseWeights: Record<BobBodyPose, number> = {
    'move-reach': 0, 'move-gather': 0, squash: 0, flatten: 0,
    launch: 0, airborne: 0, stress: 0,
  };
  private readonly expressionWeights: Record<BobExpression, number> = {
    blink: 0, effort: 0, surprise: 0, 'stress-expression': 0,
  };
  private readonly requestedExpressions: Record<BobExpression, number> = {
    blink: 0, effort: 0, surprise: 0, 'stress-expression': 0,
  };

  constructor(radiusMetres: number) {
    if (Math.abs(radiusMetres - 0.45) > 1e-6) {
      throw new Error(
        `Bob Gate 1 presentation requires the 0.45 m gameplay radius; received ${radiusMetres}.`,
      );
    }
    this.radiusMetres = radiusMetres;
    this.root.name = 'player-slime-bob-presentation';
    this.mesh.name = 'player-slime-bob-character';
    this.root.add(this.mesh, this.deathBurst.root);
  }

  get ready(): boolean {
    return this.asset !== undefined && !this.disposed;
  }

  get diagnostics(): BobCharacterPresentationDiagnostics {
    return {
      ...this.diagnosticsState,
      visible: this.mesh.visible,
      deathBurst: this.deathBurst.diagnostics,
      materials: this.materialSet?.diagnostics,
      locomotionStrength: this.locomotionStrength,
      facingYawRadians: this.currentFacingYawRadians,
      reversing: this.reversing,
    };
  }

  async prepare(
    loader: BobCharacterLoader = loadDefaultBobAsset,
  ): Promise<void> {
    if (this.ready) return;
    if (this.disposed) {
      throw new Error('Cannot prepare a disposed Bob presentation.');
    }
    if (this.preparation) return this.preparation;

    const preparation = loader().then((root) => {
      let asset: BobGateOneAsset;
      try {
        asset = validateBobMorphAsset(root);
      } catch (error) {
        disposeBobGateOneAsset(root);
        throw error;
      }

      if (this.disposed) {
        disposeBobGateOneAsset(root);
        return;
      }
      const importedMaterials = new Set<THREE.Material>();
      for (const mesh of [asset.body, ...asset.eyes]) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) importedMaterials.add(material);
      }
      const materialSet = new BobGateTwoMaterialSet();
      asset.body.material = materialSet.body;
      for (const eye of asset.eyes) eye.material = materialSet.eyes;
      for (const material of importedMaterials) material.dispose();

      this.asset = asset;
      this.materialSet = materialSet;
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) this.materials.add(material);
      });
      this.mesh.add(root);
      this.applyMorphs();
      this.applyOpacity();
    });
    this.preparation = preparation;
    try {
      await preparation;
    } finally {
      if (!this.ready) this.preparation = undefined;
    }
  }

  setPosition(position: Vector3State): void {
    this.mesh.position.set(position.x, position.y, position.z);
  }

  setYaw(yawRadians: number): void {
    this.currentFacingYawRadians = yawRadians;
    this.previousFacingYawRadians = yawRadians;
    this.targetFacingYawRadians = yawRadians;
    this.hasTravelHeading = true;
    this.applyFacingDirection();
    this.mesh.rotation.set(0, yawRadians, 0);
  }

  setOpacity(opacity: number): void {
    this.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    this.applyOpacity();
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  setExpression(expression: BobExpression, weight: number): void {
    if (this.disposed || this.deathActive) return;
    this.requestedExpressions[expression] = Number.isFinite(weight)
      ? THREE.MathUtils.clamp(weight, 0, 1)
      : 0;
    this.applyMorphs();
  }

  update(deltaSeconds: number, state: BobCharacterPresentationState): void {
    if (this.disposed || this.deathActive) return;
    this.previousFacingYawRadians = this.currentFacingYawRadians;
    this.velocityWorld.set(
      state.velocityWorld.x,
      state.velocityWorld.y,
      state.velocityWorld.z,
    );
    const sourceNormal = state.grounded || state.attached
      ? state.surfaceNormalWorld
      : state.gameplayUpWorld;
    this.surfaceNormalWorld
      .set(sourceNormal.x, sourceNormal.y, sourceNormal.z)
      .normalize();
    this.tangentialVelocityWorld
      .copy(this.velocityWorld)
      .projectOnPlane(this.surfaceNormalWorld);
    const tangentialSpeed = this.tangentialVelocityWorld.length();
    const groundLocomotion = state.grounded && !state.attached;
    if (!groundLocomotion) {
      this.locomotionMoving = false;
    } else if (this.locomotionMoving) {
      if (tangentialSpeed <= LOCOMOTION_STOP_SPEED_METRES_PER_SECOND) {
        this.locomotionMoving = false;
      }
    } else if (tangentialSpeed >= LOCOMOTION_START_SPEED_METRES_PER_SECOND) {
      this.locomotionMoving = true;
    }
    if (this.locomotionMoving) {
      const hadTravelHeading = this.hasTravelHeading;
      const desiredYawRadians = Math.atan2(
        -this.tangentialVelocityWorld.x,
        -this.tangentialVelocityWorld.z,
      );
      if (!this.hasTravelHeading) {
        this.targetFacingYawRadians = desiredYawRadians;
        this.hasTravelHeading = true;
      } else if (
        Math.abs(shortestAngleDelta(
          this.targetFacingYawRadians,
          desiredYawRadians,
        )) >= LOCOMOTION_HEADING_HYSTERESIS_RADIANS
      ) {
        this.targetFacingYawRadians = desiredYawRadians;
      }
      if (
        hadTravelHeading &&
        !this.reversing &&
        Math.abs(shortestAngleDelta(
          this.currentFacingYawRadians,
          this.targetFacingYawRadians,
        )) >= LOCOMOTION_REVERSAL_RADIANS
      ) {
        this.reversing = true;
      }
    }
    this.diagnosticsState.speed = THREE.MathUtils.clamp(
      (this.locomotionMoving ? tangentialSpeed : 0) /
        Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6),
      0,
      1,
    );
    this.diagnosticsState.grounded = state.grounded ? 1 : 0;
    this.diagnosticsState.jumpCharge = THREE.MathUtils.clamp(
      state.jumpCharge,
      0,
      1,
    );
    this.diagnosticsState.impactAge += deltaSeconds;
    this.materialSet?.update(deltaSeconds);
    this.clearMorphWeights();
    const elapsed = Math.max(0, deltaSeconds);
    const supported = state.grounded || state.attached;
    this.updateLocomotion(
      state,
      tangentialSpeed,
      groundLocomotion && this.locomotionMoving && !this.reversing,
      elapsed,
    );
    this.updateFacing(elapsed);
    this.launchRemaining = Math.max(0, this.launchRemaining - elapsed);
    this.landingRemaining = Math.max(0, this.landingRemaining - elapsed);
    this.damageRemaining = Math.max(0, this.damageRemaining - elapsed);
    if (supported) {
      this.launchRemaining = 0;
      const compression = Math.max(
        this.diagnosticsState.jumpCharge,
        this.landingCompression * this.landingRemaining / LANDING_SECONDS,
      );
      this.poseWeights.squash = Math.min(compression, 2 - compression);
      this.poseWeights.flatten = Math.max(0, compression - 1);
      this.expressionWeights.effort = Math.min(0.5, compression * 0.5);
      if (compression <= 0) this.applyLocomotionWeights();
    } else {
      this.landingRemaining = 0;
      this.poseWeights.launch =
        this.launchStrength * this.launchRemaining / LAUNCH_SECONDS;
      this.poseWeights.airborne = 1 - this.poseWeights.launch;
      this.expressionWeights.surprise = this.poseWeights.launch * 0.4;
    }
    if (this.damageRemaining > 0) {
      this.clearMorphWeights();
      this.poseWeights.stress =
        this.damageStrength * this.damageRemaining / DAMAGE_SECONDS;
      this.expressionWeights['stress-expression'] = this.poseWeights.stress * 0.6;
    }
    this.applyMorphs();
  }

  present(interpolationAlpha = 1): void {
    const alpha = THREE.MathUtils.clamp(interpolationAlpha, 0, 1);
    this.mesh.rotation.set(
      0,
      this.previousFacingYawRadians +
        shortestAngleDelta(
          this.previousFacingYawRadians,
          this.currentFacingYawRadians,
        ) * alpha,
      0,
    );
    this.mesh.getWorldQuaternion(this.inverseWorldQuaternion).invert();
    this.diagnosticsState.surfaceNormalLocal
      .copy(this.surfaceNormalWorld)
      .applyQuaternion(this.inverseWorldQuaternion);
    this.diagnosticsState.moveDirectionLocal
      .copy(this.moveDirectionWorld)
      .applyQuaternion(this.inverseWorldQuaternion);
    this.diagnosticsState.surfaceTangentLocal
      .crossVectors(
        this.diagnosticsState.moveDirectionLocal,
        this.diagnosticsState.surfaceNormalLocal,
      );
    if (this.diagnosticsState.surfaceTangentLocal.lengthSq() > 1e-8) {
      this.diagnosticsState.surfaceTangentLocal.normalize();
    }
    this.diagnosticsState.impactNormalLocal
      .copy(this.impactNormalWorld)
      .applyQuaternion(this.inverseWorldQuaternion)
      .normalize();
    this.impactPointLocal
      .copy(this.diagnosticsState.impactNormalLocal)
      .multiplyScalar(-this.radiusMetres);
    if (this.impactPending && this.materialSet) {
      this.materialSet.setImpact(
        this.impactPointLocal,
        this.diagnosticsState.impactStrength,
      );
      this.impactPending = false;
    }
  }

  onImpact(impact: SlimeVisualImpact): void {
    if (this.deathActive || this.disposed) return;
    this.diagnosticsState.impactStrength = THREE.MathUtils.clamp(
      impact.strength,
      0,
      1,
    );
    this.diagnosticsState.impactAge = 0;
    this.impactPending = true;
    if (impact.kind === 'landing') {
      this.launchRemaining = 0;
      this.landingRemaining = LANDING_SECONDS;
      this.landingCompression = this.diagnosticsState.impactStrength * 2;
    }
    this.impactNormalWorld.set(
      impact.normalWorld.x,
      impact.normalWorld.y,
      impact.normalWorld.z,
    ).normalize();
  }

  onLanding(
    normalWorld: Vector3State,
    impactSpeedMetresPerSecond: number,
  ): void {
    this.onImpact({
      normalWorld,
      strength: THREE.MathUtils.clamp(
        (impactSpeedMetresPerSecond - 1.5) / (8.5 - 1.5),
        0,
        1,
      ),
      kind: 'landing',
    });
  }

  onLaunch(launch: SlimeVisualLaunch): void {
    if (this.deathActive || this.disposed) return;
    this.launchRemaining = LAUNCH_SECONDS;
    this.launchStrength =
      0.65 + THREE.MathUtils.clamp(launch.chargeFraction, 0, 1) * 0.35;
    this.landingRemaining = 0;
  }

  /** Visual reaction only; callers own damage eligibility and consequences. */
  onDamage(strength: number): void {
    if (this.deathActive || this.disposed) return;
    this.damageRemaining = DAMAGE_SECONDS;
    this.damageStrength = THREE.MathUtils.clamp(strength, 0, 1);
  }

  primeDeathResources(
    position: Vector3State,
    render: (root: THREE.Object3D) => void,
  ): boolean {
    return this.deathBurst.primeResources(position, render);
  }

  /** Begin the visual rupture at the authoritative death position. */
  startDeath(position: Vector3State): boolean {
    if (this.deathActive || this.disposed) return false;
    if (!this.deathBurst.start(position)) return false;

    this.deathActive = true;
    this.deathElapsedSeconds = 0;
    this.clearMorphWeights();
    this.poseWeights.stress = 0.35;
    this.expressionWeights['stress-expression'] = 0.4;
    this.applyMorphs();
    this.deathBurst.root.visible = false;
    this.setPosition(position);
    this.setOpacity(1);
    this.mesh.scale.setScalar(1);
    this.setVisible(true);
    return true;
  }

  /** Continue visual-only death work while gameplay simulation is suspended. */
  updateDeath(deltaSeconds: number): void {
    if (!this.deathActive) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Bob death deltaSeconds must be positive and finite.');
    }

    const previousElapsedSeconds = this.deathElapsedSeconds;
    this.deathElapsedSeconds += deltaSeconds;

    if (this.deathElapsedSeconds < DEATH_RUPTURE_SECONDS) {
      const anticipation = THREE.MathUtils.smoothstep(
        this.deathElapsedSeconds,
        0,
        DEATH_RUPTURE_SECONDS,
      );
      this.clearMorphWeights();
      this.poseWeights.stress = 0.35 + anticipation * 0.65;
      this.expressionWeights['stress-expression'] = 0.6;
      this.applyMorphs();
      this.deathBurst.root.visible = false;
      return;
    }

    const burstDeltaSeconds =
      this.deathElapsedSeconds -
      Math.max(previousElapsedSeconds, DEATH_RUPTURE_SECONDS);
    if (burstDeltaSeconds > DEATH_TIMING_EPSILON_SECONDS) {
      this.deathBurst.update(burstDeltaSeconds);
    }
    this.setVisible(false);
    this.deathBurst.root.visible = this.deathBurst.diagnostics.active;
    this.clearMorphWeights();
    this.applyMorphs();
  }

  /** Restore the live character after authoritative recovery succeeds. */
  finishDeath(position: Vector3State): void {
    this.deathActive = false;
    this.setPosition(position);
    this.reset();
  }

  reset(): void {
    this.deathActive = false;
    this.deathElapsedSeconds = 0;
    this.deathBurst.reset();
    this.setVisible(true);
    this.mesh.scale.setScalar(1);
    this.setOpacity(1);
    this.velocityWorld.set(0, 0, 0);
    this.surfaceNormalWorld.set(0, 1, 0);
    this.moveDirectionWorld.set(0, 0, -1);
    this.impactNormalWorld.set(0, 1, 0);
    this.diagnosticsState.speed = 0;
    this.diagnosticsState.locomotionPhase = 0;
    this.diagnosticsState.grounded = 1;
    this.diagnosticsState.jumpCharge = 0;
    this.diagnosticsState.squash = 0;
    this.diagnosticsState.stretch = 0;
    this.diagnosticsState.impactStrength = 0;
    this.diagnosticsState.impactAge = 1.2;
    this.impactPending = false;
    this.launchRemaining = 0;
    this.launchStrength = 0;
    this.landingRemaining = 0;
    this.landingCompression = 0;
    this.damageRemaining = 0;
    this.damageStrength = 0;
    this.hasPreviousPosition = false;
    this.previousPositionWorld.set(0, 0, 0);
    this.travelledWorld.set(0, 0, 0);
    this.locomotionStrength = 0;
    this.previousTangentialSpeed = 0;
    this.locomotionMoving = false;
    this.currentFacingYawRadians = 0;
    this.previousFacingYawRadians = 0;
    this.targetFacingYawRadians = 0;
    this.hasTravelHeading = false;
    this.reversing = false;
    this.diagnosticsState.impactNormalLocal.set(0, 1, 0);
    this.diagnosticsState.surfaceNormalLocal.set(0, 1, 0);
    this.diagnosticsState.surfaceTangentLocal.set(0, 0, 1);
    this.diagnosticsState.moveDirectionLocal.set(0, 0, -1);
    this.materialSet?.reset();
    for (const name of BOB_EXPRESSIONS) this.requestedExpressions[name] = 0;
    this.clearMorphWeights();
    this.applyMorphs();
    this.present();
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.deathBurst.dispose();
    if (this.asset) disposeBobGateOneAsset(this.asset.root);
    this.asset = undefined;
    this.materialSet = undefined;
    this.materials.clear();
    this.mesh.removeFromParent();
    this.mesh.clear();
    this.root.removeFromParent();
    this.root.clear();
  }

  private applyOpacity(): void {
    this.materialSet?.setOpacity(this.opacity);
    for (const material of this.materials) {
      if (
        material === this.materialSet?.body ||
        material === this.materialSet?.eyes
      ) {
        continue;
      }
      material.transparent = this.opacity < 1;
      material.opacity = this.opacity;
      material.depthWrite = this.opacity >= 1;
    }
  }

  private clearMorphWeights(): void {
    for (const name of BOB_BODY_POSES) this.poseWeights[name] = 0;
    for (const name of BOB_EXPRESSIONS) this.expressionWeights[name] = 0;
  }

  private updateLocomotion(
    state: BobCharacterPresentationState,
    tangentialSpeed: number,
    locomotionActive: boolean,
    deltaSeconds: number,
  ): void {
    if (!this.hasPreviousPosition) {
      this.previousPositionWorld.set(
        state.positionWorld.x,
        state.positionWorld.y,
        state.positionWorld.z,
      );
      this.hasPreviousPosition = true;
      this.previousTangentialSpeed = tangentialSpeed;
      return;
    }

    this.travelledWorld.set(
      state.positionWorld.x - this.previousPositionWorld.x,
      state.positionWorld.y - this.previousPositionWorld.y,
      state.positionWorld.z - this.previousPositionWorld.z,
    );
    this.previousPositionWorld.set(
      state.positionWorld.x,
      state.positionWorld.y,
      state.positionWorld.z,
    );
    this.travelledWorld.projectOnPlane(this.surfaceNormalWorld);
    const travelledMetres = this.travelledWorld.length();
    const speedStrength = THREE.MathUtils.clamp(
      tangentialSpeed /
        Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6),
      0,
      1,
    );
    const accelerationStrength = deltaSeconds > 0
      ? THREE.MathUtils.clamp(
          (tangentialSpeed - this.previousTangentialSpeed) /
            deltaSeconds /
            LOCOMOTION_FULL_ACCELERATION_METRES_PER_SECOND_SQUARED,
          0,
          1,
        )
      : 0;
    this.previousTangentialSpeed = tangentialSpeed;
    const targetStrength = locomotionActive
      ? speedStrength * LOCOMOTION_CRUISE_STRENGTH +
        accelerationStrength * LOCOMOTION_ACCELERATION_STRENGTH
      : 0;
    if (targetStrength >= this.locomotionStrength) {
      this.locomotionStrength = targetStrength;
    } else {
      const releasePerSecond = this.reversing
        ? LOCOMOTION_REVERSAL_STRENGTH_RELEASE_PER_SECOND
        : LOCOMOTION_STRENGTH_RELEASE_PER_SECOND;
      const releaseBlend = 1 - Math.exp(-releasePerSecond * deltaSeconds);
      this.locomotionStrength = THREE.MathUtils.lerp(
        this.locomotionStrength,
        targetStrength,
        releaseBlend,
      );
    }
    if (
      !locomotionActive ||
      travelledMetres <= LOCOMOTION_DISTANCE_EPSILON_METRES
    ) {
      return;
    }
    const nextPhase = (
      this.diagnosticsState.locomotionPhase +
      travelledMetres / LOCOMOTION_CYCLE_DISTANCE_METRES
    ) % 1;
    this.diagnosticsState.locomotionPhase =
      nextPhase < LOCOMOTION_DISTANCE_EPSILON_METRES ||
      1 - nextPhase < LOCOMOTION_DISTANCE_EPSILON_METRES
        ? 0
        : nextPhase;
  }

  private applyLocomotionWeights(): void {
    const phase = this.diagnosticsState.locomotionPhase;
    const segment = Math.min(3, Math.floor(phase * 4));
    const progress = THREE.MathUtils.smoothstep(phase * 4 - segment, 0, 1);
    let reach = 0;
    let gather = 0;
    if (segment === 0) {
      reach = progress;
    } else if (segment === 1) {
      reach = THREE.MathUtils.lerp(1, 0.5, progress);
      gather = progress * 0.5;
    } else if (segment === 2) {
      reach = (1 - progress) * 0.5;
      gather = THREE.MathUtils.lerp(0.5, 1, progress);
    } else {
      gather = 1 - progress;
    }
    this.poseWeights['move-reach'] = reach * this.locomotionStrength;
    this.poseWeights['move-gather'] = gather * this.locomotionStrength;
  }

  private updateFacing(deltaSeconds: number): void {
    if (!this.locomotionMoving && !this.reversing) return;
    if (
      this.reversing &&
      this.locomotionStrength > LOCOMOTION_REVERSAL_NEUTRAL_STRENGTH
    ) {
      return;
    }

    this.currentFacingYawRadians = moveAngleTowards(
      this.currentFacingYawRadians,
      this.targetFacingYawRadians,
      LOCOMOTION_TURN_SPEED_RADIANS_PER_SECOND * deltaSeconds,
    );
    const remainingAngle = Math.abs(shortestAngleDelta(
      this.currentFacingYawRadians,
      this.targetFacingYawRadians,
    ));
    if (
      this.reversing &&
      remainingAngle <= LOCOMOTION_HEADING_HYSTERESIS_RADIANS
    ) {
      this.currentFacingYawRadians = this.targetFacingYawRadians;
      this.reversing = false;
      this.locomotionStrength = 0;
      this.diagnosticsState.locomotionPhase = 0;
    }
    this.applyFacingDirection();
  }

  private applyFacingDirection(): void {
    this.moveDirectionWorld.set(
      -Math.sin(this.currentFacingYawRadians),
      0,
      -Math.cos(this.currentFacingYawRadians),
    );
  }

  private applyMorphs(): void {
    this.diagnosticsState.squash =
      this.poseWeights.squash + this.poseWeights.flatten;
    this.diagnosticsState.stretch =
      this.poseWeights.launch + this.poseWeights.airborne * 0.3;
    if (!this.asset) return;
    for (const name of BOB_BODY_POSES) {
      const weight = this.poseWeights[name];
      const bodyIndex = this.asset.body.morphTargetDictionary![name]!;
      this.asset.body.morphTargetInfluences![bodyIndex] = weight;
      for (const eye of this.asset.eyes) {
        eye.morphTargetInfluences![eye.morphTargetDictionary![name]!] = weight;
      }
    }
    // Additive expression deltas were authored on Neutral. Limit their shared
    // budget as the skin compresses, so the lenses remain seated throughout
    // intermediate blends, not just at the individual target endpoints.
    const expressionBudget = 0.95 / (
      1 + this.poseWeights.squash * 8 + this.poseWeights.flatten * 24 +
      this.poseWeights.stress * 4 + this.poseWeights.airborne * 2 +
      this.poseWeights['move-reach'] * 6
    );
    let expressionTotal = 0;
    for (const name of BOB_EXPRESSIONS) {
      expressionTotal += Math.max(
        this.expressionWeights[name],
        this.deathActive ? 0 : this.requestedExpressions[name],
      );
    }
    const expressionScale = expressionTotal > expressionBudget
      ? expressionBudget / expressionTotal
      : 1;
    for (const eye of this.asset.eyes) {
      for (const name of BOB_EXPRESSIONS) {
        eye.morphTargetInfluences![eye.morphTargetDictionary![name]!] =
          Math.max(
            this.expressionWeights[name],
            this.deathActive ? 0 : this.requestedExpressions[name],
          ) * expressionScale;
      }
    }
  }
}
