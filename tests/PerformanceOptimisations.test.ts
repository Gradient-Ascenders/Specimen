import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {prepareTogether} from '../src/render/PreparationTasks.ts';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {CinematicCompileCache} from '../src/render/CinematicCompileCache.ts';
import {createDepthPrewarmGroup} from '../src/render/ShadowPrewarmMaterial.ts';
import {parseSpecimenAsset,validateSpecimenAsset,disposeSpecimenAsset} from '../src/render/specimen/SpecimenAsset.ts';
import {CharacterDetail,readCharacterDetail} from '../src/render/slime/CharacterDetail.ts';
import {AudioManager} from '../src/audio/AudioManager.ts';
import {BossDefeatEffects} from '../src/cinematics/BossDefeatEffects.ts';
import {ContainmentMonitor} from '../src/render/environment/containment/ContainmentMonitor.ts';
import {ContainmentMonitorDialogue} from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import {SpecimenCharacterPresentation} from '../src/render/specimen/SpecimenCharacterPresentation.ts';
import {loadSpecimen} from './fixtures/SpecimenAssetFixture.ts';

test('independent loading joins all owners before failure can trigger unload',async()=>{
  let finish!:()=>void,settled=false;
  const slow=new Promise<void>(resolve=>{finish=resolve;});
  const joined=prepareTogether([Promise.reject(Error('failed asset')),slow]);
  const rejection=assert.rejects(joined,/failed asset/).then(()=>{settled=true;});
  await Promise.resolve();await Promise.resolve();assert.equal(settled,false);
  finish();await rejection;assert.equal(settled,true);
});

test('Containment overlaps independent rooms and waits for the shared emitter',async()=>{
  const started:string[]=[],resolvers=new Map<string,()=>void>();
  const task=(name:string)=>()=>{started.push(name);return new Promise<void>(resolve=>resolvers.set(name,resolve));};
  const fixture={disposed:false,teaching:{ventArt:{prepare:async()=>{}},roomOneArt:{prepare:async()=>{},shell:{borrowFinish:()=>new THREE.Material()}},roomTwoArt:{prepare:task('two')}},
    surveillanceCameras:{prepare:task('cameras')},roomThree:{prepareArt:task('three'),art:{shell:{borrowLaserEmitter:()=>({})}}},
    roomFour:{prepareArt:task('four')},roomFive:{prepareArt:task('five')},root:new THREE.Group(),
    lightingArt:{prepare:()=>{},movingOwners:[]},lighting:{trackShadowOwner:()=>{}}};
  const ready=ContainmentLevelScene.prototype.prepareEnvironmentArt.call(fixture as unknown as ContainmentLevelScene);
  await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(started,['two','cameras','three']);
  resolvers.get('two')!();resolvers.get('cameras')!();await Promise.resolve();assert.equal(started.length,3);
  resolvers.get('three')!();for(let i=0;i<5;i++)await Promise.resolve();
  assert.deepEqual(started,['two','cameras','three','four','five']);
  resolvers.get('four')!();resolvers.get('five')!();await ready;
});

test('depth submission reuse retains geometry/custom-shadow distinctions',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  const a=new THREE.Mesh(geometry,material);a.castShadow=true;root.add(a);
  const seen=new Set<string>(),first=createDepthPrewarmGroup(root,seen),second=createDepthPrewarmGroup(root,seen);
  assert.equal(first.group.children.length,1);assert.equal(second.group.children.length,0);
  a.customDepthMaterial=new THREE.MeshDepthMaterial();
  const custom=createDepthPrewarmGroup(root,seen);assert.equal(custom.group.children.length,1);
  first.dispose();second.dispose();custom.dispose();a.customDepthMaterial.dispose();geometry.dispose();material.dispose();
});

test('cinematic compilation reuses unchanged objects but invalidates features and light layouts',async()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);let calls=0;
  const renderer={outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,shadowMap:{enabled:true,type:THREE.PCFShadowMap},
    clippingPlanes:[],localClippingEnabled:false,compileAsync:async()=>{calls++;}} as unknown as THREE.WebGLRenderer;
  const cache=new CinematicCompileCache();await cache.compile(renderer,scene,camera);
  mesh.position.x=10;await cache.compile(renderer,scene,camera);assert.equal(calls,1);
  material.transparent=true;await cache.compile(renderer,scene,camera);assert.equal(calls,2);
  scene.add(new THREE.SpotLight());await cache.compile(renderer,scene,camera);assert.equal(calls,3);
  mesh.receiveShadow=true;await cache.compile(renderer,scene,camera);assert.equal(calls,4);
  geometry.dispose();material.dispose();
});

test('delivery models decompress to the exact authored bytes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../src/assets/delivery/manifest.json',import.meta.url),'utf8'));
  for(const item of manifest){
    const packed=await readFile(new URL('../src/assets/delivery/'+item.output,import.meta.url));
    const original=await readFile(new URL('../assets/'+item.source,import.meta.url));
    assert.ok(packed.length<original.length);assert.deepEqual(gunzipSync(packed),original);
  }
});

