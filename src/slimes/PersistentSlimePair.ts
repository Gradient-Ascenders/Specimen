import * as THREE from 'three';

import type { SlimeManager } from './SlimeManager.ts';

export interface PersistentSlimeBody {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
  recoverAt(position: THREE.Vector3): void;
}

export interface SlimePairRecoveryState {
  readonly bobPosition: THREE.Vector3;
  readonly goopPosition: THREE.Vector3;
  readonly activeSlimeId: 'bob' | 'goop';
}

export interface PersistentSlimePairOptions<Body extends PersistentSlimeBody> {
  readonly manager: SlimeManager<Body>;
  readonly bobBody: Body;
  readonly goopBody: Body;
  readonly bobSpawnPosition: THREE.Vector3;
  readonly goopSpawnPosition: THREE.Vector3;
  readonly initialActiveSlimeId?: 'bob' | 'goop';
}

/**
 * Persistent Bob/Goop ownership for Cultivation-style switching.
 *
 * Switching changes only SlimeManager's active identity. The two registered
 * body objects are never replaced, teleported, duplicated, or removed by a
 * switch. Recovery is an explicit operation separate from switching.
 */
export class PersistentSlimePair<Body extends PersistentSlimeBody> {
  readonly bobBody: Body;
  readonly goopBody: Body;

  private readonly manager: SlimeManager<Body>;
  private readonly initialRecoveryState: SlimePairRecoveryState;
  private readonly recoveryBobPosition = new THREE.Vector3();
  private readonly recoveryGoopPosition = new THREE.Vector3();
  private recoveryActiveSlimeId: 'bob' | 'goop';
  private switchCountValue = 0;

  constructor(options: PersistentSlimePairOptions<Body>) {
    this.manager = options.manager;
    this.bobBody = options.bobBody;
    this.goopBody = options.goopBody;

    const initialActive = options.initialActiveSlimeId ?? 'bob';

    if (!this.manager.isUnlocked('goop')) {
      if (!this.manager.unlock('goop')) {
        throw new Error('Goop must be Beta-playable before two-body switching.');
      }
    }

    this.registerExactBody('bob', this.bobBody);
    this.registerExactBody('goop', this.goopBody);

    if (!this.manager.activate(initialActive)) {
      throw new Error(
        `Could not activate initial two-body slime "${initialActive}".`,
      );
    }

    this.initialRecoveryState = {
      bobPosition: options.bobSpawnPosition.clone(),
      goopPosition: options.goopSpawnPosition.clone(),
      activeSlimeId: initialActive,
    };
    this.recoveryBobPosition.copy(options.bobSpawnPosition);
    this.recoveryGoopPosition.copy(options.goopSpawnPosition);
    this.recoveryActiveSlimeId = initialActive;
  }

  get activeSlimeId(): 'bob' | 'goop' {
    const id = this.manager.activeSlimeId;
    if (id !== 'bob' && id !== 'goop') {
      throw new Error('Persistent slime pair has no valid active body.');
    }
    return id;
  }

  get activeBody(): Body {
    const body = this.manager.activeBody;
    if (!body) throw new Error('Persistent slime pair has no active body.');
    return body;
  }

  get inactiveBody(): Body {
    return this.activeSlimeId === 'bob' ? this.goopBody : this.bobBody;
  }

  get switchCount(): number {
    return this.switchCountValue;
  }

  /** Direct Bob <-> Goop handoff. No body registration changes occur. */
  switchActive(): boolean {
    const next = this.activeSlimeId === 'bob' ? 'goop' : 'bob';
    if (!this.manager.activate(next)) return false;
    this.switchCountValue += 1;
    return true;
  }

  /**
   * Save a deterministic two-body checkpoint state. A future Cultivation
   * checkpoint owner can call this when its checkpoint becomes authoritative.
   */
  setRecoveryState(state: SlimePairRecoveryState): void {
    if (state.activeSlimeId !== 'bob' && state.activeSlimeId !== 'goop') {
      throw new Error('Two-body recovery must activate Bob or Goop.');
    }

    this.recoveryBobPosition.copy(state.bobPosition);
    this.recoveryGoopPosition.copy(state.goopPosition);
    this.recoveryActiveSlimeId = state.activeSlimeId;
  }

  captureCurrentRecoveryState(): void {
    this.recoveryBobPosition.set(
      this.bobBody.position.x,
      this.bobBody.position.y,
      this.bobBody.position.z,
    );
    this.recoveryGoopPosition.set(
      this.goopBody.position.x,
      this.goopBody.position.y,
      this.goopBody.position.z,
    );
    this.recoveryActiveSlimeId = this.activeSlimeId;
  }

  restoreRecoveryState(): void {
    this.bobBody.recoverAt(this.recoveryBobPosition);
    this.goopBody.recoverAt(this.recoveryGoopPosition);
    this.manager.resetForLevelRestart();
    if (!this.manager.activate(this.recoveryActiveSlimeId)) {
      throw new Error(
        `Recovery slime "${this.recoveryActiveSlimeId}" is no longer available.`,
      );
    }
  }

  /** Full level restart returns to the authored initial two-body state. */
  restoreInitialState(): void {
    this.setRecoveryState(this.initialRecoveryState);
    this.restoreRecoveryState();
    this.switchCountValue = 0;
  }

  private registerExactBody(id: 'bob' | 'goop', body: Body): void {
    const registered = this.manager.getBody(id);
    if (registered !== undefined) {
      if (registered !== body) {
        throw new Error(
          `SlimeManager already contains a different ${id} body.`,
        );
      }
      return;
    }

    this.manager.registerBody(id, body);
  }
}
