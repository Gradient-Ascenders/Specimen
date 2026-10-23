import { FINAL_ARENA, FINAL_BOSS_TUNING as T } from './FinalBossConfig.ts';

const TAU=Math.PI*2;
/** Pick the shortest sweep toward the player from the warning ray, wrapping
 * correctly at +/-pi. Exact alignment/opposition uses a deterministic tie. */
export function initialBeamDirection(originYaw:number,target:{x:number;z:number}):1|-1 {
  const targetYaw=Math.atan2(-target.x,FINAL_ARENA.centreZ-target.z);
  const delta=Math.atan2(Math.sin(targetYaw-originYaw),Math.cos(targetYaw-originYaw));
  return delta< -1e-6&&Math.abs(delta+Math.PI)>1e-6?-1:1;
}
/** Phase two increases cruise speed without shortening the eased turnarounds.
 * There is no hidden-beam alignment or snapping between the arcs. */
export const BEAM_ANGULAR_SPEED=TAU/T.beamLapSeconds;
export function beamAngularSpeed(phase:1|2):number {return BEAM_ANGULAR_SPEED*(phase===2?T.phaseTwoBeamSpeedMultiplier:1);}
export function beamArcDuration(arc:number,phase:1|2=1):number {
  const travel=Math.abs(arc)/beamAngularSpeed(phase);
  return travel+Math.min(T.beamTurnSeconds,travel);
}
export function beamArcDistance(arc:number,elapsed:number,phase:1|2=1):number {
  const speed=beamAngularSpeed(phase),distance=Math.abs(arc),travel=distance/speed,ease=Math.min(T.beamTurnSeconds,travel),duration=travel+ease;
  if(distance<1e-9)return 0;
  const t=Math.max(0,Math.min(duration,elapsed));
  if(t<ease)return speed*.5*(t-ease/Math.PI*Math.sin(Math.PI*t/ease));
  if(t<=duration-ease)return speed*(t-ease/2);
  const remaining=duration-t;
  return distance-speed*.5*(remaining-ease/Math.PI*Math.sin(Math.PI*remaining/ease));
}
export function beamNominalDuration(phase:1|2):number {
  return phase===1?T.beamCircles*beamArcDuration(TAU):
    beamArcDuration(TAU,phase)+beamArcDuration(Math.PI/2,phase)+T.phaseTwoBeamHalves*beamArcDuration(Math.PI,phase);
}

/** Unwrapped angles and zero-speed joins make every reversal continuous.
 * Phase two locks its arc centre when the first circle finishes. It reverses
 * into the appropriate boundary, then makes five alternating 180° passes. */
export class ExterminatorBeamSweep {
  angle=0;
  segment=0;
  lapsCompleted=0;
  direction:1|-1=1;
  turning=true;
  targetYaw=0;
  totalDuration=beamNominalDuration(1);
  finished=false;
  private phase:1|2=1;
  private originYaw=0;
  private elapsed=0;
  private from=0;
  private arc=TAU;
  private entryArc=0;
  private firstDirection:1|-1=1;

  reset(phase:1|2,originYaw:number,firstDirection:1|-1=1):void {
    this.phase=phase;this.originYaw=originYaw;this.targetYaw=originYaw;
    this.firstDirection=firstDirection;this.angle=0;this.segment=0;this.lapsCompleted=0;this.direction=firstDirection;this.turning=true;
    this.finished=false;this.elapsed=0;this.from=0;this.arc=TAU*firstDirection;this.entryArc=0;this.totalDuration=beamNominalDuration(phase);
  }
  advance(dt:number,target:{x:number;z:number}):number {
    let remaining=dt;
    while(remaining>1e-9&&!this.finished) {
      const duration=beamArcDuration(this.arc,this.phase),consumed=Math.min(remaining,Math.max(0,duration-this.elapsed));
      this.elapsed+=consumed;remaining-=consumed;
      this.angle=this.from+this.direction*beamArcDistance(this.arc,this.elapsed,this.phase);
      const ease=Math.min(T.beamTurnSeconds,Math.abs(this.arc)/beamAngularSpeed(this.phase));
      this.turning=this.elapsed<ease||this.elapsed>duration-ease;
      if(this.elapsed<duration-1e-9)break;
      this.angle=this.from+this.arc;this.from=this.angle;this.elapsed=0;this.segment++;
      if(this.phase===1) {
        this.lapsCompleted=this.segment;
        if(this.segment===T.beamCircles){this.finished=true;break;}
        this.direction=this.direction===1?-1:1;this.arc=this.direction*TAU;
      } else {
        if(this.segment===1) {
          this.lapsCompleted=1;this.targetYaw=Math.atan2(-target.x,FINAL_ARENA.centreZ-target.z);
          const boundary=this.targetYaw-this.originYaw-this.firstDirection*Math.PI/2;
          // Reverse into the lower boundary after a positive first circle, or
          // the upper boundary after a negative one. Mirror the entire pattern,
          // without a hidden alignment spin or repeated rotation direction.
          this.direction=this.firstDirection===1?-1:1;
          const distance=(boundary-this.from)*this.direction;
          this.entryArc=this.direction*((distance%TAU+TAU)%TAU);
          this.arc=this.entryArc;
          this.totalDuration=beamArcDuration(TAU,this.phase)+beamArcDuration(this.entryArc,this.phase)+T.phaseTwoBeamHalves*beamArcDuration(Math.PI,this.phase);
        } else {
          this.lapsCompleted=this.segment-1;
          if(this.segment===T.phaseTwoBeamHalves+2){this.finished=true;break;}
          this.direction=this.segment%2===0?this.firstDirection:this.firstDirection===1?-1:1;this.arc=this.direction*Math.PI;
        }
      }
      this.turning=true;
    }
    return dt-remaining;
  }
}
