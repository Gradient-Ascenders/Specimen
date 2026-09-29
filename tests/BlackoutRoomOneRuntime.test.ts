import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import type { Input, InputAction } from '../src/core/Input.ts';
import type { LoopStats } from '../src/core/Loop.ts';
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';

class TestButton {
  private listeners = new Set<() => void>();
  addEventListener(_type: string, listener: () => void): void { this.listeners.add(listener); }
  removeEventListener(_type: string, listener: () => void): void { this.listeners.delete(listener); }
  focus(): void {}
  click(): void { for (const listener of this.listeners) listener(); }
}

class TestElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: TestElement[] = [];
  readonly retryButton = new TestButton();
  className = '';
  hidden = false;
  inert = false;
  innerHTML = '';
  textContent: string | null = '';
  offsetWidth = 1;
  isConnected = false;
  ownerDocument!: TestDocument;
  readonly classList = { add: (..._tokens: string[]) => {}, remove: (..._tokens: string[]) => {} };
  setAttribute(_name: string, _value: string): void {}
  querySelector(_selector: string): TestButton { return this.retryButton; }
  append(...children: TestElement[]): void {
    for (const child of children) { child.isConnected = true; this.children.push(child); }
  }
  remove(): void { this.isConnected = false; }
}

class TestDocument {
  readonly elements: TestElement[] = [];
  createElement(): TestElement {
    const element = new TestElement();
    element.ownerDocument = this;
    this.elements.push(element);
    return element;
  }
}

class TestInput {
  private readonly held = new Set<InputAction>();
  private readonly pressed = new Set<InputAction>();
  private readonly released = new Set<InputAction>();
  enabled = true;
  pointerLocked = true;
  pointerDeltaX = 0;
  pointerDeltaY = 0;
  wasClearedSinceFixedUpdate = false;
  isDown(action: InputAction): boolean { return this.held.has(action); }
  wasPressed(action: InputAction): boolean { return this.pressed.has(action); }
  wasReleased(action: InputAction): boolean { return this.released.has(action); }
  press(action: InputAction): void { this.held.add(action); this.pressed.add(action); }
  release(action: InputAction): void { if (this.held.delete(action)) this.released.add(action); }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.resetState(); }
  resetState(): void { this.held.clear(); this.pressed.clear(); this.released.clear(); }
  endFixedUpdate(): void { this.pressed.clear(); this.released.clear(); this.wasClearedSinceFixedUpdate = false; this.endPointerUpdate(); }
  endPointerUpdate(): void { this.pointerDeltaX = 0; this.pointerDeltaY = 0; }
  requestPointerLock(): void { this.pointerLocked = true; }
  releasePointerLock(): void { this.pointerLocked = false; }
}

class TestCameraRig {
  readonly camera = new THREE.PerspectiveCamera();
  aimActive = false;
  setFollowTarget(): void {}
  clearFollowTarget(): void {}
  reset(): void {}
  queueLookInput(): void {}
  applyQueuedLookInput(): void {}
  copyGroundMovementDirection(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target.set(x, 0, z).normalize();
  }
  copySurfaceMovementDirection(x: number, z: number, _up: unknown, target: THREE.Vector3): THREE.Vector3 {
    return target.set(x, 0, z).normalize();
  }
  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
    origin.set(0, 0.46, 2);
    direction.set(0, 0, 1);
  }
  setAimPresentationActive(active: boolean): void { this.aimActive = active; }
  update(): void {}
}

function roomOneInternals(runtime: BlackoutLevelRuntime) {
  const internal = runtime as unknown as {
    resources?: {
      group: {
        bobBody: { readonly position: THREE.Vector3 };
        goopBody: { readonly position: THREE.Vector3 };
        voltBody: { readonly position: THREE.Vector3 };
      };
      maintenanceBay?: {
        readonly target: { setConnectionState(connected: boolean): void };
        readonly door: { readonly progress: number; readonly state: string };
      };
    };
  };
  const resources = internal.resources;
  if (!resources?.maintenanceBay) {
    throw new Error('Room 1 runtime resources are not loaded.');
  }
  return {
    bodies: {
      bob: resources.group.bobBody,
      goop: resources.group.goopBody,
      volt: resources.group.voltBody,
    },
    bay: resources.maintenanceBay,
  };
}

