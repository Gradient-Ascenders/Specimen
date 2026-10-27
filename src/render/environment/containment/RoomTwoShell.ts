import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ContainmentArtMaterials} from './ContainmentArtResources.ts';

export const ROOM_TWO_SHELL_URL=new URL('../../../../assets/environments/containment-room-two/room-two-hall.glb',import.meta.url).href;
export type RoomTwoShellLoader=(signal:AbortSignal)=>Promise<THREE.Group>;

export async function parseRoomTwoShell(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  if(scene.getObjectByName('R2_Architecture')?.userData.asset!=='containment-room-two-v1'){
    disposeGeometry(scene,true);throw new Error('Unexpected Room 2 architecture.');
  }
  return scene;
}

async function loadShell(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(ROOM_TWO_SHELL_URL,{signal});
  if(!response.ok)throw new Error('Could not load Room 2 architecture.');
  return parseRoomTwoShell(await response.arrayBuffer());
}

/** Owns only Blender geometry. Room 1 owns the shared finish maps/materials;
 * the existing monitor, tracking joints, boosters and colliders keep their owners. */
export class RoomTwoShell{
  readonly root=new THREE.Group();
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private source:THREE.Group|undefined;
  private disposed=false;

  constructor(){
    this.root.name='room-2-authored-shell';
    this.root.userData.visualOnly=true;
    this.root.userData.staticBatchExcluded=true;
  }

  prepare(borrowFinish:(name:string)=>THREE.Material,materials:ContainmentArtMaterials,
    loader:RoomTwoShellLoader=loadShell):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeGeometry(source,true);return;}
      const mapped=new Map<THREE.Mesh,THREE.Material>(),old=new Set<THREE.Material>();
      try{
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const match=/^R2_Batch_(Shell|Platforms)_(\w+)$/.exec(object.name);
          if(!match)throw new Error(`Unexpected Room 2 finish batch: ${object.name}.`);
          const finish=match[2];
          mapped.set(object,finish==='Sticky'?materials.stickyMembrane:borrowFinish(finish));
          for(const material of Array.isArray(object.material)?object.material:[object.material])old.add(material);
        });
      }catch(error){disposeGeometry(source,true);throw error;}
      for(const [object,material] of mapped){
        object.material=material;
        object.castShadow=object.name.startsWith('R2_Batch_Platforms_');
        object.receiveShadow=material instanceof THREE.MeshStandardMaterial&&!material.transparent;
        object.userData.visualOnly=true;
        // Room-sized immutable batches get conservative box shadow culling.
        object.userData.staticBatchSourceNames=[object.name];
        object.updateMatrix();object.matrixAutoUpdate=false;
      }
      for(const material of old)material.dispose();
      this.source=source;
      this.root.add(source.getObjectByName('R2_Architecture')!);
      this.root.updateWorldMatrix(true,true);
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  get ready():boolean{return !!this.source;}

  /** Actual visible upload owners replace the retired procedural Room 2 list. */
  get renderMeshes():readonly THREE.Mesh[]{
    const meshes:THREE.Mesh[]=[];
    this.root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly)meshes.push(object);});
    return meshes;
  }

  get diagnostics(){
    let meshes=0,triangles=0;
    this.root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
    return {ready:this.ready,meshes,triangles,textureCount:0,disposed:this.disposed};
  }

  dispose():void{
    if(this.disposed)return;
    this.disposed=true;this.abort.abort();
    if(this.source){this.source.add(...this.root.children);disposeGeometry(this.source,false);}
    this.source=undefined;
    this.root.removeFromParent();this.root.clear();
  }
}

function disposeGeometry(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])owned.add(m);}});
  for(const geometry of geometries)geometry.dispose();
  if(materials)for(const material of owned)material.dispose();
  root.removeFromParent();root.clear();
}
