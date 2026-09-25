import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { Input, InputAction } from '../src/core/Input.ts';
import type { LoopStats } from '../src/core/Loop.ts';
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
  private readonly released = new Set<InputAction>();
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

  wasReleased(action: InputAction): boolean {
    return this.released.has(action);
  }

  press(action: InputAction): void {
    this.held.add(action);
    this.pressed.add(action);
  }

  release(action: InputAction): void {
    if (this.held.delete(action)) this.released.add(action);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetState();
  }

  resetState(): void {
    this.held.clear();
    this.pressed.clear();
    this.released.clear();
  }

  endFixedUpdate(): void {
    this.pressed.clear();
    this.released.clear();
    this.wasClearedSinceFixedUpdate = false;
    this.endPointerUpdate();
  }

  endPointerUpdate(): void {
    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;
  }

  requestPointerLock(): void { this.pointerLocked = true; }
  releasePointerLock(): void { this.pointerLocked = false; }
}

class RuntimeFakeCameraRig {
  readonly camera = new THREE.PerspectiveCamera();
  readonly aimOrigin = new THREE.Vector3(2, 0.46, 2);
  readonly aimDirection = new THREE.Vector3(-2, 0.64, 6).normalize();
  aimActive = false;
  queuedLookX = 0;
  queuedLookY = 0;
  appliedLookX = 0;
  appliedLookY = 0;

  setFollowTarget(): void {}
  clearFollowTarget(): void {}
  reset(): void {}
  queueLookInput(deltaX: number, deltaY: number): void {
    this.queuedLookX += deltaX;
    this.queuedLookY += deltaY;
  }

  applyQueuedLookInput(): void {
    this.appliedLookX += this.queuedLookX;
    this.appliedLookY += this.queuedLookY;
    this.queuedLookX = 0;
    this.queuedLookY = 0;
  }

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

  update(): void {
    this.applyQueuedLookInput();
  }
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
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-terminal')?.powered,
      true,
    );
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-door')?.powered,
      true,
    );

    input.release('aimAbility');
    input.release('fireAbility');
    runtime.fixedUpdate(1 / 60);
    runtime.activateCheckpoint('cp2');
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    runtime.recoverActiveCheckpoint();
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-terminal')?.powered,
      false,
    );
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-door')?.powered,
      false,
    );

    input.requestPointerLock();
    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    input.release('aimAbility');
    input.release('fireAbility');
    runtime.fixedUpdate(1 / 60);

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-door')?.powered,
      true,
    );

    runtime.stop();
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');
    assert.equal(cameraRig.aimActive, false);
    runtime.start();

    runtime.restartLevel();
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-door')?.powered,
      false,
    );

    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    assert.equal(runtime.requestFailure(), true);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-door')?.powered,
      false,
    );

    // A restart exits the deferred death state so merge takeover can be
    // verified independently.
    runtime.restartLevel();
    input.requestPointerLock();
    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');

    assert.equal(runtime.transitionPhase('merging'), true);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined);
    assert.equal(
      runtime.getPoweredDeviceReadModel('fixture-door')?.powered,
      false,
    );
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


test('Blackout render consumes pointer movement on a frame with zero fixed steps', () => {
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
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    runtime.load();
    runtime.start();

    // Simulate a 144 Hz render frame arriving before the next 60 Hz fixed
    // update. The sample must be queued before endPointerUpdate clears it.
    input.pointerDeltaX = 12;
    input.pointerDeltaY = -7;
    runtime.render(
      0,
      {
        frameDeltaSeconds: 1 / 144,
      } as Readonly<LoopStats>,
    );

    assert.equal(cameraRig.appliedLookX, 12);
    assert.equal(cameraRig.appliedLookY, -7);
    assert.equal(cameraRig.queuedLookX, 0);
    assert.equal(cameraRig.queuedLookY, 0);
    assert.equal(input.pointerDeltaX, 0);
    assert.equal(input.pointerDeltaY, 0);

    // A later fixed update cannot consume the already-rendered sample again.
    runtime.fixedUpdate(1 / 60);
    assert.equal(cameraRig.appliedLookX, 12);
    assert.equal(cameraRig.appliedLookY, -7);

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});


