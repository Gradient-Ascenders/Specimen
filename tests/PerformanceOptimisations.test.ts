import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {prepareTogether} from '../src/render/PreparationTasks.ts';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {CinematicCompileCache} from '../src/render/CinematicCompileCache.ts';
import {createDepthPrewarmGroup} from '../src/render/ShadowPrewarmMaterial.ts';
import {HiddenMaterialCulling} from '../src/render/HiddenMaterialCulling.ts';
import {AuthoredShadowCulling} from '../src/render/AuthoredShadowCulling.ts';
import {CultivationRoomFiveCulling} from '../src/render/environment/cultivation/CultivationRoomFiveCulling.ts';
import {CollisionHit, CollisionWorld} from '../src/physics/CollisionWorld.ts';
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

test('hidden collider culling preserves child art, collision, material reveals and layer ownership after errors',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(2,2,2);
  const hidden=new THREE.MeshBasicMaterial({visible:false}),visible=new THREE.MeshBasicMaterial();
  const collider=new THREE.Mesh(geometry,hidden),child=new THREE.Mesh(geometry,visible);
  const mixed=new THREE.Mesh(geometry,[hidden,visible]),allHidden=new THREE.Mesh(geometry,[hidden,hidden]);
  scene.add(collider,mixed,allHidden);collider.add(child);collider.layers.enable(3);
  const scope=new HiddenMaterialCulling(scene),world=new CollisionWorld(),hit=new CollisionHit();
  world.register(collider);
  const collision=()=>{
    assert.equal(world.raycast(new THREE.Vector3(0,0,4),new THREE.Vector3(0,0,-1),8,hit),true);
    assert.equal(hit.object,collider);
  };
  try {
    collision();
    assert.throws(()=>scope.render(()=>{
      assert.equal(collider.layers.mask,0);assert.equal(allHidden.layers.mask,0);
      assert.equal(collider.visible,true);assert.equal(child.layers.mask,1);assert.equal(mixed.layers.mask,1);
      collision();throw Error('draw failed');
    }),/draw failed/);
    assert.equal(collider.layers.mask,9);assert.equal(allHidden.layers.mask,1);collision();
    // Live material/layer changes between frames must not be overwritten by
    // the snapshot taken when the authored assets finished loading.
    collider.layers.set(4);hidden.visible=true;
    scope.render(()=>{assert.equal(collider.layers.mask,16);assert.equal(allHidden.layers.mask,1);});
    hidden.visible=false;collider.material=visible;
    scope.render(()=>{assert.equal(collider.layers.mask,16);assert.equal(allHidden.layers.mask,0);});
    collider.material=hidden;
    scope.render(()=>assert.equal(collider.layers.mask,0));
    assert.equal(collider.layers.mask,16);collision();
  } finally {world.clear();geometry.dispose();hidden.dispose();visible.dispose();}
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

test('authored shadow boxes reject empty cube faces and restore shared draw ranges after errors',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(6,.2,6),material=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.blenderBatch=true;mesh.position.y=-2;root.add(mesh);root.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(90,1,.2,12);camera.up.set(0,0,1);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
  geometry.computeBoundingSphere();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(mesh),true,'the default sphere admits this empty shadow submission');
  const before=mesh.onBeforeShadow,after=mesh.onAfterShadow,scope=new AuthoredShadowCulling(root);
  const args=[{} as THREE.WebGLRenderer,mesh,camera,camera,geometry,material,null] as const;
  geometry.setDrawRange(3,9);
  try{
    scope.render(()=>{mesh.onBeforeShadow(...args);assert.equal(geometry.drawRange.count,0);mesh.onAfterShadow(...args);assert.equal(geometry.drawRange.count,9);});
    assert.throws(()=>scope.render(()=>{mesh.onBeforeShadow(...args);throw Error('driver');}),/driver/);
    assert.deepEqual(geometry.drawRange,{start:3,count:9});
    mesh.position.y=2;root.updateMatrixWorld(true);
    scope.render(()=>{mesh.onBeforeShadow(...args);assert.equal(geometry.drawRange.count,9);mesh.onAfterShadow(...args);});
    assert.equal(scope.diagnostics.culled,0,'moving owners invalidate cached bounds');
    scope.dispose();assert.equal(mesh.onBeforeShadow,before);assert.equal(mesh.onAfterShadow,after);
  }finally{scope.dispose();geometry.dispose();material.dispose();}
});

test('cinematic sector culling preserves borrowed craft and portal scenery',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(2,2,2);
  const chamber=new THREE.Mesh(geometry,material),sewer=chamber.clone(),portal=chamber.clone();
  chamber.position.set(0,10,35);sewer.position.set(40,-6,35);portal.position.set(25,0,10);
  for(const mesh of [chamber,sewer,portal]){mesh.userData.blenderBatch=true;mesh.updateMatrix();mesh.matrixAutoUpdate=false;root.add(mesh);}
  const craft=new THREE.Group();root.add(craft);const culling=new CultivationRoomFiveCulling(root);culling.registerChamber(craft);
  const camera=new THREE.PerspectiveCamera();camera.position.set(40,-6,35);camera.updateMatrixWorld(true);
  culling.prepare(camera,{x:0,y:10,z:35},'cinematic');
  assert.equal(chamber.visible,false);assert.equal(craft.visible,true);assert.equal(portal.visible,true);culling.restore();
  assert.equal(chamber.visible,true);
  culling.prepare(camera,camera.position);assert.equal(craft.visible,false);culling.restore();assert.equal(craft.visible,true);
  geometry.dispose();material.dispose();
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
  const hidden=new THREE.Mesh(geometry,material),owner=new THREE.Group();owner.visible=false;owner.add(hidden);scene.add(owner);
  await cache.compile(renderer,scene,camera);assert.equal(calls,4,'hidden shots do not compile unrelated actors');
  owner.visible=true;await cache.compile(renderer,scene,camera);assert.equal(calls,5,'a newly visible actor still gets prepared');
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
