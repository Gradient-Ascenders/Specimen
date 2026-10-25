import {loadRoomFiveShellFixture} from './helpers/RoomFiveShellAsset.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { RoomThreeGreybox } from '../src/levels/RoomThreeGreybox.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { ContainmentSurveillanceCameras, CONTAINMENT_SURVEILLANCE_PLACEMENTS,
  CONTAINMENT_SURVEILLANCE_TRACKING } from '../src/render/environment/containment/ContainmentSurveillanceCameras.ts';
import {loadRoomOneShellFixture} from './helpers/RoomOneShellAsset.ts';
import {loadRoomTwoShellFixture} from './helpers/RoomTwoShellAsset.ts';
import {loadRoomThreeShellFixture} from './helpers/RoomThreeShellAsset.ts';
import {loadOpeningLaboratoryFixture} from './helpers/OpeningLaboratoryAsset.ts';
import {loadRoomFourShellFixture} from './helpers/RoomFourShellAsset.ts';

function createFixtures() {
  const roots = { 1: new THREE.Group(), 2: new THREE.Group(), 3: new THREE.Group(), 5: new THREE.Group() };
  return { roots, rig: new ContainmentSurveillanceCameras(roots) };
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

test('hidden rooms skip decorative tracking and resume when their lighting room returns',()=>{
  const {rig}=createFixtures();
  try{
    const target=new THREE.Vector3(0,2,20),first=rig.cameras[0],second=rig.cameras[1];
    rig.update(.1,target,1<<1);
    assert.notEqual(first.tilt.rotation.x,.3);assert.equal(second.pan.rotation.y,0);assert.equal(second.tilt.rotation.x,.3);
    const pan=first.pan.rotation.y,tilt=first.tilt.rotation.x;
    rig.update(.1,target,1<<2);
    assert.equal(first.pan.rotation.y,pan);assert.equal(first.tilt.rotation.x,tilt);assert.notEqual(second.tilt.rotation.x,.3);
  }finally{rig.dispose();}
});

for (const includeDevelopmentHelpers of [false, true]) {
  test(`all six surveillance cameras match the requested monitor, doorway and upper-wall locations (dev ${includeDevelopmentHelpers})`, () => {
    const scene = new ContainmentLevelScene(() => {}, { includeDevelopmentHelpers });
    try {
      const cameras = scene.surveillanceCameras.cameras;
      assert.deepEqual(cameras.map(camera => camera.placement.roomId), [1, 2, 2, 3, 3, 5]);
      assert.equal(scene.root.getObjectByName('room-1-safe-spawn-marker'), undefined);
      const monitorRelations = [
        [cameras[0], scene.roomOneMonitor, 'left'],
        [cameras[1], scene.roomTwoMonitor, 'right'],
        [cameras[3], scene.roomThreeMonitor, 'right'],
        [cameras[5], scene.roomFiveMonitor, 'above'],
      ] as const;
      for (const [camera, monitor, side] of monitorRelations) {
        assert.equal(camera.root.parent, monitor.root.parent);
        const local = monitor.root.worldToLocal(camera.root.getWorldPosition(new THREE.Vector3()));
        if (side === 'left') assert.ok(local.x < -2.5);
        if (side === 'right') assert.ok(local.x > 2.5);
        if (side === 'above') { assert.ok(Math.abs(local.x) < 1e-6); assert.ok(local.y > 2); }
        assert.ok(Math.abs(local.z) < .25, 'Camera brackets must meet the same wall as the monitor.');
      }
      const doorway = cameras[2], upperWall = cameras[4];
      assert.equal(doorway.root.position.x, 0); assert.ok(doorway.root.position.y > 14.9);
      assert.ok(Math.abs(doorway.root.position.z - 48.8) < .05);
      assert.ok(upperWall.root.position.x > -3 && upperWall.root.position.x < 5,
        'Use the blank panel right of the final strip when looking at the rear wall, not the narrow opposite corner.');
      assert.ok(Math.abs(upperWall.root.position.y - 27.68) < .3);
      assert.ok(Math.abs(upperWall.root.position.z - 76.8) < .05);
      const colliders = new Set(scene.collisionMeshes);
      for (const camera of cameras) for (const mesh of meshes(camera.root)) {
        assert.equal(colliders.has(mesh), false); assert.equal(mesh.userData.visualOnly, true);
        assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
        assert.equal(mesh.layers.mask, 1, 'Diegetic cameras remain visible in F1 clean gameplay mode.');
      }
      assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
    } finally { scene.dispose(); }
  });
}

test('camera lenses follow moving Bob smoothly on every wall orientation, including rotated room parents', () => {
  const { roots, rig } = createFixtures();
  try {
    for (const root of Object.values(roots)) {
      root.position.set(8, 3, -5); root.rotation.y = .34;
    }
    for (const camera of rig.cameras) {
      for (const local of [new THREE.Vector3(3, -3, 8), new THREE.Vector3(-4, 2, 9)]) {
        const target = camera.root.localToWorld(local.clone().add(camera.pan.position));
        const before = camera.pan.rotation.y;
        rig.update(1 / 60, target);
        const expected = Math.atan2(local.x, local.z);
        assert.ok(Math.abs(camera.pan.rotation.y - expected) < Math.abs(before - expected));
        assert.ok(Math.abs(camera.pan.rotation.y - before) < .2, 'The head must turn, not teleport.');
        rig.update(3, target);
        const origin = camera.pan.getWorldPosition(new THREE.Vector3());
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.tilt.getWorldQuaternion(new THREE.Quaternion()));
        assert.ok(forward.dot(target.clone().sub(origin).normalize()) > .999999);
      }
    }
  } finally { rig.dispose(); }
});

