import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {BlackoutVentArrival} from '../src/cinematics/BlackoutVentArrival.ts';
import {BLACKOUT_ENTRY_VENT as V,sampleBlackoutArrival,blackoutEntryVentFloor} from '../src/cinematics/BlackoutVentArrivalLayout.ts';
import {BLACKOUT_CHECKPOINTS} from '../src/levels/BlackoutFoundationManifest.ts';
import {BlackoutMaintenanceBay} from '../src/levels/BlackoutMaintenanceBay.ts';
import {CollisionWorld,CollisionHit,ColliderTransformMode} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {KinematicBody} from '../src/physics/KinematicBody.ts';
import {BobCharacterPresentation} from '../src/render/bob/BobCharacterPresentation.ts';
import {GoopCharacterPresentation} from '../src/render/goop/GoopCharacterPresentation.ts';
import {VoltCharacterPresentation} from '../src/render/volt/VoltCharacterPresentation.ts';
import {buildBlackoutEntryVent} from '../src/render/environment/blackout/BlackoutEntryVent.ts';
import {BlackoutMaintenanceMaterials} from '../src/render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import {maintenanceMaps} from './helpers/BlackoutMaintenanceMapData.ts';
import {gameplayAudioEvents} from '../src/audio/GameplayAudioEvents.ts';
import {MaintenanceDroneFlightBody} from '../src/vehicles/MaintenanceDroneFlightBody.ts';

function setup(withAmbient=false){
  const bay=new BlackoutMaintenanceBay(maintenanceMaps),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(bay.collisionMeshes,undefined,ColliderTransformMode.Static);surfaces.registerAll(bay.collisionMeshes);
  const scene=new THREE.Scene();scene.add(bay.root);
  const bodies=Object.fromEntries((['bob','goop','volt'] as const).map(id=>[id,new KinematicBody({world,surfaces,initialPosition:BLACKOUT_CHECKPOINTS[0]!.bodyPositions[id]})])) as Record<'bob'|'goop'|'volt',KinematicBody>;
  const presentations={bob:new BobCharacterPresentation(.45),goop:new GoopCharacterPresentation(.45),volt:new VoltCharacterPresentation(.45)};
  presentations.volt.setCollisionWorld(world);Object.values(presentations).forEach(p=>scene.add(p.root));
  const ambient=new THREE.HemisphereLight(0x34404a,0x080a0b,.025);if(withAmbient)bay.root.add(ambient);
  const arrival=new BlackoutVentArrival({root:bay.root,bodies,presentations,ventCollapse:bay.entryVentCollapse}),camera=new THREE.PerspectiveCamera(48,16/9,.1,200);
  return{bay,world,bodies,presentations,arrival,camera,scene,ambient,
    dispose(){arrival.dispose();Object.values(presentations).forEach(p=>p.dispose());bay.dispose();world.clear();surfaces.clear();}};
}

test('all three slide routes are continuous, clear the wall opening, and land on the existing safe CP1 anchors',()=>{
  const s=setup(),a=new THREE.Vector3(),b=new THREE.Vector3(),hit=new CollisionHit();try{
    s.arrival.begin(s.camera);
    assert.equal(s.world.raycast(new THREE.Vector3(0,3.3,0),new THREE.Vector3(0,0,-1),4,hit),false,'the wall vent has a real open bore');
    for(const p of [[2.5,3.3,0],[-2.5,3.3,0],[0,1,0],[0,6,0]])
      assert.equal(s.world.raycast(new THREE.Vector3(...p),new THREE.Vector3(0,0,-1),3,hit),true,'solid wall shoulders surround the hole');
    for(const id of ['bob','goop','volt'] as const){
      sampleBlackoutArrival(id,0,a);assert.ok(a.z>V.startZ&&a.y>6);
      for(let step=1;step<=V.duration*120;step++){
        const t=step/120;sampleBlackoutArrival(id,t,b);
        assert.ok(a.distanceTo(b)<.09,`${id} teleports at ${t}`);
        if(t<V.release[id])assert.ok(b.y>blackoutEntryVentFloor(b.z)+.45);
        if(t>=V.land[id])assert.equal(s.bay.acidAt(b),false);
        a.copy(b);
      }
      assert.deepEqual(b.toArray(),BLACKOUT_CHECKPOINTS[0]!.bodyPositions[id].toArray());
    }
  }finally{s.dispose();}
});

