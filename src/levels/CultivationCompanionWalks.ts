import type { CompanionId, CompanionWalk } from '../slimes/CompanionRegroup.ts';
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
  readonly groundDronesDisabled: boolean;
  readonly projectilesClear: boolean;
  readonly liftWaiting: boolean;
}

const ROOM_ONE_GOOP: CompanionWalk = {
  stepUps: [[10, .2, 43]],
  bounds: [[-15, .3, 1], [15, 1.2, ROOM_TWO + 3]],
  points: [[10, 0, 4], [10, 0, 46], [0, 0, 46], [0, 0, ROOM_TWO + 3]],
};
const ROOM_ONE_EXIT: CompanionWalk = {
  bounds: [[-15, .3, 43], [15, 1.2, ROOM_TWO + 3]],
  points: [[0, 0, 46], [0, 0, ROOM_TWO + 3]],
};
const ROOM_TWO_GOOP: CompanionWalk = {
  stepUps: [[0, .2, ROOM_TWO + 45]],
  bounds: [[-16, .3, ROOM_TWO + 1], [16, 1.2, ROOM_THREE + 3]],
  points: [[0, 0, ROOM_TWO + 4], [0, 0, ROOM_THREE + 3]],
};
// The initial shield blocks the centre lane. Goop walks around its west end;
// every subsequent centre-lane section is below the wall lasers and roof drones.
const ROOM_THREE_GOOP: CompanionWalk = {
  stepUps: [[0, .35, ROOM_THREE + 66]],
  bounds: [[-21, .3, ROOM_THREE + 1], [21, 1.3, ROOM_THREE + 74]],
  points: [[-5, 0, ROOM_THREE + 3], [-5, 0, ROOM_THREE + 11],
    [0, 0, ROOM_THREE + 11], [0, 0, ROOM_THREE + 70], [1, 0, ROOM_THREE + 74]],
};
const ELEVATOR_BOB: CompanionWalk = {
  bounds: [[-21, .3, ROOM_THREE + 66], [21, 1.3, ROOM_FOUR + 10]],
  points: [[-1, 0, ROOM_THREE + 69], [-1, 0, ROOM_FOUR + 10]],
};
const ELEVATOR_GOOP: CompanionWalk = {
  ...ELEVATOR_BOB,
  points: [[1, 0, ROOM_THREE + 69], [1, 0, ROOM_FOUR + 10]],
};

export function cultivationCompanionWalk(state: CultivationCompanionState): CompanionWalk | undefined {
  const { id, position: p, leader } = state;
  if (id === 'volt') return undefined;
  if (p.z < ROOM_TWO + 2 && leader.z >= ROOM_TWO) return id === 'goop' ? ROOM_ONE_GOOP : ROOM_ONE_EXIT;
  // Bob must continue holding the release. Once Goop passes the entry shutter,
  // he may finish the neutral corridor even if Bob releases the button.
  if (id === 'goop' && p.z >= ROOM_TWO && p.z < ROOM_THREE + 2 &&
      (state.goopPassageUnlocked || p.z > ROOM_TWO + 47)) return ROOM_TWO_GOOP;
  if (state.groundDronesDisabled && state.projectilesClear) {
    if (p.z >= ROOM_THREE + 66 && leader.z >= ROOM_THREE + 72 && state.liftWaiting) {
      return id === 'bob' ? ELEVATOR_BOB : ELEVATOR_GOOP;
    }
    if (id === 'goop' && p.z >= ROOM_THREE && leader.z >= ROOM_THREE + 66) return ROOM_THREE_GOOP;
  }
  return undefined;
}
