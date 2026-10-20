import * as THREE from 'three';
import type { GreyboxDropPreview } from '../../../levels/GreyboxDropPreview.ts';
import type { AcidSurfaceMaterial } from '../containment/AcidSurfaceMaterial.ts';
import { gameplayAudioEvents } from '../../../audio/GameplayAudioEvents.ts';

export const CULTIVATION_PLATFORM_SPLASH_SECONDS=1.65;
export const CULTIVATION_PLATFORM_SPLASH_INSTANCES=36;
const UP=new THREE.Vector3(0,1,0);

/** Three fixed slots: displaced edge crowns, ballistic drops, and the existing acid ripple shader. */
export class CultivationPlatformSplashes {
  readonly root=new THREE.Group();
  readonly mesh:THREE.InstancedMesh;
  readonly crowns:THREE.InstancedMesh;
  private readonly geometry=new THREE.SphereGeometry(1,8,6);
  private readonly crownGeometry=createSplashCrownGeometry();
  private readonly material=new THREE.MeshStandardMaterial({name:'cultivation-platform-acid-splash',
    color:0x91ad3b,emissive:0x253107,emissiveIntensity:.22,roughness:.28,metalness:0});
  private readonly crownMaterial=this.material.clone();
  private readonly slots;
  private readonly position=new THREE.Vector3();
  private readonly worldPosition=new THREE.Vector3();
  private readonly scale=new THREE.Vector3();
  private readonly direction=new THREE.Vector3();
  private readonly rotation=new THREE.Quaternion();
  private readonly matrix=new THREE.Matrix4();
  private readonly colour=new THREE.Color();
  private readonly surfaceY:number;
  private disposed=false;
  private impacts=0;
  private readonly acid:AcidSurfaceMaterial;

