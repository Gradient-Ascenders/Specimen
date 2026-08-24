import * as THREE from 'three';

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

export type LevelTwoAuthoredRoomId = 1 | 2 | 3;
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

export type LevelTwoPreviewHazardFailure =
  | LevelTwoRoomOneHazardFailure
  | LevelTwoRoomTwoHazardFailure
  | LevelTwoRoomThreeHazardFailure;

export const CULTIVATION_ROOM_OBJECTIVES: Readonly<
  Record<LevelTwoAuthoredRoomId, string>
> = {
  1: 'Help Bob reach Room 2',
  2: 'Get Bob and Goop into Room 3',
  3: 'Disable four drones and bring both slimes to their exits',
};

const ROOM_OFFSETS: Readonly<Record<LevelTwoAuthoredRoomId, THREE.Vector3>> = {
  1: new THREE.Vector3(0, 0, 0),
  2: new THREE.Vector3(0, 0, LEVEL_TWO_ROOM_TWO_OFFSET_Z),
  3: new THREE.Vector3(0, 0, LEVEL_TWO_ROOM_THREE_OFFSET_Z),
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
};

/** Development-only composition of the three currently authored Cultivation rooms. */
export class LevelTwoPreviewScene {
  readonly root = new THREE.Group();
  readonly roomOne: LevelTwoRoomOneGreybox;
  readonly roomTwo: LevelTwoRoomTwoGreybox;
  readonly roomThree: LevelTwoRoomThreeGreybox;
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
    this.root.add(
      this.roomOne.root,
      this.roomOneToTwoPassage.root,
      this.roomTwo.root,
      this.roomTwoToThreeGoopPassage.root,
      this.roomTwoToThreeBobAirDuct.root,
      this.roomThree.root,
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
    ];
  }

  get solubleTargetMeshes(): readonly THREE.Mesh[] {
    return [
      ...this.roomOne.solubleTargetMeshes,
      ...this.roomTwo.solubleTargetMeshes,
      ...this.roomThree.solubleTargetMeshes,
    ];
  }

  bindDissolveTargets(targets: readonly DissolveTarget[]): void {
    this.roomOne.bindDissolveTargets(targets);
    this.roomTwo.bindDissolveTargets(targets);
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
    if (this.roomResolverPosition.z >= LEVEL_TWO_ROOM_THREE_OFFSET_Z) return 3;
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
  }

  reset(): void {
    this.roomOne.reset();
    this.roomOneToTwoPassage.reset();
    this.roomTwo.reset();
    this.roomTwoToThreeGoopPassage.reset();
    this.roomThree.reset();
  }

  dispose(): void {
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
