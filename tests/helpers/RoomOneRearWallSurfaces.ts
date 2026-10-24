import type * as THREE from 'three';
import {collectOpaqueTriangles,findOpaqueSurfaceOverlaps} from '../../src/render/geometry/OpaqueSurfaceAudit.ts';

/** Spatial scope, not a material/name exemption: the rear wall, its returns,
 * backing and instruments, including same-mesh and same-batch triangles. */
export function auditRoomOneRearWall(root:THREE.Object3D,tolerance:number){
  const triangles=collectOpaqueTriangles(root).filter(t=>t.min[2]<-5.4&&t.max[2]>-6.7&&
    t.min[0]<7&&t.max[0]>-7&&t.min[1]<8&&t.max[1]>0);
  const conflicts:{first:string;second:string;firstTriangle:number;secondTriangle:number;
    area:number;separation:number;centre:number[]}[]=[];
  findOpaqueSurfaceOverlaps(triangles,tolerance,(a,b,area,separation,centre)=>{
    if(Math.abs(a.normal.z)<.9||centre.z>=-5.4||centre.z<=-6.7||Math.abs(centre.x)>=7)return;
    conflicts.push({first:a.owner,second:b.owner,firstTriangle:a.triangle,secondTriangle:b.triangle,
      area,separation,centre:centre.toArray()});
  });
  return {triangleCount:triangles.length,conflicts};
}
