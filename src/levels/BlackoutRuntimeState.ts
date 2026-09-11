import type { SlimeId } from '../slimes/SlimeRoster.ts';

export type BlackoutCheckpointId =
  | 'cp1'
  | 'cp2'
  | 'cp3'
  | 'cp4'
  | 'cp5'
  | 'cp6'
  | 'cp7'
  | 'cp8'
  | 'cp9';

export type BlackoutRoomId =
  | 'room-1'
  | 'room-2'
  | 'room-3'
  | 'room-4a'
  | 'room-4b'
  | 'ending';

export type BlackoutPhase =
  | 'three-slime'
  | 'merging'
  | 'specimen'
  | 'boss'
  | 'boss-defeated'
  | 'splitting'
  | 'escape'
  | 'complete';

export type BlackoutSlimeId = Extract<SlimeId, 'bob' | 'goop' | 'volt'>;

export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue =
  | SerializablePrimitive
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue };

export interface BlackoutRoomState {
  readonly roomId: BlackoutRoomId;
  readonly phase: BlackoutPhase;
  readonly local: Readonly<Record<string, SerializableValue>>;
}

export interface BlackoutConnectionState {
  /**
   * Live Volt tethers are intentionally transient across Retry/restart.
   * Future electrical-device participants restore authored/latched device state
   * separately while this value returns to null.
   */
  readonly voltTargetId: string | null;
}

export interface BlackoutRuntimeSnapshot {
  readonly checkpointId: BlackoutCheckpointId;
  readonly activeSlimeId: BlackoutSlimeId;
  readonly room: BlackoutRoomState;
  readonly connections: BlackoutConnectionState;
  readonly participantState: Readonly<Record<string, SerializableValue>>;
}

const LEGAL_PHASE_TRANSITIONS: Readonly<Record<BlackoutPhase, readonly BlackoutPhase[]>> = {
  'three-slime': ['merging'],
  merging: ['specimen'],
  specimen: ['boss'],
  boss: ['boss-defeated'],
  'boss-defeated': ['splitting'],
  splitting: ['escape'],
  escape: ['complete'],
  complete: [],
};

/** Deterministic phase authority shared by the merge, boss, split and ending issues. */
export class BlackoutPhaseController {
  private phaseValue: BlackoutPhase;
  private completionCommitted = false;

  constructor(initialPhase: BlackoutPhase = 'three-slime') {
    this.phaseValue = initialPhase;
    this.completionCommitted = initialPhase === 'complete';
  }

  get phase(): BlackoutPhase {
    return this.phaseValue;
  }

  get terminal(): boolean {
    return this.completionCommitted;
  }

  transition(next: BlackoutPhase): boolean {
    if (next === this.phaseValue) return true;
    if (this.completionCommitted) return false;
    if (!LEGAL_PHASE_TRANSITIONS[this.phaseValue].includes(next)) return false;
    this.phaseValue = next;
    if (next === 'complete') this.completionCommitted = true;
    return true;
  }

  restore(phase: BlackoutPhase): void {
    this.phaseValue = phase;
    this.completionCommitted = phase === 'complete';
  }
}
