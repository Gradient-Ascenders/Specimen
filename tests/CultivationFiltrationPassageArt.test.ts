import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoLabPassageGreybox } from '../src/levels/LevelTwoLabPassageGreybox.ts';
import { LevelTwoAirDuctGreybox } from '../src/levels/LevelTwoAirDuctGreybox.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { ColliderTransformMode, CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationFiltrationPassageArt } from '../src/render/environment/cultivation/CultivationFiltrationPassageArt.ts';

test('filtration niches preserve both routes and the Bob-controlled Goop entry lock', () => {
  const passage = new LevelTwoLabPassageGreybox({
    id: 'cultivation-room-2-to-3-goop-lab-passage', fromRoomId: 2, toRoomId: 3,
    widthMetres: 7, heightMetres: 6.5, lengthMetres: 28, doorwayWidthMetres: 4,
    doorwayHeightMetres: 4.6, entryInitiallyLocked: true, routeOwner: 'goop',
  });
  const duct = new LevelTwoAirDuctGreybox({
    id: 'cultivation-room-2-to-3-bob-air-duct', fromRoomId: 2, toRoomId: 3,
    innerWidthMetres: 2, innerHeightMetres: 2.1, lengthMetres: 28,
  });
  duct.root.position.set(8, 18.8, 0);
  const lab = new CultivationLabMaterials(cultivationAssets), contamination = new CultivationContaminationArt(lab);
  lab.dress(passage.builder, [], contamination.overrides(passage.builder)); lab.dress(duct.builder);
  const colliders = [...passage.collisionMeshes, ...duct.collisionMeshes];
  const snapshots = colliders.map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material,
    positions: Array.from(mesh.geometry.getAttribute('position').array), position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(), metadata: structuredClone(mesh.userData), visible: mesh.visible }));
  const art = new CultivationFiltrationPassageArt(passage, duct, lab, contamination);
  const world = new CollisionWorld(), hit = new CollisionHit();
  try {
    assert.deepEqual([...passage.collisionMeshes, ...duct.collisionMeshes], colliders);
    for (const s of snapshots) {
      assert.equal(s.mesh.geometry, s.geometry);
      assert.deepEqual(Array.from(s.mesh.geometry.getAttribute('position').array), s.positions);
      assert.deepEqual(s.mesh.position.toArray(), s.position);
      assert.deepEqual(s.mesh.quaternion.toArray(), s.quaternion);
      assert.deepEqual(s.mesh.userData, s.metadata);
      assert.equal(s.mesh.visible, s.visible);
    }
    world.registerAll(colliders);
    for (const [origin, direction, name] of [
      [[0, 3, 12], [1, 0, 0], `${passage.root.name}-east-wall`],
      [[0, 3, 20], [-1, 0, 0], `${passage.root.name}-west-wall`],
      [[0, 1, 15], [0, -1, 0], `${passage.root.name}-floor`],
      [[8, 19.6, 9.5], [1, 0, 0], `${duct.root.name}-east-wall`],
    ] as const) {
      assert.ok(world.raycast(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 8, hit));
      assert.equal(hit.object?.name, name, 'art cannot add routes, supports or collision obstacles');
    }
    const occupants = [{ id: 'goop', position: new THREE.Vector3(0, .66, 2), radiusMetres: .45 }];
    passage.update(2, occupants);
    assert.equal(passage.entryDoor.locked, true); assert.equal(passage.entryDoor.openProgress, 0);
    passage.entryDoor.setLocked(false); passage.update(2, occupants);
    assert.equal(passage.entryDoor.state, 'open');
    passage.reset();
    assert.equal(passage.entryDoor.locked, true); assert.equal(passage.entryDoor.openProgress, 0);
    art.dispose();
    for (const s of snapshots) assert.equal(s.mesh.material, s.material);
  } finally { world.clear(); art.dispose(); lab.dispose(); contamination.dispose(); duct.dispose(); passage.dispose(); }
});

test('both bodies walk their connector routes while the inactive Bob holds the lock',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  const passage=scene.roomTwoToThreeGoopPassage,duct=scene.roomTwoToThreeBobAirDuct;
  passage.root.visible=true;duct.root.visible=true;
  scene.root.updateWorldMatrix(true,true);
  world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);
  for(const mesh of scene.dynamicCollisionMeshes)world.setTransformMode(mesh,ColliderTransformMode.Dynamic);
  surfaces.registerAll(scene.collisionMeshes);
  // Scoped connector staging: this does not substitute for the Room 2 puzzle.
  const bob=new KinematicBody({world,surfaces,initialPosition:scene.roomTwo.root.localToWorld(new THREE.Vector3(-17.7,14.2,28.5))});
  const goop=new KinematicBody({world,surfaces,initialPosition:passage.root.localToWorld(new THREE.Vector3(0,.66,-1.5)),
    config:{adhesionEnabled:false,reboundEnabled:false,chargedJumpEnabled:false}});
  const zero=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
  const local=(root:THREE.Object3D,body:KinematicBody)=>root.worldToLocal(new THREE.Vector3().copy(body.position));
  const step=(active:KinematicBody,movement:THREE.Vector3,jump?:{pressed:boolean;held:boolean;released:boolean})=>{
    bob.update(1/60,active===bob?movement:zero,active===bob?jump:undefined);
    goop.update(1/60,active===goop?movement:zero,active===goop?jump:undefined);
    const occupants=[{id:'bob' as const,position:bob.position,radiusMetres:bob.radiusMetres,attached:bob.attached,supportCollider:bob.supportCollider},
      {id:'goop' as const,position:goop.position,radiusMetres:goop.radiusMetres,attached:goop.attached,supportCollider:goop.supportCollider}];
    scene.roomTwo.update(1/60,occupants);passage.update(1/60,occupants);scene.filtrationArt.update(1/60);
  };
  try{
    assert.equal(passage.entryDoor.locked,true);
    for(let i=0;i<20;i++)step(bob,new THREE.Vector3(-1,0,0));
    assert.equal(bob.supportCollider,scene.roomTwo.wallButton);assert.equal(bob.attached,true);
    for(let i=0;i<60;i++)step(bob,zero);
    const heldPosition=new THREE.Vector3().copy(bob.position);
    // The original passage floor is 20 cm above the radioactive floor.
    for(let tick=0;tick<600&&local(passage.root,goop).z<29.5;tick++)
      step(goop,forward,{pressed:tick===30,held:false,released:tick===31});
    assert.ok(local(passage.root,goop).z>29.4,`Goop passage: ${local(passage.root,goop).toArray()}, ${goop.supportColliderName}; doors ${passage.doors.map(d=>`${d.locked}/${d.openProgress}`)}; Bob ${bob.attached}/${bob.supportColliderName}`);
    assert.ok(heldPosition.distanceTo(bob.position)<.02,'inactive Bob remains attached in Room 2');
    assert.equal(passage.entryDoor.locked,false);
    bob.teleport(duct.root.localToWorld(new THREE.Vector3(0,.46,.35)));
    for(let tick=0;tick<500&&local(duct.root,bob).z<28.5;tick++)step(bob,forward);
    assert.ok(local(duct.root,bob).z>28.4,'Bob walks the complete duct and exit reveal');
    assert.equal(passage.entryDoor.locked,true,'releasing Bob restores the original lock');
    scene.reset();
    assert.equal(passage.entryDoor.openProgress,0);assert.equal(passage.exitDoor.openProgress,0);
    assert.equal(scene.filtrationArt.fan.rotation.x,0);
  }finally{scene.dispose();world.clear();surfaces.clear();}
});
