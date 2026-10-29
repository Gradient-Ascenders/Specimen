/** Register validated geometry-only exports; Node reads the GLB, never .blend. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const folder=new URL('../../assets/environments/cultivation/',import.meta.url);
const layout=JSON.parse(readFileSync(new URL('authoring-layout.json',folder),'utf8'));
const assets=[];
for(const id of Object.keys(layout)){
  if(!readdirSync(folder).includes(id+'.glb'))continue;
  const bytes=readFileSync(new URL(id+'.glb',folder));
  const data=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  if(data.scenes.length!==1||data.cameras?.length||data.extensions?.KHR_lights_punctual||data.animations?.length||data.images?.length)
    throw Error(`${id}: export must contain one geometry-only scene`);
  const parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  parsed.scene.updateMatrixWorld(true);const signatures=new Map<string,string>(),aliases=new Map<string,string>();
  parsed.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
    const hash=createHash('sha256').update(JSON.stringify(object.matrixWorld.toArray()));
    for(const [name,attribute]of Object.entries(object.geometry.attributes as THREE.NormalBufferAttributes).sort(([a],[b])=>a.localeCompare(b))){
      if(attribute instanceof THREE.InterleavedBufferAttribute)throw Error('Unexpected interleaved authoring buffer');
      hash.update(JSON.stringify([name,attribute.itemSize,attribute.normalized,attribute.array.constructor.name]));
      hash.update(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
    }
    const index=object.geometry.index;if(index)hash.update(new Uint8Array(index.array.buffer,index.array.byteOffset,index.array.byteLength));
    const signature=hash.digest('hex'),canonical=signatures.get(signature)??object.name;
    signatures.set(signature,canonical);aliases.set(object.name,canonical);
    object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();
  });
  const batches=data.nodes.filter((n:any)=>n.mesh!==undefined).map((n:any)=>{
    if(!n.name.startsWith('C2_'+id+'_Batch_')||!n.extras?.finish)throw Error(`Unexpected exported owner ${n.name}`);
    if(!aliases.has(n.name))throw Error(`Authoring node name was changed by the loader: ${n.name}`);
    return{name:n.name,finish:n.extras.finish,target:n.extras.runtimeTarget??'',geometry:aliases.get(n.name)};
  });
  assets.push({id,owner:layout[id].owner,retireNames:layout[id].retireNames,
    retirePrefixes:layout[id].retirePrefixes??[],retireSubtrees:layout[id].retireSubtrees??[],batches});
  console.log(id,batches.length,'batches',bytes.length,'bytes',createHash('sha256').update(bytes).digest('hex'));
}
const target=new URL('../../src/render/environment/cultivation/CultivationBlenderManifest.ts',import.meta.url);
const existing=readFileSync(target,'utf8');
const declaration=existing.slice(0,existing.indexOf('export const CULTIVATION_BLENDER_ASSETS'));
writeFileSync(target,declaration+'export const CULTIVATION_BLENDER_ASSETS:readonly CultivationBlenderAsset[]='+JSON.stringify(assets,null,2)+';\n');
