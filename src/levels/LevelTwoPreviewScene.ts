import { CultivationSurfaceCleanup } from '../render/environment/cultivation/CultivationSurfaceCleanup.ts';
import { CultivationContaminationArt } from '../render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationMaintenanceArt } from '../render/environment/cultivation/CultivationMaintenanceArt.ts';
import { CultivationElevatorArt } from '../render/environment/cultivation/CultivationElevatorArt.ts';
import { AcidLiquidInteractions, type AcidContactBody } from '../render/environment/containment/AcidLiquidInteractions.ts';
import { CultivationCoverEquipmentArt } from '../render/environment/cultivation/CultivationCoverEquipmentArt.ts';
import { CultivationChamberMaterials } from '../render/environment/cultivation/CultivationChamberMaterials.ts';
import * as THREE from 'three';
import { CultivationLabMaterials } from '../render/environment/cultivation/CultivationLabMaterials.ts';
import { LevelTwoRoomFourGreybox } from './LevelTwoRoomFourGreybox.ts';
import { LevelTwoRoomFiveGreybox } from './LevelTwoRoomFiveGreybox.ts';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import {
  LEVEL_TWO_BOB_AIR_DUCT_LAYOUT,
  LevelTwoAirDuctGreybox,
} from './LevelTwoAirDuctGreybox.ts';
import { LevelTwoLabPassageGreybox } from './LevelTwoLabPassageGreybox.ts';
import {
  LEVEL_TWO_ROOM_ONE_BOB_SPAWN,
  LEVEL_TWO_ROOM_ONE_GOOP_SPAWN,
  LevelTwoRoomOneGreybox,
  type LevelTwoRoomOneHazardFailure,
} from './LevelTwoRoomOneGreybox.ts';
import {
  LEVEL_TWO_ROOM_TWO_BOB_SPAWN,
  LEVEL_TWO_ROOM_TWO_GOOP_SPAWN,
  LevelTwoRoomTwoGreybox,
  type LevelTwoRoomTwoHazardFailure,
  type LevelTwoRoomTwoOccupant,
} from './LevelTwoRoomTwoGreybox.ts';
import {
  LEVEL_TWO_ROOM_THREE_BOB_SPAWN,
  LEVEL_TWO_ROOM_THREE_GOOP_SPAWN,
  LevelTwoRoomThreeGreybox,
  type LevelTwoRoomThreeHazardFailure,
} from './LevelTwoRoomThreeGreybox.ts';

export type LevelTwoAuthoredRoomId = 1 | 2 | 3 | 4 | 5;
export type LevelTwoPreviewSlimeId = 'bob' | 'goop';

export const LEVEL_TWO_PREVIEW_WORLD_OFFSET_X = 64;
export const LEVEL_TWO_PASSAGE_LENGTH_METRES = 28;
export const LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z = 50;
export const LEVEL_TWO_ROOM_TWO_OFFSET_Z =
  LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z +
  LEVEL_TWO_PASSAGE_LENGTH_METRES;
export const LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z =
  LEVEL_TWO_ROOM_TWO_OFFSET_Z + 45;
export const LEVEL_TWO_ROOM_THREE_OFFSET_Z =
  LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z +
  LEVEL_TWO_PASSAGE_LENGTH_METRES;
export const LEVEL_TWO_ROOM_FOUR_OFFSET_Z = LEVEL_TWO_ROOM_THREE_OFFSET_Z + 76;
export const LEVEL_TWO_ROOM_FIVE_OFFSET_Z = LEVEL_TWO_ROOM_FOUR_OFFSET_Z + 15;

export type LevelTwoPreviewHazardFailure =
  | LevelTwoRoomOneHazardFailure
  | LevelTwoRoomTwoHazardFailure
  | LevelTwoRoomThreeHazardFailure
  | { roomId: 5; slimeId: 'bob' | 'goop'; reason: 'radiation' };

export const CULTIVATION_ROOM_OBJECTIVES: Readonly<
  Record<LevelTwoAuthoredRoomId, string>
> = {
  1: 'Help Bob reach Room 2',
  2: 'Get Bob and Goop into Room 3',
  3: 'Get bob to the other side to push the drones into the acid',
  4: 'Get Bob and Goop onto the elevator',
  5: 'Rescue Volt',
};

