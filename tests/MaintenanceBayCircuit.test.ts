import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BLACKOUT_BAY_LAYOUT, BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';

test('vent discharges animate without blue rings or allocating new geometry',()=>{
  const bay=new BlackoutMaintenanceBay();
  const arcs=bay.root.getObjectByName('vent-live-electrical-arcs') as THREE.LineSegments;
  assert.ok(arcs);
  assert.equal(bay.root.getObjectByName('electrical-arc-1'),undefined);
  const attribute=arcs.geometry.getAttribute('position');
  bay.update(.1,false);
  const before=Array.from(attribute.array);
  bay.update(.1,false);
  assert.equal(arcs.geometry.getAttribute('position'),attribute);
  assert.notDeepEqual(Array.from(attribute.array),before);
  let disposed=0;arcs.geometry.addEventListener('dispose',()=>disposed++);
  bay.dispose();assert.equal(disposed,1);
});

test('Volt acquires the actual bay receiver without its conduit blocking the socket', () => {
  const bay = new BlackoutMaintenanceBay();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(bay.collisionMeshes);
  surfaces.registerAll(bay.collisionMeshes);
  const targets = new ElectricalTargetRegistry(world);
  const room = new BlackoutMaintenanceBayController(bay, world, surfaces, targets);
  const body = {position:new THREE.Vector3(-6,3,BLACKOUT_BAY_LAYOUT.rearZ-6),radiusMetres:.45};
  const system = new VoltElectricalSystem({
    slimeManager:{activeSlimeId:'volt',getBody:()=>body,canActiveUseAbility:()=>true},
    collisionWorld:world,targetRegistry:targets,
    config:{acquisitionRangeMetres:11,instabilityWarningRangeMetres:12,tetherBreakRangeMetres:13},
    aimRayProvider:{copyAimRay:(origin,direction)=>{
      origin.copy(body.position);
      room.target.copySocketWorldPosition(direction).sub(origin).normalize();
    }},
  });
  try {
    const indicator = room.receiver.getObjectByName('circuit-connection-indicator') as THREE.Mesh;
    const material = indicator.material as THREE.MeshStandardMaterial;
    assert.equal(material.emissive.getHex(),0xff160b);
    const bounds = new THREE.Box3().setFromObject(room.receiver);
    assert.ok(bounds.max.z >= BLACKOUT_BAY_LAYOUT.rearZ-.225,'backplate meets the rear wall');
    system.update(1/60,{aimHeld:true,fireHeld:true,firePressed:true,gameplayInputEnabled:true,pointerLocked:true});
    assert.equal(system.readModel.connectedTargetId,room.target.id);
    assert.equal(room.powered,true);
    assert.equal(material.emissive.getHex(),0x36ff74);
    body.position.set(6,.46,BLACKOUT_BAY_LAYOUT.rearZ);
    system.revalidateConnection();
    assert.equal(room.powered,false,'Volt cannot carry the connection through the main exit');
    assert.equal(material.emissive.getHex(),0xff2716);
  } finally {
    system.dispose();room.dispose();targets.dispose();bay.dispose();world.clear();surfaces.clear();
  }
});
