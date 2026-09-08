import * as THREE from 'three';
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
  readonly roomOne: LevelTwoRoomOneGreybox;
  readonly roomTwo: LevelTwoRoomTwoGreybox;
  readonly roomThree: LevelTwoRoomThreeGreybox;
  readonly roomFour = new LevelTwoRoomFourGreybox();
  readonly roomFive: LevelTwoRoomFiveGreybox;
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
    this.roomThree = new LevelTwoRoomThreeGreybox(requestFailure);
    this.roomFive = new LevelTwoRoomFiveGreybox(requestFailure);
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

  reset(): void {
    this.roomOne.reset();
    this.roomOneToTwoPassage.reset();
    this.roomTwo.reset();
    this.roomTwoToThreeGoopPassage.reset();
    this.roomThree.reset();
    this.roomFour.reset();
    this.roomFive.reset();
  }

  dispose(): void {
    this.roomFive.dispose();
    this.roomFour.dispose();
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
