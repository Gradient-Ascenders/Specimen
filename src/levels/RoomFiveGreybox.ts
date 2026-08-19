import * as THREE from 'three';

import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import { LevelTriggerVolume } from './LevelTriggerVolume.ts';

export const ROOM_5_ENTRY_CHECKPOINT_POSITION = new THREE.Vector3(9, 75.21, 94);
export const ROOM_5_CENTRAL_CHECKPOINT_POSITION = new THREE.Vector3(-5.5, 82.21, 108.5);
export const ROOM_5_FINAL_CHECKPOINT_POSITION = new THREE.Vector3(17.2, 92.71, 115);
export const ROOM_5_ENTRY_CHECKPOINT_ID = 'containment-room-5-entry';
export const ROOM_5_CENTRAL_CHECKPOINT_ID = 'containment-room-5-central';
export const ROOM_5_FINAL_CHECKPOINT_ID = 'containment-room-5-final';
export const ROOM_5_PUZZLE_GROUP_ID = 'containment-room-5';

export type RoomFiveEndingState =
  | 'traversal'
  | 'leverPull'
  | 'containmentFailure'
  | 'released';

export interface RoomFiveHazardFailure {
  readonly roomId: 'room-5';
  readonly hazardId: string;
}

const LEVER_PULL_SECONDS = 1;
const CONTAINMENT_FAILURE_SECONDS = 1.5;

