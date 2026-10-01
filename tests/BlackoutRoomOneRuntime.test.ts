import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import type { Input, InputAction } from '../src/core/Input.ts';
import type { LoopStats } from '../src/core/Loop.ts';
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';
import { BLACKOUT_TRANSIT_CHECKPOINTS } from '../src/levels/BlackoutTransitRoom.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import type { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import type { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';
import type { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';

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
  readonly aimOrigin = new THREE.Vector3(0, 0.46, 2);
  readonly aimDirection = new THREE.Vector3(0, 0, 1);
  aimActive = false;
  groundYaw = 0;
  setFollowTarget(): void {}
  clearFollowTarget(): void {}
  reset(): void { this.groundYaw = 0; }
  setGroundOrbitYawRadians(yaw: number): void { this.groundYaw = yaw; }
  queueLookInput(): void {}
  applyQueuedLookInput(): void {}
  copyGroundMovementDirection(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target.set(x, 0, z).normalize();
  }
  copySurfaceMovementDirection(x: number, z: number, _up: unknown, target: THREE.Vector3): THREE.Vector3 {
    return target.set(x, 0, z).normalize();
  }
  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
    origin.copy(this.aimOrigin);
    direction.copy(this.aimDirection);
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

function electricalRoomInternals(runtime: BlackoutLevelRuntime) {
  return (runtime as unknown as { resources: {
    group: { bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody };
    maintenanceBay: BlackoutMaintenanceBayController;
    transit: BlackoutTransitController;
    electricalSystem: VoltElectricalSystem<KinematicBody>;
    electricalTargets: ElectricalTargetRegistry;
  } }).resources;
}

test('Room 1 CP1 and CP2 cannot acquire the distant maintenance circuit, but approaching it still works', () => {
  const f = createFixture();
  try {
    const resources = electricalRoomInternals(f.runtime);
    const socket = new THREE.Vector3();
    resources.maintenanceBay.target.copySocketWorldPosition(socket);
    for (const checkpoint of ['cp1', 'cp2'] as const) {
      f.runtime.activateCheckpoint(checkpoint);
      f.runtime.recoverActiveCheckpoint();
      f.tick();
      const volt = resources.group.voltBody;
      assert.ok(volt.position.distanceTo(socket) > 40, 'test uses the actual starting-side body position');
      f.cameraRig.aimOrigin.copy(volt.position);
      f.cameraRig.aimDirection.subVectors(socket, volt.position).normalize();
      f.input.press('aimAbility');
      f.input.press('fireAbility');
      f.tick();
      const readModel = resources.electricalSystem.readModel;
      assert.equal(readModel.acquisitionRangeMetres, 11);
      assert.equal(readModel.instabilityWarningRangeMetres, 12);
      assert.equal(readModel.tetherBreakRangeMetres, 13);
      assert.equal(readModel.connectedTargetId, undefined, `${checkpoint} must not bypass the drone/proximity tutorial`);
      assert.equal(resources.maintenanceBay.powered, false);
      f.input.release('fireAbility');
      f.input.release('aimAbility');
      f.tick();
    }

    const volt = resources.group.voltBody;
    volt.teleport(socket.clone().add(new THREE.Vector3(0, 0, -5)));
    f.cameraRig.aimOrigin.copy(volt.position);
    f.cameraRig.aimDirection.subVectors(socket, volt.position).normalize();
    f.input.press('aimAbility');
    f.input.press('fireAbility');
    f.tick();
    assert.equal(resources.electricalSystem.readModel.connectedTargetId, 'maintenance-bay-circuit');
    assert.equal(resources.maintenanceBay.powered, true, 'the original near-range circuit remains usable');
  } finally { f.cleanup(); }
});

test('the complete runtime grants long range only inside Room 2, including early arrivals and recovery', () => {
  const f = createFixture();
  try {
    const resources = electricalRoomInternals(f.runtime);
    for (const drone of resources.transit.drones) drone.setEnabled(false);
    const targets = [
      ...resources.transit.lights.map(receiver => receiver.target),
      ...resources.transit.lifts.map(lift => {
        const contact = lift.root.getObjectByName(`${lift.id}-conducting-contact`) as THREE.Mesh;
        assert.ok(contact);
        return resources.electricalTargets.getRegistrationForMesh(contact)!.target;
      }),
    ];
    const socket = new THREE.Vector3();
    for (const target of targets) {
      resources.electricalSystem.reset('reset');
      target.copySocketWorldPosition(socket);
      resources.group.voltBody.teleport(new THREE.Vector3(-16, 2.96, socket.z - 2));
      f.tick();
      assert.equal(f.runtime.roomState.roomId, 'room-1', 'the global group handoff has not occurred yet');
      if (target.id !== 'transit-light-c') assert.ok(resources.group.voltBody.position.distanceTo(socket) > 20);
      f.cameraRig.aimOrigin.copy(resources.group.voltBody.position);
      f.cameraRig.aimDirection.subVectors(socket, resources.group.voltBody.position).normalize();
      f.input.press('aimAbility');
      f.input.press('fireAbility');
      f.tick();
      assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 100);
      assert.equal(resources.electricalSystem.readModel.connectedTargetId, target.id, `actual runtime must reach ${target.id} across the chamber`);
      f.input.release('fireAbility');
      f.input.release('aimAbility');
      f.tick();
    }
    f.runtime.activateCheckpoint('cp2');
    f.runtime.recoverActiveCheckpoint();
    f.tick();
    assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 11, 'Room 1 retry cannot retain Room 2 ranges');
    f.input.press('debugTeleportRoomTwo');
    f.tick();
    f.input.release('debugTeleportRoomTwo');
    f.tick();
    assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 100);
    f.input.press('debugTeleportRoomOne');
    f.tick();
    f.input.release('debugTeleportRoomOne');
    f.tick();
    assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 11, 'Room 1 shortcut restores near ranges');
  } finally { f.cleanup(); }
});

