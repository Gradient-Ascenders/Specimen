import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LaserEmitterModel, LASER_EMITTER_ASSET } from '../src/render/hazards/LaserEmitterModel.ts';
import { LaserHazardPresentation } from '../src/render/hazards/LaserHazardPresentation.ts';
import { LaserHazard } from '../src/hazards/LaserHazard.ts';
import data from '../src/assets/hazards/laser-emitter.geometry.json' with { type: 'json' };

test('shared optical heads use the exact Level 1 housing, barrel, aperture and shutter buffers', async () => {
  const bytes = await readFile(new URL('../assets/environments/containment-room-three/room-three-laboratory.glb', import.meta.url));
  assert.equal(data.sourceSha256, createHash('sha256').update(bytes).digest('hex'));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = new LaserEmitterModel(), emitter = model.create('review', 'review');
  const names = { 'R3_Batch_Emitter_Graphite': 'housing-collar', 'R3_Batch_Emitter_Alloy': 'housing-alloy',
    R3_LaserAperture: 'active-aperture', R3_LaserShutter: 'inactive-shutters' };
  try {
    assert.equal(emitter.root.userData.laserEmitterAsset, LASER_EMITTER_ASSET);
    for (const [sourceName, suffix] of Object.entries(names)) {
      const original = scene.getObjectByName(sourceName) as THREE.Mesh;
      const actual = emitter.root.getObjectByName(`review-${suffix}`) as THREE.Mesh;
      assert.deepEqual(actual.geometry.index!.array, original.geometry.index!.array);
      for (const key of Object.keys(original.geometry.attributes))
        assert.deepEqual(actual.geometry.getAttribute(key).array, original.geometry.getAttribute(key).array, `${sourceName}: ${key}`);
      assert.equal(actual.position.lengthSq(), 0); assert.deepEqual(actual.scale.toArray(), [1, 1, 1]);
    }
  } finally {
    model.dispose();
    const materials = new Set<THREE.Material>();
    scene.traverse(object => { if (object instanceof THREE.Mesh) {
      object.geometry.dispose(); for (const material of [object.material].flat()) materials.add(material);
    } });
    for (const material of materials) material.dispose();
  }
});

test('room and standalone emitters keep both apertures aligned through sweeps, translations, circuit gates and reset', () => {
  const hazard = new LaserHazard({ id: 'shared-head', start: { x: 2, y: 4, z: 1 }, end: { x: 6, y: 4, z: 1 },
    timeline: { axisWorld: { x: 0, y: 0, z: 1 }, repeat: true,
      steps: [{ kind: 'sweep', durationSeconds: 1, enabled: true, fromAngleRadians: 0, toAngleRadians: Math.PI }] } });
  const presentation = new LaserHazardPresentation([hazard]);
  const verify = (root: THREE.Object3D, prefix: string) => {
    for (const [suffix, point, sign] of [['start', hazard.start, 1], ['end', hazard.end, -1]] as const) {
      const emitter = root.getObjectByName(`${prefix}${suffix}`)!;
      assert.equal(emitter.userData.laserEmitterAsset, LASER_EMITTER_ASSET);
      assert.ok(emitter.position.distanceTo(new THREE.Vector3(point.x, point.y, point.z)) < 1e-10);
      const direction = new THREE.Vector3().subVectors(hazard.end, hazard.start).normalize().multiplyScalar(sign);
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(emitter.quaternion).dot(direction) > .999999);
      assert.equal(emitter.getObjectByName(`${emitter.name}-active-aperture`)!.visible, hazard.enabled);
      assert.equal(emitter.getObjectByName(`${emitter.name}-inactive-shutters`)!.visible, !hazard.enabled);
    }
  };
  try {
    for (let i = 0; i < 4; i++) {
      hazard.update(.2); hazard.setTranslationOffset({ x: .5, y: i, z: 0 }); presentation.sync();
      verify(presentation.root, 'shared-head-presentation-emitter-');
      assert.equal(hazard.root.getObjectByName('shared-head-emitter-start-proxy')!.visible, false);
      const point = new THREE.Vector3().addVectors(hazard.start, hazard.end).multiplyScalar(.5);
      assert.equal(hazard.intersects({ position: point, radiusMetres: .1 }), true);
    }
    hazard.setCircuitGateEnabled(false); presentation.sync(); verify(presentation.root, 'shared-head-presentation-emitter-');
    assert.equal(presentation.root.getObjectByName('shared-head-presentation-beam-core')!.visible, false);
    hazard.reset(); presentation.sync(); verify(presentation.root, 'shared-head-presentation-emitter-');
    presentation.dispose();
    // The development rig and boss attacks have no room adapter. They still
    // receive the same hardware and mirrored receiver orientation.
    hazard.setTranslationOffset({ x: 0, y: 1, z: 0 });
    for (const suffix of ['start', 'end']) {
      const emitter = hazard.root.getObjectByName(`shared-head-emitter-${suffix}-proxy`)!;
      assert.equal(emitter.visible, true); assert.equal(emitter.userData.laserEmitterAsset, LASER_EMITTER_ASSET);
      const direction = new THREE.Vector3().subVectors(hazard.end, hazard.start).normalize().multiplyScalar(suffix === 'start' ? 1 : -1);
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(emitter.quaternion).dot(direction) > .999999);
    }
  } finally { presentation.dispose(); hazard.dispose(); }
});

test('shared emitter buffers survive an owner unloading and release once after the last owner', () => {
  const a = new LaserEmitterModel(), b = new LaserEmitterModel();
  const first = a.create('a', 'a'), second = b.create('b', 'b');
  const mesh = (root: THREE.Object3D, suffix: string) => root.getObjectByName(`${root.name}-${suffix}`) as THREE.Mesh;
  assert.equal(mesh(first.root, 'housing-collar').geometry, mesh(second.root, 'housing-collar').geometry);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  first.root.traverse(object => { if (object instanceof THREE.Mesh) {
    resources.add(object.geometry); for (const material of [object.material].flat()) resources.add(material);
  } });
  const released = new Map<object, number>();
  for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, (released.get(resource) ?? 0) + 1));
  a.dispose(); a.dispose(); assert.equal(released.size, 0);
  b.dispose(); b.dispose(); for (const resource of resources) assert.equal(released.get(resource), 1);
});
