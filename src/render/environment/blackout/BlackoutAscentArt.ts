import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readGzipResponse} from '../ReadGzipResponse.ts';
import type {BlackoutMaintenanceMaterials} from './BlackoutMaintenanceMaterials.ts';

export const BLACKOUT_ASCENT_ART_URL=new URL('../../../assets/blackout/ascent-art.bin',import.meta.url).href;
export type BlackoutAscentArtLoader=(signal:AbortSignal)=>Promise<THREE.Group>;
const FINISHES=['Steel','Deck','Paint','White','Dark','Amber','Glass','Letter','Strip','Status','BootA','BootB','BootC'] as const;
type Finish=typeof FINISHES[number];
const REGIONS=new Set(['Entry','Car','Guide','Lab','RearGate','FrontGate','LabDoor','Cover','Shaft','Bay']);
const BOOT_STEPS=[['BootA',.15],['BootB',.48],['BootC',.82]] as const;
export interface BlackoutAscentArtBindings {
  readonly owners:ReadonlyMap<string,THREE.Object3D>;
  readonly shaft:readonly THREE.Object3D[];
  readonly retainedCabinet:ReadonlySet<THREE.Mesh>;
}

export async function parseBlackoutAscentArt(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  try{
    const root=scene.getObjectByName('B3_ASC_Architecture');
    if(root?.userData.asset!=='blackout-ascent-v1')throw Error('Unexpected ascent art version.');
    const regions=new Set<string>();
    scene.traverse(object=>{
      if(object instanceof THREE.Light||object instanceof THREE.Camera)throw Error('Ascent art must exclude studio objects.');
      if(!(object instanceof THREE.Mesh))return;
      if(!root?.children.includes(object)||!object.name.startsWith('B3_ASC_Batch_')||
        !REGIONS.has(object.userData.region)||!FINISHES.includes(object.userData.finish))throw Error('Unexpected ascent batch: '+object.name);
      regions.add(object.userData.region);
      for(const name of ['position','normal','uv','color'])if(!object.geometry.getAttribute(name))throw Error('Missing ascent attribute: '+name);
      for(const a of Object.values(object.geometry.attributes) as (THREE.BufferAttribute|THREE.InterleavedBufferAttribute)[]){
        if(a instanceof THREE.InterleavedBufferAttribute||!a.array.every(Number.isFinite))throw Error('Invalid ascent geometry.');
      }
    });
    for(const region of REGIONS)if(!regions.has(region))throw Error('Missing ascent region: '+region);
    return scene;
  }catch(error){disposeSource(scene,true);throw error;}
}

async function loadArt(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(BLACKOUT_ASCENT_ART_URL,{signal});
  if(!response.ok)throw Error(`Could not load ascent art: HTTP ${response.status}.`);
  return parseBlackoutAscentArt(await readGzipResponse(response,signal));
}

/** The live lift lends its moving owners; this component owns all replacement
 * buffers/material copies. Shaft instances share the same geometry bank. */
export class BlackoutAscentArt {
  readonly root=new THREE.Group();
  readonly diagnostics={ready:false,meshes:0,triangles:0,expandedTriangles:0,retiredMeshes:0,newTextures:0,newLights:0};
  private readonly abort=new AbortController();
  private readonly materials=new Map<Finish,THREE.Material>();
  private readonly hidden=new THREE.MeshStandardMaterial({name:'blackout-ascent-retired',visible:false});
  private readonly bindings:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[];
  private readonly skins:THREE.Mesh[]=[];
  private readonly copies:THREE.Mesh[]=[];
  private source:THREE.Group|undefined;
  private preparation:Promise<void>|undefined;
  private disposed=false;
  private readonly kit:BlackoutMaintenanceMaterials;
  private readonly status:THREE.MeshStandardMaterial;
  private readonly strip:THREE.MeshStandardMaterial;

  constructor(kit:BlackoutMaintenanceMaterials,status:THREE.MeshStandardMaterial,strip:THREE.MeshStandardMaterial){
    this.kit=kit;this.status=status;this.strip=strip;
    this.root.name='blackout-ascent-authored-art';this.root.userData.visualOnly=true;this.root.userData.staticBatchExcluded=true;
    // Stable opaque material ordering, before characters are constructed.
    for(const finish of FINISHES)this.finish(finish);
  }

