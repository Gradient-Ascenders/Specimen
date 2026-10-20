import { finaleGroundTravel } from './ContainmentFinaleBobMotion.ts';
import {sampleContainmentFinale,type FinalePoint} from './ContainmentFinaleTimeline.ts';
import type {FinaleShot} from './ContainmentFinaleVisuals.ts';
import { CONTAINMENT_FINALE_TIMING as T, FINALE_REINFORCEMENT_INTERVAL, finaleTime as F } from './ContainmentFinaleTiming.ts';

export const reinforcementRevealTime = (index:number) => T.reinforcements + index * FINALE_REINFORCEMENT_INTERVAL;
// Single-file through the real Room 4 doorway, THEN fan into separate lanes.
// Hidden starting positions sit behind the entrance, not in the middle of Room 5.
const PURSUIT_PATHS = [
  [[-6.2,83,105],[-7,80.8,114],[-5.8,78.8,120],[-4.4,77.7,122.6],[-3.8,77.5,123]],
  [[12.5,84.5,105],[7,81.3,114.3],[5.9,79.3,120.1],[4.6,78.1,122.5],[3.8,77.9,123]],
  [[3,86,104.6],[.3,81.5,113.7],[-.3,78.3,119],[0,76.05,123.1],[0,75.9,123.6]],
].map((points,index)=>[
  {t:F(65.4)+index*FINALE_REINFORCEMENT_INTERVAL,p:[9,76.8,85.5] as FinalePoint},
  {t:F(66.4)+index*FINALE_REINFORCEMENT_INTERVAL,p:[9,76.8,92.6] as FinalePoint},
  {t:F(66.8)+index*FINALE_REINFORCEMENT_INTERVAL,p:[9,76.8,95.4] as FinalePoint},
  ...points.map((p,i)=>({t:F([69.6,71.2,72.7,75.3,77.4][i])+index*.2,p:p as unknown as FinalePoint})),
]);

function ease(start:number,end:number,t:number):number{
  const u=Math.max(0,Math.min(1,(t-start)/(end-start)));return u*u*(3-2*u);
}
export function reinforcementPosition(t:number,index:number):FinalePoint{
  const path=PURSUIT_PATHS[index],p=finaleGroundTravel(path,t);
  const envelope=ease(F(66.3)+index*.32,F(68)+index*.32,t)*(1-ease(F(75.5),F(77.5),t));
  return [p[0]+Math.sin(t*2.2+index*2)*.13*envelope,
    p[1]+Math.sin(t*2.6+index)*.1*envelope,p[2]+Math.sin(t*1.7+index)*.08*envelope];
}

/** Author one close call per idle job; playback only draws the resulting fixed pool. */
export function createFinalePursuitShot(t:number,index:number):FinaleShot{
  const pursuer=index%3,duration=.4,from=reinforcementPosition(t,pursuer);
  const subject=index%2?'bob' as const:'goop' as const;
  const frames=Array.from({length:41},(_,i)=>sampleContainmentFinale(t+duration*i/40));
  const check=(to:FinalePoint)=>{
    let nearest=Infinity;
    for(let i=0;i<frames.length;i++){
      const u=i/40,p=from.map((v,axis)=>v+(to[axis]-v)*u);
      for(const name of ['bob','goop'] as const){
        const hero=frames[i][name],distance=Math.hypot(p[0]-hero[0],p[1]-hero[1],p[2]-hero[2]);
        if(distance<(name==='goop'?.9:.72))return {clear:false,nearest};
        if(name===subject)nearest=Math.min(nearest,distance);
      }
    }
    return {clear:true,nearest};
  };
  const target=sampleContainmentFinale(t+.33)[subject];
  if(target[2]<124.6&&t<F(74)){
    const dx=target[0]-from[0],dz=target[2]-from[2],length=Math.hypot(dx,dz);
    for(const offset of [.98,1.12,1.25])for(const side of [index%2?1:-1,index%2?-1:1]){
      const near:FinalePoint=[target[0]-dz/length*offset*side,target[1]+.1,target[2]+dx/length*offset*side];
      const vx=near[0]-from[0],vy=near[1]-from[1],vz=near[2]-from[2];
      const extension=Math.min(1.25,vy<0?(74.84-from[1])/vy:1.25,vz>0?(125.14-from[2])/vz:1.25);
      const to:FinalePoint=[from[0]+vx*extension,from[1]+vy*extension,from[2]+vz*extension],result=check(to);
      if(result.clear&&result.nearest<1.45)return {t,duration,green:false,pursuer,nearMiss:subject,from,to};
    }
  }
  // Once the heroes disappear inside, shots strike the metal surround, never
  // fly through the rear wall or follow them invisibly through the duct.
  for(const x of [index%2?-1.03:1.03,index%2?1.03:-1.03,-2.3,2.3]){
    const to:FinalePoint=[x,75.4+(index%3)*.28,125.14];
    if(check(to).clear)return {t,duration,green:false,pursuer,from,to};
  }
  return {t,duration,green:false,pursuer,from,to:[index%2?-3:3,77.8,125.14]};
}

/** The craft cannot fit, but its final round threads the opening as Bob dives. */
export function createFinaleDuctShot():FinaleShot{
  const pursuer=2,duration=.51;
  for(const offset of [-.08,.03,-.18,.12])for(const height of [75.65,75.85,75.45]){
    const t=T.bobDive+offset,from=reinforcementPosition(t,pursuer),to:FinalePoint=[.55,height,142];
    let nearest=Infinity,clear=true;
    for(let i=0;i<=100;i++){
      const u=i/100,frame=sampleContainmentFinale(t+duration*u);
      const p=from.map((v,axis)=>v+(to[axis]-v)*u);
      for(const name of ['bob','goop'] as const){
        const distance=Math.hypot(...p.map((v,axis)=>v-frame[name][axis]));
        if(distance<(name==='bob'?.9:1.05))clear=false;
        if(name==='bob')nearest=Math.min(nearest,distance);
      }
    }
    if(clear&&nearest<1.3)return {t,duration,green:false,pursuer,nearMiss:'bob',ductNearMiss:true,from,to};
  }
  throw new Error('No safe final duct near-miss.');
}
