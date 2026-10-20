import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CleanGameplayMode,
  isEditableTarget,
} from '../src/ui/CleanGameplayMode.ts';
import type {
  GameFlowState,
  GameFlowStateListener,
} from '../src/ui/GameFlowUI.ts';
import {
  GAMEPLAY_UI_LAYER,
  withGameplayUiVisibility,
} from '../src/render/GameplayUiLayer.ts';
import { SlimePairPresentation } from '../src/slimes/SlimePairPresentation.ts';
import { ContainmentCollisionOverlay } from '../src/render/environment/containment/ContainmentCollisionOverlay.ts';
import { ContainmentTeachingScene } from '../src/levels/ContainmentTeachingScene.ts';

function fixture(initialState: GameFlowState = 'playing') {
  const listeners = new Set<GameFlowStateListener>();
  const flow = {
    state: initialState,
    subscribe(listener: GameFlowStateListener) {
      listeners.add(listener);
      listener(this.state);
      return () => {
        listeners.delete(listener);
      };
    },
    change(state: GameFlowState) {
      this.state = state;
      for (const listener of listeners) listener(state);
    },
  };
  const hostWindow = new EventTarget();
  const document = { activeElement: null as unknown };
  let essential = false,
    prepared = 0;
  const host = {
    dataset: { gameState: 'playing' } as Record<string, string>,
    ownerDocument: document,
    querySelector: () => (essential ? {} : null),
  };
  const presented: boolean[] = [];
  const mode = new CleanGameplayMode({
    host: host as unknown as HTMLElement,
    flow,
    window: hostWindow as unknown as Window,
    prepareGameplay: () => {
      prepared++;
    },
    present: (value) => presented.push(value),
  });
  const key = (overrides: Record<string, unknown> = {}) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code: 'F1', repeat: false, ...overrides });
    hostWindow.dispatchEvent(event);
    return event;
  };
  return {
    flow,
    host,
    document,
    mode,
    key,
    presented,
    listeners,
    get prepared() {
      return prepared;
    },
    setEssential: (value: boolean) => {
      essential = value;
    },
  };
}

test('F1 toggles a single visibility boundary, cancels help and ignores auto-repeat/modifiers', () => {
  const f = fixture();
  try {
    assert.equal(f.key({ code: 'KeyF' }).defaultPrevented, false);
    assert.equal(f.key().defaultPrevented, true);
    assert.equal(f.host.dataset.cleanGameplay, 'true');
    assert.equal(f.prepared, 1);
    assert.equal(f.key({ repeat: true }).defaultPrevented, true);
    assert.equal(f.key({ ctrlKey: true }).defaultPrevented, false);
    assert.equal(f.host.dataset.cleanGameplay, 'true');
    f.key();
    assert.equal(f.host.dataset.cleanGameplay, undefined);
    assert.deepEqual(f.presented, [false, true, false]);
  } finally {
    f.mode.dispose();
  }
});

test('main menu/loading/death/preparation and editable targets never toggle', () => {
  const f = fixture('loading');
  try {
    for (const state of [
      'loading',
      'title',
      'paused',
      'settings',
      'credits',
      'transitioning',
      'restarting',
      'transitionFailed',
    ] as const) {
      f.flow.change(state);
      assert.equal(f.key().defaultPrevented, true);
      assert.equal(f.host.dataset.cleanGameplay, undefined);
    }
    f.flow.change('playing');
    f.host.dataset.gameState = 'gameOver';
    assert.equal(f.key().defaultPrevented, true);
    f.host.dataset.gameState = 'playing';
    f.setEssential(true);
    assert.equal(f.key().defaultPrevented, true);
    f.setEssential(false);
    f.document.activeElement = { isContentEditable: true };
    assert.equal(f.key().defaultPrevented, false);
    assert.equal(f.prepared, 0);
  } finally {
    f.mode.dispose();
  }
  assert.equal(
    isEditableTarget({ closest: () => ({}) } as unknown as EventTarget),
    true,
  );
  assert.equal(
    isEditableTarget({ isContentEditable: true } as unknown as EventTarget),
    true,
  );
  assert.equal(isEditableTarget(new EventTarget()), false);
  assert.equal(isEditableTarget(null), false);
});

