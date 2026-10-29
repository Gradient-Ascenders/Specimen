import type { CompanionId, CompanionWalk } from '../slimes/CompanionRegroup.ts';
import type { CompanionWaitReason } from '../slimes/SlimeHUDState.ts';
import {
  LEVEL_TWO_ROOM_TWO_OFFSET_Z as ROOM_TWO,
  LEVEL_TWO_ROOM_THREE_OFFSET_Z as ROOM_THREE,
  LEVEL_TWO_ROOM_FOUR_OFFSET_Z as ROOM_FOUR,
} from './LevelTwoPreviewScene.ts';

interface Position { readonly x: number; readonly y: number; readonly z: number }
export interface CultivationCompanionState {
  readonly id: CompanionId;
  /** Positions relative to the complete authored scene, including room offsets. */
  readonly position: Position;
  readonly leader: Position;
  readonly goopPassageUnlocked: boolean;
  readonly roomTwoPlatformsReady: boolean;
  readonly groundDronesDisabled: boolean;
  readonly projectilesClear: boolean;
  readonly liftWaiting: boolean;
  readonly committedRoute?: string;
}

const ROOM_ONE_GOOP: CompanionWalk = {
  id: 'cultivation-lab-exit', finishPassage: true, slimes: ['goop'], widthMetres: 2,
  stepUps: [[10, .2, 43]],
  bounds: [[-15, .3, 1], [15, 1.2, ROOM_TWO + 3]],
  points: [[10, 0, 4], [10, 0, 12], [10, 0, 38], [10, 0, 46], [0, 0, 46], [0, 0, ROOM_TWO + 3]],
  alternatives: [{ slimes: ['goop'], widthMetres: 2,
    points: [[10, 0, 12], [7, 0, 12], [7, 0, 38], [10, 0, 38]] }],
};
const ROOM_ONE_EXIT: CompanionWalk = {
  id: 'cultivation-lab-apron', finishPassage: true, widthMetres: 2,
  bounds: [[-15, .3, 43], [15, 1.2, ROOM_TWO + 3]],
  points: [[0, 0, 46], [0, 0, ROOM_TWO + 3]],
};
const ROOM_TWO_GOOP: CompanionWalk = {
  id: 'cultivation-released-passage', finishPassage: true, slimes: ['goop'], widthMetres: 1.8,
  stepUps: [[0, .2, ROOM_TWO + 45]],
  bounds: [[-16, .3, ROOM_TWO + 1], [16, 1.2, ROOM_THREE + 3]],
  points: [[0, 0, ROOM_TWO + 4], [0, 0, ROOM_THREE + 3]],
};
// The initial shield blocks the centre lane. Goop walks around its west end;
// every subsequent centre-lane section is below the wall lasers and roof drones.
const ROOM_THREE_GOOP: CompanionWalk = {
  id: 'cultivation-cleared-combat', finishPassage: true, slimes: ['goop'], widthMetres: 1.8,
  stepUps: [[0, .35, ROOM_THREE + 66]],
  bounds: [[-21, .3, ROOM_THREE + 1], [21, 1.3, ROOM_THREE + 74]],
  points: [[0, 0, ROOM_THREE + 3], [-5, 0, ROOM_THREE + 3], [-5, 0, ROOM_THREE + 11],
    [0, 0, ROOM_THREE + 11], [0, 0, ROOM_THREE + 70], [1, 0, ROOM_THREE + 74]],
  // Both ends of the eight-metre spawn shield have a safe lower-floor route.
  alternatives: [{ slimes: ['goop'], widthMetres: 1.8, points: [[0, 0, ROOM_THREE + 3],
    [5, 0, ROOM_THREE + 3], [5, 0, ROOM_THREE + 11], [0, 0, ROOM_THREE + 11]] }],
};
const ELEVATOR_BOB: CompanionWalk = {
  id: 'cultivation-lift-bob', finishPassage: true, widthMetres: 1.5,
  bounds: [[-21, .3, ROOM_THREE + 66], [21, 1.3, ROOM_FOUR + 10]],
  points: [[-1, 0, ROOM_THREE + 69], [-1, 0, ROOM_FOUR + 10]],
};
const ELEVATOR_GOOP: CompanionWalk = {
  ...ELEVATOR_BOB,
  id: 'cultivation-lift-goop',
  points: [[1, 0, ROOM_THREE + 69], [1, 0, ROOM_FOUR + 10]],
};

export function cultivationCompanionWalk(state: CultivationCompanionState): CompanionWalk | undefined {
  const { id, position: p, leader } = state;
  if (id === 'volt') return undefined;
  if (p.z < ROOM_TWO + 2 && (leader.z >= ROOM_TWO || state.committedRoute === ROOM_ONE_GOOP.id ||
    state.committedRoute === ROOM_ONE_EXIT.id)) return id === 'goop' ? ROOM_ONE_GOOP : ROOM_ONE_EXIT;
  // Goop must finish lowering every platform Bob needs before leaving this room.
  // Once past the entry shutter he can finish the corridor after Bob releases the button.
  if (id === 'goop' && p.z >= ROOM_TWO && p.z < ROOM_THREE + 2 &&
      state.roomTwoPlatformsReady && (state.goopPassageUnlocked || p.z > ROOM_TWO + 47)) return ROOM_TWO_GOOP;
  if (state.groundDronesDisabled && state.projectilesClear) {
    if (p.z >= ROOM_THREE + 66 && (leader.z >= ROOM_THREE + 72 || state.committedRoute === ELEVATOR_BOB.id ||
      state.committedRoute === ELEVATOR_GOOP.id) && state.liftWaiting) {
      return id === 'bob' ? ELEVATOR_BOB : ELEVATOR_GOOP;
    }
    if (id === 'goop' && p.z >= ROOM_THREE && (leader.z >= ROOM_THREE + 66 ||
      state.committedRoute === ROOM_THREE_GOOP.id)) return ROOM_THREE_GOOP;
  }
  return undefined;
}

export function cultivationCompanionWaitingReason(state: CultivationCompanionState): CompanionWaitReason | undefined {
  if (state.id !== 'goop') return undefined;
  const z = state.position.z;
  if (z >= ROOM_TWO && z < ROOM_THREE + 2 && !state.roomTwoPlatformsReady) return 'platforms';
  if (z >= ROOM_TWO && z <= ROOM_TWO + 47 && !state.goopPassageUnlocked) return 'door';
  if (z >= ROOM_THREE && z < ROOM_THREE + 74 && state.leader.z >= ROOM_THREE + 66 &&
    (!state.groundDronesDisabled || !state.projectilesClear)) return 'combat';
  return undefined;
}
