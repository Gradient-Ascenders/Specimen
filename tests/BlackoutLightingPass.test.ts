import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createAscentArtFixture} from '../scripts/lib/blackout-ascent-art-states.ts';
import {BlackoutLightingPass} from '../src/render/environment/blackout/BlackoutLightingPass.ts';
import {BlackoutRadiance,readBlackoutRadiance} from '../src/render/environment/blackout/BlackoutRadiance.ts';
import {BLACKOUT_RADIANCE_LAYOUT as ZONES,BLACKOUT_ATLAS_WIDTH as WIDTH,BLACKOUT_ATLAS_HEIGHT as HEIGHT,
  BLACKOUT_ZONE_DEPTH as STATE_DEPTH,blackoutLightingZone} from '../src/render/environment/blackout/BlackoutLightingLayout.ts';
import {GRAPHICS_PROFILES} from '../src/render/GraphicsProfiles.ts';
import {BlackoutLightLayout} from '../src/render/environment/blackout/BlackoutLightLayout.ts';

const raw=gunzipSync(readFileSync(new URL('../assets/environments/blackout-lighting/radiance.bin',import.meta.url)));
const buffer=()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const state={position:new THREE.Vector3(0,1,20),participants:[] as THREE.Vector3[],running:true,cinematic:false};

test('offline lighting has finite, validity-weighted emergency/powered states with a bounded payload',()=>{
  const bank=readBlackoutRadiance(buffer());assert.equal(bank.probes,1458);
  assert.ok(bank.invalidProbes>0&&bank.invalidProbes<bank.probes*.3);
  assert.ok(readFileSync(new URL('../assets/environments/blackout-lighting/radiance.bin',import.meta.url)).length<180000);
  let offset=0;
  for(const zone of ZONES){
    const energy=[0,0];
    for(let s=0;s<2;s++)for(let z=0;z<zone.grid[2];z++)for(let y=0;y<zone.grid[1];y++)for(let x=0;x<zone.grid[0];x++){
      const i=(((s*STATE_DEPTH+offset+1+z)*HEIGHT+y)*WIDTH+x)*4;
      const validity=THREE.DataUtils.fromHalfFloat(bank.irradiance[i+3]!);assert.ok(validity>=0&&validity<=1);
      for(let c=0;c<3;c++)energy[s]!+=THREE.DataUtils.fromHalfFloat(bank.irradiance[i+c]!);
    }
    if(zone.circuit>=0)assert.ok(energy[0]!>energy[1]!*1.1,`${zone.name}: restored power adds local bounce`);
    else assert.equal(energy[0],energy[1],`${zone.name}: nearby puzzle circuits cannot brighten the permanent emergency state`);
    offset+=zone.grid[2]+2;
  }
  assert.equal(blackoutLightingZone({x:6,y:1,z:65}),1);assert.equal(blackoutLightingZone({x:-16,y:1,z:65}),2);
  assert.equal(blackoutLightingZone({x:10,y:8,z:142.5}),6);
  assert.throws(()=>readBlackoutRadiance(buffer().slice(0,-1)),/Truncated/);
  const corrupt=buffer();new Uint8Array(corrupt)[0]=0;assert.throws(()=>readBlackoutRadiance(corrupt),/Invalid/);
});

test('real powered banks keep independent visual state, unchanged colliders and no extra light sources',async()=>{
  const f=createAscentArtFixture();let lighting:BlackoutLightingPass|undefined;
  try{
    await f.prepare();f.controller.setActive(true);
    const snapshot=f.controller.capture() as any;snapshot.lights=snapshot.lights.map((_:unknown,i:number)=>({charge:i===1?1:0,latched:i===1}));f.controller.restore(snapshot);
    const before=JSON.stringify(f.controller.capture()),colliders=f.scene.collisionMeshes.map(mesh=>({mesh,geometry:mesh.geometry,matrix:mesh.matrixWorld.clone()}));
    const lights:THREE.Light[]=[];f.scene.root.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});
    lighting=new BlackoutLightingPass(f.scene,f.controller);lighting.update(0,state);
    assert.deepEqual(lighting.diagnostics.powers.slice(3,7),[0,1,0,0]);
    assert.equal(JSON.stringify(f.controller.capture()),before);
    const after:THREE.Light[]=[];f.scene.root.traverse(o=>{if(o instanceof THREE.Light)after.push(o);});assert.deepEqual(after,lights);
    assert.equal(f.controller.lightBanks.filter(l=>l.castShadow).length,2);
    assert.ok(f.controller.lightBanks.every(l=>l instanceof THREE.SpotLight));
    for(const s of colliders){assert.equal(s.mesh.geometry,s.geometry);assert.ok(s.mesh.matrixWorld.equals(s.matrix));}
    // Pausing freezes presentation fades; reset/checkpoint reseeds the exact state.
    snapshot.lights=snapshot.lights.map(()=>({charge:0,latched:false}));f.controller.restore(snapshot);
    lighting.update(.1,{...state,running:false});assert.equal(lighting.diagnostics.powers[4],1);
    lighting.reset();lighting.update(0,state);assert.deepEqual(lighting.diagnostics.powers.slice(3,7),[0,0,0,0]);
    f.lift.present(20,1,0,.7,20);lighting.update(0,state);assert.equal(lighting.diagnostics.powers[8],.7);assert.equal(lighting.diagnostics.powers[9],0);
    f.lift.present(69.6,1,1,1,48);lighting.update(0,state);assert.equal(lighting.diagnostics.powers[9],1);
    const ambience=f.scene.root.getObjectByName('blackout-emergency-ambience') as THREE.HemisphereLight;
    const intensity=ambience.intensity;lighting.update(.1,{...state,position:new THREE.Vector3(0,1,187),cinematic:true});assert.equal(ambience.intensity,intensity,'the cinematic retains ambient ownership');
  }finally{lighting?.dispose();f.dispose();}
});

