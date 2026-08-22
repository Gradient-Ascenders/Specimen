import * as THREE from 'three';

import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { ElevatorSequence } from '../puzzle/ElevatorSequence.ts';
import { MovingPlatform } from '../puzzle/MovingPlatform.ts';
import { ElevatorPresentation } from '../render/elevator/ElevatorPresentation.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import { LevelTriggerVolume } from './LevelTriggerVolume.ts';

export const ROOM_4_CHECKPOINT_POSITION = new THREE.Vector3(9, 30.21, 85.5);
export const ROOM_4_CHECKPOINT_ID = 'containment-room-4-elevator-roof';
export const ROOM_4_PUZZLE_GROUP_ID = 'containment-room-4';

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

  private readonly laserPresentation: LaserHazardPresentation;
  private readonly elevatorPresentation: ElevatorPresentation;
  private readonly exitLock: THREE.Mesh;

  constructor(requestFailure: (failure: RoomFourHazardFailure) => void) {
    this.buildShell();
    this.exitLock = this.buildExit();

    this.root.add(this.elevator.root);
    this.collisionMeshes.push(this.elevatorPlatform.collisionMesh);

    const hazards = this.createHazards();
    this.lasers = new LaserHazardSystem({
      id: 'room-4-lasers',
      hazards,
      requestRecovery: (hazard) =>
        requestFailure({ roomId: 'room-4', hazardId: hazard.id }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.elevatorPresentation = new ElevatorPresentation(this.elevator);
    this.root.add(
      this.lasers.root,
      this.laserPresentation.root,
      this.elevatorPresentation.root,
    );
    this.syncPresentation();
  }

  updateEntryTrigger(body: KinematicBody): void {
    this.checkpointTrigger.update(body);
  }

  updateFailureTrigger(body: KinematicBody): void {
    this.failureVolume.update(body);
  }

  updateActive(
    deltaSeconds: number,
    body: KinematicBody,
    persistentBodies: readonly KinematicBody[],
  ): void {
    this.exitTrigger.update(body);

    this.elevator.update(deltaSeconds, persistentBodies);
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
    this.syncPresentation();
  }

  dispose(): void {
    this.checkpointTrigger.dispose();
    this.exitTrigger.dispose();
    this.failureVolume.dispose();
    this.laserPresentation.dispose();
    this.elevatorPresentation.dispose();
    this.lasers.dispose();
    this.elevatorPlatform.dispose();
    this.builder.dispose();
  }

  private buildShell(): void {
    const { floor, wall, duct } = this.builder.materials;

    this.builder.addCollider({ name: 'room-4-shaft-floor', size: [13, 0.4, 13], position: [9, 25.8, 85.5], material: floor });
    this.builder.addCollider({ name: 'room-4-shaft-west-wall', size: [0.4, 51, 12], position: [2.5, 51, 85.5], material: wall });
    this.builder.addCollider({ name: 'room-4-shaft-east-wall', size: [0.4, 51, 12], position: [15.5, 51, 85.5], material: wall });

    // South wall leaves a low opening for the Room 3 duct drop.
    this.builder.addCollider({ name: 'room-4-south-wall-west', size: [5.2, 51, 0.4], position: [5.1, 51, 79.5], material: wall });
    this.builder.addCollider({ name: 'room-4-south-wall-east', size: [5.2, 51, 0.4], position: [12.9, 51, 79.5], material: wall });
    this.builder.addCollider({ name: 'room-4-south-wall-above-entry', size: [2.6, 44, 0.4], position: [9, 55, 79.5], material: wall });
    this.builder.addCollider({ name: 'room-4-south-wall-below-entry', size: [2.6, 3, 0.4], position: [9, 27.5, 79.5], material: wall });

    // North wall leaves only the top Room 5 doorway open.
    this.builder.addCollider({ name: 'room-4-north-wall-west', size: [5.2, 51, 0.4], position: [5.1, 51, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-4-north-wall-east', size: [5.2, 51, 0.4], position: [12.9, 51, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-4-north-wall-below-exit', size: [2.6, 47, 0.4], position: [9, 49, 91.5], material: wall });

    this.builder.addCollider({ name: 'room-4-entry-duct-floor', size: [2.4, 0.25, 1.2], position: [9, 31.05, 80.1], material: duct });
    this.builder.addCollider({ name: 'room-4-exit-platform', size: [4.5, 0.5, 3], position: [9, 74.5, 90.2], material: floor });

    this.builder.addLight('room-4-bottom-light', [9, 32, 85.5], 0xffb13b, 13, 18);
    this.builder.addLight('room-4-mid-light', [9, 52, 85.5], 0xff6b32, 12, 20);
    this.builder.addLight('room-4-top-light', [9, 74, 88], 0x8dffb8, 14, 20);
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
