import * as THREE from 'three';
import { CollisionWorld, type CollisionBoxCandidate } from '../../physics/CollisionWorld.ts';
import { SphereBoxSweep } from '../../physics/SphereBoxSweep.ts';
import type { BodyCollision } from '../ground/BodyCollision.ts';
import type { DeformableBody } from '../ground/DeformableBody.ts';
import { CageValidity } from './CageValidity.ts';
import { ConvexSweep } from './ConvexSweep.ts';

export interface CageContact {
  box: CollisionBoxCandidate;
  nodes: number[];
  weights: number[];
  normal: THREE.Vector3;
  anchor: THREE.Vector3;
  plane: number;
  normalLambda: number;
  tangentLambda: THREE.Vector3;
  age: number;
  sliding: boolean;
  face: boolean;
  seen: boolean;
}

/** Finite static boxes, per-material contacts, continuous closed surface checks.
 * No centre collider, rigid pose or target translation exists in this adapter.
 * Normal/friction corrections are distributed by barycentric inverse mass.
 * A conservative line search rejects the unsafe part of an unresolved particle
 * update; it never substitutes a rigid body for the cage. */
export class CageWorldContacts implements BodyCollision {
  /** Closed triangle skin; original node contact pads keep their accepted radius. */
  readonly surfaceSkin=.005;
  readonly contacts = new Map<string,CageContact>();
  readonly diagnostics = {
    candidateBatches:0, candidates:0, nodeContacts:0, faceContacts:0,
    sweptFaceHits:0, correctionHits:0, patchLimits:0, limitedUpdates:0, minAcceptedFraction:1,
    minLocalVolumeRatio:1, recoveryDistance:0, reason:'clear',
  };
  penetration=0;
  private readonly world: CollisionWorld;
  private readonly candidates: CollisionBoxCandidate[]=[];
  private readonly batchBounds=new THREE.Box3();
  private readonly queryBounds=new THREE.Box3();
  private safe=new Float64Array();
  private proposed=new Float64Array();
  private trial=new Float64Array();
  private activeBefore=new Uint8Array();
  private validity: CageValidity | undefined;
  private pass=0;
  private readonly sat=new ConvexSweep();
  private readonly sphere=new SphereBoxSweep();
  private readonly local0=new THREE.Vector3(); private readonly local1=new THREE.Vector3();
  private readonly delta=new THREE.Vector3(); private readonly normal=new THREE.Vector3();
  private readonly localNormal=new THREE.Vector3(); private readonly point=new THREE.Vector3();
  private readonly anchor=new THREE.Vector3(); private readonly support=new THREE.Vector3();
  private readonly tangent=new THREE.Vector3(); private readonly nextTangent=new THREE.Vector3();
  private readonly tri=new THREE.Triangle(); private readonly bary=new THREE.Vector3();
  private readonly from=Array.from({length:3},()=>new THREE.Vector3());
  private readonly to=Array.from({length:3},()=>new THREE.Vector3());
  private readonly interval=Array.from({length:6},()=>new THREE.Vector3());
  private readonly at=Array.from({length:3},()=>new THREE.Vector3());

  constructor(world: CollisionWorld) { this.world=world; }

