import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import * as THREE from 'three';
import {RoomOneShell,parseRoomOneShell,readRoomOneMaps,readRoomOneCompressedMaps,loadRoomOneCompressedShell,ROOM_ONE_SHELL_URL,ROOM_ONE_MAPS_URL,ROOM_ONE_COMPRESSED_MAPS_URL} from '../src/render/environment/containment/RoomOneShell.ts';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {auditRoomOneRearWall} from './helpers/RoomOneRearWallSurfaces.ts';
import {collectOpaqueTriangles,findOpaqueSurfaceOverlaps} from '../src/render/geometry/OpaqueSurfaceAudit.ts';

const bytes = await readFile(new URL('../assets/environments/containment-room-one/room-one-shell.glb',import.meta.url));
const compressed = await readFile(new URL('../assets/environments/containment-room-one/room-one-maps.bin',import.meta.url));
const data = gunzipSync(compressed);
const buffer = data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const maps = readRoomOneMaps(buffer);
const asset = async()=>({root:await parseRoomOneShell(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),maps});

test('native BC7 maps retain every mip, colour space and ownership with a bounded payload',async()=>{
  const packed=await readFile(new URL('../assets/environments/containment-room-one/room-one-maps-bc7.bin',import.meta.url));
  const decoded=gunzipSync(packed),buffer=decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength);
  const compressedMaps=readRoomOneCompressedMaps(buffer),shell=new RoomOneShell();
  assert.equal(compressedMaps.length,6);
  assert.throws(()=>readRoomOneCompressedMaps(buffer.slice(0,-1)),/Invalid/);
  assert.throws(()=>readRoomOneCompressedMaps(buffer.slice(0,10)),/Truncated/);
  const corrupt=buffer.slice(0);new DataView(corrupt).setUint32(56,0,true);
  assert.throws(()=>readRoomOneCompressedMaps(corrupt),/Invalid/);
  let disposed=0;
  try{
    await shell.prepare(async()=>({...await asset(),maps:[],compressedMaps}));
    assert.equal(shell.diagnostics.textureBytes,8_388_768);
    const textures=new Set<THREE.CompressedTexture>();
    shell.root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
      const material=object.material as THREE.MeshStandardMaterial;
      for(const texture of [material.map,material.normalMap,material.roughnessMap])if(texture){
        assert.ok(texture instanceof THREE.CompressedTexture);textures.add(texture);
        assert.equal(texture.format,THREE.RGBA_BPTC_Format);assert.equal(texture.generateMipmaps,false);
        assert.equal(texture.mipmaps.length,Math.log2(texture.image.width)+1);
      }
      if(material.map){assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(material.normalMap!.colorSpace,THREE.NoColorSpace);}
    });
    assert.equal(textures.size,6);for(const texture of textures)texture.addEventListener('dispose',()=>disposed++);
  }finally{shell.dispose();shell.dispose();}
  assert.equal(disposed,6);
});

test('a failed optional BC7 bank falls back to authored RGBA without fetching geometry twice',async()=>{
  const originalFetch=globalThis.fetch,calls:string[]=[],shell=new RoomOneShell();
  globalThis.fetch=async input=>{
    const url=String(input);calls.push(url);
    if(url===ROOM_ONE_SHELL_URL)return new Response(bytes);
    if(url===ROOM_ONE_COMPRESSED_MAPS_URL)return new Response(null,{status:503});
    if(url===ROOM_ONE_MAPS_URL)return new Response(compressed);
    throw new Error(`Unexpected request ${url}`);
  };
  try{
    await shell.prepare(loadRoomOneCompressedShell);
    assert.equal(shell.diagnostics.textureCount,6);assert.equal(shell.diagnostics.textureBytes,25_165_824);
    assert.deepEqual(calls,[ROOM_ONE_SHELL_URL,ROOM_ONE_COMPRESSED_MAPS_URL,ROOM_ONE_MAPS_URL]);
  }finally{globalThis.fetch=originalFetch;shell.dispose();}
});

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
    for(const x of [-6.5,-6.1,-3.55,-1.8,0,2.45,6.15,6.6])for(const y of [1.055,1.11,1.165]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,1),0,1).intersectObject(shell.root,true)[0];
      assert.equal(hit?.object.name,'R1_Shell_Graphite',`Escape-wall divider absent at ${x},${y}`);
      assert.ok(hit.point.z<5.73,'the divider must cover the panel edge with physical clearance');
    }
    for(const x of [-4.8,4.3]){
      assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(x,1.11,5),new THREE.Vector3(0,0,1),0,1).intersectObject(shell.root,true),[]);
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

