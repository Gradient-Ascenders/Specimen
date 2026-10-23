import * as THREE from 'three';
import { sweptSpherePairFraction, type ReadonlyCollisionVector3 } from '../physics/ContinuousCollision.ts';

const EPSILON=1e-10;
const CURVE_TOLERANCE_METRES=.01;
const clamp01=(x:number)=>Math.max(0,Math.min(1,x));

/** Squared distance between finite segments, including point/parallel cases. */
function segmentDistanceSquared(p:THREE.Vector3,q:THREE.Vector3,a:THREE.Vector3,b:THREE.Vector3):number {
  const dx=q.x-p.x,dy=q.y-p.y,dz=q.z-p.z,ex=b.x-a.x,ey=b.y-a.y,ez=b.z-a.z;
  const rx=p.x-a.x,ry=p.y-a.y,rz=p.z-a.z;
  const dd=dx*dx+dy*dy+dz*dz,ee=ex*ex+ey*ey+ez*ez,de=dx*ex+dy*ey+dz*ez;
  const dr=dx*rx+dy*ry+dz*rz,er=ex*rx+ey*ry+ez*rz;let s=0,t=0;
  if(dd<=EPSILON&&ee<=EPSILON)return rx*rx+ry*ry+rz*rz;
  if(dd<=EPSILON)t=clamp01(er/ee);
  else if(ee<=EPSILON)s=clamp01(-dr/dd);
  else {
    const denominator=dd*ee-de*de;
    s=denominator>EPSILON?clamp01((de*er-dr*ee)/denominator):0;t=(de*s+er)/ee;
    if(t<0){t=0;s=clamp01(-dr/dd);}else if(t>1){t=1;s=clamp01((de-dr)/dd);}
  }
  const x=rx+dx*s-ex*t,y=ry+dy*s-ey*t,z=rz+dz*s-ez*t;return x*x+y*y+z*z;
}

interface Node {bounds:THREE.Box3;start:number;count:number;left:number;right:number;}

/** A small encounter-owned triangle BVH. Built once from the rendered solid
 * geometry; queries allocate nothing and do not fill holes between components. */
