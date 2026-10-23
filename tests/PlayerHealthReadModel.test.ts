import assert from 'node:assert/strict';
import test from 'node:test';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';
import { CultivationLevelRuntime } from '../src/levels/CultivationLevelRuntime.ts';
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';

test('Cultivation exposes the active slime health from its actual room and suppresses cinematics and death', () => {
  const encounters = [new SlimeDamageSystem(), new SlimeDamageSystem(), new SlimeDamageSystem()];
  const host = { dataset: {} as Record<string, string> };
  let room = 3;
  const resources = {
    manager: { activeSlimeId: 'bob', activeBody: { position: { x: 0, y: 0, z: 0 } } },
    deathSequence: { isPlaying: true }, roomFiveFinale: { active: false },
    authoredPreview: { resolveRoomId: () => room }, controller: { activeRoomId: 3 },
    roomThreeEncounter: { damage: encounters[0]! }, roomFourEncounter: { damage: encounters[1]! }, roomFiveEncounter: { damage: encounters[2]! },
  };
  const owner = { resources, host, ventArrival: { active: false } } as unknown as CultivationLevelRuntime;
  const health = () => CultivationLevelRuntime.prototype.getPlayerHealth.call(owner);
  try {
    for (const [index, damage] of encounters.entries()) {
      room = index + 3; damage.applyDamage('bob', 10 + index * 10);
      assert.equal(health(), damage.health[0]);
      resources.manager.activeSlimeId = 'goop'; assert.equal(health(), damage.health[1]);
      resources.manager.activeSlimeId = 'volt'; assert.equal(health(), undefined, 'Volt has no health in these encounters');
      resources.manager.activeSlimeId = 'bob';
    }
    room = 2; assert.equal(health(), undefined);
    room = 3; host.dataset.cinematic = 'cultivation-clearance'; assert.equal(health(), undefined);
    delete host.dataset.cinematic;
    resources.roomFiveFinale.active = true; assert.equal(health(), undefined);
    resources.roomFiveFinale.active = false;
    resources.deathSequence.isPlaying = false; assert.equal(health(), undefined);
  } finally { for (const damage of encounters) damage.dispose(); }
});

test('Blackout exposes transit health for all three slimes and leaves merged/boss health to the boss HUD', () => {
  const damage = new SlimeDamageSystem({}, ['bob', 'goop', 'volt']);
  const host = { dataset: {} as Record<string, string> };
  const resources = { manager: { activeSlimeId: 'bob' }, deathSequence: { isPlaying: true },
    specimenForm: { readModel: { controlledForm: 'group' } }, transit: { isActive: true, damage } };
  const owner = { resources, host } as unknown as BlackoutLevelRuntime;
  const health = () => BlackoutLevelRuntime.prototype.getPlayerHealth.call(owner);
  try {
    for (const state of damage.health) {
      resources.manager.activeSlimeId = state.slimeId; damage.applyDamage(state.slimeId, 20);
      assert.equal(health(), state);
    }
    resources.transit.isActive = false; assert.equal(health(), undefined);
    resources.transit.isActive = true;
    resources.specimenForm.readModel.controlledForm = 'specimen'; assert.equal(health(), undefined);
    resources.specimenForm.readModel.controlledForm = 'group';
    host.dataset.bossEncounter = 'true'; assert.equal(health(), undefined);
    delete host.dataset.bossEncounter;
    host.dataset.cinematic = 'blackout-arrival'; assert.equal(health(), undefined);
    delete host.dataset.cinematic;
    resources.deathSequence.isPlaying = false; assert.equal(health(), undefined);
  } finally { damage.dispose(); }
});
