import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ContainmentArtMaterials} from './ContainmentArtResources.ts';
import type {LaserHazardPresentation} from '../../hazards/LaserHazardPresentation.ts';

export const ROOM_THREE_SHELL_URL=new URL('../../../../assets/environments/containment-room-three/room-three-laboratory.glb',import.meta.url).href;
export type RoomThreeShellLoader=(signal:AbortSignal)=>Promise<THREE.Group>;

export async function parseRoomThreeShell(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  if(scene.getObjectByName('R3_Architecture')?.userData.asset!=='containment-room-three-v1'||
    scene.getObjectByName('R3_LaserHousing')?.userData.asset!=='containment-room-three-laser-v1'||
    !(scene.getObjectByName('R3_LaserAperture') instanceof THREE.Mesh)||
    !(scene.getObjectByName('R3_LaserShutter') instanceof THREE.Mesh)){
    disposeGeometry(scene,true);throw new Error('Unexpected Room 3 architecture.');
  }
  return scene;
}

async function loadShell(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(ROOM_THREE_SHELL_URL,{signal});
  if(!response.ok)throw new Error('Could not load Room 3 architecture.');
  return parseRoomThreeShell(await response.arrayBuffer());
}

/** Geometry and a vertex-wear material only. Existing owners retain the acid,
 * shared texture bank, lasers, thrusters, cameras, lighting and gameplay. */
export class RoomThreeShell{
  readonly root=new THREE.Group();
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private source:THREE.Group|undefined;
  private wear:THREE.MeshStandardMaterial|undefined;
  private detachEmitter:(()=>void)|undefined;
  private disposed=false;

  constructor(){
    this.root.name='room-3-authored-shell';
    this.root.userData.visualOnly=true;this.root.userData.staticBatchExcluded=true;
  }

  prepare(borrowFinish:(name:string)=>THREE.Material,materials:ContainmentArtMaterials,
    loader:RoomThreeShellLoader=loadShell):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeGeometry(source,true);return;}
      const mapped=new Map<THREE.Mesh,THREE.Material>(),old=new Set<THREE.Material>();
      try{
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const match=/^R3_Batch_(Shell|Platforms|Emitter)_(\w+)$/.exec(object.name);
          const finish=match?.[2]??(/^R3_Laser(Aperture|Shutter)$/.test(object.name)?'Graphite':undefined);
          if(!finish)throw new Error(`Unexpected Room 3 finish batch: ${object.name}.`);
          let material:THREE.Material;
          if(finish==='Sticky')material=materials.stickyMembrane;
          else if(finish==='Stained'){
            if(!this.wear){
              this.wear=(borrowFinish('Cool') as THREE.MeshStandardMaterial).clone();
              this.wear.name='room-3-chemical-stained-ceramic';
              this.wear.color.setRGB(1,1,1);this.wear.vertexColors=true;
              this.wear.roughness=.94;this.wear.metalness=.05;
            }
            material=this.wear;
          }else material=borrowFinish(finish);
          mapped.set(object,material);
          for(const material of Array.isArray(object.material)?object.material:[object.material])old.add(material);
        });
      }catch(error){disposeGeometry(source,true);this.wear?.dispose();this.wear=undefined;throw error;}
      for(const [object,material] of mapped){
        object.material=material;object.castShadow=object.name.startsWith('R3_Batch_Platforms_');
        object.receiveShadow=!object.name.startsWith('R3_Batch_Emitter_')&&
          material instanceof THREE.MeshStandardMaterial&&!material.transparent;
        object.userData.visualOnly=true;object.userData.staticBatchSourceNames=[object.name];
        object.updateMatrix();object.matrixAutoUpdate=false;
      }
      for(const material of old)material.dispose();
      this.source=source;this.root.add(source.getObjectByName('R3_Architecture')!);
      this.root.updateWorldMatrix(true,true);
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  attachLasers(presentation:LaserHazardPresentation):void{
    if(!this.source||this.detachEmitter||this.disposed)return;
    this.detachEmitter=presentation.attachEmitterModel({housing:this.source.getObjectByName('R3_LaserHousing')!,
      aperture:(this.source.getObjectByName('R3_LaserAperture') as THREE.Mesh).geometry,
      shutter:(this.source.getObjectByName('R3_LaserShutter') as THREE.Mesh).geometry});
  }

  get ready():boolean{return !!this.source;}
  get renderMeshes():readonly THREE.Mesh[]{
    const meshes:THREE.Mesh[]=[];
    this.root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    return meshes;
  }
  get diagnostics(){
    const meshes=this.renderMeshes;
    return {ready:this.ready,meshes:meshes.length,
      triangles:meshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3,0),
      textureCount:0,ownedMaterials:this.wear?1:0,lasersAttached:!!this.detachEmitter,disposed:this.disposed};
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    this.detachEmitter?.();this.detachEmitter=undefined;
    if(this.source){this.source.add(...this.root.children);disposeGeometry(this.source,false);}
    this.source=undefined;this.wear?.dispose();this.wear=undefined;
    this.root.removeFromParent();this.root.clear();
  }
}

function disposeGeometry(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])owned.add(material);}});
  for(const geometry of geometries)geometry.dispose();
  if(materials)for(const material of owned)material.dispose();
  root.removeFromParent();root.clear();
}
