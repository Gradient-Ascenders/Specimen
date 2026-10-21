import * as THREE from 'three';
import type { CombatImpact, CombatImpactResult } from '../combat/CombatTargetRegistry.ts';

export type FinalBossState = 'idle'|'intro'|'combat'|'exposed'|'transition'|'defeated'|'escape'|'complete'|'suspended';
export type FinalBossAttack = 'sweep'|'strike'|'summon'|'shockwave'|'sectors'|'devastation';
export type FinalAttackStage = 'telegraph'|'active'|'recovery';
export interface FinalBossReadModel {
  state:FinalBossState; phase:1|2; health:number; readonly maximumHealth:number;
  playerHealth:number; readonly maximumPlayerHealth:number; invulnerability:number;
  attack:FinalBossAttack; stage:FinalAttackStage; progress:number; elapsed:number;
  attackSerial:number; vulnerabilityRemaining:number; weakPointOpen:boolean;
  readonly lockedTarget:THREE.Vector3; readonly selectedSectors:readonly number[];
  hitFlash:number; rejectedFlash:number; staggered:boolean;
}
const PHASE_ONE:readonly FinalBossAttack[]=['sweep','strike','summon','strike'];
const PHASE_TWO:readonly FinalBossAttack[]=['sectors','sweep','shockwave','devastation','summon','strike'];
const TIMING:Record<FinalBossAttack,readonly[number,number,number]>={
  sweep:[2.2,3.2,.65], strike:[2.1,1.4,.65], summon:[1.8,1.4,.65],
  shockwave:[2,2.4,.65], sectors:[2.8,3.4,.65], devastation:[3.6,2.7,.8],
};
/** Pure fixed-step encounter authority. Rendering/collision never choose phases. */
export class FinalBossController {
  readonly readModel:FinalBossReadModel={
    state:'idle',phase:1,health:180,maximumHealth:180,playerHealth:100,maximumPlayerHealth:100,
    invulnerability:0,attack:'sweep',stage:'telegraph',progress:0,elapsed:0,attackSerial:0,
    vulnerabilityRemaining:0,weakPointOpen:false,lockedTarget:new THREE.Vector3(),
    selectedSectors:[0,2,4],hitFlash:0,rejectedFlash:0,staggered:false,
  };
  private patternIndex=0;
  private totalTime=0;
  private lastDamageAttack=-1;
  private transitionPending=false;
  private defeatPending=false;
  private defeatDelivered=false;
  private transitionDelivered=false;
  private chainKills=0;
  private chainWindow=0;
  private staggerUsed=false;
  private disposed=false;
  get cinematic():boolean { return ['intro','transition','defeated','escape'].includes(this.readModel.state); }
  get combatActive():boolean { return this.readModel.state==='combat'||this.readModel.state==='exposed'; }
  get time():number { return this.totalTime; }
  start(skipIntro=false):boolean {
    if(this.disposed||this.readModel.state!=='idle')return false;
    this.readModel.state=skipIntro?'combat':'intro';this.readModel.elapsed=0;return true;
  }
  update(dt:number, target:THREE.Vector3Like):void {
    if(this.disposed||!Number.isFinite(dt)||dt<=0)throw new Error('Final boss requires a positive finite step.');
    const m=this.readModel;
    if(m.state==='idle'||m.state==='suspended'||m.state==='complete')return;
    this.totalTime+=dt;m.hitFlash=Math.max(0,m.hitFlash-dt);m.rejectedFlash=Math.max(0,m.rejectedFlash-dt);
    m.invulnerability=Math.max(0,m.invulnerability-dt);this.chainWindow=Math.max(0,this.chainWindow-dt);
    if(this.chainWindow===0)this.chainKills=0;
    // Hit authority closes immediately; transitions commit at the next step.
    if(this.defeatPending) {
      this.defeatPending=false;m.state='defeated';m.elapsed=0;m.weakPointOpen=false;return;
    }
    if(this.transitionPending) {
      this.transitionPending=false;m.state='transition';m.elapsed=0;m.weakPointOpen=false;return;
    }
    if(m.state==='intro'||m.state==='transition'||m.state==='defeated'||m.state==='escape') {
      m.elapsed+=dt;
      const duration=m.state==='intro'?9:m.state==='transition'?5:m.state==='defeated'?7:6;
      m.progress=Math.min(1,m.elapsed/duration);
      if(m.elapsed>=duration)this.finishCinematic(target);
      return;
    }
    if(m.state==='exposed') {
      m.vulnerabilityRemaining=Math.max(0,m.vulnerabilityRemaining-dt);
      if(m.vulnerabilityRemaining===0)this.nextAttack(target);
      return;
    }
    // Commit aim at the BEGINNING of the warning, never track after it.
    if(m.elapsed===0&&m.stage==='telegraph')m.lockedTarget.copy(target);
    const timings=TIMING[m.attack];
    let remaining=dt;
    while(remaining>1e-9&&m.state==='combat') {
      const index=m.stage==='telegraph'?0:m.stage==='active'?1:2;
      const duration=timings[index]!;
      const consumed=Math.min(remaining,duration-m.elapsed);
      m.elapsed+=consumed;remaining-=consumed;m.progress=Math.min(1,m.elapsed/duration);
      if(m.elapsed<duration-1e-9)break;
      m.elapsed=0;m.progress=0;
      if(m.stage==='telegraph')m.stage='active';
      else if(m.stage==='active')m.stage='recovery';
      else this.expose(5.5,false);
    }
  }
  skipCinematic(target:THREE.Vector3Like):boolean {
    if(!this.cinematic)return false;
    this.finishCinematic(target);return true;
  }
  applyImpact(impact:CombatImpact):CombatImpactResult {
    const m=this.readModel;
    if(!this.combatActive||!m.weakPointOpen||this.transitionPending||this.defeatPending) {
      m.rejectedFlash=.3;return {accepted:false,destroyed:false,rejectionReason:'weak-point-closed'};
    }
    if(!Number.isFinite(impact.damageUnits)||impact.damageUnits<=0)return {accepted:false,destroyed:false,rejectionReason:'invulnerable'};
    const floor=m.phase===1?m.maximumHealth/2:0;
    m.health=Math.max(floor,m.health-impact.damageUnits);m.hitFlash=.22;
    if(m.phase===1&&m.health<=floor) {m.weakPointOpen=false;this.transitionPending=true;}
    if(m.phase===2&&m.health<=0) {m.weakPointOpen=false;this.defeatPending=true;}
    return {accepted:true,destroyed:m.health===0};
  }
  damagePlayer(amount:number, attackSerial=this.readModel.attackSerial):boolean {
    const m=this.readModel;
    if(!this.combatActive||this.transitionPending||this.defeatPending||m.invulnerability>0||this.lastDamageAttack===attackSerial||!Number.isFinite(amount)||amount<=0)return false;
    this.lastDamageAttack=attackSerial;m.playerHealth=Math.max(0,m.playerHealth-amount);m.invulnerability=1.1;
    return true;
  }
  droneDestroyed():void {
    if(!this.combatActive||this.readModel.phase!==2||this.staggerUsed)return;
    this.chainKills=this.chainWindow>0?this.chainKills+1:1;this.chainWindow=.35;
    if(this.chainKills>=3) {this.staggerUsed=true;this.expose(5,true);}
  }
  consumeDefeat():boolean {
    if(this.defeatDelivered||!['defeated','escape','complete'].includes(this.readModel.state))return false;
    this.defeatDelivered=true;return true;
  }
  consumeTransition():boolean {
    if(this.transitionDelivered||this.readModel.phase!==2)return false;
    this.transitionDelivered=true;return true;
  }
  suspend():void { this.readModel.state='suspended';this.readModel.weakPointOpen=false; }
  reset():void {
    const m=this.readModel;
    m.state='idle';m.phase=1;m.health=m.maximumHealth;m.playerHealth=100;m.invulnerability=0;
    m.attack='sweep';m.stage='telegraph';m.progress=0;m.elapsed=0;m.attackSerial=0;
    m.vulnerabilityRemaining=0;m.weakPointOpen=false;m.hitFlash=0;m.rejectedFlash=0;m.staggered=false;
    m.lockedTarget.set(0,0,0);(m.selectedSectors as number[]).splice(0,6,0,2,4);
    this.patternIndex=0;this.totalTime=0;this.lastDamageAttack=-1;this.transitionPending=false;
    this.defeatPending=false;this.defeatDelivered=false;this.transitionDelivered=false;
    this.chainKills=0;this.chainWindow=0;this.staggerUsed=false;
  }
  dispose():void { if(this.disposed)return;this.reset();this.disposed=true; }
  private expose(seconds:number,staggered:boolean):void {
    const m=this.readModel;m.state='exposed';m.weakPointOpen=true;m.vulnerabilityRemaining=seconds;m.staggered=staggered;
  }
  private nextAttack(target:THREE.Vector3Like):void {
    const m=this.readModel;const pattern=m.phase===1?PHASE_ONE:PHASE_TWO;
    m.attack=pattern[this.patternIndex++%pattern.length]!;m.attackSerial++;m.state='combat';m.stage='telegraph';
    m.elapsed=0;m.progress=0;m.weakPointOpen=false;m.staggered=false;m.lockedTarget.copy(target);
    // Alternate patterns always leave three wide safe sectors, including perimeter.
    const parity=m.attackSerial%2;(m.selectedSectors as number[]).splice(0,6,parity,parity+2,parity+4);
  }
  private finishCinematic(target:THREE.Vector3Like):void {
    const m=this.readModel;
    if(m.state==='defeated') {m.state='escape';m.elapsed=0;m.progress=0;return;}
    if(m.state==='escape') {m.state='complete';m.elapsed=0;return;}
    if(m.state==='transition') {m.phase=2;this.patternIndex=0;}
    this.nextAttack(target);
  }
}