/** Room 5's mastery route and deterministic, non-playable Etch release beat. */
export class RoomFiveGreybox {
  readonly builder = new GreyboxRoomBuilder('containment-room-5-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly leverHandleName = 'room-5-observation-sticky-lever-handle';
  readonly entryCheckpointTrigger = new LevelTriggerVolume({
    id: 'room-5-entry-checkpoint-trigger',
    centre: new THREE.Vector3(9, 76, 93.5),
    size: new THREE.Vector3(4, 3, 3),
  });
  readonly centralCheckpointTrigger = new LevelTriggerVolume({
    id: 'room-5-central-checkpoint-trigger',
    centre: new THREE.Vector3(-5.5, 82.5, 108.5),
    size: new THREE.Vector3(4, 3, 4),
  });
  readonly finalCheckpointTrigger = new LevelTriggerVolume({
    id: 'room-5-final-checkpoint-trigger',
    centre: new THREE.Vector3(17.2, 93.1, 115),
    size: new THREE.Vector3(4, 3, 4),
  });
  readonly observationTrigger = new LevelTriggerVolume({
    id: 'room-5-observation-room-trigger',
    centre: new THREE.Vector3(-10, 99.3, 128.8),
    size: new THREE.Vector3(7, 3.6, 5.5),
  });
  readonly failureVolume = new LevelTriggerVolume({
    id: 'room-5-fall-failure',
    centre: new THREE.Vector3(0, 68, 108.5),
    size: new THREE.Vector3(44, 12, 39),
  });
  readonly lasers: LaserHazardSystem;

  private readonly laserPresentation: LaserHazardPresentation;
  private readonly leverHandle: THREE.Mesh;
  private readonly containmentDoorLeft: THREE.Mesh;
  private readonly containmentDoorRight: THREE.Mesh;
  private readonly etchPlaceholder: THREE.Mesh;
  private endingStateValue: RoomFiveEndingState = 'traversal';
  private endingElapsedSeconds = 0;

  constructor(requestFailure: (failure: RoomFiveHazardFailure) => void) {
    this.buildShell();
    this.buildTraversal();
    const endingObjects = this.buildContainmentAndObservationRoom();
    this.leverHandle = endingObjects.leverHandle;
    this.containmentDoorLeft = endingObjects.leftDoor;
    this.containmentDoorRight = endingObjects.rightDoor;
    this.etchPlaceholder = endingObjects.etch;

    const hazards = this.createHazards();
    this.lasers = new LaserHazardSystem({
      id: 'room-5-lasers',
      hazards,
      requestRecovery: (hazard) =>
        requestFailure({ roomId: 'room-5', hazardId: hazard.id }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.root.add(this.lasers.root, this.laserPresentation.root);
    this.resetEndingPresentation();
  }

  get endingState(): RoomFiveEndingState {
    return this.endingStateValue;
  }

  get releaseComplete(): boolean {
    return this.endingStateValue === 'released';
  }

  updateTraversal(deltaSeconds: number, body: KinematicBody): void {
    this.lasers.update(deltaSeconds, body);
    this.laserPresentation.sync();
    this.entryCheckpointTrigger.update(body);
    this.centralCheckpointTrigger.update(body);
    this.finalCheckpointTrigger.update(body);
    this.observationTrigger.update(body);
    this.failureVolume.update(body);
  }

  beginEnding(): boolean {
    if (this.endingStateValue !== 'traversal') return false;
    this.endingStateValue = 'leverPull';
    this.endingElapsedSeconds = 0;
    return true;
  }

  /** Returns true only on the fixed step that Etch's release completes. */
  updateEnding(deltaSeconds: number): boolean {
    if (this.endingStateValue === 'traversal' || this.endingStateValue === 'released') {
      return false;
    }

    this.endingElapsedSeconds += deltaSeconds;
    if (this.endingStateValue === 'leverPull') {
      const progress = THREE.MathUtils.clamp(
        this.endingElapsedSeconds / LEVER_PULL_SECONDS,
        0,
        1,
      );
      this.leverHandle.rotation.x = -progress * Math.PI * 0.42;
      if (progress < 1) return false;

      this.endingStateValue = 'containmentFailure';
      this.endingElapsedSeconds = 0;
      return false;
    }

    const progress = THREE.MathUtils.clamp(
      this.endingElapsedSeconds / CONTAINMENT_FAILURE_SECONDS,
      0,
      1,
    );
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    this.containmentDoorLeft.position.x = -0.9 - eased * 1.25;
    this.containmentDoorRight.position.x = 0.9 + eased * 1.25;
    this.etchPlaceholder.position.y = 84.2 - eased * 8.8;
    this.etchPlaceholder.position.z = 110 + eased * 2;

    if (progress < 1) return false;
    this.endingStateValue = 'released';
    this.endingElapsedSeconds = 0;
    return true;
  }

  reset(): void {
    this.lasers.reset();
    this.entryCheckpointTrigger.reset();
    this.centralCheckpointTrigger.reset();
    this.finalCheckpointTrigger.reset();
    this.observationTrigger.reset();
    this.failureVolume.reset();
    this.laserPresentation.sync();
    this.resetEndingPresentation();
  }

  dispose(): void {
    this.entryCheckpointTrigger.dispose();
    this.centralCheckpointTrigger.dispose();
    this.finalCheckpointTrigger.dispose();
    this.observationTrigger.dispose();
    this.failureVolume.dispose();
    this.laserPresentation.dispose();
    this.lasers.dispose();
    this.builder.dispose();
  }

  private buildShell(): void {
    const { floor, wall } = this.builder.materials;
    this.builder.addCollider({ name: 'room-5-floor', size: [40, 0.4, 34], position: [0, 74.55, 108.5], material: floor });
    this.builder.addCollider({ name: 'room-5-west-wall', size: [0.4, 26, 34], position: [-20, 87.75, 108.5], material: wall });
    this.builder.addCollider({ name: 'room-5-east-wall', size: [0.4, 26, 34], position: [20, 87.75, 108.5], material: wall });
    this.builder.addCollider({ name: 'room-5-ceiling', size: [40, 0.4, 34], position: [0, 100.75, 108.5], material: wall });

    // Front wall opening lines up with Room 4's top exit.
    this.builder.addCollider({ name: 'room-5-front-wall-west', size: [27.5, 26, 0.4], position: [-6.25, 87.75, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-5-front-wall-east', size: [9.5, 26, 0.4], position: [15.25, 87.75, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-5-front-wall-above-entry', size: [3, 22, 0.4], position: [9, 89.75, 91.5], material: wall });

    // Rear wall is split around the high observation-room opening.
    this.builder.addCollider({ name: 'room-5-rear-wall-west', size: [8, 26, 0.4], position: [-16, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-east', size: [28, 26, 0.4], position: [6, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-below-observation', size: [4, 22.2, 0.4], position: [-10, 85.85, 125.5], material: wall });

    this.builder.addLight('room-5-entry-light', [9, 96, 96]);
    this.builder.addLight('room-5-containment-light', [0, 94, 110], 0xcfff70, 15, 22);
    this.builder.addLight('room-5-observation-light', [-10, 103, 129], 0x9dffc0, 13, 14);
  }

  private buildTraversal(): void {
    const { platform, support, sticky } = this.builder.materials;
    this.builder.addCollider({ name: 'room-5-entry-platform', size: [6, 0.5, 4], position: [9, 74.5, 94], material: platform });
    this.builder.addCollider({ name: 'room-5-lower-platform-a', size: [5, 0.5, 4], position: [5, 76.1, 99], material: platform });
    this.builder.addCollider({ name: 'room-5-lower-platform-b', size: [4.5, 0.5, 4], position: [0, 77.8, 103], material: platform });
    this.builder.addCollider({ name: 'room-5-lower-platform-c', size: [4.5, 0.5, 4], position: [-4, 79.4, 106], material: platform });
    this.builder.addCollider({ name: 'room-5-central-rest-platform', size: [5, 0.5, 4.5], position: [-5.5, 81.5, 108.5], material: platform });
    this.builder.addCollider({ name: 'room-5-containment-route-top', size: [6, 0.5, 6], position: [0, 82.5, 110], material: support });
    this.builder.addCollider({ name: 'room-5-upper-platform-a', size: [4.5, 0.5, 4], position: [5, 84.1, 114], material: platform });
    this.builder.addCollider({ name: 'room-5-upper-platform-b', size: [4.5, 0.5, 4], position: [10, 85.9, 110], material: platform });
    this.builder.addCollider({ name: 'room-5-upper-platform-c', size: [4.5, 0.5, 4], position: [14.5, 87.5, 114], material: platform });

    this.builder.addCollider({
      name: 'room-5-east-sticky-ascent',
      size: [0.18, 9, 7],
      position: [19.72, 89.5, 114],
      material: sticky,
      surfaceTag: 'sticky',
      textureRole: 'sticky-wall-tile',
    });
    this.builder.addCollider({ name: 'room-5-final-checkpoint-ledge', size: [4.5, 0.5, 4.5], position: [17.2, 92, 115], material: support });
    this.builder.addCollider({ name: 'room-5-final-approach-platform', size: [4.5, 0.5, 4], position: [12.5, 93.2, 120], material: platform });

    for (const [index, x] of [10, 6, 2, -2, -6] .entries()) {
      this.builder.addCollider({
        name: `room-5-final-sticky-transfer-${index + 1}`,
        size: [3, 6.5, 0.18],
        position: [x, 95.2, 125.18],
        material: sticky,
        surfaceTag: 'sticky',
        textureRole: 'sticky-wall-tile',
      });
    }

    this.builder.addCollider({ name: 'room-5-final-bounce-platform', size: [5, 0.5, 4], position: [-9.5, 95.5, 121.5], material: platform });
  }

  private buildContainmentAndObservationRoom(): {
    readonly leverHandle: THREE.Mesh;
    readonly leftDoor: THREE.Mesh;
    readonly rightDoor: THREE.Mesh;
    readonly etch: THREE.Mesh;
  } {
    const { containment, glass, etch: etchMaterial, floor, wall, sticky } = this.builder.materials;

    this.builder.addVisualBox({ name: 'room-5-containment-frame-left', size: [0.35, 4.5, 4.8], position: [-2.7, 84.7, 110], material: containment });
    this.builder.addVisualBox({ name: 'room-5-containment-frame-right', size: [0.35, 4.5, 4.8], position: [2.7, 84.7, 110], material: containment });
    this.builder.addVisualBox({ name: 'room-5-containment-glass', size: [5.1, 4.1, 4.5], position: [0, 84.7, 110], material: glass });
    const leftDoor = this.builder.addVisualBox({ name: 'room-5-containment-door-left', size: [1.7, 3.8, 0.25], position: [-0.9, 84.7, 107.65], material: containment });
    const rightDoor = this.builder.addVisualBox({ name: 'room-5-containment-door-right', size: [1.7, 3.8, 0.25], position: [0.9, 84.7, 107.65], material: containment });

    const etch = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 22, 15),
      etchMaterial,
    );
    etch.name = 'room-5-contained-etch-placeholder';
    etch.position.set(0, 84.2, 110);
    etch.scale.set(1.05, 0.85, 1.05);
    this.root.add(etch);

    // Observation room sits beyond the high opening in the main rear wall.
    this.builder.addCollider({ name: 'room-5-observation-floor', size: [8, 0.4, 7], position: [-10, 97.3, 129], material: floor });
    this.builder.addCollider({ name: 'room-5-observation-roof', size: [8, 0.3, 7], position: [-10, 104.2, 129], material: wall });
    this.builder.addCollider({ name: 'room-5-observation-west-wall', size: [0.3, 7, 7], position: [-14, 100.75, 129], material: wall });
    this.builder.addCollider({ name: 'room-5-observation-east-wall', size: [0.3, 7, 7], position: [-6, 100.75, 129], material: wall });
    this.builder.addCollider({ name: 'room-5-observation-back-wall', size: [8, 7, 0.3], position: [-10, 100.75, 132.5], material: wall });
    this.builder.addVisualBox({ name: 'room-5-observation-window-left', size: [1.7, 3, 0.12], position: [-13.05, 99.2, 125.32], material: glass });
    this.builder.addVisualBox({ name: 'room-5-observation-window-right', size: [1.7, 3, 0.12], position: [-6.95, 99.2, 125.32], material: glass });

    this.builder.addVisualBox({ name: 'room-5-lever-base', size: [1.3, 1.3, 0.45], position: [-10, 100.2, 132.05], material: containment });
    const leverHandle = this.builder.addCollider({
      name: this.leverHandleName,
      size: [0.42, 2.6, 0.42],
      position: [-10, 100.2, 131.75],
      material: sticky,
      surfaceTag: 'sticky',
      textureRole: 'sticky-wall-tile',
    });

    return { leverHandle, leftDoor, rightDoor, etch };
  }

  private resetEndingPresentation(): void {
    this.endingStateValue = 'traversal';
    this.endingElapsedSeconds = 0;
    this.leverHandle.rotation.set(0, 0, 0);
    this.containmentDoorLeft.position.set(-0.9, 84.7, 107.65);
    this.containmentDoorRight.position.set(0.9, 84.7, 107.65);
    this.etchPlaceholder.position.set(0, 84.2, 110);
  }

  private createHazards(): readonly LaserHazard[] {
    return [
      new LaserHazard({
        id: 'room-5-lower-static-barrier',
        start: new THREE.Vector3(1.8, 76.1, 100.7),
        end: new THREE.Vector3(8.2, 76.1, 100.7),
      }),
      new LaserHazard({
        id: 'room-5-central-timed-barrier',
        start: new THREE.Vector3(-7.5, 82.4, 111),
        end: new THREE.Vector3(1.5, 82.4, 111),
        timeline: {
          axisWorld: new THREE.Vector3(0, 1, 0),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 1, enabled: false, angleRadians: -0.3 },
            { kind: 'sweep', durationSeconds: 1.5, enabled: true, fromAngleRadians: -0.3, toAngleRadians: 0.3 },
            { kind: 'hold', durationSeconds: 1, enabled: false, angleRadians: 0.3 },
            { kind: 'sweep', durationSeconds: 1.5, enabled: true, fromAngleRadians: 0.3, toAngleRadians: -0.3 },
          ],
        },
      }),
      new LaserHazard({
        id: 'room-5-final-wall-route-laser',
        start: new THREE.Vector3(-1, 95.2, 124.7),
        end: new THREE.Vector3(8.5, 95.2, 124.7),
        timeline: {
          axisWorld: new THREE.Vector3(0, 0, 1),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 0.7, enabled: false, angleRadians: -0.2 },
            { kind: 'sweep', durationSeconds: 1.8, enabled: true, fromAngleRadians: -0.2, toAngleRadians: 0.2 },
            { kind: 'hold', durationSeconds: 0.7, enabled: false, angleRadians: 0.2 },
            { kind: 'sweep', durationSeconds: 1.8, enabled: true, fromAngleRadians: 0.2, toAngleRadians: -0.2 },
          ],
        },
      }),
    ];
  }
}
