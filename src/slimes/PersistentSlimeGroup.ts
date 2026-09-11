import * as THREE from 'three';

import type { SlimeManager } from './SlimeManager.ts';
import type { SlimeId } from './SlimeRoster.ts';
import type { PersistentSlimeBody } from './PersistentSlimePair.ts';

export type PersistentThreeSlimeId = Extract<SlimeId, 'bob' | 'goop' | 'volt'>;

export interface ThreeSlimeRecoveryState {
  readonly positions: Readonly<Record<PersistentThreeSlimeId, THREE.Vector3>>;
  readonly activeSlimeId: PersistentThreeSlimeId;
}

export interface PersistentSlimeGroupOptions<Body extends PersistentSlimeBody> {
  readonly manager: SlimeManager<Body>;
  readonly bodies: Readonly<Record<PersistentThreeSlimeId, Body>>;
  readonly spawnPositions: Readonly<Record<PersistentThreeSlimeId, THREE.Vector3>>;
  readonly initialActiveSlimeId: PersistentThreeSlimeId;
}

/**
 * Level 3 ownership for exactly one persistent body per slime identity.
 *
 * Switching only changes SlimeManager ownership. It never recreates, teleports,
 * unregisters or otherwise mutates the inactive bodies. Recovery is explicit.
 */
export class PersistentSlimeGroup<Body extends PersistentSlimeBody> {
  readonly bobBody: Body;
  readonly goopBody: Body;
  readonly voltBody: Body;
  readonly bodies: readonly Body[];

  private readonly manager: SlimeManager<Body>;
  private readonly initial: ThreeSlimeRecoveryState;
  private readonly recoveryPositions = {
    bob: new THREE.Vector3(),
    goop: new THREE.Vector3(),
    volt: new THREE.Vector3(),
  };
  private recoveryActiveSlimeId: PersistentThreeSlimeId;

  constructor(options: PersistentSlimeGroupOptions<Body>) {
    this.manager = options.manager;
    this.bobBody = options.bodies.bob;
    this.goopBody = options.bodies.goop;
    this.voltBody = options.bodies.volt;
    this.bodies = [this.bobBody, this.goopBody, this.voltBody];

    for (const id of ['bob', 'goop', 'volt'] as const) {
      if (!this.manager.isUnlocked(id) && !this.manager.unlock(id)) {
        throw new Error(`Level 3 requires ${id} to be playable and unlocked.`);
      }
      const existing = this.manager.getBody(id);
      if (existing !== undefined && existing !== options.bodies[id]) {
        throw new Error(`SlimeManager already contains a different ${id} body.`);
      }
      if (existing === undefined) this.manager.registerBody(id, options.bodies[id]);
      this.recoveryPositions[id].copy(options.spawnPositions[id]);
    }

    if (!this.manager.activate(options.initialActiveSlimeId)) {
      throw new Error(`Could not activate initial Level 3 slime "${options.initialActiveSlimeId}".`);
    }

    this.recoveryActiveSlimeId = options.initialActiveSlimeId;
    this.initial = {
      positions: {
        bob: options.spawnPositions.bob.clone(),
        goop: options.spawnPositions.goop.clone(),
        volt: options.spawnPositions.volt.clone(),
      },
      activeSlimeId: options.initialActiveSlimeId,
    };
  }

  get activeSlimeId(): PersistentThreeSlimeId {
    const id = this.manager.activeSlimeId;
    if (id !== 'bob' && id !== 'goop' && id !== 'volt') {
      throw new Error('Persistent slime group has no valid active body.');
    }
    return id;
  }

  get activeBody(): Body {
    const body = this.manager.activeBody;
    if (!body) throw new Error('Persistent slime group has no active body.');
    return body;
  }

  switchNext(): boolean {
    const order = ['bob', 'goop', 'volt'] as const;
    const currentIndex = order.indexOf(this.activeSlimeId);
    return this.manager.activate(order[(currentIndex + 1) % order.length]);
  }

  activate(id: PersistentThreeSlimeId): boolean {
    return this.manager.activate(id);
  }

  setRecoveryState(state: ThreeSlimeRecoveryState): void {
    for (const id of ['bob', 'goop', 'volt'] as const) {
      this.recoveryPositions[id].copy(state.positions[id]);
    }
    this.recoveryActiveSlimeId = state.activeSlimeId;
  }

  captureCurrentRecoveryState(): ThreeSlimeRecoveryState {
    const state: ThreeSlimeRecoveryState = {
      positions: {
        bob: new THREE.Vector3(this.bobBody.position.x, this.bobBody.position.y, this.bobBody.position.z),
        goop: new THREE.Vector3(this.goopBody.position.x, this.goopBody.position.y, this.goopBody.position.z),
        volt: new THREE.Vector3(this.voltBody.position.x, this.voltBody.position.y, this.voltBody.position.z),
      },
      activeSlimeId: this.activeSlimeId,
    };
    this.setRecoveryState(state);
    return state;
  }

  restoreRecoveryState(): void {
    // All target positions are committed before any body moves, preventing a
    // partially-restored authoritative state from leaking to a fixed update.
    const positions = {
      bob: this.recoveryPositions.bob.clone(),
      goop: this.recoveryPositions.goop.clone(),
      volt: this.recoveryPositions.volt.clone(),
    };
    this.bobBody.recoverAt(positions.bob);
    this.goopBody.recoverAt(positions.goop);
    this.voltBody.recoverAt(positions.volt);
    this.manager.resetForLevelRestart();
    if (!this.manager.activate(this.recoveryActiveSlimeId)) {
      throw new Error(`Recovery slime "${this.recoveryActiveSlimeId}" is no longer available.`);
    }
  }

  restoreInitialState(): void {
    this.setRecoveryState(this.initial);
    this.restoreRecoveryState();
  }
}
