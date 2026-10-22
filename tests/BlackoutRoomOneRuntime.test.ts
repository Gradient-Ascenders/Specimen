import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import type { Input, InputAction } from '../src/core/Input.ts';
import { DEFAULT_USER_KEY_BINDINGS } from '../src/core/KeyBindings.ts';
import type { LoopStats } from '../src/core/Loop.ts';
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';
import { BLACKOUT_TRANSIT_CHECKPOINTS } from '../src/levels/BlackoutTransitRoom.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import type { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import type { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';
import type { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';
import type { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import type {BobCharacterPresentation} from '../src/render/bob/BobCharacterPresentation.ts';
import type {GoopCharacterPresentation} from '../src/render/goop/GoopCharacterPresentation.ts';
import { DEFAULT_KINEMATIC_BODY_CONFIG } from '../src/physics/KinematicBody.ts';
import { AcidSurfaceMaterial } from '../src/render/environment/containment/AcidSurfaceMaterial.ts';

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
  setThirdPersonOverride(): void {}
  isFirstPersonForTarget(): boolean { return false; }
  toggleViewMode(): void {}

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

function createFixture(debugAvailable = true,playArrival=false) {
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
    renderLayer: { scene, canvas: document.createElement(), cameraRig, keyBindings: DEFAULT_USER_KEY_BINDINGS, render: () => {} } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop', 'volt'], activeSlimeId: 'volt' },
    authoredRoomOne: true,
    playArrival,
    debugAvailable,
    maintenanceMaps,
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
    voltPresentation: VoltCharacterPresentation;
    maintenanceBay: BlackoutMaintenanceBayController;
    transit: BlackoutTransitController;
    electricalSystem: VoltElectricalSystem<KinematicBody>;
    electricalTargets: ElectricalTargetRegistry;
  } }).resources;
}

test('authored Level 3 starts with the wall-vent arrival, pauses cleanly, then restores Volt control and CP1 recovery',()=>{
  const f=createFixture(true,true);try{
    const r=(f.runtime as unknown as {resources:{ventArrival:import('../src/cinematics/BlackoutVentArrival.ts').BlackoutVentArrival;scene:{maintenanceBay:{entryVentCollapse:{sealed:boolean}}};group:{activeSlimeId:string};voltPresentation:VoltCharacterPresentation}}).resources;
    assert.equal(r.ventArrival.active,true);assert.equal(f.input.enabled,false);assert.equal(r.group.activeSlimeId,'volt');
    assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,false);
    f.input.press('switchSlime');f.input.press('moveBackward');f.tick(60);
    assert.equal(r.group.activeSlimeId,'volt','switch/movement input cannot take over scripted slide poses');
    f.runtime.stop();const paused=r.ventArrival.seconds;f.tick(30);f.render();f.render();assert.equal(r.ventArrival.seconds,paused);
    f.runtime.setDebugInteractionEnabled(true);assert.equal(f.input.enabled,false);
    f.runtime.start();assert.equal(f.input.enabled,false,'resuming cannot enable movement before the arrival finishes');
    for(let frame=0;frame<420&&r.ventArrival.active;frame++)f.tick();
    assert.equal(r.ventArrival.active,false);assert.equal(f.input.enabled,true);assert.equal(r.group.activeSlimeId,'volt');
    assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,true);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp1');
    assert.deepEqual(Object.values(f.runtime.getSlimePositions()!).map(p=>p.toArray()),[[-2,.46,2],[0,.46,2],[2,.46,2]]);
    f.runtime.recoverActiveCheckpoint();assert.equal(r.ventArrival.active,false);
    assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,true,'death recovery keeps the return route blocked');
    f.runtime.stop();f.runtime.start();assert.equal(r.ventArrival.active,false,'ordinary resume/recovery does not repeat the arrival');
    f.runtime.restartLevel();assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,true,'restart does not open the spent arrival');
  }finally{f.cleanup();}
});

