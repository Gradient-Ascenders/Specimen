import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig } from '../src/render/CameraRig.ts';
import { CameraBodyVisibility } from '../src/render/CameraBodyVisibility.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { DEFAULT_USER_KEY_BINDINGS, reconcileUserKeyBindings, gameplayBindings } from '../src/core/KeyBindings.ts';
import { Input } from '../src/core/Input.ts';
import { GameSettings, PRESENTATION_PREFERENCES_KEY } from '../src/ui/GameSettings.ts';

function fixture() {
  const world = new CollisionWorld();
  const body = new KinematicBody({ world, initialPosition: new THREE.Vector3(0, .46, 0) });
  const rig = new CameraRig(); rig.setFollowTarget(body, world); rig.update(1, 1 / 60);
  return { world, body, rig };
}
function settle(rig: CameraRig, fps = 60) { for (let i = 0; i < fps * 2; i++) rig.update(1, 1 / fps); }

for (const fps of [30, 60, 144]) test(`manual view transitions preserve heading, interpolation and physics at ${fps} FPS`, () => {
  const { world, body, rig } = fixture();
  assert.equal(rig.viewMode, 'third-person');
  rig.queueLookInput(53, -20); rig.update(1, 1 / fps);
  const heading = rig.camera.getWorldDirection(new THREE.Vector3());
  const position = body.position.clone(), velocity = body.velocity.clone(), up = body.gameplayUp.clone();
  rig.toggleViewMode();
  rig.update(1, 1 / fps);
  assert.ok(rig.firstPersonPresentationWeight > 0 && rig.firstPersonPresentationWeight < 1);
  settle(rig, fps);
  assert.ok(rig.currentFollowDistanceMetres < .081);
  assert.ok(rig.camera.position.distanceTo(body.position) < .3);
  assert.ok(heading.distanceTo(rig.camera.getWorldDirection(new THREE.Vector3())) < 1e-10);
  for (let i = 0; i < 17; i++) { rig.toggleViewMode(); rig.update(.4, 1 / fps); }
  settle(rig, fps); assert.equal(rig.viewMode, 'third-person');
  assert.ok(rig.currentFollowDistanceMetres > 5);
  assert.deepEqual(body.position, position); assert.deepEqual(body.velocity, velocity); assert.deepEqual(body.gameplayUp, up);
  world.clear();
});

test('aim release, switching, checkpoint/reset and level retargeting preserve the selected view', () => {
  const { world, body, rig } = fixture();
  rig.setViewMode('first-person'); settle(rig);
  rig.setAimPresentationActive(true); settle(rig); rig.setAimPresentationActive(false); settle(rig);
  assert.equal(rig.aimPresentationWeight, 0); assert.equal(rig.firstPersonPresentationWeight, 1);
  const next = new KinematicBody({ world, initialPosition: new THREE.Vector3(5, .46, 0) });
  rig.setFollowTarget(next, world); settle(rig);
  assert.equal(rig.isFirstPersonForTarget(body), false); assert.equal(rig.isFirstPersonForTarget(next), true);
  next.recoverAt(new THREE.Vector3(30, 3, 0)); rig.reset(); rig.update(.4, 1 / 60);
  assert.equal(rig.viewMode, 'first-person'); assert.ok(rig.camera.position.distanceTo(next.position) < .3);
  rig.clearFollowTarget(); rig.setFollowTarget(body, world); settle(rig);
  assert.equal(rig.viewMode, 'first-person');
  rig.setViewMode('third-person', true); rig.reset(); rig.update(1, 1 / 60);
  assert.equal(rig.viewMode, 'third-person'); assert.ok(rig.currentFollowDistanceMetres > 5);
});

test('authored cameras show their subjects and return smoothly without replacing the preference', () => {
  const { rig, body } = fixture(); rig.setViewMode('first-person', true); settle(rig);
  rig.setThirdPersonOverride(true); rig.update(1, 1 / 60);
  assert.equal(rig.isFirstPersonForTarget(body), false); assert.equal(rig.viewMode, 'first-person');
  rig.setThirdPersonOverride(false); rig.update(1, 1 / 60);
  assert.ok(rig.firstPersonPresentationWeight > 0 && rig.firstPersonPresentationWeight < 1);
  settle(rig); assert.equal(rig.firstPersonPresentationWeight, 1);
  rig.setContextualCamera({ profile: { id: 'authored-lift', distanceMetres: 6, targetHeightMetres: 1,
    pitchRadians: .8, transitionDurationSeconds: .2, framingDeadZoneHalfWidthMetres: .2,
    framingDeadZoneHalfHeightMetres: .2, framingDampingPerSecond: 10 }, anchor: body });
  settle(rig); assert.equal(rig.firstPersonPresentationWeight, 0); assert.ok(rig.currentFollowDistanceMetres > 5);
  rig.setAimPresentationActive(true); settle(rig);
  assert.equal(rig.firstPersonPresentationWeight, 0, 'Authored framing also wins over a held/stale ability aim');
  assert.equal(rig.aimPresentationWeight, 0);
  assert.equal(rig.isFirstPersonForTarget(body), false);
  rig.setContextualCamera(undefined); settle(rig); assert.equal(rig.firstPersonPresentationWeight, 1);
  rig.setAimPresentationActive(false); settle(rig); assert.equal(rig.firstPersonPresentationWeight, 1);
});

