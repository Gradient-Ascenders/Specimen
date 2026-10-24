import * as THREE from 'three';
import type { CombatImpact, CombatImpactResult } from '../combat/CombatTargetRegistry.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING as T } from './FinalBossConfig.ts';
import { ExterminatorBeamSweep, beamNominalDuration, initialBeamDirection } from './ExterminatorBeamSweep.ts';

export type FinalBossState='idle'|'intro'|'combat'|'transition'|'defeated'|'escape'|'complete'|'suspended';
export type FinalBossNormalAttack='gun-blast'|'laser-shots'|'laser-beam'|'ram';
export type FinalBossAttack=FinalBossNormalAttack|'summon-defend';
export type FinalAttackStage='telegraph'|'active'|'recovery';
export interface FinalBossReadModel {
  state:FinalBossState;phase:1|2;health:number;readonly maximumHealth:number;
  playerHealth:number;readonly maximumPlayerHealth:number;invulnerability:number;
  attack:FinalBossAttack;stage:FinalAttackStage;progress:number;elapsed:number;attackSerial:number;
  weakPointOpen:boolean;shieldActive:boolean;regenerating:boolean;
  defenseIndex:number;defenseThreshold:number;summonCount:number;defendersRemaining:number;
  reinforcementIndex:number;orbCount:number;
  beamLapsCompleted:number;beamDirection:1|-1;beamDirections:readonly (1|-1)[];beamRotationRadians:number;
  beamRetargeting:boolean;beamTargetYaw:number;beamTurning:boolean;beamSegment:number;
  readonly lockedTarget:THREE.Vector3;hitFlash:number;rejectedFlash:number;stunRemaining:number;
}
const NORMAL:readonly FinalBossNormalAttack[]=['gun-blast','laser-shots','laser-beam'];
const PHASE_TWO:readonly FinalBossNormalAttack[]=[...NORMAL,'ram'];
const TIMING:Record<FinalBossAttack,readonly[number,number,number]>={
  'gun-blast':[1.1,3.85*3,1.05],
  'laser-shots':[1.35,3.65,1.15],
  'laser-beam':[2.6,beamNominalDuration(1),1.5],
  // An infinite active stage is deliberate: only destroying the entire squad
  // breaks the shield. HP regeneration is capped by maximumHealth.
  'summon-defend':[1.35,Infinity,1.2],
  'ram':[2.1,1.05,1.8],
};
export function finalBossAttackTiming(attack:FinalBossAttack,phase:1|2):readonly[number,number,number] {
  if(phase===2&&attack==='laser-shots')return [.8,.7,.8];
  if(phase===2&&attack==='laser-beam')return [1.6,beamNominalDuration(2),1];
  return TIMING[attack];
}

/** Fixed-step authority. Renderer and minion placement cannot choose attacks,
 * retrigger health thresholds, or silently time out the defensive shield. */
export class FinalBossController {
  private readonly model:FinalBossReadModel={
    state:'idle',phase:1,health:T.health,maximumHealth:T.health,playerHealth:T.playerHealth,maximumPlayerHealth:T.playerHealth,invulnerability:0,
    attack:'gun-blast',stage:'telegraph',progress:0,elapsed:0,attackSerial:0,weakPointOpen:false,shieldActive:false,regenerating:false,
    defenseIndex:0,defenseThreshold:0,summonCount:0,defendersRemaining:0,lockedTarget:new THREE.Vector3(),hitFlash:0,rejectedFlash:0,stunRemaining:0,
    reinforcementIndex:0,orbCount:T.orbCount,beamRetargeting:false,beamTargetYaw:0,beamTurning:false,beamSegment:0,
    beamLapsCompleted:0,beamDirection:1,beamDirections:[1,-1,1],beamRotationRadians:0,
  };
  readonly readModel:Readonly<FinalBossReadModel>=this.model;
  private readonly random:()=>number;
  private lastNormal:FinalBossNormalAttack|undefined;
  private totalTime=0;
  private lastMajorDamageAttack=-1;
  private transitionPending=false;
  private defeatPending=false;
  private defeatDelivered=false;
  private transitionDelivered=false;
  private disposed=false;
  private devInvincibilityEnabled=false;
  private readonly beamSweep=new ExterminatorBeamSweep();

