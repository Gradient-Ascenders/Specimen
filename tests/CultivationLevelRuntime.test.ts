import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { Input } from '../src/core/Input.ts';
import { CultivationLevelRuntime } from '../src/levels/CultivationLevelRuntime.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';

test('failed Cultivation construction rolls back attached resources', () => {
  const scene = new THREE.Scene();
  const addToScene = scene.add.bind(scene);
  let sceneAdditions = 0;
  scene.add = ((...objects: THREE.Object3D[]) => {
    addToScene(...objects);
    sceneAdditions += 1;
    if (sceneAdditions === 2) throw new Error('injected scene failure');
    return scene;
  }) as typeof scene.add;

  let cameraClearCount = 0;
  const renderLayer = {
    scene,
    cameraRig: {
      clearFollowTarget: () => {
        cameraClearCount += 1;
      },
    },
  } as unknown as RenderLayer;
  const inputStates: boolean[] = [];
  let pointerReleaseCount = 0;
  const input = {
    setEnabled: (enabled: boolean) => inputStates.push(enabled),
    releasePointerLock: () => {
      pointerReleaseCount += 1;
    },
  } as unknown as Input;
  const host = { dataset: {} } as unknown as HTMLElement;
  const runtime = new CultivationLevelRuntime({
    host,
    input,
    renderLayer,
    progression: {
      unlockedSlimeIds: ['bob', 'goop'],
      activeSlimeId: 'bob',
    },
    window: new EventTarget() as unknown as Window,
    debugAvailable: false,
  });

  assert.throws(() => runtime.load(), /injected scene failure/);
  assert.equal(runtime.state, 'unloaded');
  assert.equal(scene.children.length, 0);
  assert.equal(cameraClearCount, 1);
  assert.deepEqual(inputStates, [false]);
  assert.equal(pointerReleaseCount, 1);

  runtime.dispose();
  assert.equal(runtime.state, 'disposed');
  assert.equal(scene.children.length, 0);
});
