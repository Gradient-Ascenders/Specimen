import * as THREE from 'three';
import type { AudioPlayback } from '../audio/AudioManager.ts';
import type { CombatTarget, CombatTargetRegistry } from '../combat/CombatTargetRegistry.ts';
import type { SpecimenProjectileSystem } from '../combat/SpecimenProjectileSystem.ts';
import { CollisionHit, CollisionLayer, ColliderTransformMode, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { SecurityDronePresentation, SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { SentinelDroneSquad } from './attacks/SentinelDroneAttack.ts';
import { SentinelWeakPointTarget } from './SentinelWeakPointTarget.ts';
import { ExterminationArena } from './ExterminationArena.ts';
import { FINAL_ARENA, FINAL_MERGE_ANCHOR } from './FinalBossConfig.ts';
import { FinalBossController, type FinalBossState } from './FinalBossController.ts';
import { FinalBossPresentation } from './FinalBossPresentation.ts';

const CAPTION = {
  sweep:'LASER SWEEP · MOVE BEHIND COVER', strike:'TARGET LOCKED · KEEP MOVING', summon:'DRONE BAYS OPEN · TAP TO DESTROY',
  shockwave:'SHOCKWAVE · JUMP OVER THE RING', sectors:'FLOOR DISCHARGE · FIND AN UNLIT SECTOR', devastation:'DEVASTATION BEAM · BREAK LINE OF SIGHT',
} as const;

/** Level-owned composition. All attacks use the same geometry for VFX and hits. */
export class FinalBossEncounter {
  readonly controller = new FinalBossController();
  readonly presentation:FinalBossPresentation;
  readonly squad:SentinelDroneSquad;
  readonly element:HTMLElement;
  readonly beamStart=new THREE.Vector3();
  readonly beamEnd=new THREE.Vector3();
  private readonly options:{arena:ExterminationArena;world:CollisionWorld;targets:CombatTargetRegistry;body:KinematicBody;weapon:SpecimenProjectileSystem;host:HTMLElement;audio?:AudioPlayback;presentation:FinalBossPresentation;requestFailure:()=>boolean};
  private readonly unregister:Array<()=>void>=[];
  private readonly droneResources=new SecurityDronePresentationResources(undefined,true);
  private readonly drones:SecurityDronePresentation[]=[];
  private readonly droneDeployTimes=[0,0,0,0];
  private readonly hostileShots:THREE.InstancedMesh;
  private readonly shotGeometry=new THREE.SphereGeometry(.16,7,5);
  private readonly shotMaterial=new THREE.MeshBasicMaterial({color:0xff475d});
  private readonly dummy=new THREE.Object3D();
  private readonly direction=new THREE.Vector3();
  private readonly playerPosition=new THREE.Vector3();
  private readonly closest=new THREE.Vector3();
  private readonly line=new THREE.Line3();
  private readonly hit=new CollisionHit();
  private readonly bossHealth:HTMLProgressElement;
  private readonly playerHealth:HTMLProgressElement;
  private readonly phaseLabel:HTMLElement;
  private readonly message:HTMLElement;
  private readonly cinematicText:HTMLElement;
  private readonly skip:HTMLButtonElement;
  private oldState:FinalBossState='idle';
  private oldStage='';
  private summonSerial=-1;
  private shotDamageSerial=-10;
  private shake=0;
  private skipRequested=false;
  private savedFov:number|undefined;
  private disposed=false;

  constructor(options:FinalBossEncounter['options']) {
    this.options=options;
    this.presentation=options.presentation;
    const {world,targets,arena,body,weapon}=options;
    arena.root.add(this.presentation.root);
    for(const door of [arena.entryDoor,arena.exitDoor])world.setTransformMode(door,ColliderTransformMode.Dynamic);
    const authority={isWeakPointOpen:()=>this.controller.readModel.weakPointOpen,
      copyWeakPointSplashPosition:(p:THREE.Vector3)=>p.copy(this.presentation.coreWorld),
      applyWeakPointImpact:(impact:Parameters<FinalBossController['applyImpact']>[0])=>{
        const result=this.controller.applyImpact(impact);this.presentation.burst(new THREE.Vector3().copy(impact.point),result.accepted?12:5);
        options.audio?.play(result.accepted?'goop-projectile-impact-01':'volt-circuit-release-01',impact.point,true,.7);return result;
      }};
    const weakPoint=new SentinelWeakPointTarget({id:'extermination-core',hitMeshes:[this.presentation.core],authority});
    world.register(this.presentation.core,CollisionLayer.Projectile,ColliderTransformMode.Dynamic);
    this.unregister.push(()=>world.unregister(this.presentation.core),targets.register(weakPoint));
    const armour:CombatTarget={id:'extermination-armour',hitMeshes:[this.presentation.armour],isCombatActive:()=>true,
      copySplashWorldPosition:p=>this.presentation.machine.getWorldPosition(p),
      applyImpact:impact=>{this.controller.readModel.rejectedFlash=.3;this.presentation.burst(new THREE.Vector3().copy(impact.point),5);return {accepted:false,destroyed:false,rejectionReason:'armour'};}};
    world.register(this.presentation.armour,CollisionLayer.Projectile,ColliderTransformMode.Dynamic);
    this.unregister.push(()=>world.unregister(this.presentation.armour),targets.register(armour));
    this.squad=new SentinelDroneSquad({collisionWorld:world,targetRegistry:targets,
      anchors:[-3,-1,1,3].map(x=>new THREE.Vector3(x,6,FINAL_ARENA.centreZ-4)),
      maximumDrones:4,droneHealthUnits:3,fireIntervalSeconds:2.3,projectileCapacity:16,idPrefix:'extermination-minion'});
    arena.root.add(this.squad.root);
    this.squad.root.children.forEach((root,index)=>{
      const collider=root.children[0] as THREE.Mesh; (collider.material as THREE.Material).visible=false;
      const drone=new SecurityDronePresentation({id:`extermination-minion-${index}`,type:'ceiling',
        colliderSize:new THREE.Vector3(1.5,.8,1.3),initialPosition:new THREE.Vector3(),forward:new THREE.Vector3(0,0,-1),scanAxis:new THREE.Vector3(0,1,0),
        scanHalfAngleRadians:1,scanSpeedRadiansPerSecond:1,detectionHalfAngleRadians:1,detectionRangeMetres:50,
        warningSeconds:1,fireIntervalSeconds:2,targetLossGraceSeconds:1,cooldownSeconds:1,muzzleAnchor:new THREE.Vector3(),targetPolicy:'bob-only',initialScanPhase:0},this.droneResources);
      drone.setState('warning',true);root.add(drone.root);this.drones.push(drone);
    });
    this.unregister.push(this.squad.events.on('deployed',e=>{this.droneDeployTimes[e.slotIndex]=this.controller.time;}));
    this.unregister.push(this.squad.events.on('destroyed',e=>{
      const p=this.squad.root.children[e.slotIndex]!.position;this.presentation.burst(p,16);this.controller.droneDestroyed();
      options.audio?.play('world-drone-dissolve-01',p,true,.75);
    }));
    this.unregister.push(this.squad.events.on('projectileFired',e=>options.audio?.play('specimen-turret-shot',this.squad.root.children.find(r=>r.name.startsWith(e.droneId))?.position,true,.35)));
    this.unregister.push(weapon.events.on('projectileFired',e=>options.audio?.play('volt-shoot-01',body.position,true,e.fullyCharged?1:.6)));
    this.unregister.push(weapon.events.on('fullChargeReached',()=>options.audio?.play('volt-charge-ready-01',body.position,false,.8)));
    this.hostileShots=new THREE.InstancedMesh(this.shotGeometry,this.shotMaterial,16);this.hostileShots.frustumCulled=false;this.hostileShots.count=0;arena.root.add(this.hostileShots);
    const doc=options.host.ownerDocument??document;
    this.element=doc.createElement('section');this.element.className='final-boss-hud';this.element.hidden=true;
    this.phaseLabel=doc.createElement('div');this.phaseLabel.className='final-boss-heading';
    this.bossHealth=doc.createElement('progress');this.bossHealth.max=180;this.bossHealth.setAttribute('aria-label','Exterminator health');
    this.playerHealth=doc.createElement('progress');this.playerHealth.max=100;this.playerHealth.className='final-boss-integrity';this.playerHealth.setAttribute('aria-label','Specimen integrity');
    this.message=doc.createElement('div');this.message.className='final-boss-message';
    this.cinematicText=doc.createElement('div');this.cinematicText.className='final-boss-cinematic';
    this.skip=doc.createElement('button');this.skip.className='final-boss-skip';this.skip.textContent='Enter · Skip cinematic';this.skip.onclick=()=>{this.skipRequested=true;};
    this.element.append(this.phaseLabel,this.bossHealth,this.playerHealth,this.message,this.cinematicText,this.skip);options.host.append(this.element);
    this.reset();
  }

  get cinematic():boolean {return this.controller.cinematic;}
  start(shortIntro=false):boolean {
    const accepted=this.controller.start(shortIntro);if(!accepted)return false;
    this.options.arena.setPowered(true);this.options.arena.setDoors(true);this.options.audio?.startLoop('final-boss-engine','world-machinery-loop-01',this.presentation.machine.position);
    this.sync(0);return true;
  }
  update(dt:number,skip=false):void {
    if(this.disposed)return;
    const before=this.controller.readModel.state;
    if(skip||this.skipRequested) {this.controller.skipCinematic(this.options.body.position);this.skipRequested=false;}
    this.controller.update(dt,this.options.body.position);
    const m=this.controller.readModel;
    if(m.state!==before||m.state!==this.oldState) {
      if(this.cinematic||m.state==='suspended') {this.clearAttacks();this.options.weapon.reset();}
      this.shake=m.state==='transition'?.08:m.state==='defeated'?.18:0;
      if(m.state==='transition')this.options.audio?.play('world-activation-01',this.presentation.machine.position,false,1);
      if(m.state==='defeated')this.options.audio?.play('world-drone-dissolve-01',this.presentation.machine.position,false,1);
      if(m.state==='escape')this.options.audio?.play('world-platform-land-01',this.options.arena.exitDoor.position,false,1);
      this.oldState=m.state;
    }
    this.sync(dt);
    if(!this.controller.combatActive)return;
    const stageKey=`${m.attackSerial}:${m.stage}`;
    if(stageKey!==this.oldStage) {
      this.options.audio?.play(m.stage==='telegraph'?'world-activation-01':m.stage==='active'?'volt-shoot-01':'world-release-01',this.presentation.machine.position,false,m.stage==='active'?.8:.5);
      this.oldStage=stageKey;
    }
    this.updateDrones(dt);
    if(this.controller.readModel.state==='suspended')return;
    this.updateHazards(dt);
  }
  /** Reconcile presentation even when rendering without a simulation step. */
  private sync(_dt:number):void {
    const m=this.controller.readModel,{arena,body}=this.options;
    this.presentation.update(m,this.controller.time,body);
    arena.setPowered(m.state!=='idle'&&m.state!=='suspended',m.phase===2||m.state==='transition',this.controller.time);
    arena.setDoors(m.state!=='idle',m.state==='escape'||m.state==='complete');
    arena.deployment(m.state==='intro'?m.progress:1);arena.setDamaged(m.phase===2||['defeated','escape','complete'].includes(m.state));
    this.element.hidden=m.state==='idle'||m.state==='suspended'||m.state==='complete';
    this.element.dataset.state=m.state;this.element.dataset.phase=String(m.phase);this.element.dataset.hit=m.invulnerability>0?'true':'false';
    this.bossHealth.value=m.health;this.playerHealth.value=m.playerHealth;
    this.phaseLabel.textContent=`EXTERMINATOR / ${m.phase===1?'CONTAINMENT':'EXTERMINATION'} · ${Math.ceil(m.health/180*100)}%`;
    this.message.textContent=m.state==='exposed'?`${m.staggered?'SYSTEM STAGGER':'CORE EXPOSED'} · ${m.vulnerabilityRemaining.toFixed(1)}s · HOLD FIRE, THEN RELEASE`
      :m.state==='combat'?CAPTION[m.attack]:'';
    this.skip.hidden=!this.cinematic;
    this.cinematicText.hidden=!this.cinematic;
    this.cinematicText.textContent=m.state==='intro'?(m.progress<.45?'CONTAINMENT HAS FAILED':'EXTERMINATION CHAMBER')
      :m.state==='transition'?'EXTERMINATION PROTOCOL ACTIVATED\nALL SAFETY LIMITERS DISABLED'
        :m.state==='defeated'?(m.progress<.55?'DEFENCE CORE DESTROYED':'EMERGENCY EGRESS BREACHED'):'TOGETHER. FREE.';
    if(m.state==='escape') {
      const p=THREE.MathUtils.smoothstep(m.progress,0,.85);
      body.recoverAt(this.closest.set(0,FINAL_MERGE_ANCHOR.y,THREE.MathUtils.lerp(230,251,p)));
      this.presentation.specimen.position.copy(body.position);
    }
    this.shake=Math.max(0,this.shake-.002);
  }
  private updateHazards(dt:number):void {
    const m=this.controller.readModel,p=this.presentation,{body,arena}=this.options;
    p.beam.visible=false;p.shockwave.visible=false;p.targetMarker.visible=false;
    for(let i=0;i<6;i++)arena.setSector(i,'inactive');
    if(m.state!=='combat')return;
    const warning=m.stage==='telegraph',active=m.stage==='active';
    if(!warning&&!active)return;
    if(m.attack==='summon') {
      if(active&&this.summonSerial!==m.attackSerial) {this.summonSerial=m.attackSerial;this.squad.deploy(m.phase===1?3:4);}
      return;
    }
    if(m.attack==='sectors') {
      for(const sector of m.selectedSectors)arena.setSector(sector,warning?'warning':'active');
      if(!active)return;
      const dx=body.position.x,dz=body.position.z-FINAL_ARENA.centreZ;
      const angle=(Math.atan2(-dz,dx)+Math.PI*2)%(Math.PI*2);
      if(Math.hypot(dx,dz)>2&&body.position.y-body.radiusMetres<1.2&&m.selectedSectors.includes(Math.floor(angle/(Math.PI/3))))this.hitPlayer(28);
      return;
    }
    if(m.attack==='shockwave') {
      const radius=warning?2:m.progress*29;
      p.shockwave.visible=true;p.shockwave.scale.setScalar(radius);p.shockwave.position.y=.55;
      if(active) {
        const d=Math.hypot(body.position.x,body.position.z-FINAL_ARENA.centreZ);
        const prev=Math.hypot(body.previousPosition.x,body.previousPosition.z-FINAL_ARENA.centreZ);
        const previousRadius=Math.max(0,(m.progress-dt/2.4)*29);
        if(Math.max(d,prev)+body.radiusMetres>=previousRadius-.45&&Math.min(d,prev)-body.radiusMetres<=radius+.45&&Math.min(body.position.y,body.previousPosition.y)-body.radiusMetres<1.35)this.hitPlayer(28);
      }
      return;
    }
    this.beamStart.copy(p.coreWorld);
    if(m.attack==='sweep') {
      const angle=THREE.MathUtils.lerp(-Math.PI*.85,-Math.PI*.15,warning?0:m.progress);
      this.beamEnd.set(Math.cos(angle)*29,m.phase===1?1.6:4.4,FINAL_ARENA.centreZ+Math.sin(angle)*29);
    } else {
      this.beamEnd.copy(m.lockedTarget);this.direction.subVectors(this.beamEnd,this.beamStart).normalize();this.beamEnd.copy(this.beamStart).addScaledVector(this.direction,60);
      p.targetMarker.visible=warning;p.targetMarker.position.set(m.lockedTarget.x,Math.max(.45,m.lockedTarget.y-body.radiusMetres+.03),m.lockedTarget.z);
      p.targetMarker.scale.setScalar(m.attack==='devastation'?2:1);
    }
    // Occlude against actual solid world geometry, not a separate cover heuristic.
    const radius=m.attack==='devastation'?1.4:m.attack==='strike'?.5:.32;
    this.direction.subVectors(this.beamEnd,this.beamStart);
    if(this.options.world.sweepSphere(this.beamStart,this.direction,radius,this.hit,CollisionLayer.Movement))this.beamEnd.copy(this.hit.point);
    p.showBeam(this.beamStart,this.beamEnd,warning?.06:radius,warning);
    if(!active)return;
    this.line.set(this.beamStart,this.beamEnd);this.line.closestPointToPoint(this.playerPosition.copy(body.position),true,this.closest);
    const nearNow=this.closest.distanceToSquared(body.position)<(radius+body.radiusMetres)**2;
    this.line.closestPointToPoint(this.playerPosition.copy(body.previousPosition),true,this.closest);
    if(nearNow||this.closest.distanceToSquared(body.previousPosition)<(radius+body.radiusMetres)**2)this.hitPlayer(m.attack==='devastation'?34:28);
  }
  private updateDrones(dt:number):void {
    const {body}=this.options,t=this.controller.time;
    this.squad.root.children.forEach((root,i)=>{
      if(!root.visible)return;
      const age=t-this.droneDeployTimes[i]!;
      const spread=THREE.MathUtils.smoothstep(age,0,3);
      root.position.set((i-1.5)*2.2+Math.sin(t*.6+i)*spread*5,6+Math.sin(t*1.2+i)*.8,FINAL_ARENA.centreZ-4-spread*4+Math.cos(t*.5+i)*spread*3);
      this.direction.subVectors(body.position,root.position);this.drones[i]!.setAimDirection(this.direction);root.updateMatrixWorld(true);
    });
    this.squad.update(dt,body,()=>{
      // Hostile shots are independent of the boss attack's once-per-execution hit.
      return this.hitPlayer(16,this.shotDamageSerial--);
    });
    let count=0;
    for(const shot of this.squad.projectileStates) {
      if(!shot.active)continue;
      this.dummy.position.copy(shot.position);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.hostileShots.setMatrixAt(count++,this.dummy.matrix);
    }
    this.hostileShots.count=count;if(count)this.hostileShots.instanceMatrix.needsUpdate=true;
  }
  private hitPlayer(amount:number,serial?:number):boolean {
    if(!this.controller.damagePlayer(amount,serial))return false;
    this.options.audio?.play('bob-contact-01',this.options.body.position,true,.8);
    if(this.controller.readModel.playerHealth===0)this.options.requestFailure();return true;
  }
  presentCamera(camera:THREE.PerspectiveCamera):void {
    const m=this.controller.readModel;
    if(!this.cinematic) {this.restoreCamera(camera);return;}
    this.savedFov??=camera.fov;
    const p=m.progress,z=FINAL_ARENA.centreZ;
    if(m.state==='intro') {
      if(p<.35) {camera.position.set(-16+p*10,7,199);this.closest.set(0,12,z);}
      else if(p<.7) {camera.position.set(8,6,z-13+(p-.35)*9);this.closest.copy(this.presentation.coreWorld);}
      else {camera.position.set(-5,5,192);this.closest.set(0,8,z);}
    } else if(m.state==='transition') {
      camera.position.set(14-p*4,7+p*2,z-17);this.closest.copy(this.presentation.coreWorld);
    } else if(m.state==='defeated') {
      camera.position.set(-12+p*3,6,z-12);this.closest.set(0,Math.max(3,9-p*8),z+3);
    } else {camera.position.set(-8,5,239+p*10);this.closest.copy(this.options.body.position).add(this.direction.set(0,1,2));}
    camera.fov=m.state==='escape'?58:52;camera.lookAt(this.closest);
    if(this.shake>0)camera.position.x+=Math.sin(this.controller.time*83)*this.shake;
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  restoreCamera(camera:THREE.PerspectiveCamera):void {
    if(this.savedFov===undefined)return;camera.fov=this.savedFov;camera.updateProjectionMatrix();this.savedFov=undefined;
  }
  clearAttacks():void {
    this.squad.clear();this.hostileShots.count=0;this.presentation.beam.visible=false;this.presentation.shockwave.visible=false;this.presentation.targetMarker.visible=false;
    for(let i=0;i<6;i++)this.options.arena.setSector(i,'inactive');this.oldStage='';
  }
  suspend():void {this.controller.suspend();this.clearAttacks();this.options.audio?.stopLoop('final-boss-engine');this.element.hidden=true;}
  reset():void {
    this.clearAttacks();this.controller.reset();this.presentation.reset();this.options.arena.reset();this.element.hidden=true;
    this.summonSerial=-1;this.oldState='idle';this.skipRequested=false;this.options.audio?.stopLoop('final-boss-engine');
  }
  dispose():void {
    if(this.disposed)return;this.reset();for(const unregister of this.unregister)unregister();
    // Borrowed presentation meshes must detach before the squad's owned proxy traversal.
    for(const drone of this.drones)drone.dispose();this.droneResources.dispose();this.squad.dispose();
    this.hostileShots.removeFromParent();this.shotGeometry.dispose();this.shotMaterial.dispose();
    this.presentation.dispose();this.controller.dispose();this.element.remove();this.disposed=true;
  }
}