test('preference survives pause, nested menus, restart and all level transitions', () => {
  const f = fixture();
  try {
    f.key();
    for (const state of [
      'paused',
      'settings',
      'paused',
      'restarting',
      'playing',
      'transitioning',
      'playing',
      'transitioning',
      'playing',
    ] as const) {
      f.flow.change(state);
      assert.equal(
        f.host.dataset.cleanGameplay,
        state === 'playing' ? 'true' : undefined,
      );
      assert.equal(f.presented.at(-1), state === 'playing');
    }
    f.key();
    assert.equal(f.host.dataset.cleanGameplay, undefined);
  } finally {
    f.mode.dispose();
  }
});

test('shutdown removes listeners/subscriptions and restores normal presentation idempotently', () => {
  const f = fixture();
  f.key();
  f.mode.dispose();
  f.mode.dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.host.dataset.cleanGameplay, undefined);
  const count = f.presented.length;
  f.key();
  f.flow.change('paused');
  assert.equal(f.presented.length, count);
});

test('WebGL UI filtering leaves world effects, object visibility and camera state untouched', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(GAMEPLAY_UI_LAYER);
  camera.layers.enable(2);
  const mask = camera.layers.mask,
    world = new THREE.Points(),
    ui = new THREE.Sprite();
  ui.layers.set(GAMEPLAY_UI_LAYER);
  camera.position.set(1, 2, 3);
  withGameplayUiVisibility(camera, false, () => {
    assert.equal(camera.layers.test(ui.layers), false);
    assert.equal(camera.layers.test(world.layers), true);
    assert.equal(ui.visible, true);
    assert.deepEqual(camera.position.toArray(), [1, 2, 3]);
  });
  assert.equal(camera.layers.mask, mask);
  assert.throws(() =>
    withGameplayUiVisibility(camera, false, () => {
      throw new Error('draw failed');
    }),
  );
  assert.equal(camera.layers.mask, mask);
  assert.equal(
    withGameplayUiVisibility(camera, true, () => camera.layers.test(ui.layers)),
    true,
  );
});

test('actual inactive-body locators and debug collision lines use the UI layer exclusively', () => {
  const pair = new SlimePairPresentation(0.45);
  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const overlay = new ContainmentCollisionOverlay([collider]);
  try {
    overlay.setVisible(true);
    for (const object of [...pair.root.children, ...collider.children])
      assert.equal(object.layers.mask, 1 << GAMEPLAY_UI_LAYER);
    assert.equal(collider.layers.mask, 1);
    assert.equal(
      overlay.isVisible,
      true,
      'clean rendering never overwrites the debug selection',
    );
  } finally {
    pair.dispose();
    overlay.dispose();
    collider.geometry.dispose();
  }
});

test('only the development Room 2 recovery ring remains, on the UI layer', () => {
  const target = {
    root: new THREE.Group(),
    ownedGeometries: new Set<THREE.BufferGeometry>(),
    ownedMaterials: new Set<THREE.Material>(),
  };
  const material = new THREE.MeshBasicMaterial();
  try {
    (ContainmentTeachingScene.prototype as any).addReferenceMarkers.call(
      target,
      material,
    );
    assert.equal(target.root.children.length, 1);
    assert.equal(target.root.children[0].name, 'room-2-safe-recovery-marker');
    assert.equal(target.root.getObjectByName('room-1-safe-spawn-marker'), undefined);
    for (const marker of target.root.children)
      assert.equal(marker.layers.mask, 1 << GAMEPLAY_UI_LAYER);
  } finally {
    for (const geometry of target.ownedGeometries) geometry.dispose();
    for (const owned of target.ownedMaterials) owned.dispose();
    material.dispose();
  }
});