test('conducting outlines appear only for actively aiming Volt, including render-only input release', () => {
  const f = createFixture();
  try {
    const highlights = f.scene.getObjectByName('volt-conducting-target-highlights')!;
    const assertHidden = () => {
      assert.equal(highlights.visible, false);
      assert.ok(highlights.children.every(child => !child.visible));
    };
    f.render(); assertHidden();
    f.input.press('aimAbility'); f.tick(); f.render();
    assert.equal(highlights.visible, true);
    assert.ok(highlights.children.some(child => child.visible));
    f.input.release('aimAbility'); f.render(); assertHidden();
    f.input.press('aimAbility'); f.tick(); f.render();
    assert.equal(highlights.visible, true);
    f.switchSlime(); f.input.press('aimAbility'); f.tick(); f.render(); assertHidden(); // Bob
    f.switchSlime(); f.input.press('aimAbility'); f.tick(); f.render(); assertHidden(); // Goop aiming acid
    f.switchSlime(); f.input.press('aimAbility'); f.tick(); f.render();
    assert.equal(highlights.visible, true);
    f.input.pointerLocked = false; f.render(); assertHidden();
  } finally { f.cleanup(); }
});

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
    const entry = BLACKOUT_TRANSIT_CHECKPOINTS[0]!;
    let roomTwoObjectives = 0;
    const unsubscribe = f.runtime.events.on('objectiveChanged', ({ roomId, objective }) => {
      // The authored Room 2 has its own progress objectives; count only the
      // one-shot Room 1 handoff announcement.
      if (roomId === 'room-2' && objective === 'Restore the transit lights and lower cover for Bob') roomTwoObjectives += 1;
    });

    bodies.bob.position.set(6, 0.86, 83);
    bodies.goop.position.set(8, 0.86, 83);

    // Establish a bay-side previous sample, cross the entrance, traverse the
    // duct forward, then cross its outlet before entering the side catwalk.
    bodies.volt.position.set(-6, 0.46, 53);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 54);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 59.8);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 60.5);
    f.tick();
    bodies.volt.position.set(-16, 2.96, 83);
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
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), entry.bodyPositions.bob.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), entry.bodyPositions.goop.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), entry.bodyPositions.volt.toArray());

    f.runtime.restartLevel();
    assert.equal(f.runtime.roomState.roomId, 'room-1');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, false);
    unsubscribe();
  } finally {
    f.cleanup();
  }
});