test('the real arrival borrows existing bodies/models, animates each ejection and landing once, and hands back without replay',()=>{
  const s=setup(),parents=Object.values(s.presentations).map(p=>p.root.parent),cues:string[]=[];
  const off=gameplayAudioEvents.on('cue',cue=>cues.push(cue.sound));
  const events={bob:{launch:0,land:0},goop:{launch:0,land:0},volt:{launch:0,land:0}};
  for(const id of ['bob','goop','volt'] as const){
    const p=s.presentations[id],launch=p.onLaunch.bind(p),land=p.onLanding.bind(p);
    p.onLaunch=e=>{events[id].launch++;launch(e);};p.onLanding=(n,speed)=>{events[id].land++;land(n,speed);};
  }
  try{
    assert.equal(s.arrival.begin(s.camera),true);assert.equal(s.arrival.begin(s.camera),false);
    let completed=0;
    while(s.arrival.active){
      if(s.arrival.update(1/60))completed++;
      // The follow rig supplies a fresh base pose each render, even during the movie.
      s.camera.position.set(2,2.4,7);s.camera.lookAt(2,1,2);s.arrival.present(s.camera,1);
      if(s.arrival.active)for(const actor of s.arrival.actors){
        actor.presentation.root.updateWorldMatrix(true,true);
        assert.ok(actor.presentation.root.getWorldPosition(new THREE.Vector3()).distanceTo(actor.position)<1e-7,'no duplicate world/local placement');
        assert.equal(actor.state.grounded,s.arrival.seconds<V.release[actor.id]||s.arrival.seconds>=V.land[actor.id]);
      }
    }
    assert.equal(completed,1);assert.equal(s.arrival.complete,true);
    assert.deepEqual(events,{bob:{launch:1,land:1},goop:{launch:1,land:1},volt:{launch:1,land:1}});
    assert.equal(cues.length,7);assert.equal(cues.filter(c=>c==='world-platform-land-01').length,1);
    assert.equal(s.camera.near,.1);assert.equal(s.camera.fov,48);
    for(const [i,id] of (['bob','goop','volt'] as const).entries()){
      assert.equal(s.presentations[id].root.parent,parents[i]);assert.equal(s.bodies[id].grounded,true);
      assert.deepEqual(new THREE.Vector3().copy(s.bodies[id].position).toArray(),BLACKOUT_CHECKPOINTS[0]!.bodyPositions[id].toArray());
    }
    assert.equal(s.arrival.begin(s.camera),false,'checkpoint recovery/resuming cannot replay the intro');
  }finally{off();s.dispose();}
});

test('rendering never advances the arrival, cancellation restores ownership, and camera hand-back is continuous',()=>{
  const s=setup(),follow=new THREE.Vector3(2,2.4,7),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.2,.3,0));try{
    s.arrival.begin(s.camera);s.arrival.update(1);
    const render=()=>{s.camera.position.copy(follow);s.camera.quaternion.copy(q);s.arrival.present(s.camera,.5);};
    render();const eye=s.camera.position.clone(),orientation=s.camera.quaternion.clone();render();
    assert.equal(s.arrival.seconds,1);assert.deepEqual(s.camera.position,eye);assert.deepEqual(s.camera.quaternion.toArray(),orientation.toArray());
    s.arrival.update(V.duration-1-.00001);s.camera.position.copy(follow);s.camera.quaternion.copy(q);s.arrival.present(s.camera,1);
    assert.ok(s.camera.position.distanceTo(follow)<1e-6);assert.ok(s.camera.quaternion.angleTo(q)<1e-6);
    s.arrival.cancel();assert.equal(s.arrival.active,false);assert.ok(Object.values(s.presentations).every(p=>p.root.parent===s.scene));
    assert.equal(s.camera.near,.1);assert.equal(s.camera.fov,48);
  }finally{s.dispose();}
});

test('entry vent details share the existing kit and have no coplanar surface conflicts',()=>{
  const kit=new BlackoutMaintenanceMaterials(maintenanceMaps),root=new THREE.Group(),colliders:THREE.Mesh[]=[];
  try{
    buildBlackoutEntryVent(root,colliders,kit);assert.equal(colliders.length,32);
    assert.deepEqual(auditOpaqueSurfaces(root).conflicts,[]);
    assert.equal(root.children.filter(n=>n instanceof THREE.Light).length,0,'the arrival does not change the level light signature');
  }finally{
    const materials=new Set<THREE.Material>();root.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();for(const m of [n.material].flat())if(!kit.owns(m))materials.add(m);}});
    materials.forEach(m=>m.dispose());kit.dispose();
  }
});