test('recovering or restarting during the arrival cancels camera/model ownership safely',()=>{
  for(const action of ['recoverActiveCheckpoint','restartLevel'] as const){
    const f=createFixture(true,true);try{
      f.tick(50);f.runtime[action]();
      const r=(f.runtime as unknown as {resources:{ventArrival:{active:boolean};bobPresentation:BobCharacterPresentation;goopPresentation:GoopCharacterPresentation;voltPresentation:VoltCharacterPresentation}}).resources;
      assert.equal(r.ventArrival.active,false);assert.equal(f.input.enabled,true);
      assert.ok([r.bobPresentation,r.goopPresentation,r.voltPresentation].every(p=>p.root.parent===f.scene));
      assert.deepEqual(Object.values(f.runtime.getSlimePositions()!).map(p=>p.toArray()),[[-2,.46,2],[0,.46,2],[2,.46,2]]);
    }finally{f.cleanup();}
  }
});

function assertVoltBelowCeiling(body: THREE.Mesh, ceiling: THREE.Mesh): number {
  body.updateWorldMatrix(true, false); ceiling.updateWorldMatrix(true, false);
  const inverseCeiling = new THREE.Matrix4().copy(ceiling.matrixWorld).invert();
  const bounds = ceiling.geometry.boundingBox!, point = new THREE.Vector3(), local = new THREE.Vector3();
  let top = -Infinity;
  for (let i = 0; i < body.geometry.getAttribute('position').count; i++) {
    body.getVertexPosition(i, point); point.applyMatrix4(body.matrixWorld); top = Math.max(top, point.y);
    local.copy(point).applyMatrix4(inverseCeiling);
    if (local.x >= bounds.min.x && local.x <= bounds.max.x && local.z >= bounds.min.z && local.z <= bounds.max.z) {
      assert.ok(local.y <= bounds.min.y + 1e-5, `Volt vertex ${i} penetrates ${ceiling.name} by ${local.y - bounds.min.y} m`);
    }
  }
  return top;
}

test('real Volt GLB normal jump clears the actual maintenance-vent ceiling at every render alpha', async () => {
  const f = createFixture();
  try {
    const r = electricalRoomInternals(f.runtime), volt = r.group.voltBody;
    await r.voltPresentation.prepare(loadVolt);
    const mesh = r.voltPresentation.root.getObjectByName('Volt-Body') as THREE.Mesh;
    const ceiling = r.maintenanceBay.bay.collisionMeshes.find(m => m.name === 'vent-duct-ceiling')!;
    const ceilingBottom = new THREE.Box3().setFromObject(ceiling).min.y;
    assert.ok(Math.abs(ceilingBottom - 2.2) < 1e-6);
    volt.teleport(new THREE.Vector3(-6, 0.46, 57)); f.tick(10);
    assert.equal(volt.grounded, true); assert.equal(volt.radiusMetres, 0.45);
    assert.equal(r.voltPresentation.diagnostics.headroom.compression, 0, 'preserve the neutral crest with ample grounded headroom');
    f.input.press('jump');
    let peakColliderTop = 0, peakVisualTop = 0, uncompressedTop = 0, maximumCompression = 0;
    const point = new THREE.Vector3();
    for (let frame = 0; frame < 60; frame++) {
      f.tick(); if (frame === 0) f.input.release('jump');
      peakColliderTop = Math.max(peakColliderTop, volt.position.y + volt.radiusMetres);
      for (const alpha of [0, 0.5, 1]) {
        f.runtime.render(alpha, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>);
        peakVisualTop = Math.max(peakVisualTop, assertVoltBelowCeiling(mesh, ceiling));
      }
      maximumCompression = Math.max(maximumCompression, r.voltPresentation.diagnostics.headroom.compression);
      if (frame === 14) {
        const target = mesh.morphTargetDictionary!.Headroom, weight = mesh.morphTargetInfluences![target]!;
        mesh.morphTargetInfluences![target] = 0;
        for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
          mesh.getVertexPosition(i, point); point.applyMatrix4(mesh.matrixWorld); uncompressedTop = Math.max(uncompressedTop, point.y);
        }
        mesh.morphTargetInfluences![target] = weight;
      }
    }
    assert.equal(volt.lastJumpSpeedMetresPerSecond, DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond);
    assert.ok(peakColliderTop > 1.65 && peakColliderTop < 1.8, 'ordinary jump tuning and unobstructed collider apex');
    assert.ok(uncompressedTop > 2.65, 'reproduce the reviewer\'s approximately half-metre crest penetration');
    assert.ok(peakVisualTop <= ceilingBottom - 0.02); assert.ok(maximumCompression > 0 && maximumCompression < 1);
    volt.teleport(new THREE.Vector3(-6, 0.46, 49)); f.tick(90); f.render();
    assert.equal(r.voltPresentation.diagnostics.headroom.compression, 0, 'restore authored height after exiting the passage');
    f.runtime.restartLevel(); f.render(); assert.equal(r.voltPresentation.diagnostics.headroom.compression, 0);
  } finally { f.cleanup(); }
});

