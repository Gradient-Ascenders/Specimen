import * as THREE from 'three';
import { readGzipResponse } from '../ReadGzipResponse.ts';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ElevatorSequence} from '../../../puzzle/ElevatorSequence.ts';
import type {LaserHazard} from '../../../hazards/LaserHazard.ts';
import type {ElevatorPresentation} from '../../elevator/ElevatorPresentation.ts';
import type {AuthoredLaserEmitter,LaserHazardPresentation} from '../../hazards/LaserHazardPresentation.ts';

const PARTS=['Architecture','Car','Counterweight','Wheel','Motor','DoorLeft','DoorRight','ExitArrow','Segment','Cable'] as const;
export const ROOM_FOUR_SHELL_URL=new URL('../../../assets/delivery/room-four.bin',import.meta.url).href;
export type RoomFourShellLoader=(signal:AbortSignal)=>Promise<THREE.Group>;

export async function parseRoomFourShell(bytes:ArrayBuffer):Promise<THREE.Group>{
  const {scene}=await new GLTFLoader().parseAsync(bytes,'');
  if(PARTS.some(part=>scene.getObjectByName(`R4_${part}`)?.userData.asset!=='containment-room-four-v1')){
    disposeGeometry(scene,true);throw new Error('Unexpected Room 4 lift asset.');
  }
  return scene;
}
async function loadShell(signal:AbortSignal):Promise<THREE.Group>{
  const response=await fetch(ROOM_FOUR_SHELL_URL,{signal});
  if(!response.ok)throw new Error('Could not load Room 4 lift art.');
  return parseRoomFourShell(await readGzipResponse(response,signal));
}

/** Presentation consumes the real lift and laser state. No new colliders,
 * timers, lights or texture bank; Room 1 and Room 3 retain borrowed resources. */