test('Blackout merge hands control to Specimen once, disables switching, and exposes merged HUD state', () => {
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
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    runtime.load();
    runtime.start();

    assert.equal(runtime.beginMerge(), true);
    assert.equal(runtime.beginMerge(), false);
    assert.equal(runtime.phase, 'merging');
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'group');

    input.pointerDeltaX = 20;
    input.pointerDeltaY = -12;
    runtime.render(
      0,
      { frameDeltaSeconds: 1 / 144 } as Readonly<LoopStats>,
    );
    assert.equal(cameraRig.appliedLookX, 0);
    assert.equal(cameraRig.appliedLookY, 0);
    assert.equal(cameraRig.queuedLookX, 0);
    assert.equal(cameraRig.queuedLookY, 0);

    input.press('switchSlime');
    for (let index = 0; index < 359; index += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.equal(runtime.phase, 'merging');
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'group');

    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.phase, 'specimen');
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'specimen');
    assert.equal(runtime.specimenFormReadModel?.mergeProgress, 1);

    const hud = runtime.getSlimeHUDSnapshot();
    assert.equal(hud.controlledForm, 'specimen');
    assert.equal(hud.activeFormLabel, 'SPECIMEN');
    assert.equal(hud.activeSlimeId, undefined);

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'specimen');
    assert.equal(runtime.getSlimeHUDSnapshot().activeSlimeId, undefined);

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});

test('Blackout Specimen tap attack uses the bounded pool and death clears combat immediately', () => {
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
    cameraRig.aimOrigin.set(0, 0.675, 62);
    cameraRig.aimDirection.set(0, 0, 1);
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'bob',
      },
    });

    runtime.load();
    runtime.start();
    assert.equal(runtime.beginMerge(), true);
    for (let index = 0; index < 360; index += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.equal(runtime.phase, 'specimen');

    input.press('aimAbility');
    input.press('fireAbility');
    input.release('fireAbility');
    runtime.fixedUpdate(1 / 60);

    assert.equal(runtime.specimenAttackReadModel?.aimActive, true);
    assert.equal(runtime.specimenAttackReadModel?.charging, false);
    assert.equal(runtime.specimenAttackReadModel?.liveProjectileCount, 1);
    assert.equal(runtime.specimenProjectileStates.length, 12);
    assert.equal(
      runtime.specimenProjectileStates.filter((state) => state.active).length,
      1,
    );

    assert.equal(runtime.requestFailure(), true);
    assert.equal(runtime.specimenAttackReadModel?.aimActive, false);
    assert.equal(runtime.specimenAttackReadModel?.chargeAmount, 0);
    assert.equal(runtime.specimenAttackReadModel?.liveProjectileCount, 0);
    assert.equal(
      runtime.specimenProjectileStates.every((state) => !state.active),
      true,
    );

    runtime.dispose();
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});

test('CP8 recovery restores stable Specimen, Sentinel exclusively owns boss defeat, and recovery resets the encounter', () => {
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
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'goop',
      },
    });

    runtime.load();
    runtime.start();

    runtime.activateCheckpoint('cp8');
    runtime.recoverActiveCheckpoint();
    assert.equal(runtime.phase, 'specimen');
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'specimen');
    assert.equal(runtime.activeCheckpoint?.controlledForm, 'specimen');
    assert.deepEqual(runtime.activeCheckpoint?.specimenPosition, [
      0,
      0.685,
      65,
    ]);
    assert.equal(runtime.getSlimeHUDSnapshot().activeFormLabel, 'SPECIMEN');
    assert.equal(runtime.sentinelBossReadModel?.state, 'idle');

    assert.equal(runtime.transitionPhase('boss'), true);
    assert.equal(runtime.phase, 'boss');
    assert.equal(runtime.sentinelBossReadModel?.state, 'intro');

    // No external caller may skip the Sentinel state machine.
    assert.equal(runtime.transitionPhase('boss-defeated'), false);
    assert.equal(runtime.beginSplit(), false);

    for (let index = 0; index < 30; index += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.equal(runtime.sentinelBossReadModel?.state, 'intro');

    assert.equal(runtime.requestFailure(), true);
    runtime.recoverActiveCheckpoint();
    assert.equal(runtime.phase, 'specimen');
    assert.equal(runtime.sentinelBossReadModel?.state, 'idle');
    assert.equal(runtime.sentinelBossReadModel?.armourLayersRemaining, 3);
    assert.equal(runtime.sentinelBossReadModel?.coreHealth, 1);
    assert.equal(runtime.sentinelBossReadModel?.currentAttackId, null);

    runtime.restartLevel();
    assert.equal(runtime.phase, 'three-slime');
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'group');
    assert.equal(runtime.getSlimeHUDSnapshot().activeSlimeId, 'goop');
    assert.equal(runtime.sentinelBossReadModel?.state, 'idle');

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});


