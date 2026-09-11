import * as THREE from 'three';

import type {
  CombatImpact,
  CombatImpactResult,
} from '../combat/CombatTargetRegistry.ts';
import { EventBus } from '../core/EventBus.ts';
import type { SerializableValue } from '../levels/BlackoutRuntimeState.ts';
import type {
  SentinelAttack,
  SentinelAttackCancelReason,
  SentinelAttackContext,
  SentinelBossConfig,
  SentinelBossEvents,
  SentinelBossReadModel,
  SentinelBossState,
} from './SentinelBossTypes.ts';
import { DEFAULT_SENTINEL_BOSS_CONFIG } from './SentinelBossTypes.ts';
import type { SentinelWeakPointAuthority } from './SentinelWeakPointTarget.ts';

const EPSILON = 1e-9;

interface MutableBossReadModel {
  state: SentinelBossState;
  phaseNumber: 0 | 1 | 2 | 3;
  currentAttackId: string | null;
  currentAttackStage: SentinelBossReadModel['currentAttackStage'];
  currentAttackProgress: number;
  weakPointOpen: boolean;
  armourLayersRemaining: number;
  currentArmourHealth: number;
  currentArmourMaximumHealth: number;
  coreHealth: number;
  coreMaximumHealth: number;
  vulnerabilityRemainingSeconds: number;
  activeDroneCount: number;
  defeated: boolean;
}

interface SentinelBossSnapshot {
  readonly state: SentinelBossState;
  readonly brokenArmourLayers: number;
  readonly currentArmourHealth: number;
  readonly coreHealth: number;
}

export interface SentinelBossControllerOptions {
  readonly attacks: readonly SentinelAttack[];
  readonly phaseScripts: Readonly<{
    1: readonly string[];
    2: readonly string[];
    3: readonly string[];
  }>;
  readonly weakPointAnchor: THREE.Object3D;
  readonly config?: Partial<SentinelBossConfig>;
  readonly getActiveDroneCount?: () => number;
}

/**
 * Deterministic boss encounter authority.
 *
 * Blackout owns only the macro "boss" phase. This controller owns all
 * Sentinel-local phase scripts, vulnerability gates, armour/core damage, and
 * one-shot defeat/cinematic requests.
 */
export class SentinelBossController implements SentinelWeakPointAuthority {
  readonly id = 'sentinel-boss';
  readonly events = new EventBus<SentinelBossEvents>();
  readonly readModel: SentinelBossReadModel;

  private readonly attacks = new Map<string, SentinelAttack>();
  private readonly attackUnsubscribers: Array<() => void> = [];
  private readonly phaseScripts: SentinelBossControllerOptions['phaseScripts'];
  private readonly weakPointAnchor: THREE.Object3D;
  private readonly config: SentinelBossConfig;
  private readonly getActiveDroneCount: () => number;
  private readonly model: MutableBossReadModel;

  private currentAttack: SentinelAttack | undefined;
  private currentAttackIndex = 0;
  private stateElapsedSeconds = 0;
  private brokenArmourLayers = 0;
  private pendingArmourBreakPhase: 1 | 2 | 3 | undefined;
  private pendingDefeat = false;
  private defeatRequestAvailable = false;
  private defeatEventEmitted = false;
  private cinematicEventEmitted = false;
  private disposed = false;

