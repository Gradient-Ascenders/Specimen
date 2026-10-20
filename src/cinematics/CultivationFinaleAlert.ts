import * as THREE from 'three';
import {VOLT_FINALE as T,finaleSmooth,sampleVoltFinaleDrone,type VoltFinalePoint} from './CultivationFinaleTimeline.ts';

// Climb outside the battery's footprint, then approach around its front/back
// corners. In particular, the two late arrivals never cut diagonally through
// the glass. Curves/arc lengths are prepared with the level, not at the trigger.
const GUIDES:readonly(readonly VoltFinalePoint[])[]=[
  [[-5,23,33],[-4,28,37]],
  [[-7,24,38],[1,30,41]],
  [[-7,23,56.5],[-13,29,60]],
  [[9,28,62.5],[16,30,66]],
  [[-7.5,27.4,57],[-9,32,42]],
  [[8.5,32,56.5],[-8,32,57],[-15,31,49]],
  [[-8,26,35],[-8,32,57],[-4,32.2,57]],
  [[3,25,63],[-1,30,69]],
  [[10,34,56.5],[6,32,57]],
];

export class CultivationFinaleAlertFlight {
  private readonly curve:THREE.CatmullRomCurve3;
  private readonly initial:THREE.Vector3;
  private readonly target=new THREE.Vector3();
  private readonly correction=new THREE.Vector3();
  readonly start:number;
  readonly index:number;
  constructor(index:number,home:THREE.Vector3){
    this.index=index;this.initial=home.clone();this.start=T.open+index*.18;
    sampleVoltFinaleDrone(index,T.alerted,this.target);
    this.curve=new THREE.CatmullRomCurve3([home.clone(),...GUIDES[index].map(p=>new THREE.Vector3(...p)),this.target.clone()],false,'catmullrom',.18);
    this.curve.arcLengthDivisions=192;this.curve.updateArcLengths();
  }
  progress(t:number):number{return THREE.MathUtils.clamp((t-this.start)/(T.alerted-this.start),0,1);}
  sample(t:number,home:THREE.Vector3,out:THREE.Vector3):void{
    const u=this.progress(t),travel=THREE.MathUtils.clamp(u*u*u*(u*(u*6-15)+10),0,1);
    this.curve.getPointAt(travel,out);
    this.correction.subVectors(home,this.initial).multiplyScalar(1-finaleSmooth(0,.4,u));out.add(this.correction);
    sampleVoltFinaleDrone(this.index,t,this.target);out.lerp(this.target,finaleSmooth(.75,1,u));
  }
}
