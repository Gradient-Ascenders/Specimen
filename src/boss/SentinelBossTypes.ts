import type { EventBus } from '../core/EventBus.ts';

export type SentinelBossState =
  | 'idle'
  | 'intro'
  | 'phase-1'
  | 'vulnerable-1'
  | 'phase-2'
  | 'vulnerable-2'
  | 'phase-3'
  | 'vulnerable-3'
  | 'final-vulnerable'
  | 'defeated';

export type SentinelAttackStage =
  | 'idle'
  | 'telegraph'
  | 'active'
  | 'recovery'
  | 'complete';

export type SentinelAttackCancelReason =
  | 'death'
  | 'reset'
  | 'phase-change'
  | 'defeat'
  | 'dispose';

export interface SentinelSpecimenTarget {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly previousPosition: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
}

export interface SentinelAttackContext {
  readonly specimen: SentinelSpecimenTarget;
  requestFailure(): boolean;
}

export interface SentinelAttackReadModel {
  readonly id: string;
  readonly stage: SentinelAttackStage;
  readonly stageProgress: number;
  readonly elapsedSeconds: number;
}

export interface SentinelAttackEvents {
  stageChanged: {
    readonly attackId: string;
    readonly previousStage: SentinelAttackStage;
    readonly stage: SentinelAttackStage;
  };
}

export interface SentinelAttack {
  readonly id: string;
  readonly readModel: SentinelAttackReadModel;
  readonly events: Pick<EventBus<SentinelAttackEvents>, 'on'>;
  readonly isComplete: boolean;

  start(context: SentinelAttackContext): void;
  update(deltaSeconds: number, context: SentinelAttackContext): void;
  cancel(reason: SentinelAttackCancelReason): void;
  reset(): void;
  dispose(): void;
}

export interface SentinelBossConfig {
  readonly introSeconds: number;
  readonly armourHealthPerLayer: number;
  readonly vulnerabilitySeconds: number;
  readonly finalVulnerabilitySeconds: number;
}

export const DEFAULT_SENTINEL_BOSS_CONFIG: Readonly<SentinelBossConfig> = {
  introSeconds: 2.5,
  armourHealthPerLayer: 3,
  vulnerabilitySeconds: 5,
  finalVulnerabilitySeconds: 6,
};

export interface SentinelBossReadModel {
  readonly state: SentinelBossState;
  readonly phaseNumber: 0 | 1 | 2 | 3;
  readonly currentAttackId: string | null;
  readonly currentAttackStage: SentinelAttackStage | null;
  readonly currentAttackProgress: number;
  readonly weakPointOpen: boolean;
  readonly armourLayersRemaining: number;
  readonly currentArmourHealth: number;
  readonly currentArmourMaximumHealth: number;
  readonly coreHealth: number;
  readonly coreMaximumHealth: number;
  readonly vulnerabilityRemainingSeconds: number;
  readonly activeDroneCount: number;
  readonly defeated: boolean;
}

export interface SentinelBossEvents {
  started: Record<string, never>;
  stateChanged: {
    readonly previousState: SentinelBossState;
    readonly state: SentinelBossState;
  };
  phaseChanged: { readonly phaseNumber: 1 | 2 | 3 };
  attackStarted: { readonly attackId: string };
  attackStageChanged: {
    readonly attackId: string;
    readonly previousStage: SentinelAttackStage;
    readonly stage: SentinelAttackStage;
  };
  attackCompleted: { readonly attackId: string };
  attackCancelled: {
    readonly attackId: string;
    readonly reason: SentinelAttackCancelReason;
  };
  weakPointOpened: { readonly final: boolean };
  weakPointClosed: Record<string, never>;
  armourDamaged: {
    readonly phaseNumber: 1 | 2 | 3;
    readonly damageUnits: number;
    readonly remainingHealth: number;
  };
  armourLayerBroken: { readonly phaseNumber: 1 | 2 | 3 };
  coreHitRejected: { readonly reason: 'charge-required' };
  coreDamaged: { readonly damageUnits: number };
  vulnerabilityStarted: {
    readonly final: boolean;
    readonly durationSeconds: number;
  };
  vulnerabilityEnded: {
    readonly final: boolean;
    readonly reason: 'expired' | 'broken' | 'defeated';
  };
  defeated: Record<string, never>;
  finalCinematicRequested: Record<string, never>;
  reset: Record<string, never>;
}
