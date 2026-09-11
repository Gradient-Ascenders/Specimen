import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { Input, InputAction } from '../src/core/Input.ts';
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';

class FakeButton {
  private clickListener: (() => void) | null = null;

  addEventListener(type: string, listener: () => void): void {
    if (type === 'click') this.clickListener = listener;
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'click' && this.clickListener === listener) {
      this.clickListener = null;
    }
  }

  focus(): void {}
}

class FakeDialog {
  readonly retryButton = new FakeButton();
  readonly attributes = new Map<string, string>();
  className = '';
  hidden = false;
  inert = false;
  innerHTML = '';
  removed = false;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelector(selector: string): FakeButton | null {
    return selector === '.death-retry' ? this.retryButton : null;
  }

  remove(): void {
    this.removed = true;
  }
}

test('failed Blackout construction rolls back a visual even when scene.add attaches then throws', () => {
  const originalDocument = globalThis.document;
  const dialog = new FakeDialog();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => dialog,
    },
  });

  try {
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
    const canvas = { inert: false } as unknown as HTMLCanvasElement;
    const renderLayer = {
      scene,
      canvas,
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

    const host = {
      dataset: {},
      append: () => {},
    } as unknown as HTMLElement;

    const runtime = new BlackoutLevelRuntime({
      host,
      input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    assert.throws(() => runtime.load(), /injected scene failure/);
    assert.equal(runtime.state, 'unloaded');
    assert.equal(scene.children.length, 0);
    assert.equal(
      scene.children.some((child) => child.name === 'blackout-foundation-slime'),
      false,
    );
    assert.equal(dialog.removed, true);
    assert.equal(cameraClearCount, 1);
    assert.deepEqual(inputStates, [false]);
    assert.equal(pointerReleaseCount, 1);

    runtime.dispose();
    assert.equal(runtime.state, 'disposed');
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});


class RuntimeFakeElement {
  readonly dataset: Record<string, string> = {};
  readonly children: RuntimeFakeElement[] = [];
  readonly retryButton = new FakeButton();
  className = '';
  hidden = false;
  inert = false;
  innerHTML = '';
  textContent: string | null = '';
  isConnected = false;
  offsetWidth = 1;
  removed = false;
  readonly classList = {
    add: (..._tokens: string[]) => {},
    remove: (..._tokens: string[]) => {},
  };

  setAttribute(_name: string, _value: string): void {}

  querySelector(selector: string): FakeButton | null {
    return selector === '.death-retry' ? this.retryButton : null;
  }

  append(...children: RuntimeFakeElement[]): void {
    for (const child of children) {
      child.isConnected = true;
      this.children.push(child);
    }
  }

  remove(): void {
    this.isConnected = false;
    this.removed = true;
  }
}

class RuntimeFakeInput {
  private readonly held = new Set<InputAction>();
  private readonly pressed = new Set<InputAction>();
  enabled = true;
  pointerLocked = true;
  pointerDeltaX = 0;
  pointerDeltaY = 0;
  wasClearedSinceFixedUpdate = false;

  isDown(action: InputAction): boolean {
    return this.held.has(action);
  }

  wasPressed(action: InputAction): boolean {
    return this.pressed.has(action);
  }

  wasReleased(_action: InputAction): boolean {
    return false;
  }

  press(action: InputAction): void {
    this.held.add(action);
    this.pressed.add(action);
  }

  release(action: InputAction): void {
    this.held.delete(action);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetState();
  }

  resetState(): void {
    this.held.clear();
    this.pressed.clear();
  }

  endFixedUpdate(): void {
    this.pressed.clear();
  }

  endPointerUpdate(): void {}
  requestPointerLock(): void { this.pointerLocked = true; }
  releasePointerLock(): void { this.pointerLocked = false; }
}

class RuntimeFakeCameraRig {
  readonly camera = new THREE.PerspectiveCamera();
  readonly aimOrigin = new THREE.Vector3(2, 0.46, 2);
  readonly aimDirection = new THREE.Vector3(-2, 0.64, 6).normalize();
  aimActive = false;

  setFollowTarget(): void {}
  clearFollowTarget(): void {}
  reset(): void {}
  queueLookInput(): void {}
  applyQueuedLookInput(): void {}

  copyGroundMovementDirection(
    _x: number,
    _z: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return target.set(0, 0, 0);
  }

  copySurfaceMovementDirection(
    _x: number,
    _z: number,
    _up: unknown,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return target.set(0, 0, 0);
  }

  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
    origin.copy(this.aimOrigin);
    direction.copy(this.aimDirection);
  }

  setAimPresentationActive(active: boolean): void {
    this.aimActive = active;
  }

  update(): void {}
}

test('Blackout runtime preserves live Volt tether across checkpoint/switch/pause and clears it on restart/death/dispose', () => {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => new RuntimeFakeElement(),
    },
  });

  try {
    const scene = new THREE.Scene();
    const cameraRig = new RuntimeFakeCameraRig();
    const canvas = new RuntimeFakeElement();
    const renderLayer = {
      scene,
      canvas,
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const host = new RuntimeFakeElement();

    const runtime = new BlackoutLevelRuntime({
      host: host as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    runtime.load();
    runtime.start();

    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    input.release('aimAbility');
    input.release('fireAbility');
    runtime.fixedUpdate(1 / 60);
    runtime.activateCheckpoint('cp2');
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    runtime.stop();
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');
    assert.equal(cameraRig.aimActive, false);
    runtime.start();

    runtime.restartLevel();
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);

    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    assert.equal(runtime.requestFailure(), true);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);

    // A restart exits the deferred death state so merge takeover can be
    // verified independently.
    runtime.restartLevel();
    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    assert.equal(runtime.transitionPhase('merging'), true);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);

    runtime.dispose();
    assert.equal(runtime.state, 'disposed');
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});
