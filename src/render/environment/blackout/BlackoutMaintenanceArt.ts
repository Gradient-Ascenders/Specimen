import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readGzipResponse} from '../ReadGzipResponse.ts';
import type {BlackoutMaintenanceMaterials} from './BlackoutMaintenanceMaterials.ts';
import {WorldAudioSource} from '../../../audio/WorldAudio.ts';

export const BLACKOUT_MAINTENANCE_ART_URL=new URL('../../../assets/blackout/maintenance-art.bin',import.meta.url).href;
export type BlackoutMaintenanceArtLoader=(signal:AbortSignal)=>Promise<THREE.Group>;
const FINISHES=['Paint','Deck','Steel','Dark','Amber','Copper','Lamp','Letter','Damp','ColdLamp'] as const;
type Finish=typeof FINISHES[number];
const REGIONS=new Set(['Shell','West','East','Roof','Entry','Exit','Pad1','Pad2','Pad3','Dock','Cameras','Door',
  'HallA','HallB','VentFlat','VentTurn','VentRise','VentFan']);
const RETIRED=new Set(['front-perimeter-wall','front-perimeter-wall-east','entry-vent-wall-below','entry-vent-wall-above',
  'west-perimeter-wall','east-perimeter-wall','rear-wall-west','rear-wall-between-openings','rear-wall-east',
  'door-header','vent-mouth-upper-wall','main-ceiling','entry-safe-platform','exit-safe-platform',
  'entry-apron-riser-west','entry-apron-riser-east','bob-route-platform-17','bob-route-platform-28.5','bob-route-platform-40']);

export async function parseBlackoutMaintenanceArt(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  try{
    if(scene.getObjectByName('B3_R1_Architecture')?.userData.asset!=='blackout-maintenance-v1')throw Error('Unexpected maintenance art version.');
    const regions=new Set<string>();
    scene.traverse(object=>{
      if(object instanceof THREE.Camera||object instanceof THREE.Light)throw Error('Maintenance art must not export preview lights/cameras.');
      if(!(object instanceof THREE.Mesh))return;
      if(!object.name.startsWith('B3_R1_Batch_')||!REGIONS.has(object.userData.region)||!FINISHES.includes(object.userData.finish))
        throw Error('Unexpected maintenance art batch: '+object.name);
      regions.add(object.userData.region);
      for(const name of ['position','normal','uv'])if(!object.geometry.getAttribute(name))throw Error('Missing maintenance attribute: '+name);
      for(const attribute of Object.values(object.geometry.attributes) as (THREE.BufferAttribute|THREE.InterleavedBufferAttribute)[]){
        if(attribute instanceof THREE.InterleavedBufferAttribute||!attribute.array.every(Number.isFinite))throw Error('Invalid maintenance geometry.');
      }
    });
    for(const region of REGIONS)if(region!=='Shell'&&!regions.has(region))throw Error('Missing maintenance art region: '+region);
    return scene;
  }catch(error){disposeSource(scene,true);throw error;}
}

async function loadArt(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(BLACKOUT_MAINTENANCE_ART_URL,{signal});
  if(!response.ok)throw Error(`Could not load maintenance art: HTTP ${response.status}.`);
  return parseBlackoutMaintenanceArt(await readGzipResponse(response,signal));
}

/** Room 1 owns these geometry buffers and material copies. Texture maps remain
 * borrowed from the existing maintenance kit, including the reused cameras. */
export class BlackoutMaintenanceArt{
  readonly root=new THREE.Group();
  private readonly abort=new AbortController();
  private readonly materials=new Map<Finish,THREE.MeshStandardMaterial|THREE.MeshBasicMaterial>();
  private readonly edgeMaterial:THREE.MeshStandardMaterial;
  private readonly bindings:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[];
  private readonly hidden=new THREE.MeshStandardMaterial({visible:false});
  private readonly doorMeshes:THREE.Mesh[]=[];
  private readonly fan=new THREE.Group();
  private readonly fanMeshes:THREE.Mesh[]=[];
  private readonly fanAudio:WorldAudioSource;
  private elapsed=0;
  private source:THREE.Group|undefined;
  private doorOwner:THREE.Mesh|undefined;
  private preparation:Promise<void>|undefined;
  private disposed=false;
  private readonly kit:BlackoutMaintenanceMaterials;
  readonly diagnostics={ready:false,meshes:0,triangles:0,retiredMeshes:0,newTextures:0,newLights:0};