test('optional CP9 rejects idle/live-attack capture and restores only from a stable active Sentinel boundary', () => {
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
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'bob',
      },
    });

    runtime.load();
    runtime.start();
    runtime.activateCheckpoint('cp8');
    runtime.recoverActiveCheckpoint();

    assert.throws(
      () => runtime.activateCheckpoint('cp9'),
      /stable boundary during an active Sentinel fight/,
    );

    assert.equal(runtime.transitionPhase('boss'), true);
    assert.equal(runtime.sentinelBossReadModel?.state, 'intro');
    assert.throws(
      () => runtime.activateCheckpoint('cp9'),
      /stable boundary during an active Sentinel fight/,
    );

    // Intro completion enters phase 1 before its first attack starts, which is
    // an explicit stable checkpoint boundary.
    for (let index = 0; index < 150; index += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.equal(runtime.sentinelBossReadModel?.state, 'phase-1');
    assert.equal(runtime.sentinelBossReadModel?.currentAttackId, null);

    runtime.activateCheckpoint('cp9');
    assert.equal(runtime.activeCheckpoint?.checkpointId, 'cp9');
    assert.equal(runtime.activeCheckpoint?.room.phase, 'boss');

    // The next step starts the sweep, so CP9 capture becomes unsafe again.
    runtime.fixedUpdate(1 / 60);
    assert.notEqual(runtime.sentinelBossReadModel?.currentAttackId, null);
    assert.throws(
      () => runtime.activateCheckpoint('cp9'),
      /stable boundary during an active Sentinel fight/,
    );

    runtime.recoverActiveCheckpoint();
    assert.equal(runtime.phase, 'boss');
    assert.equal(runtime.sentinelBossReadModel?.state, 'phase-1');
    assert.equal(runtime.sentinelBossReadModel?.currentAttackId, null);
    assert.equal(runtime.specimenFormReadModel?.controlledForm, 'specimen');

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});


class RuntimeFlightCameraRig extends RuntimeFakeCameraRig {
  override copyGroundMovementDirection(
    x: number,
    z: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return target.set(x, 0, -z);
  }

  override copySurfaceMovementDirection(
    x: number,
    z: number,
    _up: unknown,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return target.set(x, 0, -z);
  }
}