export class RoomFourShell {
  readonly root=new THREE.Group();
  readonly carRoot=new THREE.Group();
  private readonly abort=new AbortController();
  private preparation:Promise<void>|undefined;
  private source:THREE.Group|undefined;
  private wear:THREE.MeshStandardMaterial|undefined;
  private counterweight:THREE.Object3D|undefined;
  private motor:THREE.Object3D|undefined;
  private doorLeft:THREE.Object3D|undefined;
  private doorRight:THREE.Object3D|undefined;
  private arrow:THREE.Object3D|undefined;
  private readonly wheels:THREE.Object3D[]=[];
  private readonly cables:THREE.Mesh[]=[];
  private digits:THREE.InstancedMesh|undefined;
  private lastHeight=-1;
  private height=0;
  private doorOpen=0;
  private chargeGeometry:THREE.RingGeometry|undefined;
  private readonly charges:{hazard:LaserHazard;mesh:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>}[]=[];
  private detachEmitter:(()=>void)|undefined;
  private detachCar:(()=>void)|undefined;
  private disposed=false;
  private readonly motionPreference=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):undefined;

  constructor(){
    this.root.name='room-4-authored-shaft';this.carRoot.name='room-4-authored-lift-car';
    for(const root of [this.root,this.carRoot]){
      root.userData.visualOnly=true;root.userData.staticBatchExcluded=true;
    }
  }

  prepare(borrowFinish:(name:string)=>THREE.Material,loader:RoomFourShellLoader=loadShell):Promise<void>{
    if(this.disposed)return Promise.resolve();
    return this.preparation??=loader(this.abort.signal).then(source=>{
      if(this.disposed){disposeGeometry(source,true);return;}
      const mapped=new Map<THREE.Mesh,THREE.Material>(),old=new Set<THREE.Material>();
      try{
        source.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const match=/^R4_Batch_(\w+)_(\w+)$/.exec(object.name);
          if(!match)throw new Error(`Unexpected Room 4 finish batch: ${object.name}.`);
          const finish=match[2];
          if(finish==='Worn'&&!this.wear){
            this.wear=(borrowFinish('Cool') as THREE.MeshStandardMaterial).clone();
            this.wear.name='room-4-contact-wear';this.wear.vertexColors=true;
            this.wear.color.setRGB(1,1,1);this.wear.roughness=.87;this.wear.metalness=.15;
          }
          mapped.set(object,finish==='Worn'?this.wear!:borrowFinish(finish));
          for(const material of Array.isArray(object.material)?object.material:[object.material])old.add(material);
        });
      }catch(error){disposeGeometry(source,true);this.wear?.dispose();this.wear=undefined;throw error;}
      for(const [object,material] of mapped){
        object.material=material;object.castShadow=object.name.startsWith('R4_Batch_Car_');
        object.receiveShadow=!/_(Wheel|Cable|Segment)_/.test(object.name)&&material instanceof THREE.MeshStandardMaterial&&!material.transparent;
        object.userData.visualOnly=true;
        if(object.name.startsWith('R4_Batch_Architecture_'))object.userData.staticBatchSourceNames=[object.name];
        object.updateMatrix();object.matrixAutoUpdate=false;
      }
      for(const material of old)material.dispose();
      this.source=source;
      this.root.add(source.getObjectByName('R4_Architecture')!);
      this.carRoot.add(source.getObjectByName('R4_Car')!);
      this.motor=source.getObjectByName('R4_Motor')!;this.carRoot.add(this.motor);
      this.counterweight=source.getObjectByName('R4_Counterweight')!;
      this.doorLeft=source.getObjectByName('R4_DoorLeft')!;this.doorRight=source.getObjectByName('R4_DoorRight')!;
      this.arrow=source.getObjectByName('R4_ExitArrow')!;
      this.root.add(this.counterweight,this.doorLeft,this.doorRight,this.arrow);
      const wheel=source.getObjectByName('R4_Wheel')!;
      for(const z of [-2.25,2.25]){
        const model=wheel.clone(true);model.name=`room-4-guide-wheel-${z}`;
        model.position.set(-5.76,-.78,z);this.carRoot.add(model);this.wheels.push(model);
      }
      const cable=source.getObjectByName('R4_Cable')!.children[0] as THREE.Mesh;
      for(let index=0;index<3;index++){
        const model=cable.clone(false);model.name=`room-4-lift-cable-${index}`;model.matrixAutoUpdate=true;
        this.root.add(model);this.cables.push(model);
      }
      const segment=source.getObjectByName('R4_Segment')!.children[0] as THREE.Mesh;
      this.digits=new THREE.InstancedMesh(segment.geometry,segment.material,14);
      this.digits.name='room-4-lift-height-display';this.digits.frustumCulled=false;
      this.digits.userData.visualOnly=true;this.carRoot.add(this.digits);
      this.root.updateWorldMatrix(true,true);this.carRoot.updateWorldMatrix(true,true);
    }).catch(error=>{this.preparation=undefined;if(!this.disposed)throw error;});
  }

  attachPresentation(presentation:ElevatorPresentation):void{
    if(this.source&&!this.detachCar&&!this.disposed)this.detachCar=presentation.activateAuthoredCar();
  }

  attachLasers(presentation:LaserHazardPresentation,kit:AuthoredLaserEmitter,hazards:readonly LaserHazard[]):void{
    if(!this.source||this.detachEmitter||this.disposed)return;
    this.detachEmitter=presentation.attachEmitterModel(kit);
    this.chargeGeometry=new THREE.RingGeometry(.115,.185,24);
    this.chargeGeometry.rotateX(-Math.PI/2);
    for(const hazard of hazards){
      const material=new THREE.MeshBasicMaterial({name:'room-4-laser-charge',color:0xffbf4d,
        transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(this.chargeGeometry,material);
      mesh.name=`${hazard.id}-charge-ring`;mesh.position.y=.006;mesh.userData.visualOnly=true;
      presentation.root.getObjectByName(`${hazard.id}-presentation-emitter-start`)!.add(mesh);
      this.charges.push({hazard,mesh});
    }
  }

  sync(sequence:ElevatorSequence,reducedMotion=this.motionPreference?.matches??false):void{
    if(!this.source||this.disposed)return;
    const progress=sequence.ascentProgress,distance=45*progress;
    this.height=distance;
    this.counterweight!.position.set(1.9,75-distance,89.2);
    for(const wheel of this.wheels)wheel.rotation.z=-distance/.18;
    this.motor!.position.x=!reducedMotion&&sequence.state==='ascending'?Math.sin(distance*80)*.0025:0;
    const starts=[sequence.platform.position.y-.58,sequence.platform.position.y-.58,76.4-distance];
    for(const [index,cable] of this.cables.entries()){
      const start=starts[index],end=77.4;
      cable.position.set(index===2?1.9:3.21,(start+end)/2,index===2?89.2:index===0?83.25:87.75);
      cable.scale.set(1,Math.max(.001,end-start),1);
    }
    this.doorOpen=sequence.state==='exitReady'?1:sequence.state==='arrivalPause'
      ?THREE.MathUtils.smoothstep(sequence.stateElapsedSeconds/sequence.arrivalDelaySeconds,0,1):0;
    this.doorLeft!.position.x=-1.35*this.doorOpen;this.doorRight!.position.x=1.35*this.doorOpen;
    this.arrow!.visible=sequence.state==='exitReady';
    this.updateDigits(Math.round(distance));
    for(const {hazard,mesh} of this.charges){
      const lead=hazard.secondsUntilEnabled;
      const charge=sequence.state==='ascending'&&!hazard.enabled&&lead!==undefined?THREE.MathUtils.clamp(1-lead/.45,0,1):0;
      mesh.visible=charge>0;mesh.material.opacity=.75*charge;mesh.scale.setScalar(.75+.25*charge);
    }
  }

  private updateDigits(height:number):void{
    if(!this.digits||height===this.lastHeight)return;
    this.lastHeight=height;
    const text=Math.max(0,Math.min(99,height)).toString().padStart(2,'0');
    const glyphs=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
    const bars=[[0,-.22,.24,.035],[.145,-.115,.035,.17],[.145,.115,.035,.17],
      [0,.22,.24,.035],[-.145,.115,.035,.17],[-.145,-.115,.035,.17],[0,0,.24,.035]];
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
    for(let digit=0;digit<2;digit++)for(let segment=0;segment<7;segment++){
      const [x,z,w,d]=bars[segment];
      position.set((digit===0?-.22:.22)+x,.272,-3.45+z);
      scale.set(w,.012,d);if(!glyphs[Number(text[digit])].includes('abcdefg'[segment]))scale.setScalar(0);
      matrix.compose(position,rotation,scale);this.digits.setMatrixAt(digit*7+segment,matrix);
    }
    this.digits.instanceMatrix.needsUpdate=true;
  }

  get ready():boolean{return !!this.source;}
  get renderMeshes():readonly THREE.Mesh[]{
    const meshes:THREE.Mesh[]=[],geometry=new Set<THREE.BufferGeometry>();
    for(const root of [this.root,this.carRoot])root.traverse(object=>{
      if(object instanceof THREE.Mesh&&!object.userData.lightingOnly&&!geometry.has(object.geometry)){geometry.add(object.geometry);meshes.push(object);}
    });
    if(this.charges[0])meshes.push(this.charges[0].mesh);
    return meshes;
  }
  get diagnostics(){return {ready:this.ready,meshes:this.renderMeshes.length,
    triangles:this.renderMeshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3,0),
    textureCount:0,heightMetres:this.height,displayMetres:this.lastHeight,doorOpen:this.doorOpen,
    lasersAttached:!!this.detachEmitter,ownedMaterials:(this.wear?1:0)+this.charges.length,disposed:this.disposed};}

  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();
    for(const {mesh} of this.charges){mesh.removeFromParent();mesh.material.dispose();}
    this.charges.length=0;this.chargeGeometry?.dispose();this.chargeGeometry=undefined;
    this.detachEmitter?.();this.detachEmitter=undefined;this.detachCar?.();this.detachCar=undefined;
    this.digits?.dispose();this.digits=undefined;
    if(this.source){
      this.source.add(...this.root.children,...this.carRoot.children);disposeGeometry(this.source,false);
    }
    this.source=undefined;this.wear?.dispose();this.wear=undefined;
    this.wheels.length=0;this.cables.length=0;
    this.root.clear();this.carRoot.clear();this.carRoot.removeFromParent();this.root.removeFromParent();
  }
}

function disposeGeometry(root:THREE.Object3D,materials:boolean):void{
  const geometry=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.lightingOnly){geometry.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])owned.add(material);}});
  for(const item of geometry)item.dispose();
  if(materials)for(const item of owned)item.dispose();
  root.removeFromParent();root.clear();
}
