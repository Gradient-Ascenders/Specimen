import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import { MaintenanceDronePresentation } from '../src/render/environment/blackout/MaintenanceDronePresentation.ts';
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