class TriangleContactTree {
  readonly bounds=new THREE.Box3();
  readonly originRadius:number;
  private readonly triangles:Float32Array;
  private readonly order:Uint32Array;
  private readonly nodes:Node[]=[];
  private readonly stack:Int32Array;
  private readonly triangle=new THREE.Triangle();
  private readonly closest=new THREE.Vector3();
  private readonly normal=new THREE.Vector3();
  private readonly segmentRay=new THREE.Ray();
  private readonly insideRay=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(1,.371390676,.618033989).normalize());
  private readonly queryBounds=new THREE.Box3();
  private segmentLength=0;

  constructor(geometry:THREE.BufferGeometry) {
    const position=geometry.getAttribute('position'),index=geometry.index;
    const start=geometry.drawRange.start,end=Math.min(index?.count??position.count,start+geometry.drawRange.count),count=Math.floor((end-start)/3);
    this.triangles=new Float32Array(count*9);this.order=new Uint32Array(count);
    const centroids=new Float32Array(count*3);
    for(let i=0;i<count;i++) {
      this.order[i]=i;
      for(let j=0;j<3;j++) {
        const vertex=index?index.getX(start+i*3+j):start+i*3+j,offset=i*9+j*3;
        this.triangles[offset]=position.getX(vertex);this.triangles[offset+1]=position.getY(vertex);this.triangles[offset+2]=position.getZ(vertex);
      }
      for(let axis=0;axis<3;axis++)centroids[i*3+axis]=(this.triangles[i*9+axis]!+this.triangles[i*9+3+axis]!+this.triangles[i*9+6+axis]!)/3;
    }
    const build=(first:number,length:number):number=>{
      const bounds=new THREE.Box3();
      for(let i=first;i<first+length;i++)for(let j=0;j<3;j++)bounds.expandByPoint(this.closest.fromArray(this.triangles,this.order[i]!*9+j*3));
      const node:Node={bounds,start:first,count:length,left:-1,right:-1},id=this.nodes.length;this.nodes.push(node);
      if(length>12) {
        bounds.getSize(this.closest);const axis=this.closest.x>=this.closest.y&&this.closest.x>=this.closest.z?0:this.closest.y>=this.closest.z?1:2;
        this.order.subarray(first,first+length).sort((a,b)=>centroids[a*3+axis]!-centroids[b*3+axis]!);
        const half=Math.floor(length/2);node.left=build(first,half);node.right=build(first+half,length-half);node.count=0;
      }return id;
    };
    build(0,count);this.bounds.copy(this.nodes[0]!.bounds);this.stack=new Int32Array(this.nodes.length);
    this.originRadius=Math.hypot(Math.max(Math.abs(this.bounds.min.x),Math.abs(this.bounds.max.x)),Math.max(Math.abs(this.bounds.min.y),Math.abs(this.bounds.max.y)),Math.max(Math.abs(this.bounds.min.z),Math.abs(this.bounds.max.z)));
  }
  intersects(start:THREE.Vector3,end:THREE.Vector3,radius:number):boolean {
    this.queryBounds.min.copy(start).min(end).addScalar(-radius);this.queryBounds.max.copy(start).max(end).addScalar(radius);
    if(!this.bounds.intersectsBox(this.queryBounds))return false;
    this.segmentRay.origin.copy(start);this.segmentRay.direction.subVectors(end,start);this.segmentLength=this.segmentRay.direction.length();
    if(this.segmentLength>EPSILON)this.segmentRay.direction.divideScalar(this.segmentLength);
    const radiusSquared=radius*radius;let top=0;this.stack[top++]=0;
    while(top) {
      const node=this.nodes[this.stack[--top]!]!;if(!node.bounds.intersectsBox(this.queryBounds))continue;
      if(!node.count){this.stack[top++]=node.left;this.stack[top++]=node.right;continue;}
      for(let i=node.start;i<node.start+node.count;i++) {
        this.copyTriangle(this.order[i]!);const t=this.triangle;
        if(this.segmentLength>EPSILON&&this.segmentRay.intersectTriangle(t.a,t.b,t.c,false,this.closest)&&this.closest.distanceToSquared(start)<=this.segmentLength*this.segmentLength+EPSILON)return true;
        t.closestPointToPoint(start,this.closest);if(this.closest.distanceToSquared(start)<=radiusSquared+EPSILON)return true;
        t.closestPointToPoint(end,this.closest);if(this.closest.distanceToSquared(end)<=radiusSquared+EPSILON)return true;
        if(segmentDistanceSquared(start,end,t.a,t.b)<=radiusSquared+EPSILON||segmentDistanceSquared(start,end,t.b,t.c)<=radiusSquared+EPSILON||segmentDistanceSquared(start,end,t.c,t.a)<=radiusSquared+EPSILON)return true;
      }
    }
    // Also catch a player already wholly inside a closed hull. Signed ray
    // winding, unlike parity, preserves the union of overlapping solid parts.
    return this.bounds.containsPoint(start)&&this.contains(start);
  }
  private contains(point:THREE.Vector3):boolean {
    this.insideRay.origin.copy(point);let winding=0,top=0;this.stack[top++]=0;
    while(top) {
      const node=this.nodes[this.stack[--top]!]!;if(!this.insideRay.intersectsBox(node.bounds))continue;
      if(!node.count){this.stack[top++]=node.left;this.stack[top++]=node.right;continue;}
      for(let i=node.start;i<node.start+node.count;i++) {
        this.copyTriangle(this.order[i]!);const t=this.triangle;
        if(this.insideRay.intersectTriangle(t.a,t.b,t.c,false,this.closest)&&this.closest.distanceToSquared(point)>EPSILON) {
          const facing=t.getNormal(this.normal).dot(this.insideRay.direction);if(Math.abs(facing)>EPSILON)winding+=facing>0?1:-1;
        }
      }
    }return winding>0;
  }
  private copyTriangle(index:number):void {
    this.triangle.a.fromArray(this.triangles,index*9);this.triangle.b.fromArray(this.triangles,index*9+3);this.triangle.c.fromArray(this.triangles,index*9+6);
  }
}

interface Part {
  mesh:THREE.Mesh;tree:TriangleContactTree;
  previousPosition:THREE.Vector3;position:THREE.Vector3;previousRotation:THREE.Quaternion;rotation:THREE.Quaternion;scale:number;wasVisible:boolean;
}

/** Actual solid-mesh RAM contacts, not the invisible projectile proxy or a nose
 * sphere. The hero model uses a fixed uniform scale. Translation is swept
 * exactly; articulated rotations are subdivided with <=1cm curve padding. */
export class ExterminatorRamHull {
  readonly localBounds=new THREE.Box3();
  readonly widthMetres:number;
  private readonly root:THREE.Object3D;
  private readonly parts:Part[]=[];
  private captured=false;
  private readonly scale=new THREE.Vector3();
  private readonly originMotion=new THREE.Vector3();
  private readonly playerMotion=new THREE.Vector3();
  private readonly relativeMotion=new THREE.Vector3();
  private readonly posePosition=new THREE.Vector3();
  private readonly poseRotation=new THREE.Quaternion();
  private readonly start=new THREE.Vector3();
  private readonly end=new THREE.Vector3();
  private readonly playerStart=new THREE.Vector3();
  private readonly playerEnd=new THREE.Vector3();