  constructor(options: SentinelBossControllerOptions) {
    this.config = {
      ...DEFAULT_SENTINEL_BOSS_CONFIG,
      ...options.config,
    };
    this.validateConfig();
    this.phaseScripts = {
      1: [...options.phaseScripts[1]],
      2: [...options.phaseScripts[2]],
      3: [...options.phaseScripts[3]],
    };
    this.weakPointAnchor = options.weakPointAnchor;
    this.getActiveDroneCount = options.getActiveDroneCount ?? (() => 0);

    for (const attack of options.attacks) {
      if (this.attacks.has(attack.id)) {
        throw new Error(`Duplicate Sentinel attack ID "${attack.id}".`);
      }
      this.attacks.set(attack.id, attack);
      this.attackUnsubscribers.push(
        attack.events.on('stageChanged', (event) => {
          if (this.currentAttack !== attack) return;
          this.events.emit('attackStageChanged', event);
          this.syncAttackReadModel();
        }),
      );
    }
    for (const phase of [1, 2, 3] as const) {
      if (this.phaseScripts[phase].length === 0) {
        throw new Error(`Sentinel phase ${phase} requires at least one attack.`);
      }
      for (const id of this.phaseScripts[phase]) {
        if (!this.attacks.has(id)) {
          throw new Error(
            `Sentinel phase ${phase} references unknown attack "${id}".`,
          );
        }
      }
    }

    this.model = {
      state: 'idle',
      phaseNumber: 0,
      currentAttackId: null,
      currentAttackStage: null,
      currentAttackProgress: 0,
      weakPointOpen: false,
      armourLayersRemaining: 3,
      currentArmourHealth: this.config.armourHealthPerLayer,
      currentArmourMaximumHealth: this.config.armourHealthPerLayer,
      coreHealth: 1,
      coreMaximumHealth: 1,
      vulnerabilityRemainingSeconds: 0,
      activeDroneCount: 0,
      defeated: false,
    };
    this.readModel = this.model;
  }

  get checkpointSafe(): boolean {
    if (this.currentAttack) return false;
    if (this.pendingArmourBreakPhase !== undefined || this.pendingDefeat) {
      return false;
    }
    return (
      this.model.state === 'idle' ||
      this.model.state === 'defeated' ||
      (isAttackPhase(this.model.state) && this.currentAttackIndex === 0)
    );
  }

  start(): boolean {
    this.assertActive('start');
    if (this.model.state !== 'idle') return false;
    this.stateElapsedSeconds = 0;
    this.events.emit('started', {});
    this.transitionState('intro');
    return true;
  }

  update(deltaSeconds: number, context: SentinelAttackContext): void {
    this.assertActive('update');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Sentinel boss deltaSeconds must be positive and finite.');
    }

    this.model.activeDroneCount = Math.max(
      0,
      this.getActiveDroneCount(),
    );

    if (this.pendingDefeat) {
      this.commitDefeat();
      return;
    }
    if (this.pendingArmourBreakPhase !== undefined) {
      this.commitArmourBreak(this.pendingArmourBreakPhase);
      return;
    }

    if (this.model.state === 'idle' || this.model.state === 'defeated') {
      return;
    }

    if (this.model.state === 'intro') {
      this.stateElapsedSeconds += deltaSeconds;
      if (
        this.stateElapsedSeconds + EPSILON >=
        this.config.introSeconds
      ) {
        this.enterAttackPhase(1);
      }
      return;
    }

    if (isVulnerabilityState(this.model.state)) {
      this.model.vulnerabilityRemainingSeconds = Math.max(
        0,
        this.model.vulnerabilityRemainingSeconds - deltaSeconds,
      );
      if (this.model.vulnerabilityRemainingSeconds <= EPSILON) {
        const final = this.model.state === 'final-vulnerable';
        this.closeWeakPoint();
        this.events.emit('vulnerabilityEnded', {
          final,
          reason: 'expired',
        });
        if (final) {
          this.enterAttackPhase(3);
        } else {
          this.enterAttackPhase(phaseFromState(this.model.state));
        }
      }
      return;
    }

    if (!isAttackPhase(this.model.state)) return;

    if (!this.currentAttack) {
      const script = this.phaseScripts[phaseFromState(this.model.state)];
      const attackId = script[this.currentAttackIndex];
      if (!attackId) {
        this.openVulnerability(phaseFromState(this.model.state));
        return;
      }
      const attack = this.attacks.get(attackId);
      if (!attack) {
        throw new Error(`Missing Sentinel attack "${attackId}".`);
      }
      this.currentAttack = attack;
      this.events.emit('attackStarted', { attackId });
      attack.start(context);
      this.syncAttackReadModel();
    }

