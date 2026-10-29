import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PersistentSlimePair } from '../../../src/slimes/PersistentSlimePair.ts';
import { SlimeManager } from '../../../src/slimes/SlimeManager.ts';

function fixture(unlockGoopInitially: boolean) {
  const manager = new SlimeManager<Body>();
  const body = () => ({ position: new THREE.Vector3(), radiusMetres: .45,
    recoverAt(p: THREE.Vector3) { this.position.copy(p); } });
  type Body = ReturnType<typeof body>;
  const bob = body(), goop = body();
  const pair = new PersistentSlimePair({ manager, bobBody: bob, goopBody: goop,
    bobSpawnPosition: bob.position, goopSpawnPosition: goop.position, unlockGoopInitially });
  return { manager, pair, bob, goop };
}

test('Containment keeps Goop registered but unavailable through switches and checkpoint recovery', () => {
  const { manager, pair, goop } = fixture(false);
  assert.equal(manager.getBody('goop'), goop);
  assert.equal(manager.isAvailable('goop'), false);
  assert.equal(pair.switchActive(), false);
  pair.captureCurrentRecoveryState(); pair.restoreRecoveryState();
  assert.equal(manager.isUnlocked('goop'), false);
  assert.equal(pair.activeSlimeId, 'bob');
  manager.dispose();
});

test('rescue permits switching and recovery; full Containment restart locks the same Goop body again', () => {
  const { manager, pair, goop } = fixture(false);
  manager.unlock('goop');
  assert.equal(pair.switchActive(), true);
  pair.captureCurrentRecoveryState(); pair.restoreRecoveryState();
  assert.equal(pair.activeSlimeId, 'goop');
  pair.restoreInitialState();
  assert.equal(pair.activeSlimeId, 'bob');
  assert.equal(manager.isAvailable('goop'), false);
  assert.equal(manager.getBody('goop'), goop);
  assert.equal(pair.switchActive(), false);
  manager.dispose();
});

test('Cultivation starts with both persistent bodies available and preserves them on restart', () => {
  const { manager, pair } = fixture(true);
  assert.equal(manager.isAvailable('goop'), true);
  assert.equal(pair.switchActive(), true);
  pair.restoreInitialState();
  assert.equal(manager.isAvailable('goop'), true);
  manager.dispose();
});