test('tracking uses Bob rather than the active Goop and freezes during death presentation', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    const camera = scene.surveillanceCameras.cameras[0];
    scene.resetPresentation();
    const bob = camera.root.localToWorld(new THREE.Vector3(4, -2, 8).add(camera.pan.position));
    const goop = camera.root.localToWorld(new THREE.Vector3(-4, -2, 8).add(camera.pan.position));
    scene.update(.1, bob, goop);
    assert.ok(camera.pan.rotation.y > 0, 'Only Bob is the surveillance target.');
    const pan = camera.pan.rotation.y, tilt = camera.tilt.rotation.x;
    scene.updateDeath(3);
    assert.equal(camera.pan.rotation.y, pan); assert.equal(camera.tilt.rotation.x, tilt);
    scene.resetPresentation(); assert.equal(camera.pan.rotation.y, 0); assert.equal(camera.tilt.rotation.x, .3);
    scene.reconcilePresentationAfterRecovery(bob);
    assert.ok(Math.abs(camera.pan.rotation.y - Math.atan2(4, 8)) < 1e-8);
  } finally { scene.dispose(); }
});

test('camera response is timestep-independent, mechanically bounded and safe at degenerate positions', () => {
  const a = createFixtures(), b = createFixtures();
  try {
    const camera = a.rig.cameras[0];
    const target = camera.root.localToWorld(new THREE.Vector3(6, -20, 1).add(camera.pan.position));
    for (let step = 0; step < 60; step++) a.rig.update(1 / 60, target);
    for (let step = 0; step < 30; step++) b.rig.update(1 / 30, target);
    a.rig.cameras.forEach((camera, index) => {
      assert.ok(Math.abs(camera.pan.rotation.y - b.rig.cameras[index].pan.rotation.y) < 1e-10);
      assert.ok(Math.abs(camera.tilt.rotation.x - b.rig.cameras[index].tilt.rotation.x) < 1e-10);
    });
    const T = CONTAINMENT_SURVEILLANCE_TRACKING;
    for (const local of [new THREE.Vector3(20, -50, -10), new THREE.Vector3(-20, 50, -10)]) {
      a.rig.update(10, camera.root.localToWorld(local.add(camera.pan.position)));
      assert.ok(Math.abs(camera.pan.rotation.y) <= T.maximumYawRadians);
      assert.ok(camera.tilt.rotation.x <= T.maximumPitchRadians);
      assert.ok(camera.tilt.rotation.x >= T.minimumPitchRadians);
    }
    const angles = [camera.pan.rotation.y, camera.tilt.rotation.x];
    a.rig.update(0, target); a.rig.update(10); a.rig.update(10, { x: NaN, y: 0, z: 0 });
    a.rig.update(10, camera.pan.getWorldPosition(new THREE.Vector3()));
    assert.deepEqual([camera.pan.rotation.y, camera.tilt.rotation.x], angles);
    for (const dt of [-1, NaN, Infinity]) assert.throws(() => a.rig.update(dt, target), /timestep/);
  } finally { a.rig.dispose(); b.rig.dispose(); }
});