test('Blackout maintenance drone mounts only Volt, parks exactly across slime switches, and resumes safely', () => {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => new RuntimeFakeElement(),
    },
  });

  try {
    const scene = new THREE.Scene();
    const cameraRig = new RuntimeFlightCameraRig();
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    runtime.load();
    runtime.start();
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.maintenanceDroneReadModel?.mountAvailable, true);

    input.press('mountDrone');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'starting');

    for (let step = 0; step < 90; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'mounted');
    assert.equal(runtime.maintenanceDroneReadModel?.startupCompleted, true);
    assert.equal(runtime.maintenanceDroneReadModel?.tutorialCompleted, false);
    assert.equal(
      runtime.maintenanceDroneReadModel?.firstMountTutorialAvailable,
      true,
    );
    runtime.markMaintenanceDroneTutorialCompleted();
    assert.equal(runtime.maintenanceDroneReadModel?.tutorialCompleted, true);
    assert.equal(
      runtime.maintenanceDroneReadModel?.firstMountTutorialAvailable,
      false,
    );

    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(
      runtime.voltElectricalReadModel?.connectedTargetId,
      'fixture-terminal',
    );
    input.release('aimAbility');
    input.release('fireAbility');
    runtime.fixedUpdate(1 / 60);

    input.press('moveForward');
    for (let step = 0; step < 30; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    input.release('moveForward');
    runtime.fixedUpdate(1 / 60);
    const movingZ = runtime.maintenanceDroneReadModel!.position.z;
    assert.notEqual(movingZ, 2);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, undefined,
      'flying while conducting must disconnect the tether');
    // Reconnect once stationary: switching away must still preserve this
    // newly established connection while the drone remains parked.
    input.press('aimAbility');
    input.press('fireAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.connectedTargetId, 'fixture-terminal');
    input.release('aimAbility');
    input.release('fireAbility');

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.getSlimeHUDSnapshot().activeSlimeId, 'bob');
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'parked-hover');
    assert.equal(runtime.maintenanceDroneReadModel?.lightEnabled, true);
    assert.equal(runtime.maintenanceDroneReadModel?.mountAvailable, false);
    assert.equal(
      runtime.voltElectricalReadModel?.connectedTargetId,
      'fixture-terminal',
      'parked Volt must preserve the established electrical tether',
    );
    const parked = [
      runtime.maintenanceDroneReadModel!.position.x,
      runtime.maintenanceDroneReadModel!.position.y,
      runtime.maintenanceDroneReadModel!.position.z,
    ] as const;

    for (let step = 0; step < 120; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.deepEqual(
      [
        runtime.maintenanceDroneReadModel!.position.x,
        runtime.maintenanceDroneReadModel!.position.y,
        runtime.maintenanceDroneReadModel!.position.z,
      ],
      [...parked],
    );

    input.press('mountDrone');
    runtime.fixedUpdate(1 / 60);
    assert.equal(
      runtime.maintenanceDroneReadModel?.state,
      'parked-hover',
      'Bob M input must not alter the drone',
    );

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.getSlimeHUDSnapshot().activeSlimeId, 'goop');
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'parked-hover');

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.getSlimeHUDSnapshot().activeSlimeId, 'volt');
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'mounted');
    assert.equal(runtime.maintenanceDroneReadModel?.horizontalSpeed, 0);
    assert.equal(runtime.maintenanceDroneReadModel?.verticalSpeed, 0);

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});