  constructor(drops:readonly GreyboxDropPreview[],acid:AcidSurfaceMaterial,surface:THREE.Mesh){
    this.acid=acid;
    this.root.name='cultivation-room-1-platform-acid-splashes';this.root.userData.presentationOwnedBy=this.root.name;
    surface.geometry.computeBoundingBox();this.surfaceY=surface.position.y+surface.geometry.boundingBox!.max.y;
    this.slots=drops.map(drop=>({drop,previous:drop.state,age:Infinity,x:0,z:0}));
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,drops.length*CULTIVATION_PLATFORM_SPLASH_INSTANCES);
    this.mesh.name='cultivation-room-1-pooled-acid-splashes';this.mesh.frustumCulled=false;
    this.mesh.userData.visualOnly=true;this.mesh.userData.prewarmInstanceCount=1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix.makeTranslation(0,-1000,0);
    for(let i=0;i<this.mesh.count;i++){this.mesh.setMatrixAt(i,this.matrix);this.mesh.setColorAt(i,this.colour.setHex(0xffffff));}
    this.mesh.count=0;this.root.add(this.mesh);
    this.crownMaterial.side=THREE.DoubleSide;this.crownMaterial.forceSinglePass=true;
    this.crowns=new THREE.InstancedMesh(this.crownGeometry,this.crownMaterial,drops.length*12);
    this.crowns.name='cultivation-room-1-pooled-acid-crowns';this.crowns.frustumCulled=false;
    this.crowns.userData.visualOnly=true;this.crowns.userData.prewarmInstanceCount=1;
    this.crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for(let i=0;i<this.crowns.count;i++)this.crowns.setMatrixAt(i,this.matrix);
    this.crowns.count=0;this.root.add(this.crowns);
  }
  get active():boolean{return this.slots.some(slot=>slot.age<CULTIVATION_PLATFORM_SPLASH_SECONDS);}
  get impactCount():number{return this.impacts;}

  update(dt:number,rendered=true):void{
    if(this.disposed)return;
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid splash timestep.');
    for(const slot of this.slots){
      slot.age+=dt;
      if(slot.previous!=='landed'&&slot.drop.state==='landed'){
        slot.age=0;slot.x=slot.drop.mesh.position.x;slot.z=slot.drop.mesh.position.z;this.impacts++;
        // A falling slab displaces liquid around its perimeter, not underneath
        // its now-solid top. Use the existing fixed ripple budget.
        for(const [x,z]of [[-2.6,0],[2.6,0],[0,-2.6],[0,2.6]]){
          this.root.localToWorld(this.worldPosition.set(slot.x+x,this.surfaceY,slot.z+z));
          this.acid.disturb(this.worldPosition.x,this.worldPosition.z,this.worldPosition.y,1.7);
        }
        this.root.localToWorld(this.worldPosition.set(slot.x,this.surfaceY,slot.z));
        gameplayAudioEvents.emit('cue',{sound:'goop-projectile-impact-01',position:this.worldPosition,maxDistance:28,volumeScale:.65});
      }
      slot.previous=slot.drop.state;
    }
    if(!rendered||!this.active){this.mesh.count=this.crowns.count=0;return;}
    let count=0,crownCount=0;
    for(const slot of this.slots){
      const age=slot.age;if(age>=CULTIVATION_PLATFORM_SPLASH_SECONDS)continue;
      for(let i=0;i<12;i++){
        const side=Math.floor(i/3),across=(i%3-1)*1.65;
        const nx=side===0?-1:side===1?1:0,nz=side===2?-1:side===3?1:0;
        const x=slot.x+(nx?nx*2.64:across),z=slot.z+(nz?nz*2.64:across);
        const phase=Math.min(1,age/.65),height=Math.sin(phase*Math.PI)*(.85+(i%3)*.23);
        if(phase>=1)continue;
        // Broad, ruffled sheets curl outward from the submerged platform edge.
        // Their fixed mesh has a wavy crest; only its instance transform moves.
        this.position.set(x+nx*age*.25,this.surfaceY+.012,z+nz*age*.25);
        this.scale.set(1.15+(i%3)*.12,Math.max(.02,height),Math.max(.04,height));
        this.rotation.setFromAxisAngle(UP,Math.atan2(nx,nz));
        this.matrix.compose(this.position,this.rotation,this.scale);this.crowns.setMatrixAt(crownCount++,this.matrix);
      }
      for(let i=0;i<24;i++){
        const angle=i*2.399,nx=Math.cos(angle),nz=Math.sin(angle),vy=4.4+(i%5)*.58,speed=1.2+(i%4)*.65;
        const y=vy*age-4.9*age*age;if(y<-.04)continue;
        const edge=2.68/Math.max(Math.abs(nx),Math.abs(nz));
        this.position.set(slot.x+nx*(edge+speed*age),this.surfaceY+.04+y,slot.z+nz*(edge+speed*age));
        this.direction.set(nx*speed,vy-9.8*age,nz*speed).normalize();this.rotation.setFromUnitVectors(UP,this.direction);
        const radius=(.065+(i%3)*.028)*(1-Math.min(.9,age/CULTIVATION_PLATFORM_SPLASH_SECONDS));
        this.scale.set(radius,radius*(1.2+Math.min(1,Math.abs(vy-9.8*age)*.12)),radius);
        count=this.write(count,i%3?0xc3d188:0x748b35);
      }
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
    this.crowns.count=crownCount;this.crowns.instanceMatrix.needsUpdate=true;
  }
  reset():void{
    if(this.disposed)return;for(const slot of this.slots){slot.previous=slot.drop.state;slot.age=Infinity;}
    this.mesh.count=this.crowns.count=0;this.impacts=0;
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.root.clear();
    this.mesh.dispose();this.geometry.dispose();this.material.dispose();
    this.crowns.dispose();this.crownGeometry.dispose();this.crownMaterial.dispose();
  }
  private write(index:number,tint:number):number{
    this.matrix.compose(this.position,this.rotation,this.scale);this.mesh.setMatrixAt(index,this.matrix);
    this.mesh.setColorAt(index,this.colour.setHex(tint));return index+1;
  }
}

/** Author once: a thin curved liquid sheet, flaring toward an irregular crest. */
function createSplashCrownGeometry():THREE.BufferGeometry{
  const geometry=new THREE.PlaneGeometry(1,1,8,4),positions=geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),height=positions.getY(i)+.5;
    positions.setXYZ(i,x*(.8+.55*height),height*(.84+.12*Math.cos(x*Math.PI*4)+.045*Math.sin(x*Math.PI*9)),
      (1-Math.cos(height*Math.PI/2))*.6);
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