  constructor(kit:BlackoutMaintenanceMaterials){
    this.kit=kit;
    this.root.name='blackout-maintenance-authored-art';
    this.root.userData.visualOnly=true;
    this.root.userData.staticBatchExcluded=true;
    this.fan.name='blackout-connector-fan';this.fan.position.set(-17.15,1.15,61.5);this.root.add(this.fan);
    this.fanAudio=new WorldAudioSource({root:this.fan,kind:'machinery',progress:()=>this.fan.rotation.x,
      enabled:()=>this.diagnostics.ready,volumeScale:()=>.025,playbackRate:()=>.68});
    // Allocate enclosure finishes before actors for early opaque depth rejection.
    for(const finish of FINISHES)this.finish(finish);
    this.edgeMaterial=kit.get('machineryMetal').clone();
    this.edgeMaterial.name='blackout-maintenance-structural-trim';this.edgeMaterial.map=null;
    this.edgeMaterial.color.setHex(0x45575a);this.edgeMaterial.vertexColors=true;
    this.edgeMaterial.roughness=.9;this.edgeMaterial.metalness=.18;
  }

  prepare(bay:THREE.Group,door:THREE.Mesh,beforeAdoption:()=>void,afterAdoption:()=>void,
    loader:BlackoutMaintenanceArtLoader=loadArt):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeSource(source,true);return;}
      this.source=source;
      this.doorOwner=door;
      beforeAdoption();
      try{
        bay.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const name=object.name.replace(/-surface-skin$/,'');
          if(RETIRED.has(name)||/^(entry|exit)-warning-/.test(name)||
            /^(hallway-(floor|ramp|west-wall|east-wall|roof)$|vent-(interior-floor|duct-|turn-|frame-)|volt-rising-duct-|volt-catwalk-entry-extension$)/.test(name)||object===door||
            object.userData.blastDoorId==='maintenance-bay-exit'&&object.userData.authoringRole==='vertical-blast-door-frame'){
            this.bindings.push({mesh:object,material:object.material});object.material=this.hidden;
          }
        });
        const replaced=new Set<THREE.Material>();
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const old=[object.material].flat();
          object.material=object.userData.finish==='Dark'&&/^(Pad|Door|Dock|Vent)/.test(object.userData.region)?this.edgeMaterial:this.finish(object.userData.finish);
          for(const material of old)replaced.add(material);
          object.castShadow=object.userData.region==='Door'||/^Pad|^Hall/.test(object.userData.region);
          object.receiveShadow=true;object.userData.visualOnly=true;
          object.userData.staticBatchSourceNames=[object.name];
          object.updateMatrix();object.matrixAutoUpdate=false;
          if(object.userData.region==='Door')this.doorMeshes.push(object);
          if(object.userData.region==='VentFan')this.fanMeshes.push(object);
          this.diagnostics.meshes++;
          this.diagnostics.triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
        });
        for(const material of replaced)material.dispose();
        for(const mesh of this.doorMeshes){
          // Authored closed-pose coordinates become local to the real panel.
          // The controller continues to own interpolation, obstruction and reset.
          mesh.geometry.translate(-6,-2.25,-54);mesh.removeFromParent();door.add(mesh);
        }
        for(const mesh of this.fanMeshes){mesh.geometry.translate(17.15,-1.15,-61.5);mesh.removeFromParent();this.fan.add(mesh);}
        this.root.add(source);bay.add(this.root);
        this.diagnostics.retiredMeshes=this.bindings.length;
        this.diagnostics.ready=true;
      }finally{afterAdoption();}
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  update(deltaSeconds:number,powered:boolean):void{
    this.elapsed+=Math.max(0,deltaSeconds);
    this.fan.rotation.x-=Math.max(0,deltaSeconds)*(.55+.04*Math.sin(this.elapsed*.7));
    const lamp=this.materials.get('Lamp');
    if(lamp instanceof THREE.MeshStandardMaterial)lamp.emissiveIntensity=THREE.MathUtils.damp(lamp.emissiveIntensity,powered?1.05:.08,5,Math.max(0,deltaSeconds));
  }

  resetConnector():void {this.elapsed=0;this.fan.rotation.x=0;this.fanAudio.reset();}

  /** The controller must detach borrowed art before its recursive door disposal. */
  detachDoor():void{
    for(const mesh of this.doorMeshes)mesh.removeFromParent();
    for(let i=this.bindings.length-1;i>=0;i--){
      const binding=this.bindings[i];
      if(binding.mesh===this.doorOwner||binding.mesh.userData.blastDoorId==='maintenance-bay-exit'){
        binding.mesh.material=binding.material;this.bindings.splice(i,1);
      }
    }
    this.doorOwner=undefined;
  }

  private finish(name:Finish):THREE.MeshStandardMaterial|THREE.MeshBasicMaterial{
    const old=this.materials.get(name);if(old)return old;
    if(name==='Dark'){
      // Recessed structural voids stay black in the blackout. Avoid evaluating
      // the level's full light/shadow layout on these background pixels.
      const material=new THREE.MeshBasicMaterial({name:'blackout-authored-dark',vertexColors:true});
      material.color.setHex(0x000000);
      this.materials.set(name,material);return material;
    }
    const families={Paint:'wallPanel',Deck:'floorDeck',Steel:'machineryMetal',Dark:'basinMetal',
      Amber:'warningPaint',Copper:'machineryMetal',Lamp:'machineryMetal',Letter:'wallPanel',Damp:'machineryMetal',ColdLamp:'machineryMetal'} as const;
    const material=this.kit.get(families[name]).clone();
    material.name='blackout-authored-'+name.toLowerCase();material.vertexColors=true;
    // Existing metric surface maps supply fine wear. Tints distinguish utility
    // panels and keep landing tops legible under the maintenance searchlight.
    const colors={Paint:0xc3cbc6,Deck:0x9eafaa,Steel:0x658781,Dark:0x263331,
      Amber:0xe1be68,Copper:0xaa7950,Lamp:0xffcf85,Letter:0xe0e9df,Damp:0x56635b,ColdLamp:0x608b93};
    material.color.setHex(colors[name]);material.roughness=Math.max(.78,material.roughness);
    // Fine roughness/normal maps are shared with the old kit; vertex wear and
    // neutral base tints replace its very dark albedo on the new architecture.
    // Navigation must depend on Volt and the maintenance searchlight: solid
    // architecture and landing tops never provide their own illumination.
    material.map=null;
    material.emissive.setHex(0x000000);material.emissiveIntensity=0;
    if(name==='Paint')material.metalness=.12;
    if(name==='Damp'){material.roughness=.28;material.metalness=.12;}
    if(name==='ColdLamp'){
      material.normalMap=null;material.roughnessMap=null;material.emissive.setHex(0x3b6670);material.emissiveIntensity=.06;
    }
    if(name==='Lamp'){
      material.map=null;material.normalMap=null;material.roughnessMap=null;
      material.emissive.setHex(0xffca78);material.emissiveIntensity=.08;material.metalness=0;
    }
    this.materials.set(name,material);return material;
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    this.detachDoor();this.fanAudio.dispose();
    for(const {mesh,material}of this.bindings)mesh.material=material;
    this.bindings.length=0;
    if(this.source){for(const mesh of [...this.doorMeshes,...this.fanMeshes])this.source.add(mesh);disposeSource(this.source,false);}
    this.fanMeshes.length=0;
    this.source=undefined;this.doorMeshes.length=0;
    for(const material of this.materials.values())material.dispose();this.edgeMaterial.dispose();
    this.materials.clear();this.hidden.dispose();this.root.removeFromParent();this.root.clear();
    this.diagnostics.ready=false;
  }
}

function disposeSource(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of [object.material].flat())owned.add(material);}});
  for(const geometry of geometries)geometry.dispose();
  if(materials)for(const material of owned)material.dispose();
  root.removeFromParent();root.clear();
}
