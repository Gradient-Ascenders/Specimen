import * as THREE from 'three';
import {voltFinaleTime as at} from './CultivationFinaleTiming.ts';
import {VOLT_FINALE_VENT as V,VOLT_FINALE_RIDER_OFFSETS,VOLT_FINALE_CELL as CELL,VOLT_FINALE_COVER as COVER} from './CultivationFinaleLayout.ts';
export {VOLT_FINALE_VENT} from './CultivationFinaleLayout.ts';

export type VoltFinalePoint = readonly [number, number, number];
type Key = readonly [number, VoltFinalePoint];
const AUTHORED = {
  duration: 122.5, button: 1.2, open: 2.8, alarmEnd: 8, scanVolt: 10.5,
  critical: 14, terminateVolt: 15.2, coverRun: 18, coverHit: 22.2,
  coverImpact: 23.2, acidHit: 26.1, coverGone: 26.25, scanBob: 31, catastrophic: 34.5,
  terminateBob: 36, voltJump: 40.1, hijack: 41.1, firstKill: 48,
  secondKill: 54.4, watching: 57.5, ambush: 60, goopShot: 63,
  ambushKill: 63.7, goopReveal: 66, even: 70, pickup: 76, getOn: 78,
  bobJump: 80.3, boarded: 81.8, escape: 82, ventArrive: 90.8,
  bobVentJump: 91.55, bobVentLand: 92.9, voltVentJump: 92.2, ductLand: 93.6,
  powerOff: 94.25, rideFall: 94.7, rideAcidHit: 97.4,
  followMe: 100.5, ductRun: 103.7, ductShake: 106.5, grateWarning: 107.6, brake: 108.4, grateBreak: 109.5,
  drop: 109.6, ductSilence: 112.6, grilleReveal: 114, roomPeek: 116.5, fade: 121.5,
  cellOpen: 5.1, alerted: 8.3, coverJump: 21.65, coverLand: 22.7,
  ambushNotice: 62.55, ventCamera: 98.8,
};
export const VOLT_FINALE = Object.freeze(Object.fromEntries(
  Object.entries(AUTHORED).map(([key,time])=>[key,at(time)]),
)) as Readonly<typeof AUTHORED>;
const T=VOLT_FINALE;
const timed=(keys:readonly Key[]):readonly Key[]=>keys.map(([t,p])=>[at(t),p]);
const same=(p:VoltFinalePoint,q:VoltFinalePoint)=>p[0]===q[0]&&p[1]===q[1]&&p[2]===q[2];
export const finaleSmooth=(a:number,b:number,t:number):number=>{
  const u=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);
};

