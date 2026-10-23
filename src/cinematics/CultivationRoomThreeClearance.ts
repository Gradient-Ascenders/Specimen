import * as THREE from 'three';
import { gameplayAudioEvents } from '../audio/GameplayAudioEvents.ts';
import type { RoomThreeDroneEncounter } from '../hazards/RoomThreeDroneEncounter.ts';
import type { LevelTwoRoomThreeGreybox } from '../levels/LevelTwoRoomThreeGreybox.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { BobCharacterPresentation, BobCharacterPresentationState } from '../render/bob/BobCharacterPresentation.ts';
import type { AcidSurfaceMaterial } from '../render/environment/containment/AcidSurfaceMaterial.ts';
import { CultivationRoomThreeDescent, ROOM_THREE_DESCENT_FLOOR, ROOM_THREE_DESCENT_PLATFORMS } from './CultivationRoomThreeDescent.ts';

export const ROOM_THREE_CLEARANCE_TIMING=Object.freeze({pushInterval:3.2,sinkSeconds:2.2,cameraReturnSeconds:1.2});
export const ROOM_THREE_CLEARANCE_PLATFORMS=ROOM_THREE_DESCENT_PLATFORMS;
const UP=new THREE.Vector3(0,1,0),ZERO=new THREE.Vector3();
const ORDER=[3,2,1,0] as const;
const PUSH_X=[6,2,-2,-6] as const;
const PUSH_Z=[68,68.7,68.7,68] as const;
const smooth=(u:number)=>{u=THREE.MathUtils.clamp(u,0,1);return u*u*(3-2*u);};

interface Options {
  readonly room:LevelTwoRoomThreeGreybox;
  readonly encounter:RoomThreeDroneEncounter;
  readonly bob:KinematicBody;
  readonly presentation:BobCharacterPresentation;
  readonly acid:AcidSurfaceMaterial;
}

/** A live, fixed-step sequence using the real actor, sentries and acid.
 * Resources exist at level construction, before isolated room preparation.
 * No new models, lights, textures, colliders or GPU allocations at the trigger.
 */
export class CultivationRoomThreeClearance {
  readonly root=new THREE.Group();
  readonly bubbles:THREE.InstancedMesh;
  private readonly geometry=new THREE.SphereGeometry(1,8,6);
  private readonly material=new THREE.MeshStandardMaterial({name:'room-three-acid-displacement',color:0x7d9c38,
    emissive:0x233107,emissiveIntensity:.3,roughness:.22,metalness:.03});
  private readonly start=new THREE.Vector3();
  private readonly local=new THREE.Vector3();
  private readonly previousLocal=new THREE.Vector3();
  private readonly world=new THREE.Vector3();
  private readonly previousWorld=new THREE.Vector3();
  private readonly velocity=new THREE.Vector3();
  private readonly intent=new THREE.Vector3();
  private readonly direction=new THREE.Vector3();
  private readonly target=new THREE.Vector3();
  private readonly eye=new THREE.Vector3();
  private readonly startEye=new THREE.Vector3();
  private readonly startOrientation=new THREE.Quaternion();
  private readonly orientation=new THREE.Quaternion();
  private readonly matrix=new THREE.Matrix4();
  private readonly scale=new THREE.Vector3();
  private readonly pushed=[false,false,false,false];
  private readonly toppled=[false,false,false,false];
  private readonly splashed=[false,false,false,false];
  private readonly splashSeconds=[NaN,NaN,NaN,NaN];
  private playing=false;
  private played=false;
  private elapsed=0;
  private previousElapsed=0;
  private disposed=false;
  private readonly options:Options;
  private readonly bank:THREE.Mesh;
  readonly descent:CultivationRoomThreeDescent;
  private bottomEntry=false;
  private firstMove=0;
  private end=0;
  private readonly state:BobCharacterPresentationState={
    locomotionPositionWorld:this.world,velocityWorld:this.velocity,movementIntentWorld:this.intent,
    maximumLocomotionSpeedMetresPerSecond:6,surfaceNormalWorld:UP,gameplayUpWorld:UP,
    grounded:true,attached:false,chargingJump:false,jumpCharge:0,contactCount:0,
    contactNormalWorld:UP,contactSpeedMetresPerSecond:0,contactName:'',contactSurfaceTag:'',landedThisStep:false,
  };