test('real Volt GLB traverses and jumps through flat and rising ducts without ceiling clipping', async () => {
  const f = createFixture();
  try {
    const r = electricalRoomInternals(f.runtime), volt = r.group.voltBody;
    await r.voltPresentation.prepare(loadVolt);
    const mesh = r.voltPresentation.root.getObjectByName('Volt-Body') as THREE.Mesh;
    const flat = r.maintenanceBay.bay.collisionMeshes.find(m => m.name === 'vent-duct-ceiling')!;
    const rising = r.maintenanceBay.bay.collisionMeshes.find(m => m.name === 'volt-rising-duct-ceiling')!;
    volt.teleport(new THREE.Vector3(-6, 0.46, 53)); f.tick(10); f.input.press('moveBackward');
    for (let frame = 0; frame < 100; frame++) {
      if (frame === 30) f.input.press('jump');
      f.tick(); if (frame === 30) f.input.release('jump');
      if (frame % 5 === 0) for (const alpha of [0, 0.5, 1]) {
        f.runtime.render(alpha, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); assertVoltBelowCeiling(mesh, flat);
      }
    }
    f.input.release('moveBackward'); assert.ok(volt.position.z > 60, 'ordinary input traverses the straight duct');
    volt.teleport(new THREE.Vector3(-16, 1.6, 69)); f.tick(30); assert.equal(volt.grounded, true);
    const startZ = volt.position.z; f.input.press('moveBackward'); f.input.press('jump');
    for (let frame = 0; frame < 60; frame++) {
      f.tick(); if (frame === 0) f.input.release('jump');
      if (frame % 5 === 0) for (const alpha of [0, 0.5, 1]) {
        f.runtime.render(alpha, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); assertVoltBelowCeiling(mesh, rising);
      }
    }
    f.input.release('moveBackward'); assert.ok(volt.position.z > startZ + 3, 'ordinary input climbs the authored sloping duct');
    assert.equal(volt.radiusMetres, 0.45);
  } finally { f.cleanup(); }
});