const ROOM_OFFSETS: Readonly<Record<LevelTwoAuthoredRoomId, THREE.Vector3>> = {
  1: new THREE.Vector3(0, 0, 0),
  2: new THREE.Vector3(0, 0, LEVEL_TWO_ROOM_TWO_OFFSET_Z),
  3: new THREE.Vector3(0, 0, LEVEL_TWO_ROOM_THREE_OFFSET_Z),
  4: new THREE.Vector3(0, 0, LEVEL_TWO_ROOM_FOUR_OFFSET_Z),
  5: new THREE.Vector3(0, 0, LEVEL_TWO_ROOM_FIVE_OFFSET_Z),
};

const ROOM_SPAWNS: Readonly<
  Record<LevelTwoAuthoredRoomId, Readonly<Record<LevelTwoPreviewSlimeId, THREE.Vector3>>>
> = {
  1: {
    bob: LEVEL_TWO_ROOM_ONE_BOB_SPAWN,
    goop: LEVEL_TWO_ROOM_ONE_GOOP_SPAWN,
  },
  2: {
    bob: LEVEL_TWO_ROOM_TWO_BOB_SPAWN,
    goop: LEVEL_TWO_ROOM_TWO_GOOP_SPAWN,
  },
  3: {
    bob: LEVEL_TWO_ROOM_THREE_BOB_SPAWN,
    goop: LEVEL_TWO_ROOM_THREE_GOOP_SPAWN,
  },
  4: { bob: new THREE.Vector3(-1, .66, 2), goop: new THREE.Vector3(1, .66, 2) },
  5: { bob: new THREE.Vector3(-1, .86, 9.1), goop: new THREE.Vector3(1, .86, 9.1) },
};

/** Development-only composition of the three currently authored Cultivation rooms. */
export class LevelTwoPreviewScene {
  readonly root = new THREE.Group();
  readonly acidInteractions: readonly AcidLiquidInteractions[];
  readonly labArt = new CultivationLabMaterials();
  readonly contaminationArt = new CultivationContaminationArt(this.labArt);
  readonly coverArt = new CultivationCoverEquipmentArt(this.labArt.platform);
  readonly chamberArt = new CultivationChamberMaterials();
  readonly roomOne: LevelTwoRoomOneGreybox;
  readonly roomTwo: LevelTwoRoomTwoGreybox;
  readonly roomThree: LevelTwoRoomThreeGreybox;
  readonly roomFour = new LevelTwoRoomFourGreybox();
  readonly roomFive: LevelTwoRoomFiveGreybox;
  readonly maintenanceArt: CultivationMaintenanceArt;
  readonly elevatorArt: CultivationElevatorArt;
  readonly surfaceCleanup: CultivationSurfaceCleanup;
  readonly roomOneToTwoPassage = new LevelTwoLabPassageGreybox({
    id: 'cultivation-room-1-to-2-lab-passage',
    fromRoomId: 1,
    toRoomId: 2,
    widthMetres: 8,
    heightMetres: 6.5,
    lengthMetres: LEVEL_TWO_PASSAGE_LENGTH_METRES,
    doorwayWidthMetres: 4,
    doorwayHeightMetres: 4.6,
    routeOwner: 'both',
  });
  readonly roomTwoToThreeGoopPassage = new LevelTwoLabPassageGreybox({
    id: 'cultivation-room-2-to-3-goop-lab-passage',
    fromRoomId: 2,
    toRoomId: 3,
    widthMetres: 7,
    heightMetres: 6.5,
    lengthMetres: LEVEL_TWO_PASSAGE_LENGTH_METRES,
    doorwayWidthMetres: 4,
    doorwayHeightMetres: 4.6,
    entryInitiallyLocked: true,
    routeOwner: 'goop',
  });
  readonly roomTwoToThreeBobAirDuct = new LevelTwoAirDuctGreybox({
    id: 'cultivation-room-2-to-3-bob-air-duct',
    fromRoomId: 2,
    toRoomId: 3,
    innerWidthMetres: LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.innerWidthMetres,
    innerHeightMetres: LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.innerHeightMetres,
    lengthMetres: LEVEL_TWO_PASSAGE_LENGTH_METRES,
    stickyEntryLengthMetres: 1.5,
  });
  private readonly roomResolverPosition = new THREE.Vector3();

