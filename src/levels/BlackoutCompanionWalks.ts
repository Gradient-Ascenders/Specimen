import type { CompanionId, CompanionWalk } from '../slimes/CompanionRegroup.ts';
import type { CompanionWaitReason } from '../slimes/SlimeHUDState.ts';

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
  readonly party?: readonly { readonly position: Position }[];
  readonly committedRoute?: string;
}

const BAY_EXIT: CompanionWalk = {
  id: 'blackout-bay-exit', finishPassage: true, slimes: ['bob', 'goop'], widthMetres: 2,
  stepUps: [[6, .4, 80]],
  bounds: [[-15, .3, 49], [15, 1.2, 82]],
  points: [[6, 0, 51], [6, 0, 58], [6, 0, 70], [6, 0, 82]],
  alternatives: [
    { widthMetres: 1.5, points: [[6, 0, 58], [4.5, 0, 58], [4.5, 0, 70], [6, 0, 70]] },
    { widthMetres: 1.5, points: [[6, 0, 58], [7.5, 0, 58], [7.5, 0, 70], [6, 0, 70]] },
  ],
};
const VOLT_DUCT_EXIT: CompanionWalk = {
  id: 'blackout-volt-duct', finishPassage: true, slimes: ['volt'], widthMetres: 1.5,
  stepUps: [[-16, 2.5, 80]],
  bounds: [[-16.3, .3, 64], [-15.7, 3.4, 82]],
  points: [[-16, 0, 64], [-16, 0, 82]],
};
const TRANSIT_EXIT: CompanionWalk = {
  id: 'blackout-transit-exit', finishPassage: true, widthMetres: 2,
  bounds: [[-6, .7, 147], [13, 1.3, 180]],
  points: [[0, 0, 152], [0, 0, 158], [0, 0, 174], [0, 0, 180]],
  alternatives: [
    { widthMetres: 1.5, points: [[0, 0, 158], [-1.5, 0, 158], [-1.5, 0, 174], [0, 0, 174]] },
    { widthMetres: 1.5, points: [[0, 0, 158], [1.5, 0, 158], [1.5, 0, 174], [0, 0, 174]] },
  ],
};
const STAGING: CompanionWalk = {
  id: 'blackout-staging', finishPassage: true, widthMetres: 2,
  bounds: [[-7, .7, 174], [7, 1.3, 181]],
  points: [[0, 0, 175], [0, 0, 180]],
};

function partyAt(state: BlackoutCompanionState, minZ: number, maxZ: number, minX: number, maxX: number,
  maxY: number, minY = .3): boolean {
  if (!state.party) return state.leader.z >= minZ;
  for (const {position: q} of state.party) {
    if (q !== state.position && q.z >= minZ && q.z <= maxZ && q.x >= minX && q.x <= maxX &&
      q.y >= minY && q.y <= maxY) return true;
  }
  return false;
}

export function blackoutCompanionWalk(state: BlackoutCompanionState): CompanionWalk | undefined {
  const { id, position: p } = state;
  // Shared progress is established inside the matching safe corridor, never by a distant body's world Z.
  // An inactive power connection and a parked rider are deliberate puzzle jobs.
  if (id === 'volt' && (state.conducting || state.mounted)) return undefined;
  if (state.bayAvailable && (state.mainRouteReady || partyAt(state, 55, 86, 3, 9, 1.5) ||
    partyAt(state, 80, 156, -22, 22, 22, -1) || state.committedRoute === BAY_EXIT.id ||
    state.committedRoute === VOLT_DUCT_EXIT.id)) {
    if (id !== 'volt' && p.z >= 49 && p.z < 82) return BAY_EXIT;
    // The player has already crossed the live electrical vent and its turn.
    if (id === 'volt' && state.mainRouteReady && p.z >= 64 && p.z < 82) return VOLT_DUCT_EXIT;
  }
  // Skill routes, the timed switch, combat and bridge locking stay manual.
  // Only bodies already on the shared exit deck join this walk.
  if (state.bridgeLocked && (partyAt(state, 153, 181, -6, 13, 1.5) || state.committedRoute === TRANSIT_EXIT.id) &&
    p.z >= 147 && p.z < 180 && (p.y <= 1.4 || state.committedRoute === TRANSIT_EXIT.id)) return TRANSIT_EXIT;
  if (state.transitComplete && (partyAt(state, 177, 190, -7, 7, 1.5) || state.committedRoute === STAGING.id) && p.z >= 174) return STAGING;
  return undefined;
}

export function blackoutCompanionWaitingReason(state: BlackoutCompanionState): CompanionWaitReason | undefined {
  const p = state.position;
  if (state.id === 'volt' && state.bayAvailable && state.mainRouteReady && p.z >= 54 && p.z < 64) return 'manual';
  if (state.bridgeLocked && p.z >= 80 && (p.z < 147 || p.y > 1.4) &&
    partyAt(state, 153, 181, -6, 13, 1.5)) return 'manual';
  return undefined;
}
