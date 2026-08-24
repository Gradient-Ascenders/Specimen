import * as THREE from 'three';

import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { ElevatorSequence } from '../puzzle/ElevatorSequence.ts';
import { MovingPlatform } from '../puzzle/MovingPlatform.ts';
import { ElevatorPresentation } from '../render/elevator/ElevatorPresentation.ts';
import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { RoomFourArt } from '../render/environment/containment/RoomFourArt.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import type {
  ContextualCameraContext,
  ContextualCameraProfile,
} from '../render/CameraProfile.ts';
import { CameraProfileZone } from './CameraProfileZone.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import {
  LevelTriggerVolume,
  type TriggerContactTarget,
} from './LevelTriggerVolume.ts';

export const ROOM_4_CHECKPOINT_POSITION = new THREE.Vector3(9, 30.21, 85.5);
export const ROOM_4_CHECKPOINT_ID = 'containment-room-4-elevator-roof';
export const ROOM_4_PUZZLE_GROUP_ID = 'containment-room-4';
export const ROOM_4_LIFT_ARRIVAL_BLEND_START_PROGRESS = 0.78;
export const ROOM_4_LIFT_CAMERA_EXIT_RELEASE_Z = 86.5;
export const ROOM_4_LIFT_CAMERA_PROFILE: Readonly<ContextualCameraProfile> = {
  id: 'containment-room-4-lift-high-angle',
  distanceMetres: 10.5,
  targetHeightMetres: 1.1,
  pitchRadians: THREE.MathUtils.degToRad(65),
  transitionDurationSeconds: 0.65,
  framingDeadZoneHalfWidthMetres: 1.5,
  framingDeadZoneHalfHeightMetres: 1.25,
  framingDampingPerSecond: 7,
};
export const ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE: Readonly<ContextualCameraProfile> = {
  id: 'containment-room-4-lift-arrival',
  distanceMetres: 5,
  targetHeightMetres: 0.55,
  pitchRadians: THREE.MathUtils.degToRad(15),
  transitionDurationSeconds: 0.65,
  framingDeadZoneHalfWidthMetres: 0.75,
  framingDeadZoneHalfHeightMetres: 0.6,
  framingDampingPerSecond: 8,
};

const ACTIVE_LIFT_CAMERA_PROFILE_ID =
  'containment-room-4-lift-progressive';

export interface RoomFourHazardFailure {
  readonly roomId: 'room-4';
  readonly hazardId: string;
}

