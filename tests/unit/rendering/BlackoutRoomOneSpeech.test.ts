import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BLACKOUT_ROOM_ONE_SCRIPT, BlackoutRoomOneSpeech } from '../../../src/render/environment/blackout/BlackoutRoomOneSpeech.ts';

const state = { activeSlimeId: 'bob' as const, enabled: true, rendered: true,
  goop: { x: 1, y: 2, z: 3 }, volt: { x: 4, y: 5, z: 6 } };

test('Room 1 plays the requested exchange in speaker order, with distinct Volt and Goop panels', () => {
  assert.deepEqual(BLACKOUT_ROOM_ONE_SCRIPT, [
    { speaker: 'volt', text: 'Been a while, Goop' },
    { speaker: 'goop', text: 'Looks like they’ve tightened security around you.' },
    { speaker: 'volt', text: 'Who’s your new friend?' },
    { speaker: 'goop', text: 'Our ticket outta here.' },
  ]);
  const speech = new BlackoutRoomOneSpeech();
  speech.update(1, state);
  assert.equal(speech.mesh.material.opacity, 0);
  speech.update(2, state);
  assert.equal(speech.readModel.speaker, 'volt');
  assert.equal(speech.readModel.text, 'BEEN A WHILE, GOOP');
  assert.deepEqual(speech.root.position.toArray(), [4, 7.75, 6]);
  const pixel = (29 * 512 + 28) * 4;
  const pixels = speech.texture.image.data as Uint8Array;
  assert.deepEqual(Array.from(pixels.slice(pixel, pixel + 4)), [255, 225, 107, 255]);
  const sections = new Map<number, string>();
  for (let i = 0; i < 600; i++) {
    speech.update(.05, state);
    const model = speech.readModel;
    sections.set(model.sectionIndex, model.speaker);
    if (model.sectionIndex === 1) {
      assert.deepEqual(speech.root.position.toArray(), [1, 4.75, 3]);
      assert.deepEqual(Array.from(pixels.slice(pixel, pixel + 4)), [179, 230, 116, 255]);
    }
  }
  assert.deepEqual([...sections.values()], ['volt', 'goop', 'volt', 'goop']);
  assert.equal(speech.readModel.heard, true);
  assert.equal(speech.root.visible, false);
  speech.update(10, state);
  assert.equal(speech.root.visible, false);
  speech.dispose();
});

test('pausing, leaving Room 1 and F1 hiding freeze speech; retries preserve completed dialogue', () => {
  const speech = new BlackoutRoomOneSpeech();
  speech.update(2, state);
  const before = speech.readModel;
  speech.update(30, { ...state, enabled: false });
  assert.deepEqual(speech.readModel, before);
  assert.equal(speech.root.visible, false);
  speech.update(30, { ...state, rendered: false });
  assert.deepEqual(speech.readModel, before);
  speech.reset(true);
  speech.update(3, state);
  assert.equal(speech.readModel.text, 'BEEN A WHILE, GOOP');
  speech.update(60, state);
  speech.reset(true);
  speech.update(3, state);
  assert.equal(speech.root.visible, false);
  speech.reset();
  speech.update(3, state);
  assert.equal(speech.root.visible, true);
  assert.equal(speech.readModel.sectionIndex, 0);
  assert.throws(() => speech.update(NaN, state), RangeError);
  speech.dispose();
  speech.update(3, state);
  assert.equal(speech.root.parent, null);
});

test('the bubble stays above its speaker while the camera turns and disposes all owned resources', () => {
  const scene = new THREE.Scene(), speech = new BlackoutRoomOneSpeech();
  scene.add(speech.root);
  speech.update(3, state);
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, 100);
  camera.position.set(4, 7, 18);
  camera.lookAt(4, 7, 6);
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  speech.mesh.onBeforeRender(null!, scene, camera, speech.mesh.geometry, speech.mesh.material, null!);
  const clip = speech.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  assert.ok(Math.abs(clip.x) < 1 && Math.abs(clip.y) < 1 && Math.abs(clip.z) < 1);
  assert.ok(clip.y > new THREE.Vector3().copy(state.volt).project(camera).y);
  assert.deepEqual(speech.mesh.position.toArray(), [0, 0, 0]);
  assert.deepEqual(speech.mesh.getWorldPosition(new THREE.Vector3()).toArray(), [4, 7.75, 6]);
  camera.position.set(50, 10, -50);
  camera.lookAt(60, 10, -50);
  camera.updateMatrixWorld(true);
  speech.mesh.onBeforeRender(null!, scene, camera, speech.mesh.geometry, speech.mesh.material, null!);
  assert.deepEqual(speech.mesh.getWorldPosition(new THREE.Vector3()).toArray(), [4, 7.75, 6]);
  assert.ok(1 - Math.abs(speech.mesh.getWorldQuaternion(new THREE.Quaternion()).dot(camera.quaternion)) < 1e-6);
  assert.equal(speech.mesh.material.depthTest, true);
  const disposed: string[] = [];
  for (const [name, resource] of Object.entries({ geometry: speech.mesh.geometry, material: speech.mesh.material, texture: speech.texture })) {
    resource.addEventListener('dispose', () => disposed.push(name));
  }
  speech.dispose(); speech.dispose();
  assert.deepEqual(disposed, ['geometry', 'material', 'texture']);
  assert.equal(scene.children.length, 0);
});

test('controlling either speaker keeps their panel readable, and switching restores the overhead bubble without restarting text', () => {
  const scene = new THREE.Scene(), speech = new BlackoutRoomOneSpeech();
  scene.add(speech.root);
  speech.update(3, { ...state, activeSlimeId: 'volt' });
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, 100);
  for (const aspect of [16 / 9, 1, 9 / 16]) {
    camera.aspect = aspect; camera.updateProjectionMatrix();
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      camera.position.set(50, 10, -50); camera.rotation.set(.6, yaw, 0); camera.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
      speech.mesh.onBeforeRender(null!, scene, camera, speech.mesh.geometry, speech.mesh.material, null!);
      const position = speech.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      assert.ok(Math.abs(position.x) < .8 && Math.abs(position.y) < .8 && Math.abs(position.z) < 1);
      assert.equal(speech.mesh.material.depthTest, false);
      assert.equal(speech.mesh.renderOrder, 1000);
    }
  }
  const before = speech.readModel;
  speech.present(state);
  scene.updateMatrixWorld(true);
  speech.mesh.onBeforeRender(null!, scene, camera, speech.mesh.geometry, speech.mesh.material, null!);
  assert.deepEqual(speech.readModel, before);
  assert.deepEqual(speech.mesh.getWorldPosition(new THREE.Vector3()).toArray(), [4, 7.75, 6]);
  assert.equal(speech.mesh.material.depthTest, true);
  assert.deepEqual(speech.mesh.scale.toArray(), [1, 1, 1]);
  speech.update(4, { ...state, activeSlimeId: 'goop' });
  assert.equal(speech.readModel.speaker, 'goop');
  assert.equal(speech.mesh.material.depthTest, false);
  assert.deepEqual(speech.root.position.toArray(), [1, 4.75, 3]);
  speech.dispose();
});
