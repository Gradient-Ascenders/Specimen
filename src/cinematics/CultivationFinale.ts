import * as THREE from 'three';
import type {LevelTwoRoomFiveGreybox} from '../levels/LevelTwoRoomFiveGreybox.ts';
import type {RoomFiveDroneEncounter} from '../hazards/RoomFiveDroneEncounter.ts';
import type {KinematicBody} from '../physics/KinematicBody.ts';
import type {BobCharacterPresentation,BobCharacterPresentationState} from '../render/bob/BobCharacterPresentation.ts';
import type {GoopCharacterPresentation} from '../render/goop/GoopCharacterPresentation.ts';
import type {VoltCharacterPresentation} from '../render/volt/VoltCharacterPresentation.ts';
import type {AcidSurfaceMaterial} from '../render/environment/containment/AcidSurfaceMaterial.ts';
import {gameplayAudioEvents} from '../audio/GameplayAudioEvents.ts';
import {TypewriterAudio} from '../audio/TypewriterAudio.ts';
import {WorldAudioSource} from '../audio/WorldAudio.ts';
import type {SoundId} from '../audio/SoundCatalog.ts';
import type {CultivationFinaleSet} from './CultivationFinaleSet.ts';
import {CultivationFinaleOverlay,VOLT_FINALE_DIALOGUE} from './CultivationFinaleOverlay.ts';
import {VOLT_FINALE as T,VOLT_FINALE_PROJECTILES,finaleSmooth,sampleVoltFinaleActor,
  sampleVoltFinaleDrone,sampleVoltFinaleRideFrame,voltFinaleDroneVisible,voltFinaleShot,voltFinaleFallTime,voltFinaleLandTime,voltFinaleRiding,type VoltFinaleActor} from './CultivationFinaleTimeline.ts';
import {voltFinaleTime as at} from './CultivationFinaleTiming.ts';
import {VOLT_FINALE_VENT as V,VOLT_FINALE_CELL as CELL,VOLT_FINALE_COVER as COVER} from './CultivationFinaleLayout.ts';
import {CultivationFinaleAlertFlight} from './CultivationFinaleAlert.ts';

interface Options {
  readonly room:LevelTwoRoomFiveGreybox;readonly encounter:RoomFiveDroneEncounter;
  readonly bob:KinematicBody;readonly goop:KinematicBody;readonly volt:KinematicBody;
  readonly bobPresentation:BobCharacterPresentation;readonly goopPresentation:GoopCharacterPresentation;
  readonly voltPresentation:VoltCharacterPresentation;readonly set:CultivationFinaleSet;
  readonly acid:AcidSurfaceMaterial;readonly scene:THREE.Scene;readonly host:HTMLElement;
  readonly speech?:THREE.Object3D;
  readonly getCameraShakeScale?:()=>number;
}
type Presentation=BobCharacterPresentation|GoopCharacterPresentation|VoltCharacterPresentation;
const UP=new THREE.Vector3(0,1,0),ZERO=new THREE.Vector3();
const CUES:readonly(readonly[number,SoundId])[]=[
  [T.button,'world-activation-01'],[T.open,'world-release-01'],
  [T.open+.3,'world-activation-01'],[T.open+2.7,'world-activation-01'],[T.open+5.1,'world-activation-01'],
  [T.open+7.5,'world-activation-01'],[T.open+9.9,'world-activation-01'],
  [T.critical,'world-sign-tick-01'],[T.terminateVolt,'world-activation-01'],
  [T.coverJump,'bob-jump-01'],[T.coverLand,'bob-land-soft-01'],
  [T.coverHit,'bob-contact-01'],[T.coverHit+.2,'world-release-01'],
  [T.coverImpact,'world-platform-land-01'],[T.acidHit,'world-drone-dissolve-01'],
  [T.catastrophic,'world-sign-tick-01'],[T.terminateBob,'world-activation-01'],
  [T.voltJump,'bob-charged-jump-01'],[T.hijack,'volt-circuit-connect-01'],
  [T.bobJump,'bob-jump-01'],[T.boarded,'bob-land-soft-01'],
  [T.bobVentJump,'bob-jump-01'],[T.bobVentLand,'bob-land-soft-01'],
  [T.voltVentJump,'bob-jump-01'],[T.ductLand,'bob-land-soft-01'],
  [T.powerOff,'volt-circuit-release-01'],[T.rideAcidHit,'world-drone-dissolve-01'],
  [T.ductShake,'world-platform-land-01'],[T.grateWarning,'world-platform-land-01'],
  [T.grateBreak,'world-release-01'],[T.drop,'bob-fall-01'],
];
const JUMPS=Object.freeze([
  {id:'bob',start:T.coverJump,end:T.coverLand},
  {id:'volt',start:T.voltJump,end:T.hijack},
  {id:'bob',start:T.bobJump,end:T.boarded},
  {id:'bob',start:T.bobVentJump,end:voltFinaleLandTime('bob')},
  {id:'volt',start:T.voltVentJump,end:voltFinaleLandTime('volt')},
] as const);
interface Actor {
  readonly id:VoltFinaleActor;readonly body:KinematicBody;readonly presentation:Presentation;readonly pose:THREE.Group;
  readonly local:THREE.Vector3;readonly previous:THREE.Vector3;readonly world:THREE.Vector3;
  readonly lastWorld:THREE.Vector3;readonly velocity:THREE.Vector3;readonly intent:THREE.Vector3;
  readonly state:BobCharacterPresentationState;parent:THREE.Object3D|null;
}