test('the existing ambient slot eases back to blackout lighting and is restored on cancellation',()=>{
  const s=setup(true);try{
    s.arrival.begin(s.camera);assert.equal(s.ambient.intensity,.14);
    s.arrival.update(V.duration-.00001);s.arrival.present(s.camera,1);
    assert.ok(Math.abs(s.ambient.intensity-.025)<1e-7);
    s.arrival.cancel();assert.equal(s.ambient.intensity,.025);
  }finally{s.dispose();}
});

test('the return duct collapses only after the last slime clears it, and a real drone cannot fly back through',()=>{
  const s=setup(),hit=new CollisionHit(),origin=new THREE.Vector3(0,3.7,0),back=new THREE.Vector3(0,0,-1);
  const root=new THREE.Group(),collider=new THREE.Mesh(new THREE.BoxGeometry(1.65,.55,1.65));root.add(collider);s.scene.add(root);
  const flight=new MaintenanceDroneFlightBody({world:s.world,root,collider});
  const collapse=s.bay.entryVentCollapse;
  try{
    assert.equal(collapse.sealed,true,'debug/no-arrival entry is sealed by default');
    // Populate the static broadphase before opening, then prove visibility
    // changes work without moving or re-registering the collision mesh.
    assert.equal(s.world.raycast(origin,back,4,hit),true);assert.ok(hit.object===collapse.collisionMesh);
    s.arrival.begin(s.camera);assert.equal(collapse.sealed,false);
    assert.equal(s.world.raycast(origin,back,4,hit),false);
    flight.teleport(origin);flight.moveKinematically(new THREE.Vector3(0,0,-3.5));
    assert.ok(flight.position.z< -3.4,'the original open duct really admits the drone');
    while(s.arrival.seconds<V.collapseEnd){
      s.arrival.update(1/120);
      if(s.arrival.seconds>=V.collapseStart){
        const debris=new THREE.Box3().setFromObject(collapse.root);
        for(const actor of s.arrival.actors)
          assert.ok(debris.distanceToPoint(actor.position)>.6,`${actor.id} is clear of falling debris`);
      }
    }
    assert.equal(collapse.sealed,true);
    for(const x of [-1.3,0,1.3])for(const y of [2.8,3.7,4.8]){
      assert.equal(s.world.raycast(new THREE.Vector3(x,y,0),back,4,hit),true);
      assert.ok(hit.object===collapse.collisionMesh,'solid debris spans the full bore');
    }
    flight.teleport(origin);
    for(let frame=0;frame<180;frame++)flight.updatePowered(1/60,back,0,false);
    assert.ok(flight.position.z> -1.2,'Volt cannot drive the powered drone into the old chute');
    const position=collapse.collisionMesh.position.clone(),bounds=collapse.collisionMesh.geometry.boundingBox!.clone();
    s.arrival.cancel();assert.equal(collapse.sealed,true);
    assert.deepEqual(collapse.collisionMesh.position,position);assert.deepEqual(collapse.collisionMesh.geometry.boundingBox,bounds);
    assert.equal(s.arrival.begin(s.camera),false);assert.equal(collapse.sealed,true,'no reopening on resume');
  }finally{collider.geometry.dispose();(collider.material as THREE.Material).dispose();s.dispose();}
});

test('render interpolation cannot seal the vent, but cancelling the arrival seals it safely',()=>{
  const s=setup();try{
    s.arrival.begin(s.camera);s.arrival.update(2);
    const collapse=s.bay.entryVentCollapse;
    collapse.present(V.duration);assert.equal(collapse.sealed,false,'only fixed simulation enables the blocker');
    s.arrival.present(s.camera,1);assert.equal(collapse.sealed,false);
    s.arrival.cancel();assert.equal(collapse.sealed,true);
    const pose=collapse.root.position.clone();s.arrival.present(s.camera,0);
    assert.deepEqual(collapse.root.position,pose);assert.equal(collapse.sealed,true);
    assert.deepEqual(auditOpaqueSurfaces(collapse.root).conflicts,[]);
  }finally{s.dispose();}
});
