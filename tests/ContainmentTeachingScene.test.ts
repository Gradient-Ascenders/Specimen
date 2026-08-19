import assert from 'node:assert/strict';
import test from 'node:test';

import { ContainmentTeachingScene } from '../src/levels/ContainmentTeachingScene.ts';

test('containment reset cancels a pending recovery callback', () => {
  const scene = new ContainmentTeachingScene();
  let recoveryCount = 0;

  scene.simulateFall(() => {
    recoveryCount += 1;
  });
  scene.resetProbe();
  scene.update(1);

  assert.equal(recoveryCount, 0);
  scene.dispose();
});

test('containment recovery callback fires exactly once', () => {
  const scene = new ContainmentTeachingScene();
  let recoveryCount = 0;

  scene.simulateFall(() => {
    recoveryCount += 1;
  });
  scene.update(1);
  scene.update(1);

  assert.equal(recoveryCount, 1);
  scene.dispose();
});
