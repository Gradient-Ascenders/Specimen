import assert from 'node:assert/strict';
import test from 'node:test';

import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';

test('five standard hits kill once and each slime owns independent health', () => {
  const damage = new SlimeDamageSystem();
  const deaths: string[] = [];
  damage.events.on('died', ({ slimeId }) => deaths.push(slimeId));

  for (let index = 0; index < 5; index += 1) damage.applyDamage('bob', 20);
  damage.applyDamage('bob', 20);

  assert.equal(damage.health[0].health, 0);
  assert.equal(damage.health[0].dead, true);
  assert.equal(damage.health[1].health, 100);
  assert.deepEqual(deaths, ['bob']);
});

test('regeneration respects the exact delay and is fixed-step subdivision invariant', () => {
  const whole = new SlimeDamageSystem();
  const subdivided = new SlimeDamageSystem();
  whole.applyDamage('goop', 50);
  subdivided.applyDamage('goop', 50);

  whole.update(3.25);
  for (let index = 0; index < 195; index += 1) subdivided.update(1 / 60);

  assert.equal(whole.health[1].health, 60);
  assert.ok(Math.abs(subdivided.health[1].health - 60) < 1e-8);
  assert.equal(whole.health[1].regenerating, true);
  whole.reset();
  assert.equal(whole.health[1].health, 100);
  assert.equal(whole.health[1].regenerationDelayRemainingSeconds, 0);
});