  prepare(lift:THREE.Group,devices:BlackoutAscentArtBindings,loader:BlackoutAscentArtLoader=loadArt):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeSource(source,true);return;}
      this.source=source;
      lift.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||devices.retainedCabinet.has(object)||object.name.startsWith('lift-electric-burst-'))return;
        this.bindings.push({mesh:object,material:object.material});object.material=this.hidden;
      });
      const old=new Set<THREE.Material>(),adopt:{mesh:THREE.Mesh;owner:THREE.Object3D}[]=[];
      source.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        for(const material of [object.material].flat())old.add(material);
        object.material=this.finish(object.userData.finish);object.receiveShadow=true;
        object.castShadow=false;object.userData.visualOnly=true;object.updateMatrix();object.matrixAutoUpdate=false;
        const region=object.userData.region as string,triangles=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
        this.diagnostics.meshes++;this.diagnostics.triangles+=triangles;
        if(region==='Shaft'||region==='Bay'){
          const indices=region==='Shaft'?[0,1,2,3,4,5]:[1,4];
          for(const [n,index]of indices.entries()){
            const skin=n===0?object:object.clone();
            if(n>0){this.copies.push(skin);skin.name=object.name+'_'+index;}
            const owner=devices.shaft[index];if(!owner)throw Error('Missing scrolling shaft owner.');
            adopt.push({mesh:skin,owner});this.skins.push(skin);this.diagnostics.expandedTriangles+=triangles;
          }
        }else{
          this.diagnostics.expandedTriangles+=triangles;
          const owner=devices.owners.get(region);
          if(owner){adopt.push({mesh:object,owner});this.skins.push(object);}
        }
      });
      for(const material of old)material.dispose();
      for(const {mesh,owner}of adopt){mesh.removeFromParent();owner.add(mesh);}
      this.root.add(source);lift.add(this.root);this.diagnostics.retiredMeshes=this.bindings.length;this.diagnostics.ready=true;
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  update(charge:number):void{
    for(const [name,threshold]of BOOT_STEPS){
      const material=this.materials.get(name) as THREE.MeshStandardMaterial;
      material.emissiveIntensity=charge>threshold ? .85 : .015;
    }
  }

  private finish(name:Finish):THREE.Material{
    const existing=this.materials.get(name);if(existing)return existing;
    if(name==='Status'||name==='Strip'){
      const material=name==='Status'?this.status:this.strip;material.vertexColors=true;
      this.materials.set(name,material);return material;
    }
    if(name==='Dark'){
      const material=new THREE.MeshBasicMaterial({name:'blackout-ascent-dark',color:0x000000,vertexColors:true});this.materials.set(name,material);return material;
    }
    const material=this.kit.get(name==='White'||name==='Paint'||name==='Letter'?'wallPanel':name==='Amber'?'warningPaint':'machineryMetal').clone();
    material.name='blackout-ascent-'+name;material.map=null;material.vertexColors=true;
    const colors={Steel:0x809b96,Deck:0x8c9f97,Paint:0xadb8a6,White:0xd8e5e5,Amber:0xd7ac51,Glass:0x142a2d,
      Letter:0xaabfbd,BootA:0x589c7c,BootB:0x589c7c,BootC:0x589c7c};
    material.color.setHex(colors[name]);material.emissive.setHex(0);material.emissiveIntensity=0;
    material.roughness=name==='Glass'?.3:name==='Steel'?.65:name==='White'?.66:.88;
    material.metalness=name==='Steel'?.55:name==='Glass'?.4:.12;
    if(name.startsWith('Boot')){material.emissive.setHex(0x37b98b);material.emissiveIntensity=.015;}
    this.materials.set(name,material);return material;
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    for(const copy of this.copies)copy.removeFromParent();
    if(this.source)for(const skin of this.skins)if(!this.copies.includes(skin)){skin.removeFromParent();this.source.add(skin);}
    for(const {mesh,material}of this.bindings)mesh.material=material;
    if(this.source)disposeSource(this.source,false);
    for(const material of this.materials.values())if(material!==this.status&&material!==this.strip)material.dispose();
    this.hidden.dispose();this.materials.clear();this.bindings.length=0;this.skins.length=0;this.copies.length=0;
    this.root.removeFromParent();this.root.clear();this.source=undefined;this.diagnostics.ready=false;
  }
}

function disposeSource(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const m of [object.material].flat())owned.add(m);}});
  for(const g of geometries)g.dispose();if(materials)for(const m of owned)m.dispose();root.removeFromParent();root.clear();
}
