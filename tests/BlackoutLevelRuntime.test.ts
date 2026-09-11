import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { Input } from '../src/core/Input.ts';
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