  constructor(root:THREE.Object3D) {
    this.root=root;root.updateWorldMatrix(true,true);const cache=new Map<THREE.BufferGeometry,TriangleContactTree>(),inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),relative=new THREE.Matrix4(),bounds=new THREE.Box3();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object.userData.contactSolid===false||!object.geometry.getAttribute('position'))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];if(!materials.some(m=>m.visible))return;
      const available=object.geometry.index?.count??object.geometry.getAttribute('position').count;
      if(Math.min(available,object.geometry.drawRange.start+object.geometry.drawRange.count)-object.geometry.drawRange.start<3)return;
      let tree=cache.get(object.geometry);if(!tree){tree=new TriangleContactTree(object.geometry);cache.set(object.geometry,tree);}
      const part:Part={mesh:object,tree,previousPosition:new THREE.Vector3(),position:new THREE.Vector3(),previousRotation:new THREE.Quaternion(),rotation:new THREE.Quaternion(),scale:1,wasVisible:false};
      object.matrixWorld.decompose(part.position,part.rotation,this.scale);part.scale=this.uniformScale();
      part.previousPosition.copy(part.position);part.previousRotation.copy(part.rotation);this.parts.push(part);
      relative.multiplyMatrices(inverse,object.matrixWorld);bounds.copy(tree.bounds).applyMatrix4(relative);this.localBounds.union(bounds);
    });
    root.getWorldScale(this.scale);this.widthMetres=this.localBounds.isEmpty()?0:(this.localBounds.max.x-this.localBounds.min.x)*this.uniformScale();
  }
  capturePreviousPose():void {
    this.root.updateWorldMatrix(true,true);
    for(const p of this.parts){p.mesh.matrixWorld.decompose(p.previousPosition,p.previousRotation,this.scale);this.uniformScale();p.wasVisible=this.visible(p.mesh);}
    this.captured=true;
  }
  intersectsPlayer(previous:ReadonlyCollisionVector3,current:ReadonlyCollisionVector3,radius:number):boolean {
    if(!Number.isFinite(radius)||radius<=0)throw new Error('RAM player radius must be positive and finite.');
    if(!this.captured)this.capturePreviousPose();this.root.updateWorldMatrix(true,true);
    this.playerStart.copy(previous);this.playerEnd.copy(current);this.playerMotion.subVectors(this.playerEnd,this.playerStart);
    for(const p of this.parts) {
      if(!this.visible(p.mesh))continue;
      p.mesh.matrixWorld.decompose(p.position,p.rotation,this.scale);const scale=this.uniformScale();
      if(Math.abs(scale-p.scale)>1e-5)throw new Error('RAM contact geometry must keep its authored uniform scale.');
      if(!p.wasVisible){p.previousPosition.copy(p.position);p.previousRotation.copy(p.rotation);}
      this.originMotion.subVectors(p.position,p.previousPosition);
      if(sweptSpherePairFraction(p.previousPosition,this.originMotion,p.tree.originRadius*scale,this.playerStart,this.playerMotion,radius)===undefined)continue;
      const angle=p.previousRotation.angleTo(p.rotation),lever=Math.max(this.playerStart.distanceTo(p.previousPosition),this.playerEnd.distanceTo(p.position));
      const motion=this.relativeMotion.subVectors(this.playerMotion,this.originMotion).length(),curvature=angle*angle*lever+2*angle*motion;
      const steps=Math.max(1,Math.min(128,Math.ceil(Math.sqrt(curvature/(8*CURVE_TOLERANCE_METRES))))),padding=curvature/(8*steps*steps);
      this.localPlayerPoint(p,0,this.start);
      for(let i=1;i<=steps;i++) {
        this.localPlayerPoint(p,i/steps,this.end);
        if(p.tree.intersects(this.start,this.end,(radius+padding)/scale))return true;
        this.start.copy(this.end);
      }
    }return false;
  }
  reset():void {this.captured=false;}
  private localPlayerPoint(part:Part,t:number,out:THREE.Vector3):void {
    this.posePosition.lerpVectors(part.previousPosition,part.position,t);this.poseRotation.copy(part.previousRotation).slerp(part.rotation,t).invert();
    out.lerpVectors(this.playerStart,this.playerEnd,t).sub(this.posePosition).applyQuaternion(this.poseRotation).divideScalar(part.scale);
  }
  private uniformScale():number {
    if(this.scale.x<=0||Math.abs(this.scale.x-this.scale.y)>1e-5||Math.abs(this.scale.x-this.scale.z)>1e-5)throw new Error('Exterminator RAM meshes require a positive uniform scale.');return this.scale.x;
  }
  private visible(mesh:THREE.Mesh):boolean {
    const material=mesh.material;if(Array.isArray(material)?!material.some(m=>m.visible):!material.visible)return false;
    for(let o:THREE.Object3D|null=mesh;o;o=o.parent){if(!o.visible)return false;if(o===this.root)break;}return true;
  }
}
