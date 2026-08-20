import type { SlimeRosterState } from './SlimeManager.ts';
import type { SlimeId } from './SlimeRoster.ts';

export interface SlimePassiveInteraction {
  readonly slimeId: SlimeId;
  readonly label: string;
}

export interface SlimePlayerSwitchFeedback {
  readonly sequence: number;
  readonly previousSlimeId: SlimeId;
  readonly activeSlimeId: SlimeId;
}

/** Read-only presentation snapshot derived from the level-owned slime state. */
export interface SlimeHUDSnapshot {
  readonly roster: readonly SlimeRosterState[];
  readonly activeSlimeId: SlimeId | undefined;
  readonly passiveInteractions: readonly SlimePassiveInteraction[];
  readonly playerSwitchFeedback: SlimePlayerSwitchFeedback | undefined;
  /** One-shot presentation reset emitted by recovery/restart boundaries. */
  readonly resetSwitchFeedback: boolean;
}

export type SlimeHUDListener = (snapshot: SlimeHUDSnapshot) => void;

export const EMPTY_SLIME_HUD_SNAPSHOT: SlimeHUDSnapshot = {
  roster: [],
  activeSlimeId: undefined,
  passiveInteractions: [],
  playerSwitchFeedback: undefined,
  resetSwitchFeedback: false,
};
