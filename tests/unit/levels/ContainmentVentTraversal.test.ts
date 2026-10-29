import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { ContainmentTeachingScene } from '../../../src/levels/ContainmentTeachingScene.ts';
import { ColliderTransformMode, CollisionWorld } from '../../../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';
import { ContainmentArtResources } from '../../../src/render/environment/containment/ContainmentArtResources.ts';

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Room 1's vent ramp reaches its top landing without an invisible curb (dev ${includeDevelopmentHelpers})`, () => {
    const resources = new ContainmentArtResources();
    const scene = new ContainmentTeachingScene(resources, { includeDevelopmentHelpers });
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
    try {
      scene.root.updateMatrixWorld(true);
      world.registerAll(scene.collisionMeshes, undefined, ColliderTransformMode.Static);
      surfaces.registerAll(scene.collisionMeshes);
      const ramp = scene.collisionMeshes.find(mesh => mesh.name === 'duct-segment-b-ramp')!;
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(ramp.quaternion);
      const forward = new THREE.Vector3(0, 0, 1);
      for (const hz of [60, 120]) for (const x of [-5.24, -5.1, -4.8, -4.5, -4.36]) {
        const initialPosition = new THREE.Vector3(x - ramp.position.x, .125, -4)
          .applyMatrix4(ramp.matrixWorld).addScaledVector(normal, .462);
        const body = new KinematicBody({ world, surfaces, initialPosition });
        for (let step = 0; step < 4 * hz && body.position.z < 24.35; step++) {
          const previousZ = body.position.z;
          body.update(1 / hz, forward);
          if (previousZ > 22.5 && previousZ < 24.3) {
            assert.ok(body.position.z - previousZ > 1.8 / hz,
              `Vent snag at x=${x}, z=${previousZ}, ${hz}Hz: ${body.lastContactCollider?.name}`);
            assert.equal(body.grounded, true, `Walking over the landing edge must not require a jump: x=${x}, z=${body.position.z}, y=${body.position.y}, contact=${body.lastContactCollider?.name}`);
          }
        }
        assert.ok(body.position.z >= 24.35, `The turning bay must be reachable at x=${x}, ${hz}Hz.`);
      }
    } finally { world.clear(); surfaces.clear(); scene.dispose(); resources.dispose(); }
  });
}

// Keep the authored lining tied to gameplay when either side changes later.
test('authored vent retains the collision contract and a bounded light-free asset', async () => {
  const resources = new ContainmentArtResources();
  const scene = new ContainmentTeachingScene(resources);
  try {
    const root = new URL('../../../assets/environments/containment-vent/', import.meta.url);
    const contract = JSON.parse(readFileSync(new URL('shell-contract.json', root), 'utf8'));
    const colliders = scene.collisionMeshes.filter(mesh => mesh.name.startsWith('duct-'));
    assert.equal(contract.length, colliders.length);
    for (const [name, size, position, degrees] of contract) {
      const mesh = colliders.find(candidate => candidate.name === name)!;
      assert.ok(mesh, name);
      assert.deepEqual(mesh.userData.sizeMetres, size, name);
      assert.deepEqual(mesh.position.toArray(), position, name);
      assert.ok(Math.abs(mesh.rotation.x - degrees * Math.PI / 180) < 1e-10, name);
      assert.equal((mesh.material as THREE.Material).visible, false, 'Collision shells must not duplicate the authored lining.');
    }
    const bytes = readFileSync(new URL('vent.glb', root));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(gltf.meshes.length, 4);
    assert.equal(gltf.textures?.length ?? 0, 0);
    assert.equal(gltf.extensions?.KHR_lights_punctual, undefined);
    let triangles = 0;
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
      assert.notEqual(primitive.attributes.COLOR_0, undefined, 'Fixed shading must survive export.');
      triangles += gltf.accessors[primitive.indices].count / 3;
    }
    assert.ok(triangles < 4000, `Vent budget: ${triangles} triangles`);
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    asset.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const x of [-5.7, -4.8, -3.9]) for (const z of [12.99, 13.02, 13.06, 13.10, 13.14, 13.2]) {
      ray.set(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(asset.scene, true).find(hit => hit.point.y > 5.2 && hit.point.y < 5.5);
      assert.ok(hit && hit.point.y > 5.2 && hit.point.y < 5.5, `Open ramp toe at ${x}, ${z}`);
    }
    asset.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  } finally { scene.dispose(); resources.dispose(); }
});
