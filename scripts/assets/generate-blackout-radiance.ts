/** Export actual adopted render surfaces for a bounded offline lighting bake.
 * --check verifies geometry, fixtures, authoring inputs and packed provenance. */
import * as THREE from 'three';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createAscentArtFixture} from '../lib/blackout-ascent-art-states.ts';
import {BLACKOUT_RADIANCE_LAYOUT as ZONES,BLACKOUT_RADIANCE_VERSION as VERSION,BLACKOUT_CAPTURE_SIZE as SIZE,
  BLACKOUT_ATLAS_WIDTH as WIDTH,BLACKOUT_ATLAS_HEIGHT as HEIGHT,BLACKOUT_ATLAS_DEPTH as DEPTH,
  BLACKOUT_BAND_HEIGHT as BAND,BLACKOUT_PROBE_RAYS as RAYS} from '../../src/render/environment/blackout/BlackoutLightingLayout.ts';

const directory=new URL('../../assets/environments/blackout-lighting/',import.meta.url),evidence=new URL('../../artifacts/evidence/blackout-lighting/',import.meta.url);
const sha=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const fixture=createAscentArtFixture(),meshes:THREE.Mesh[]=[],lights:object[]=[];
const world=new THREE.Vector3(),point=new THREE.Vector3(),tint=new THREE.Color();
let triangles=0;
try{
  await fixture.prepare();fixture.pose(0,1,0,0);
  fixture.scene.root.updateMatrixWorld(true);
  const dynamic=new Set<THREE.Object3D>([fixture.bay.door.root,fixture.lift.rearGate,fixture.lift.frontGate,fixture.lift.labDoor,
    ...fixture.controller.lifts.map(l=>l.platform.collisionMesh),...fixture.controller.dissolveTargets.map(t=>t.mesh)]);
  fixture.scene.root.traverseVisible(object=>{
    for(let parent:THREE.Object3D|null=object;parent;parent=parent.parent)
      if(dynamic.has(parent)||parent===fixture.scene.finalArena!.root||/^lift-scrolling-shaft-|blackout-connector-fan|lift-open-cabinet-cover/.test(parent.name))return;
    if(object instanceof THREE.PointLight||object instanceof THREE.SpotLight){
      if(object.intensity<=0||object.distance<=0||/lift-passing|discharge/.test(object.name))return;
      const bank=fixture.controller.lightBanks.indexOf(object as THREE.SpotLight),circuit=bank>=0?bank:object.name==='lift-white-lab-light'?5:-1;
      const intensity=circuit===5?95:object.intensity;
      if(bank>=0||circuit===5||!/drone/.test(object.name))lights.push({name:object.name,position:object.getWorldPosition(world).toArray(),colour:object.color.toArray(),intensity,
        range:object.distance,decay:object.decay,circuit,zones:bank>=0?[bank+3]:circuit===5?[9]:[0,1,2,7],
        ...(object instanceof THREE.SpotLight?{target:object.target.getWorldPosition(world).toArray(),angle:object.angle,penumbra:object.penumbra}:{})});
    }
    if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||object.userData.runtimeProxy||/camera|monitor|speech|surveillance|arrow|acid|sewer-liquid|burst|plume|exhaust|projectile|electric|conducting-lamp/i.test(object.name))return;
    const materials=[object.material].flat();
    if(materials.length!==1||!(materials[0] instanceof THREE.MeshStandardMaterial||materials[0] instanceof THREE.MeshBasicMaterial)||!materials[0].visible||materials[0].transparent)return;
    meshes.push(object);triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
  });
  // The stationary car sees the average of its existing passing shaft lamps.
  // Flashes remain live; they are never baked into the unpowered state.
  lights.push({name:'service-car-average-passing-spill',position:[4.4,4,180.1],colour:[.35,.55,.65],intensity:8,range:12,decay:2,circuit:4,zones:[8]});
  // The closed landing light is initially zero, but its real arrival fixture
  // must be present in the independently controlled laboratory bake.
  if(!lights.some((l:any)=>l.circuit===5))lights.push({name:'lift-white-lab-light',position:[0,5,187.4],colour:new THREE.Color(0xdaefff).toArray(),intensity:95,range:17,decay:2,circuit:5,zones:[9]});
  const packed=new Float32Array(triangles*15);let cursor=0;
  for(const mesh of meshes){
    const geometry=mesh.geometry,position=geometry.getAttribute('position'),index=geometry.index,colour=geometry.getAttribute('color');
    const material=mesh.material as THREE.MeshStandardMaterial|THREE.MeshBasicMaterial,count=index?.count??position.count;
    for(let i=0;i<count;i+=3){
      tint.setRGB(0,0,0);
      for(let c=0;c<3;c++){
        const vertex=index?index.getX(i+c):i+c;
        point.fromBufferAttribute(position,vertex).applyMatrix4(mesh.matrixWorld);
        packed[cursor++]=point.x;packed[cursor++]=point.y;packed[cursor++]=point.z;
        if(colour&&material.vertexColors){tint.r+=colour.getX(vertex)/3;tint.g+=colour.getY(vertex)/3;tint.b+=colour.getZ(vertex)/3;}
        else tint.addScalar(1/3);
      }
      tint.multiply(material.color);if(material.map)tint.multiplyScalar(.72);
      for(const v of tint.toArray())packed[cursor++]=v;
      const emissive=material instanceof THREE.MeshStandardMaterial&&!/Boot|status/i.test(material.name)?material.emissive.clone().multiplyScalar(material.emissiveIntensity):new THREE.Color(0);
      for(const v of emissive.toArray())packed[cursor++]=v;
    }
  }
  const geometryBytes=new Uint8Array(packed.buffer),sources:Record<string,string>={};
  for(const path of ['assets/environments/blackout-maintenance/maintenance-bay.glb','assets/environments/blackout-transit/transit-hall.glb','assets/environments/blackout-ascent/research-ascent.glb'])sources[path]=sha(await readFile(new URL('../../'+path,import.meta.url)));
  sources.generatorSha256=sha(await readFile(new URL('bake-radiance.py',directory)));
  const input={version:VERSION,sources,geometrySha256:sha(geometryBytes),triangles,meshCount:meshes.length,lights,layout:ZONES,
    zoneTints:ZONES.map(()=>[1,1,1]),rays:RAYS,captureSize:SIZE,atlas:[WIDTH,HEIGHT,DEPTH],bandHeight:BAND,
    geometryFile:'../../../artifacts/evidence/blackout-lighting/bake-geometry.bin',
    liquids:[{min:[-17,-2,7],max:[17,-.8,48],colour:[.0004,.0012,.00016]},
      {min:[-18,-2,88],max:[18,-.8,145],colour:[.0016,.0044,.0004]}]};
  const text=JSON.stringify(input,null,2)+'\n';
  if(process.argv.includes('--check')){
    if(text!==await readFile(new URL('bake-input.json',directory),'utf8'))throw Error('Blackout radiance inputs are stale.');
    const bytes=gunzipSync(await readFile(new URL('radiance.bin',directory))),size=bytes.readUInt32LE(8),header=JSON.parse(bytes.subarray(12,12+size).toString());
    if(bytes.subarray(0,8).toString()!==VERSION||header.inputSha256!==sha(text))throw Error('Stale Blackout radiance bank.');
    const offset=(12+size+3)&~3;
    if(bytes.length!==offset+WIDTH*HEIGHT*DEPTH*8+ZONES.length*2*SIZE[0]*SIZE[1]*4)throw Error('Truncated Blackout radiance bank.');
    console.log('Blackout radiance geometry, fixture states and packed provenance match.');
  }else{
    await mkdir(directory,{recursive:true});await mkdir(evidence,{recursive:true});
    await writeFile(new URL('bake-input.json',directory),text);
    const zipped=gzipSync(geometryBytes,{level:9,mtime:0} as never);zipped[9]=255;
    await writeFile(new URL('bake-geometry.bin',evidence),zipped);
    console.log(`Exported ${meshes.length} static surfaces, ${triangles} triangles and ${lights.length} bounded fixtures.`);
  }
}finally{fixture.dispose();}