/** Timed Hermite travel with zero tangent at deliberate holds. No per-frame arrays. */
function track(keys:readonly Key[],t:number,out:THREE.Vector3):void{
  if(t<=keys[0][0]){out.fromArray(keys[0][1]);return;}
  for(let i=1;i<keys.length;i++)if(t<keys[i][0]){
    const a=keys[i-1],b=keys[i],before=keys[Math.max(0,i-2)],after=keys[Math.min(keys.length-1,i+1)];
    const span=b[0]-a[0],u=(t-a[0])/span,u2=u*u,u3=u2*u;
    const holdA=same(before[1],a[1])||same(a[1],b[1]),holdB=same(a[1],b[1])||same(b[1],after[1]);
    for(let axis=0;axis<3;axis++){
      const delta=b[1][axis]-a[1][axis],slope=delta/span;
      let m0=holdA||delta*(a[1][axis]-before[1][axis])<=0?0:(b[1][axis]-before[1][axis])/(b[0]-before[0]);
      let m1=holdB||delta*(after[1][axis]-b[1][axis])<=0?0:(after[1][axis]-a[1][axis])/(after[0]-a[0]);
      // Prevent a smooth-looking corner from bulging outside its clear lane
      // into a wall/cable. Constant axes and extrema have zero tangent.
      if(slope&&Math.abs(m0+m1)>3*Math.abs(slope)){
        const scale=3*Math.abs(slope)/Math.abs(m0+m1);m0*=scale;m1*=scale;
      }
      out.setComponent(axis,(2*u3-3*u2+1)*a[1][axis]+(u3-2*u2+u)*span*m0+(-2*u3+3*u2)*b[1][axis]+(u3-u2)*span*m1);
    }return;
  }
  out.fromArray(keys[keys.length-1][1]);
}
const BOB=timed([
  [0,[0,29.66,28.1]],[.45,[0,29.66,28.1]],[1.2,[0,29.66,27.73]],
  [1.55,[0,29.66,27.73]],[2.4,[0,29.66,28.1]],[18,[0,29.66,28.1]],[20,[.15,29.66,32.7]],
  [21.6,[.2,29.66,36.4]],[22.25,[.3,29.66,38.18]],[23,[.1,29.66,38.05]],
  [79.8,[.1,29.66,38.05]],
]);
const RIDE=timed([
  [39,[.65,CELL.scannerY,42.2]],[41.1,[.65,CELL.scannerY,42.2]],
  // The fight goes around the cell and the suspended platform clusters,
  // never through the battery or its live suspension/power feeds.
  [42.5,[5.3,32,42]],[44.3,[5.7,33.5,52.5]],[45.1,[15.9,32,54.7]],
  [46.7,[17.2,31,67.5]],[48.2,[8,33.2,72.2]],[49.8,[-8,31.5,72.5]],
  [51.3,[-17,28.5,64.7]],[53,[-17,30.6,43]],[54.2,[-6.3,33,42]],
  [55.3,[-5.8,33.5,54.8]],[56.3,[5.5,32.2,55]],[57.5,[16.8,31.2,54.8]],
  [60,[17.2,29.8,66.5]],[69,[16.3,29.5,66.8]],
  [71,[17.1,31.4,61.6]],[73,[16.7,32,54.5]],[74.5,[6.2,32.2,53.6]],
  [76,[6.1,32,42]],[77.4,[4.2,29.7,37.5]],
  [82,[4.2,29.7,37.5]],
]);
const ESCAPE=new THREE.CatmullRomCurve3([
  new THREE.Vector3(4.2,29.7,37.5),new THREE.Vector3(5.8,32.1,42.8),
  new THREE.Vector3(6.4,32.6,51.4),new THREE.Vector3(9.5,32,53.7),
  new THREE.Vector3(15.5,30.8,54.7),new THREE.Vector3(17.35,29.4,57.8),
  new THREE.Vector3(17.35,V.y+.35,V.z),
],false,'centripetal');
ESCAPE.arcLengthDivisions=512;ESCAPE.updateArcLengths();
const escapeProgress=(t:number)=>{
  const u=THREE.MathUtils.clamp((t-T.escape)/(T.ventArrive-T.escape),0,1);
  return THREE.MathUtils.clamp(u*u*u*(u*(u*6-15)+10),0,1);
};
const INTERCEPTORS=new THREE.CatmullRomCurve3([
  new THREE.Vector3(5.5,31,53.6),new THREE.Vector3(17,30.4,54.8),new THREE.Vector3(17,31,68),
  new THREE.Vector3(8,32,72),new THREE.Vector3(-8,31.5,72),new THREE.Vector3(-17,30.8,64.8),
  new THREE.Vector3(-17,30,42),new THREE.Vector3(-6,32,42),new THREE.Vector3(-6,32.5,55),
],true,'catmullrom',.1);
INTERCEPTORS.arcLengthDivisions=512;INTERCEPTORS.updateArcLengths();
const INTERCEPTOR_PHASE=[0,0,.55,.18,0,.72,.92,.39,.98] as const;
const interceptorHome=(index:number):VoltFinalePoint=>{
  const p=INTERCEPTORS.getPointAt(INTERCEPTOR_PHASE[index]);return[p.x,p.y,p.z];
};
const STAGING:readonly VoltFinalePoint[]=[
  [.65,COVER.droneY,40.1],[9,31,43],interceptorHome(2),interceptorHome(3),
  [-8,33,31],interceptorHome(5),interceptorHome(6),interceptorHome(7),interceptorHome(8),
];
/** Each flying opponent has an on-screen destruction event. Volt's captured
 * craft stays powered until both riders have jumped safely into the vent. */