test('hidden monitors keep dialogue time and paint the latest page when visible again',()=>{
  const material=new THREE.MeshStandardMaterial(),dialogue=new ContainmentMonitorDialogue(['Testing a hidden screen']);
  const monitor=new ContainmentMonitor({materials:{graphite:material,serviceMetal:material}},
    {roomId:1,position:{x:0,y:0,z:0},yaw:0,dialogue});
  const version=monitor.texture.version;
  monitor.setPresentationActive(false);monitor.update(10);
  assert.equal(dialogue.readModel.complete,true);assert.equal(monitor.texture.version,version);
  monitor.setPresentationActive(true);monitor.update(0);
  assert.equal(monitor.texture.version,version+1);
  monitor.update(1);assert.equal(monitor.texture.version,version+1);
  monitor.dispose();material.dispose();
});

test('atrium scope retains lower floors for a trailing camera and restores them after a draw',()=>{
  const root=new THREE.Group();
  const fixture={lighting:{activeRoomId:5},lowerFloorOccludedBranches:[{root,visible:true}],completedRoomOneBranches:[]};
  const draw=(cameraY:number)=>ContainmentLevelScene.prototype.withEnclosedRoomOcclusion.call(fixture as unknown as ContainmentLevelScene,
    {x:0,y:76,z:102},{x:0,y:cameraY,z:102},()=>root.visible);
  assert.equal(draw(74),true);assert.equal(draw(76),false);assert.equal(root.visible,true);
});

test('optional Specimen detail failure and disposal during loading safely retain or release the model',async()=>{
  const character=new SpecimenCharacterPresentation();
  await character.prepare(loadSpecimen,async()=>{throw Error('optional detail unavailable');});
  assert.equal(character.ready,true);assert.equal(character.detailDiagnostics,undefined);character.dispose();
  const root=await loadSpecimen(),meshes:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  let released=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>released++);
  let finish!:(value:never[])=>void;
  const disposed=new SpecimenCharacterPresentation();
  const ready=disposed.prepare(async()=>root,()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();disposed.dispose();finish([]);await ready;
  assert.equal(disposed.ready,false);assert.equal(released,6);assert.equal(root.children.length,0);
});

test('Specimen detail preserves morph streams and switches without replacement buffers',async()=>{
  const bytes=gunzipSync(await readFile(new URL('../src/assets/delivery/specimen.bin',import.meta.url)));
  const asset=validateSpecimenAsset(await parseSpecimenAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
  const lod=await readFile(new URL('../src/assets/characters/specimen-lod.bin',import.meta.url));
  const positions=asset.meshes.map(m=>m.geometry.attributes.position),morphs=asset.meshes.map(m=>m.geometry.morphAttributes);
  const detail=new CharacterDetail(asset.root,asset.meshes,readCharacterDetail(lod.buffer.slice(lod.byteOffset,lod.byteOffset+lod.byteLength)));
  const indices=asset.meshes.map(m=>m.geometry.index),camera=new THREE.PerspectiveCamera(60,16/9,.1,1000);
  camera.position.z=100;camera.updateMatrixWorld();detail.update(camera);assert.equal(detail.diagnostics.level,'distant');assert.ok(detail.diagnostics.triangles<21000);
  camera.position.z=1;camera.updateMatrixWorld();detail.update(camera);assert.equal(detail.diagnostics.level,'full');assert.equal(detail.diagnostics.triangles,81040);
  asset.meshes.forEach((m,i)=>{assert.equal(m.geometry.index,indices[i]);assert.equal(m.geometry.attributes.position,positions[i]);assert.equal(m.geometry.morphAttributes,morphs[i]);});
  detail.dispose();disposeSpecimenAsset(asset.root);
});

test('audio aliases share one download/decode while retaining separate sound IDs',async t=>{
  let fetches=0,decodes=0;
  t.mock.method(globalThis,'fetch',async()=>{fetches++;return new Response(new Uint8Array([1,2]));});
  const param=()=>({value:0,setTargetAtTime:()=>{}}),node=()=>({gain:param(),connect:()=>{},disconnect:()=>{}});
  const context={state:'suspended',destination:{},currentTime:0,createGain:node,
    createDynamicsCompressor:()=>({...node(),threshold:param(),ratio:param()}),suspend:async()=>{},close:async()=>{},
    decodeAudioData:async()=>{decodes++;return {duration:1};}} as unknown as AudioContext;
  const audio=new AudioManager('./',()=>context);
  await audio.preload(['boss-beam-sustain-loop-01','ending-beam-collision-loop-01']);
  assert.equal(fetches,1);assert.equal(decodes,1);assert.equal(audio.diagnostics.loaded,2);audio.dispose();
});

test('ending density preserves beams and reduces cosmetics; uploads cover only active instances',()=>{
  const effects=new BossDefeatEffects(),a=new THREE.Vector3(),b=new THREE.Vector3(0,0,20);
  effects.present(18,a,b,a);const full=effects.diagnostics;
  effects.setDensity(.5);effects.present(18,a,b,a);const low=effects.diagnostics;
  assert.equal(low.beamsLaunched,full.beamsLaunched);assert.equal(low.directHits,full.directHits);assert.ok(low.sparks<full.sparks);
  assert.deepEqual(effects.sparks.instanceMatrix.updateRanges,[{start:0,count:effects.sparks.count*16}]);
  effects.dispose();
});
