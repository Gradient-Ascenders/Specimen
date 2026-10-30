import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { withRetainedCameraView } from '../../../src/render/RetainedCameraView.ts';

function state(camera: THREE.PerspectiveCamera) {
  return {
    id: camera.id, uuid: camera.uuid, name: camera.name, up: camera.up.toArray(),
    position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), order: camera.rotation.order,
    scale: camera.scale.toArray(), pivot: camera.pivot?.toArray(), layers: camera.layers.mask,
    matrix: camera.matrix.toArray(), world: camera.matrixWorld.toArray(), inverse: camera.matrixWorldInverse.toArray(),
    projection: camera.projectionMatrix.toArray(), projectionInverse: camera.projectionMatrixInverse.toArray(),
    auto: camera.matrixAutoUpdate, worldAuto: camera.matrixWorldAutoUpdate, dirty: camera.matrixWorldNeedsUpdate,
    fov: camera.fov, zoom: camera.zoom, near: camera.near, far: camera.far, focus: camera.focus,
    aspect: camera.aspect, view: camera.view && { ...camera.view }, filmGauge: camera.filmGauge, filmOffset: camera.filmOffset,
    coordinateSystem: camera.coordinateSystem, viewport: camera.viewport?.toArray(), visible: camera.visible,
    castShadow: camera.castShadow, receiveShadow: camera.receiveShadow, frustumCulled: camera.frustumCulled, renderOrder: camera.renderOrder,
  };
}

test('retained rehearsal camera copies authored view and restores rig state and ownership after a failed draw', () => {
  const camera = new THREE.PerspectiveCamera(67, 1.6, .15, 900), view = new THREE.PerspectiveCamera(43, 16 / 9, .1, 1800);
  camera.name = 'rig'; camera.position.set(4, 5, 6); camera.rotation.set(.2, -.3, .4, 'YXZ');
  camera.scale.set(1.1, .9, 1.2); camera.up.set(0, 0, 1); camera.zoom = 1.3; camera.focus = 13;
  camera.pivot = new THREE.Vector3(1, 2, 3); camera.layers.enable(2); camera.viewport = new THREE.Vector4(1, 2, 640, 360);
  camera.filmGauge = 36; camera.filmOffset = 2; camera.setViewOffset(1280, 720, 0, 0, 640, 360);
  camera.updateMatrixWorld(true); camera.matrixAutoUpdate = false; camera.matrixWorldAutoUpdate = false; camera.matrixWorldNeedsUpdate = true;
  camera.userData = { owner: 'camera-rig' }; camera.animations.push(new THREE.AnimationClip('rig-animation', 1, []));
  const child = new THREE.Object3D(); camera.add(child);
  view.position.set(30, 8, -20); view.lookAt(0, 2, 40); view.layers.set(4); view.updateMatrixWorld(true);
  view.viewport = new THREE.Vector4(0, 0, 16, 9); view.add(new THREE.Object3D());
  const before = state(camera), authored = state(view), refs = { view: camera.view, viewport: camera.viewport, pivot: camera.pivot, data: camera.userData, animations: camera.animations };
  assert.throws(() => withRetainedCameraView(camera, view, borrowed => {
    assert.equal(borrowed, camera); assert.equal(borrowed.id, before.id); assert.equal(borrowed.uuid, before.uuid);
    const expected = { ...authored, id: before.id, uuid: before.uuid };
    assert.deepEqual(state(borrowed), expected);
    assert.deepEqual(borrowed.children, [child]); assert.equal(child.parent, camera); assert.equal(camera.parent, null);
    borrowed.viewport!.set(99, 99, 99, 99); borrowed.position.setScalar(99); borrowed.projectionMatrix.identity(); borrowed.layers.set(31);
    throw new Error('failed GPU rehearsal');
  }), /failed GPU rehearsal/);
  assert.deepEqual(state(camera), before); assert.deepEqual(state(view), authored);
  assert.equal(camera.view, refs.view); assert.equal(camera.viewport, refs.viewport); assert.equal(camera.pivot, refs.pivot);
  assert.equal(camera.userData, refs.data); assert.equal(camera.animations, refs.animations); assert.deepEqual(camera.children, [child]);
});

test('retained camera pose is restored before a returned pending operation can yield', async () => {
  const camera = new THREE.PerspectiveCamera(), view = new THREE.PerspectiveCamera(42);
  const before = state(camera);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const result = withRetainedCameraView(camera, view, () => pending);
  assert.deepEqual(state(camera), before);
  release(); await result; assert.deepEqual(state(camera), before);
});