    const updatingAttack = this.currentAttack;
    updatingAttack.update(deltaSeconds, context);
    this.syncAttackReadModel();

    // A lethal attack may synchronously call Blackout.requestFailure(), which
    // cancels the current attack before this update frame returns. Do not
    // dereference or advance an attack after ownership was revoked.
    if (this.currentAttack !== updatingAttack) return;
    if (!updatingAttack.isComplete) return;

    const completedId = updatingAttack.id;
    this.events.emit('attackCompleted', { attackId: completedId });
    this.currentAttack = undefined;
    this.currentAttackIndex += 1;
    this.syncAttackReadModel();

    const phase = phaseFromState(this.model.state);
    const script = this.phaseScripts[phase];
    if (this.currentAttackIndex >= script.length) {
      if (phase === 3 && this.brokenArmourLayers >= 3) {
        this.openFinalVulnerability();
      } else {
        this.openVulnerability(phase);
      }
    }
  }

  isWeakPointOpen(): boolean {
    return this.model.weakPointOpen;
  }

  copyWeakPointSplashPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.weakPointAnchor.getWorldPosition(target);
  }

  applyWeakPointImpact(impact: CombatImpact): CombatImpactResult {
    this.assertActive('apply weak-point impact');
    if (!this.model.weakPointOpen) {
      return {
        accepted: false,
        destroyed: this.model.defeated,
        rejectionReason: 'weak-point-closed',
      };
    }
    if (impact.kind !== 'direct') {
      return {
        accepted: false,
        destroyed: false,
        rejectionReason: 'splash-not-allowed',
      };
    }

    if (this.model.state === 'final-vulnerable') {
      if (!impact.fullyCharged) {
        this.events.emit('coreHitRejected', {
          reason: 'charge-required',
        });
        return {
          accepted: false,
          destroyed: false,
          rejectionReason: 'charge-required',
        };
      }
      if (!Number.isFinite(impact.damageUnits) || impact.damageUnits <= 0) {
        return {
          accepted: false,
          destroyed: false,
          rejectionReason: 'invulnerable',
        };
      }
      const damage = impact.damageUnits;
      this.model.coreHealth = 0;
      this.events.emit('coreDamaged', { damageUnits: damage });
      this.pendingDefeat = true;
      this.closeWeakPoint();
      return {
        accepted: true,
        destroyed: true,
      };
    }

    if (!isArmourVulnerabilityState(this.model.state)) {
      return {
        accepted: false,
        destroyed: false,
        rejectionReason: 'weak-point-closed',
      };
    }

    const phase = phaseFromState(this.model.state);
    const damage = Math.max(0, impact.damageUnits);
    if (!Number.isFinite(damage) || damage <= 0) {
      return {
        accepted: false,
        destroyed: false,
        rejectionReason: 'invulnerable',
      };
    }

    this.model.currentArmourHealth = Math.max(
      0,
      this.model.currentArmourHealth - damage,
    );
    this.events.emit('armourDamaged', {
      phaseNumber: phase,
      damageUnits: damage,
      remainingHealth: this.model.currentArmourHealth,
    });

    if (this.model.currentArmourHealth <= EPSILON) {
      // Close immediately so a second projectile in the same fixed step cannot
      // spill damage into the next armour layer.
      this.pendingArmourBreakPhase = phase;
      this.closeWeakPoint();
    }

    return {
      accepted: true,
      destroyed: false,
    };
  }

  cancelTransient(reason: SentinelAttackCancelReason): void {
    if (this.disposed) return;
    this.closeWeakPoint();
    if (this.currentAttack) {
      const id = this.currentAttack.id;
      this.currentAttack.cancel(reason);
      this.events.emit('attackCancelled', {
        attackId: id,
        reason,
      });
      this.currentAttack = undefined;
      this.syncAttackReadModel();
    }
    for (const attack of this.attacks.values()) {
      if (attack.readModel.stage !== 'idle') {
        attack.cancel(reason);
      }
    }
  }

  consumeDefeatRequest(): boolean {
    if (!this.defeatRequestAvailable) return false;
    this.defeatRequestAvailable = false;
    return true;
  }

  capture(): SerializableValue {
    this.assertActive('capture');
    if (!this.checkpointSafe) {
      throw new Error(
        'Sentinel checkpoints may only capture at stable encounter boundaries.',
      );
    }
    const snapshot: SentinelBossSnapshot = {
      state: this.model.state,
      brokenArmourLayers: this.brokenArmourLayers,
      currentArmourHealth: this.model.currentArmourHealth,
      coreHealth: this.model.coreHealth,
    };
    return {
      state: snapshot.state,
      brokenArmourLayers: snapshot.brokenArmourLayers,
      currentArmourHealth: snapshot.currentArmourHealth,
      coreHealth: snapshot.coreHealth,
    };
  }

  restore(state: SerializableValue): void {
    this.assertActive('restore');
    const snapshot = readSnapshot(state, this.config.armourHealthPerLayer);
    this.cancelTransient('reset');
    for (const attack of this.attacks.values()) attack.reset();

    this.brokenArmourLayers = snapshot.brokenArmourLayers;
    this.pendingArmourBreakPhase = undefined;
    this.pendingDefeat = false;
    this.defeatRequestAvailable = false;
    this.defeatEventEmitted = snapshot.state === 'defeated';
    this.cinematicEventEmitted = snapshot.state === 'defeated';
    this.currentAttack = undefined;
    this.currentAttackIndex = 0;
    this.stateElapsedSeconds = 0;

    this.model.state = snapshot.state;
    this.model.phaseNumber = phaseForReadModel(snapshot.state);
    this.model.currentAttackId = null;
    this.model.currentAttackStage = null;
    this.model.currentAttackProgress = 0;
    this.model.weakPointOpen = false;
    this.model.armourLayersRemaining = Math.max(
      0,
      3 - this.brokenArmourLayers,
    );
    this.model.currentArmourHealth = snapshot.currentArmourHealth;
    this.model.currentArmourMaximumHealth =
      this.config.armourHealthPerLayer;
    this.model.coreHealth = snapshot.coreHealth;
    this.model.coreMaximumHealth = 1;
    this.model.vulnerabilityRemainingSeconds = 0;
    this.model.activeDroneCount = Math.max(0, this.getActiveDroneCount());
    this.model.defeated = snapshot.state === 'defeated';
  }

  resetTransient(): void {
    this.cancelTransient('reset');
  }

  reset(): void {
    if (this.disposed) return;
    this.cancelTransient('reset');
    for (const attack of this.attacks.values()) attack.reset();
    this.brokenArmourLayers = 0;
    this.pendingArmourBreakPhase = undefined;
    this.pendingDefeat = false;
    this.defeatRequestAvailable = false;
    this.defeatEventEmitted = false;
    this.cinematicEventEmitted = false;
    this.currentAttack = undefined;
    this.currentAttackIndex = 0;
    this.stateElapsedSeconds = 0;

    this.model.state = 'idle';
    this.model.phaseNumber = 0;
    this.model.currentAttackId = null;
    this.model.currentAttackStage = null;
    this.model.currentAttackProgress = 0;
    this.model.weakPointOpen = false;
    this.model.armourLayersRemaining = 3;
    this.model.currentArmourHealth = this.config.armourHealthPerLayer;
    this.model.currentArmourMaximumHealth =
      this.config.armourHealthPerLayer;
    this.model.coreHealth = 1;
    this.model.coreMaximumHealth = 1;
    this.model.vulnerabilityRemainingSeconds = 0;
    this.model.activeDroneCount = 0;
    this.model.defeated = false;
    this.events.emit('reset', {});
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelTransient('dispose');
    for (const unsubscribe of this.attackUnsubscribers) unsubscribe();
    this.attackUnsubscribers.length = 0;
    for (const attack of this.attacks.values()) attack.dispose();
    this.attacks.clear();
    this.events.clear();
    this.disposed = true;
  }

  private enterAttackPhase(phase: 1 | 2 | 3): void {
    const previousPhase = this.model.phaseNumber;
    this.closeWeakPoint();
    this.currentAttack = undefined;
    this.currentAttackIndex = 0;
    this.stateElapsedSeconds = 0;
    this.model.vulnerabilityRemainingSeconds = 0;
    this.transitionState(`phase-${phase}` as SentinelBossState);
    this.model.phaseNumber = phase;
    if (previousPhase !== phase) {
      this.events.emit('phaseChanged', { phaseNumber: phase });
    }
  }

  private openVulnerability(phase: 1 | 2 | 3): void {
    this.currentAttack = undefined;
    this.syncAttackReadModel();
    this.transitionState(`vulnerable-${phase}` as SentinelBossState);
    this.model.phaseNumber = phase;
    this.model.weakPointOpen = true;
    this.model.vulnerabilityRemainingSeconds =
      this.config.vulnerabilitySeconds;
    this.events.emit('weakPointOpened', { final: false });
    this.events.emit('vulnerabilityStarted', {
      final: false,
      durationSeconds: this.config.vulnerabilitySeconds,
    });
  }

  private openFinalVulnerability(): void {
    this.currentAttack = undefined;
    this.syncAttackReadModel();
    this.transitionState('final-vulnerable');
    this.model.phaseNumber = 3;
    this.model.weakPointOpen = true;
    this.model.vulnerabilityRemainingSeconds =
      this.config.finalVulnerabilitySeconds;
    this.events.emit('weakPointOpened', { final: true });
    this.events.emit('vulnerabilityStarted', {
      final: true,
      durationSeconds: this.config.finalVulnerabilitySeconds,
    });
  }

  private closeWeakPoint(): void {
    if (!this.model.weakPointOpen) return;
    this.model.weakPointOpen = false;
    this.model.vulnerabilityRemainingSeconds = 0;
    this.events.emit('weakPointClosed', {});
  }

  private commitArmourBreak(phase: 1 | 2 | 3): void {
    this.pendingArmourBreakPhase = undefined;
    this.brokenArmourLayers = Math.min(3, this.brokenArmourLayers + 1);
    this.model.armourLayersRemaining = Math.max(
      0,
      3 - this.brokenArmourLayers,
    );
    this.events.emit('armourLayerBroken', { phaseNumber: phase });
    this.events.emit('vulnerabilityEnded', {
      final: false,
      reason: 'broken',
    });

    if (phase === 3) {
      this.model.currentArmourHealth = 0;
      this.openFinalVulnerability();
      return;
    }

    this.model.currentArmourHealth = this.config.armourHealthPerLayer;
    this.enterAttackPhase((phase + 1) as 2 | 3);
  }

  private commitDefeat(): void {
    this.pendingDefeat = false;
    this.cancelTransient('defeat');
    this.model.coreHealth = 0;
    this.model.defeated = true;
    this.model.vulnerabilityRemainingSeconds = 0;
    this.transitionState('defeated');
    this.model.phaseNumber = 3;
    this.model.activeDroneCount = Math.max(0, this.getActiveDroneCount());
    this.events.emit('vulnerabilityEnded', {
      final: true,
      reason: 'defeated',
    });

    if (!this.defeatEventEmitted) {
      this.defeatEventEmitted = true;
      this.events.emit('defeated', {});
    }
    if (!this.cinematicEventEmitted) {
      this.cinematicEventEmitted = true;
      this.events.emit('finalCinematicRequested', {});
    }
    this.defeatRequestAvailable = true;
  }

  private transitionState(state: SentinelBossState): void {
    if (this.model.state === state) return;
    const previousState = this.model.state;
    this.model.state = state;
    this.model.phaseNumber = phaseForReadModel(state);
    this.events.emit('stateChanged', {
      previousState,
      state,
    });
  }

  private syncAttackReadModel(): void {
    this.model.currentAttackId = this.currentAttack?.id ?? null;
    this.model.currentAttackStage =
      this.currentAttack?.readModel.stage ?? null;
    this.model.currentAttackProgress =
      this.currentAttack?.readModel.stageProgress ?? 0;
    this.model.activeDroneCount = Math.max(0, this.getActiveDroneCount());
  }

  private validateConfig(): void {
    for (const [label, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Sentinel boss ${label} must be positive and finite.`);
      }
    }
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} Sentinel boss after disposal.`);
    }
  }
}