function mutableRoomOneBodies(runtime: BlackoutLevelRuntime): Readonly<Record<'bob' | 'goop' | 'volt', { readonly position: THREE.Vector3 }>> {
  return roomOneInternals(runtime).bodies;
}

function createFixture() {
  const document = new TestDocument();
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  const scene = new THREE.Scene();
  const cameraRig = new TestCameraRig();
  const input = new TestInput();
  const host = document.createElement();
  const runtime = new BlackoutLevelRuntime({
    host: host as unknown as HTMLElement,
    input: input as unknown as Input,
    renderLayer: { scene, canvas: document.createElement(), cameraRig, render: () => {} } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop', 'volt'], activeSlimeId: 'volt' },
    authoredRoomOne: true,
  });
  runtime.load();
  runtime.start();
  const tick = (count = 1) => { for (let i = 0; i < count; i += 1) runtime.fixedUpdate(1 / 60); };
  const switchSlime = () => { input.press('switchSlime'); tick(); input.release('switchSlime'); tick(); };
  return {
    runtime, input, document, scene, cameraRig, tick, switchSlime,
    render: () => runtime.render(0, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>),
    cleanup: () => {
      runtime.dispose();
      Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    },
  };
}

test('authored Room 1 lets Goop aim, fire, and render acid projectiles', () => {
  const f = createFixture();
  try {
    f.switchSlime(); // Volt -> Bob
    f.switchSlime(); // Bob -> Goop
    f.input.press('aimAbility');
    f.tick();
    assert.equal(f.runtime.goopAimReadModel?.active, true);
    f.render();
    assert.equal(f.cameraRig.aimActive, true);

    f.input.press('fireAbility');
    f.tick();
    assert.equal(f.runtime.goopProjectileStates.some((projectile) => projectile.active), true);
    f.render();
    assert.equal(f.cameraRig.aimActive, true);
  } finally {
    f.cleanup();
  }
});

test('Room 1 retry restores Bob, Goop, and Volt to their shared checkpoint positions', () => {
  const f = createFixture();
  try {
    const start = f.runtime.getSlimePositions()!;
    f.input.press('moveRight');
    f.tick(20); // move Volt
    f.input.release('moveRight');
    f.switchSlime(); // Bob
    f.input.press('moveRight');
    f.tick(14);
    f.input.release('moveRight');
    f.switchSlime(); // Goop
    f.input.press('moveBackward');
    f.tick(12);
    f.input.release('moveBackward');
    f.tick();
    const displaced = f.runtime.getSlimePositions()!;
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(displaced[id].distanceTo(start[id]) > 0.2, `${id} should have moved before failure`);
    }

    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    const retryScreen = f.document.elements.find((element) => element.className === 'death-screen');
    assert.ok(retryScreen, 'death screen should be presented');
    retryScreen!.retryButton.click();

    const recovered = f.runtime.getSlimePositions()!;
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(recovered[id].distanceTo(start[id]) < 1e-6, `${id} should return to the checkpoint`);
    }
  } finally {
    f.cleanup();
  }
});


test('Room 1 activates CP2 once after the displayed Volt tutorial and restores a canonical drone state', () => {
  const f = createFixture();
  try {
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');

    f.input.press('mountDrone');
    f.tick();
    f.input.release('mountDrone');
    f.tick(340);

    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, true);
    assert.equal(f.runtime.maintenanceDroneReadModel?.mounted, true);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp2');
    assert.equal(f.runtime.roomState.local.tutorialComplete, true);
    assert.deepEqual(
      f.runtime.activeCheckpoint?.participantState['maintenance-drone'],
      {
        position: [3.5, 0.26, 2],
        stableState: 'grounded-idle',
        startupCompleted: true,
        tutorialCompleted: true,
        voltMounted: false,
      },
    );

    f.tick(30);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp2');

    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    const retryScreen = f.document.elements.find(
      (element) => element.className === 'death-screen',
    );
    assert.ok(retryScreen);
    retryScreen!.retryButton.click();

    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp2');
    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, true);
    assert.equal(f.runtime.maintenanceDroneReadModel?.mounted, false);
    assert.equal(f.runtime.maintenanceDroneReadModel?.state, 'grounded-idle');
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), [-2, 0.46, 2]);
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), [0, 0.46, 2]);
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), [2, 0.46, 2]);
  } finally {
    f.cleanup();
  }
});

