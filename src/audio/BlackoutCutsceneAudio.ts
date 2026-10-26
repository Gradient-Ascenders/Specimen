import * as THREE from 'three';
import { gameplayAudioEvents, type AudioPosition } from './GameplayAudioEvents.ts';
import type { SoundId } from './SoundCatalog.ts';
import { ELEVATOR_TIMING as E } from '../cinematics/BlackoutElevatorTimeline.ts';
import { BLACKOUT_ASCENT_LIFT as V } from '../levels/BlackoutAscentLift.ts';
import { RESEARCH_TIMING as T, RESEARCH_LIGHT_FAILURES, sampleResearchSlime, sampleResearchSpecimenWorld,
  researchWindow, researchPursuerShotTime, researchDroneDeathTime, researchDroneFireStart, researchDroneFireInterval } from '../cinematics/BlackoutResearchTimeline.ts';
import { copyResearchIncomingShot, sampleResearchDrone } from '../cinematics/BlackoutResearchFlight.ts';
import { RESEARCH_WING_ORIGIN as ORIGIN, researchWorldPoint } from '../cinematics/BlackoutResearchLayout.ts';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';

/** A cinematic owns only its requested voices, not the application's mixer. */
class CutsceneSoundTrack {
  private readonly sounds = new Set<SoundId>();
  private readonly loops = new Set<string>();
  private lastTime = -Infinity;
  protected frameBefore = -Infinity;
  protected frame(before: number, t: number): boolean {
    if (t <= before || t <= this.lastTime) return false;
    this.frameBefore = Math.max(before,this.lastTime);
    this.lastTime = t; return true;
  }
  cue(sound: SoundId, position?: AudioPosition, volumeScale = 1, varyPitch = false): void {
    this.sounds.add(sound);
    gameplayAudioEvents.emit('cue', {sound, position, volumeScale, varyPitch});
  }
  protected at(before: number, t: number, at: number, sound: SoundId, position?: AudioPosition, volume = 1, vary = false): void {
    if (t-before <= .25 && before < at && t >= at) this.cue(sound, position, volume, vary);
  }
  protected loop(key: string, sound: SoundId, enabled: boolean, position?: AudioPosition, volumeScale = 1, playbackRate = 1): void {
    if (enabled) {
      this.loops.add(key); this.sounds.add(sound);
      gameplayAudioEvents.emit('loop', {key, sound, position, volumeScale, playbackRate});
    } else if (this.loops.delete(key)) gameplayAudioEvents.emit('stop', {key});
  }
  stop(): void {
    for (const key of this.loops) gameplayAudioEvents.emit('stop', {key});
    for (const sound of this.sounds) gameplayAudioEvents.emit('stopSound', {sound});
    this.loops.clear(); this.sounds.clear(); this.lastTime = this.frameBefore = -Infinity;
  }
}

/** Pose-driven contacts: no steps from carrier travel, teleports, hidden actors or seeks. */
export class CutsceneMovementAudio {
  private readonly samples = new Map<string, {time: number; position: THREE.Vector3; airborne: boolean; travel: number}>();
  update(id: string, time: number, position: THREE.Vector3, airborne: boolean, audible: boolean,
    cue: (sound: SoundId, position: AudioPosition, volume?: number, vary?: boolean) => void, stride = 1.25, transitions = true): void {
    const previous = this.samples.get(id), dt = previous ? time-previous.time : 0;
    const distance = previous ? position.distanceTo(previous.position) : 0;
    const step = !!previous && audible && dt > 0 && dt <= .25 && distance <= 20*dt;
    let travel = previous?.travel ?? 0;
    if (!step) travel = 0;
    else {
      if (transitions && airborne !== previous.airborne) cue(airborne ? 'bob-jump-01' : 'bob-land-soft-01', position, .45, true);
      if (airborne || previous.airborne) travel = 0;
      else if ((travel += distance) >= stride) { travel %= stride; cue('bob-contact-01', position, .3, true); }
    }
    if (previous) { previous.time=time; previous.position.copy(position); previous.airborne=airborne; previous.travel=travel; }
    else this.samples.set(id,{time,position:position.clone(),airborne,travel});
  }
  reset(): void {this.samples.clear();}
}