  reset(body: DeformableBody): void {
    this.contacts.clear();this.safe=new Float64Array(body.positions.length);
    this.proposed=new Float64Array(body.positions.length);this.trial=new Float64Array(body.positions.length);
    this.activeBefore=new Uint8Array(body.positions.length/3);
    this.validity=new CageValidity(body);this.batchBounds.makeEmpty();this.penetration=0;
    this.diagnostics.recoveryDistance=0; this.beginTick();
    // Invalid spawn recovery is explicit and velocity-free. Select a shortest
    // exit from actual cage extents, preserving its shape only during recovery.
    // Ordinary contact response below NEVER translates the whole body this way.
    for(let iteration=0;iteration<32;iteration++) {
      this.gather(body.positions,body.positions,body.config.nodeRadius,true);
      const overlap=this.candidates.find(box=>this.overlapping(body,box));
      if(!overlap) {
        if(!this.validity.valid(body.positions,body.positions))throw new Error('Invalid initial cage topology.');
        this.safe.set(body.positions);return;
      }
      const exits: {distance:number;direction:THREE.Vector3}[]=[];
      const skin=body.config.nodeRadius/overlap.minimumWorldScale;
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
        this.localNormal.set(0,0,0).setComponent(axis,sign);
        if(!this.allowed(overlap,this.localNormal))continue;
        let minimum=Infinity;
        for(let j=0;j<body.positions.length;j+=3)minimum=Math.min(minimum,this.point.fromArray(body.positions,j).applyMatrix4(overlap.inverseWorld).dot(this.localNormal));
        const limit=(sign>0?overlap.localBounds.max.getComponent(axis):-overlap.localBounds.min.getComponent(axis))+skin;
        this.normal.copy(this.localNormal).applyMatrix3(overlap.normalMatrix);
        const distance=(limit-minimum)/this.normal.length()+2e-6;
        if(Number.isFinite(distance)&&distance>=0)exits.push({distance,direction:this.normal.clone().normalize()});
      }
      exits.sort((a,b)=>a.distance-b.distance);
      if(!exits.length)throw new Error('No permitted initial-overlap recovery direction.');
      this.proposed.set(body.positions);
      let chosen=exits[0];
      for(const exit of exits){
        for(let j=0;j<body.positions.length;j++)body.positions[j]=this.proposed[j]+exit.direction.getComponent(j%3)*exit.distance;
        this.gather(body.positions,body.positions,body.config.nodeRadius,true);
        if(!this.candidates.some(box=>this.overlapping(body,box))){chosen=exit;break;}
      }
      for(let j=0;j<body.positions.length;j++)body.positions[j]=this.proposed[j]+chosen.direction.getComponent(j%3)*chosen.distance;
      this.diagnostics.recoveryDistance+=chosen.distance;
      if(this.diagnostics.recoveryDistance>20)break;
    }
    throw new Error('Initial overlap could not be recovered within the bounded search. Reset in a clear spawn.');
  }

  beginTick(): void {
    Object.assign(this.diagnostics,{candidateBatches:0,candidates:0,nodeContacts:0,faceContacts:0,
      sweptFaceHits:0,correctionHits:0,patchLimits:0,limitedUpdates:0,minAcceptedFraction:1,minLocalVolumeRatio:1,reason:'clear'});
  }
  beginSubstep(body: DeformableBody, _h: number, start: Float64Array): void {
    this.safe.set(start);this.pass=0;this.batchBounds.makeEmpty();
    for(const c of this.contacts.values()){c.normalLambda=0;c.tangentLambda.set(0,0,0);c.sliding=false;c.seen=false;}
    this.gather(start,body.positions,body.config.nodeRadius);
  }

  private gather(from: Float64Array,to: Float64Array,skin: number,force=false): void {
    this.queryBounds.makeEmpty();
    for(let j=0;j<from.length;j+=3){this.queryBounds.expandByPoint(this.point.fromArray(from,j));this.queryBounds.expandByPoint(this.point.fromArray(to,j));}
    this.queryBounds.expandByScalar(skin+2e-6);
    if(!force&&this.batchBounds.containsBox(this.queryBounds))return;
    this.batchBounds.copy(this.queryBounds).expandByScalar(.025);
    this.world.collectBoxCandidates(this.batchBounds,this.candidates);
    this.diagnostics.candidateBatches++;this.diagnostics.candidates=Math.max(this.diagnostics.candidates,this.candidates.length);
  }

  private allowed(box: CollisionBoxCandidate,normal: THREE.Vector3): boolean {
    if(box.mesh.userData.movementFaceMode!=='vertical-sides')return true;
    this.support.copy(normal).applyMatrix3(box.normalMatrix).normalize();
    if(Math.abs(this.support.y)>.5)return false;
    box.localBounds.getSize(this.support);
    const axis=this.support.x<=this.support.y&&this.support.x<=this.support.z?0:this.support.y<=this.support.z?1:2;
    return Math.abs(normal.getComponent(axis))>.5;
  }

  private sideEntry(box:CollisionBoxCandidate,normal:THREE.Vector3,points:readonly THREE.Vector3[]):boolean {
    if(box.mesh.userData.movementFaceMode!=='vertical-sides')return true;
    box.localBounds.getSize(this.support);
    const axis=this.support.x<=this.support.y&&this.support.x<=this.support.z?0:this.support.y<=this.support.z?1:2;
    const sign=Math.sign(normal.getComponent(axis));
    const plane=sign>0?box.localBounds.max.getComponent(axis):-box.localBounds.min.getComponent(axis);
    // An open cap is not a solid volume. A patch that entered through the cap
    // may leave it; do not reinterpret it as initial penetration of a side.
    return points.every(point=>point.getComponent(axis)*sign>=plane-1e-7);
  }

  private record(body: DeformableBody, key: string, box: CollisionBoxCandidate, nodes: number[], weights: number[],
    localNormal: THREE.Vector3, localAnchor: THREE.Vector3, localSkin: number, face: boolean): CageContact {
    this.normal.copy(localNormal).applyMatrix3(box.normalMatrix);
    const normalScale=this.normal.length();this.normal.multiplyScalar(1/normalScale);
    this.anchor.copy(localAnchor).applyMatrix4(box.cachedWorld);
    let c=this.contacts.get(key);
    if(!c||c.normal.dot(this.normal)<.98) {
      c={box,nodes,weights,normal:this.normal.clone(),anchor:new THREE.Vector3(),plane:0,
        normalLambda:0,tangentLambda:new THREE.Vector3(),age:0,sliding:false,face,seen:true};
      this.materialPoint(body.positions,c,c.anchor);
      this.contacts.set(key,c);body.acquired++;
    }
    if(face&&weights.some((weight,i)=>Math.abs(weight-c!.weights[i])>1e-3)){
      c.weights=weights;c.normalLambda=0;c.tangentLambda.set(0,0,0);
      this.materialPoint(body.positions,c,c.anchor);
    }
    c.plane=this.normal.dot(this.anchor)+localSkin/normalScale;
    c.normal.copy(this.normal);c.seen=true;
    return c;
  }

  private materialPoint(p: Float64Array,c: CageContact,out: THREE.Vector3): THREE.Vector3 {
    out.set(0,0,0);
    for(let i=0;i<c.nodes.length;i++){
      const j=c.nodes[i]*3,w=c.weights[i];out.x+=p[j]*w;out.y+=p[j+1]*w;out.z+=p[j+2]*w;
    }
    return out;
  }

  private sweepNode(box: CollisionBoxCandidate,start: THREE.Vector3,delta: THREE.Vector3,radius:number,normal:THREE.Vector3): number | undefined {
    if(box.mesh.userData.preciseMovementCorners===true)return this.sphere.sweep(box.localBounds,start,delta,radius,normal);
    // Retain the registry's default conservative expanded-box corner policy.
    // Authored preciseMovementCorners opts into the rounded feature sweep.
    let enter=0,exit=1,hitAxis=-1,hitSign=0,inside=true,nearest=Infinity;
    for(let axis=0;axis<3;axis++){
      const min=box.localBounds.min.getComponent(axis)-radius,max=box.localBounds.max.getComponent(axis)+radius;
      const x=start.getComponent(axis),v=delta.getComponent(axis);
      if(x<min||x>max)inside=false;
      for(const sign of [-1,1]){const d=sign<0?x-min:max-x;if(d<nearest){nearest=d;normal.set(0,0,0).setComponent(axis,sign);}}
      if(Math.abs(v)<1e-12){if(x<min||x>max)return;continue;}
      const a=(min-x)/v,b=(max-x)/v,low=Math.min(a,b),high=Math.max(a,b);
      if(low>enter){enter=low;hitAxis=axis;hitSign=v>0?-1:1;}exit=Math.min(exit,high);
      if(enter>exit)return;
    }
    if(inside)return delta.dot(normal)<-1e-9?0:undefined;
    if(hitAxis<0||enter<0||enter>1)return;
    normal.set(0,0,0).setComponent(hitAxis,hitSign);return enter;
  }

  private nodeContact(body: DeformableBody,box: CollisionBoxCandidate,node: number): CageContact | undefined {
    const j=node*3,skin=body.config.nodeRadius/box.minimumWorldScale;
    this.local0.fromArray(this.safe,j).applyMatrix4(box.inverseWorld);
    this.local1.fromArray(body.positions,j).applyMatrix4(box.inverseWorld);
    this.delta.subVectors(this.local1,this.local0);
    const fraction=this.sweepNode(box,this.local0,this.delta,skin,this.localNormal);
    if(fraction!==undefined) {
      if(this.pass>0)this.diagnostics.correctionHits++;
      this.local1.copy(this.local0).addScaledVector(this.delta,fraction);
      box.localBounds.clampPoint(this.local1,this.anchor);
    } else {
      box.localBounds.clampPoint(this.local1,this.anchor);
      this.localNormal.subVectors(this.local1,this.anchor);
      const distance=this.localNormal.length();
      if(distance>skin+.018/box.minimumWorldScale)return;
      if(distance<1e-12){
        let best=Infinity;
        for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
          const d=sign>0?box.localBounds.max.getComponent(axis)-this.local1.getComponent(axis):this.local1.getComponent(axis)-box.localBounds.min.getComponent(axis);
          if(d<best){best=d;this.localNormal.set(0,0,0).setComponent(axis,sign);}
        }
        this.anchor.copy(this.local1).addScaledVector(this.localNormal,best);
      }else this.localNormal.multiplyScalar(1/distance);
    }
    if(!this.allowed(box,this.localNormal)||!this.sideEntry(box,this.localNormal,[this.local0]))return;
    return this.record(body,`${box.mesh.id}:n${node}`,box,[node],[1],this.localNormal,this.anchor,skin,false);
  }

  private solve(body: DeformableBody,c: CageContact): void {
    const p=body.positions,w=p.length/3/body.config.mass;
    let effective=0;for(const weight of c.weights)effective+=w*weight*weight;
    this.materialPoint(p,c,this.point);
    const distance=this.point.dot(c.normal)-c.plane;
    const next=Math.max(0,c.normalLambda-distance/effective),delta=next-c.normalLambda;
    c.normalLambda=next;
    for(let i=0;i<c.nodes.length;i++)for(let k=0;k<3;k++)p[c.nodes[i]*3+k]+=w*c.weights[i]*delta*c.normal.getComponent(k);
    this.materialPoint(p,c,this.point);
    this.tangent.subVectors(this.point,c.anchor);
    this.tangent.addScaledVector(c.normal,-this.tangent.dot(c.normal));
    this.nextTangent.copy(c.tangentLambda).addScaledVector(this.tangent,-1/effective);
    const length=this.nextTangent.length();
    if(length>body.config.friction*c.normalLambda){
      this.nextTangent.multiplyScalar(length>0?Math.min(body.config.dynamicFriction,body.config.friction)*c.normalLambda/length:0);c.sliding=true;
    }
    this.tangent.subVectors(this.nextTangent,c.tangentLambda);
    for(let i=0;i<c.nodes.length;i++)for(let k=0;k<3;k++)p[c.nodes[i]*3+k]+=w*c.weights[i]*this.tangent.getComponent(k);
    c.tangentLambda.copy(this.nextTangent);
  }

  private loadFace(body: DeformableBody,box: CollisionBoxCandidate,face: number,from: Float64Array,to: Float64Array): void {
    body.cage.faces[face].forEach((node,i)=>{
      this.from[i].fromArray(from,node*3).applyMatrix4(box.inverseWorld);
      this.to[i].fromArray(to,node*3).applyMatrix4(box.inverseWorld);
    });
  }
  private intervalHit(box: CollisionBoxCandidate,skin: number,low: number,high: number): boolean {
    for(let i=0;i<3;i++){this.interval[i].lerpVectors(this.from[i],this.to[i],low);this.interval[i+3].lerpVectors(this.from[i],this.to[i],high);}
    return this.sat.box(this.interval,box.localBounds,skin);
  }

  private intervalClear(box: CollisionBoxCandidate,skin:number,low=0,high=1,depth=7):boolean {
    if(!this.intervalHit(box,skin,low,high))return true;
    if(depth===0)return false;
    // A swept hull can overlap even when the moving triangle does not. Only
    // accept after every smaller time interval has its own separating axis.
    const middle=(low+high)/2;
    return this.intervalClear(box,skin,low,middle,depth-1)&&this.intervalClear(box,skin,middle,high,depth-1);
  }

  private faceContact(body: DeformableBody,box: CollisionBoxCandidate,face: number): CageContact | undefined {
    this.loadFace(body,box,face,this.safe,body.positions);
    const skin=this.surfaceSkin/box.minimumWorldScale;
    if(!this.intervalHit(box,skin,0,1))return;
    let low=0,high=1;
    for(let i=0;i<12;i++){const mid=(low+high)/2;if(this.intervalHit(box,skin,low,mid))high=mid;else low=mid;}
    for(let i=0;i<3;i++)this.at[i].lerpVectors(this.from[i],this.to[i],low);
    this.sat.box(this.at,box.localBounds,skin,false);
    this.localNormal.copy(this.sat.normal);
    if(!this.allowed(box,this.localNormal)||!this.sideEntry(box,this.localNormal,this.from))return;
    // Select the supporting material feature. For a face-interior hit this is
    // the triangle point nearest the obstacle's support corner, not its centre.
    for(let k=0;k<3;k++)this.anchor.setComponent(k,this.localNormal.getComponent(k)>1e-8?box.localBounds.max.getComponent(k):
      this.localNormal.getComponent(k)<-1e-8?box.localBounds.min.getComponent(k):(box.localBounds.min.getComponent(k)+box.localBounds.max.getComponent(k))/2);
    this.tri.set(this.at[0],this.at[1],this.at[2]);this.tri.closestPointToPoint(this.anchor,this.point);
    this.tri.getBarycoord(this.point,this.bary);
    let minimum=Infinity;for(const point of this.at)minimum=Math.min(minimum,point.dot(this.localNormal));
    const weights=this.at.map((point,i)=>point.dot(this.localNormal)-minimum<1e-4?Math.max(0,this.bary.getComponent(i)):0);
    let total=weights.reduce((sum,w)=>sum+w,0);
    if(total<1e-10){for(let i=0;i<3;i++)weights[i]=this.at[i].dot(this.localNormal)-minimum<1e-4?1:0;total=weights.reduce((sum,w)=>sum+w,0);}
    for(let i=0;i<3;i++)weights[i]/=total;
    this.diagnostics.sweptFaceHits++;if(this.pass>0)this.diagnostics.correctionHits++;
    // Keep a small numerical clearance above the sweep barrier. Without it a
    // corner can settle exactly at the rejection tolerance and pin every later
    // correction despite an available separating direction.
    return this.record(body,`${box.mesh.id}:f${face}`,box,[...body.cage.faces[face]],weights,this.localNormal,this.anchor,skin+2e-5/box.minimumWorldScale,true);
  }

  private clearMotion(body: DeformableBody,from: Float64Array,to: Float64Array): boolean {
    if(!this.validity!.valid(from,to)){this.diagnostics.reason=this.validity!.reason;return false;}
    this.diagnostics.minLocalVolumeRatio=Math.min(this.diagnostics.minLocalVolumeRatio,this.validity!.minVolumeRatio);
    for(const box of this.candidates){
      for(let j=0;j<from.length;j+=3){
        this.local0.fromArray(from,j).applyMatrix4(box.inverseWorld);this.local1.fromArray(to,j).applyMatrix4(box.inverseWorld);
        this.delta.subVectors(this.local1,this.local0);
        const fraction=this.sweepNode(box,this.local0,this.delta,body.config.nodeRadius/box.minimumWorldScale,this.localNormal);
        if(fraction!==undefined&&fraction<1-1e-6&&this.delta.dot(this.localNormal)<-1e-7&&this.allowed(box,this.localNormal)&&this.sideEntry(box,this.localNormal,[this.local0])){
          this.diagnostics.reason='node-pad sweep';return false;
        }
      }
      for(let face=0;face<body.cage.faces.length;face++){
      this.loadFace(body,box,face,from,to);
      if(!this.intervalClear(box,this.surfaceSkin/box.minimumWorldScale)){
        this.sat.box(this.from,box.localBounds,this.surfaceSkin/box.minimumWorldScale,false);
        if(!this.allowed(box,this.sat.normal)||!this.sideEntry(box,this.sat.normal,this.from))continue;
        this.diagnostics.reason='closed surface sweep';return false;
      }
      }
    }
    return true;
  }

  private limitContactPatches(body:DeformableBody):void {
    // Last-resort inelastic impact response is LOCAL to a colliding material
    // patch. Do not let one difficult edge pin every free particle in the body.
    for(const box of this.candidates)for(let j=0;j<body.positions.length;j+=3){
      this.local0.fromArray(this.safe,j).applyMatrix4(box.inverseWorld);
      this.local1.fromArray(body.positions,j).applyMatrix4(box.inverseWorld);this.delta.subVectors(this.local1,this.local0);
      const fraction=this.sweepNode(box,this.local0,this.delta,body.config.nodeRadius/box.minimumWorldScale,this.localNormal);
      if(fraction===undefined||fraction>=1-1e-6||this.delta.dot(this.localNormal)>=-1e-7||!this.allowed(box,this.localNormal)||!this.sideEntry(box,this.localNormal,[this.local0]))continue;
      for(let k=0;k<3;k++)body.positions[j+k]=this.safe[j+k]+(body.positions[j+k]-this.safe[j+k])*Math.max(0,fraction-1e-5);
      this.diagnostics.patchLimits++;
    }
    for(const box of this.candidates)for(let face=0;face<body.cage.faces.length;face++){
      this.loadFace(body,box,face,this.safe,body.positions);
      const skin=this.surfaceSkin/box.minimumWorldScale;
      if(this.intervalClear(box,skin))continue;
      this.sat.box(this.from,box.localBounds,skin,false);
      if(!this.allowed(box,this.sat.normal)||!this.sideEntry(box,this.sat.normal,this.from))continue;
      let fraction=.5;
      for(let attempt=0;attempt<18;attempt++,fraction*=.5)if(this.intervalClear(box,skin,0,fraction))break;
      if(fraction<2**-18)fraction=0;
      for(const node of body.cage.faces[face])for(let k=0;k<3;k++){
        const j=node*3+k;body.positions[j]=this.safe[j]+(body.positions[j]-this.safe[j])*fraction;
      }
      this.diagnostics.patchLimits++;
    }
  }

  project(body: DeformableBody,_h: number): void {
    this.gather(this.safe,body.positions,body.config.nodeRadius);
    for(const box of this.candidates)for(let node=0;node<body.positions.length/3;node++){
      const contact=this.nodeContact(body,box,node);if(contact)this.solve(body,contact);
    }
    this.gather(this.safe,body.positions,body.config.nodeRadius);
    for(const box of this.candidates)for(let face=0;face<body.cage.faces.length;face++){
      const contact=this.faceContact(body,box,face);if(contact)this.solve(body,contact);
    }
    this.gather(this.safe,body.positions,body.config.nodeRadius);
    // Resolve coupled node/face contacts before falling back to shortening the
    // update. These are collision-only passes, not extra material stiffness.
    let clear=this.clearMotion(body,this.safe,body.positions);
    for(let iteration=0;!clear&&iteration<6;iteration++){
      for(const box of this.candidates)for(let node=0;node<body.positions.length/3;node++){
        const contact=this.nodeContact(body,box,node);if(contact)this.solve(body,contact);
      }
      for(const box of this.candidates)for(let face=0;face<body.cage.faces.length;face++){
        const contact=this.faceContact(body,box,face);if(contact)this.solve(body,contact);
      }
      this.gather(this.safe,body.positions,body.config.nodeRadius);
      clear=this.clearMotion(body,this.safe,body.positions);
    }
    if(!clear){
      this.limitContactPatches(body);
      clear=this.clearMotion(body,this.safe,body.positions);
    }
    if(!clear){
      this.proposed.set(body.positions);let fraction=.5,accepted=0;
      for(let attempt=0;attempt<18;attempt++,fraction*=.5){
        for(let j=0;j<this.trial.length;j++)this.trial[j]=this.safe[j]+(this.proposed[j]-this.safe[j])*fraction;
        if(this.clearMotion(body,this.safe,this.trial)){accepted=fraction;break;}
      }
      if(accepted)body.positions.set(this.trial);else body.positions.set(this.safe);
      this.diagnostics.limitedUpdates++;
      this.diagnostics.minAcceptedFraction=Math.min(this.diagnostics.minAcceptedFraction,accepted);
    }
    this.safe.set(body.positions);this.pass++;
  }

  finishSubstep(body: DeformableBody,h: number): void {
    body.contacts.forEach((c,i)=>{this.activeBefore[i]=Number(c.active);c.active=false;c.normalLambda=0;c.sliding=false;});
    let nodes=0,faces=0;
    for(const [key,c] of this.contacts){
      this.materialPoint(body.positions,c,this.point);
      if(!c.seen||this.point.dot(c.normal)-c.plane>.018){this.contacts.delete(key);body.released++;continue;}
      c.age+=h;
      if(c.sliding)c.anchor.copy(this.point);
      if(c.normalLambda>1e-9){
        if(c.face)faces++;else nodes++;
        // Vertical obstacle contact cannot activate an airborne ground motor.
        if(c.normal.y>.5)body.contactCount++;
      }
      for(let k=0;k<3;k++)body.groundImpulse[k]+=(c.normal.getComponent(k)*c.normalLambda+c.tangentLambda.getComponent(k))/h;
      for(const node of c.nodes){
        const d=body.contacts[node];d.active=true;d.normalLambda=Math.max(d.normalLambda,c.normalLambda);d.age=c.age;
        d.sliding ||= c.sliding;d.anchorX=c.anchor.x;d.anchorZ=c.anchor.z;
      }
    }
    body.contacts.forEach((c,i)=>{
      if(c.active&&!this.activeBefore[i])c.acquisitions++;
      if(!c.active&&this.activeBefore[i])c.lastReleaseTick=body.tick;
    });
    this.diagnostics.nodeContacts=nodes;this.diagnostics.faceContacts=faces;
    this.penetration=this.audit(body).penetration;
  }

  /** Independent final-state measurements; zero is measured, not assumed. */
  audit(body: DeformableBody): {penetration:number;surfaceIntersections:number} {
    let penetration=0,surfaceIntersections=0;
    this.gather(body.positions,body.positions,body.config.nodeRadius);
    for(const box of this.candidates){
      for(let j=0;j<body.positions.length;j+=3){
        this.local1.fromArray(body.positions,j).applyMatrix4(box.inverseWorld);
        box.localBounds.clampPoint(this.local1,this.anchor);this.localNormal.subVectors(this.local1,this.anchor);
        let distance=this.localNormal.length();
        if(distance<1e-12){
          let nearest=Infinity;
          for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
            const d=sign>0?box.localBounds.max.getComponent(axis)-this.local1.getComponent(axis):this.local1.getComponent(axis)-box.localBounds.min.getComponent(axis);
            if(d<nearest){nearest=d;this.localNormal.set(0,0,0).setComponent(axis,sign);}
          }
          distance=-nearest;
        }else this.localNormal.multiplyScalar(1/distance);
        if(this.allowed(box,this.localNormal)&&this.sideEntry(box,this.localNormal,[this.local1]))penetration=Math.max(penetration,body.config.nodeRadius-distance*box.minimumWorldScale);
      }
      for(let face=0;face<body.cage.faces.length;face++){
        this.loadFace(body,box,face,body.positions,body.positions);
        if(this.sat.box(this.from,box.localBounds,0)&&this.allowed(box,this.sat.normal)&&this.sideEntry(box,this.sat.normal,this.from)){
          surfaceIntersections++;penetration=Math.max(penetration,-this.sat.gap*box.minimumWorldScale);
        }
      }
    }
    return {penetration:Math.max(0,penetration),surfaceIntersections};
  }

  private overlapping(body: DeformableBody,box: CollisionBoxCandidate): boolean {
    const skin=this.surfaceSkin/box.minimumWorldScale;
    for(let j=0;j<body.positions.length;j+=3){
      this.local1.fromArray(body.positions,j).applyMatrix4(box.inverseWorld);
      box.localBounds.clampPoint(this.local1,this.anchor);this.localNormal.subVectors(this.local1,this.anchor);
      const distance=this.localNormal.length();
      if(distance<body.config.nodeRadius/box.minimumWorldScale-1e-7){
        if(distance>1e-12){this.localNormal.multiplyScalar(1/distance);if(this.allowed(box,this.localNormal))return true;}
        else for(let axis=0;axis<3;axis++)if(this.allowed(box,this.localNormal.set(0,0,0).setComponent(axis,1)))return true;
      }
    }
    for(let face=0;face<body.cage.faces.length;face++){
      this.loadFace(body,box,face,body.positions,body.positions);
      if(this.sat.box(this.from,box.localBounds,skin)&&this.allowed(box,this.sat.normal))return true;
    }
    // A solid obstacle wholly inside the closed body has no surface crossing.
    // Oriented solid angle closes that initial-overlap hole explicitly.
    box.localBounds.getCenter(this.point).applyMatrix4(box.cachedWorld);
    let angle=0;
    for(const [a,b,c] of body.cage.faces){
      this.from[0].fromArray(body.positions,a*3).sub(this.point);
      this.from[1].fromArray(body.positions,b*3).sub(this.point);
      this.from[2].fromArray(body.positions,c*3).sub(this.point);
      const [u,v,w]=this.from;
      const numerator=this.delta.crossVectors(v,w).dot(u);
      const denominator=u.length()*v.length()*w.length()+u.dot(v)*w.length()+v.dot(w)*u.length()+w.dot(u)*v.length();
      angle+=2*Math.atan2(numerator,denominator);
    }
    return Math.abs(angle)>2*Math.PI && box.mesh.userData.movementFaceMode!=='vertical-sides';
  }

  snapshot(): unknown {
    return {safe:[...this.safe],contacts:[...this.contacts.values()].map(c=>({
      box:c.box.mesh.name,nodes:c.nodes,weights:c.weights,normal:c.normal.toArray(),anchor:c.anchor.toArray(),plane:c.plane,
      normalLambda:c.normalLambda,tangentLambda:c.tangentLambda.toArray(),age:c.age,sliding:c.sliding,face:c.face,
    })),diagnostics:{...this.diagnostics}};
  }
}