test('mounted Volt ascends/descends, aim freezes the drone, and existing electrical aim remains active', () => {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => new RuntimeFakeElement(),
    },
  });

  try {
    const scene = new THREE.Scene();
    const cameraRig = new RuntimeFlightCameraRig();
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    runtime.load();
    runtime.start();
    runtime.fixedUpdate(1 / 60);
    input.press('mountDrone');
    runtime.fixedUpdate(1 / 60);
    for (let step = 0; step < 90; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }

    const baseY = runtime.maintenanceDroneReadModel!.position.y;
    input.press('jump');
    for (let step = 0; step < 30; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    input.release('jump');
    runtime.fixedUpdate(1 / 60);
    const raisedY = runtime.maintenanceDroneReadModel!.position.y;
    assert.ok(raisedY > baseY);

    input.press('droneDescend');
    for (let step = 0; step < 40; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    input.release('droneDescend');
    runtime.fixedUpdate(1 / 60);
    assert.ok(runtime.maintenanceDroneReadModel!.position.y < raisedY);

    input.press('moveForward');
    for (let step = 0; step < 10; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.ok(runtime.maintenanceDroneReadModel!.horizontalSpeed > 0);

    // Focus/menu input clearing is an immediate velocity-cancellation boundary.
    input.resetState();
    input.wasClearedSinceFixedUpdate = true;
    const beforeClear = [
      runtime.maintenanceDroneReadModel!.position.x,
      runtime.maintenanceDroneReadModel!.position.y,
      runtime.maintenanceDroneReadModel!.position.z,
    ] as const;
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.maintenanceDroneReadModel?.horizontalSpeed, 0);
    assert.equal(runtime.maintenanceDroneReadModel?.verticalSpeed, 0);
    assert.deepEqual(
      [
        runtime.maintenanceDroneReadModel!.position.x,
        runtime.maintenanceDroneReadModel!.position.y,
        runtime.maintenanceDroneReadModel!.position.z,
      ],
      [...beforeClear],
    );

    input.press('moveForward');
    for (let step = 0; step < 10; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    const beforeAim = [
      runtime.maintenanceDroneReadModel!.position.x,
      runtime.maintenanceDroneReadModel!.position.y,
      runtime.maintenanceDroneReadModel!.position.z,
    ] as const;

    input.press('aimAbility');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.voltElectricalReadModel?.aimActive, true);
    assert.deepEqual(
      [
        runtime.maintenanceDroneReadModel!.position.x,
        runtime.maintenanceDroneReadModel!.position.y,
        runtime.maintenanceDroneReadModel!.position.z,
      ],
      [...beforeAim],
    );
    assert.equal(runtime.maintenanceDroneReadModel?.horizontalSpeed, 0);
    assert.equal(runtime.maintenanceDroneReadModel?.verticalSpeed, 0);

    // Render-only pointer sampling remains intact while mounted/aiming.
    input.pointerDeltaX = 9;
    input.pointerDeltaY = -4;
    runtime.render(
      0,
      { frameDeltaSeconds: 1 / 144 } as Readonly<LoopStats>,
    );
    assert.equal(cameraRig.appliedLookX, 9);
    assert.equal(cameraRig.appliedLookY, -4);

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});

test('maintenance drone checkpoint recovery survives death cancellation and repeated restart', () => {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => new RuntimeFakeElement(),
    },
  });

  try {
    const scene = new THREE.Scene();
    const cameraRig = new RuntimeFlightCameraRig();
    const renderLayer = {
      scene,
      canvas: new RuntimeFakeElement(),
      cameraRig,
      render: () => {},
    } as unknown as RenderLayer;
    const input = new RuntimeFakeInput();
    const runtime = new BlackoutLevelRuntime({
      host: new RuntimeFakeElement() as unknown as HTMLElement,
      input: input as unknown as Input,
      renderLayer,
      progression: {
        unlockedSlimeIds: ['bob', 'goop', 'volt'],
        activeSlimeId: 'volt',
      },
    });

    runtime.load();
    runtime.start();
    runtime.fixedUpdate(1 / 60);
    input.press('mountDrone');
    runtime.fixedUpdate(1 / 60);
    for (let step = 0; step < 90; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    runtime.markMaintenanceDroneTutorialCompleted();
    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'parked-hover');

    runtime.activateCheckpoint('cp1');
    const captured = [
      runtime.maintenanceDroneReadModel!.position.x,
      runtime.maintenanceDroneReadModel!.position.y,
      runtime.maintenanceDroneReadModel!.position.z,
    ] as const;

    assert.equal(runtime.requestMaintenanceDroneRecovery('acid'), true);
    for (let step = 0; step < 80; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.notEqual(runtime.maintenanceDroneReadModel?.state, 'parked-hover');

    runtime.recoverActiveCheckpoint();
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'parked-hover');
    assert.equal(runtime.maintenanceDroneReadModel?.startupCompleted, true);
    assert.equal(runtime.maintenanceDroneReadModel?.tutorialCompleted, true);
    assert.equal(
      runtime.maintenanceDroneReadModel?.firstMountTutorialAvailable,
      false,
    );
    assert.deepEqual(
      [
        runtime.maintenanceDroneReadModel!.position.x,
        runtime.maintenanceDroneReadModel!.position.y,
        runtime.maintenanceDroneReadModel!.position.z,
      ],
      [...captured],
    );

    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    input.press('switchSlime');
    runtime.fixedUpdate(1 / 60);
    assert.equal(runtime.getSlimeHUDSnapshot().activeSlimeId, 'volt');
    assert.equal(runtime.maintenanceDroneReadModel?.state, 'mounted');

    input.press('moveForward');
    for (let step = 0; step < 10; step += 1) {
      runtime.fixedUpdate(1 / 60);
    }
    assert.ok(runtime.maintenanceDroneReadModel!.horizontalSpeed > 0);

    assert.equal(runtime.requestFailure(), true);
    assert.equal(runtime.maintenanceDroneReadModel?.horizontalSpeed, 0);
    assert.equal(runtime.maintenanceDroneReadModel?.verticalSpeed, 0);

    for (let restart = 0; restart < 3; restart += 1) {
      runtime.restartLevel();
      assert.equal(runtime.maintenanceDroneReadModel?.state, 'damaged-idle');
      assert.equal(runtime.maintenanceDroneReadModel?.startupCompleted, false);
      assert.equal(runtime.maintenanceDroneReadModel?.tutorialCompleted, false);
      assert.equal(
        runtime.maintenanceDroneReadModel?.firstMountTutorialAvailable,
        false,
      );
      runtime.fixedUpdate(1 / 60);
      assert.equal(runtime.maintenanceDroneReadModel?.mountAvailable, true);
    }

    runtime.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});
