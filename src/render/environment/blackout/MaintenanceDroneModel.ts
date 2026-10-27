import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readGzipResponse} from '../ReadGzipResponse.ts';
import type {BlackoutMaintenanceMaterials} from './BlackoutMaintenanceMaterials.ts';

export const MAINTENANCE_DRONE_MODEL_URL=new URL('../../../assets/blackout/maintenance-drone.bin',import.meta.url).href;
const FINISHES=['Paint','Graphite','Alloy','Rubber','Copper','Mark','LampA','LampB','Lens'] as const;
type Finish=typeof FINISHES[number];
export type MaintenanceDroneModelLoader=(signal:AbortSignal)=>Promise<THREE.Group>;

export async function parseMaintenanceDroneModel(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  try{
    const root=scene.getObjectByName('MD_Drone');
    if(root?.userData.asset!=='maintenance-drone-v1')throw Error('Unexpected maintenance drone asset.');
    const rotors=new Set<string>();
    scene.traverse(object=>{
      if(object instanceof THREE.Light||object instanceof THREE.Camera)throw Error('Drone studio objects cannot enter gameplay.');
      if(!(object instanceof THREE.Mesh))return;
      const {owner,finish}=object.userData;
      if(!root||!root.children.includes(object)||!FINISHES.includes(finish)||
        owner!=='Frame'&&!/^Rotor_[0-3]$/.test(owner))throw Error('Unexpected drone part: '+object.name);
      for(const name of ['position','normal','uv','color'])if(!object.geometry.getAttribute(name))throw Error('Missing drone attribute: '+name);
      for(const attribute of Object.values(object.geometry.attributes) as (THREE.BufferAttribute|THREE.InterleavedBufferAttribute)[]){
        if(attribute instanceof THREE.InterleavedBufferAttribute||!attribute.array.every(Number.isFinite))throw Error('Invalid drone geometry.');
      }
      if(owner!=='Frame'){
        if(rotors.has(owner)||finish!=='Alloy')throw Error('Unexpected drone rotor: '+object.name);
        rotors.add(owner);
      }
    });
    if(rotors.size!==4)throw Error('The maintenance drone needs four independent rotors.');
    return scene;
  }catch(error){disposeSource(scene,true);throw error;}
}

async function loadModel(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(MAINTENANCE_DRONE_MODEL_URL,{signal});
  if(!response.ok)throw Error(`Could not load maintenance drone: HTTP ${response.status}.`);
  return parseMaintenanceDroneModel(await readGzipResponse(response,signal));
}

/** Geometry/material owner. The bay retains ownership of shared wear textures;
 * the vehicle controller retains collision, mount anchors and flight authority. */
export class MaintenanceDroneModel{
  readonly root=new THREE.Group();
  readonly rotors:THREE.Mesh[]=[];
  readonly lamps:THREE.MeshStandardMaterial[]=[];
  readonly diagnostics={ready:false,meshes:0,triangles:0,newTextures:0,newLights:0};
  private readonly abort=new AbortController();
  private readonly materials=new Map<Finish,THREE.MeshStandardMaterial>();
  private readonly kit?:BlackoutMaintenanceMaterials;
  private source:THREE.Group|undefined;
  private preparation:Promise<void>|undefined;
  private disposed=false;

  constructor(kit?:BlackoutMaintenanceMaterials){
    this.kit=kit;
    this.root.name='maintenance-drone-authored-model';
    this.root.userData.visualOnly=true;
    this.root.userData.staticBatchExcluded=true;
  }

  prepare(loader:MaintenanceDroneModelLoader=loadModel):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeSource(source,true);return;}
      this.source=source;
      const replaced=new Set<THREE.Material>();
      source.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        for(const material of [object.material].flat())replaced.add(material);
        const finish=object.userData.finish as Finish;
        object.material=this.finish(finish);
        // The optical window sits below the real spotlight. It must transmit
        // its shadow rays, rather than blacking out the entire landing pool.
        object.castShadow=finish!=='Lens'&&!finish.startsWith('Lamp');
        object.receiveShadow=true;object.userData.visualOnly=true;
        if(object.userData.owner!=='Frame')this.rotors[Number(object.userData.owner.slice(-1))]=object;
        else{object.updateMatrix();object.matrixAutoUpdate=false;}
        this.diagnostics.meshes++;
        this.diagnostics.triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
      });
      for(const material of replaced)material.dispose();
      this.lamps.push(this.finish('LampA'),this.finish('LampB'));
      this.root.add(source);this.diagnostics.ready=true;
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  private finish(name:Finish):THREE.MeshStandardMaterial{
    const old=this.materials.get(name);if(old)return old;
    const base=this.kit?.get(name==='Paint'?'dronePaint':'machineryMetal');
    const material=base?.clone()??new THREE.MeshStandardMaterial();
    material.name='maintenance-drone-'+name;
    material.vertexColors=true;material.map=null;
    const colors={Paint:0xcda239,Graphite:0x283333,Alloy:0x9aafab,Rubber:0x1b231d,
      Copper:0xa9793d,Mark:0xdbe2c6,LampA:0xffc42e,LampB:0xffc42e,Lens:0x627d71};
    material.color.setHex(colors[name]);material.emissive.setHex(0);material.emissiveIntensity=0;
    material.roughness=name==='Rubber'?.94:name==='Lens'?.23:name==='Alloy'?.49:.76;
    material.metalness=name==='Alloy'?.72:name==='Copper'?.64:name==='Graphite'?.45:name==='Paint'?.28:.04;
    if(name==='Lens'||name.startsWith('Lamp')){
      material.normalMap=null;material.roughnessMap=null;
      if(name.startsWith('Lamp')){material.emissive.setHex(0xffc42e);material.emissiveIntensity=.16;}
    }
    this.materials.set(name,material);return material;
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    if(this.source)disposeSource(this.source,false);
    for(const material of this.materials.values())material.dispose();
    this.materials.clear();this.rotors.length=0;this.lamps.length=0;
    this.root.removeFromParent();this.root.clear();this.source=undefined;this.diagnostics.ready=false;
  }
}

function disposeSource(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of [object.material].flat())owned.add(material);}});
  for(const geometry of geometries)geometry.dispose();
  if(materials)for(const material of owned)material.dispose();
  root.removeFromParent();root.clear();
}