test('Room 1 stays authoritative after the CP3 handoff while players can return from Room 2', () => {
  const f = createFixture();
  try {
    const { bodies, bay } = roomOneInternals(f.runtime);
    const entry = BLACKOUT_TRANSIT_CHECKPOINTS[0]!;

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

    bodies.bob.position.set(6, 0.86, 83);
    bodies.goop.position.set(8, 0.86, 83);
    bodies.volt.position.set(-6, 0.46, 53);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 54);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 59.8);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 60.5);
    f.tick();
    bodies.volt.position.set(-16, 2.96, 83);
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

    // Room 1 remains physically reachable from the authored Room 2. Returning
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
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), entry.bodyPositions.bob.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), entry.bodyPositions.goop.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), entry.bodyPositions.volt.toArray());
  } finally {
    f.cleanup();
  }
});

test('authored Room 2 checkpoint uses split routes and recovers all three bodies in the transit room', () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp3');
    f.runtime.recoverActiveCheckpoint();
    const entry = BLACKOUT_TRANSIT_CHECKPOINTS[0]!;
    const positions = f.runtime.getSlimePositions()!;
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(positions[id].distanceTo(entry.bodyPositions[id]) < 1e-6);
    }
    assert.ok(positions.bob.distanceTo(positions.volt) > 12, 'Volt starts on the separated service route');
    assert.equal(f.cameraRig.groundYaw, Math.PI, 'Room 2 recovery should face into the route');
    f.tick(3);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
    const recovered = f.runtime.getSlimePositions()!;
    assert.equal(f.cameraRig.groundYaw, Math.PI, 'death/retry must preserve the forward entry orientation');
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(recovered[id].distanceTo(entry.bodyPositions[id]) < 1e-6, `${id} recovers in Room 2, not Room 1`);
    }
  } finally { f.cleanup(); }
});

test('Room 1 separate entrances enter Room 2 without snapping bodies back to spawn', () => {
  const f = createFixture();
  try {
    const {group} = (f.runtime as unknown as {resources: {group: {
      bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody;
    }}}).resources;
    group.bobBody.teleport(new THREE.Vector3(5,.86,83));
    group.goopBody.teleport(new THREE.Vector3(7,.86,83));
    // Ordered fixed-step samples through the real Room 1 traversal controller.
    for (let z = 53; z <= 61; z += .5) {
      group.voltBody.teleport(new THREE.Vector3(-6,.46,z));
      f.tick();
    }
    group.voltBody.teleport(new THREE.Vector3(-16,2.96,83));
    f.tick();
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(f.runtime.activeCheckpoint?.room.roomId, 'room-2');
    assert.ok(f.runtime.getSlimePositions()!.volt.x < -14);
    assert.equal(f.runtime.getSlimePositions()!.bob.x, 5, 'physical entry must not teleport Bob to the checkpoint marker');
    f.tick(10);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
  } finally { f.cleanup(); }
});

test('Level 3 number keys 1–3 teleport all bodies to clean room checkpoints', () => {
  const f = createFixture();
  try {
    const pressRoom = (key:InputAction) => { f.input.press(key); f.tick(); f.input.release(key); f.tick(); };
    pressRoom('debugTeleportRoomTwo');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(f.runtime.activeCheckpoint?.room.roomId, 'room-2');
    const positions = f.runtime.getSlimePositions()!;
    assert.equal(positions.bob.x, 6);
    assert.equal(positions.goop.x, 8);
    assert.equal(positions.volt.x, -16);

    pressRoom('debugTeleportRoomThree');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp6');
    assert.equal(f.runtime.activeCheckpoint?.room.roomId, 'room-3');
    assert.equal(f.runtime.activeCheckpoint?.room.local.bossStaging, true);
    for (const body of Object.values(f.runtime.getSlimePositions()!)) assert.ok(body.z > 158 && body.y > .8);
    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp6', 'Room 3 retry stays at its safe staging point');

    pressRoom('debugTeleportRoomOne');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
    for (const body of Object.values(f.runtime.getSlimePositions()!)) assert.ok(body.z < 5);
    pressRoom('debugTeleportRoomTwo');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3', 'room shortcuts remain repeatable after retry');
  } finally { f.cleanup(); }
});

