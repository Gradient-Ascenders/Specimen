import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { RenderShadowPolicy } from '../src/render/RenderLayer.ts';

const createPolicy = () => {
  const shadowMap = { enabled: false, type: THREE.BasicShadowMap as THREE.ShadowMapType,
    autoUpdate: true, needsUpdate: false };
  return { shadowMap, policy: new RenderShadowPolicy(shadowMap) };
};

test('level handoff restores the surviving owner even when an older load unloads first', () => {
  const { shadowMap, policy } = createPolicy();
  const roomOne = policy.request('containment', { enabled: true });
  const cultivation = policy.request('cultivation', { enabled: false });
  assert.equal(policy.activeOwner, 'cultivation');
  roomOne.dispose();
  roomOne.update({ enabled: true });
  assert.equal(shadowMap.enabled, false);
  cultivation.update({ enabled: true });
  assert.equal(shadowMap.enabled, true);
  const blackout = policy.request('blackout', { enabled: true });
  blackout.dispose(); // Failed load rolls back to the prior request.
  assert.equal(policy.activeOwner, 'cultivation');
  assert.equal(shadowMap.enabled, true);
  cultivation.dispose();
  cultivation.dispose();
  assert.equal(policy.activeOwner, undefined);
  assert.equal(shadowMap.enabled, false);
  assert.equal(shadowMap.type, THREE.PCFShadowMap);
  assert.equal(shadowMap.autoUpdate, true);
});

test('preparation restores all shadow state on throw and before asynchronous work yields', async () => {
  const { shadowMap, policy } = createPolicy();
  const roomOne = policy.request('containment', { enabled: true });
  shadowMap.needsUpdate = false;
  const before = { ...shadowMap };
  assert.throws(() => policy.withPreparation(false, () => {
    assert.equal(shadowMap.enabled, false);
    assert.equal(shadowMap.autoUpdate, false);
    throw new Error('compile failed');
  }), /compile failed/);
  assert.deepEqual(shadowMap, before);
  await policy.withPreparation(false, async () => {
    assert.equal(shadowMap.enabled, false);
    await Promise.resolve();
    assert.deepEqual(shadowMap, before);
  });
  assert.deepEqual(shadowMap, before);
  roomOne.dispose();
});

test('renderer disposal invalidates outstanding level requests', () => {
  const { shadowMap, policy } = createPolicy();
  const request = policy.request('containment', { enabled: true });
  policy.dispose();
  request.update({ enabled: true });
  request.dispose();
  assert.equal(shadowMap.enabled, false);
  assert.equal(policy.activeOwner, undefined);
  assert.throws(() => policy.request('late-load', { enabled: true }), /disposed/);
});
