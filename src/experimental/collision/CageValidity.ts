import * as THREE from 'three';
import type { DeformableBody } from '../ground/DeformableBody.ts';
import { hullsSeparated } from './ConvexSweep.ts';

const determinant=(a: THREE.Vector3,b: THREE.Vector3,c: THREE.Vector3) =>
  a.x*(b.y*c.z-b.z*c.y)-a.y*(b.x*c.z-b.z*c.x)+a.z*(b.x*c.y-b.y*c.x);

/** Dormant inequality guards, not new elastic stiffness or rest-pose matching.
 * The centroid here is a derived quadrature point, with no position authority.
 * Positive tetrahedral-fan Jacobians bound local collapse; swept non-neighbour
 * triangles prevent a disconnected patch passing through another patch. */
export class CageValidity {
  readonly minVolumeFraction=.01;
  readonly minEdgeFraction=.05;
  readonly maxEdgeFraction=3;
  minVolumeRatio=1;
  reason='clear';
  private readonly restDeterminants: number[];
  private readonly start: THREE.Vector3[];
  private readonly end: THREE.Vector3[];
  private readonly hulls: THREE.Vector3[][];
  private readonly faceBounds: Float64Array;
  private readonly centre0=new THREE.Vector3();
  private readonly centre1=new THREE.Vector3();
  private readonly a=new THREE.Vector3(); private readonly b=new THREE.Vector3(); private readonly c=new THREE.Vector3();
  private readonly da=new THREE.Vector3(); private readonly db=new THREE.Vector3(); private readonly dc=new THREE.Vector3();
  private readonly body: DeformableBody;
  private readonly pairs: [number,number][]=[];

  constructor(body: DeformableBody) {
    this.body=body;
    const n=body.positions.length/3;
    this.start=Array.from({length:n},()=>new THREE.Vector3());
    this.end=Array.from({length:n},()=>new THREE.Vector3());
    this.hulls=body.cage.faces.map(face=>[...face.map(i=>this.start[i]),...face.map(i=>this.end[i])]);
    this.faceBounds=new Float64Array(body.cage.faces.length*6);
    this.restDeterminants=body.cage.faces.map(([a,b,c])=>determinant(
      this.a.fromArray(body.cage.rest,a*3),this.b.fromArray(body.cage.rest,b*3),this.c.fromArray(body.cage.rest,c*3)));
    for (let i=0;i<body.cage.faces.length;i++) for (let j=i+1;j<body.cage.faces.length;j++) {
      if (!body.cage.faces[i].some(node=>body.cage.faces[j].includes(node))) this.pairs.push([i,j]);
    }
  }

  valid(from: Float64Array,to: Float64Array): boolean {
    this.reason='clear'; this.minVolumeRatio=Infinity;
    this.centre0.set(0,0,0); this.centre1.set(0,0,0);
    for (let i=0;i<this.start.length;i++) {
      this.start[i].fromArray(from,i*3); this.end[i].fromArray(to,i*3);
      this.centre0.add(this.start[i]); this.centre1.add(this.end[i]);
    }
    this.centre0.multiplyScalar(1/this.start.length); this.centre1.multiplyScalar(1/this.start.length);
    for (let f=0;f<this.body.cage.faces.length;f++) {
      const [ia,ib,ic]=this.body.cage.faces[f];
      this.a.subVectors(this.start[ia],this.centre0);this.b.subVectors(this.start[ib],this.centre0);this.c.subVectors(this.start[ic],this.centre0);
      this.da.subVectors(this.end[ia],this.centre1).sub(this.a);
      this.db.subVectors(this.end[ib],this.centre1).sub(this.b);
      this.dc.subVectors(this.end[ic],this.centre1).sub(this.c);
      const c0=determinant(this.a,this.b,this.c);
      const c1=determinant(this.da,this.b,this.c)+determinant(this.a,this.db,this.c)+determinant(this.a,this.b,this.dc);
      const c2=determinant(this.da,this.db,this.c)+determinant(this.da,this.b,this.dc)+determinant(this.a,this.db,this.dc);
      const c3=determinant(this.da,this.db,this.dc);
      const evaluate=(t:number)=>((c3*t+c2)*t+c1)*t+c0;
      let minimum=Math.min(c0,evaluate(1));
      // Exact extrema of the cubic volume along the entire linear correction.
      if (Math.abs(c3)<1e-20) {
        if (Math.abs(c2)>1e-20) { const t=-c1/(2*c2); if(t>0&&t<1)minimum=Math.min(minimum,evaluate(t)); }
      } else {
        const discriminant=4*c2*c2-12*c3*c1;
        if (discriminant>=0) for (const sign of [-1,1]) {
          const t=(-2*c2+sign*Math.sqrt(discriminant))/(6*c3);
          if(t>0&&t<1)minimum=Math.min(minimum,evaluate(t));
        }
      }
      this.minVolumeRatio=Math.min(this.minVolumeRatio,minimum/this.restDeterminants[f]);
      if(this.minVolumeRatio<this.minVolumeFraction) { this.reason='local volume barrier';return false; }
    }
    for (const link of this.body.cage.links) {
      if(link.kind!==0)continue;
      this.a.subVectors(this.start[link.a],this.start[link.b]);
      this.da.subVectors(this.end[link.a],this.end[link.b]).sub(this.a);
      const t=Math.max(0,Math.min(1,-this.a.dot(this.da)/Math.max(1e-30,this.da.lengthSq())));
      const min=this.b.copy(this.a).addScaledVector(this.da,t).length();
      const max=Math.max(this.a.length(),this.b.copy(this.a).add(this.da).length());
      if(min<link.length*this.minEdgeFraction || max>link.length*this.maxEdgeFraction){this.reason='edge bound';return false;}
    }
    for(let f=0;f<this.hulls.length;f++)for(let k=0;k<3;k++) {
      let min=Infinity,max=-Infinity;
      for(const v of this.hulls[f]){min=Math.min(min,v.getComponent(k));max=Math.max(max,v.getComponent(k));}
      this.faceBounds[f*6+k]=min; this.faceBounds[f*6+k+3]=max;
    }
    for(const [a,b] of this.pairs){
      let separate=false;
      for(let k=0;k<3;k++)if(this.faceBounds[a*6+k+3]+1e-4<this.faceBounds[b*6+k]||this.faceBounds[b*6+k+3]+1e-4<this.faceBounds[a*6+k]){separate=true;break;}
      if(!separate&&!hullsSeparated(this.hulls[a],this.hulls[b],1e-4)){this.reason='surface self-contact';return false;}
    }
    return true;
  }
}