  constructor(options:Options){
    this.options=options;
    this.bank=options.room.collisionMeshes.find(mesh=>mesh.name==='cultivation-room-3-final-safe-floor')!;
    this.descent=new CultivationRoomThreeDescent(options.room,options.bob.radiusMetres);
    this.root.name='cultivation-room-3-clearance-effects';this.root.userData.presentationOnly=true;
    this.bubbles=new THREE.InstancedMesh(this.geometry,this.material,48);
    this.bubbles.name='room-three-pooled-drone-acid-bubbles';this.bubbles.frustumCulled=false;
    this.bubbles.userData.prewarmInstanceCount=1;this.bubbles.userData.visualOnly=true;
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles.setMatrixAt(0,this.matrix.makeScale(.001,.001,.001));this.bubbles.count=0;
    this.root.add(this.bubbles);options.room.root.add(this.root);
  }
  get active():boolean{return this.playing;}
  get complete():boolean{return this.played&&!this.playing;}
  get seconds():number{return this.elapsed;}
  get durationSeconds():number{return this.end;}
  get firstPushMoveSeconds():number{return this.firstMove;}

  tryBegin(camera:THREE.PerspectiveCamera):boolean{
    const {bob,room,encounter}=this.options;
    if(this.disposed||this.played||!bob.grounded||!bob.supportCollider||
      encounter.readModel.allGroundDronesDisabled)return false;
    const onUpper=ROOM_THREE_CLEARANCE_PLATFORMS.includes(bob.supportCollider.name);
    const onDrone=encounter.groundDrones.some(ground=>ground.drone.collider===bob.supportCollider&&
      ground.readModel.state!=='tipping'&&ground.readModel.state!=='permanentlyDisabled');
    const onBank=bob.supportCollider===this.bank;
    if(!onUpper&&!onDrone&&!onBank)return false;
    room.root.worldToLocal(this.start.copy(bob.position));
    this.bottomEntry=!onUpper;
    if(this.bottomEntry)this.descent.beginFromBottom(this.start,onDrone);
    else this.descent.begin(this.start,bob.supportCollider.name);
    this.firstMove=this.descent.landSeconds+.65;this.end=this.firstMove+4*ROOM_THREE_CLEARANCE_TIMING.pushInterval+3.7;
    this.elapsed=this.previousElapsed=0;this.played=this.playing=true;
    this.startEye.copy(camera.position);this.startOrientation.copy(camera.quaternion);
    encounter.cancelTransientState();this.pushed.fill(false);this.toppled.fill(false);this.splashed.fill(false);this.splashSeconds.fill(NaN);
    return true;
  }

