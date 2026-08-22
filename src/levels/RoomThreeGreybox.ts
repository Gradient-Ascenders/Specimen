import * as THREE from 'three';

import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { RoomThreeArt } from '../render/environment/containment/RoomThreeArt.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import {
  LevelTriggerVolume,
  type TriggerContactTarget,
} from './LevelTriggerVolume.ts';

export const ROOM_3_CHECKPOINT_POSITION = new THREE.Vector3(0, 10.86, 51.4);
export const ROOM_3_CHECKPOINT_ID = 'containment-room-3-entry';
export const ROOM_3_PUZZLE_GROUP_ID = 'containment-room-3';

export interface RoomThreeHazardFailure {
  readonly roomId: 'room-3';
  readonly hazardId: string;
}

/** Room 3's authored traversal, hazards and transition volumes.
 * Blender transforms last baked from Room3(2).glb.
 */
export class RoomThreeGreybox {
  readonly builder = new GreyboxRoomBuilder('containment-room-3-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly checkpointTrigger = new LevelTriggerVolume({
    id: 'room-3-entry-checkpoint-trigger',
    centre: new THREE.Vector3(0, 12, 50.4),
    size: new THREE.Vector3(4, 4, 2),
  });
  readonly exitTrigger = new LevelTriggerVolume({
    id: 'room-3-exit-trigger',
    centre: new THREE.Vector3(9, 31.8, 79),
    size: new THREE.Vector3(2.2, 2, 2.6),
  });
  readonly failureVolume = new LevelTriggerVolume({
    id: 'room-3-fall-failure',
    centre: new THREE.Vector3(0, 3, 63),
    size: new THREE.Vector3(38, 10, 32),
  });
  readonly lasers: LaserHazardSystem;
  readonly art: RoomThreeArt;

  private readonly laserPresentation: LaserHazardPresentation;

  constructor(
    requestFailure: (failure: RoomThreeHazardFailure) => void,
    artResources: ContainmentArtResources,
  ) {
    this.buildShell();
    this.buildTraversal();
    this.buildVentTransition();
    this.hideGameplayColliders();

    const hazards = this.createHazards();
    this.lasers = new LaserHazardSystem({
      id: 'room-3-lasers',
      hazards,
      requestRecovery: (hazard) =>
        requestFailure({ roomId: 'room-3', hazardId: hazard.id }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.art = new RoomThreeArt(artResources, hazards);
    this.root.add(this.lasers.root, this.laserPresentation.root, this.art.root);
  }

  updateEntryTrigger(target: TriggerContactTarget): void {
    this.checkpointTrigger.update(target);
  }

  updateFailureTrigger(target: TriggerContactTarget): void {
    this.failureVolume.update(target);
  }

  updateActive(deltaSeconds: number, target: TriggerContactTarget): void {
    this.lasers.update(deltaSeconds, target);
    this.laserPresentation.sync();
    this.exitTrigger.update(target);
  }

  reset(): void {
    this.lasers.reset();
    this.checkpointTrigger.reset();
    this.exitTrigger.reset();
    this.failureVolume.reset();
    this.laserPresentation.sync();
  }

  isInsideCameraTightVent(position: TriggerContactTarget['position']): boolean {
    return (
      position.x >= 7.5 &&
      position.x <= 10.5 &&
      position.y >= 30.5 &&
      position.y <= 34 &&
      position.z >= 76.5 &&
      position.z <= 81.1
    );
  }

  dispose(): void {
    this.checkpointTrigger.dispose();
    this.exitTrigger.dispose();
    this.failureVolume.dispose();
    this.art.dispose();
    this.laserPresentation.dispose();
    this.lasers.dispose();
    this.builder.dispose();
  }

  private hideGameplayColliders(): void {
    for (const [role, material] of Object.entries(this.builder.materials)) {
      material.name = `containment-room-3-${role}-collision-only`;
      material.visible = false;
    }
  }

  private buildShell(): void {
    const { acid, wall } = this.builder.materials;

    // The lower boundary is intentionally below the authored route. Crossing
    // the failure volume starts recovery before the player can land in the acid.
    this.builder.addCollider({
      name: 'room-3-acid-floor',
      size: [34, 0.4, 28],
      position: [0, 4.8, 63],
      material: acid,
      textureRole: 'acid-floor',
    });
    this.builder.addCollider({ name: 'room-3-west-wall', size: [0.4, 29.6, 28], position: [-17, 19.6, 63], material: wall });
    this.builder.addCollider({ name: 'room-3-east-wall', size: [0.4, 29.6, 28], position: [17, 19.6, 63], material: wall });
    this.builder.addCollider({ name: 'room-3-ceiling', size: [34, 0.4, 28], position: [0, 34.4, 63], material: wall });

    // Split the entry wall around Room 2's real upper doorway.
    this.builder.addCollider({ name: 'room-3-entry-wall-west', size: [15.5, 29.6, 0.4], position: [-9.25, 19.6, 49], material: wall });
    this.builder.addCollider({ name: 'room-3-entry-wall-east', size: [15.5, 29.6, 0.4], position: [9.25, 19.6, 49], material: wall });
    this.builder.addCollider({ name: 'room-3-entry-wall-above', size: [3, 20.4, 0.4], position: [0, 24.2, 49], material: wall });
    this.builder.addCollider({ name: 'room-3-entry-wall-below', size: [3, 5.4, 0.4], position: [0, 7.5, 49], material: wall });

    // The rear is split around the final high ventilation opening.
    this.builder.addCollider({ name: 'room-3-rear-wall-west', size: [24.8, 29.6, 0.4], position: [-4.6, 19.6, 77], material: wall });
    this.builder.addCollider({ name: 'room-3-rear-wall-east', size: [7, 29.6, 0.4], position: [13.5, 19.6, 77], material: wall });
    this.builder.addCollider({ name: 'room-3-rear-wall-above-vent', size: [2.1836, 1.1112, 0.1978], position: [8.8982, 33.9189, 76.8938], material: wall });
    this.builder.addCollider({ name: 'room-3-rear-wall-below-vent', size: [2.2, 24.8, 0.4], position: [9, 17.4, 77], material: wall });

    this.builder.addLight('room-3-light-entry', [-8, 30, 54]);
    this.builder.addLight('room-3-light-centre', [8, 30, 64]);
    this.builder.addLight('room-3-light-exit', [9, 33, 74], 0x9dffc0, 12, 16);
  }

  private buildTraversal(): void {
    const { platform, sticky, support } = this.builder.materials;

    this.builder.addCollider({ name: 'room-3-entry-platform', size: [8, 0.5, 5], position: [0, 10.15, 51.5], material: platform });
    this.builder.addCollider({ name: 'room-3-platform-a-bounce', size: [4.5, 0.5, 4], position: [2.7885, 10.9032, 57.6261], material: platform });
    this.builder.addCollider({ name: 'room-3-platform-b-gap', size: [5.13, 0.5, 4], position: [11.2583, 11.4329, 59], material: platform });

    this.builder.addCollider({
      name: 'room-3-sticky-wall-main',
      size: [0.18, 9.5, 8],
      position: [16.72, 17.25, 63],
      material: sticky,
      surfaceTag: 'sticky',
      textureRole: 'sticky-wall-tile',
    });
    this.builder.addCollider({ name: 'room-3-wall-exit-ledge', size: [4.6, 0.5, 4.8], position: [14.7, 21.1, 66], material: support });
    this.builder.addCollider({ name: 'room-3-platform-c', size: [4.2, 0.5, 4], position: [10, 22.1, 60.5406], material: platform });
    this.builder.addCollider({ name: 'room-3-platform-d', size: [4, 0.5, 4], position: [5, 23.7, 62.839], material: platform });
    this.builder.addCollider({ name: 'room-3-platform-e', size: [4, 0.5, 4], position: [-0.4591, 24.1676, 68.5505], material: platform });
    this.builder.addCollider({ name: 'room-3-platform-f', size: [4.2, 0.5, 4], position: [5.7, 25.0753, 73.5], material: platform });

    this.builder.addCollider({
      name: 'room-3-final-sticky-strip',
      size: [4, 7.3609, 0.18],
      position: [9, 27.6771, 76.72],
      material: sticky,
      surfaceTag: 'sticky',
      textureRole: 'sticky-wall-tile',
    });
  }

  private buildVentTransition(): void {
    const { duct } = this.builder.materials;
    this.builder.addCollider({ name: 'room-3-to-4-duct-floor', size: [2.4, 0.25, 3.8], position: [9, 31.05, 78.9], material: duct });
    this.builder.addCollider({ name: 'room-3-to-4-duct-roof', size: [2.3869, 0.18, 3.8], position: [8.951, 33.45, 78.9], material: duct });
    this.builder.addCollider({ name: 'room-3-to-4-duct-west-wall', size: [0.18, 2.2237, 3.8], position: [7.85, 32.25, 78.9], material: duct });
    this.builder.addCollider({ name: 'room-3-to-4-duct-east-wall', size: [0.18, 2.4, 3.8], position: [10.15, 32.25, 78.9], material: duct });
  }

  private createHazards(): readonly LaserHazard[] {
    return [
      new LaserHazard({
        id: 'room-3-first-static-laser',
        start: new THREE.Vector3(-2.979, 11.3706, 54.5525),
        end: new THREE.Vector3(4.621, 11.3706, 54.5525),
      }),
      new LaserHazard({
        id: 'room-3-charged-gap-laser',
        start: new THREE.Vector3(6.4542, 11.9598, 61.8538),
        end: new THREE.Vector3(6.4542, 11.9598, 54.2428),
      }),
      new LaserHazard({
        id: 'room-3-wall-route-laser-low',
        start: new THREE.Vector3(16.3, 16.3, 59.2),
        end: new THREE.Vector3(16.3, 16.3, 64.3),
      }),
      new LaserHazard({
        id: 'room-3-wall-route-laser-high',
        start: new THREE.Vector3(16.3, 19.1, 61.5),
        end: new THREE.Vector3(16.3, 19.1, 66.7),
      }),
      new LaserHazard({
        id: 'room-3-upper-sweep-laser',
        start: new THREE.Vector3(4.6941, 24.2747, 62.0384),
        end: new THREE.Vector3(9.6941, 24.2747, 62.0384),
        timeline: {
          axisWorld: new THREE.Vector3(0, 1, 0),
          repeat: true,
          steps: [
            { kind: 'hold', durationSeconds: 0.6, enabled: false, angleRadians: -0.35 },
            { kind: 'sweep', durationSeconds: 1.4, enabled: true, fromAngleRadians: -0.35, toAngleRadians: 0.35 },
            { kind: 'hold', durationSeconds: 0.6, enabled: false, angleRadians: 0.35 },
            { kind: 'sweep', durationSeconds: 1.4, enabled: true, fromAngleRadians: 0.35, toAngleRadians: -0.35 },
          ],
        },
      }),
      new LaserHazard({
        id: 'room-3-final-vent-laser',
        start: new THREE.Vector3(7.3, 29.8, 76.25),
        end: new THREE.Vector3(10.7, 29.8, 76.25),
      }),
    ];
  }
}