/** Room 4's carrier-backed elevator, authored shaft and laser ascent. */
export class RoomFourGreybox {
  readonly builder = new GreyboxRoomBuilder('containment-room-4-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly elevatorPlatform = new MovingPlatform({
    id: 'room-4-cargo-elevator',
    start: new THREE.Vector3(9, 29.5, 85.5),
    end: new THREE.Vector3(9, 74.5, 85.5),
    size: new THREE.Vector3(8, 0.5, 8),
    travelDurationSeconds: 45,
  });
  readonly elevator = new ElevatorSequence({
    id: 'room-4-cargo-elevator',
    platform: this.elevatorPlatform,
    checkpointGroupId: ROOM_4_PUZZLE_GROUP_ID,
    startDelaySeconds: 3,
    arrivalDelaySeconds: 2,
  });
  private readonly activeLiftCameraProfile = {
    ...ROOM_4_LIFT_CAMERA_PROFILE,
    id: ACTIVE_LIFT_CAMERA_PROFILE_ID,
  };
  readonly liftCameraZone = new CameraProfileZone({
    id: 'room-4-lift-camera-zone',
    centre: new THREE.Vector3(9, 51, 85.5),
    size: new THREE.Vector3(12.4, 52, 11.4),
    profile: this.activeLiftCameraProfile,
    anchor: this.elevatorPlatform,
  });
  readonly checkpointTrigger = new LevelTriggerVolume({
    id: 'room-4-roof-checkpoint-trigger',
    centre: new THREE.Vector3(9, 30.3, 85.5),
    size: new THREE.Vector3(7, 2.2, 7),
  });
  readonly exitTrigger = new LevelTriggerVolume({
    id: 'room-4-exit-trigger',
    centre: new THREE.Vector3(9, 76, 91.8),
    size: new THREE.Vector3(3.2, 3, 2.4),
  });
  readonly failureVolume = new LevelTriggerVolume({
    id: 'room-4-fall-failure',
    centre: new THREE.Vector3(9, 22, 85.5),
    size: new THREE.Vector3(15, 11, 15),
  });
  readonly lasers: LaserHazardSystem;
  readonly art: RoomFourArt;

  private readonly laserPresentation: LaserHazardPresentation;
  private readonly elevatorPresentation: ElevatorPresentation;
  private readonly exitLock: THREE.Mesh;
  private liftCameraArrivalBlendValue = 0;
  private liftCameraExitReleased = false;

  constructor(
    requestFailure: (failure: RoomFourHazardFailure) => void,
    artResources: ContainmentArtResources,
  ) {
    this.buildShell();
    this.exitLock = this.buildExit();
    this.hideGameplayColliders();

    this.root.add(this.elevator.root);
    this.collisionMeshes.push(this.elevatorPlatform.collisionMesh);

    const hazards = this.createHazards();
    this.lasers = new LaserHazardSystem({
      id: 'room-4-lasers',
      hazards,
      requestRecovery: (hazard) =>
        requestFailure({ roomId: 'room-4', hazardId: hazard.id }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards, {
      showEndEmitters: false,
    });
    this.elevatorPresentation = new ElevatorPresentation(this.elevator);
    this.art = new RoomFourArt(artResources, hazards);
    this.root.add(
      this.lasers.root,
      this.laserPresentation.root,
      this.elevatorPresentation.root,
      this.art.root,
    );
    this.syncPresentation();
  }

  updateEntryTrigger(body: KinematicBody): void {
    this.checkpointTrigger.update(body);
  }

  updateFailureTrigger(body: KinematicBody): void {
    this.failureVolume.update(body);
  }

  get liftCameraArrivalBlend(): number {
    return this.liftCameraArrivalBlendValue;
  }

  get cameraObstructionMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.builder.cameraObstructionMeshes,
      ...this.elevatorPresentation.cameraObstructionMeshes,
    ];
  }

  /**
   * Progressively compact the authored view near the upper stop. The stable
   * zone context lets CameraRig retain its generic profile lifecycle while the
   * level owns the elevator-specific progression signal.
   */
  resolveLiftCamera(
    target: TriggerContactTarget,
  ): ContextualCameraContext | undefined {
    const context = this.liftCameraZone.resolve(target);
    if (
      !this.liftCameraExitReleased &&
      this.elevator.exitReady &&
      target.position.z >= ROOM_4_LIFT_CAMERA_EXIT_RELEASE_Z
    ) {
      this.liftCameraExitReleased = true;
    }

    if (this.liftCameraExitReleased || !context) return undefined;

    this.syncLiftCameraProfile();
    return context;
  }

  updateActive(
    deltaSeconds: number,
    body: KinematicBody,
    persistentBodies: readonly KinematicBody[],
  ): void {
    this.exitTrigger.update(body);

    this.elevator.update(deltaSeconds, persistentBodies);
    this.syncLiftCameraProfile();
    if (this.elevator.state === 'ascending') {
      this.lasers.update(deltaSeconds, body);
    }
    this.syncPresentation();
  }

  reset(): void {
    this.elevator.reset();
    this.lasers.reset();
    this.checkpointTrigger.reset();
    this.exitTrigger.reset();
    this.failureVolume.reset();
    this.liftCameraZone.reset();
    this.liftCameraExitReleased = false;
    this.setLiftCameraArrivalBlend(0);
    this.syncPresentation();
  }

  dispose(): void {
    this.checkpointTrigger.dispose();
    this.exitTrigger.dispose();
    this.failureVolume.dispose();
    this.art.dispose();
    this.liftCameraZone.dispose();
    this.laserPresentation.dispose();
    this.elevatorPresentation.dispose();
    this.lasers.dispose();
    this.elevatorPlatform.dispose();
    this.builder.dispose();
  }

  private buildShell(): void {
    const { floor, wall, duct } = this.builder.materials;

    this.builder.addCollider({ name: 'room-4-shaft-floor', size: [13, 0.4, 13], position: [9, 25.8, 85.5], material: floor });
    // The upper shell meets Room 5's 78.75 m doorway clearance. Without this
    // cap the high-angle boom has no authored geometry to keep it in-world.
    this.builder.addCollider({ name: 'room-4-shaft-west-wall', size: [0.4, 53.25, 12], position: [2.5, 52.125, 85.5], material: wall });
    this.builder.addCollider({ name: 'room-4-shaft-east-wall', size: [0.4, 53.25, 12], position: [15.5, 52.125, 85.5], material: wall });
    this.builder.addCollider({ name: 'room-4-shaft-ceiling', size: [13, 0.4, 12], position: [9, 78.95, 85.5], material: wall });
    // The visible ceiling remains the honest gameplay collider. This wider
    // invisible cap only prevents a diagonal camera boom escaping around its
    // short authored footprint; movement queries never register this volume.
    this.builder.addCameraObstruction({
      name: 'room-4-upper-camera-cap',
      size: [21, 0.4, 20],
      position: [9, 78.95, 85.5],
    });

    // South wall leaves a low opening for the Room 3 duct drop.
    this.builder.addCollider({ name: 'room-4-south-wall-west', size: [5.2, 53.25, 0.4], position: [5.1, 52.125, 79.5], material: wall });
    this.builder.addCollider({ name: 'room-4-south-wall-east', size: [5.2, 53.25, 0.4], position: [12.9, 52.125, 79.5], material: wall });
    this.builder.addCollider({ name: 'room-4-south-wall-above-entry', size: [2.6, 45.75, 0.4], position: [9, 55.875, 79.5], material: wall });
    this.builder.addCollider({ name: 'room-4-south-wall-below-entry', size: [2.6, 3, 0.4], position: [9, 27.5, 79.5], material: wall });

    // North wall leaves only the top Room 5 doorway open.
    this.builder.addCollider({ name: 'room-4-north-wall-west', size: [5.2, 53.25, 0.4], position: [5.1, 52.125, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-4-north-wall-east', size: [5.2, 53.25, 0.4], position: [12.9, 52.125, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-4-north-wall-below-exit', size: [2.6, 47, 0.4], position: [9, 49, 91.5], material: wall });

    this.builder.addCollider({ name: 'room-4-entry-duct-floor', size: [2.4, 0.25, 1.2], position: [9, 31.05, 80.1], material: duct });
    this.builder.addCollider({ name: 'room-4-exit-platform', size: [4.5, 0.5, 3], position: [9, 74.5, 90.2], material: floor });

  }

  private hideGameplayColliders(): void {
    for (const [role, material] of Object.entries(this.builder.materials)) {
      material.name = `containment-room-4-${role}-collision-only`;
      material.visible = false;
    }
    this.elevatorPlatform.collisionMesh.material.name =
      'containment-room-4-elevator-roof-collision-only';
    this.elevatorPlatform.collisionMesh.material.visible = false;
  }

  private buildExit(): THREE.Mesh {
    return this.builder.addCollider({
      name: 'room-4-exit-lock',
      size: [2.6, 3.6, 0.35],
      position: [9, 76.3, 91.3],
      material: this.builder.materials.support,
    });
  }

  private syncPresentation(): void {
    const locked = !this.elevator.exitReady;
    this.exitLock.visible = locked;
    this.laserPresentation.sync();
    this.elevatorPresentation.sync();
  }

  private syncLiftCameraProfile(): void {
    const progress = this.elevator.ascentProgress;
    const linearBlend = THREE.MathUtils.clamp(
      (progress - ROOM_4_LIFT_ARRIVAL_BLEND_START_PROGRESS) /
        (1 - ROOM_4_LIFT_ARRIVAL_BLEND_START_PROGRESS),
      0,
      1,
    );
    this.setLiftCameraArrivalBlend(
      THREE.MathUtils.smoothstep(linearBlend, 0, 1),
    );
  }

  private setLiftCameraArrivalBlend(blend: number): void {
    this.liftCameraArrivalBlendValue = blend;
    const ascent = ROOM_4_LIFT_CAMERA_PROFILE;
    const arrival = ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE;
    const profile = this.activeLiftCameraProfile;
    profile.distanceMetres = THREE.MathUtils.lerp(
      ascent.distanceMetres,
      arrival.distanceMetres,
      blend,
    );
    profile.targetHeightMetres = THREE.MathUtils.lerp(
      ascent.targetHeightMetres,
      arrival.targetHeightMetres,
      blend,
    );
    profile.pitchRadians = THREE.MathUtils.lerp(
      ascent.pitchRadians,
      arrival.pitchRadians,
      blend,
    );
    profile.transitionDurationSeconds = THREE.MathUtils.lerp(
      ascent.transitionDurationSeconds,
      arrival.transitionDurationSeconds,
      blend,
    );
    profile.framingDeadZoneHalfWidthMetres = THREE.MathUtils.lerp(
      ascent.framingDeadZoneHalfWidthMetres,
      arrival.framingDeadZoneHalfWidthMetres,
      blend,
    );
    profile.framingDeadZoneHalfHeightMetres = THREE.MathUtils.lerp(
      ascent.framingDeadZoneHalfHeightMetres,
      arrival.framingDeadZoneHalfHeightMetres,
      blend,
    );
    profile.framingDampingPerSecond = THREE.MathUtils.lerp(
      ascent.framingDampingPerSecond,
      arrival.framingDampingPerSecond,
      blend,
    );
  }

  private createHazards(): readonly LaserHazard[] {
    return [
      delayedSweep('room-4-single-sweep', [3.5, 36.2, 84], [11.5, 36.2, 84], 4.5, -0.34, 0.34, 4),
      delayedSweep('room-4-alternating-a', [3.5, 44.2, 83.2], [11.5, 44.2, 83.2], 12.5, -0.42, 0.42, 4),
      delayedSweep('room-4-alternating-b', [14.5, 45.1, 87.8], [6.5, 45.1, 87.8], 13.4, 0.42, -0.42, 4),
      delayedSweep('room-4-fast-sweep-a', [3.5, 53.1, 83], [11.5, 53.1, 83], 21.5, -0.55, 0.55, 3.2),
      delayedSweep('room-4-fast-sweep-b', [14.5, 54.1, 88], [6.5, 54.1, 88], 22.4, 0.55, -0.55, 3.2),
      delayedSweep('room-4-crossing-a', [3.5, 62.3, 82], [12, 62.3, 89], 30.5, -0.5, 0.5, 4),
      delayedSweep('room-4-crossing-b', [14.5, 63.2, 82], [6, 63.2, 89], 31.4, 0.5, -0.5, 4),
      delayedSweep('room-4-final-sweep', [3.5, 70.5, 85.5], [14.5, 70.5, 85.5], 38.5, -0.35, 0.35, 3.5),
    ];
  }
}

function delayedSweep(
  id: string,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  delaySeconds: number,
  fromAngleRadians: number,
  toAngleRadians: number,
  activeSeconds: number,
): LaserHazard {
  return new LaserHazard({
    id,
    start: new THREE.Vector3(...start),
    end: new THREE.Vector3(...end),
    timeline: {
      axisWorld: new THREE.Vector3(0, 1, 0),
      repeat: false,
      steps: [
        { kind: 'hold', durationSeconds: delaySeconds, enabled: false, angleRadians: fromAngleRadians },
        { kind: 'sweep', durationSeconds: activeSeconds * 0.5, enabled: true, fromAngleRadians, toAngleRadians },
        { kind: 'sweep', durationSeconds: activeSeconds * 0.5, enabled: true, fromAngleRadians: toAngleRadians, toAngleRadians: fromAngleRadians },
        { kind: 'hold', durationSeconds: 50, enabled: false, angleRadians: fromAngleRadians },
      ],
    },
  });
}