test('near-eye camera stays inside the body clearance under roofs, beside walls and during wall/ceiling orientation', () => {
  const { world, body, rig } = fixture();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8, .2, 8)); roof.position.y = 1.1;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(.2, 5, 8)); wall.position.x = -.6;
  world.registerAll([roof, wall]); rig.setViewMode('first-person'); settle(rig);
  for (const up of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)]) {
    const target = { position: body.position, previousPosition: body.previousPosition, velocity: body.velocity,
      gameplayUp: up, grounded: false, attached: true };
    rig.setFollowTarget(target, world); settle(rig);
    for (const mesh of [roof, wall]) {
      const box = new THREE.Box3().setFromObject(mesh);
      assert.ok(box.distanceToPoint(rig.camera.position) >= .12, 'Near plane has solid clearance');
    }
    assert.ok(rig.camera.position.distanceTo(body.position) < .4);
    assert.ok(rig.camera.up.dot(up) > .999);
  }
  roof.geometry.dispose(); wall.geometry.dispose(); world.clear();
});

test('camera ray stays on screen centre through aiming in either selected perspective', () => {
  const { rig } = fixture(); const origin = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const mode of ['third-person', 'first-person'] as const) {
    rig.setViewMode(mode); rig.setAimPresentationActive(true); settle(rig);
    rig.copyAimRay(origin, direction);
    const projected = origin.clone().addScaledVector(direction, 8).project(rig.camera);
    assert.ok(Math.abs(projected.x) < 1e-8 && Math.abs(projected.y) < 1e-8);
    rig.setAimPresentationActive(false); settle(rig); assert.equal(rig.viewMode, mode);
  }
});

test('wide-screen maximum-FOV near-plane corners remain outside nearby solids', () => {
  const { world, body, rig } = fixture();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8, .2, 8)); roof.position.y = 1.1;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(.2, 5, 8)); wall.position.x = -.6;
  world.registerAll([roof, wall]); rig.resize(2560, 720); rig.setFieldOfViewDegrees(75);
  rig.setViewMode('first-person', true); settle(rig);
  for (const mesh of [roof, wall]) {
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      const corner = new THREE.Vector3(x, y, -1).unproject(rig.camera);
      assert.ok(bounds.distanceToPoint(corner) > .01, 'Actual near-plane corner clears the solid');
    }
  }
  assert.ok(rig.camera.position.distanceTo(body.position) < .4);
  roof.geometry.dispose(); wall.geometry.dispose(); world.clear();
});

test('only the followed actor loses colour/depth writes; shadows, other cameras, effects and material state survive', () => {
  const { rig, body } = fixture(); const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.castShadow = true;
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const mask = new CameraBodyVisibility(); mask.configure(rig, body); mask.bind(mesh);
  rig.setViewMode('first-person', true); settle(rig);
  const draw = (camera: THREE.Camera, hidden: boolean) => {
    mesh.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), camera, mesh.geometry, material, null!);
    assert.equal(material.colorWrite, !hidden); assert.equal(material.depthWrite, !hidden);
    assert.equal(mesh.visible, true); assert.equal(mesh.castShadow, true); assert.equal(other.visible, true);
    mesh.onAfterRender({} as THREE.WebGLRenderer, new THREE.Scene(), camera, mesh.geometry, material, null!);
    assert.equal(material.colorWrite, true); assert.equal(material.depthWrite, true);
  };
  draw(rig.camera, true); draw(new THREE.PerspectiveCamera(), false);
  rig.setThirdPersonOverride(true); draw(rig.camera, false);
  mask.dispose(); mesh.geometry.dispose(); other.geometry.dispose(); material.dispose(); other.material.dispose();
});

test('legacy bindings retain custom controls and choose an unused toggle key if V is already claimed', () => {
  const { toggleView, ...legacy } = DEFAULT_USER_KEY_BINDINGS;
  for (const old of [legacy, { ...legacy, jump: 'KeyV' }]) {
    const settings = new GameSettings({ storage: { getItem: key => key === PRESENTATION_PREFERENCES_KEY ? JSON.stringify({ keyBindings: old }) : null,
      setItem() {}, removeItem() {} } });
    for (const [action, key] of Object.entries(old)) assert.equal(settings.value.keyBindings[action], key);
    assert.ok(!Object.values(old).includes(settings.value.keyBindings.toggleView));
    assert.ok(gameplayBindings(settings.value.keyBindings).toggleView?.length);
  }
  assert.equal(reconcileUserKeyBindings(null), DEFAULT_USER_KEY_BINDINGS);
});

test('toggle input is one-shot, ignores repeats/disabled controls and editable fields', () => {
  const win = new EventTarget(), element = new EventTarget(), doc = Object.assign(new EventTarget(), { pointerLockElement: null });
  const input = new Input({ window: win as Window, document: doc as unknown as Document, pointerLockElement: element as HTMLElement });
  const key = (repeat = false, editable = false) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyV', repeat });
    if (editable) Object.defineProperty(event, 'target', { value: { closest: () => ({}) } });
    win.dispatchEvent(event);
  };
  key(false, true); assert.equal(input.wasPressed('toggleView'), false);
  key(); assert.equal(input.wasPressed('toggleView'), true); input.endFixedUpdate(); key(true);
  assert.equal(input.wasPressed('toggleView'), false);
  input.setEnabled(false); key(); assert.equal(input.wasPressed('toggleView'), false); input.dispose();
});