  update(dt:number):boolean{
    if(!this.playing||this.disposed)return false;
    if(!Number.isFinite(dt)||dt<=0)throw new RangeError('Invalid Room 3 cinematic timestep.');
    const {bob,room,encounter,presentation,acid}=this.options,T=ROOM_THREE_CLEARANCE_TIMING;
    this.previousElapsed=this.elapsed;this.elapsed=Math.min(this.end,this.elapsed+dt);
    this.sampleBob(this.previousElapsed,this.previousLocal);this.sampleBob(this.elapsed,this.local);
    room.root.localToWorld(this.world.copy(this.local));room.root.localToWorld(this.previousWorld.copy(this.previousLocal));
    this.velocity.subVectors(this.world,this.previousWorld).divideScalar(dt);
    this.intent.copy(this.velocity);this.intent.y=0;if(this.intent.lengthSq()>1)this.intent.normalize();
    bob.syncKinematicPose(this.world,this.previousWorld);
    const flight=this.descent.steps.find(step=>this.elapsed>=step.start&&this.elapsed<step.end);
    const charge=this.descent.steps.find(step=>this.elapsed>=step.chargeStart&&this.elapsed<step.start);
    this.state.grounded=!flight;this.state.chargingJump=!!charge;
    this.state.jumpCharge=charge?(this.elapsed-charge.chargeStart)/(charge.start-charge.chargeStart)*charge.chargeFraction:0;
    this.state.landedThisStep=false;
    for(const step of this.descent.steps){
      if(this.previousElapsed<step.start&&this.elapsed>=step.start){
        this.descent.velocity(step,step.start,this.direction);const speed=this.direction.length();this.direction.normalize();
        presentation.onLaunch({directionWorld:this.direction,speedMetresPerSecond:speed,chargeFraction:step.chargeFraction});
        gameplayAudioEvents.emit('cue',{sound:'bob-jump-01',position:this.world});
      }
      if(this.previousElapsed<step.end&&this.elapsed>=step.end){
        this.descent.velocity(step,step.end,this.direction);this.state.landedThisStep=true;
        presentation.onLanding(UP,Math.abs(this.direction.y));
        gameplayAudioEvents.emit('cue',{sound:step.landingName==='floor'?'bob-land-hard-01':'bob-land-soft-01',position:this.world});
      }
    }
    if(this.elapsed<this.firstMove&&(!this.bottomEntry||this.elapsed<=(this.descent.steps[0]?.end??0))){
      // Charging and airborne poses do not derive facing from locomotion.
      // Turn toward the landing before launch and retain it through the bounce.
      const leap=this.descent.steps[0];
      this.direction.subVectors(leap.to,leap.from);this.direction.y=0;
      this.direction.transformDirection(room.root.matrixWorld);presentation.setAimDirection(this.direction);
    }else if(this.intent.lengthSq()<.01){this.direction.set(0,0,-1);presentation.setAimDirection(this.direction);}
    presentation.setPosition(this.world);presentation.update(dt,this.state);
    for(let i=0;i<ORDER.length;i++){
      const pushAt=this.firstMove+i*T.pushInterval+1.45;
      if(!this.pushed[i]&&this.elapsed>=pushAt){
        encounter.groundDrones[ORDER[i]].beginCinematicPush(2.1);this.pushed[i]=true;
        gameplayAudioEvents.emit('cue',{sound:'cultivation-sentry-shove-01',position:this.world,maxDistance:80});
      }
      if(this.pushed[i]&&!this.toppled[i]&&this.elapsed>=pushAt+.12){
        encounter.groundDrones[ORDER[i]].drone.root.getWorldPosition(this.pointForSplash);
        gameplayAudioEvents.emit('cue',{sound:'cultivation-sentry-topple-01',position:this.pointForSplash,maxDistance:80});
        this.toppled[i]=true;
      }
    }
    // Keep real tipping, acid contact and completion events authoritative.
    encounter.update(dt,'goop',ZERO,{bob:false,goop:false});
    for(let i=0;i<ORDER.length;i++){
      const drone=encounter.groundDrones[ORDER[i]];
      if(drone.readModel.state!=='permanentlyDisabled')continue;
      if(!this.splashed[i]){
        drone.drone.root.getWorldPosition(this.pointForSplash);
        acid.disturb(this.pointForSplash.x,this.pointForSplash.z,0,2.2);
        gameplayAudioEvents.emit('cue',{sound:'cultivation-sentry-acid-splash-01',position:this.pointForSplash,maxDistance:80});
        gameplayAudioEvents.emit('loop',{key:this.dissolveKey(i),sound:'goop-dissolve-loop-01',position:this.pointForSplash.clone(),volumeScale:.65});
        this.splashSeconds[i]=this.elapsed;
        this.splashed[i]=true;
      }
      const age=this.elapsed-this.splashSeconds[i];
      if(age>=T.sinkSeconds&&this.previousElapsed-this.splashSeconds[i]<T.sinkSeconds)
        gameplayAudioEvents.emit('stop',{key:this.dissolveKey(i)});
      drone.submergeDisabled(smooth((this.elapsed-(this.firstMove+i*T.pushInterval+2.35))/T.sinkSeconds)*3.2);
    }
    this.presentBubbles();
    acid.update(dt);
    if(this.elapsed>=this.end){
      this.stopAudio();bob.recoverAt(this.world);this.playing=false;this.bubbles.count=0;return true;
    }
    return false;
  }
  private readonly pointForSplash=new THREE.Vector3();