test('all fixtures share three bounded geometries and two materials without per-frame uploads or duplicated disposal', () => {
  const { rig } = createFixtures();
  const parts = rig.cameras.flatMap(camera => meshes(camera.root));
  const geometry = new Set(parts.map(mesh => mesh.geometry));
  const materials = new Set(parts.map(mesh => mesh.material as THREE.Material));
  try {
    assert.equal(CONTAINMENT_SURVEILLANCE_PLACEMENTS.length, 6); assert.equal(parts.length, 18);
    assert.equal(geometry.size, 3); assert.equal(materials.size, 2);
    const triangles = [...geometry].reduce((count, geometry) => count + geometry.index!.count / 3, 0);
    assert.ok(triangles < 1000, 'The entire shared model is deliberately small.');
    const versions = [...geometry].map(geometry => geometry.getAttribute('position').version);
    for (let step = 0; step < 120; step++) rig.update(1 / 60, { x: step / 20, y: 1, z: 1 });
    assert.deepEqual([...geometry].map(geometry => geometry.getAttribute('position').version), versions);
    for (const material of materials) assert.equal((material as THREE.MeshStandardMaterial).map, null);
    let disposed = 0;
    for (const resource of [...geometry, ...materials]) resource.addEventListener('dispose', () => { disposed++; });
    rig.dispose(); rig.dispose(); rig.update(10, { x: 0, y: 0, z: 0 }); rig.reset();
    assert.equal(disposed, 5);
    assert.ok(rig.cameras.every(camera => camera.root.parent === null));
  } finally { rig.dispose(); }
});

