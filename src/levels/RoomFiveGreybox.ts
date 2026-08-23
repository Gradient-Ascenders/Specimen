import * as THREE from 'three';

import { LaserHazard } from '../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { RoomFiveArt } from '../render/environment/containment/RoomFiveArt.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { MovingPlatform } from '../puzzle/MovingPlatform.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import { LevelTriggerVolume } from './LevelTriggerVolume.ts';

export const ROOM_5_ENTRY_CHECKPOINT_POSITION = new THREE.Vector3(9, 75.21, 94);
export const ROOM_5_ENTRY_CHECKPOINT_ID = 'containment-room-5-entry';
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
const STICKY_WALL_THICKNESS_METRES = 0.022;
const MODERATE_LASER_PERIOD_SECONDS = 5;
const MOVING_PLATFORM_TRAVEL_DURATION_SECONDS = 3.2;
const LASER_FIVE_TO_SEVEN_DISTANCE_METRES = 5.545;
const MOTION_OFFSET_EPSILON_METRES = 1e-12;

interface RoomFiveLaserMotionDefinition {
  readonly id: string;
  readonly axis: readonly [number, number, number];
  readonly amplitudeMetres: number;
  readonly centreOffsetMetres: number;
  readonly phaseRadians: number;
  readonly periodSeconds: number;
}

interface RoomFiveLaserMotion {
  readonly hazard: LaserHazard;
  readonly definition: RoomFiveLaserMotionDefinition;
}

