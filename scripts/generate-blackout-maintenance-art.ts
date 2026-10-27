/** Geometry-only Blackout bundles; native gzip decode precedes GPU preparation. */
import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

for(const [path,bundle,name,asset]of [
  ['environments/blackout-maintenance/maintenance-bay.glb','maintenance-art.bin','B3_R1_Architecture','blackout-maintenance-v1'],
  ['vehicles/maintenance-drone/maintenance-drone.glb','maintenance-drone.bin','MD_Drone','maintenance-drone-v1'],
  ['environments/blackout-transit/transit-hall.glb','transit-art.bin','B3_R2_Architecture','blackout-transit-v1'],
  ['environments/blackout-ascent/research-ascent.glb','ascent-art.bin','B3_ASC_Architecture','blackout-ascent-v1'],
]){
const source=new URL('../assets/'+path,import.meta.url);
const target=new URL('../src/assets/blackout/'+bundle,import.meta.url);
const bytes=readFileSync(source);
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
if(bytes.readUInt32LE(0)!==0x46546c67||json.scenes.length!==1||json.cameras?.length||json.images?.length||
  json.animations?.length||json.extensions?.KHR_lights_punctual)throw Error('Maintenance export must be geometry only.');
const root=json.nodes.find((node:{name?:string})=>node.name===name);
if(root?.extras?.asset!==asset)throw Error('Unexpected maintenance geometry version: '+path);
const packed=gzipSync(bytes,{level:9});packed[9]=255;
if(process.argv.includes('--check')){
  if(!readFileSync(target).equals(packed))throw Error('Blackout maintenance geometry bundle is stale.');
}else writeFileSync(target,packed);
console.log(`${bundle}: ${bytes.length} GLB bytes -> ${packed.length} bundled bytes; SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
}
