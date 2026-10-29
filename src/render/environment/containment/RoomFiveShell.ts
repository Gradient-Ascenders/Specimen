import * as THREE from 'three';
import { readGzipResponse } from '../ReadGzipResponse.ts';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ContainmentArtMaterials} from './ContainmentArtResources.ts';
import type {AuthoredLaserEmitter,LaserHazardPresentation} from '../../hazards/LaserHazardPresentation.ts';

const PARTS=['Architecture','Escape','Cell','Front','Rear','Left','Right','CarriageOne','CarriageTwo','Locks','Status','ButtonCap'] as const;
export const ROOM_FIVE_SHELL_URL=new URL('../../../assets/delivery/room-five.bin',import.meta.url).href;
export type RoomFiveShellLoader=(signal:AbortSignal)=>Promise<THREE.Group>;

export async function parseRoomFiveShell(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  if(PARTS.some(part=>scene.getObjectByName(`R5_${part}`)?.userData.asset!=='containment-room-five-v1')){
    disposeGeometry(scene,true);throw new Error('Unexpected Room 5 atrium asset.');
  }
  return scene;
}
async function loadShell(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(ROOM_FIVE_SHELL_URL,{signal});
  if(!response.ok)throw new Error('Could not load Room 5 atrium art.');
  return parseRoomFiveShell(await readGzipResponse(response,signal));
}

/** Geometry consumes the existing panel, platform and button transforms.
 * Shared finishes, optics, thrusters and all gameplay retain their owners. */
export class RoomFiveShell{
  readonly root=new THREE.Group();
  readonly panels={front:new THREE.Group(),rear:new THREE.Group(),left:new THREE.Group(),right:new THREE.Group()};
  readonly carriages=[new THREE.Group(),new THREE.Group()] as const;
  readonly button=new THREE.Group();
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private source:THREE.Group|undefined;
  private wear:THREE.MeshStandardMaterial|undefined;
  private status:THREE.MeshBasicMaterial|undefined;
  private ventLight:THREE.MeshBasicMaterial|undefined;
  private locks:THREE.Object3D|undefined;
  private detachEmitter:(()=>void)|undefined;
  private release=0;
  private disposed=false;
  private readonly lockedColour=new THREE.Color(0xd4a254);
  private readonly releasedColour=new THREE.Color(0x81ddbd);

  constructor(){
    this.root.name='room-5-authored-atrium';this.button.name='room-5-authored-release-button';
    for(const [name,root] of Object.entries(this.panels))root.name=`room-5-authored-${name}-hatch`;
    this.carriages.forEach((root,index)=>root.name=`room-5-authored-carriage-${index+1}`);
    for(const root of this.roots){root.userData.visualOnly=true;root.userData.staticBatchExcluded=true;}
  }
  private get roots(){return [this.root,...Object.values(this.panels),...this.carriages,this.button];}

  prepare(borrowFinish:(name:string)=>THREE.Material,materials:ContainmentArtMaterials,
    loader:RoomFiveShellLoader=loadShell):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeGeometry(source,true);return;}
      const mapped=new Map<THREE.Mesh,THREE.Material>(),old=new Set<THREE.Material>();
      try{
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const match=/^R5_Batch_(\w+)_(\w+)$/.exec(object.name);
          if(!match)throw new Error(`Unexpected Room 5 finish batch: ${object.name}.`);
          const finish=match[2];let material:THREE.Material;
          if(finish==='Sticky')material=materials.stickyMembrane;
          else if(finish==='Worn'){
            if(!this.wear){
              this.wear=(borrowFinish('Cool') as THREE.MeshStandardMaterial).clone();
              this.wear.name='room-5-machinery-wear';this.wear.color.setRGB(1,1,1);
              this.wear.vertexColors=true;this.wear.roughness=.87;this.wear.metalness=.12;
            }
            material=this.wear;
          }else if(finish==='VentLight'){
            this.ventLight??=new THREE.MeshBasicMaterial({color:0x8fd8c2});
            material=this.ventLight;
          }else if(finish==='Status'){
            if(!this.status){this.status=(borrowFinish('Light') as THREE.MeshBasicMaterial).clone();this.status.name='room-5-release-status';}
            material=this.status;
          }else material=borrowFinish(finish);
          mapped.set(object,material);
          for(const material of Array.isArray(object.material)?object.material:[object.material])old.add(material);
        });
      }catch(error){disposeGeometry(source,true);this.wear?.dispose();this.status?.dispose();this.ventLight?.dispose();this.wear=undefined;this.status=undefined;this.ventLight=undefined;throw error;}
      for(const [object,material] of mapped){
        object.material=material;object.castShadow=object.name.startsWith('R5_Batch_Carriage');
        object.receiveShadow=material instanceof THREE.MeshStandardMaterial&&!material.transparent;
        object.userData.visualOnly=true;object.userData.staticBatchExcluded=true;
        object.updateMatrix();object.matrixAutoUpdate=false;
      }
      for(const material of old)material.dispose();
      this.source=source;
      for(const part of ['Architecture','Escape','Cell','Locks','Status'])this.root.add(source.getObjectByName(`R5_${part}`)!);
      for(const [name,parent] of Object.entries(this.panels))parent.add(source.getObjectByName(`R5_${name[0].toUpperCase()+name.slice(1)}`)!);
      this.carriages[0].add(source.getObjectByName('R5_CarriageOne')!);
      this.carriages[1].add(source.getObjectByName('R5_CarriageTwo')!);
      this.button.add(source.getObjectByName('R5_ButtonCap')!);
      this.locks=this.root.getObjectByName('R5_Locks')!;
      this.setReleaseProgress(this.release);
      for(const root of this.roots)root.updateWorldMatrix(true,true);
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  attachLasers(presentation:LaserHazardPresentation,kit:AuthoredLaserEmitter):void{
    if(this.source&&!this.detachEmitter&&!this.disposed)this.detachEmitter=presentation.attachEmitterModel(kit);
  }
  setReleaseProgress(progress:number):void{
    this.release=THREE.MathUtils.clamp(progress,0,1);
    if(this.locks)this.locks.position.y=-.72*THREE.MathUtils.smoothstep(this.release,0,.15);
    this.status?.color.copy(this.lockedColour).lerp(this.releasedColour,this.release);
  }
  get ready(){return !!this.source;}
  get renderMeshes():readonly THREE.Mesh[]{
    const meshes:THREE.Mesh[]=[];
    for(const root of this.roots)root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly)meshes.push(object);});
    return meshes;
  }
  get diagnostics(){
    const meshes=this.renderMeshes;
    return {ready:this.ready,meshes:meshes.length,
      triangles:meshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3,0),
      textureCount:0,releaseProgress:this.release,lasersAttached:!!this.detachEmitter,disposed:this.disposed};
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();this.detachEmitter?.();
    const geometries=new Set(this.renderMeshes.map(mesh=>mesh.geometry));
    for(const geometry of geometries)geometry.dispose();
    for(const root of this.roots){root.removeFromParent();root.clear();}
    this.source?.clear();this.source=undefined;this.wear?.dispose();this.status?.dispose();this.ventLight?.dispose();
  }
}
function disposeGeometry(root:THREE.Object3D,materials:boolean):void{
  const geometry=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly){geometry.add(object.geometry);
    if(materials)for(const material of Array.isArray(object.material)?object.material:[object.material])owned.add(material);}});
  for(const value of geometry)value.dispose();for(const value of owned)value.dispose();
  root.removeFromParent();root.clear();
}