  constructor(
    requestFailure: (failure: LevelTwoPreviewHazardFailure) => void,
  ) {
    this.root.name = 'cultivation-level-2-authored-preview';
    this.root.position.x = LEVEL_TWO_PREVIEW_WORLD_OFFSET_X;
    this.root.userData.developmentOnly = true;

    this.roomOne = new LevelTwoRoomOneGreybox(requestFailure);
    this.roomTwo = new LevelTwoRoomTwoGreybox(
      requestFailure,
      this.roomTwoToThreeGoopPassage.entryDoor,
    );
    this.roomThree = new LevelTwoRoomThreeGreybox(requestFailure, builder => {
      this.labArt.dress(builder, [
        'cultivation-room-3-above-bob-vent',
        'cultivation-room-3-bob-vent-west-jamb',
        'cultivation-room-3-bob-vent-east-jamb',
      ], new Map([...this.contaminationArt.overrides(builder), ...this.chamberArt.overrides(builder, this.labArt), ...this.coverArt.overrides()]));
      this.coverArt.build(builder);
    });
    this.labArt.addFixtures(this.roomThree.root, 48, 30, 72, {
      fillHeightMetres: 16, fillPositionsZ: [18, 54],
    });
    this.chamberArt.addBoundary(this.roomThree.root);
    this.labArt.dress(this.roomOne.builder, [], this.contaminationArt.overrides(this.roomOne.builder));
    this.labArt.dress(this.roomOneToTwoPassage.builder);
    this.labArt.addFixtures(this.roomOne.root, 36, 20, 50, { ceilingOpening: [-12, -8, 2, 6] });
    this.labArt.addFixtures(this.roomOneToTwoPassage.root, 8, 6.5, 28);
    this.labArt.dress(this.roomTwo.builder, [
      'cultivation-room-2-above-bob-vent',
      'cultivation-room-2-bob-vent-west-jamb',
      'cultivation-room-2-bob-vent-east-jamb',
    ], this.contaminationArt.overrides(this.roomTwo.builder));
    this.labArt.dress(this.roomTwoToThreeGoopPassage.builder);
    this.labArt.dress(this.roomTwoToThreeBobAirDuct.builder);
    this.labArt.addFixtures(this.roomTwo.root, 38, 24, 45, {
      wallSides: [1],
      fillHeightMetres: 14,
      fillPositionsZ: [12, 34],
    });
    this.labArt.addFixtures(this.roomTwoToThreeGoopPassage.root, 7, 6.5, 28);
    this.contaminationArt.addRoom(this.roomOne.root, 1, this.chamberArt.warning);
    this.contaminationArt.addRoom(this.roomTwo.root, 2, this.chamberArt.warning);
    this.contaminationArt.addRoom(this.roomThree.root, 3, this.chamberArt.warning);
    this.roomFive = new LevelTwoRoomFiveGreybox(requestFailure);
    this.maintenanceArt = new CultivationMaintenanceArt(this.roomFive, this.labArt);
    this.elevatorArt = new CultivationElevatorArt(this.roomFour, this.labArt, this.chamberArt);
    this.roomOneToTwoPassage.root.position.z =
      LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z;
    this.roomTwo.root.position.z = LEVEL_TWO_ROOM_TWO_OFFSET_Z;
    this.roomTwoToThreeGoopPassage.root.position.z =
      LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z;
    this.roomTwoToThreeBobAirDuct.root.position.set(
      LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.centreXMetres,
      LEVEL_TWO_BOB_AIR_DUCT_LAYOUT.floorYMetres,
      LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z,
    );
    this.roomThree.root.position.z = LEVEL_TWO_ROOM_THREE_OFFSET_Z;
    this.roomFour.root.position.z = LEVEL_TWO_ROOM_FOUR_OFFSET_Z;
    this.roomFive.root.position.z = LEVEL_TWO_ROOM_FIVE_OFFSET_Z;
    this.root.add(
      this.roomOne.root,
      this.roomOneToTwoPassage.root,
      this.roomTwo.root,
      this.roomTwoToThreeGoopPassage.root,
      this.roomTwoToThreeBobAirDuct.root,
      this.roomThree.root,
      this.roomFour.root,
      this.roomFive.root,
    );
    this.surfaceCleanup = new CultivationSurfaceCleanup(this);
    // Cache world-space bounds only after all authored room offsets are applied.
    this.acidInteractions = [this.roomOne.radiationHazard.mesh, this.roomTwo.radiationHazard.mesh, this.roomThree.radiationHazard.mesh, ...this.maintenanceArt.acidSurfaces].map(
      surface => new AcidLiquidInteractions(this.labArt.acid, surface),
    );
  }

