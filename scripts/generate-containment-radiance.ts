/** Export live fixture lights and explicitly bake-only fill for the Blender BVH bake.
 * Generation: node scripts/generate-containment-radiance.ts, then run
 * assets/environments/containment-lighting/bake-radiance.py in headless Blender.
 * --check only validates provenance and packed data, never invokes Blender. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {CONTAINMENT_PROBE_LAYOUT,CONTAINMENT_PROBE_RAYS,CONTAINMENT_CAPTURE_SIZE,
  CONTAINMENT_RADIANCE_VERSION,CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT,
  CONTAINMENT_PROBE_ATLAS_DEPTH} from '../src/render/environment/containment/ContainmentProbeLayout.ts';

const sourceFiles=[
  ['containment-room-one/room-one-shell.glb',['R1_Architecture']],
  ['containment-room-two/room-two-hall.glb',['R2_Architecture']],
  ['containment-room-three/room-three-laboratory.glb',['R3_Architecture']],
  ['containment-room-four/room-four-lift.glb',['R4_Architecture']],
  ['containment-room-five/room-five-atrium.glb',['R5_Architecture','R5_Cell']],
] as const;
const directory=new URL('../assets/environments/containment-lighting/',import.meta.url);
/** These former duct practicals now contribute only to offline indirect light.
 * The duct's authored vertex colours replace their direct illumination, so
 * spawning live SpotLights would waste shader variants and frame time.
 * Keep these virtual emitters in the provenance inputs until the radiance
 * bank is deliberately rebaked with different lighting. */
const bakedOnlyDuctLights=[
  {name:'room-1-to-2-duct-reflected-cue',position:[-8.4,12.25,26.5],intensity:24,range:11,target:[-8.4,11.25,26.5],angle:1,penumbra:.48},
  {name:'room-1-to-2-duct-low-run-key',position:[-4.8,7.12,10.5],intensity:3,range:6.5,target:[-4.8,5.2,10.5],angle:1.25,penumbra:.3},
  {name:'room-1-to-2-duct-ramp-key',position:[-4.8,11.7,22],intensity:3,range:12,target:[-4.8,6.2,14],angle:.65,penumbra:.3},
  {name:'room-1-to-2-duct-turn-key',position:[-4.8,12.4,24],intensity:3,range:6,target:[-6.5,10.5,24],angle:1,penumbra:.3},
] as const;
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const sources=[];
for(const [file,anchors] of sourceFiles)sources.push({file,anchors,sha256:sha(await readFile(new URL('../assets/environments/'+file,import.meta.url)))});
const scene=new ContainmentLevelScene(()=>{}),lights:object[]=[];
try{
  for(const room of CONTAINMENT_PROBE_LAYOUT){
    scene.lighting.setActiveRoom(room.room);scene.root.updateMatrixWorld(true);
    scene.lighting.root.traverseVisible(object=>{
      if(!(object instanceof THREE.SpotLight||object instanceof THREE.PointLight)||!object.name.startsWith(`room-${room.room}-`))return;
      // Only fixed architecture contributes to the bake. Cinematic and lift
      // state lights retain their real-time authoritative presentation.
      if(/pedestal|containment-state|reveal|escalation|amber|arrival/.test(object.name))return;
      lights.push({room:room.room,name:object.name,position:object.getWorldPosition(new THREE.Vector3()).toArray(),
        colour:object.color.toArray(),intensity:object.intensity,range:object.distance,
        ...(object instanceof THREE.SpotLight?{target:object.target.getWorldPosition(new THREE.Vector3()).toArray(),angle:object.angle,penumbra:object.penumbra}:{})});
    });
    if(room.room===1){
      // Preserve the established static probe bake without putting these
      // emitters back into the real-time scene. This is authored lighting
      // input, not a --check bypass or an exception to the provenance hash.
      const colour=new THREE.Color(0x86aabd).toArray();
      for(const fixture of bakedOnlyDuctLights){
        if(scene.lighting.root.getObjectByName(fixture.name))throw new Error(`Bake-only duct fixture is still live: ${fixture.name}`);
        lights.push({room:1,name:fixture.name,position:fixture.position,colour,
          intensity:fixture.intensity,range:fixture.range,target:fixture.target,
          angle:fixture.angle,penumbra:fixture.penumbra});
      }
    }
  }
}finally{scene.dispose();}
const generator=await readFile(new URL('bake-radiance.py',directory));
const input={version:CONTAINMENT_RADIANCE_VERSION,sources,lights,layout:CONTAINMENT_PROBE_LAYOUT,rays:CONTAINMENT_PROBE_RAYS,
  captureSize:CONTAINMENT_CAPTURE_SIZE,atlas:[CONTAINMENT_PROBE_ATLAS_WIDTH,CONTAINMENT_PROBE_ATLAS_HEIGHT,CONTAINMENT_PROBE_ATLAS_DEPTH],
  generatorSha256:sha(generator)};
const text=JSON.stringify(input,null,2)+'\n';
if(process.argv.includes('--check')){
  if(await readFile(new URL('bake-input.json',directory),'utf8')!==text)throw new Error('Containment radiance inputs are stale. Regenerate the Blender bake.');
  const bank=gunzipSync(await readFile(new URL('radiance.bin',directory)));
  if(bank.subarray(0,8).toString()!==input.version)throw new Error('Invalid radiance bank version.');
  const length=bank.readUInt32LE(8),metadata=JSON.parse(bank.subarray(12,12+length).toString());
  if(metadata.inputSha256!==sha(text))throw new Error('Containment radiance bake provenance is stale.');
  const offset=(12+length+3)&~3;
  const expected=offset+input.atlas.reduce((a,b)=>a*b,1)*8+5*input.captureSize[0]*input.captureSize[1]*4;
  if(bank.byteLength!==expected)throw new Error('Invalid radiance bank length.');
  console.log(`Containment radiance bake current: ${metadata.probes} probes, ${bank.byteLength} unpacked bytes.`);
}else{
  await writeFile(new URL('bake-input.json',directory),text);
  console.log('Wrote stable light and geometry inputs for the Blender radiance bake.');
}