  constructor(options:{random?:()=>number}={}) {this.random=options.random??Math.random;}
  get cinematic():boolean {return ['intro','transition','defeated','escape'].includes(this.model.state);}
  get combatActive():boolean {return this.model.state==='combat';}
  get devInvincible():boolean {return !!import.meta.env?.DEV&&this.devInvincibilityEnabled;}
  toggleDevInvincibility():void {
    if(!import.meta.env?.DEV||this.disposed||!['intro','combat','transition'].includes(this.model.state))return;
    this.devInvincibilityEnabled=!this.devInvincibilityEnabled;
  }
  get time():number {return this.totalTime;}
  start(shortIntro=false):boolean {
    if(this.disposed||this.model.state!=='idle')return false;
    this.model.state='intro';this.model.elapsed=0;
    if(shortIntro)this.finishCinematic(this.model.lockedTarget);return true;
  }
  startPhaseTwo(target:THREE.Vector3Like):boolean {
    if(this.disposed||this.model.state!=='idle')return false;
    const m=this.model;m.phase=2;m.health=T.phaseTwoHealth;m.defenseIndex=T.defenseThresholds.length;
    // Recovery must not re-emit the transition/checkpoint event or replay the
    // old shield waves. Reset defaults leave every advanced wave available.
    this.transitionDelivered=true;this.selectNormalAttack(target);return true;
  }
  update(dt:number,target:THREE.Vector3Like):void {
    if(this.disposed||!Number.isFinite(dt)||dt<=0)throw new Error('Final boss requires a positive finite step.');
    const m=this.model;
    if(m.state==='idle'||m.state==='suspended'||m.state==='complete')return;
    m.hitFlash=Math.max(0,m.hitFlash-dt);m.rejectedFlash=Math.max(0,m.rejectedFlash-dt);m.invulnerability=Math.max(0,m.invulnerability-dt);
    const stopped=m.state==='combat'?Math.min(dt,m.stunRemaining):0;
    m.stunRemaining=Math.max(0,m.stunRemaining-dt);dt-=stopped;this.totalTime+=dt;
    if(this.defeatPending){this.defeatPending=false;m.stunRemaining=0;m.state='defeated';m.elapsed=0;m.progress=0;return;}
    if(this.transitionPending){this.transitionPending=false;m.stunRemaining=0;m.state='transition';m.elapsed=0;m.progress=0;return;}
    if(dt<=1e-9)return;
    if(this.cinematic) {
      m.elapsed+=dt;const duration=m.state==='intro'?9:m.state==='transition'?5:m.state==='defeated'?7:6;
      m.progress=Math.min(1,m.elapsed/duration);if(m.elapsed>=duration)this.finishCinematic(target);return;
    }
    let remaining=dt;
    while(remaining>1e-9&&m.state==='combat') {
      if(m.attack==='summon-defend'&&m.stage==='active') {
        m.elapsed+=remaining;m.health=Math.min(m.maximumHealth,m.health+T.healPerSecond*remaining);
        m.regenerating=m.health<m.maximumHealth;return;
      }
      let duration=finalBossAttackTiming(m.attack,m.phase)[m.stage==='telegraph'?0:m.stage==='active'?1:2];
      if(m.attack==='laser-beam'&&m.stage==='active') {
        const b=this.beamSweep,consumed=b.advance(remaining,target);
        m.elapsed+=consumed;remaining-=consumed;duration=b.totalDuration;m.progress=Math.min(1,m.elapsed/duration);
        m.beamRotationRadians=b.angle;m.beamDirection=b.direction;m.beamLapsCompleted=b.lapsCompleted;
        m.beamTargetYaw=b.targetYaw;m.beamTurning=b.turning;m.beamSegment=Math.min(b.segment,m.phase===1?2:6);
      } else {
        const consumed=Math.min(remaining,duration-m.elapsed);m.elapsed+=consumed;remaining-=consumed;m.progress=Math.min(1,m.elapsed/duration);
      }
      if(m.elapsed<duration-1e-9){if(remaining>1e-9)continue;break;}
      m.elapsed=0;m.progress=0;
      if(m.stage==='telegraph') {m.stage='active';m.regenerating=m.attack==='summon-defend'&&m.health<m.maximumHealth;
        if(m.attack==='laser-beam') {
          // Choose once, at firing time, from the warning ray toward the
          // player's latest position. Later movement cannot change the pattern.
          const originYaw=m.beamTargetYaw,direction=initialBeamDirection(originYaw,target);
          this.beamSweep.reset(m.phase,originYaw,direction);m.beamDirection=direction;
          m.beamDirections=m.beamDirections.map((_,i)=>i%2===0?direction:direction===1?-1:1);
        }
        if(m.attack==='ram'||m.phase===2&&m.attack==='laser-shots')m.lockedTarget.copy(target);}
      else if(m.stage==='active')m.stage='recovery';
      else this.selectNormalAttack(target);
    }
  }
  skipCinematic(target:THREE.Vector3Like):boolean {if(!this.cinematic)return false;this.finishCinematic(target);return true;}
  ramHitWall():boolean {
    const m=this.model;if(!this.combatActive||m.attack!=='ram'||m.stage!=='active')return false;
    m.stage='recovery';m.elapsed=0;m.progress=0;return true;
  }
  applyImpact(impact:CombatImpact):CombatImpactResult {
    const m=this.model;
    if(!this.combatActive||!m.weakPointOpen||m.shieldActive||this.transitionPending||this.defeatPending) {
      m.rejectedFlash=.3;return {accepted:false,destroyed:false,rejectionReason:m.shieldActive?'invulnerable':'weak-point-closed'};
    }
    if(!Number.isFinite(impact.damageUnits)||impact.damageUnits<=0)return {accepted:false,destroyed:false,rejectionReason:'invulnerable'};
    const requested=Math.max(0,m.health-impact.damageUnits),threshold=m.phase===1?T.defenseThresholds[m.defenseIndex]:undefined;
    // Percentage products such as 200 * .55 can otherwise become
    // 110.00000000000001, making the ceil-based HUD display 111 HP.
    const shieldHealth=threshold===undefined?undefined:Math.round(m.maximumHealth*threshold*1e6)/1e6;
    m.hitFlash=.22;
    if(threshold!==undefined&&shieldHealth!==undefined&&requested<=shieldHealth+1e-8) {
      // A high-damage hit cannot skip mandatory first crossings. The shield
      // closes synchronously, also rejecting later impacts in this same step.
      m.health=shieldHealth;this.beginDefense(threshold);
    } else {
      const reinforcement=m.phase===2?T.reinforcementHealth[m.reinforcementIndex]:undefined;
      m.health=Math.max(m.phase===1?T.phaseTwoHealth:reinforcement!==undefined&&requested<=reinforcement?reinforcement:0,requested);
      if(reinforcement!==undefined&&requested<=reinforcement)m.reinforcementIndex++;
      if(m.phase===1&&m.health<=T.phaseTwoHealth){m.weakPointOpen=false;this.transitionPending=true;}
      if(m.phase===2&&m.health<=0){m.weakPointOpen=false;this.defeatPending=true;}
    }
    if(impact.fullyCharged&&m.weakPointOpen&&!this.transitionPending&&!this.defeatPending)m.stunRemaining=.5;
    return {accepted:true,destroyed:m.health===0};
  }
  canDamagePlayer(amount:number,serial=this.model.attackSerial):boolean {
    const m=this.model;
    return !this.devInvincible&&this.combatActive&&!this.transitionPending&&!this.defeatPending&&m.invulnerability<=0&&Number.isFinite(amount)&&amount>0&&
      !(serial>=0&&serial===this.lastMajorDamageAttack);
  }
  damagePlayer(amount:number,serial=this.model.attackSerial):boolean {
    if(!this.canDamagePlayer(amount,serial))return false;
    const m=this.model;
    if(serial>=0)this.lastMajorDamageAttack=serial;
    m.playerHealth=Math.max(0,m.playerHealth-amount);m.invulnerability=T.playerDamageGraceSeconds;return true;
  }
  healPlayer(fraction=T.healthPackFraction):boolean {
    const m=this.model;
    if(!this.combatActive||m.playerHealth<=0||m.playerHealth>=m.maximumPlayerHealth||!Number.isFinite(fraction)||fraction<=0)return false;
    m.playerHealth=Math.min(m.maximumPlayerHealth,m.playerHealth+m.maximumPlayerHealth*fraction);return true;
  }
  droneDestroyed():void {
    const m=this.model;if(!this.combatActive||m.attack!=='summon-defend'||m.stage!=='active'||m.defendersRemaining===0)return;
    m.defendersRemaining--;
    if(m.defendersRemaining===0) {
      m.shieldActive=false;m.weakPointOpen=true;m.regenerating=false;m.stage='recovery';m.elapsed=0;m.progress=0;
    }
  }
  consumeDefeat():boolean {
    if(this.defeatDelivered||!['defeated','escape','complete'].includes(this.model.state))return false;this.defeatDelivered=true;return true;
  }
  consumeTransition():boolean {if(this.transitionDelivered||this.model.phase!==2)return false;this.transitionDelivered=true;return true;}
  deflect():void {this.model.rejectedFlash=.3;}
  suspend():void {this.model.state='suspended';this.model.stunRemaining=0;this.model.weakPointOpen=false;this.model.shieldActive=false;this.model.regenerating=false;}
  reset():void {
    this.devInvincibilityEnabled=false;
    const m=this.model;m.state='idle';m.phase=1;m.health=m.maximumHealth;m.playerHealth=m.maximumPlayerHealth;m.invulnerability=0;
    m.attack='gun-blast';m.stage='telegraph';m.progress=0;m.elapsed=0;m.attackSerial=0;m.weakPointOpen=false;m.shieldActive=false;m.regenerating=false;
    m.defenseIndex=0;m.defenseThreshold=0;m.summonCount=0;m.defendersRemaining=0;m.hitFlash=0;m.rejectedFlash=0;m.stunRemaining=0;m.lockedTarget.set(0,0,0);
    m.reinforcementIndex=0;m.orbCount=T.orbCount;m.beamRetargeting=false;m.beamTargetYaw=0;m.beamTurning=false;m.beamSegment=0;this.beamSweep.reset(1,0);
    m.beamLapsCompleted=0;m.beamDirection=1;m.beamDirections=[1,-1,1];m.beamRotationRadians=0;
    this.lastNormal=undefined;this.totalTime=0;this.lastMajorDamageAttack=-1;this.transitionPending=false;this.defeatPending=false;this.defeatDelivered=false;this.transitionDelivered=false;
  }
  dispose():void {if(this.disposed)return;this.reset();this.disposed=true;}
  private beginDefense(threshold:number):void {
    const m=this.model,groups=T.defenseGroups[m.defenseIndex]!;
    m.defenseIndex++;m.defenseThreshold=threshold;m.summonCount=T.pursuers+groups.reduce((sum,n)=>sum+n,0);m.defendersRemaining=m.summonCount;
    m.attack='summon-defend';m.attackSerial++;m.stage='telegraph';m.state='combat';m.elapsed=0;m.progress=0;m.shieldActive=true;m.weakPointOpen=false;m.regenerating=false;
  }
  private selectNormalAttack(target:THREE.Vector3Like):void {
    const value=this.randomValue();
    const attacks=this.model.phase===2?PHASE_TWO:NORMAL,choices=this.lastNormal?attacks.filter(a=>a!==this.lastNormal):attacks;
    const m=this.model;m.attack=choices[Math.floor(value*choices.length)]!;this.lastNormal=m.attack;
    m.attackSerial++;m.state='combat';m.stage='telegraph';m.elapsed=0;m.progress=0;m.lockedTarget.copy(target);
    m.beamLapsCompleted=0;m.beamRotationRadians=0;m.beamDirection=1;
    m.beamRetargeting=false;m.beamTurning=false;m.beamSegment=0;
    const originYaw=Math.atan2(-target.x,FINAL_ARENA.centreZ-target.z);m.beamTargetYaw=originYaw;this.beamSweep.reset(m.phase,originYaw);
    m.orbCount=m.phase===2?T.phaseTwoOrbCount:T.orbCount;
    const directions:Array<1|-1>=[1];
    // Every completed circle reverses: three full laps, never a repeated direction.
    for(let i=1;i<(m.phase===2?2+T.phaseTwoBeamHalves:T.beamCircles);i++)directions.push(directions[i-1]===1?-1:1);
    m.beamDirections=directions;
    m.weakPointOpen=true;m.shieldActive=false;m.regenerating=false;
  }
  private randomValue():number {
    const value=this.random();if(!Number.isFinite(value)||value<0||value>=1)throw new Error('Boss random source must return a value in [0,1).');return value;
  }
  private finishCinematic(target:THREE.Vector3Like):void {
    const m=this.model;
    if(m.state==='defeated'){m.state='escape';m.elapsed=0;m.progress=0;return;}
    if(m.state==='escape'){m.state='complete';m.elapsed=0;return;}
    if(m.state==='transition')m.phase=2;this.selectNormalAttack(target);
  }
}