test('Room 1 completion initializes Room 2 exactly once and CP3 owns later recovery', () => {
  const f = createFixture();
  try {
    const bodies = mutableRoomOneBodies(f.runtime);
    let roomTwoObjectives = 0;
    const unsubscribe = f.runtime.events.on('objectiveChanged', ({ roomId }) => {
      if (roomId === 'room-2') roomTwoObjectives += 1;
    });

    bodies.bob.position.set(6, 0.46, 62);
    bodies.goop.position.set(6.8, 0.46, 62);

    // Establish a bay-side previous sample, cross the entrance, traverse the
    // duct forward, then cross its outlet before entering the reunion hallway.
    bodies.volt.position.set(-6, 0.46, 53);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 54);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 59.8);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 60.5);
    f.tick();
    bodies.volt.position.set(6, 0.46, 62);
    f.tick();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.roomState.local.maintenanceBayComplete, true);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(roomTwoObjectives, 1);
    assert.equal(f.runtime.voltElectricalReadModel?.connectedTargetId, undefined);

    f.tick(20);
    assert.equal(roomTwoObjectives, 1);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');

    bodies.bob.position.set(6, 0.46, 57);
    bodies.goop.position.set(7, 0.46, 57);
    bodies.volt.position.set(8, 0.46, 57);
    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    const retryScreen = f.document.elements.find(
      (element) => element.className === 'death-screen',
    );
    assert.ok(retryScreen);
    retryScreen!.retryButton.click();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), [4.25, 0.46, 80]);
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), [6, 0.46, 80]);
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), [7.75, 0.46, 80]);

    f.runtime.restartLevel();
    assert.equal(f.runtime.roomState.roomId, 'room-1');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, false);
    unsubscribe();
  } finally {
    f.cleanup();
  }
});


test('Room 1 stays authoritative after the CP3 handoff while players can return from staging', () => {
  const f = createFixture();
  try {
    const { bodies, bay } = roomOneInternals(f.runtime);

    // Put the powered door well into its opening animation, then remove power
    // before completing the room. The handoff must not freeze the still-reachable
    // door at this partial pose.
    bay.target.setConnectionState(true);
    f.tick(82);
    assert.ok(
      bay.door.progress > 0.5 && bay.door.progress < 1,
      `door should be partly open before completion, got ${bay.door.progress}`,
    );
    bay.target.setConnectionState(false);

    bodies.bob.position.set(6, 0.46, 62);
    bodies.goop.position.set(6.8, 0.46, 62);
    bodies.volt.position.set(-6, 0.46, 53);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 54);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 59.8);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 60.5);
    f.tick();
    bodies.volt.position.set(6, 0.46, 62);
    f.tick();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.ok(
      bay.door.progress > 0,
      'completion should occur before the already-open door finishes closing',
    );

    f.tick(30);
    assert.equal(bay.door.state, 'closed');
    assert.equal(bay.door.progress, 0);

    // Room 1 remains physically reachable from the staging corridor. Returning
    // Bob to the acid must still use the normal death path even after CP3.
    bodies.bob.position.set(8, -0.49, 18);
    f.tick();
    f.tick(70);
    const retryScreen = f.document.elements.find(
      (element) => element.className === 'death-screen',
    );
    assert.ok(
      retryScreen,
      'post-handoff Room 1 acid must remain lethal instead of being disabled',
    );
    retryScreen!.retryButton.click();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), [4.25, 0.46, 80]);
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), [6, 0.46, 80]);
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), [7.75, 0.46, 80]);
  } finally {
    f.cleanup();
  }
});