export const VOLT_FINALE_KILLS=Object.freeze([
  {index:2,time:T.firstKill},{index:5,time:at(50.3)},{index:6,time:at(52)},
  {index:3,time:T.secondKill},{index:7,time:at(55.9)},{index:8,time:at(57.15)},
  {index:4,time:T.ambushKill},
]);
const GOOP=timed([
  [0,[24,V.y+.46,V.z]],[62,[24,V.y+.46,V.z]],[63,[20.85,V.y+.46,V.z]],
  [90.8,[20.85,V.y+.46,V.z]],[92.8,[24,V.y+.46,V.z+.05]],
  [95.8,[28,V.y+.46,V.z+.05]],[103.7,[28,V.y+.46,V.z+.05]],
]);
export function sampleVoltFinaleDrone(index:number,t:number,out:THREE.Vector3):void{
  if(index===0){
    if(t<T.coverImpact){out.fromArray(STAGING[0]);
      const hover=1-finaleSmooth(T.coverHit,T.coverImpact,t);
      out.x+=Math.sin(t*.7)*.13*hover;out.y+=Math.sin(t*1.5)*.07*hover;return;}
    if(t<T.acidHit){
      const u=THREE.MathUtils.clamp((t-T.coverImpact)/(T.acidHit-T.coverImpact),0,1);
      out.set(.65+u*1.2,.18+(COVER.droneY-.18)*(1-u*u),40.1+u*.9);return;
    }
    out.set(1.85,.18-finaleSmooth(T.coverGone,at(29),t)*1.3,41);return;
  }
  if(index===1){
    if(t<at(28)){out.fromArray(STAGING[1]);out.y+=Math.sin(t*.8)*.16;out.z+=Math.cos(t*.44)*.22;return;}
    if(t<T.scanBob){out.fromArray(STAGING[1]);out.y+=Math.sin(t*.8)*.16;out.z+=Math.cos(t*.44)*.22;
      out.lerp(_v.set(.65,CELL.scannerY,42.2),finaleSmooth(at(28),T.scanBob,t));return;}
    if(t<T.hijack){out.set(.65,CELL.scannerY,42.2);return;}
    if(t>=T.escape){
      ESCAPE.getPointAt(escapeProgress(t),out);
      if(t>=T.rideFall){
        const u=THREE.MathUtils.clamp((t-T.rideFall)/(T.rideAcidHit-T.rideFall),0,1);
        // Drift clear of the old ground-level reunion landing. The intact
        // hull must reach exposed acid, never disappear into that dry floor.
        out.x-=.65*finaleSmooth(0,1,u);out.z-=5.5*finaleSmooth(0,1,u);
        out.y=THREE.MathUtils.lerp(out.y,.18,u*u)-finaleSmooth(T.rideAcidHit,T.rideAcidHit+1.1,t)*1.4;
      }
      return;
    }
    track(RIDE,t,out);
    return;
  }
  const age=Math.max(0,t-T.hijack),phase=index*1.7+t*.34;
  if(index!==4){
    // Arc-length travel gives the interceptors a continuous fast pursuit,
    // including turns; they do not hover decoratively during the dogfight.
    const distance=age-.5+.5*Math.exp(-age/.5);
    INTERCEPTORS.getPointAt((INTERCEPTOR_PHASE[index]+distance/13.5)%1,out);
    const idle=1-finaleSmooth(T.hijack,T.hijack+1,t);
    out.x+=Math.sin(phase)*.16*idle;out.z+=Math.cos(phase)*.16*idle;
    out.y+=Math.sin(t*1.2+index)*(.12+.24*(1-idle));
    return;
  }
  out.fromArray(STAGING[index]);out.x+=Math.sin(phase)*.32;out.y+=Math.sin(phase*.7)*.2;out.z+=Math.cos(phase)*.4;
  if(index===4&&t>=at(57.5)){
    const u=finaleSmooth(at(57.5),T.ambushKill,t);
    // Hold a long, clearly visible approach behind Bob, rather than appearing
    // a metre above his shoulder. It is still several metres away when hit.
    out.lerp(_v.set(-3.8,31.2,29.4),u);
  }
}
const _v=new THREE.Vector3();
const _ride=new THREE.Vector3(),_heading=new THREE.Vector3(),_future=new THREE.Vector3(),_pathPoint=new THREE.Vector3();
const _past=new THREE.Vector3(),_beforeHeading=new THREE.Vector3();
const _frame=new THREE.Quaternion(),_bank=new THREE.Quaternion(),_motionFrame=new THREE.Quaternion();
const _fallEuler=new THREE.Euler();
const FORWARD=new THREE.Vector3(0,0,-1),UP=new THREE.Vector3(0,1,0);
// Author the turns through deliberate hovering holds too: velocity alone is
// undefined there and used to snap the hull/riders to a different heading.
let previousYaw=0;
const RIDE_FACING=timed(([
  [39,0],[41.1,0],[42,-1.45],[43,-3.15],[44.8,-1.75],[46,-3],[47.5,1.2],
  [49,1.57],[51,.9],[52,0],[54,-1.2],[55,-3.14],[56,-1.5],[57.5,-1.55],
  [59,-3.14],[64,-1.5],[70,0],[73,1.6],[75,0],[77.4,.1],[79,-.9],[80.6,-2.5],[82,-3],
] as const).map(([t,yaw])=>{
  previousYaw+=THREE.MathUtils.euclideanModulo(yaw-previousYaw+Math.PI,2*Math.PI)-Math.PI;
  return[t,[previousYaw,0,0]] as Key;
}));
/** The same deck frame drives the hull and the riders, including its small bank. */
export function sampleVoltFinaleRideFrame(t:number,out:THREE.Quaternion):void{
  if(t>=T.escape){
    const u=escapeProgress(t);
    ESCAPE.getTangentAt(u,_heading);
    _motionFrame.setFromAxisAngle(UP,Math.atan2(-_heading.x,-_heading.z));
    out.setFromAxisAngle(UP,-3).slerp(_motionFrame,finaleSmooth(T.escape,T.escape+.8,t));
    _motionFrame.setFromAxisAngle(UP,-Math.PI/2);
    out.slerp(_motionFrame,finaleSmooth(at(90.6),at(91.45),t));
    // Analytic route tangents remain defined at zero travel speed. A broad
    // curvature sample avoids the old finite-difference/threshold roll jitter.
    ESCAPE.getTangentAt(Math.max(0,u-.025),_past);ESCAPE.getTangentAt(Math.min(1,u+.025),_future);
    const turn=Math.atan2(_past.z*_future.x-_past.x*_future.z,_past.x*_future.x+_past.z*_future.z);
    _bank.setFromAxisAngle(FORWARD,THREE.MathUtils.clamp(turn*.35,-.14,.14)*Math.sin(u*Math.PI));
    out.multiply(_bank);
    if(t>=T.rideFall){
      const age=t-T.rideFall,settle=finaleSmooth(T.rideFall,T.rideFall+.8,t);
      _bank.setFromEuler(_fallEuler.set(.18*settle,0,-.24*settle+Math.sin(age*2.2)*.04*settle));out.multiply(_bank);
    }
    return;
  }
  track(RIDE_FACING,t,_heading);out.setFromAxisAngle(UP,_heading.x);
  const combatTravel=finaleSmooth(T.hijack,T.hijack+.7,t)*(1-finaleSmooth(T.watching+1,T.watching+2.5,t));
  const escapeTravel=finaleSmooth(T.escape,T.escape+.6,t)*(1-finaleSmooth(at(90.5),at(92),t));
  const moving=Math.max(combatTravel,escapeTravel);
  let turn=0;
  if(moving>0){
    const headingTime=t>=T.escape?Math.min(t,at(90.55)):t;
    track(RIDE,headingTime,_pathPoint);track(RIDE,headingTime+.05,_future);track(RIDE,headingTime-.05,_past);
    _heading.subVectors(_future,_pathPoint);_heading.y=0;
    if(_heading.lengthSq()>.000001){
      _heading.normalize();_motionFrame.setFromUnitVectors(FORWARD,_heading);out.slerp(_motionFrame,moving);
      _beforeHeading.subVectors(_pathPoint,_past);_beforeHeading.y=0;
      if(_beforeHeading.lengthSq()>.000001){
        _beforeHeading.normalize();
        turn=Math.atan2(_beforeHeading.z*_heading.x-_beforeHeading.x*_heading.z,_beforeHeading.dot(_heading))/.05;
      }
    }
  }
  // Bank into the actual turn, then settle upright at the mouth. A continuous
  // idle roll used to tip Volt's crest just as the shot cut back to the wreck.
  _bank.setFromAxisAngle(FORWARD,THREE.MathUtils.clamp(turn*.12,-.2,.2)*moving);
  out.multiply(_bank);
}
function ridePoint(id:'bob'|'volt',t:number,out:THREE.Vector3):void{
  sampleVoltFinaleRideFrame(t,_frame);out.fromArray(VOLT_FINALE_RIDER_OFFSETS[id]).applyQuaternion(_frame);
  sampleVoltFinaleDrone(1,t,_ride);out.add(_ride);
}
export type VoltFinaleActor='bob'|'goop'|'volt';
export const voltFinaleVentJumpTime=(id:'bob'|'volt'):number=>id==='bob'?T.bobVentJump:T.voltVentJump;
export const voltFinaleLandTime=(id:VoltFinaleActor):number=>id==='bob'?T.bobVentLand:id==='volt'?T.ductLand:at(95.8);
export const voltFinaleRiding=(id:VoltFinaleActor,t:number):boolean=>
  id==='volt'&&t>=T.hijack&&t<T.voltVentJump||id==='bob'&&t>=T.boarded&&t<T.bobVentJump;
