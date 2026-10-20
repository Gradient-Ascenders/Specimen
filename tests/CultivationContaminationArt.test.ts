import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';

test('Room 2 upper duct keeps its frame and ceiling fixtures but has no floating guide bars',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),duct=scene.roomTwoToThreeBobAirDuct;
  try{
    assert.equal(scene.root.getObjectByName('cultivation-room-2-cultivation-vent-guide-batch'),undefined);
    for(let i=1;i<=3;i++)assert.ok(duct.root.getObjectByName(`${duct.root.name}-ceiling-light-${i}`));
    assert.ok(scene.root.getObjectByName('cultivation-room-2-bob-vent-west-jamb'));
    scene.root.updateMatrixWorld(true);
    for(const dx of [-.7,0,.7]){
      const ray=new THREE.Raycaster(new THREE.Vector3(72+dx,20.2,122.4),new THREE.Vector3(0,0,1),0,.6);
      const visible=ray.intersectObject(scene.root,true).filter(hit=>{
        const mesh=hit.object as THREE.Mesh;
        const material=Array.isArray(mesh.material)?mesh.material[hit.face!.materialIndex]:mesh.material;
        return material.visible;
      });
      assert.equal(visible.length,0,'No decorative geometry crosses the former guide positions.');
    }
  }finally{scene.dispose();}
});

test('dressing releases original geometry without disposing borrowed replacements or proxies', () => {
  const lab = new CultivationLabMaterials(cultivationAssets), art = new CultivationContaminationArt(lab);
  const root = new THREE.Group(), warning = new THREE.MeshStandardMaterial();
  art.addRoom(root, 1, warning);
  const mesh = art.roots[0].children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
  const original = mesh.geometry, replacement = original.clone(), proxyGeometry = new THREE.BoxGeometry();
  let originals = 0, replacements = 0, proxies = 0;
  original.addEventListener('dispose', () => originals++);
  replacement.addEventListener('dispose', () => replacements++);
  proxyGeometry.addEventListener('dispose', () => proxies++);
  mesh.geometry = replacement;
  mesh.add(new THREE.Mesh(proxyGeometry, warning));
  try {
    art.dispose(); art.dispose();
    assert.equal(originals, 1, 'release the original even while a replacement is installed');
    assert.equal(replacements, 0, 'replacement belongs to the cleanup pass');
    assert.equal(proxies, 0, 'attached proxy belongs to the cleanup pass');
  } finally {
    art.dispose(); replacement.dispose(); proxyGeometry.dispose(); warning.dispose(); lab.dispose();
  }
});

test('contamination survives retries without duplication and disposes owned resources exactly once', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const art = scene.contaminationArt;
  const owned = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>([
    ...art.textures, ...Object.values(art.finishes), art.glass,
  ]);
  const objects: THREE.Object3D[] = [];
  for (const root of art.roots) root.traverse(object => {
    objects.push(object);
    if (object instanceof THREE.Mesh) {
      owned.add(object.geometry);
      if (!Array.isArray(object.material) && object.material !== scene.chamberArt.warning) owned.add(object.material);
    }
  });
  const colliders = [...scene.collisionMeshes];
  const metadata = colliders.map(mesh => structuredClone(mesh.userData));
  const materialsOutsideScope: THREE.Material[] = [];
  for (const room of [scene.roomFour, scene.roomFive]) room.root.traverse(object => {
    if (object instanceof THREE.Mesh) materialsOutsideScope.push(...(Array.isArray(object.material) ? object.material : [object.material]));
  });
  assert.equal(materialsOutsideScope.some(material => Object.values(art.finishes).includes(material as THREE.MeshStandardMaterial)), false);
  const disposals = new Map<unknown, number>();
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  let borrowedReliefDisposals = 0;
  scene.labArt.wall.bumpMap!.addEventListener('dispose', () => borrowedReliefDisposals++);
  scene.reset(); scene.reset();
  assert.deepEqual(scene.collisionMeshes, colliders);
  assert.deepEqual(colliders.map(mesh => mesh.userData), metadata);
  const after: THREE.Object3D[] = [];
  for (const root of art.roots) root.traverse(object => after.push(object));
  assert.deepEqual(after, objects);
  assert.equal(disposals.size, 0);
  art.dispose(); art.dispose();
  assert.equal(borrowedReliefDisposals, 0, 'dressing must not release the lab owner maps');
  scene.dispose();
  for (const resource of owned) assert.equal(disposals.get(resource), 1, `${resource.type} disposed once`);
  assert.equal(borrowedReliefDisposals, 1);
});