test('All surveillance fixtures use the exact shared cutscene camera and the doorway camera clears the shutter through its full tilt range',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),rig=scene.surveillanceCameras;
  const source=await loadOpeningLaboratoryFixture(),prefab=source.getObjectByName('OI_Camera')!;
  const originals=new Map(meshes(prefab).map(mesh=>[mesh.name,mesh.geometry]));
  try{
    await scene.teaching.roomOneArt.shell.prepare(loadRoomOneShellFixture);
    await scene.prepareEnvironmentArt(loadRoomTwoShellFixture,loadRoomThreeShellFixture,async()=>source,loadRoomFourShellFixture,loadRoomFiveShellFixture);
    assert.deepEqual(rig.modelDiagnostics,{ready:true,cameras:6,meshes:5,textureCount:0});
    const geometry=new Set<THREE.BufferGeometry>();
    for(const camera of rig.cameras){
      const model=camera.tilt.getObjectByName('containment-authored-surveillance-camera');
      assert.ok(model);
      for(const mesh of meshes(model)){
        geometry.add(mesh.geometry);
        assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);
        if(mesh.name.startsWith('OI_Camera_')){
          assert.equal(mesh.geometry,originals.get(mesh.name),'Reuse the exact cutscene mesh, without substituting another camera.');
          assert.equal(mesh.material,scene.teaching.roomOneArt.shell.borrowFinish(mesh.name.replace('OI_Camera_','')));
        }
      }
      assert.equal(camera.tilt.getObjectByName(`${camera.root.name}-housing`)!.visible,false);
      assert.equal(camera.tilt.getObjectByName(`${camera.root.name}-lens-and-recording-led`)!.visible,false);
    }
    assert.equal(geometry.size,5,'All six cameras share four authored buffers and one recording diode.');
    const camera=rig.cameras.find(camera=>camera.placement.id==='room-2-exit-surveillance-camera')!;
    const model=camera.tilt.getObjectByName('containment-authored-surveillance-camera')!;
    const shutterEnvelope=new THREE.Box3(new THREE.Vector3(-2.1,14,48.3),new THREE.Vector3(2.1,14.90,49.5));
    const T=CONTAINMENT_SURVEILLANCE_TRACKING;
    for(const yaw of [-T.maximumYawRadians,0,T.maximumYawRadians])
      for(const pitch of [T.minimumPitchRadians,.3,T.maximumPitchRadians]){
        camera.pan.rotation.y=yaw;camera.tilt.rotation.x=pitch;scene.root.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(model);
        assert.equal(bounds.intersectsBox(shutterEnvelope),false,'The camera must clear the shutter when pointing down.');
        assert.ok(bounds.min.y>15.1,'Leave physical clearance over the header, including the lens and yoke.');
      }
    let disposed=0,bank=0;
    for(const resource of geometry)resource.addEventListener('dispose',()=>disposed++);
    scene.teaching.roomOneArt.shell.borrowFinish('Ivory').addEventListener('dispose',()=>bank++);
    rig.dispose();rig.dispose();assert.equal(disposed,5);assert.equal(bank,0);
    scene.dispose();assert.equal(bank,1);
  }finally{scene.dispose();}
});

test('Room 3 sticky-wall trim is separated from the backing and joined without overlapping coplanar corners', () => {
  const resources = new ContainmentArtResources(), room = new RoomThreeGreybox(() => {}, resources);
  try {
    room.root.updateMatrixWorld(true);
    const bounds = (name: string, index?: number) => {
      const mesh = room.art.root.getObjectByName(name) as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const matrix = mesh.matrixWorld.clone();
      if (index !== undefined) {
        const instance = new THREE.Matrix4(); (mesh as THREE.InstancedMesh).getMatrixAt(index, instance);
        matrix.multiply(instance);
      }
      return mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
    };
    const backing = bounds('room-3-main-adhesion-test-backing');
    const membrane = bounds('room-3-main-adhesion-replaceable-membrane');
    const left = bounds('room-3-main-adhesion-cartridge-frame-verticals', 0);
    const right = bounds('room-3-main-adhesion-cartridge-frame-verticals', 1);
    for (let index = 0; index < 5; index++) {
      const tick = bounds('room-3-main-adhesion-measurement-ticks', index);
      assert.ok(tick.min.x < left.min.x - .01, 'Height marks stay visible in front of the repositioned trim.');
      assert.ok(tick.max.x > left.min.x, 'The marks remain mounted in the trim, not floating.');
    }
    for (const index of [0, 1]) {
      const horizontal = bounds('room-3-main-adhesion-cartridge-frame-horizontals', index);
      assert.ok(horizontal.min.x < backing.min.x - .06);
      assert.ok(horizontal.min.x < membrane.min.x - .02);
      assert.ok(left.max.z <= horizontal.min.z + 1e-5);
      assert.ok(right.min.z >= horizontal.max.z - 1e-5);
      const finalHorizontal = bounds('room-3-final-adhesion-cartridge-frame-horizontals', index);
      const finalLeft = bounds('room-3-final-adhesion-cartridge-frame-verticals', 0);
      const finalRight = bounds('room-3-final-adhesion-cartridge-frame-verticals', 1);
      assert.ok(finalLeft.max.x <= finalHorizontal.min.x + 1e-5);
      assert.ok(finalRight.min.x >= finalHorizontal.max.x - 1e-5);
    }
  } finally { room.dispose(); resources.dispose(); }
});
