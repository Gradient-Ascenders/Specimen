import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import * as THREE from 'three';
import {RoomOneShell,parseRoomOneShell,readRoomOneMaps} from '../src/render/environment/containment/RoomOneShell.ts';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';

const bytes = await readFile(new URL('../assets/environments/containment-room-one/room-one-shell.glb',import.meta.url));
const compressed = await readFile(new URL('../assets/environments/containment-room-one/room-one-maps.bin',import.meta.url));
const data = gunzipSync(compressed);
const buffer = data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const maps = readRoomOneMaps(buffer);
const asset = async()=>({root:await parseRoomOneShell(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),maps});

test('Blender Room 1 uses nine material batches, no exported lights or duplicate images, and bounded map storage',async()=>{
  const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.equal(json.images,undefined);assert.equal(json.animations,undefined);assert.equal(json.extensions,undefined);
  const shell = new RoomOneShell();
  try {
    await shell.prepare(asset);
    assert.equal(shell.diagnostics.meshes,9);assert.ok(shell.diagnostics.triangles<10_000);
    assert.equal(shell.diagnostics.textureCount,6);assert.equal(shell.diagnostics.textureBytes,25_165_824);
    assert.ok(compressed.byteLength<1_500_000);
    shell.root.traverse(o=>{
      assert.ok(!(o instanceof THREE.Light||o instanceof THREE.Camera));
      if (!(o instanceof THREE.Mesh)) return;
      assert.equal(o.castShadow,false);
      for (const attribute of Object.values(o.geometry.attributes)) assert.ok((attribute as THREE.BufferAttribute).array.every(Number.isFinite));
      const material=o.material as THREE.MeshStandardMaterial;
      if (material.map) {
        assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);
        assert.equal(material.normalMap!.colorSpace,THREE.NoColorSpace);
        assert.equal(material.roughnessMap!.colorSpace,THREE.NoColorSpace);
        assert.equal(material.map.wrapS,THREE.RepeatWrapping);assert.equal(material.map.generateMipmaps,true);
      }
    });
  } finally {shell.dispose();}
});

test('the new floor stays flush and the authored door, climb and vent corridors stay visually open',async()=>{
  const shell=new RoomOneShell();
  try {
    await shell.prepare(asset);shell.root.updateWorldMatrix(true,true);
    for (const [x,z] of [[-.21,-2.6],[4,-4],[-5,3],[0,-.5]]) {
      const hits=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0),0,3).intersectObject(shell.root,true);
      assert.ok(hits.length>0,`floor absent at ${x},${z}`);assert.ok(Math.abs(hits[0]!.point.y)<1e-6);
    }
    for (const [x,y] of [[-4.8,3],[-4.8,6],[4.3,2]]) {
      assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,1),0,2).intersectObject(shell.root,true),[]);
    }
    const glass=new THREE.Raycaster(new THREE.Vector3(6,3,0),new THREE.Vector3(1,0,0),0,1).intersectObject(shell.root,true)[0];
    assert.equal(glass?.object.name,'R1_Shell_Glass');assert.ok(Math.abs(glass!.point.x-6.785)<1e-5);
    for(const x of [-3,-1,1,3]) {
      const wall=new THREE.Raycaster(new THREE.Vector3(x,3,-5),new THREE.Vector3(0,0,-1),0,2).intersectObject(shell.root,true)[0];
      assert.equal(wall?.object.name,'R1_Shell_Ivory');
      assert.ok(Math.abs(wall!.point.z+5.82)<1e-5,'rear wall must stay flat');
    }
  } finally {shell.dispose();}
});

test('adopting the shell preserves the complete gameplay collision fingerprint and reuses it on room reset',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),shell=scene.teaching.roomOneArt.shell;
  const before=captureContainmentCollisionFingerprint(scene.collisionMeshes);
  try {
    await shell.prepare(asset);const meshes=[...shell.root.children];
    scene.teaching.resetTeachingPresentation();await shell.prepare(()=>{throw new Error('Retry must reuse prepared room art');});
    assert.deepEqual(shell.root.children,meshes);
    assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes),before);
  } finally {scene.dispose();}
});

test('late preparation disposes its result after unload; normal ownership releases maps, materials and geometry once',async()=>{
  const late=await asset(),shell=new RoomOneShell();let release!:(value:typeof late)=>void;
  const pending=shell.prepare(()=>new Promise(resolve=>{release=resolve;}));
  let count=0;late.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>count++);});
  shell.dispose();release(late);await pending;assert.equal(count,9);assert.equal(shell.diagnostics.ready,false);
  const live=new RoomOneShell();await live.prepare(asset);
  const resources=new Set<THREE.Material|THREE.Texture|THREE.BufferGeometry>();
  live.root.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);const m=o.material as THREE.MeshStandardMaterial;resources.add(m);for(const t of [m.map,m.normalMap,m.roughnessMap])if(t)resources.add(t);}});
  let disposed=0;for(const value of resources)value.addEventListener('dispose',()=>disposed++);
  live.dispose();live.dispose();assert.equal(disposed,resources.size);
});

test('malformed map bundles fail before any GPU allocations',()=>{
  assert.throws(()=>readRoomOneMaps(buffer.slice(0,10)),/Truncated/);
  assert.throws(()=>readRoomOneMaps(buffer.slice(0,-1)),/Truncated/);
  const bad=buffer.slice(0);new DataView(bad).setUint32(8,16384,true);
  assert.throws(()=>readRoomOneMaps(bad),/Invalid Room 1 map size/);
});