test('authored Room 1 Volt keeps identity events, light, interpolated placement and death/recovery ownership', async () => {
  const f = createFixture();
  try {
    const r = (f.runtime as unknown as { resources: {
      group: { voltBody: KinematicBody };
      voltPresentation: VoltCharacterPresentation;
      voltLight: THREE.PointLight;
      voltMovementEvents: { emit(name: string, event: unknown): void };
      bobPresentation: { diagnostics: { stretch: number; squash: number } };
      goopPresentation: { diagnostics: { stretch: number; squash: number } };
    } }).resources;
    await r.voltPresentation.prepare(loadVolt);
    assert.deepEqual(r.voltPresentation.diagnostics.asset, { triangles: 38208, drawCalls: 3, geometries: 3, materials: 2 });
    assert.equal(r.voltLight.parent, r.voltPresentation.placement);
    assert.equal(r.voltLight.intensity, 16); assert.equal(r.voltLight.distance, 8); assert.equal(r.voltLight.decay, 2);
    assert.equal(r.voltLight.color.getHex(), 0xffdf75); assert.equal(r.voltLight.castShadow, false);
    const body = r.group.voltBody;
    body.teleport(new THREE.Vector3(0, 3, 3));
    r.voltMovementEvents.emit('jumped', { directionWorld: new THREE.Vector3(0, 1, 0), speedMetresPerSecond: 6, chargeFraction: 0 });
    f.tick(); assert.ok(r.voltPresentation.diagnostics.weights.Stretch > 0);
    assert.equal(r.bobPresentation.diagnostics.stretch, 0); assert.equal(r.goopPresentation.diagnostics.stretch, 0);
    f.runtime.render(0.5, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>);
    const expected = new THREE.Vector3().lerpVectors(body.previousPosition, body.position, 0.5);
    assert.ok(r.voltPresentation.placement.position.distanceTo(expected) < 1e-8);
    assert.ok(r.voltLight.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-8);
    r.voltPresentation.setOpacity(0); assert.equal(r.voltLight.visible, true);
    r.voltPresentation.setOpacity(1);
    assert.equal(f.runtime.requestFailure(), true); assert.equal(f.runtime.requestFailure(), false);
    f.tick(8); f.render(); assert.equal(r.voltPresentation.diagnostics.visible, false);
    // Keep the warmed point-light slot to avoid compiling a new shader when Volt dies.
    assert.equal(r.voltLight.visible, true); assert.equal(r.voltLight.intensity, 0);
    assert.equal(r.voltPresentation.diagnostics.deathActive, true);
    f.runtime.restartLevel(); f.render(); assert.equal(r.voltPresentation.diagnostics.deathActive, false);
    assert.equal(r.voltPresentation.diagnostics.opacity, 1); assert.equal(r.voltLight.visible, true);
    assert.equal(r.voltLight.intensity, 16);
    assert.ok(Object.values(r.voltPresentation.diagnostics.weights).every(weight => weight === 0));
  } finally { f.cleanup(); }
});

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
    for (const enemy of resources.transit.emergingDrones) enemy.state.destroy();
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
    assert.ok(highlights.children.every(child => !child.visible), 'CP1 does not reveal the distant circuit');
    const resources = electricalRoomInternals(f.runtime);
    resources.group.voltBody.teleport(new THREE.Vector3(-9, 0.46, 51.5));
    f.tick(); f.render();
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
      if (roomId === 'room-2' && objective === 'Restore the transit lights and clear the sewer drones for Bob') roomTwoObjectives += 1;
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
      const enemy = transit.emergingDrones[stage - 1]!;
      enemy.state.destroy();
      transit.lights[stage - 1]!.target.setConnectionState(true);
      f.tick(120);
      transit.lights[stage - 1]!.target.setConnectionState(false);
      assert.equal(enemy.state.state, 'destroyed');
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
      assert.ok(transit.emergingDrones.every(enemy => enemy.state.state === 'dormant' && enemy.state.hits === 0));
      assert.ok(transit.lights.every(light => !light.latched && light.charge === 0));
      assert.equal(transit.bridgeLocked,false);
      assert.equal(transit.bridgeDeployed,false);
      f.tick(3);
      assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3', 'death retry is a full room restart');
    }
  } finally { f.cleanup(); }
});

 test('preloaded CPU maps survive reload while each bay owns fresh textures and dispose releases runtime data', () => {
  const f=createFixture();
  const resources=()=> (f.runtime as unknown as {resources:{scene:{maintenanceBay:{surfaceMaterials:{get(family:string):THREE.MeshStandardMaterial}}}}}).resources;
  const first=resources().scene.maintenanceBay.surfaceMaterials.get('wallPanel').map as THREE.DataTexture;
  let disposed=0;first.addEventListener('dispose',()=>disposed++);
  try {
    f.runtime.unload();f.runtime.unload();assert.equal(disposed,1);
    f.runtime.load();
    const second=resources().scene.maintenanceBay.surfaceMaterials.get('wallPanel').map as THREE.DataTexture;
    assert.notEqual(second,first);assert.equal(second.image.data,first.image.data);
    f.runtime.start();f.runtime.restartLevel();assert.equal(resources().scene.maintenanceBay.surfaceMaterials.get('wallPanel').map,second);
    f.runtime.dispose();assert.equal((f.runtime as unknown as {maintenanceMaps:unknown}).maintenanceMaps,undefined);
  } finally {f.cleanup();}
});


test('ordinary production ignores authored room teleport keys', () => {
  const f = createFixture(false);
  try {
    assert.equal(f.runtime.roomState.roomId, 'room-1');
    for (const action of ['debugTeleportRoomTwo', 'debugTeleportRoomThree'] as const) {
      f.input.press(action); f.tick(); f.input.release(action); f.tick();
      assert.equal(f.runtime.roomState.roomId, 'room-1');
    }
  } finally { f.cleanup(); }
});

