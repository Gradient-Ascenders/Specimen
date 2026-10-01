import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { ElectricalTargetHighlights } from '../src/render/electrical/ElectricalTargetHighlights.ts';

test('conducting highlights follow available devices, respect depth, and clean up registrations', () => {
  const world = new CollisionWorld();
  const registry = new ElectricalTargetRegistry(world);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .4, 1), new THREE.MeshStandardMaterial());
  mesh.position.set(30, 8, 0); mesh.updateMatrixWorld(true);
  let available = true;
  const makeTarget = (id: string, hitMesh: THREE.Mesh) => ({
    id, displayName: id, hitMeshes: [hitMesh],
    isAvailable: () => available,
    copySocketWorldPosition: (out: THREE.Vector3) => hitMesh.getWorldPosition(out),
    setConnectionState: (_connected: boolean) => {},
  });
  const unregister = registry.register(makeTarget('lamp', mesh));
  const highlights = new ElectricalTargetHighlights(registry);
  const body = { position: new THREE.Vector3(), radiusMetres: .45 };
  const system = new VoltElectricalSystem({
    collisionWorld: world, targetRegistry: registry,
    slimeManager: { activeSlimeId: 'volt', getBody: () => body, canActiveUseAbility: () => true },
    aimRayProvider: { copyAimRay(origin, direction) { origin.set(0,0,0); direction.set(1,0,0); } },
  });
  const state = { ...system.readModel, aimActive: true };
  const originalMaterial = mesh.material;
  const laterMesh = mesh.clone();
  try {
    highlights.update(state);
    const helper = highlights.root.children[0] as THREE.BoxHelper;
    assert.equal(helper.visible, true);
    assert.equal(helper.material.depthTest, true, 'outlines must not reveal targets through walls');
    assert.equal(helper.material.depthWrite, false);
    assert.equal(helper.material.color.getHex(), 0xffd45c);
    highlights.update({...state, selectedTargetId: 'lamp', selectedTargetValid: true});
    assert.equal(helper.material.color.getHex(), 0x6dffac);
    mesh.position.x = 40; mesh.updateMatrixWorld(true);
    highlights.update(state);
    helper.geometry.computeBoundingBox();
    assert.equal(helper.geometry.boundingBox!.getCenter(new THREE.Vector3()).x, 40);
    available = false; highlights.update(state);
    assert.equal(helper.visible, false);
    highlights.update({...state, aimActive: false});
    assert.equal(highlights.root.visible, false, 'switching away or leaving aim hides outlines');
    const removeLater = registry.register(makeTarget('lift', laterMesh));
    assert.equal(highlights.root.children.length, 2);
    removeLater(); unregister();
    assert.equal(highlights.root.children.length, 0);
    assert.equal(mesh.material, originalMaterial, 'power feedback materials must remain device-owned');
  } finally {
    highlights.dispose(); system.dispose(); registry.dispose(); world.clear();
    mesh.geometry.dispose(); mesh.material.dispose();
  }
});
