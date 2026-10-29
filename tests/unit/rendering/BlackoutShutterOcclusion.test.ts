import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {BlackoutShutterOcclusion} from '../../../src/render/environment/blackout/BlackoutShutterOcclusion.ts';

function fixture() {
  const scene = new THREE.Scene(), frame = new THREE.Group(), art = new THREE.Group();
  scene.add(frame); frame.add(art);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(8.06, 5.27, .16), new THREE.MeshBasicMaterial());
  gate.position.set(0, 3.05, 0); frame.add(gate);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 3.05, 10); frame.add(camera);
  const calls: {camera: THREE.Camera; object: THREE.Object3D}[] = [];
  const renderer = {renderBufferDirect: function (c: THREE.Camera, _s: unknown, _g: unknown,
    _m: unknown, object: THREE.Object3D) { assert.equal(this, renderer); calls.push({camera: c, object}); }} as unknown as THREE.WebGLRenderer;
  const add = (name: string, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name; mesh.position.set(x, y, z); mesh.updateMatrix(); mesh.matrixAutoUpdate = false; art.add(mesh); return mesh;
  };
  const hidden = add('B3_R1_Batch_hidden', 0, 3.05, -20);
  const edge = add('B3_R2_Batch_edge', 12, 3.05, -20);
  const overhead = add('B3_R2_Batch_overhead', 0, 15, -20);
  const front = add('B3_R2_Batch_front', 0, 3.05, 2);
  const crossing = add('B3_R2_Batch_crossing', 0, 3.05, -.1);
  const actor = add('independent-companion', 0, 3.05, -20);
  scene.updateMatrixWorld(true);
  const helper = new BlackoutShutterOcclusion(renderer, gate, scene);
  const submit = (mesh: THREE.Mesh, c: THREE.Camera = camera) =>
    renderer.renderBufferDirect(c, scene, mesh.geometry, mesh.material as THREE.Material, mesh, null as never);
  const draw = (meshes = [hidden, edge, overhead, front, crossing, actor]) => {
    scene.updateMatrixWorld(true); helper.render(camera, () => meshes.forEach(mesh => submit(mesh)));
  };
  return {scene, frame, art, gate, camera, calls, renderer, helper, hidden, edge, overhead, front, crossing, actor, submit, draw};
}

test('closed shutter rejects only fully covered authored boxes and keeps independently positioned actors', () => {
  const f = fixture(), transform = f.actor.matrix.clone(), layers = f.hidden.layers.mask;
  f.draw();
  assert.deepEqual(f.calls.map(c => c.object.name), [f.edge, f.overhead, f.front, f.crossing, f.actor].map(o => o.name));
  assert.equal(f.hidden.visible, true); assert.equal(f.hidden.layers.mask, layers);
  assert.equal(f.hidden.geometry.drawRange.count, Infinity); assert.deepEqual(f.actor.matrix, transform);
});

test('camera occlusion preserves every shadow-camera submission', () => {
  const f = fixture(), shadow = new THREE.PerspectiveCamera();
  f.helper.render(f.camera, () => { f.submit(f.hidden); f.submit(f.hidden, shadow); });
  assert.deepEqual(f.calls, [{camera: shadow, object: f.hidden}]);
});

test('opening gates, hidden gates, rear cameras and alternate camera layers bypass occlusion', () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.gate.position.y += .001; },
    (f: ReturnType<typeof fixture>) => { f.gate.visible = false; },
    (f: ReturnType<typeof fixture>) => { f.frame.visible = false; },
    (f: ReturnType<typeof fixture>) => { f.camera.position.z = -2; },
    (f: ReturnType<typeof fixture>) => { f.camera.layers.set(3); },
  ]) {
    const f = fixture(); change(f); f.draw([f.hidden]);
    assert.equal(f.calls.length, 1);
  }
});

test('world transforms and independently moving geometry invalidate the previous draw decision', () => {
  const f = fixture(); f.draw([f.hidden]); assert.equal(f.calls.length, 0);
  f.frame.position.set(100, 4, -80); f.frame.rotation.y = .7;
  f.draw([f.hidden]); assert.equal(f.calls.length, 0, 'common scene/camera rotation preserves coverage');
  f.art.position.x = 20; f.draw([f.hidden]); assert.equal(f.calls.length, 1, 'moving art can leave the gate silhouette');
  f.art.position.x = 0; f.camera.position.x = 20;
  f.draw([f.hidden]); assert.equal(f.calls.length, 2, 'a side camera can see around the gate');
});

test('near-clipped shutters and non-perspective cameras keep authored draws', () => {
  const f = fixture();
  f.camera.near = 11; f.camera.updateProjectionMatrix();
  f.draw([f.hidden]); assert.equal(f.calls.length, 1, 'gate clipped but distant art can remain visible');
  f.camera.near = .1; f.camera.updateProjectionMatrix();
  f.camera.position.set(0, 2, .7);
  f.camera.lookAt(0, 2 + Math.sin(.6), .7 - Math.cos(.6));
  f.draw([f.hidden]); assert.equal(f.calls.length, 2, 'tilted near plane intersects the shutter');
  const orthographic = new THREE.OrthographicCamera();
  f.helper.render(orthographic, () => f.submit(f.hidden, orthographic));
  assert.equal(f.calls.length, 3, 'perspective-cone proof is not valid for orthographic views');
});

test('throwing draws restore the exact renderer method and leave scene state untouched', () => {
  const f = fixture(), previous = f.renderer.renderBufferDirect, matrix = f.hidden.matrixWorld.clone();
  assert.throws(() => f.helper.render(f.camera, () => { f.submit(f.hidden); throw Error('test draw failure'); }), /test draw failure/);
  assert.equal(f.renderer.renderBufferDirect, previous);
  assert.equal(f.hidden.visible, true); assert.equal(f.hidden.layers.mask, 1);
  assert.equal(f.hidden.geometry.drawRange.count, Infinity); assert.deepEqual(f.hidden.matrixWorld, matrix);
  f.draw([f.hidden]); assert.equal(f.calls.length, 0);
});