export const voltFinaleFallTime=(id:VoltFinaleActor):number=>T.drop+(id==='goop'?0:id==='bob'?.07:.14);
export function voltFinaleGrateAngle(side:0|1,t:number):number{
  const warning=finaleSmooth(T.grateWarning,T.brake,t),breakage=finaleSmooth(T.grateBreak,T.grateBreak+.65,t);
  const tremor=finaleSmooth(T.ductShake,T.grateWarning,t);
  const shudder=(Math.sin((t-T.grateWarning)*34)*.009*warning+Math.sin(t*47)*.003*tremor)*(1-breakage);
  const angle=Math.max(0,.07*warning+shudder+breakage*1.45);
  return angle?(side===0?-angle:angle):0;
}
const DUCT_STOPS={bob:V.dropX-.85,volt:V.dropX-.8,goop:V.dropX+.7} as const;
const DUCT_LANDINGS={bob:24.8,volt:26,goop:28} as const;
const VENT_LANDINGS={bob:22.5,volt:23} as const;
const ductLane=(id:VoltFinaleActor)=>id==='bob'?-.6:id==='volt'?.6:.05;
const DUCT_RUNS=Object.fromEntries((['bob','goop','volt'] as const).map(id=>{
  const land=DUCT_LANDINGS[id],stop=DUCT_STOPS[id];
  return[id,timed([
    ...(id==='goop'?[]:[[id==='bob'?AUTHORED.bobVentLand:AUTHORED.ductLand,[VENT_LANDINGS[id],0,0]],
      [id==='bob'?95.6:96.5,[land,0,0]]] as Key[]),
    [103.7,[land,0,0]],[104.2,[land+.85,0,0]],[105.3,[land+5.1,0,0]],
    [106.7,[land+10.8,0,0]],[107.6,[stop-1.3,0,0]],[108.4,[stop,0,0]],
  ])];
})) as Record<VoltFinaleActor,readonly Key[]>;
function grateHeight(x:number,t:number):number{
  if(x<V.dropX-1.4||x>V.dropX+1.4)return 0;
  const west=x<V.dropX,hinge=V.dropX+(west?-1.4:1.4);
  return Math.tan(voltFinaleGrateAngle(west?0:1,t))*(x-hinge);
}
export function sampleVoltFinaleActor(id:VoltFinaleActor,t:number,out:THREE.Vector3):void{
  if(id==='goop'?t>=T.ductRun:t>=voltFinaleVentJumpTime(id)){
    const lane=ductLane(id),fallStart=voltFinaleFallTime(id),land=voltFinaleLandTime(id);
    if(id!=='goop'&&t<land){
      const start=voltFinaleVentJumpTime(id),u=THREE.MathUtils.clamp((t-start)/(land-start),0,1);
      ridePoint(id,start,out);
      // Deliberate, short dismounts across the lip. Normal launch/landing
      // presentation supplies their squash and stretch; nothing blasts them.
      out.x=THREE.MathUtils.lerp(out.x,VENT_LANDINGS[id],u);
      out.y=THREE.MathUtils.lerp(out.y,V.y+.46,u)+Math.sin(u*Math.PI)*(id==='bob'?.8:.45);
      out.z=THREE.MathUtils.lerp(out.z,V.z+lane,finaleSmooth(0,1,u));return;
    }
    if(t<fallStart){
      track(DUCT_RUNS[id],t,out);out.set(out.x,V.y+.46+grateHeight(out.x,t),V.z+lane);return;
    }
    const startX=DUCT_STOPS[id],startY=V.y+.46+grateHeight(startX,fallStart);
    const fall=Math.max(0,t-fallStart);
    const spread=finaleSmooth(0,.4,fall);
    out.set(startX+(id==='goop'?-.3:.18)*spread,startY-3.2*fall-6*fall*fall,
      V.z+lane+(id==='goop'?-.12:id==='bob'?.04:-.04)*spread);return;
  }
  if(id==='goop'){track(GOOP,t,out);return;}
  if(id==='volt'){
    if(t<T.voltJump){
      const step=finaleSmooth(at(36.6),at(38.6),t);
      out.set(0,CELL.y-1.34*step,49-2.65*step);return;
    }
    if(t<T.hijack){
      const u=(t-T.voltJump)/(T.hijack-T.voltJump);
      ridePoint('volt',T.hijack,out);out.lerpVectors(_v.set(0,CELL.y-1.34,46.35),out,u);
      out.y+=Math.sin(u*Math.PI)*.85;return;
    }
    ridePoint('volt',t,out);return;
  }
  if(t<T.bobJump){
    track(BOB,t,out);
    if(t>=T.coverJump&&t<T.coverLand){const u=(t-T.coverJump)/(T.coverLand-T.coverJump);out.y+=Math.sin(u*Math.PI)*.58;}
    return;
  }
  if(t<T.boarded){
    const u=(t-T.bobJump)/(T.boarded-T.bobJump);
    ridePoint('bob',T.boarded,out);out.lerpVectors(_v.set(.1,29.66,38.05),out,u);
    out.y+=Math.sin(u*Math.PI)*1.05;return;
  }
  ridePoint('bob',t,out);
}
export function voltFinaleDroneVisible(index:number,t:number):boolean{
  if(index===1&&t>=T.rideAcidHit+1.1)return false;
  if(VOLT_FINALE_KILLS.some(kill=>kill.index===index&&t>=kill.time))return false;
  return t<T.ventCamera;
}
export interface VoltFinaleShot {
  readonly id:string;readonly start:number;readonly end:number;
  readonly eye:VoltFinalePoint;readonly to?:VoltFinalePoint;
  readonly target:VoltFinalePoint|VoltFinaleActor|'ride'|'first'|'ambush';readonly targetTo?:VoltFinalePoint;readonly fov:number;
  readonly pov?:'volt'|'bob';readonly follow?:'ride'|'first'|'goop'|'bob';readonly up?:VoltFinalePoint;
  readonly followDrone?:number;readonly targetDrone?:number;
}
const AUTHORED_SHOTS:readonly VoltFinaleShot[]=[
  {id:'button-press',start:0,end:2.8,eye:[2.5,30.9,30.9],to:[2.1,30.7,30.7],target:[0,30,27.8],fov:47},
  {id:'cell-unlocks',start:2.8,end:5.3,eye:[5.8,CELL.y+1.6,39.8],to:[4.8,CELL.y+1.3,40.5],target:[0,CELL.y+.5,46.7],fov:54},
  {id:'alarm-all-eyes',start:5.3,end:6.8,eye:[-14,33,58],to:[-14.5,32.5,57],target:[0,CELL.y,47],fov:70},
  {id:'alarm-drones-converge',start:6.8,end:8.3,eye:[15.8,32.5,36],to:[15.3,32,37],target:[0,CELL.y,47],fov:65},
  {id:'scanner-lines-up',start:8.3,end:10.5,eye:[6.8,30.4,35],to:[5.6,30,35.3],target:'first',fov:53},
  {id:'scan-volt',start:10.5,end:18,eye:[0,0,0],target:'volt',pov:'volt',fov:28},
  {id:'bob-spots-cover',start:18,end:19.4,eye:[2.7,30.7,30.8],target:'bob',fov:44},
  {id:'bob-runs-cover',start:19.4,end:21.65,eye:[4.4,31.1,32],to:[5.3,31,35],target:'bob',fov:52},
  {id:'bob-cover-shoulder',start:21.65,end:22.2,eye:[3.2,31,36.5],target:'bob',fov:46},
  {id:'cover-topples',start:22.2,end:23.05,eye:[-4.5,30.8,40.7],target:[.4,29.6,39.5],fov:54},
  {id:'cover-strike',start:23.05,end:23.45,eye:[3.9,28.1,43.2],target:'first',fov:48},
  {id:'crushed-drone-falls',start:23.45,end:24.1,eye:[4.8,1.8,-4.8],target:'first',follow:'first',fov:62},
  {id:'drone-plunge',start:24.1,end:26.25,eye:[6,2.8,-4],target:'first',follow:'first',fov:57},
  {id:'acid-wreck',start:26.25,end:29,eye:[7,1.6,34],target:'first',fov:50},
  {id:'eyes-on-bob',start:29,end:31,eye:[-6,32,31],to:[-5.4,31.5,32],target:'bob',fov:58},
  {id:'scan-bob',start:31,end:40.1,eye:[0,0,0],target:'bob',pov:'bob',fov:33},
  {id:'volt-takes-drone',start:40.1,end:41.8,eye:[-4.8,31.2,43.2],to:[-4.3,31.5,43.4],target:'volt',fov:47},
  {id:'hijack-wide',start:41.8,end:44.7,eye:[-9,34.3,39],to:[-8,34,40],target:'ride',fov:67},
  {id:'first-air-kill',start:44.7,end:47.65,eye:[-4,2,2],target:'ride',follow:'ride',fov:66},
  {id:'first-interceptor-impact',start:47.65,end:48.65,eye:[3,1,3],target:'first',followDrone:2,targetDrone:2,fov:54},
  {id:'bank-and-crossfire',start:48.65,end:52.2,eye:[3,34,77],to:[2.5,33.6,76.5],target:'ride',fov:65},
  {id:'western-evasive-pass',start:52.2,end:54,eye:[-4,35,34],to:[-4.5,34.8,35],target:'ride',fov:65},
  {id:'second-air-kill',start:54,end:55.1,eye:[-3,1.2,-3],target:'first',followDrone:3,targetDrone:3,fov:54},
  {id:'last-two-interceptors',start:55.1,end:57.5,eye:[7.5,34.8,50],target:'ride',fov:65},
  {id:'bob-watches',start:57.5,end:60,eye:[3.2,30.6,40.3],to:[3,30.5,40.4],target:'bob',fov:46},
  {id:'blind-side-ambush',start:60,end:62.55,eye:[3.3,31.1,40.7],to:[2.9,31,40.3],target:'ambush',fov:51},
  {id:'bob-notices-ambush',start:62.55,end:63,eye:[-2.7,30.4,35.7],target:'bob',fov:46},
  {id:'goop-intercepts',start:63,end:64.4,eye:[11.5,32,43],to:[11,31.5,42.5],target:'ambush',fov:65},
  {id:'bob-almost-hit',start:64.4,end:66,eye:[3.4,30.5,40],target:'bob',fov:44},
  {id:'goop-in-high-vent',start:66,end:70,eye:[16.4,V.y+1.3,63.2],to:[17.5,V.y+1.25,62.8],target:'goop',fov:42},
  {id:'now-were-even',start:70,end:75,eye:[17.7,V.y+1.05,62.6],to:[18.2,V.y+1.05,62.4],target:'goop',fov:40},
  {id:'volt-returns',start:75,end:78,eye:[8,31,31],to:[7.6,31,32],target:'ride',fov:57},
  {id:'get-on',start:78,end:80.3,eye:[2.7,31.5,43],target:[2.2,30.3,37.5],fov:51},
  {id:'bob-boards',start:80.3,end:82.2,eye:[9,31.2,33.8],to:[9.2,31.4,34],target:'bob',fov:55},
  {id:'escape-high-flight',start:82.2,end:87,eye:[-6,2.5,-7],target:'ride',follow:'ride',fov:63},
  {id:'vent-within-reach',start:87,end:90.3,eye:[11,V.y+3.5,65],to:[12,V.y+3.1,64.6],target:'ride',fov:57},
  {id:'vent-arrival',start:90.3,end:91.55,eye:[12,V.y+2.6,65.5],to:[12.6,V.y+2.1,65.2],target:'ride',fov:55},
  {id:'bob-jumps-into-vent',start:91.55,end:92.75,eye:[16.4,V.y+1.75,65.1],target:'bob',fov:60},
  {id:'volt-jumps-clear',start:92.75,end:94.25,eye:[24.8,V.y+1.2,62.45],to:[25,V.y+1.15,62.35],target:'volt',fov:66},
  {id:'drone-powers-down',start:94.25,end:95.25,eye:[19.2,V.y+1.35,64.8],to:[19.1,V.y+1.1,64.9],target:'ride',fov:55},
  {id:'empty-drone-falls',start:95.25,end:97.2,eye:[-4.5,1.8,3.8],target:'ride',follow:'ride',fov:59},
  {id:'abandoned-drone-acid',start:97.2,end:98.8,eye:[12.8,2.9,59.6],target:'ride',fov:56},
  {id:'safely-inside-airway',start:98.8,end:99.9,eye:[30.3,V.y+1.25,60.9],target:[26,V.y+.75,V.z],fov:63},
  {id:'past-goop-side-tunnel',start:99.9,end:100.5,eye:[30,V.y+1.45,60.3],target:[V.branchX-.2,V.y+1.25,65.2],fov:72},
  {id:'goop-knows-the-way',start:100.5,end:103.7,eye:[31.1,V.y+1.3,60.7],to:[31.3,V.y+1.25,60.8],target:'goop',fov:52},
  {id:'scramble-along-airway',start:103.7,end:106.5,eye:[5.2,.9,.05],target:'bob',follow:'bob',fov:72},
  {id:'race-past-service-grille',start:106.5,end:107.6,eye:[-3.5,1,.15],target:[V.inspectionX,V.y+1.3,60.1],follow:'bob',fov:76},
  {id:'duct-floor-buckles',start:107.6,end:108.4,eye:[V.dropX+1.8,V.y+.35,V.z+.9],target:[V.dropX-.1,V.y-.02,V.z+.9],fov:64},
  {id:'too-late-to-stop',start:108.4,end:109.5,eye:[V.dropX+2.2,V.y+1.45,V.z],target:'bob',fov:78},
  {id:'floor-gives-way',start:109.5,end:110,eye:[V.dropX-4,V.y+1.8,V.z],target:[V.dropX,V.y-.5,V.z],fov:78},
  {id:'deep-shaft',start:110,end:112.6,eye:[V.dropX,V.y-13,V.z],target:[V.dropX,V.y+1,V.z],up:[0,0,-1],fov:78},
  {id:'empty-airway',start:112.6,end:114,eye:[V.dropX-7,V.y+1.2,V.z],target:[V.dropX,V.y-.8,V.z],fov:68},
  {id:'loose-inspection-grille',start:114,end:116.5,eye:[V.inspectionX-2,V.y+.95,V.z],to:[V.inspectionX,V.y+.7,60.4],target:[V.inspectionX,V.y+1.05,V.roomBackZ+.3],targetTo:[V.inspectionX,V.y+.8,V.roomBackZ+.3],fov:63},
  {id:'peek-under-loose-grille',start:116.5,end:118.5,eye:[V.inspectionX,V.y+.7,60.4],to:[V.inspectionX,V.y+.7,58.95],target:[V.inspectionX,V.y+.8,V.roomBackZ+.3],fov:63},
  {id:'opposite-way-exit-room',start:118.5,end:122.5,eye:[V.inspectionX,V.y+.7,58.95],to:[V.inspectionX,V.y+1.35,58.9],target:[V.inspectionX,V.y+.8,V.roomBackZ+.3],targetTo:[V.inspectionX,V.y+1.45,V.roomBackZ+.3],fov:63},
];
export const VOLT_FINALE_SHOTS:readonly VoltFinaleShot[]=AUTHORED_SHOTS.map(shot=>({...shot,start:at(shot.start),end:at(shot.end)}));
export function voltFinaleShot(t:number):VoltFinaleShot{
  return VOLT_FINALE_SHOTS.find(shot=>t<shot.end)??VOLT_FINALE_SHOTS[VOLT_FINALE_SHOTS.length-1];
}