  get collisionMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.roomOne.collisionMeshes,
      ...this.roomOneToTwoPassage.collisionMeshes,
      ...this.roomTwo.collisionMeshes,
      ...this.roomTwoToThreeGoopPassage.collisionMeshes,
      ...this.roomTwoToThreeBobAirDuct.collisionMeshes,
      ...this.roomThree.collisionMeshes,
      ...this.roomFour.collisionMeshes,
      ...this.roomFive.collisionMeshes,
    ];
  }

  /** Colliders whose authored gameplay transform changes after registration. */
  get dynamicCollisionMeshes(): readonly THREE.Mesh[] {
    const wallRoots = new Set<THREE.Object3D>(this.roomThree.wallDrops.map(drop => drop.mesh));
    const movingWallColliders = this.roomThree.collisionMeshes.filter(mesh => {
      for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
        if (wallRoots.has(ancestor)) return true;
      }
      return false;
    });
    return [
      ...this.roomFive.dynamicCollisionMeshes,
      ...this.roomOne.platformDrops.map((drop) => drop.mesh),
      this.roomFour.entrance.collisionMesh, this.roomFour.boardingWall, this.roomFour.arrivalWall, this.roomFour.shield,
      ...this.roomFour.movingEntranceMeshes,
      ...this.roomTwo.blockDrops.map((drop) => drop.mesh),
      ...movingWallColliders,
      ...this.roomOneToTwoPassage.doors.map((door) => door.collisionMesh),
      ...this.roomTwoToThreeGoopPassage.doors.map(
        (door) => door.collisionMesh,
      ),
    ];
  }

  get solubleTargetMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.roomOne.solubleTargetMeshes,
      ...this.roomTwo.solubleTargetMeshes,
      ...this.roomThree.solubleTargetMeshes,
      ...this.roomFour.solubleTargetMeshes,
      ...this.roomFive.solubleTargetMeshes,
    ];
  }

  bindDissolveTargets(targets: readonly DissolveTarget[]): void {
    this.roomOne.bindDissolveTargets(targets);
    this.roomTwo.bindDissolveTargets(targets);
    this.roomThree.bindDissolveTargets(targets);
    this.roomFive.bindDissolveTargets(targets);
  }

  copyRoomSpawnPosition(
    roomId: LevelTwoAuthoredRoomId,
    slimeId: LevelTwoPreviewSlimeId,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return target
      .copy(ROOM_SPAWNS[roomId][slimeId])
      .add(ROOM_OFFSETS[roomId])
      .add(this.root.position);
  }

  resolveRoomId(position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }): LevelTwoAuthoredRoomId {
    this.roomResolverPosition.set(position.x, position.y, position.z);
    this.root.worldToLocal(this.roomResolverPosition);
    if (this.roomResolverPosition.z >= LEVEL_TWO_ROOM_FIVE_OFFSET_Z) return 5;
    if (this.roomResolverPosition.z >= LEVEL_TWO_ROOM_FOUR_OFFSET_Z) return 4;
    if (this.roomResolverPosition.z >= LEVEL_TWO_ROOM_THREE_OFFSET_Z) return 3;
    // The final duct section belongs to Room 3's protected arrival
    // checkpoint. Do not classify the ground-level Goop passage as Room 3 yet.
    const duct = LEVEL_TWO_BOB_AIR_DUCT_LAYOUT;
    if (
      this.roomResolverPosition.z >= LEVEL_TWO_ROOM_THREE_OFFSET_Z - 4 &&
      Math.abs(this.roomResolverPosition.x - duct.centreXMetres) <= duct.innerWidthMetres / 2 &&
      this.roomResolverPosition.y >= duct.floorYMetres &&
      this.roomResolverPosition.y <= duct.floorYMetres + duct.innerHeightMetres
    ) return 3;
    if (this.roomResolverPosition.z >= LEVEL_TWO_ROOM_TWO_OFFSET_Z) return 2;
    return 1;
  }

  update(
    deltaSeconds: number,
    roomId: LevelTwoAuthoredRoomId,
    occupants: readonly LevelTwoRoomTwoOccupant[],
    goopBody?: KinematicBody,
  ): void {
    this.labArt.acid.update(deltaSeconds);
    this.roomOne.updateRadiation(occupants);
    this.roomTwo.updateRadiation(occupants);
    this.roomThree.updateRadiation(occupants);

    this.roomOne.update(deltaSeconds, goopBody);
    let roomTwoOccupied = roomId === 2;
    let roomThreeOccupied = roomId === 3;
    for (const occupant of occupants) {
      const occupiedRoomId = this.resolveRoomId(occupant.position);
      roomTwoOccupied ||= occupiedRoomId === 2;
      roomThreeOccupied ||= occupiedRoomId === 3;
    }
    if (roomTwoOccupied) {
      this.roomTwo.update(deltaSeconds, occupants);
    }
    if (roomThreeOccupied) {
      this.roomThree.update(deltaSeconds, occupants);
    }

    this.roomOneToTwoPassage.update(deltaSeconds, occupants);
    this.roomTwoToThreeGoopPassage.update(deltaSeconds, occupants);
    this.roomFour.update(deltaSeconds, occupants);
    this.roomFive.update(deltaSeconds, occupants);
  }

  /** Render scope only: collider mesh visibility and all simulation ownership stay intact. */
  updatePresentationVisibility(cameraPosition: { readonly z: number }, activePosition: { readonly z: number }): void {
    const cameraZ = cameraPosition.z - this.root.position.z;
    const bodyZ = activePosition.z - this.root.position.z;
    const nearZ = Math.min(cameraZ, bodyZ), farZ = Math.max(cameraZ, bodyZ);
    // Keep both ends of each 28m passage loaded throughout its approach/traversal.
    // The 12m overlap exceeds the normal camera orbit and prevents doorway popping.
    const onLift = bodyZ >= LEVEL_TWO_ROOM_FOUR_OFFSET_Z && bodyZ < LEVEL_TWO_ROOM_FIVE_OFFSET_Z;
    const departed = onLift && this.roomFour.controller.boardingConfirmed;
    this.roomOne.root.visible = nearZ <= LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z + 12;
    this.roomOneToTwoPassage.root.visible = nearZ <= LEVEL_TWO_ROOM_TWO_OFFSET_Z + 12;
    this.roomTwo.root.visible = farZ >= LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z - 12 && nearZ <= LEVEL_TWO_ROOM_THREE_OFFSET_Z + 12;
    const secondPassage = this.roomTwo.root.visible || (farZ >= LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z - 12 && nearZ <= LEVEL_TWO_ROOM_THREE_OFFSET_Z + 12);
    this.roomTwoToThreeGoopPassage.root.visible = secondPassage;
    this.roomTwoToThreeBobAirDuct.root.visible = secondPassage;
    this.roomThree.root.visible = !departed && farZ >= LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z - 12 && nearZ <= LEVEL_TWO_ROOM_FOUR_OFFSET_Z + 12;
    this.roomFour.root.visible = farZ >= LEVEL_TWO_ROOM_FOUR_OFFSET_Z - 12 && nearZ <= LEVEL_TWO_ROOM_FIVE_OFFSET_Z + 12;
    // The closed lift vent occludes the entire lower sector during descent.
    this.roomFive.root.visible = bodyZ >= LEVEL_TWO_ROOM_FIVE_OFFSET_Z || cameraZ >= LEVEL_TWO_ROOM_FIVE_OFFSET_Z ||
      (this.roomFour.controller.readModel.state === 'complete' && farZ >= LEVEL_TWO_ROOM_FIVE_OFFSET_Z - 12);
  }

  updateAcidInteractions(deltaSeconds: number, bodies: readonly AcidContactBody[]): void {
    for (const interactions of this.acidInteractions) interactions.update(deltaSeconds, bodies);
  }

  reset(): void {
    for (const interactions of this.acidInteractions) interactions.reset();
    this.roomOne.reset();
    this.roomOneToTwoPassage.reset();
    this.roomTwo.reset();
    this.roomTwoToThreeGoopPassage.reset();
    this.roomThree.reset();
    this.roomFour.reset();
    this.roomFive.reset();
  }

  dispose(): void {
    this.surfaceCleanup.dispose();
    this.maintenanceArt.dispose();
    this.elevatorArt.dispose();
    this.labArt.dispose();
    this.contaminationArt.dispose();
    this.roomFive.dispose();
    this.roomFour.dispose();
    this.chamberArt.dispose();
    this.coverArt.dispose();
    this.roomThree.dispose();
    this.roomTwoToThreeBobAirDuct.dispose();
    this.roomTwoToThreeGoopPassage.dispose();
    this.roomTwo.dispose();
    this.roomOneToTwoPassage.dispose();
    this.roomOne.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
