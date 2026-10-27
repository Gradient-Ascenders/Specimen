import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readGzipResponse} from '../ReadGzipResponse.ts';
import type {BlackoutMaintenanceMaterials} from './BlackoutMaintenanceMaterials.ts';

export const BLACKOUT_TRANSIT_ART_URL=new URL('../../../assets/blackout/transit-art.bin',import.meta.url).href;
export type BlackoutTransitArtLoader=(signal:AbortSignal)=>Promise<THREE.Group>;
const FINISHES=['Paint','Deck','Alloy','Graphite','Amber','Copper','Letter','Window'] as const;
type Finish=typeof FINISHES[number];
export const BLACKOUT_TRANSIT_ART_DEVICES=['LiftA','LiftB','Bridge','BankA','BankB','BankC','BankD'] as const;
export type BlackoutTransitArtDevice=typeof BLACKOUT_TRANSIT_ART_DEVICES[number];
type Device=BlackoutTransitArtDevice;
const REGIONS=new Set(['West0','West1','West2','East0','East1','East2','Roof0','Roof1','Roof2',
  'Entry','Exit','Hall0','Hall1','Bob0','Bob1','Bob2','Volt',...BLACKOUT_TRANSIT_ART_DEVICES]);
const RETIRED=new Set(['transit-west-wall','transit-east-wall','transit-ceiling','transit-entry-platform',
  'transit-volt-entry-under-wall','transit-main-entry-header','transit-volt-entry-header',
  'transit-main-entry-lintel','volt-service-catwalk','bob-bridge-switch-wall-frame','bob-bridge-switch-wall-top-rail',
  'bob-bridge-pressure-button-bezel','transit-bridge-end-anchor','transit-bridge-end-marking',
  'transit-room-3-exit-deck','transit-exit-left-apron','goop-acid-exit-ramp','transit-exit-hallway-floor',
  'transit-exit-half-raised-door','transit-exit-door-prop-crate','transit-exit-door-lintel','transit-main-power-trunk']);
function retireStatic(name:string):boolean{
  return RETIRED.has(name)||/^(transit-(basin-(side|end)-skirt-|entry-wall-|exit-wall-|main-entry-jamb-|ceiling-beam-|[we][a-z]+-service-conduit-|gallery-panel-|exit-crate-|exit-door-(jamb-|guide-|shutter-rib-|caution-)|exit-hallway-wall-|room-3-exit-deck-warning-)|bob-route-|bob-bridge-switch-approach|volt-catwalk-(bracket-|caution-)|transit-lift-[ab]-(shaft-|level-indicator|yellow-caution-mark))/.test(name)||
    /^bob-sticky-climb-[ab]-edge-trim$/.test(name)||/^volt-catwalk-(rail|support)-/.test(name)||
    name==='transit-bridge-start-anchor'||name==='transit-bridge-start-marking';
}

export interface BlackoutTransitArtBindings{
  readonly owners:ReadonlyMap<Device,THREE.Object3D>;
  /** Retired render materials only; device colliders and contacts remain live. */
  readonly retiredDevices:readonly THREE.Mesh[];
}

export async function parseBlackoutTransitArt(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  try{
    const root=scene.getObjectByName('B3_R2_Architecture');
    if(root?.userData.asset!=='blackout-transit-v1')throw Error('Unexpected transit art version.');
    const regions=new Set<string>();
    scene.traverse(object=>{
      if(object instanceof THREE.Light||object instanceof THREE.Camera)throw Error('Transit art must exclude studio objects.');
      if(!(object instanceof THREE.Mesh))return;
      if(!root?.children.includes(object)||!object.name.startsWith('B3_R2_Batch_')||
        !REGIONS.has(object.userData.region)||!FINISHES.includes(object.userData.finish))throw Error('Unexpected transit art batch: '+object.name);
      regions.add(object.userData.region);
      for(const name of ['position','normal','uv','color'])if(!object.geometry.getAttribute(name))throw Error('Missing transit attribute: '+name);
      for(const a of Object.values(object.geometry.attributes) as (THREE.BufferAttribute|THREE.InterleavedBufferAttribute)[]){
        if(a instanceof THREE.InterleavedBufferAttribute||!a.array.every(Number.isFinite))throw Error('Invalid transit geometry.');
      }
    });
    for(const region of REGIONS)if(!regions.has(region))throw Error('Missing transit region: '+region);
    return scene;
  }catch(error){disposeSource(scene,true);throw error;}
}

async function loadArt(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(BLACKOUT_TRANSIT_ART_URL,{signal});
  if(!response.ok)throw Error(`Could not load transit art: HTTP ${response.status}.`);
  return parseBlackoutTransitArt(await readGzipResponse(response,signal));
}

/** Presentation owns geometry and material copies; machinery borrows its skins,
 * and the maintenance bay retains ownership of every shared surface map. */