  /** Camera and actor interpolation never advance the fixed movie clock. */
  present(camera:THREE.PerspectiveCamera,alpha:number):void{
    if(!this.playing)return;
    const t=THREE.MathUtils.lerp(this.previousElapsed,this.elapsed,THREE.MathUtils.clamp(alpha,0,1));
    const {room,presentation}=this.options;
    this.sampleBob(t,this.local);room.root.localToWorld(this.world.copy(this.local));presentation.setPosition(this.world);
    if(t<this.firstMove){
      this.eye.set(Math.min(16,this.local.x+6),THREE.MathUtils.clamp(this.local.y+2.8,4,27.4),this.local.z-6);this.target.copy(this.local).y+=.25;
    }else if(t<this.firstMove+12.3){this.eye.set(this.local.x+5,4.6,71.1);this.target.set(this.local.x,.9,66);}
    else {this.eye.set(-10,1.8,60.6);this.target.set(-6,.35,63.4);}
    room.root.localToWorld(this.eye);room.root.localToWorld(this.target);
    this.matrix.lookAt(this.eye,this.target,UP);this.orientation.setFromRotationMatrix(this.matrix);
    if(t<.65){const blend=smooth(t/.65);this.eye.lerpVectors(this.startEye,this.eye,blend);this.orientation.slerp(this.startOrientation,1-blend);}
    const back=smooth((t-(this.end-ROOM_THREE_CLEARANCE_TIMING.cameraReturnSeconds))/ROOM_THREE_CLEARANCE_TIMING.cameraReturnSeconds);
    camera.position.lerpVectors(this.eye,camera.position,back);camera.quaternion.slerp(this.orientation,1-back);camera.updateMatrixWorld(true);
  }

  private dissolveKey(index:number):string{return `cultivation-sentry-dissolve-${index}`;}
  private stopAudio():void{for(let i=0;i<ORDER.length;i++)gameplayAudioEvents.emit('stop',{key:this.dissolveKey(i)});}
  reset():void{this.stopAudio();this.playing=this.played=false;this.bottomEntry=false;this.elapsed=this.previousElapsed=0;this.bubbles.count=0;this.splashSeconds.fill(NaN);}
  dispose():void{
    if(this.disposed)return;this.reset();this.disposed=true;this.root.removeFromParent();this.root.clear();
    this.bubbles.dispose();this.geometry.dispose();this.material.dispose();
  }
  private sampleBob(t:number,target:THREE.Vector3):void{
    const T=ROOM_THREE_CLEARANCE_TIMING,landY=.35+this.options.bob.radiusMetres+.01;
    if(t<this.firstMove){this.descent.sample(t,target);return;}
    target.set(ROOM_THREE_DESCENT_FLOOR.x,landY,ROOM_THREE_DESCENT_FLOOR.z);
    for(let i=0;i<ORDER.length;i++){
      const start=this.firstMove+i*T.pushInterval,age=t-start,x=PUSH_X[i],previousX=i?PUSH_X[i-1]:ROOM_THREE_DESCENT_FLOOR.x;
      if(age<0)return;
      const rear=PUSH_Z[i]+.85+this.options.bob.radiusMetres+.04;
      target.x=THREE.MathUtils.lerp(previousX,x,smooth(age));target.z=THREE.MathUtils.lerp(70.8,rear+.65,smooth(age));
      if(age>=1&&age<1.65)target.z=THREE.MathUtils.lerp(rear+.65,rear-.2,smooth((age-1)/.65));
      else if(age>=1.65&&age<2.25)target.z=THREE.MathUtils.lerp(rear-.2,70.8,smooth((age-1.65)/.6));
      else if(age>=2.25)target.z=70.8;
      if(age<T.pushInterval)return;
    }
  }
  private presentBubbles():void{
    let count=0;const T=ROOM_THREE_CLEARANCE_TIMING;
    for(let i=0;i<ORDER.length;i++){
      const age=this.elapsed-(this.firstMove+i*T.pushInterval+2.35);
      if(age<0||age>3||!this.splashed[i])continue;
      const drone=this.options.encounter.groundDrones[ORDER[i]].drone;
      for(let n=0;n<12;n++){
        const phase=(age+n*.13)%1.1,radius=(.045+(n%3)*.015)*Math.min(1,(3-age)*2);
        this.pointForSplash.set(drone.root.position.x+Math.cos(n*2.4)*(1+phase*.4),
          .02+Math.sin(phase/1.1*Math.PI)*(.3+(n%4)*.1),drone.root.position.z+Math.sin(n*2.4)*(.5+phase*.3));
        this.scale.setScalar(Math.max(.001,radius));this.orientation.identity();
        this.matrix.compose(this.pointForSplash,this.orientation,this.scale);this.bubbles.setMatrixAt(count++,this.matrix);
      }
    }
    this.bubbles.count=count;if(count)this.bubbles.instanceMatrix.needsUpdate=true;
  }
}