export class BlackoutElevatorAudio extends CutsceneSoundTrack {
  readonly movement = new CutsceneMovementAudio();
  update(before: number, t: number): void {
    if (!this.frame(before,t)) return;
    before = this.frameBefore;
    this.loop('blackout-elevator-gate', 'world-door-movement-loop-01', t >= -1.8 && t < -.2, V.standing.bob, .3);
    this.at(before,t,-.2,'world-door-stop-01',V.standing.bob,.35);
    for (const at of [E.power,E.power+.65,E.power+1.3]) this.at(before,t,at,'volt-shoot-01',V.standing.volt,.7);
    this.at(before,t,E.powered,'blackout-lift-power-restore-01',V.outlet);
    this.at(before,t,E.lift,'blackout-lift-start-01',V.outlet);
    this.loop('blackout-elevator-motor','blackout-lift-travel-loop-01',t>=E.lift && t<E.arrival,V.outlet,
      .3+.45*Math.min(researchWindow(t,E.lift,E.lift+3),1-researchWindow(t,E.arrival-3,E.arrival)),
      .8+.2*Math.min(researchWindow(t,E.lift,E.lift+3),1-researchWindow(t,E.arrival-3,E.arrival)));
    this.at(before,t,E.arrival-3,'blackout-lift-stop-01',V.outlet);
    this.loop('blackout-elevator-exit-door','world-door-movement-loop-01',t>=E.open && t<E.open+1.8,V.standing.bob,.35);
    this.at(before,t,E.open+1.8,'world-door-stop-01',V.standing.bob,.4);
  }
  override stop(): void {super.stop();this.movement.reset();}
}

