import * as THREE from 'three';
import {CONTAINMENT_LIGHTING_BOXES} from './ContainmentLightingBake.ts';

/** Offline-baked major silhouettes and contact shading. No textures or lights.
 * Each shadow mesh follows the actual authored assembly, including lift doors
 * and hatch pivots. Fine visible geometry never enters these depth passes. */
export class ContainmentLightingArt {
  private readonly shadowMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,shadowSide:THREE.FrontSide});
  private readonly contactMaterial=new THREE.MeshBasicMaterial({color:0x000000,vertexColors:true,transparent:true,depthWrite:false,toneMapped:false});
  private readonly owned:THREE.Mesh[]=[];
  private readonly previousCasters=new Map<THREE.Mesh,boolean>();
  private ready=false;
  private disposed=false;
  readonly movingOwners:{root:THREE.Object3D;localCentre:THREE.Vector3;radius:number}[]=[];

  constructor(){
    this.shadowMaterial.name='containment-simple-shadow-silhouettes';
    this.contactMaterial.name='containment-baked-contact-shading';
  }

  prepare(root:THREE.Object3D):void{
    if(this.ready||this.disposed)return;
    const contacts=new Map<number,{anchor:THREE.Object3D;boxes:readonly (readonly number[])[] }[]>();
    for(const [name,boxes] of Object.entries(CONTAINMENT_LIGHTING_BOXES)){
      const anchor=root.getObjectByName(name);if(!anchor)throw new Error(`Missing authored lighting assembly ${name}.`);
      anchor.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object.userData.lightingOnly)return;
        this.previousCasters.set(object,object.castShadow);object.castShadow=false;
      });
      if(!boxes.length)continue;
      const mesh=new THREE.Mesh(shadowBoxes(boxes),this.shadowMaterial);
      mesh.name=`containment-shadow-${name}`;mesh.castShadow=true;
      mesh.userData.staticBatchSourceNames=[mesh.name];
      this.attach(anchor,mesh);
      if(/R4_Door/.test(name))this.movingOwners.push({root:anchor,
        localCentre:mesh.geometry.boundingSphere!.center.clone(),radius:mesh.geometry.boundingSphere!.radius});
      if(/_Architecture$|^R5_Cell$/.test(name)){
        const room=Number(name[1]);let entries=contacts.get(room);
        if(!entries){entries=[];contacts.set(room,entries);}entries.push({anchor,boxes});
      }
    }
    for(const [room,entries] of contacts){
      // These receivers are real, flat authored floors. Acid and moving decks
      // use their live shadows, rather than a stationary painted footprint.
      const receivers=CONTACT_FLOORS[room]??[];
      const patches:number[][]=[];
      for(const {boxes} of entries)for(const b of boxes){
        if(b[4]<.25||b[3]<.18||b[5]<.18||b[3]>7||b[5]>7)continue;
        for(const [height,minX,maxX,minZ,maxZ] of receivers){
          if(Math.abs(b[1]-b[4]/2-height)>.13||b[0]-b[3]/2<minX||b[0]+b[3]/2>maxX||b[2]-b[5]/2<minZ||b[2]+b[5]/2>maxZ)continue;
          patches.push([b[0],height+.006,b[2],b[3],b[5]]);break;
        }
      }
      if(patches.length){
        const mesh=new THREE.Mesh(contactPatches(patches),this.contactMaterial);
        mesh.name=`containment-room-${room}-baked-contacts`;
        this.attach(entries[0].anchor,mesh);
      }
    }
    this.ready=true;
  }

  private attach(parent:THREE.Object3D,mesh:THREE.Mesh):void{
    mesh.userData.visualOnly=true;mesh.userData.lightingOnly=true;mesh.userData.staticBatchExcluded=true;
    mesh.updateMatrix();mesh.matrixAutoUpdate=false;parent.add(mesh);this.owned.push(mesh);
  }
  get renderMeshes():readonly THREE.Mesh[]{return this.owned;}
  get diagnostics(){return {ready:this.ready,meshes:this.owned.length,shadowMeshes:this.owned.filter(m=>m.castShadow).length,
    shadowTriangles:this.owned.filter(m=>m.castShadow).reduce((s,m)=>s+(m.geometry.index?.count??0)/3,0),
    contactMeshes:this.owned.filter(m=>!m.castShadow).length,textureCount:0};}
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const mesh of this.owned){mesh.removeFromParent();mesh.geometry.dispose();}
    for(const [mesh,cast] of this.previousCasters)mesh.castShadow=cast;
    this.previousCasters.clear();this.owned.length=0;this.movingOwners.length=0;
    this.shadowMaterial.dispose();this.contactMaterial.dispose();
  }
}

// height, receiver bounds X/Z. Coordinates are the authored walking surfaces.
const CONTACT_FLOORS:Readonly<Record<number,readonly (readonly number[])[]>>={
  1:[[0,-6.8,6.8,-5.9,5.9],[1.06,6.9,9.5,-4.38,3.08]],
  2:[[0,-14.8,14.8,27.2,48.8],[6.25,-18.4,-15,34.35,44.05]],
  3:[[6.60,-19.4,-17,53.8,63.2]],
  4:[[26,2.7,15.3,79.7,91.3]],
  5:[[74.75,-19.8,19.8,91.7,125.3],[97.5,-13.85,-6.15,125.3,132.35]],
};

function shadowBoxes(boxes:readonly (readonly number[])[]):THREE.BufferGeometry{
  const unit=new THREE.BoxGeometry(1,1,1),source=unit.getAttribute('position'),normal=unit.getAttribute('normal');
  const vertices=new Float32Array(boxes.length*source.count*3),normals=new Float32Array(vertices.length),indices:number[]=[];
  boxes.forEach((b,box)=>{
    for(let i=0;i<source.count;i++){
      const at=(box*source.count+i)*3;
      vertices.set([b[0]+source.getX(i)*b[3],b[1]+source.getY(i)*b[4],b[2]+source.getZ(i)*b[5]],at);
      normals.set([normal.getX(i),normal.getY(i),normal.getZ(i)],at);
    }
    for(let i=0;i<unit.index!.count;i++)indices.push(box*source.count+unit.index!.getX(i));
  });
  unit.dispose();const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Soft alpha is baked into three octagonal rings, merged into one room draw. */
function contactPatches(patches:readonly number[][]):THREE.BufferGeometry{
  const vertices:number[]=[],colours:number[]=[],indices:number[]=[];
  for(const [x,y,z,w,d] of patches){
    const start=vertices.length/3;
    for(const [spread,alpha] of [[-.025,.19],[.09,.07],[.30,0]]){
      const hx=w/2+spread,hz=d/2+spread,cut=Math.min(.15,hx*.3,hz*.3);
      for(const [a,b] of [[-hx+cut,-hz],[hx-cut,-hz],[hx,-hz+cut],[hx,hz-cut],[hx-cut,hz],[-hx+cut,hz],[-hx,hz-cut],[-hx,-hz+cut]]){
        vertices.push(x+a,y,z+b);colours.push(0,0,0,alpha);
      }
    }
    for(let ring=0;ring<2;ring++)for(let i=0;i<8;i++){
      const a=start+ring*8+i,b=start+ring*8+(i+1)%8,c=a+8,e=b+8;
      indices.push(a,b,c,b,e,c);
    }
    for(let i=1;i<7;i++)indices.push(start,start+i+1,start+i);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,4));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
