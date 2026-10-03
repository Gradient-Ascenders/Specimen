import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { Input } from '../src/core/Input.ts';
import { CultivationLevelRuntime } from '../src/levels/CultivationLevelRuntime.ts';
import { CultivationRoomFiveController } from '../src/levels/CultivationRoomFiveController.ts';
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

test('Level 2 zero shortcut works without debug preview and is one-shot', () => {
  const inputStates: boolean[] = [];
  const input = {
    enabled: true,
    setEnabled: (enabled: boolean) => inputStates.push(enabled),
    releasePointerLock: () => undefined,
  } as unknown as Input;
  const runtime = new CultivationLevelRuntime({
    host: { dataset: {} } as unknown as HTMLElement,
    input,
    renderLayer: { scene: new THREE.Scene() } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop'], activeSlimeId: 'bob' },
    window: new EventTarget() as unknown as Window,
    debugAvailable: false,
  });
  let unlocked = false;
  let emitted: unknown;
  const internals = runtime as unknown as {
    lifecycle: { state: string };
    resources: Record<string, any>;
    onSkipToLevelThree: (event: KeyboardEvent) => void;
  };
  internals.lifecycle = { state: 'running' };
  internals.resources = {
    deathSequence: { isPlaying: true },
    controller: { readModel: { state: 'playing' } },
    manager: {
      isRegistered: () => false,
      registerBody() {},
      unlock(id: string) { unlocked = id === 'volt'; },
      getRosterState: () => [],
      activeSlimeId: 'bob',
    },
    pair: { bobBody: { position: new THREE.Vector3(1, 2, 3) } },
    voltBody: { recoverAt(position: THREE.Vector3) { assert.deepEqual(position.toArray(), [1, 2, 3]); } },
    voltVisual: { visible: false },
  };
  runtime.events.on('completed', (event) => { emitted = event; });
  let prevented = false;
  const keyEvent = {
    code: 'Numpad0', repeat: false, target: null,
    preventDefault: () => { prevented = true; },
  } as unknown as KeyboardEvent;
  internals.onSkipToLevelThree(keyEvent);
  internals.onSkipToLevelThree(keyEvent);

  assert.equal(prevented, true);
  assert.equal(unlocked, true);
  assert.deepEqual(inputStates, [false]);
  assert.deepEqual(emitted, { levelId: 'level-2', nextLevelId: 'level-3' });
});

test('final lever hands off to Level 3 once Volt is released and unlocked, without an exit reunion', () => {
  let enabled = true, unlocked = false, registered = false, transitions = 0;
  const input = { setEnabled(value: boolean) { enabled = value; }, releasePointerLock() {} } as unknown as Input;
  const runtime = new CultivationLevelRuntime({
    host: { dataset: {} } as unknown as HTMLElement, input,
    renderLayer: { scene: new THREE.Scene() } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop'], activeSlimeId: 'bob' },
    window: new EventTarget() as unknown as Window, debugAvailable: false,
  });
  const controller = new CultivationRoomFiveController();
  controller.reset('controls');
  controller.update(1.5, false, false, false, true);
  const pod = new THREE.Group(); pod.position.set(0, 2.65, 64);
  const resources = {
    authoredPreview: { roomFive: { controller, pod }, roomFour: { controller: { readModel: { state: 'complete' } } } },
    deathSequence: { isPlaying: true },
    manager: {
      isAvailable: () => unlocked,
      isRegistered: () => registered,
      registerBody() { registered = true; },
      unlock() { unlocked = true; },
      getRosterState: () => [], activeSlimeId: 'bob',
    },
    voltBody: { recoverAt(position: THREE.Vector3) { assert.deepEqual(position.toArray(), [0, 2.65, 64]); } },
    voltVisual: { visible: false },
  };
  const internals = runtime as unknown as {
    resources: typeof resources; authoredPreviewProgression: { roomId: number };
    roomFiveCheckpoint: string; captureAuthoredPreviewCheckpoint(): void;
    updateRoomFive(dt: number, resources: typeof resources): void;
  };
  internals.resources = resources;
  internals.authoredPreviewProgression = { roomId: 5 };
  internals.roomFiveCheckpoint = 'controls';
  internals.captureAuthoredPreviewCheckpoint = () => {};
  runtime.events.on('completed', event => {
    assert.equal(unlocked, true, 'session progression already includes Volt');
    assert.equal(registered, true);
    assert.deepEqual(event, { levelId: 'level-2', nextLevelId: 'level-3' });
    transitions++;
  });
  internals.updateRoomFive(1 / 60, resources);
  assert.equal(transitions, 0, 'let the rescue animation finish');
  assert.equal(enabled, true);
  controller.update(4, false, false, false, false);
  internals.updateRoomFive(1 / 60, resources);
  assert.equal(controller.complete, true);
  assert.equal(enabled, false);
  assert.equal(transitions, 1);
  assert.equal(controller.exitPowered, false, 'no obsolete terminal or reunion requirement');
  internals.updateRoomFive(1 / 60, resources);
  assert.equal(transitions, 1, 'handoff is one-shot');
});