function isAttackPhase(state: SentinelBossState): boolean {
  return state === 'phase-1' || state === 'phase-2' || state === 'phase-3';
}

function isVulnerabilityState(state: SentinelBossState): boolean {
  return (
    state === 'vulnerable-1' ||
    state === 'vulnerable-2' ||
    state === 'vulnerable-3' ||
    state === 'final-vulnerable'
  );
}

function isArmourVulnerabilityState(
  state: SentinelBossState,
): state is 'vulnerable-1' | 'vulnerable-2' | 'vulnerable-3' {
  return (
    state === 'vulnerable-1' ||
    state === 'vulnerable-2' ||
    state === 'vulnerable-3'
  );
}

function phaseFromState(state: SentinelBossState): 1 | 2 | 3 {
  if (state === 'phase-1' || state === 'vulnerable-1') return 1;
  if (state === 'phase-2' || state === 'vulnerable-2') return 2;
  return 3;
}

function phaseForReadModel(
  state: SentinelBossState,
): 0 | 1 | 2 | 3 {
  if (state === 'idle' || state === 'intro') return 0;
  if (state === 'phase-1' || state === 'vulnerable-1') return 1;
  if (state === 'phase-2' || state === 'vulnerable-2') return 2;
  return 3;
}

function readSnapshot(
  value: SerializableValue,
  maximumArmourHealth: number,
): SentinelBossSnapshot {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Invalid Sentinel boss checkpoint snapshot.');
  }
  const object = value as Readonly<Record<string, SerializableValue>>;
  const state = object.state;
  const brokenArmourLayers = object.brokenArmourLayers;
  const currentArmourHealth = object.currentArmourHealth;
  const coreHealth = object.coreHealth;
  if (
    typeof state !== 'string' ||
    !isBossState(state) ||
    typeof brokenArmourLayers !== 'number' ||
    !Number.isInteger(brokenArmourLayers) ||
    brokenArmourLayers < 0 ||
    brokenArmourLayers > 3 ||
    typeof currentArmourHealth !== 'number' ||
    !Number.isFinite(currentArmourHealth) ||
    currentArmourHealth < 0 ||
    currentArmourHealth > maximumArmourHealth ||
    typeof coreHealth !== 'number' ||
    !Number.isFinite(coreHealth) ||
    coreHealth < 0 ||
    coreHealth > 1
  ) {
    throw new Error('Invalid Sentinel boss checkpoint snapshot.');
  }
  return {
    state,
    brokenArmourLayers,
    currentArmourHealth,
    coreHealth,
  };
}

function isBossState(value: string): value is SentinelBossState {
  return [
    'idle',
    'intro',
    'phase-1',
    'vulnerable-1',
    'phase-2',
    'vulnerable-2',
    'phase-3',
    'vulnerable-3',
    'final-vulnerable',
    'defeated',
  ].includes(value);
}
