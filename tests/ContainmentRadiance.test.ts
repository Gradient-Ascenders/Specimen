import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import * as THREE from 'three';
import {readContainmentRadiance} from '../src/render/environment/containment/ContainmentRadiance.ts';
import {CONTAINMENT_PROBE_LAYOUT,CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT} from '../src/render/environment/containment/ContainmentProbeLayout.ts';
import {installContainmentRadianceShader} from '../src/render/environment/containment/ContainmentRadianceShader.ts';
import {CONTAINMENT_PCSS_SOURCES,setContainmentSoftShadowQuality,installContainmentSoftShadows} from '../src/render/environment/containment/ContainmentSoftShadows.ts';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {createPrewarmResourceBatches} from '../src/render/IsolatedResourcePrewarm.ts';

const packed=await readFile(new URL('../assets/environments/containment-lighting/radiance.bin',import.meta.url));
const bytes=gunzipSync(packed);
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('offline bank contains spatial directional bounce and distinct room captures within its budget',()=>{
  const bank=readContainmentRadiance(buffer);
  assert.equal(bank.probes,2251);assert.ok(packed.byteLength<400_000);
  assert.equal(bank.captures.length,5);
  assert.equal(new Set(bank.captures.map(p=>Buffer.from(p).toString('base64'))).size,5);
  assert.ok(bank.captures.every(p=>p.some((n,i)=>i%4===3&&n>0)));
  let offset=0;
  for(const layout of CONTAINMENT_PROBE_LAYOUT){
    const stride=CONTAINMENT_PROBE_ATLAS_WIDTH*CONTAINMENT_PROBE_ATLAS_HEIGHT*4;
    const band=(layout.grid[2]+2)*stride;
    const l0=bank.irradiance.subarray(offset+stride,offset+band-stride);
    assert.ok(l0.some((n,i)=>i%4!==3&&THREE.DataUtils.fromHalfFloat(n)>.001),`Room ${layout.room} receives actual bounced light.`);
    assert.ok(bank.irradiance.subarray(offset+band,offset+band*4).some((n,i)=>i%4!==3&&(n&0x8000)!==0),`Room ${layout.room} retains signed directional coefficients.`);
    assert.deepEqual(bank.irradiance.subarray(offset,offset+stride),bank.irradiance.subarray(offset+stride,offset+stride*2),'SH band borders duplicate the edge slice.');
    offset+=band*4;
  }
  assert.throws(()=>readContainmentRadiance(buffer.slice(0,-4)),/Truncated/);
  const wrong=buffer.slice(0);new Uint8Array(wrong)[0]=0;
  assert.throws(()=>readContainmentRadiance(wrong),/Invalid/);
});

test('radiance and PCSS compose with existing visible shader hooks without altering shadow/deformation programs',()=>{
  const material=new THREE.MeshStandardMaterial(),volume=new THREE.Data3DTexture();
  material.onBeforeCompile=shader=>{shader.vertexShader+='\n// authored deformation retained';shader.uniforms.existing={value:7};};
  material.customProgramCacheKey=()=>'authored-deformation';
  installContainmentRadianceShader(material,{cIrradiance:{value:volume},cDirectionalIrradiance:{value:1},cIndirectStrength:{value:1}},256);
  installContainmentSoftShadows(material);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader as never,{} as THREE.WebGLRenderer);
  assert.equal((shader.uniforms as any).existing.value,7);
  assert.ok(shader.vertexShader.includes('authored deformation retained'));
  assert.ok(shader.fragmentShader.includes('containmentRoomRadiance'));
  assert.ok(shader.fragmentShader.includes('cShadowLinearDepth'));
  assert.ok(shader.fragmentShader.includes('SHADOWMAP_TYPE_PCF'),'Medium/Low retain the native comparison sampler path.');
  assert.ok(material.customProgramCacheKey().startsWith('authored-deformation:'));
  material.dispose();volume.dispose();
});

test('soft shadows are limited to five hero sources and shaft quality adds no lights or shadow maps',()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    const before:THREE.Light[]=[];scene.root.traverse(o=>{if(o instanceof THREE.Light)before.push(o);});
    setContainmentSoftShadowQuality(scene.lighting.root,true);
    const selected=before.filter((o):o is THREE.SpotLight=>o instanceof THREE.SpotLight&&o.shadow.radius<0);
    assert.equal(selected.length,5);
    for(const light of selected){assert.ok(CONTAINMENT_PCSS_SOURCES.has(light.name));assert.equal(light.shadow.camera.near,.35);assert.equal(light.shadow.radius,-light.distance);}
    assert.equal(scene.lighting.shafts.diagnostics.extraShadowMaps,0);
    const prepared=new Set(createPrewarmResourceBatches([scene.lighting.root]).flat());
    assert.ok(scene.lighting.shafts.renderMeshes.every(mesh=>prepared.has(mesh)),
      'Room lighting sources already prime shaft buffers without changing the historical measured-owner list.');
    setContainmentSoftShadowQuality(scene.lighting.root,false);
    assert.ok(selected.every(light=>light.shadow.radius===1.5));
    const after:THREE.Light[]=[];scene.root.traverse(o=>{if(o instanceof THREE.Light)after.push(o);});assert.deepEqual(after,before);
  }finally{scene.dispose();}
});
