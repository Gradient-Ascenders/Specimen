import * as THREE from 'three';

export const COLLISION_TOLERANCE = 1e-7;

/** SAT for a triangle or the convex hull of its start/end vertices against
 * a box. The swept hull contains every linearly interpolated triangle, so a
 * separated hull proves continuous clearance, including thin obstacles.
 * All triples/pairs include the hull's face/edge axes; redundant axes are safe.
 * The skin is conservative (rounded corners may be slightly overestimated). */
export class ConvexSweep {
  readonly normal = new THREE.Vector3();
  gap = -Infinity;
  private readonly axis = new THREE.Vector3();
  private readonly edge = new THREE.Vector3();
  private readonly other = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly half = new THREE.Vector3();

  box(points: readonly THREE.Vector3[], bounds: THREE.Box3, skin: number, stopAtSeparation = true): boolean {
    bounds.getCenter(this.centre); bounds.getSize(this.half).multiplyScalar(.5);
    this.gap = -Infinity;
    const test = (axis: THREE.Vector3): boolean => {
      const length=axis.length();
      if (length<1e-12) return false;
      axis.multiplyScalar(1/length);
      let min=Infinity,max=-Infinity;
      const centreProjection=this.centre.dot(axis);
      for (const point of points) { const d=point.dot(axis)-centreProjection; min=Math.min(min,d); max=Math.max(max,d); }
      const extent=Math.abs(axis.x)*this.half.x+Math.abs(axis.y)*this.half.y+Math.abs(axis.z)*this.half.z;
      const positive=min-extent-skin, negative=-max-extent-skin;
      const gap=Math.max(positive,negative);
      if (gap>this.gap) { this.gap=gap; this.normal.copy(axis).multiplyScalar(positive>=negative?1:-1); }
      return stopAtSeparation && gap>=-COLLISION_TOLERANCE;
    };
    for (let axis=0; axis<3; axis++) if (test(this.axis.set(0,0,0).setComponent(axis,1))) return false;
    for (let i=0;i<points.length;i++) for (let j=i+1;j<points.length;j++) {
      this.edge.subVectors(points[j],points[i]);
      for (let axis=0;axis<3;axis++) {
        this.axis.set(0,0,0).setComponent(axis,1).cross(this.edge);
        if (test(this.axis)) return false;
      }
      for (let k=j+1;k<points.length;k++) {
        this.other.subVectors(points[k],points[i]); this.axis.crossVectors(this.edge,this.other);
        if (test(this.axis)) return false;
      }
    }
    return this.gap < -COLLISION_TOLERANCE;
  }
}

/** Conservative hull-hull separation for non-neighbour surface self-contact.
 * AABB first; any separating direction proves clearance. Missing a degenerate
 * hull axis only causes conservative rejection, never permission to cross. */
export function hullsSeparated(a: readonly THREE.Vector3[], b: readonly THREE.Vector3[], margin: number): boolean {
  const axis=new THREE.Vector3(), edge=new THREE.Vector3(), other=new THREE.Vector3(), faceNormal=new THREE.Vector3();
  const separates=(n: THREE.Vector3) => {
    const length=n.length(); if (length<1e-12) return false;
    let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity;
    for (const p of a) { const d=p.dot(n);minA=Math.min(minA,d);maxA=Math.max(maxA,d); }
    for (const p of b) { const d=p.dot(n);minB=Math.min(minB,d);maxB=Math.max(maxB,d); }
    return Math.max(minA-maxB,minB-maxA)>=margin*length;
  };
  for (let k=0;k<3;k++) if (separates(axis.set(0,0,0).setComponent(k,1))) return true;
  for (const points of [a,b]) for (let i=0;i<points.length;i++) for (let j=i+1;j<points.length;j++) {
    edge.subVectors(points[j],points[i]);
    if(separates(edge))return true;
    for (let k=j+1;k<points.length;k++) {
      faceNormal.crossVectors(edge,other.subVectors(points[k],points[i]));
      if(separates(faceNormal)||separates(axis.crossVectors(edge,faceNormal))||separates(axis.crossVectors(other,faceNormal)))return true;
    }
  }
  for (let i=0;i<a.length;i++) for (let j=i+1;j<a.length;j++) {
    edge.subVectors(a[j],a[i]);
    for (let k=0;k<b.length;k++) for (let l=k+1;l<b.length;l++) {
      if (separates(axis.crossVectors(edge,other.subVectors(b[l],b[k])))) return true;
    }
  }
  return false;
}
