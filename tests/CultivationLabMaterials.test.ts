import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomOneGreybox } from '../src/levels/LevelTwoRoomOneGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';

test('Room 1 material pass preserves collider geometry, transforms, metadata and hazard identity', () => {
  const room = new LevelTwoRoomOneGreybox(() => {});
  const art = new CultivationLabMaterials(cultivationAssets);
  const snapshots = room.collisionMeshes.map(mesh => ({ mesh, geometry: mesh.geometry,
    positions: Array.from(mesh.geometry.getAttribute('position').array),
    position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(),
    metadata: structuredClone(mesh.userData), material: mesh.material }));
  art.dress(room.builder);
  for (const snapshot of snapshots) {
    assert.deepEqual(Array.from(snapshot.mesh.geometry.getAttribute('position').array), snapshot.positions);
    assert.deepEqual(snapshot.mesh.position.toArray(), snapshot.position);
    assert.deepEqual(snapshot.mesh.quaternion.toArray(), snapshot.quaternion);
    assert.deepEqual(snapshot.mesh.userData, snapshot.metadata);
    if (snapshot.metadata.textureRole === 'acid-floor') assert.ok(snapshot.mesh.material===art.acid,'acid material identity');
    else if (snapshot.metadata.hazardRole) assert.ok(snapshot.mesh.material===snapshot.material,'restored material identity');
  }
  const west = room.root.getObjectByName('cultivation-room-1-west-wall') as THREE.Mesh;
  const east = room.root.getObjectByName('cultivation-room-1-east-wall') as THREE.Mesh;
  assert.ok(west.material===east.material,'shared wall material');
  const uv = west.geometry.getAttribute('uv');
  // 50 m wall must span 12.5 four-metre tiles, not a single stretched texture.
  const values = Array.from({length:4}, (_, i) => uv.getX(i));
  assert.equal(Math.max(...values) - Math.min(...values), 12.5);
  let textureDisposals = 0;
  for (const texture of art.textures) texture.addEventListener('dispose', () => textureDisposals++);
  room.reset();
  assert.ok(west.material===art.wall,'wall material after reset');
  art.dispose();
  art.dispose();
  assert.equal(textureDisposals, art.textures.length);
  for (const snapshot of snapshots) {
    assert.ok(snapshot.mesh.geometry===snapshot.geometry,'restored collider geometry');
    assert.ok(snapshot.mesh.material===snapshot.material,'restored material identity');
  }
  room.dispose();
});

test('cultured adhesive follows the approved routes and Room 5 climb, leaving the lift, duct and hold button alone',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
  try{
    const route=scene.roomTwo.root.getObjectByName('cultivation-room-2-continuous-sticky-route') as THREE.Mesh;
    assert.ok(route.material===scene.labArt.nurserySticky,'shared route biofilm material');
    const approach=scene.roomTwo.root.getObjectByName('cultivation-room-2-final-vent-sticky-approach') as THREE.Mesh;
    const skin=approach.getObjectByName(`${approach.name}-surface-skin`) as THREE.Mesh|undefined;
    const materials=skin?.material??approach.material;
    assert.ok(Array.isArray(materials),'the submitted approach uses separate wall and cap finishes');
    assert.ok(materials[0]===scene.labArt.nurserySticky,'the vertical approach keeps its shared biofilm');
    assert.ok(materials[1]===scene.labArt.duct,'the threshold cap borrows the vent finish');
    const normal=approach.geometry.getAttribute('normal'),indices=approach.geometry.index;
    for(const group of approach.geometry.groups)
      assert.equal(group.materialIndex,normal.getY(indices?.getX(group.start)??group.start)>.5?1:0,
        'only the horizontal threshold cap loses the biofilm');
    assert.equal(scene.labArt.nurserySticky.emissiveIntensity,scene.labArt.sticky.emissiveIntensity);
    assert.equal(scene.labArt.nurserySticky.emissive.getHex(),scene.labArt.sticky.emissive.getHex());
    for(const root of [scene.roomFour.root,scene.roomTwoToThreeBobAirDuct.root])root.traverse(o=>{
      if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])
        assert.notEqual(material.userData.cultivationBiofilm,true,`out-of-scope adhesive replacement: ${o.name}`);
    });
    const climb = scene.roomFive.root.getObjectByName('room-5-bob-shaft-climb') as THREE.Mesh;
    assert.equal(climb.userData.surfaceTag, 'sticky');
    scene.root.updateMatrixWorld(true);
    const climbBounds = new THREE.Box3().setFromObject(climb).expandByScalar(1e-5);
    let climbSkins = 0;
    scene.roomFive.root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const material of [o.material].flat()) if (material.userData.cultivationBiofilm) {
        assert.equal(material, scene.labArt.nurserySticky);
        assert.ok(climbBounds.containsBox(new THREE.Box3().setFromObject(o)), `${o.name} stays on the required climb`);
        climbSkins++;
      }
    });
    assert.ok(climbSkins > 0);
    const button=scene.roomTwo.root.getObjectByName('cultivation-room-2-wall-button-pad') as THREE.Mesh;
    assert.ok(button.material!==scene.labArt.nurserySticky,'hold button keeps its own material');
    assert.equal(scene.labArt.nurserySticky.transparent,false);
    assert.equal(scene.labArt.nurserySticky.side,THREE.FrontSide);
  }finally{scene.dispose();}
});

test('ceiling presentation leaves the authored entrance vent open and owns instance disposal', () => {
  const root = new THREE.Group();
  const art = new CultivationLabMaterials(cultivationAssets);
  art.addFixtures(root, 36, 20, 50, { ceilingOpening: [-12, -8, 2, 6] });
  const strips = root.getObjectByName('cultivation-neutral-ceiling-strips') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const vent = new THREE.Box3(new THREE.Vector3(-12, 19.5, 2), new THREE.Vector3(-8, 20.5, 6));
  for (let i = 0; i < strips.count; i++) {
    strips.getMatrixAt(i, matrix);
    bounds.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix);
    assert.equal(bounds.intersectsBox(vent), false);
  }
  let disposed = 0;
  strips.geometry.addEventListener('dispose', () => disposed++);
  art.dispose();
  assert.equal(disposed, 1);
  assert.equal(root.children.length, 0);
});