for (const room of [1, 2] as const) for (const slime of ['bob', 'volt'] as const) {
  test(`Room ${room} emits one ${slime} acid impact before death, animates it, and clears it on recovery`, () => {
    const f = createFixture();
    try {
      if (room === 2) { f.input.press('debugTeleportRoomTwo'); f.tick(); f.input.release('debugTeleportRoomTwo'); }
      const r = electricalRoomInternals(f.runtime);
      const owner = room === 1 ? r.maintenanceBay.bay : r.transit.room;
      const mesh = owner.root.getObjectByName(room === 1 ? 'animated-acid-surface' : 'transit-acid-surface') as THREE.Mesh;
      const material = mesh.material as AcidSurfaceMaterial;
      const victim = slime === 'bob' ? r.group.bobBody : r.group.voltBody;
      const surfaceY = new THREE.Box3().setFromObject(mesh).max.y;
      const shader = {uniforms: {}, vertexShader: '', fragmentShader: ''};
      material.onBeforeCompile(shader as never, {} as never);
      const uniforms = shader.uniforms as Record<string, {value: any}>;
      // Sample in open basin space, away from platforms, lasers and drones.
      victim.teleport(new THREE.Vector3(room === 1 ? -10 : 18, room === 1 ? -.351 : -.201, room === 1 ? 20 : 95));
      f.tick();
      assert.equal(f.input.enabled, false, 'the existing acid failure path stops gameplay');
      assert.equal(material.interactionDiagnostics.emitted, 1);
      const impact = uniforms.uRipples.value[0] as THREE.Vector4;
      assert.ok(Math.abs(impact.x - victim.position.x) < 1e-6);
      assert.ok(Math.abs(impact.y - victim.position.z) < 1e-6);
      assert.ok(Math.abs(uniforms.uRippleSurfaceY.value[0] - surfaceY) < 1e-6);
      const time = material.diagnostics.timeSeconds;
      f.tick(30);
      assert.ok(material.diagnostics.timeSeconds > time, 'the death impact continues expanding');
      assert.equal(material.interactionDiagnostics.emitted, 1, 'death steps cannot resample or repeat the splash');
      f.runtime.stop(); const pausedTime = material.diagnostics.timeSeconds; f.tick(10);
      assert.equal(material.diagnostics.timeSeconds, pausedTime);
      f.runtime.start(); f.runtime.recoverActiveCheckpoint();
      assert.equal(material.interactionDiagnostics.active, 0);
      owner.acidInteractions.fallPulse(victim);
      f.runtime.restartLevel();
      assert.equal(material.interactionDiagnostics.active, 0);
    } finally { f.cleanup(); }
  });
}

test('Goop remains immune while a real persistent body wakes each basin; generic failures do not project acid impacts', () => {
  const f = createFixture();
  try {
    const r = electricalRoomInternals(f.runtime);
    f.switchSlime(); f.switchSlime(); // Volt -> Bob -> Goop.
    for (const [owner, x, z, name] of [
      [r.maintenanceBay.bay, -10, 20, 'animated-acid-surface'],
      [r.transit.room, 18, 95, 'transit-acid-surface'],
    ] as const) {
      if (owner === r.transit.room) {
        f.input.press('debugTeleportRoomTwo'); f.tick(); f.input.release('debugTeleportRoomTwo');
        f.switchSlime(); // CP3 selects Bob; take control of Goop.
      }
      const material = (owner.root.getObjectByName(name) as THREE.Mesh).material as AcidSurfaceMaterial;
      r.group.goopBody.teleport(new THREE.Vector3(x, 1.5, z));
      f.tick(50);
      assert.equal(f.input.enabled, true, 'Goop never requests an acid death');
      const emitted = material.interactionDiagnostics.emitted;
      assert.ok(emitted >= 1, `${name} emits an initial contact`);
      f.input.press('moveRight');
      f.tick(12);
      f.input.release('moveRight');
      assert.ok(material.interactionDiagnostics.emitted > emitted);
      owner.acidInteractions.reset();
    }
    r.group.goopBody.teleport(new THREE.Vector3(8, .86, 84));
    f.runtime.requestFailure();
    for (const [owner, name] of [[r.maintenanceBay.bay, 'animated-acid-surface'], [r.transit.room, 'transit-acid-surface']] as const) {
      const material = (owner.root.getObjectByName(name) as THREE.Mesh).material as AcidSurfaceMaterial;
      assert.equal(material.interactionDiagnostics.active, 0, 'non-acid deaths do not project a ripple');
    }
  } finally { f.cleanup(); }
});
