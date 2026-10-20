import * as THREE from 'three';
import { sampleContainmentFinale, type FinalePoint } from './ContainmentFinaleTimeline.ts';
import type { FinaleShot } from './ContainmentFinaleVisuals.ts';

const ROOM_INTERIOR = new THREE.Box3(new THREE.Vector3(-19.64,74.79,91.71),new THREE.Vector3(19.7,100.49,125.15));

/** Check the full travel against both moving actors, not just a floor endpoint. */
export function createFinaleEvasionShot(t:number,index:number):FinaleShot{
  const duration=.55,from=sampleContainmentFinale(t).drone;
  const frames=Array.from({length:41},(_,i)=>sampleContainmentFinale(t+duration*i/40));
  const target=frames.at(-1)!.goop;
  for(const offset of [1.3,1.65,2.1,2.8])for(const side of [index%2?1:-1,index%2?-1:1]){
    const to:FinalePoint=[target[0]+offset*side,74.85,target[2]-1.3];
    const clear=frames.every((frame,i)=>{
      const u=i/40,p=from.map((v,axis)=>v+(to[axis]-v)*u);
      return (['bob','goop'] as const).every(name=>Math.hypot(...p.map((v,axis)=>v-frame[name][axis]))>(name==='goop'?.95:.8));
    });
    if(clear)return {t,duration,green:false,from,to};
  }
  throw new Error('No safe authored drone evasion shot.');
}

/** Preparation only: extend each miss to its first physical surface, never stop in mid-air. */
export function createFinaleCombatShot(t: number, index: number, targets: readonly THREE.Object3D[]): FinaleShot {
  const frame=sampleContainmentFinale(t),future=sampleContainmentFinale(t+.6);
  const from: FinalePoint=[frame.goop[0],frame.goop[1]+.3,frame.goop[2]];
  const origin=new THREE.Vector3().fromArray(from),direction=new THREE.Vector3();
  const ray=new THREE.Raycaster(),point=new THREE.Vector3(),normal=new THREE.Vector3();
  const transform=new THREE.Matrix4(),instance=new THREE.Matrix4();
  // Deliberately lead to alternate sides: the craft dodges and the acid carries
  // on into the room, instead of disappearing next to its moving target.
  direction.set(future.drone[0]+(index%2?3.7:-3.7)-from[0],future.drone[1]-2.2-from[1],future.drone[2]-from[2]).normalize();
  ray.set(origin,direction);ray.near=.12;ray.far=90;
  const hit=ray.intersectObjects([...targets],true)[0];
  let objectName='room-5-interior-wall';
  if(hit?.face){
    point.copy(hit.point);normal.copy(hit.face.normal);objectName=hit.object.name;
    transform.copy(hit.object.matrixWorld);
    if(hit.object instanceof THREE.InstancedMesh&&hit.instanceId!==undefined){
      hit.object.getMatrixAt(hit.instanceId,instance);transform.multiply(instance);
    }
    normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(transform));
    if(normal.dot(direction)>0)normal.negate();
  }else{
    ray.ray.intersectBox(ROOM_INTERIOR,point);
    const distances=[Math.abs(point.x-ROOM_INTERIOR.min.x),Math.abs(point.x-ROOM_INTERIOR.max.x),
      Math.abs(point.y-ROOM_INTERIOR.min.y),Math.abs(point.y-ROOM_INTERIOR.max.y),
      Math.abs(point.z-ROOM_INTERIOR.min.z),Math.abs(point.z-ROOM_INTERIOR.max.z)];
    const face=distances.indexOf(Math.min(...distances));normal.set(0,0,0).setComponent(Math.floor(face/2),face%2?-1:1);
  }
  // Seat the splash in front of the visible skin, not in the collider behind it.
  point.addScaledVector(normal,.035);
  return {t,duration:origin.distanceTo(point)/30,green:true,from,to:point.toArray() as unknown as FinalePoint,
    impact:{normal:normal.toArray() as unknown as FinalePoint,objectName}};
}
