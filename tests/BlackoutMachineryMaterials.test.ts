import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import { BlackoutMaintenanceMaterials } from '../src/render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import { MaintenanceDronePresentation } from '../src/render/environment/blackout/MaintenanceDronePresentation.ts';
import type { MaintenanceDroneReadModel } from '../src/vehicles/MaintenanceDroneTypes.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';

const element = () => ({ style: {}, append() {}, remove() {} });
const host = () => ({ ...element(), ownerDocument: { createElement: element } }) as unknown as HTMLElement;
function allocations(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  return { materials, textures };
}

test('door, receiver and drone borrow kit resources until the owning bay is disposed', () => {
  const bay = new BlackoutMaintenanceBay(maintenanceMaps), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const registry = new ElectricalTargetRegistry(world);
  const controller = new BlackoutMaintenanceBayController(bay, world, surfaces, registry);
  const droneRoot = new THREE.Group(); bay.root.add(droneRoot);
  const drone = new MaintenanceDronePresentation(droneRoot, host(), undefined, undefined, undefined, bay.surfaceMaterials);
  const { materials, textures } = allocations(bay.root);
  const borrowed = [...materials].filter(m => bay.surfaceMaterials.owns(m));
  const counts = new Map<object, number>();
  for (const item of [...borrowed, ...textures].filter(item => item.name.startsWith('blackout-'))) {
    counts.set(item, 0); item.addEventListener('dispose', () => counts.set(item, counts.get(item)! + 1));
  }
  const receiver = controller.receiver;
  assert.equal(controller.target.hitMeshes[0], receiver);
  assert.equal(receiver.name, 'maintenance-bay-door-receiver');
  assert.deepEqual(controller.target.copySocketWorldPosition(new THREE.Vector3()).toArray(), [-9, 3.55, 53.4]);
  const indicator = (receiver.getObjectByName('circuit-connection-indicator') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  assert.equal(bay.surfaceMaterials.owns(indicator), false);
  let indicatorDisposals = 0; indicator.addEventListener('dispose', () => indicatorDisposals++);
  controller.target.setConnectionState(true); assert.equal(indicator.emissive.getHex(), 0x36ff74);
  controller.target.setConnectionState(false); assert.equal(indicator.emissive.getHex(), 0xff2716);
  controller.target.setConnectionState(true); controller.reset(); assert.equal(indicator.emissive.getHex(), 0xff2716);
  assert.equal(controller.door.progress, 0);
  drone.dispose(); drone.dispose(); controller.dispose(); controller.dispose();
  assert.equal(indicatorDisposals, 1);
  for (const count of counts.values()) assert.equal(count, 0, 'borrowers must not release shared resources');
  assert.ok(bay.surfaceMaterials.diagnostics.estimatedTextureBytes < 8 * 1024 * 1024);
  bay.dispose(); bay.dispose();
  for (const count of counts.values()) assert.equal(count, 1, 'owner releases each allocation once');
  registry.dispose(); world.clear(); surfaces.clear();
});

test('textured drone preserves geometry, hierarchy, light state and fan animation with fixed UVs', () => {
  const kit = new BlackoutMaintenanceMaterials(maintenanceMaps), plainRoot = new THREE.Group(), texturedRoot = new THREE.Group();
  const plain = new MaintenanceDronePresentation(plainRoot, host());
  const textured = new MaintenanceDronePresentation(texturedRoot, host(), undefined, undefined, undefined, kit);
  const nodes = (root: THREE.Object3D) => { const list: THREE.Object3D[] = []; root.traverse(o => list.push(o)); return list; };
  const a = nodes(plainRoot), b = nodes(texturedRoot);
  assert.equal(a.length, b.length);
  const uv = new Map<THREE.Mesh, number[]>();
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].type, b[i].type); assert.equal(a[i].name, b[i].name);
    assert.deepEqual(a[i].position.toArray(), b[i].position.toArray()); assert.deepEqual(a[i].rotation.toArray(), b[i].rotation.toArray());
    assert.equal(a[i].castShadow, b[i].castShadow); assert.equal(a[i].receiveShadow, b[i].receiveShadow);
    if (a[i] instanceof THREE.Mesh && b[i] instanceof THREE.Mesh) {
      const oldMesh = a[i] as THREE.Mesh, mesh = b[i] as THREE.Mesh;
      for (const name of ['position', 'normal']) assert.deepEqual(mesh.geometry.attributes[name].array, oldMesh.geometry.attributes[name].array);
      assert.deepEqual(mesh.geometry.index?.array, oldMesh.geometry.index?.array);
      if (kit.owns(mesh.material as THREE.Material)) {
        const values = [...mesh.geometry.attributes.uv.array];
        assert.ok(values.every(Number.isFinite)); uv.set(mesh, values);
      }
    }
  }
  for (const powered of [false, true, false]) {
    const state = { state: powered ? 'parked-hover' : 'grounded-idle', powered, lightEnabled: powered } as MaintenanceDroneReadModel;
    for (let frame = 0; frame < 60; frame++) { plain.update(1 / 60, state); textured.update(1 / 60, state); }
    texturedRoot.position.set(10, 5, -3); texturedRoot.rotation.y += .7;
    for (let i = 1; i < a.length; i++) {
      assert.deepEqual(a[i].rotation.toArray(), b[i].rotation.toArray());
      if (a[i] instanceof THREE.SpotLight) {
        const old = a[i] as THREE.SpotLight, next = b[i] as THREE.SpotLight;
        for (const key of ['intensity', 'distance', 'angle', 'penumbra', 'decay'] as const) assert.equal(old[key], next[key]);
        assert.deepEqual(old.shadow.mapSize, next.shadow.mapSize); assert.equal(old.shadow.bias, next.shadow.bias);
      }
    }
    for (const [mesh, values] of uv) assert.deepEqual([...mesh.geometry.attributes.uv.array], values);
  }
  plain.dispose(); textured.dispose(); kit.dispose();
});
