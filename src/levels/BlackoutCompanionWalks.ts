import type { CompanionId, CompanionWalk } from '../slimes/CompanionRegroup.ts';

interface Position { readonly x: number; readonly y: number; readonly z: number }
export interface BlackoutCompanionState {
  readonly id: CompanionId;
  readonly position: Position;
  readonly leader: Position;
  readonly bayAvailable: boolean;
  readonly mainRouteReady: boolean;
  readonly bridgeLocked: boolean;
  readonly transitComplete: boolean;
  readonly conducting: boolean;
  readonly mounted: boolean;
}

const BAY_EXIT: CompanionWalk = {
  stepUps: [[6, .4, 80]],
  bounds: [[-15, .3, 49], [15, 1.2, 82]],
  points: [[6, 0, 51], [6, 0, 82]],
};
const VOLT_DUCT_EXIT: CompanionWalk = {
  stepUps: [[-16, 2.5, 80]],
  bounds: [[-16.3, .3, 64], [-15.7, 3.4, 82]],
  points: [[-16, 0, 64], [-16, 0, 82]],
};
const TRANSIT_EXIT: CompanionWalk = {
  bounds: [[-6, .7, 147], [13, 1.3, 180]],
  points: [[0, 0, 152], [0, 0, 180]],
};
const STAGING: CompanionWalk = {
  bounds: [[-7, .7, 174], [7, 1.3, 181]],
  points: [[0, 0, 175], [0, 0, 180]],
};

export function blackoutCompanionWalk(state: BlackoutCompanionState): CompanionWalk | undefined {
  const { id, position: p, leader } = state;
  // An inactive power connection and a parked rider are deliberate puzzle jobs.
  if (id === 'volt' && (state.conducting || state.mounted)) return undefined;
  if (state.bayAvailable && leader.z >= 55) {
    if (id !== 'volt' && p.z >= 49 && p.z < 82) return BAY_EXIT;
    // The player has already crossed the live electrical vent and its turn.
    if (id === 'volt' && state.mainRouteReady && p.z >= 64 && p.z < 82) return VOLT_DUCT_EXIT;
  }
  // Skill routes, the timed switch, combat and bridge locking stay manual.
  // Only bodies already on the shared exit deck join this walk.
  if (state.bridgeLocked && leader.z >= 153 && p.z >= 147 && p.z < 180) return TRANSIT_EXIT;
  if (state.transitComplete && leader.z >= 177 && p.z >= 174) return STAGING;
  return undefined;
}