const ROOM_FIVE_LASER_MOTIONS: readonly RoomFiveLaserMotionDefinition[] = [
  { id: 'room-5-laser-1', axis: [0, 1, 0], amplitudeMetres: 2.25, centreOffsetMetres: 0, phaseRadians: 0, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  { id: 'room-5-laser-2', axis: [0, 1, 0], amplitudeMetres: 2, centreOffsetMetres: 0, phaseRadians: Math.PI, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  { id: 'room-5-laser-3', axis: [0, 1, 0], amplitudeMetres: 2.1, centreOffsetMetres: 0, phaseRadians: 0, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  { id: 'room-5-laser-4', axis: [0, 1, 0], amplitudeMetres: 2.1, centreOffsetMetres: 0, phaseRadians: Math.PI, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
  {
    id: 'room-5-laser-5',
    axis: [0, 0, 1],
    amplitudeMetres: LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    centreOffsetMetres: LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    phaseRadians: -Math.PI * 0.5,
    periodSeconds: MODERATE_LASER_PERIOD_SECONDS,
  },
  {
    id: 'room-5-laser-7',
    axis: [0, 0, 1],
    amplitudeMetres: LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    centreOffsetMetres: -LASER_FIVE_TO_SEVEN_DISTANCE_METRES * 0.5,
    phaseRadians: Math.PI * 0.5,
    periodSeconds: MODERATE_LASER_PERIOD_SECONDS,
  },
  { id: 'room-5-laser-8', axis: [0, 1, 0], amplitudeMetres: 3.25, centreOffsetMetres: 0, phaseRadians: 0, periodSeconds: MODERATE_LASER_PERIOD_SECONDS },
];

/** Room 5's mastery route and deterministic, non-playable Etch release beat. */
export class RoomFiveGreybox {
  readonly builder = new GreyboxRoomBuilder('containment-room-5-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly movingPlatformOne = new MovingPlatform({
    id: 'room-5-moving-platform-1',
    start: new THREE.Vector3(2.136, 82.374, 100.384),
    end: new THREE.Vector3(10.082, 82.374, 100.384),
    size: new THREE.Vector3(1.849, 0.523, 2.091),
    travelDurationSeconds: MOVING_PLATFORM_TRAVEL_DURATION_SECONDS,
    initialProgress: 0.5,
    initialTarget: 'end',
  });
  readonly movingPlatformTwo = new MovingPlatform({
    id: 'room-5-moving-platform-2',
    start: new THREE.Vector3(15.109, 82.374, 100.384),
    end: new THREE.Vector3(15.109, 82.374, 107.234),
    size: new THREE.Vector3(1.849, 0.523, 2.091),
    travelDurationSeconds: MOVING_PLATFORM_TRAVEL_DURATION_SECONDS,
    initialTarget: 'end',
  });
  readonly goopWoodenDoor: THREE.Mesh;
  readonly leverHandleName = 'room-5-observation-sticky-lever-handle';
  readonly entryCheckpointTrigger = new LevelTriggerVolume({
    id: 'room-5-entry-checkpoint-trigger',
    centre: new THREE.Vector3(9, 76, 93.5),
    size: new THREE.Vector3(4, 3, 3),
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
  readonly art: RoomFiveArt;

  private readonly laserPresentation: LaserHazardPresentation;
  private readonly movingPlatforms = [
    this.movingPlatformOne,
    this.movingPlatformTwo,
  ] as const;
  private readonly laserMotions: readonly RoomFiveLaserMotion[];
  private readonly laserTranslationOffset = new THREE.Vector3();
  private readonly leverHandle: THREE.Mesh;
  private readonly etchPlaceholder: THREE.Mesh;
  private endingStateValue: RoomFiveEndingState = 'traversal';
  private endingElapsedSeconds = 0;
  private traversalElapsedSeconds = 0;

  constructor(
    requestFailure: (failure: RoomFiveHazardFailure) => void,
    artResources: ContainmentArtResources,
  ) {
    this.goopWoodenDoor = this.buildShell();
    const solubleDoorMaterial = artResources.materials.solubleComposite.clone();
    solubleDoorMaterial.name = 'room-5-soluble-biological-composite-source';
    solubleDoorMaterial.color.setHex(0x686047);
    solubleDoorMaterial.emissive.setHex(0x121408);
    solubleDoorMaterial.emissiveIntensity = 0.1;
    solubleDoorMaterial.roughness = 0.82;
    solubleDoorMaterial.normalScale.set(0.25, 0.25);
    this.goopWoodenDoor.material = solubleDoorMaterial;
    this.buildTraversal();
    const endingObjects = this.buildContainmentAndObservationRoom();
    this.leverHandle = endingObjects.leverHandle;
    this.etchPlaceholder = endingObjects.etch;
    const leverMaterial = artResources.materials.stickyMembrane.clone();
    leverMaterial.name = 'room-5-authoritative-sticky-lever-handle';
    this.leverHandle.material = leverMaterial;
    const containedGoopMaterial = this.etchPlaceholder
      .material as THREE.MeshStandardMaterial;
    containedGoopMaterial.name = 'room-5-contained-goop-biological-material';
    containedGoopMaterial.color.setHex(0x7cae2d);
    containedGoopMaterial.emissive.setHex(0x213b08);
    containedGoopMaterial.emissiveIntensity = 0.22;
    containedGoopMaterial.roughness = 0.2;
    containedGoopMaterial.metalness = 0;

    const hazards = this.createHazards();
    this.laserMotions = ROOM_FIVE_LASER_MOTIONS.map((definition) => {
      const hazard = hazards.find((candidate) => candidate.id === definition.id);
      if (!hazard) {
        throw new Error(`Missing Room 5 moving laser "${definition.id}".`);
      }
      return { hazard, definition };
    });
    this.lasers = new LaserHazardSystem({
      id: 'room-5-lasers',
      hazards,
      requestRecovery: (hazard) =>
        requestFailure({ roomId: 'room-5', hazardId: hazard.id }),
    });
    this.laserPresentation = new LaserHazardPresentation(hazards);
    this.art = new RoomFiveArt(
      artResources,
      hazards,
      [this.movingPlatformOne, this.movingPlatformTwo],
    );
    this.hideGameplayColliders();
    this.root.add(this.lasers.root, this.laserPresentation.root, this.art.root);
    this.resetEndingPresentation();
  }

  get endingState(): RoomFiveEndingState {
    return this.endingStateValue;
  }

  get releaseComplete(): boolean {
    return this.endingStateValue === 'released';
  }

  updateEntryTrigger(body: KinematicBody): void {
    this.entryCheckpointTrigger.update(body);
  }

  updateFailureTrigger(body: KinematicBody): void {
    this.failureVolume.update(body);
  }

  updateTraversal(
    deltaSeconds: number,
    body: KinematicBody,
    persistentBodies: readonly KinematicBody[],
  ): void {
    this.updateMovingPlatforms(deltaSeconds, persistentBodies);
    this.updateLaserMotions(deltaSeconds);
    this.lasers.update(deltaSeconds, body);
    this.laserPresentation.sync();
    this.observationTrigger.update(body);
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
    this.etchPlaceholder.position.y = 76.546 - eased * 8.8;
    this.etchPlaceholder.position.z = 110 + eased * 2;

    if (progress < 1) return false;
    this.endingStateValue = 'released';
    this.endingElapsedSeconds = 0;
    return true;
  }

  reset(): void {
    this.traversalElapsedSeconds = 0;
    for (const platform of this.movingPlatforms) platform.reset();
    this.lasers.reset();
    this.applyLaserMotions();
    this.entryCheckpointTrigger.reset();
    this.observationTrigger.reset();
    this.failureVolume.reset();
    this.laserPresentation.sync();
    this.art.reset();
    this.resetEndingPresentation();
  }

  dispose(): void {
    this.entryCheckpointTrigger.dispose();
    this.observationTrigger.dispose();
    this.failureVolume.dispose();
    this.art.dispose();
    this.laserPresentation.dispose();
    this.lasers.dispose();
    for (const platform of this.movingPlatforms) platform.dispose();
    this.builder.dispose();
  }

  private updateMovingPlatforms(
    deltaSeconds: number,
    persistentBodies: readonly KinematicBody[],
  ): void {
    for (const platform of this.movingPlatforms) {
      platform.update(deltaSeconds);

      if (platform.displacement.lengthSq() > 0) {
        for (const body of persistentBodies) {
          if (!body.isSupportedBy(platform.collisionMesh)) continue;
          body.applyCarrierDisplacement(
            platform.displacement,
            platform.collisionMesh,
          );
        }
      }

      if (platform.isAtEnd) platform.setActive(false);
      else if (platform.isAtStart) platform.setActive(true);
    }
  }

  private updateLaserMotions(deltaSeconds: number): void {
    this.traversalElapsedSeconds += deltaSeconds;
    this.applyLaserMotions();
  }

  private applyLaserMotions(): void {
    for (const { hazard, definition } of this.laserMotions) {
      const angle =
        definition.phaseRadians +
        (this.traversalElapsedSeconds / definition.periodSeconds) *
          Math.PI *
          2;
      const calculatedOffsetMetres =
        definition.centreOffsetMetres +
        Math.sin(angle) * definition.amplitudeMetres;
      const offsetMetres =
        Math.abs(calculatedOffsetMetres) <= MOTION_OFFSET_EPSILON_METRES
          ? 0
          : calculatedOffsetMetres;
      this.laserTranslationOffset
        .set(...definition.axis)
        .multiplyScalar(offsetMetres);
      hazard.setTranslationOffset(this.laserTranslationOffset);
    }
  }

  private buildShell(): THREE.Mesh {
    const { floor, wall, wood } = this.builder.materials;
    this.builder.addCollider({ name: 'room-5-floor', size: [40, 0.4, 34], position: [0, 74.55, 108.5], material: floor });
    this.builder.addCollider({ name: 'room-5-west-wall', size: [0.4, 26, 34], position: [-20, 87.75, 108.5], material: wall });
    this.builder.addCollider({ name: 'room-5-east-wall', size: [0.4, 26, 34], position: [20, 87.75, 108.5], material: wall });
    this.builder.addCollider({ name: 'room-5-ceiling', size: [40, 0.4, 34], position: [0, 100.75, 108.5], material: wall });

    // Front wall opening lines up with Room 4's top exit.
    this.builder.addCollider({ name: 'room-5-front-wall-west', size: [27.5, 26, 0.4], position: [-6.25, 87.75, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-5-front-wall-east', size: [9.5, 26, 0.4], position: [15.25, 87.75, 91.5], material: wall });
    this.builder.addCollider({ name: 'room-5-front-wall-above-entry', size: [3, 22, 0.4], position: [9, 89.75, 91.5], material: wall });

    // Rear wall is split around the high observation-room opening and the
    // floor-level Goop route. The door shares the sticky-panel wall plane and
    // uses the containment glass centre as its horizontal reference (x = 0).
    this.builder.addCollider({ name: 'room-5-rear-wall-west', size: [8, 26, 0.4], position: [-16, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-east-left-of-goop-door', size: [6.5, 26, 0.4], position: [-4.75, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-east-right-of-goop-door', size: [18.5, 26, 0.4], position: [10.75, 87.75, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-above-goop-door', size: [3, 21.5, 0.4], position: [0, 90, 125.5], material: wall });
    this.builder.addCollider({ name: 'room-5-rear-wall-below-observation', size: [4, 22.2, 0.4], position: [-10, 85.85, 125.5], material: wall });

    const goopWoodenDoor = this.builder.addCollider({
      name: 'room-5-goop-wooden-door',
      size: [3, 4.5, 0.3],
      position: [0, 77, 125.25],
      material: wood,
      interactionRole: 'goop-dissolvable',
      textureRole: 'wooden-door',
    });
    goopWoodenDoor.userData.soluble = true;
    goopWoodenDoor.userData.solubleId = goopWoodenDoor.name;
    goopWoodenDoor.userData.dissolveDurationSeconds = 1.8;
    goopWoodenDoor.userData.dissolveCollisionDisableProgress = 0.72;
    goopWoodenDoor.userData.dissolveActivationRangeMetres = 0.12;

    this.builder.addLight('room-5-entry-light', [9, 96, 96]);
    this.builder.addLight('room-5-containment-light', [0, 94, 110], 0xcfff70, 15, 22);
    this.builder.addLight('room-5-observation-light', [-10, 103, 129], 0x9dffc0, 13, 14);
    return goopWoodenDoor;
  }

  private buildTraversal(): void {
    const { platform, support, sticky } = this.builder.materials;

    // Latest Blender-authored Room 5 traversal.
    // Objects deleted in Blender are intentionally not rebuilt here.
    this.builder.addCollider({ name: 'room-5-lower-platform-c', size: [4.5, 0.5, 4], position: [0.084, 76.687, 102.793], material: platform });

    this.builder.addCollider({ name: 'room-5-central-rest-platform', size: [5, 0.5, 4.5], position: [-0.68, 80.832, 115.652], material: platform });
    this.builder.addCollider({ name: 'room-5-containment-route-top', size: [6, 0.5, 6], position: [0, 75.325, 110], material: support });

    this.builder.addCollider({ name: 'room-5-upper-platform-a', size: [1.849, 0.523, 2.091], position: [6.109, 82.374, 110.287], material: platform });
    this.builder.addCollider({ name: 'room-5-upper-platform-a.001', size: [1.849, 0.523, 1.921], position: [6.109, 82.374, 115.657], material: platform });
    this.builder.addCollider({ name: 'room-5-upper-platform-a.003', size: [1.849, 0.523, 2.091], position: [6.109, 82.374, 105.453], material: platform });

    // Blender Empty reference markers (not runtime geometry):
    // room-5-mp1-reference -> [10.082, 82.636, 100.036]
    // room-5-mp2-reference -> [14.976, 82.636, 107.234]
    // Runtime X/Z routes use only the requested axis from each marker.
    this.root.add(this.movingPlatformOne.root, this.movingPlatformTwo.root);
    this.collisionMeshes.push(
      this.movingPlatformOne.collisionMesh,
      this.movingPlatformTwo.collisionMesh,
    );

    // The Blender mesh is an L-shape. Keep it as two ordinary sticky box
    // colliders so the collision system treats every visible section as solid.
    this.builder.addCollider({
      name: 'room-5-east-sticky-ascent',
      size: [STICKY_WALL_THICKNESS_METRES, 18.352, 5.46],
      position: [19.72, 89.5, 107.247],
      material: sticky,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
      textureRole: 'sticky-wall-tile',
    });
    this.builder.addCollider({
      name: 'room-5-east-sticky-ascent-extension',
      size: [STICKY_WALL_THICKNESS_METRES, 3.192, 11.328],
      position: [19.72, 97.068, 115.636],
      material: sticky,
      surfaceTag: 'sticky',
      movementFaceMode: 'vertical-sides',
      textureRole: 'sticky-wall-tile',
    });

    this.builder.addCollider({ name: 'room-5-final-approach-platform', size: [4.5, 0.5, 4], position: [15.436, 93.2, 120], material: platform });

    // Keep the two edge panels and the direct middle panel from the original
    // five-panel route. The wider gaps make the laser traversal less crowded.
    for (const [panelNumber, x] of [[1, 10], [3, 2], [5, -6]] as const) {
      this.builder.addCollider({
        name: `room-5-final-sticky-transfer-${panelNumber}`,
        size: [3, 6.5, STICKY_WALL_THICKNESS_METRES],
        position: [x, 95.2, 125.18],
        material: sticky,
        surfaceTag: 'sticky',
        movementFaceMode: 'vertical-sides',
        textureRole: 'sticky-wall-tile',
      });
    }

    this.builder.addCollider({ name: 'room-5-final-bounce-platform', size: [5, 0.5, 4], position: [-9.5, 95.5, 121.5], material: platform });
  }

  private buildContainmentAndObservationRoom(): {
    readonly leverHandle: THREE.Mesh;
    readonly etch: THREE.Mesh;
  } {
    const { containment, glass, etch: etchMaterial, floor, wall, sticky } = this.builder.materials;

    // Latest Blender scene keeps the containment glass and Etch but removes
    // the old frame and sliding-door meshes.
    // The transparent enclosure is also a solid traversal object: Bob can
    // land and jump on its roof, while its sides remain ordinary blockers.
    this.builder.addCollider({ name: 'room-5-containment-glass', size: [5.1, 3.2, 4.5], position: [0, 77.075, 110], material: glass });

    const etch = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 22, 15),
      etchMaterial,
    );
    etch.name = 'room-5-contained-etch-placeholder';
    etch.position.set(0, 76.546, 110);
    etch.scale.set(1.05, 0.85, 1.05);
    this.root.add(etch);

    // Observation room remains unchanged in the Blender-authored scene.
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

    return { leverHandle, etch };
  }

  private hideGameplayColliders(): void {
    for (const [role, material] of Object.entries(this.builder.materials)) {
      material.name = `containment-room-5-${role}-collision-only`;
      material.visible = role === 'etch';
    }
    (this.goopWoodenDoor.material as THREE.Material).visible = true;
    (this.leverHandle.material as THREE.Material).visible = true;
    for (const platform of this.movingPlatforms) {
      platform.collisionMesh.material.name =
        `${platform.collisionMesh.name}-collision-only`;
      platform.collisionMesh.material.visible = false;
    }
  }


  private resetEndingPresentation(): void {
    this.endingStateValue = 'traversal';
    this.endingElapsedSeconds = 0;
    this.leverHandle.rotation.set(0, 0, 0);
    this.etchPlaceholder.position.set(0, 76.546, 110);
  }

  private createHazards(): readonly LaserHazard[] {
    return [
      new LaserHazard({
        id: 'room-5-laser-1',
        start: new THREE.Vector3(2.778, 82.84, 111.277),
        end: new THREE.Vector3(2.54, 83.031, 120.272),
      }),
      new LaserHazard({
        id: 'room-5-laser-2',
        start: new THREE.Vector3(2.912, 83.002, 102.872),
        end: new THREE.Vector3(9.312, 83.003, 102.873),
      }),
      new LaserHazard({
        id: 'room-5-laser-3',
        start: new THREE.Vector3(19.623, 85.217, 102.893),
        end: new THREE.Vector3(19.385, 85.407, 111.888),
      }),
      new LaserHazard({
        id: 'room-5-laser-4',
        start: new THREE.Vector3(19.623, 90.728, 102.893),
        end: new THREE.Vector3(19.385, 90.918, 111.888),
      }),
      new LaserHazard({
        id: 'room-5-laser-5',
        start: new THREE.Vector3(19.54, 95.323, 111.065),
        end: new THREE.Vector3(19.572, 98.88, 111.188),
      }),
      new LaserHazard({
        id: 'room-5-laser-6',
        start: new THREE.Vector3(19.231, 82.016, 107.44),
        end: new THREE.Vector3(19.263, 99.206, 107.563),
      }),
      new LaserHazard({
        id: 'room-5-laser-7',
        start: new THREE.Vector3(19.071, 95.323, 116.61),
        end: new THREE.Vector3(19.103, 98.88, 116.733),
      }),
      new LaserHazard({
        id: 'room-5-laser-8',
        start: new THREE.Vector3(-4.148, 95.2, 124.701),
        end: new THREE.Vector3(8.369, 95.198, 124.701),
      }),
    ];
  }
}
