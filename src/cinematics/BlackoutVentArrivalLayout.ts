import * as THREE from 'three';
import {BLACKOUT_CHECKPOINTS} from '../levels/BlackoutFoundationManifest.ts';

export type BlackoutArrivalSlime='bob'|'goop'|'volt';
export const BLACKOUT_ENTRY_VENT=Object.freeze({
  halfWidth:1.9,height:3.15,floorY:2.2,mouthZ:-1.45,startZ:-28,
  slideSpeed:6,slope:.38,returnStart:6,duration:7,
  collapseStart:4.35,collapseImpact:4.8,collapseEnd:5.05,blockageZ:-2.55,
  release:Object.freeze({goop:2.9,bob:3.4,volt:3.9}),
  land:Object.freeze({goop:3.85,bob:4.45,volt:4.95}),
});
const V=BLACKOUT_ENTRY_VENT;
const lane=(id:BlackoutArrivalSlime)=>id==='bob'?-.28:id==='volt'?.28:0;
export const blackoutArrivalSmooth=(u:number):number=>{
  u=THREE.MathUtils.clamp(u,0,1);return u*u*(3-2*u);
};
/** A rounded last metre settles the sloped chute into a level wall outlet. */
export function blackoutEntryVentFloor(z:number):number{
  const d=-3.5-z;
  return V.floorY+V.slope*(d>=1?d-.5:d>0?d*d*.5:0);
}
export function blackoutEntryVentPitch(z:number):number{
  return Math.atan(V.slope*THREE.MathUtils.clamp(-3.5-z,0,1));
}
/** One persistent body per character; all land on the existing CP1 apron. */
export function sampleBlackoutArrival(id:BlackoutArrivalSlime,t:number,out:THREE.Vector3):void{
  const release=V.release[id],land=V.land[id];
  if(t<release){
    const z=V.mouthZ+V.slideSpeed*(t-release);
    out.set(lane(id),blackoutEntryVentFloor(z)+.46/Math.cos(blackoutEntryVentPitch(z)),z);return;
  }
  const end=BLACKOUT_CHECKPOINTS[0]!.bodyPositions[id];
  if(t>=land){out.copy(end);return;}
  const u=(t-release)/(land-release),u2=u*u,u3=u2*u;
  // Preserve the chute's forward velocity at the lip, then brake on landing.
  const z=(2*u3-3*u2+1)*V.mouthZ+(u3-2*u2+u)*V.slideSpeed*(land-release)+(-2*u3+3*u2)*end.z;
  out.set(THREE.MathUtils.lerp(lane(id),end.x,blackoutArrivalSmooth(u)),
    V.floorY+.46-V.floorY*u2,z);
}