/** Fixed-step movie authority. Borrows the loaded slimes, nine patrol craft and
 * the actual cover panel. Rendering samples its clock; it cannot advance it. */
export class CultivationFinale {
  readonly overlay:CultivationFinaleOverlay;
  readonly actors:readonly Actor[];
  private readonly options:Options;
  private readonly boardPivot=new THREE.Group();
  private readonly boardStart=new THREE.Vector3();
  private readonly coverPosition:THREE.Vector3;
  private readonly coverQuaternion:THREE.Quaternion;
  private readonly colliderPosition:THREE.Vector3;
  private readonly colliderQuaternion:THREE.Quaternion;
  private readonly coverAxis=new THREE.Vector3();
  private readonly dronePositions:THREE.Vector3[]=[];
  private readonly droneShells:THREE.Object3D[]=[];
  private readonly droneEyes:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>[]=[];
  private readonly droneHome:THREE.Vector3[]=[];
  private readonly droneHomeOrientation:THREE.Quaternion[]=[];
  private readonly droneColliderVisibility:boolean[]=[];
  private readonly alertFlights:CultivationFinaleAlertFlight[]=[];
  private readonly craftFinishes:{material:THREE.MeshStandardMaterial;color:THREE.Color;intensity:number}[]=[];
  private readonly environment:{mesh:THREE.Mesh;visible:boolean}[]=[];
  private ventView=false;
  private readonly direction=new THREE.Vector3();
  private readonly target=new THREE.Vector3();
  private readonly eye=new THREE.Vector3();
  private readonly look=new THREE.Matrix4();
  private readonly orientation=new THREE.Quaternion();
  private readonly deckFrame=new THREE.Quaternion();
  private readonly base=new THREE.Vector3();
  private readonly signalPoint=new THREE.Vector3();
  private readonly glow:THREE.PointLight;
  private readonly wayfinding:THREE.PointLight;
  private readonly ambient:THREE.HemisphereLight|undefined;
  private readonly voice:TypewriterAudio;
  private readonly flightAudio:WorldAudioSource;
  private readonly voiceModel={text:'',pageIndex:0};
  private previous=0;
  private elapsed=0;
  private playing=false;
  private played=false;
  private skipRequested=false;
  private disposed=false;
  private camera:THREE.PerspectiveCamera|undefined;
  private cameraState:{fov:number;near:number;far:number}|undefined;
  private readonly savedGlow:THREE.Color;
  private readonly savedWayfinding:THREE.Color;
  private readonly savedGlowIntensity:number;
  private readonly savedWayfindingIntensity:number;
  private savedAmbientIntensity=0;
  private readonly savedAmbientGround=new THREE.Color();
  private readonly savedAmbientSky=new THREE.Color();
  private savedSpeechVisibility=true;
  constructor(options:Options){
    this.options=options;const {room}=options;
    this.overlay=new CultivationFinaleOverlay(options.host,()=>{this.skipRequested=true;});
    this.coverPosition=room.releaseCover.position.clone();this.coverQuaternion=room.releaseCover.quaternion.clone();
    this.colliderPosition=room.releaseCoverCollider.position.clone();this.colliderQuaternion=room.releaseCoverCollider.quaternion.clone();
    this.boardStart.copy(this.colliderPosition);this.boardStart.y=29;
    this.coverAxis.set(1,0,0).applyQuaternion(this.colliderQuaternion);
    this.boardPivot.name='volt-finale-actual-cover-pivot';room.root.add(this.boardPivot);
    const pending=[...room.root.children];
    while(pending.length){
      const node=pending.pop()!;
      if(node===options.set.annex||node===options.set.mouth||node===options.set.effects)continue;
      if(node instanceof THREE.Mesh)this.environment.push({mesh:node,visible:node.visible});
      pending.push(...node.children);
    }
    this.actors=(['bob','goop','volt'] as const).map(id=>{
      const body=options[id],presentation=options[`${id}Presentation`],pose=new THREE.Group();pose.name=`volt-finale-borrowed-${id}`;
      pose.visible=false;room.root.add(pose);
      const local=new THREE.Vector3(),previous=new THREE.Vector3(),world=new THREE.Vector3(),lastWorld=new THREE.Vector3(),velocity=new THREE.Vector3(),intent=new THREE.Vector3();
      const state:BobCharacterPresentationState={locomotionPositionWorld:world,velocityWorld:velocity,movementIntentWorld:intent,
        maximumLocomotionSpeedMetresPerSecond:6,surfaceNormalWorld:UP,gameplayUpWorld:UP,grounded:true,attached:false,
        chargingJump:false,jumpCharge:0,contactCount:0,contactNormalWorld:UP,contactSpeedMetresPerSecond:0,
        contactName:'',contactSurfaceTag:'',landedThisStep:false};
      return{id,body,presentation,pose,local,previous,world,lastWorld,velocity,intent,state,parent:null};
    });
    for(const drone of options.encounter.drones){
      this.alertFlights.push(new CultivationFinaleAlertFlight(this.alertFlights.length,drone.root.position));
      const shell=drone.root.getObjectByName(`${drone.id}-flying-shell`)!;
      this.droneShells.push(shell);this.dronePositions.push(new THREE.Vector3());this.droneHome.push(new THREE.Vector3());
      this.droneHomeOrientation.push(new THREE.Quaternion());
      let eye:THREE.Mesh|undefined;shell.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshBasicMaterial&&o.geometry instanceof THREE.SphereGeometry)eye=o;});
      this.droneEyes.push(eye as typeof this.droneEyes[number]);
      shell.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        for(const material of Array.isArray(o.material)?o.material:[o.material])
          if(material instanceof THREE.MeshStandardMaterial&&!this.craftFinishes.some(saved=>saved.material===material))
            this.craftFinishes.push({material,color:material.emissive.clone(),intensity:material.emissiveIntensity});
      });
    }
    this.glow=room.pod.getObjectByName('room-5-volt-glow') as THREE.PointLight;
    this.wayfinding=room.root.getObjectByName('room-5-release-wayfinding') as THREE.PointLight;
    this.savedGlow=this.glow.color.clone();this.savedWayfinding=this.wayfinding.color.clone();
    this.savedGlowIntensity=this.glow.intensity;this.savedWayfindingIntensity=this.wayfinding.intensity;
    const ambient=options.scene.getObjectByName('cultivation-foundation-ambient-fill');
    this.ambient=ambient instanceof THREE.HemisphereLight?ambient:undefined;
    this.voice=new TypewriterAudio(this.actors[1].pose,{sound:'bob-contact-01',intervalSeconds:.095,maxDistance:80,volumeScale:.48});
    this.flightAudio=new WorldAudioSource({root:options.encounter.drones[1].root,kind:'drone',enabled:()=>this.playing&&this.elapsed>=T.hijack&&this.elapsed<T.powerOff});
  }
  get active():boolean{return this.playing;}
  get complete():boolean{return this.played&&!this.playing;}
  get seconds():number{return this.elapsed;}
  get durationSeconds():number{return T.duration;}
  begin(camera:THREE.PerspectiveCamera,force=false):boolean{
    if(this.disposed||this.played||(!force&&!this.options.room.controller.security.shutdown))return false;
    const {room,encounter,set}=this.options;
    if(force)room.restoreCheckpoint('controls');
    room.controller.security.release();room.controller.releaseElapsed=0;
    this.camera=camera;this.cameraState={fov:camera.fov,near:camera.near,far:camera.far};camera.near=.06;camera.far=180;
    this.savedAmbientIntensity=this.ambient?.intensity??0;
    if(this.ambient){this.savedAmbientGround.copy(this.ambient.groundColor);this.savedAmbientSky.copy(this.ambient.color);}
    if(this.options.speech){this.savedSpeechVisibility=this.options.speech.visible;this.options.speech.visible=false;}
    for(const actor of this.actors){actor.parent=actor.presentation.root.parent;actor.pose.add(actor.presentation.root);actor.presentation.reset();actor.pose.visible=true;}
    this.droneHome.forEach((home,i)=>{
      const drone=encounter.drones[i];home.copy(drone.root.position);this.droneHomeOrientation[i].copy(this.droneShells[i].quaternion);
      this.droneColliderVisibility[i]=drone.collider.visible;
      // Scripted hulls never support or block the borrowed actors. A hidden
      // root alone does not exclude its collider from headroom raycasts:
      // destroyed interceptors used to squash Volt's crest on their old route.
      drone.collider.visible=false;
    });
    for(const entry of this.environment)entry.visible=entry.mesh.visible;
    encounter.beginCinematic();this.boardPivot.position.copy(this.boardStart);this.boardPivot.quaternion.identity();
    for(const {material} of this.craftFinishes){material.emissive.setHex(0x47575c);material.emissiveIntensity=.18;}
    room.root.updateWorldMatrix(true,true);this.boardPivot.attach(room.releaseCover);this.boardPivot.attach(room.releaseCoverCollider);
    set.annex.visible=set.effects.visible=true;
    this.previous=this.elapsed=0;this.skipRequested=false;this.playing=this.played=true;
    this.updateActors(0,1/60);this.present(camera,1);return true;
  }
  requestSkip():void{if(this.playing)this.skipRequested=true;}
  update(dt:number):boolean{
    if(!this.playing||this.disposed)return false;
    if(!Number.isFinite(dt)||dt<=0)throw new RangeError('Invalid Volt-finale timestep.');
    this.previous=this.elapsed;this.elapsed=this.skipRequested?T.duration:Math.min(T.duration,this.elapsed+dt);
    if(!this.skipRequested){
      this.updateActors(this.elapsed,dt);
      for(const [time,sound] of CUES)if(time>this.previous&&time<=this.elapsed){
        if(time>=T.open&&time<T.alarmEnd)this.signalPoint.set(0,CELL.y,49);
        else if(time===T.ductShake||time===T.grateWarning||time===T.grateBreak)this.signalPoint.set(V.dropX,V.y,V.z);
        else if(time===T.acidHit)sampleVoltFinaleDrone(0,time,this.signalPoint);
        else if(time===T.powerOff||time===T.rideAcidHit)sampleVoltFinaleDrone(1,time,this.signalPoint);
        else sampleVoltFinaleActor(time===T.hijack||time===T.voltJump||time===T.voltVentJump||time===T.ductLand?'volt':'bob',time,this.signalPoint);
        this.options.room.root.localToWorld(this.signalPoint);this.cue(sound,this.signalPoint);
      }
      for(const shot of VOLT_FINALE_PROJECTILES){
        if(shot.time>this.previous&&shot.time<=this.elapsed){
          this.options.room.root.localToWorld(this.signalPoint.fromArray(shot.from));this.cue(shot.kind==='acid'?'goop-shoot-01':'specimen-turret-shot',this.signalPoint);
          if(shot.kind==='acid')this.options.goopPresentation.onAcidFired(this.direction.fromArray(shot.to).sub(this.base.fromArray(shot.from)).normalize());
        }
        const hit=shot.time+shot.duration;
        if(shot.kill!==undefined&&hit>this.previous&&hit<=this.elapsed){
          this.options.room.root.localToWorld(this.signalPoint.fromArray(shot.to));this.cue(shot.kind==='acid'?'goop-projectile-impact-01':'world-drone-dissolve-01',this.signalPoint);
        }
      }
      if(this.previous<T.acidHit&&this.elapsed>=T.acidHit){
        this.options.room.root.localToWorld(this.signalPoint.set(1.85,0,41));this.options.acid.disturb(this.signalPoint.x,this.signalPoint.z,0,3);
      }
      if(this.previous<T.rideAcidHit&&this.elapsed>=T.rideAcidHit){
        sampleVoltFinaleDrone(1,T.rideAcidHit,this.signalPoint);this.signalPoint.y=0;
        this.options.room.root.localToWorld(this.signalPoint);this.options.acid.disturb(this.signalPoint.x,this.signalPoint.z,0,3);
      }
      const line=VOLT_FINALE_DIALOGUE.find(line=>this.elapsed>=line.start&&this.elapsed<line.end);
      if(line){
        const actor=this.actors[line.speaker==='goop'?1:2];actor.pose.updateWorldMatrix(true,false);
        this.voiceModel.pageIndex=line.start;this.voiceModel.text=line.text.slice(0,Math.floor((this.elapsed-line.start)*22));
        // Goop's real vent position remains the source; Volt's short response
        // gets its own positional accent below, rather than a screen-centred voice.
        if(line.speaker==='goop')this.voice.update(dt,this.voiceModel);
        else if(this.previous<T.getOn+.1&&this.elapsed>=T.getOn+.1){actor.pose.getWorldPosition(this.signalPoint);this.cue('bob-contact-01',this.signalPoint);}
      }
      this.options.acid.update(dt);
    }
    if(this.elapsed>=T.duration){this.playing=false;this.overlay.present(T.duration);return true;}return false;
  }
  present(camera:THREE.PerspectiveCamera,alpha:number):void{
    if(!this.playing)return;
    const t=THREE.MathUtils.lerp(this.previous,this.elapsed,THREE.MathUtils.clamp(alpha,0,1));
    const {room,encounter,set}=this.options;
    for(const actor of this.actors){
      sampleVoltFinaleActor(actor.id,t,actor.local);actor.pose.position.copy(actor.local);actor.presentation.setPosition(ZERO);
      actor.pose.rotation.set(0,0,0);actor.pose.scale.set(1,1,1);
      // The fixed launch step transfers the settled deck yaw into the slime.
      // An interpolated frame just before that boundary must not apply it twice.
      const riding=voltFinaleRiding(actor.id,t)&&voltFinaleRiding(actor.id,this.elapsed);
      if(riding)sampleVoltFinaleRideFrame(t,actor.pose.quaternion);
      else if(t>=voltFinaleFallTime(actor.id)&&t<T.ductSilence)actor.pose.rotation.z=.06;
      else if(actor.id==='bob'&&t<1.8)actor.pose.rotation.x=finaleSmooth(.2,T.button,t)*.15*(1-finaleSmooth(T.button,1.8,t));
      actor.presentation.setVisible(actor.id==='volt'?t>=T.open:actor.id==='goop'?t>=at(62):true);
      if(actor.id==='bob'&&t>=T.coverJump&&t<T.coverLand+.4)
        actor.pose.rotation.x=.2*finaleSmooth(T.coverJump,T.coverHit,t)*(1-finaleSmooth(T.coverLand,T.coverLand+.4,t));
      actor.presentation.present(alpha);
    }
    room.controller.buttonProgress=finaleSmooth(.6,T.button,t);room.syncPresentation(0);
    room.releaseButton.material.color.setHex(t>=T.button?0x75e5bd:0xffc754);
    room.releaseButton.material.emissive.setHex(t>=T.button?0x38bd94:0xffb52c);
    room.presentCinematicCell(finaleSmooth(T.open,T.cellOpen,t));
    room.captiveVolt.visible=t<T.open;room.captiveVoltPresentation.setVisible(t<T.open);
    const alarm=t>=T.open&&t<T.ventCamera,pulse=.5-.5*Math.cos((t-T.open)*Math.PI/1.2);
    this.glow.color.copy(alarm?this.colorRed:this.savedGlow);this.wayfinding.color.copy(alarm?this.colorRed:this.savedWayfinding);
    this.glow.intensity=alarm?48+24*pulse:this.savedGlowIntensity;
    this.wayfinding.intensity=alarm?34+28*pulse:this.savedWayfindingIntensity;
    if(this.ambient){
      this.ambient.intensity=Math.max(this.ambient.intensity,.55);this.ambient.groundColor.setHex(0x384447);
      this.ambient.color.lerpColors(this.savedAmbientSky,this.colorRed,alarm?.1+.18*pulse:0);
    }
    // Reuse the nine real hulls; their normal combat and collision are frozen.
    const shot=voltFinaleShot(t);
    const powered=1-finaleSmooth(T.powerOff,T.rideFall,t);
    for(const {material} of this.craftFinishes)material.emissiveIntensity=.18*powered;
    for(let i=0;i<encounter.drones.length;i++){
      const drone=encounter.drones[i],position=this.dronePositions[i];sampleVoltFinaleDrone(i,t,position);
      if(t<T.alerted){
        const flight=this.alertFlights[i];flight.sample(t,this.droneHome[i],position);
        const idle=1-finaleSmooth(flight.start,flight.start+.7,t);
        position.x+=(Math.sin(t*.9+i)-Math.sin(i))*.06*idle;
        position.y+=(Math.sin(t*.7+i)-Math.sin(i))*.045*idle;
      }
      drone.root.position.copy(position);drone.root.quaternion.identity();
      drone.root.visible=voltFinaleDroneVisible(i,t)&&!(i===(shot.pov==='volt'?0:shot.pov==='bob'?1:-1));
      if(t<at(28))sampleVoltFinaleActor('volt',t,this.target);
      else if(t<T.hijack||i===4&&t<T.ambushKill)sampleVoltFinaleActor('bob',t,this.target);
      else sampleVoltFinaleDrone(1,t,this.target);
      if(i===1&&t>=T.hijack){
        if(t<T.secondKill)sampleVoltFinaleDrone(t<T.firstKill?2:3,t,this.target);
        else sampleVoltFinaleActor('bob',t,this.target);
      }
      this.direction.subVectors(this.target,position).normalize();
      this.direction.y=THREE.MathUtils.clamp(this.direction.y,-.2,.2);this.direction.normalize();
      if(i===1&&t>=T.scanBob){this.direction.y=0;this.direction.normalize();}
      if(this.direction.lengthSq()>.01)this.droneShells[i].quaternion.setFromUnitVectors(this.forward,this.direction);
      if(t<T.alerted){
        const flight=this.alertFlights[i],u=flight.progress(t);
        flight.sample(t+.06,this.droneHome[i],this.base);this.base.sub(position).setY(0);
        if(this.base.lengthSq()>.00001){
          this.orientation.setFromAxisAngle(UP,Math.atan2(-this.base.x,-this.base.z));
          this.droneShells[i].quaternion.slerp(this.orientation,finaleSmooth(.04,.2,u)*(1-finaleSmooth(.6,1,u)));
        }
      }
      if(i===1&&t>=T.hijack)sampleVoltFinaleRideFrame(t,this.droneShells[i].quaternion);
      else if(i===0&&t>=T.coverHit)this.droneShells[i].quaternion.setFromAxisAngle(UP,Math.PI);
      else{
        this.droneShells[i].rotateY(Math.sin(t*.65+i)*.07);
        this.droneShells[i].rotateZ(Math.sin(t*1.6+i*1.7)*(t>=T.hijack?.16:.035));
      }
      if(i===0&&t>=T.coverJump&&t<T.coverHit){
        this.orientation.setFromAxisAngle(UP,Math.PI);
        this.droneShells[i].quaternion.slerp(this.orientation,finaleSmooth(T.coverJump,T.coverHit,t));
      }
      if(t<T.alerted){
        this.orientation.copy(this.droneShells[i].quaternion);
        this.droneShells[i].quaternion.slerpQuaternions(this.droneHomeOrientation[i],this.orientation,finaleSmooth(T.open+i*.18,T.alerted,t));
        this.droneShells[i].rotateY(Math.sin(t*.65+i)*.045*(1-finaleSmooth(T.open,T.alerted,t)));
      }
      if(this.droneEyes[i]){
        const color=this.droneEyes[i].material.color;
        color.setHex(i===1&&t>=T.hijack?0xffd45a:alarm||t>=at(28)?0xff4356:0xffb347);
        if(i===1&&t>=T.powerOff)color.multiplyScalar(powered);
      }
    }
    this.boardPivot.position.copy(this.boardStart);
    if(t<T.coverImpact)this.boardPivot.position.y-=finaleSmooth(T.coverHit,T.coverImpact,t)*.24;
    else{
      // One trajectory for the crushed hull AND the panel resting on its deck.
      sampleVoltFinaleDrone(0,t,this.base);
      this.boardPivot.position.x+=this.base.x-.65;this.boardPivot.position.z+=this.base.z-40.1;
      this.boardPivot.position.y=this.base.y+COVER.restOffsetY;
    }
    this.boardPivot.quaternion.setFromAxisAngle(this.coverAxis,finaleSmooth(T.coverHit,T.coverImpact,t)*Math.PI/2);
    // The first acid cut leaves the panel behind, offscreen. Hide the actual
    // borrowed assembly as well as its pivot: no later shot or shadow
    // submission may bring it back above the acid.
    const coverVisible=t<T.coverGone;
    this.boardPivot.visible=room.releaseCover.visible=room.releaseCoverCollider.visible=coverVisible;
    set.present(t);
    const u=finaleSmooth(shot.start,shot.end,t);this.eye.fromArray(shot.eye);
    if(shot.to)this.eye.lerp(this.base.fromArray(shot.to),u);
    if(shot.followDrone!==undefined){sampleVoltFinaleDrone(shot.followDrone,t,this.base);this.eye.add(this.base);}
    if(shot.follow){
      if(shot.follow==='goop'||shot.follow==='bob')sampleVoltFinaleActor(shot.follow,t,this.base);
      else sampleVoltFinaleDrone(shot.follow==='ride'?1:0,t,this.base);
      this.eye.add(this.base);
    }
    if(shot.pov){
      sampleVoltFinaleDrone(shot.pov==='bob'?1:0,t,this.eye);this.eye.y+=.12;
      this.eye.z+=shot.pov==='bob'?-.8:.8;
    }
    if(shot.id==='deep-shaft'){
      sampleVoltFinaleActor('goop',t,this.eye);this.eye.y-=7.5;this.eye.x=V.dropX;this.eye.z=V.z;
    }
    if(shot.targetDrone!==undefined)sampleVoltFinaleDrone(shot.targetDrone,t,this.target);
    else if(Array.isArray(shot.target))this.target.fromArray(shot.target);
    else if(shot.target==='ride'||shot.target==='first'||shot.target==='ambush')sampleVoltFinaleDrone(shot.target==='ride'?1:shot.target==='first'?0:4,t,this.target);
    else sampleVoltFinaleActor(shot.target as VoltFinaleActor,t,this.target);
    if(shot.targetTo)this.target.lerp(this.base.fromArray(shot.targetTo),u);
    this.target.y+=shot.target==='bob'||shot.target==='goop'||shot.target==='volt'?.25:0;
    const impactAge=t-T.coverImpact;
    if(impactAge>=0&&impactAge<.4){
      const kick=(this.options.getCameraShakeScale?.()??1)*.09*Math.exp(-impactAge*13)*Math.sin(impactAge*49);
      this.eye.y+=kick;this.eye.x+=kick*.4;
    }
    if(t>=T.ductShake&&t<T.grateBreak+.8){
      const shake=(this.options.getCameraShakeScale?.()??1)*(.014+.026*finaleSmooth(T.ductShake,T.grateWarning,t))*(1-finaleSmooth(T.grateBreak,T.grateBreak+.8,t));
      this.eye.x+=Math.sin(t*47)*shake;this.eye.y+=Math.sin(t*61)*shake*.65;
      this.target.z+=Math.sin(t*39)*shake*.35;
    }
    room.root.localToWorld(this.eye);room.root.localToWorld(this.target);
    this.look.lookAt(this.eye,this.target,shot.up?this.direction.fromArray(shot.up):UP);this.orientation.setFromRotationMatrix(this.look);
    camera.position.copy(this.eye);camera.quaternion.copy(this.orientation);
    if(camera.fov!==shot.fov){camera.fov=shot.fov;camera.updateProjectionMatrix();}camera.updateMatrixWorld(true);
    this.overlay.present(t);
    // Once the lens is inside the airduct, the exterior facility (including
    // the sewer under it) is out of shot. Keep its lights registered, but stop
    // submitting its meshes instead of drawing walls through the deep shaft.
    const ventView=t>=T.ventCamera;
    if(ventView!==this.ventView){
      this.ventView=ventView;
      for(const entry of this.environment)entry.mesh.visible=ventView?false:entry.visible;
    }
    if(ventView)for(const entry of this.environment)entry.mesh.visible=false;
  }
  private readonly colorRed=new THREE.Color(0xff263b);
  private readonly forward=new THREE.Vector3(0,0,-1);
  private updateActors(t:number,dt:number):void{
    const {room}=this.options;
    for(const actor of this.actors){
      sampleVoltFinaleActor(actor.id,t,actor.local);sampleVoltFinaleActor(actor.id,this.previous,actor.previous);
      room.root.localToWorld(actor.world.copy(actor.local));room.root.localToWorld(actor.lastWorld.copy(actor.previous));
      actor.velocity.subVectors(actor.world,actor.lastWorld).divideScalar(dt);actor.intent.copy(actor.velocity);actor.intent.y=0;
      if(actor.intent.lengthSq()>1)actor.intent.normalize();actor.body.syncKinematicPose(actor.world,actor.lastWorld);
      actor.pose.position.copy(actor.local);actor.presentation.setPosition(ZERO);
      const riding=voltFinaleRiding(actor.id,t);
      if(riding){actor.velocity.set(0,0,0);actor.intent.set(0,0,0);}
      const jump=JUMPS.find(jump=>jump.id===actor.id&&t>=jump.start&&t<jump.end);
      const charge=JUMPS.find(jump=>jump.id===actor.id&&t>=jump.start-.45&&t<jump.start);
      actor.state.grounded=!jump&&!(actor.id==='volt'&&t>=at(36.6)&&t<at(38.6))&&t<voltFinaleFallTime(actor.id);
      actor.state.maximumLocomotionSpeedMetresPerSecond=t>=T.ductRun?5:6;
      actor.state.chargingJump=!!charge;
      actor.state.jumpCharge=charge?finaleSmooth(charge.start-.45,charge.start,t)*.7:0;actor.state.landedThisStep=false;
      for(const flight of JUMPS)if(flight.id===actor.id){
        if(this.previous<flight.start&&t>=flight.start){
          // Transfer the carrier's settled +X facing into the presentation's
          // own yaw as it detaches, so neither slime turns backwards mid-jump.
          if(flight.start===T.bobVentJump||flight.start===T.voltVentJump)actor.presentation.setYaw(-Math.PI/2);
          sampleVoltFinaleActor(actor.id,flight.start+.05,this.direction);sampleVoltFinaleActor(actor.id,flight.start,this.base);
          this.direction.sub(this.base).divideScalar(.05).transformDirection(room.root.matrixWorld);
          actor.presentation.onLaunch({directionWorld:this.direction,speedMetresPerSecond:12,chargeFraction:.7});
        }
        if(this.previous<flight.end&&t>=flight.end){actor.presentation.onLanding(UP,8);actor.state.landedThisStep=true;}
      }
      if(actor.id==='volt'&&this.previous<at(38.6)&&t>=at(38.6))actor.presentation.onLanding(UP,5);
      if(riding)this.direction.copy(this.forward);
      else if(t>=T.ventArrive)this.direction.set(1,0,0);
      else if(actor.id==='bob'&&t>=T.coverRun-1&&t<T.coverLand)this.direction.set(0,0,1);
      else if(actor.id==='bob'&&t>=at(23)&&t<T.pickup){sampleVoltFinaleDrone(1,t,this.target);this.direction.subVectors(this.target,actor.local);}
      else if(actor.id==='volt'&&t<T.voltJump){sampleVoltFinaleActor('bob',t,this.target);this.direction.subVectors(this.target,actor.local);}
      else if(actor.id==='goop'){this.direction.set(-1,0,-.4);}
      else if(actor.intent.lengthSq()>.01)this.direction.copy(actor.intent);
      else this.direction.set(t<T.coverRun?0:1,0,t<T.coverRun?-1:0);
      if(actor.id==='bob'&&t>=T.ambushNotice-.12&&t<T.ambushKill+.5){sampleVoltFinaleDrone(4,t,this.target);this.direction.subVectors(this.target,actor.local);}
      if(actor.id==='bob'&&t>=at(64.4)&&t<at(75))this.direction.set(20,0,23.45);
      if(actor.id==='volt'&&t>=T.pickup&&t<T.escape){
        sampleVoltFinaleActor('bob',t,this.target);this.direction.subVectors(this.target,actor.local);
        sampleVoltFinaleRideFrame(t,this.deckFrame);this.deckFrame.invert();this.direction.applyQuaternion(this.deckFrame);
      }
      actor.presentation.setAimDirection(this.direction);
      actor.presentation.update(dt,actor.state);
    }
    this.options.bobPresentation.setExpression('surprise',t>=T.grateWarning&&t<T.ductSilence?1:t>=T.scanBob&&t<T.hijack?.8:t>=T.ambushNotice&&t<T.ambushKill?1:t>=T.watching&&t<T.ambushKill?.35:0);
    this.options.bobPresentation.setExpression('effort',t>=T.coverRun&&t<T.coverImpact||t>=T.ductRun&&t<T.grateWarning?.7:0);
    this.options.goopPresentation.setExpression('determined',t>=T.followMe&&t<T.grateWarning?.5:t>=at(62)&&t<T.even?.8:0);
    this.options.goopPresentation.setExpression('relieved',t>=T.even&&t<at(75)?.5:0);
  }
  private cue(sound:SoundId,position:THREE.Vector3):void{gameplayAudioEvents.emit('cue',{sound,position,maxDistance:110,volumeScale:.8});}
  reset():void{
    if(this.ventView){for(const entry of this.environment)entry.mesh.visible=entry.visible;this.ventView=false;}
    if(this.played){
      for(const actor of this.actors){
        if(actor.parent)actor.parent.add(actor.presentation.root);else actor.presentation.root.removeFromParent();
        actor.pose.visible=false;actor.pose.rotation.set(0,0,0);actor.pose.scale.set(1,1,1);actor.presentation.setPosition(actor.body.position);
        actor.presentation.reset();
      }
      const {room}=this.options;
      room.root.add(room.releaseCover,room.releaseCoverCollider);room.releaseCover.position.copy(this.coverPosition);room.releaseCover.quaternion.copy(this.coverQuaternion);
      room.releaseCoverCollider.position.copy(this.colliderPosition);room.releaseCoverCollider.quaternion.copy(this.colliderQuaternion);
      room.releaseCover.visible=room.releaseCoverCollider.visible=true;this.boardPivot.visible=true;this.boardPivot.position.set(0,0,0);this.boardPivot.quaternion.identity();
      this.options.encounter.drones.forEach((drone,i)=>{
        drone.root.visible=true;drone.root.position.copy(this.droneHome[i]);this.droneShells[i].quaternion.copy(this.droneHomeOrientation[i]);
        drone.collider.visible=this.droneColliderVisibility[i];
      });this.options.encounter.endCinematic();
      if(this.ambient){this.ambient.intensity=this.savedAmbientIntensity;this.ambient.groundColor.copy(this.savedAmbientGround);this.ambient.color.copy(this.savedAmbientSky);}
      for(const saved of this.craftFinishes){saved.material.emissive.copy(saved.color);saved.material.emissiveIntensity=saved.intensity;}
      if(this.options.speech)this.options.speech.visible=this.savedSpeechVisibility;
      this.glow.color.copy(this.savedGlow);this.wayfinding.color.copy(this.savedWayfinding);
      this.glow.intensity=this.savedGlowIntensity;this.wayfinding.intensity=this.savedWayfindingIntensity;
      if(this.camera&&this.cameraState){Object.assign(this.camera,this.cameraState);this.camera.updateProjectionMatrix();}
    }
    this.playing=this.played=this.skipRequested=false;this.elapsed=this.previous=0;
    this.overlay.hide();this.voice.reset();this.options.set.reset();
    this.flightAudio.reset();
  }
  dispose():void{
    if(this.disposed)return;this.reset();this.disposed=true;this.overlay.dispose();this.boardPivot.removeFromParent();
    this.flightAudio.dispose();
    this.actors.forEach(actor=>actor.pose.removeFromParent());
  }
}