export class BlackoutTransitArt{
  readonly root=new THREE.Group();
  readonly diagnostics={ready:false,meshes:0,triangles:0,deviceMeshes:0,retiredMeshes:0,newTextures:0,newLights:0};
  private readonly abort=new AbortController();
  private readonly materials=new Map<Finish,THREE.Material>();
  private readonly edgeMaterial:THREE.MeshStandardMaterial;
  private readonly hidden=new THREE.MeshStandardMaterial({name:'blackout-transit-retired',visible:false});
  private readonly bindings:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[];device:boolean}[]=[];
  private readonly deviceMeshes:THREE.Mesh[]=[];
  private readonly kit:BlackoutMaintenanceMaterials;
  private source:THREE.Group|undefined;
  private preparation:Promise<void>|undefined;
  private disposed=false;

  constructor(kit:BlackoutMaintenanceMaterials){
    this.kit=kit;this.root.name='blackout-transit-authored-art';
    this.root.userData.visualOnly=true;this.root.userData.staticBatchExcluded=true;
    // Three sorts opaque draws by material ID. Allocate the enclosure finishes
    // before actors, even though geometry arrives asynchronously, so walls can
    // reject obscured actor/effect pixels early without another render pass.
    for(const finish of FINISHES)this.finish(finish);
    this.edgeMaterial=kit.get('machineryMetal').clone();this.edgeMaterial.map=null;
    this.edgeMaterial.name='blackout-transit-structural-trim';this.edgeMaterial.color.setHex(0x425457);
    this.edgeMaterial.vertexColors=true;this.edgeMaterial.roughness=.9;this.edgeMaterial.metalness=.18;
  }

  prepare(room:THREE.Group,devices:BlackoutTransitArtBindings,beforeAdoption:()=>void,afterAdoption:()=>void,
    loader:BlackoutTransitArtLoader=loadArt):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeSource(source,true);return;}
      this.source=source;
      beforeAdoption();
      try{
        const retiredDevices=new Set(devices.retiredDevices);
        const retired=new Set<THREE.Mesh>();
        const retire=(mesh:THREE.Mesh)=>{
          if(retired.has(mesh))return;
          retired.add(mesh);
          this.bindings.push({mesh,material:mesh.material,device:retiredDevices.has(mesh)});
          mesh.material=this.hidden;
        };
        room.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const name=object.name.replace(/-surface-skin$/,'');
          if(retireStatic(name)||retiredDevices.has(object))retire(object);
        });
        // Runtime machinery is a sibling of the room. Explicit device bindings
        // must be retired regardless of their current scene parent.
        for(const mesh of devices.retiredDevices)retire(mesh);
        const replaced=new Set<THREE.Material>(),adoptions:{mesh:THREE.Mesh;owner:THREE.Object3D}[]=[];
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          for(const material of [object.material].flat())replaced.add(material);
          const region=object.userData.region as string;
          object.material=object.userData.finish==='Graphite'&&/^(Bob|Lift|Volt|Bridge|Bank)/.test(region)?this.edgeMaterial:this.finish(object.userData.finish);
          object.castShadow=/^(Bob|Lift)/.test(region)||region==='Bridge';
          object.receiveShadow=true;object.userData.visualOnly=true;
          object.updateMatrix();object.matrixAutoUpdate=false;
          if(BLACKOUT_TRANSIT_ART_DEVICES.includes(region as Device)){
            const owner=devices.owners.get(region as Device);
            if(!owner)throw Error('Missing transit device owner: '+region);
            adoptions.push({mesh:object,owner});this.deviceMeshes.push(object);
          }
          this.diagnostics.meshes++;
          this.diagnostics.triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
        });
        for(const material of replaced)material.dispose();
        for(const {mesh,owner}of adoptions){mesh.removeFromParent();owner.add(mesh);}
        this.root.add(source);room.add(this.root);
        this.diagnostics.deviceMeshes=this.deviceMeshes.length;this.diagnostics.retiredMeshes=this.bindings.length;
        this.diagnostics.ready=true;
      }finally{afterAdoption();}
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  private finish(name:Finish):THREE.Material{
    const old=this.materials.get(name);if(old)return old;
    if(name==='Graphite'){
      const material=new THREE.MeshBasicMaterial({name:'blackout-transit-graphite',color:0x000000,vertexColors:true});
      this.materials.set(name,material);return material;
    }
    const material=this.kit.get(name==='Paint'||name==='Letter'?'wallPanel':name==='Amber'?'warningPaint':'machineryMetal').clone();
    material.name='blackout-transit-'+name.toLowerCase();material.vertexColors=true;material.map=null;
    const colors={Paint:0xb6c2bc,Deck:0x8b9f98,Alloy:0x819c95,Amber:0xd9b05b,Copper:0xa67c50,Letter:0xd8e1d5,Window:0x142322};
    material.color.setHex(colors[name]);material.emissive.setHex(0);material.emissiveIntensity=0;
    material.roughness=name==='Window'?.28:name==='Alloy'?.72:.88;
    material.metalness=name==='Paint'?.12:name==='Letter'?0:name==='Alloy'?.55:.32;
    this.materials.set(name,material);return material;
  }

  /** MovingPlatform recursively releases its children; detach borrowed art first. */
  detachDevices():void{
    if(this.source)for(const mesh of this.deviceMeshes){mesh.removeFromParent();this.source.add(mesh);}
    for(let i=this.bindings.length-1;i>=0;i--){
      const binding=this.bindings[i];
      if(binding.device){binding.mesh.material=binding.material;this.bindings.splice(i,1);}
    }
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();this.detachDevices();
    for(const {mesh,material}of this.bindings)mesh.material=material;
    this.bindings.length=0;
    if(this.source)disposeSource(this.source,false);
    for(const material of this.materials.values())material.dispose();this.edgeMaterial.dispose();
    this.materials.clear();this.hidden.dispose();this.root.removeFromParent();this.root.clear();
    this.source=undefined;this.deviceMeshes.length=0;this.diagnostics.ready=false;
  }
}

function disposeSource(root:THREE.Object3D,materials:boolean):void{
  const geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of [object.material].flat())owned.add(material);}});
  for(const geometry of geometries)geometry.dispose();
  if(materials)for(const material of owned)material.dispose();
  root.removeFromParent();root.clear();
}