export class BlackoutResearchAudio extends CutsceneSoundTrack {
  private readonly movement = new CutsceneMovementAudio();
  private readonly actors = [new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  private readonly specimen = new THREE.Vector3();
  private readonly previousSpecimen = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly flightPosition = new THREE.Vector3();
  private readonly dronePose = {position:new THREE.Vector3(),yaw:0,pitch:0,bank:0,visible:false};
  private readonly pit = new THREE.Vector3(0,FINAL_ARENA.floorY,FINAL_ARENA.centreZ);
  update(before: number, t: number, bossPosition: AudioPosition): void {
    if (!this.frame(before,t)) return;
    before = this.frameBefore;
    const regular = t-before <= .25;
    sampleResearchSpecimenWorld(t,this.specimen); sampleResearchSpecimenWorld(before,this.previousSpecimen);
    for (const [i,id] of (['bob','goop','volt'] as const).entries()) {
      const pose=sampleResearchSlime(id,t,this.actors[i]!);this.actors[i]!.add(ORIGIN);
      this.movement.update(id,t,this.actors[i]!,pose.airborne,regular && pose.visible && t<T.attraction,
        (sound,position,volume,vary)=>this.cue(sound,position,volume,vary));
    }
    this.movement.update('specimen',t,this.specimen,t>=T.glass && t<T.landing,regular && t>=T.escape,
      (sound,position,volume,vary)=>this.cue(sound,position,volume,vary),4.6,false);
    const bob=this.actors[0]!, volt=this.actors[2]!, listener=t>=T.fusion?this.specimen:bob;
    this.loop('research-containment-alarm','world-containment-alarm-loop-01',t>=T.alarm && t<T.blackout,bob,.25);
    this.at(before,t,T.alarm,'world-activation-01',bob,.7);
    this.at(before,t,T.overload,'volt-shoot-01',volt,.85);
    this.loop('research-light-overload','volt-circuit-hold-loop-01',t>=T.overload && t<T.lampBurst,volt,.8);
    for (const {z,at} of RESEARCH_LIGHT_FAILURES) {
      researchWorldPoint(0,7.68,z,this.point);this.at(before,t,at,'research-light-rupture-01',this.point,1,true);
    }
    this.at(before,t,T.blackout,'escape-power-down-01',bob);
    this.at(before,t,T.collision,'escape-projectile-metal-impact-01',bob,.5);
    this.at(before,t,T.collision,'bob-contact-01',bob,.65);
    const crossfire = t>=T.crossfire && t<T.fusion;
    if (regular && crossfire && Math.floor((t-T.crossfire)/.32)>Math.floor((before-T.crossfire)/.32)) {
      this.cue('goop-shoot-01',this.actors[1],.5);this.cue('volt-shoot-01',volt,.6);
      this.cue('research-energy-absorb-01',bob,.55,true);
    }
    this.loop('research-fusion-charge','research-fusion-charge-loop-01',t>=T.crossfire+3 && t<T.fusion+.8,bob,
      .35+.65*researchWindow(t,T.crossfire+3,T.fusion),.8+.4*researchWindow(t,T.crossfire+3,T.fusion));
    this.at(before,t,T.attraction,'research-slime-fusion-01',bob);
    this.at(before,t,T.fusion+.8,'research-fusion-burst-01',this.specimen);
    this.at(before,t,T.reveal,'intro-bob-reform-01',this.specimen,.45);
    this.loop('research-weapon-charge','specimen-charge-loop-01',t>=T.charge && t<T.blast,this.specimen,
      .4+.6*researchWindow(t,T.charge,T.blast),.8+.8*researchWindow(t,T.charge,T.blast));
    this.at(before,t,T.charge,'volt-charge-ready-01',this.specimen,.85);
    for (const at of [T.blast,T.doorBlast]) this.at(before,t,at,'specimen-heavy-blast-01',this.specimen);
    researchWorldPoint(16,2.7,94.5,this.point);this.at(before,t,T.doorBlast+.25,'research-door-breach-01',this.point);
    this.at(before,t,T.ram,'specimen-damage-01',this.specimen,.9);
    researchWorldPoint(16,4.9,111.3,this.point);this.at(before,t,T.glass,'research-glass-shatter-01',this.point);
    this.at(before,t,T.fall,'research-shaft-fall-01');
    this.at(before,t,T.landing,'research-specimen-land-01',this.specimen);
    let nearest=65**2,absorbed=false;
    for (let i=0;i<12;i++) {
      sampleResearchDrone(i,t,this.dronePose);
      const distance=this.dronePose.position.distanceToSquared(listener);
      if (this.dronePose.visible && distance<nearest) {nearest=distance;this.flightPosition.copy(this.dronePose.position);}
      const start=researchDroneFireStart(i),interval=researchDroneFireInterval(i),death=researchDroneDeathTime(i);
      if (regular && t>=start && before<death) {
        const shot=Math.floor((Math.min(t,death-1e-8)-start)/interval);
        if (shot>=0 && start+shot*interval>before) this.cue('boss-drone-shot-01',this.dronePose.position,.6,true);
      }
      this.at(before,t,death,'research-drone-destroy-01',this.dronePose.position,.85,true);
      if (i>=8) this.at(before,t,researchPursuerShotTime(i-8),'volt-shoot-01',this.specimen,.9);
      if (regular && t>=start && t<=death+1.5) for (let n=Math.floor((t-start)/interval);n>=Math.max(0,Math.floor((t-start)/interval)-4);n--) {
        const fired=start+n*interval;if (fired>=death) continue;
        const flight=copyResearchIncomingShot(i,fired,this.specimen,this.from,this.to,this.direction);
        const previous=copyResearchIncomingShot(i,fired,this.previousSpecimen,this.from,this.to,this.direction);
        if (t-fired>=flight && before-fired<previous) absorbed=true;
      }
      // Search beams switch on in a stagger, matching their visible presentation.
      if (i<8) this.at(before,t,T.search+i*.18,'world-laser-on-01',this.dronePose.position,.22);
    }
    if (absorbed) this.cue('research-energy-absorb-01',this.specimen,.55,true);
    this.loop('research-drone-flight','world-drone-flight-loop-01',nearest<65**2,this.flightPosition,.85);
    this.at(before,t,T.pitUnlock,'research-pit-unlock-01',this.pit);
    this.loop('research-pit-gates','research-pit-retract-loop-01',t>=T.pitOpen && t<T.pitClear,this.pit);
    this.at(before,t,T.pitClear,'research-pit-stop-01',this.pit);
    this.at(before,t,T.boss,'boss-emergence-01',bossPosition);
    this.loop('research-boss-hover','boss-hover-loop-01',t>=T.boss,bossPosition,.6);
  }
  override stop(): void {super.stop();this.movement.reset();}
}