test('quality changes preserve two bounded maps; unpowered cached maps idle and shafts release once',async()=>{
  const f=createAscentArtFixture();let lighting:BlackoutLightingPass|undefined;
  try{
    await f.prepare();f.controller.reset();lighting=new BlackoutLightingPass(f.scene,f.controller);
    const banks=f.controller.lightBanks.filter(l=>l.castShadow);
    for(const light of banks){light.shadow.map=new THREE.WebGLRenderTarget(1,1);light.shadow.needsUpdate=true;}
    lighting.setQuality(GRAPHICS_PROFILES.standard.settings,THREE.PCFShadowMap);lighting.update(0,state);
    for(const light of banks){assert.equal(light.shadow.radius,1.5);assert.equal(light.shadow.autoUpdate,false);assert.equal(light.shadow.needsUpdate,false);}
    lighting.setQuality(GRAPHICS_PROFILES.high.settings,THREE.BasicShadowMap);
    assert.ok(banks.every(l=>l.shadow.radius===-l.distance));
    lighting.setQuality(GRAPHICS_PROFILES.minimum.settings,THREE.PCFShadowMap);
    assert.ok(banks.every(l=>l.shadow.radius===1.5));
    let released=0,shafts=0;f.scene.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.lightingOnly){shafts++;o.geometry.addEventListener('dispose',()=>released++);(o.material as THREE.Material).addEventListener('dispose',()=>released++);}});
    assert.equal(shafts,3);lighting.dispose();lighting.dispose();assert.equal(released,shafts*2);
  }finally{lighting?.dispose();f.dispose();}
});

test('cancelled preparation does not allocate late lighting resources',async()=>{
  const radiance=new BlackoutRadiance();let complete!:(value:ReturnType<typeof readBlackoutRadiance>)=>void;
  const pending=radiance.prepare({} as THREE.WebGLRenderer,[],()=>new Promise(resolve=>{complete=resolve;}));
  radiance.dispose();complete(readBlackoutRadiance(buffer()));await pending;
  assert.equal(radiance.diagnostics.ready,false);assert.equal(radiance.diagnostics.materials,0);radiance.dispose();
});

test('bounded draws retain one shader signature through power, view and form changes, and restore authored sources on failure',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
  const lights:(THREE.PointLight|THREE.SpotLight)[]=[];
  for(let i=0;i<12;i++){
    const point=new THREE.PointLight(0xffd89a,20,20);point.position.set(i%3-1,1,-i);point.name='point-'+i;root.add(point);lights.push(point);
    const spot=new THREE.SpotLight(0xbbe1eb,30,30,.9,.5);spot.position.set(i%3-1,5,-i);spot.target.position.set(0,0,-i);spot.castShadow=i<6;
    spot.name='spot-'+i;root.add(spot,spot.target);lights.push(spot);
  }
  const snapshot=lights.map(light=>({light,intensity:light.intensity,color:light.color.clone(),parent:light.parent,mask:light.layers.mask}));
  const camera=new THREE.PerspectiveCamera(65,16/9,.05,100);camera.position.set(0,2,4);camera.lookAt(0,1,-6);
  const layout=new BlackoutLightLayout(scene);
  try{
    const counts=()=>{let points=0,shadowed=0,spots=0;scene.traverseVisible(o=>{
      if(!o.layers.test(camera.layers))return;
      if(o instanceof THREE.PointLight)points++;
      if(o instanceof THREE.SpotLight){spots++;if(o.castShadow)shadowed++;}
    });return [points,spots,shadowed];};
    for(const power of [1,0,1]){
      for(const s of snapshot)s.light.intensity=s.intensity*power;
      layout.sync(camera,{x:0,y:1,z:0});assert.deepEqual(counts(),[4,5,2]);
      if(power===0)assert.equal(layout.diagnostics.selected.length,0);
      layout.restore();assert.ok(lights.every(l=>l.layers.mask===1));
    }
    layout.sync(camera,{x:1000,y:1,z:0});assert.ok(layout.diagnostics.selected.length>0,'remote active bodies cannot extinguish visible cinematic fixtures');layout.restore();
    camera.lookAt(0,1,30);layout.sync(camera,{x:0,y:1,z:0});assert.deepEqual(counts(),[4,5,2]);layout.restore();
    assert.throws(()=>layout.withLayout(camera,{x:0,y:1,z:0},()=>{throw Error('draw failed');}),/draw failed/);
    for(const s of snapshot){assert.equal(s.light.intensity,s.intensity);assert.ok(s.light.color.equals(s.color));assert.equal(s.light.parent,s.parent);assert.equal(s.light.layers.mask,s.mask);}
    const original=lights.find(l=>l instanceof THREE.SpotLight&&l.castShadow) as THREE.SpotLight;
    let releases=0;original.shadow.map=new THREE.WebGLRenderTarget(1,1);original.shadow.map.addEventListener('dispose',()=>releases++);
    layout.dispose();layout.dispose();assert.equal(releases,0,'source maps remain owned by the level');original.shadow.map.dispose();
  }finally{layout.dispose();}
});
