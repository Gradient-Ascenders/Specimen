/** Offline GLB handoff; the cinematic creates each shared buffer in an idle job. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=new URL('../../assets/characters/escape-drone/escape-drone.glb',import.meta.url);
const target=new URL('../../assets/characters/escape-drone/escape-drone.geometry.json',import.meta.url);
const bytes=await readFile(source),data=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
if(data.images?.length||data.cameras?.length||data.animations?.length||data.extensions?.KHR_lights_punctual)
 throw Error('Escape drone export must contain rigid geometry only.');
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.updateMatrixWorld(true);
const parts:Record<string,{attributes:Record<string,{itemSize:number;type:string;normalized:boolean;values:number[]}>;index:number[]|null}>={};
scene.traverse(o=>{if(o instanceof THREE.Mesh){
 if(!/^ED_(Head_(armour|armourShadow|mechanism|barrel)|Airframe_(armour|armourShadow|mechanism)|Rotor_barrel)$/.test(o.name))
  throw Error('Unexpected escape drone mesh: '+o.name);
 const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),attributes:typeof parts[string]['attributes']={};
 for(const [name,attribute] of Object.entries(geometry.attributes as THREE.NormalBufferAttributes)){
  if(attribute instanceof THREE.InterleavedBufferAttribute)throw Error('Unexpected interleaved model attribute.');
  attributes[name]={itemSize:attribute.itemSize,type:attribute.array.constructor.name,
   normalized:attribute.normalized,values:Array.from(attribute.array)};
 }
 parts[o.name]={attributes,index:geometry.index?Array.from(geometry.index.array):null};
 geometry.dispose();o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();
}});
if(Object.keys(parts).length!==8)throw Error('Escape drone needs exactly eight geometry buffers.');
const json=JSON.stringify({version:1,sourceSha256:createHash('sha256').update(bytes).digest('hex'),parts})+'\n';
if(process.argv.includes('--check')){
 if(json!==await readFile(target,'utf8'))throw Error('Escape drone geometry is stale. Run node scripts/assets/generate-escape-drone-model.ts.');
 console.log('Escape drone buffers reproduce exactly ('+Buffer.byteLength(json)+' bytes).');
}else{await writeFile(target,json);console.log('Wrote eight escape drone buffers ('+Buffer.byteLength(json)+' bytes).');}