test('the west corner trim has its own footprint and the floor seals beneath the rear wall bevel',async()=>{
  const shell=new RoomOneShell();
  try {
    await shell.prepare(asset);
    const corner=collectOpaqueTriangles(shell.root).filter(t=>
      t.min[0]<-6.7&&t.max[0]>-6.9&&t.min[2]<5.85&&t.max[2]>5.7&&t.min[1]<7.5&&t.max[1]>1.22);
    for(const tolerance of [.0001,.002]){
      const conflicts:unknown[]=[];
      findOpaqueSurfaceOverlaps(corner,tolerance,(a,b,area,separation,centre)=>{
        if(a.normal.x>.9&&centre.y>1.22&&centre.y<7.5)
          conflicts.push({first:a.owner,second:b.owner,area,separation,centre:centre.toArray()});
      });
      assert.deepEqual(conflicts,[],`West corner overlaps at ${tolerance} m`);
    }
    for(const x of [-6.65,-3,0,3,6.65])for(const z of [-5.805,-5.82,-5.84]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,.1,z),new THREE.Vector3(0,-1,0),0,.2).intersectObject(shell.root,true)[0];
      assert.ok(hit,`Floor-to-wall slit at ${x},${z}`);
      assert.ok(Math.abs(hit.point.y)<1e-6,'the sealed perimeter must stay flush with the walking floor');
    }
    for(const z of [5.715,5.73,5.74])for(const y of [1.3,4,7]){
      assert.ok(new THREE.Raycaster(new THREE.Vector3(-6.5,y,z),new THREE.Vector3(-1,0,0),0,.4).intersectObject(shell.root,true).length,
        `Corner reveal must remain backed at ${y},${z}`);
    }
  } finally {shell.dispose();}
});

test('rear wall panels, metal returns and instruments have no competing opaque faces or holes',async()=>{
  const shell=new RoomOneShell();
  try {
    await shell.prepare(asset);
    for(const tolerance of [.0001,.002]){
      assert.deepEqual(auditRoomOneRearWall(shell.root,tolerance).conflicts,[],
        `Rear wall conflicts at ${tolerance} m; inspect same-batch bevels as well as separate meshes.`);
    }
    // The deliberate reveals have a sealed backing, including the new panel
    // endpoints and the cover split around the diagnostic display.
    for(const side of [-1,1])for(const x of [3.69,3.71,3.73,3.78,3.83,3.84,3.86])for(const y of [1.4,3.8,7.5]){
      const hits=new THREE.Raycaster(new THREE.Vector3(side*x,y,-5),new THREE.Vector3(0,0,-1),0,2).intersectObject(shell.root,true);
      assert.ok(hits.length>0,`Unsealed rear wall at ${side*x},${y}`);
    }
    for(const y of [3.9,4.25,4.27,4.3,4.8,5.03,5.05,5.07,5.2]){
      assert.ok(new THREE.Raycaster(new THREE.Vector3(.1,y,-5),new THREE.Vector3(0,0,-1),0,2).intersectObject(shell.root,true).length>0);
    }
    // A distant bulkhead hit still leaves the visible panel/plinth seam open.
    // Require coverage directly behind the finishes, across the centre and wings.
    for(const x of [-6.6,-5,-3.5,-2,0,2,3.5,5,6.6])for(const y of [1.065,1.075,1.085,1.095,1.10,1.11,1.125]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,y,-5),new THREE.Vector3(0,0,-1),0,1).intersectObject(shell.root,true)[0];
      assert.ok(hit&&hit.point.z> -5.85,`Open rear panel/plinth seam at ${x},${y}: ${hit?.point.z}`);
    }
  } finally {shell.dispose();}
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