test('Room 2 hazards stay authoritative when one body arrives before the others', () => {
  const f = createFixture();
  try {
    const {group} = (f.runtime as unknown as {resources:{group:{bobBody:KinematicBody}}}).resources;
    group.bobBody.teleport(new THREE.Vector3(10,-.545,94));
    f.tick();
    assert.equal(f.input.enabled, false, 'Bob cannot bypass the acid while the other slimes remain in Room 1');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
  } finally { f.cleanup(); }
});

test('Bob can walk onto the final bridge button in the complete runtime', () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp5');
    f.runtime.recoverActiveCheckpoint();
    const { group, transit } = (f.runtime as unknown as { resources: {
      group: { bobBody: KinematicBody; activeSlimeId: string };
      transit: BlackoutTransitController;
    } }).resources;
    while (group.activeSlimeId !== 'bob') f.switchSlime();
    f.input.press('moveLeft');
    f.tick(90);
    f.input.release('moveLeft');
    f.tick(90);
    assert.equal(group.bobBody.attached, true, `Bob stopped at ${group.bobBody.position.toArray()}`);
    assert.equal(group.bobBody.attachmentSurfaceName, 'bob-bridge-switch-sticky-wall');
    assert.equal(transit.bridgeDeployed, true);
  } finally { f.cleanup(); }
});

test('dying late in Room 2 resets every body and all puzzle state to the room entrance', () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp3');
    f.runtime.recoverActiveCheckpoint();
    const { group, transit } = (f.runtime as unknown as { resources: {
      group: { bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody };
      transit: BlackoutTransitController;
    } }).resources;
    for (const stage of [1, 2]) {
      const cover = transit.covers[stage - 1]!;
      cover.support.advance(cover.support.dissolveDurationSeconds);
      transit.lights[stage - 1]!.target.setConnectionState(true);
      f.tick(120);
      transit.lights[stage - 1]!.target.setConnectionState(false);
      assert.equal(cover.deployed, true);
      assert.equal(transit.lights[stage - 1]!.latched, true);
      const checkpoint = BLACKOUT_TRANSIT_CHECKPOINTS[stage]!;
      group.bobBody.teleport(checkpoint.bodyPositions.bob);
      f.tick(3);
      assert.equal(f.runtime.activeCheckpoint?.checkpointId, checkpoint.id);
      group.goopBody.teleport(new THREE.Vector3(17,-.52,140));
      group.voltBody.teleport(new THREE.Vector3(-16,2.96,132));
      assert.equal(f.runtime.requestFailure(), true);
      f.tick(70);
      f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
      const restored = f.runtime.getSlimePositions()!;
      for (const id of ['bob', 'goop', 'volt'] as const) {
        assert.ok(restored[id].distanceTo(BLACKOUT_TRANSIT_CHECKPOINTS[0]!.bodyPositions[id]) < 1e-6,
          `${id} should return to Room 2 entry even if parked far from the active slime`);
      }
      assert.ok(transit.covers.every(cover => !cover.deployed && cover.support.progress === 0));
      assert.ok(transit.lights.every(light => !light.latched && light.charge === 0));
      assert.equal(transit.bridgeLocked,false);
      assert.equal(transit.bridgeDeployed,false);
      f.tick(3);
      assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3', 'death retry is a full room restart');
    }
  } finally { f.cleanup(); }
});