export interface VoltFinaleProjectile {
  readonly time:number;readonly duration:number;readonly from:VoltFinalePoint;readonly to:VoltFinalePoint;
  readonly kind:'enemy'|'hijacked'|'acid';readonly kill?:number;
}
const p=new THREE.Vector3(),q=new THREE.Vector3();
const point=(v:THREE.Vector3):VoltFinalePoint=>[v.x,v.y,v.z];
function extendMissToWall(from:THREE.Vector3,to:THREE.Vector3):number{
  let factor=Infinity;
  for(let axis=0;axis<3;axis++){
    const delta=to.getComponent(axis)-from.getComponent(axis);if(Math.abs(delta)<1e-8)continue;
    const wall=axis===0?(delta>0?19.8:-19.8):axis===1?(delta>0?37.8:.06):(delta>0?79.8:18.2);
    const u=(wall-from.getComponent(axis))/delta;if(u>1&&u<factor)factor=u;
  }
  if(Number.isFinite(factor))to.sub(from).multiplyScalar(factor).add(from);
  return from.distanceTo(to)/95;
}
function makeProjectiles():readonly VoltFinaleProjectile[]{
  const shots:VoltFinaleProjectile[]=[];
  const opponents=[2,3,5,6,7,8] as const;
  for(let time=at(42),n=0;time<at(57);time+=.32,n++){
    const index=opponents[n%opponents.length];
    const killed=VOLT_FINALE_KILLS.find(kill=>kill.index===index)!.time;
    if(time+.25>=killed)continue;
    sampleVoltFinaleDrone(index,time,p);sampleVoltFinaleDrone(1,time+.25,q);
    q.x+=(n%2?1:-1)*2.2;q.y+=(n%3-1)*1.4;
    const duration=extendMissToWall(p,q);shots.push({time,duration,from:point(p),to:point(q),kind:'enemy'});
  }
  for(const destruction of VOLT_FINALE_KILLS){
    if(destruction.index===4)continue;
    const time=destruction.time-.28;
    sampleVoltFinaleDrone(1,time,p);sampleVoltFinaleDrone(destruction.index,destruction.time,q);
    shots.push({time,duration:.28,from:point(p),to:point(q),kind:'hijacked',kill:destruction.index});
  }
  sampleVoltFinaleDrone(4,T.ambushKill,q);
  shots.push({time:T.goopShot,duration:.7,from:[20.85,V.y+.7,V.z],to:point(q),kind:'acid',kill:4});
  return shots.sort((a,b)=>a.time-b.time);
}
export const VOLT_FINALE_PROJECTILES=makeProjectiles();
