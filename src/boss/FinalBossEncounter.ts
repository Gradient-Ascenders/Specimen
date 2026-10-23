import * as THREE from 'three';
import type { AudioPlayback } from '../audio/AudioManager.ts';
import type { CombatTargetRegistry } from '../combat/CombatTargetRegistry.ts';
import type { SpecimenProjectileSystem } from '../combat/SpecimenProjectileSystem.ts';
import { CollisionHit, CollisionLayer, ColliderTransformMode, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { ExterminatorMinionPresentation } from './ExterminatorMinionPresentation.ts';
import { ExterminatorDebris } from './ExterminatorDebris.ts';
import { loadExterminatorModelAsset, type ExterminatorModelAsset } from './ExterminatorModelAsset.ts';
import { SentinelDroneSquad } from './attacks/SentinelDroneAttack.ts';
import { ExterminatorProjectiles } from './attacks/ExterminatorProjectiles.ts';
import { SentinelWeakPointTarget } from './SentinelWeakPointTarget.ts';
import { ExterminationArena } from './ExterminationArena.ts';
import { FINAL_ARENA, FINAL_ARENA_SCALE, FINAL_ARENA_RING, FINAL_BOSS_TUNING as T, FINAL_MERGE_ANCHOR, finalArenaY, finalArenaZ } from './FinalBossConfig.ts';
import { ExterminatorDroneFlight } from './ExterminatorDroneFlight.ts';
import { FinalBossController, type FinalBossState } from './FinalBossController.ts';
import { FinalBossPresentation } from './FinalBossPresentation.ts';
import { FinalBossHud } from './FinalBossHud.ts';
import { BossHealthPacks } from './BossHealthPacks.ts';
import { ExterminatorReinforcements } from './ExterminatorReinforcements.ts';
import { ExterminatorEvasion } from './ExterminatorEvasion.ts';

/** Visible emitters/endpoints and hit authority share one source. */
export class FinalBossEncounter {
  readonly controller:FinalBossController;
  readonly presentation:FinalBossPresentation;
  readonly squad:SentinelDroneSquad;
  readonly projectiles:ExterminatorProjectiles;
  readonly healthPacks:BossHealthPacks;
  readonly reinforcements:ExterminatorReinforcements;
  readonly evasion:ExterminatorEvasion;
  readonly element:HTMLElement;
  readonly beamStart=new THREE.Vector3();
  readonly beamEnd=new THREE.Vector3();
  private readonly options:{arena:ExterminationArena;world:CollisionWorld;targets:CombatTargetRegistry;body:KinematicBody;weapon:SpecimenProjectileSystem;host:HTMLElement;audio?:AudioPlayback;presentation:FinalBossPresentation;requestFailure:()=>boolean;isPlayerInvulnerable?:()=>boolean;onPlayerDamaged?:(amount:number)=>void;onPlayerDodged?:()=>void;random?:()=>number};
  private readonly unregister:Array<()=>void>=[];
  private readonly drones:ExterminatorMinionPresentation[]=[];
  private readonly debris=new ExterminatorDebris();
  private readonly modelAbort=new AbortController();
  private modelAsset:ExterminatorModelAsset|undefined;
  private modelPreparation:Promise<void>|undefined;
  private reflectionEnvironment:THREE.Texture|null=null;
  private readonly droneFlight:ExterminatorDroneFlight;
  private readonly hostileShots:THREE.InstancedMesh;
  private readonly shotGeometry=new THREE.SphereGeometry(.18,7,5);
  private readonly shotMaterial=new THREE.MeshBasicMaterial({color:0xff475d});
  private readonly dummy=new THREE.Object3D();
  private readonly direction=new THREE.Vector3();
  private readonly playerPosition=new THREE.Vector3();
  private readonly closest=new THREE.Vector3();
  private readonly predicted=new THREE.Vector3();
  private readonly leftMuzzle=new THREE.Vector3();
  private readonly rightMuzzle=new THREE.Vector3();
  private readonly line=new THREE.Line3();
  private readonly hit=new CollisionHit();
  private readonly hud:FinalBossHud;
  private oldState:FinalBossState='idle';
  private oldStage='';
  private summonSerial=-1;
  private weaponSerial=-1;
  private fired=0;
  private readonly volleyAim=new THREE.Vector3();
  private shotDamageSerial=-1000000;
  private shake=0;
  private skipRequested=false;
  private savedFov:number|undefined;
  private savedFar:number|undefined;
  private disposed=false;
  private explosionPlayed=false;
  private reinforcementIndex=0;
  private readonly previousNose=new THREE.Vector3();
  private readonly ramDisplacement=new THREE.Vector3();

  constructor(options:FinalBossEncounter['options']) {
    this.options=options;this.controller=new FinalBossController({random:options.random});this.presentation=options.presentation;
    this.droneFlight=new ExterminatorDroneFlight(options.world);
    const {world,targets,arena,weapon}=options,p=this.presentation;arena.root.add(p.root,this.debris.root);
    this.evasion=new ExterminatorEvasion({world,eye:p.core,machine:p.machine});
    for(const collider of [arena.entryDoor,arena.exitDoor,...arena.platforms.map(p=>p.collider)])world.setTransformMode(collider,ColliderTransformMode.Dynamic);
    const weakPoint=new SentinelWeakPointTarget({id:'extermination-core',hitMeshes:[p.core],authority:{
      isWeakPointOpen:()=>this.controller.readModel.weakPointOpen,copyWeakPointSplashPosition:out=>out.copy(p.coreWorld),
      applyWeakPointImpact:impact=>{const result=this.controller.applyImpact(impact);p.burst(this.closest.copy(impact.point),result.accepted?12:5);if(result.accepted&&(impact.fullyCharged||impact.overcharged))p.reactToChargedHit(this.closest);return result;},
    }});
    world.register(p.core,CollisionLayer.Projectile,ColliderTransformMode.Dynamic);this.unregister.push(()=>world.unregister(p.core),targets.register(weakPoint));
    world.register(p.armour,CollisionLayer.Projectile,ColliderTransformMode.Dynamic);
    this.unregister.push(()=>world.unregister(p.armour),targets.register({id:'extermination-armour',hitMeshes:[p.armour],isCombatActive:()=>true,copySplashWorldPosition:out=>out.copy(p.machine.position),
      applyImpact:impact=>{this.controller.deflect();p.burst(this.closest.copy(impact.point),5);return {accepted:false,destroyed:false,rejectionReason:'armour'};}}));
    world.register(p.shield,CollisionLayer.Projectile|CollisionLayer.LineOfSight,ColliderTransformMode.Dynamic);
    this.unregister.push(()=>world.unregister(p.shield),targets.register({id:'extermination-shield',hitMeshes:[p.shield],isCombatActive:()=>this.controller.readModel.shieldActive,copySplashWorldPosition:out=>out.copy(p.machine.position),
      applyImpact:impact=>{this.controller.deflect();p.burst(this.closest.copy(impact.point),5);return {accepted:false,destroyed:false,rejectionReason:'invulnerable'};}}));
    this.projectiles=new ExterminatorProjectiles({world,targets,weapon,onPlayerHit:(damage,id)=>this.hitPlayer(damage,id)});arena.root.add(this.projectiles.root);
    this.healthPacks=new BossHealthPacks(world);arena.root.add(this.healthPacks.root);
    this.reinforcements=new ExterminatorReinforcements({world,targets,
      onDestroyed:(at,attacker)=>{p.burst(at,20);this.debris.burst(at,T.advancedScale*T.minionScale);if(attacker)this.healthPacks.drop(at);options.audio?.play('world-drone-dissolve-01',at,true,.75);},
      onShot:at=>options.audio?.play('specimen-turret-shot',at,true,.3)});arena.root.add(this.reinforcements.root);
    this.unregister.push(this.projectiles.events.on('impact',e=>{p.burst(e.position,e.kind==='orb'?22:e.intercepted?9:4);if(e.kind==='orb')options.audio?.play('world-drone-dissolve-01',e.position,true,.65);}));
    this.squad=new SentinelDroneSquad({collisionWorld:world,targetRegistry:targets,anchors:Array.from({length:T.droneCount},()=>new THREE.Vector3(0,20,FINAL_ARENA.centreZ)),maximumDrones:T.droneCount,
      droneHealthUnits:T.droneHealth,fireIntervalSeconds:T.phaseOneDroneFireSeconds,fireStaggerSeconds:.04,deploymentDelaySeconds:1.6,projectileSpeedMetresPerSecond:T.droneProjectileSpeed,projectileLifetimeSeconds:6,projectileRangeMetres:180,
      projectileCapacity:T.hostileProjectileCapacity,projectileCollisionMask:CollisionLayer.Movement,idPrefix:'extermination-minion',colliderSize:new THREE.Vector3(1.8,1,1.7).multiplyScalar(T.minionScale),blocksLineOfSight:false});
    arena.root.add(this.squad.root);
    this.squad.root.children.forEach((root,index)=>{
      ((root.children[0] as THREE.Mesh).material as THREE.Material).visible=false;
      const drone=new ExterminatorMinionPresentation();
      drone.root.name=`extermination-minion-${index}-flying-model`;root.add(drone.root);this.drones.push(drone);
    });
    this.unregister.push(this.squad.events.on('destroyed',e=>{const at=this.squad.root.children[e.slotIndex]!.position;p.burst(at,16);this.debris.burst(at,T.minionScale);if(!this.droneFlight.isGuardian(e.slotIndex))this.healthPacks.drop(at);this.controller.droneDestroyed();options.audio?.play('world-drone-dissolve-01',at,true,.75);}));
    this.unregister.push(this.squad.events.on('projectileFired',e=>{const i=Number(e.droneId.split('-').at(-1))-1;this.drones[i]!.fire();options.audio?.play('specimen-turret-shot',this.squad.root.children[i]!.position,true,.3);}));
    this.hostileShots=new THREE.InstancedMesh(this.shotGeometry,this.shotMaterial,this.squad.poolCapacity);this.hostileShots.frustumCulled=false;this.hostileShots.count=0;arena.root.add(this.hostileShots);
    this.hud=new FinalBossHud(options.host.ownerDocument??document,{
      host:options.host,
      onSkip:()=>{this.skipRequested=true;},
      onToggleInvincibility:import.meta.env?.DEV?()=>{this.controller.toggleDevInvincibility();this.sync();}:undefined,
    });
    this.element=this.hud.element;
    options.host.append(this.element);this.reset();
  }
  get cinematic():boolean {return this.controller.cinematic;}
  get modelDiagnostics(){return this.modelAsset?.diagnostics??{ready:false,geometries:0,materials:0,textures:0};}
  setReflectionEnvironment(texture:THREE.Texture|null):void {this.reflectionEnvironment=texture;this.modelAsset?.setEnvironment(texture);}
  prepare():Promise<void> {
    if(this.disposed)return Promise.resolve();
    return this.modelPreparation??=loadExterminatorModelAsset(this.modelAbort.signal).then(asset=>{
      if(this.disposed){asset.dispose();return;}
      try {
        asset.setEnvironment(this.reflectionEnvironment);this.presentation.adoptDroneModel(asset.cloneBoss());
        for(const drone of this.drones)drone.adopt(asset);this.reinforcements.adoptModels(asset);this.modelAsset=asset;
      }catch(error){asset.dispose();throw error;}
    });
  }
  presentMerge(progress:number):void {this.hud.presentMerge(progress);this.options.host.dataset.bossEncounter='true';}
  start(shortIntro=false):boolean {if(!this.controller.start(shortIntro))return false;this.activateEncounter();return true;}
  startPhaseTwo():boolean {if(!this.controller.startPhaseTwo(this.options.body.position))return false;this.activateEncounter();return true;}
  private activateEncounter():void {this.options.arena.setPowered(true);this.options.arena.setDoors(true);this.options.audio?.startLoop('final-boss-engine','world-machinery-loop-01',this.presentation.machine.position);this.sync();}
  update(dt:number,skip=false):void {
    if(this.disposed)return;if(skip||this.skipRequested){this.controller.skipCinematic(this.options.body.position);this.skipRequested=false;}
    this.debris.update(dt);
    this.shake*=Math.exp(-dt*5);
    this.previousNose.copy(this.presentation.eyeMuzzle);
    if(this.controller.combatActive&&this.controller.readModel.attack==='ram')this.presentation.ramHull.capturePreviousPose();
    this.controller.update(dt,this.options.body.position);const m=this.controller.readModel;
    if(m.state!==this.oldState) {
      if(this.cinematic||m.state==='suspended'){this.clearAttacks();this.options.weapon.reset();}
      this.shake=m.state==='transition'?.08:m.state==='defeated'?.18:0;
      if(m.state==='transition'){this.debris.burst(this.presentation.machine.position,8);this.options.audio?.play('world-activation-01',this.presentation.machine.position,false,1);}
      if(m.state==='defeated'){this.healthPacks.reset();this.options.audio?.play('world-drone-dissolve-01',this.presentation.machine.position,false,1);this.options.body.recoverAt(FINAL_MERGE_ANCHOR);}
      if(m.state==='escape'||m.state==='complete')this.options.audio?.stopLoop('final-boss-engine');this.oldState=m.state;
    }
    if(m.attackSerial!==this.weaponSerial){this.weaponSerial=m.attackSerial;this.fired=0;if(m.attack==='summon-defend'){this.projectiles.clear();this.squad.clear();}}
    // RAM is a committed punish window: neither its windup, charge nor recovery
    // may start or carry a barrel roll away from a full-charge countershot.
    this.evasion.update(dt,this.controller.combatActive&&m.phase===2&&m.weakPointOpen&&m.attack!=='ram',this.presentation.coreWorld,this.options.weapon.projectileStates);
    this.presentation.evasionOffset.copy(this.evasion.offset);this.presentation.evasionRoll=this.evasion.roll;
    this.sync();
    if(m.state==='defeated'&&m.progress>.55&&!this.explosionPlayed){this.explosionPlayed=true;this.presentation.burst(this.presentation.coreWorld,32);this.debris.burst(this.presentation.coreWorld,14);this.shake=.2;}
    if(!this.controller.combatActive)return;
    const stageKey=`${m.attackSerial}:${m.stage}`;if(stageKey!==this.oldStage){this.options.audio?.play(m.stage==='telegraph'?'world-activation-01':'world-release-01',this.presentation.eyeMuzzle,true,.7);this.oldStage=stageKey;}
    this.updateRam();this.updateWeapons();this.projectiles.update(dt,this.options.body);if(!this.controller.combatActive)return;this.updateDrones(dt);this.updateBeam();
    if(m.phase===2) {
      while(this.reinforcementIndex<m.reinforcementIndex)this.reinforcements.deploy(this.reinforcementIndex++,this.presentation.machine,this.options.body);
      this.reinforcements.update(dt,this.controller.time,this.options.body,(damage,serial)=>this.hitPlayer(damage,serial));
    }
    if(this.controller.combatActive)this.healthPacks.update(dt,this.options.body,()=>{
      const healed=this.controller.healPlayer();if(healed)this.options.audio?.play('world-activation-01',this.options.body.position,true,.5);return healed;
    });
  }
  advancePlatforms(dt:number):void {if(this.controller.combatActive)this.options.arena.advancePlatforms(dt,this.options.body);}
  present(alpha:number):void {
    this.projectiles.present(alpha);
    this.healthPacks.present(alpha);this.reinforcements.present(alpha);
    this.squad.root.children.forEach((root,i)=>{
      if(root.visible)this.drones[i]!.root.position.copy(this.droneFlight.copyPresentationOffset(i,root.position,alpha,this.direction));
    });
  }
  private sync():void {
    const m=this.controller.readModel,{arena,body}=this.options,p=this.presentation;p.update(m,this.controller.time,body);
    arena.setPowered(m.state!=='idle'&&m.state!=='suspended',m.phase===2||m.state==='transition',this.controller.time);arena.setDoors(m.state!=='idle',m.state==='escape'||m.state==='complete');arena.deployment(m.state==='intro'?m.progress:1);arena.setDamaged(m.phase===2||['defeated','escape','complete'].includes(m.state));
    this.hud.update(m,this.reinforcements.activeCount,this.controller.devInvincible);
    if(m.state!=='idle'&&m.state!=='suspended')this.options.host.dataset.bossEncounter='true';else delete this.options.host.dataset.bossEncounter;
    if(m.state==='escape') {
      const progress=THREE.MathUtils.smoothstep(m.progress,0,.85),angle=-Math.PI/2+Math.min(1,progress/.88)*Math.PI,r=FINAL_ARENA_RING.radius;
      this.closest.set(Math.cos(angle)*r,FINAL_MERGE_ANCHOR.y+.1*Math.abs(Math.sin(progress*50)),FINAL_ARENA.centreZ+Math.sin(angle)*r);
      if(progress>.88)this.closest.z=THREE.MathUtils.lerp(FINAL_ARENA.centreZ+r,finalArenaZ(251),(progress-.88)/.12);body.recoverAt(this.closest);p.specimen.position.copy(body.position);p.faceSpecimen(progress<.88?Math.PI-angle:Math.PI);
    }
  }
  private updateWeapons():void {
    const m=this.controller.readModel,p=this.presentation,{body}=this.options;
    if(m.attack==='summon-defend') {
      if(m.stage==='active'&&this.summonSerial!==m.attackSerial){
        this.summonSerial=m.attackSerial;this.squad.deploy(m.summonCount);
        this.droneFlight.beginWave(T.defenseGroups[m.defenseIndex-1]!,this.squad.root.children,p.machine,body);
        this.squad.root.children.forEach((root,i)=>{
          if(root.visible){this.squad.setDroneHitboxScale(i,this.droneFlight.isGuardian(i)?1:T.pursuerHitboxScale);this.drones[i]!.reset();this.drones[i]!.setGuardian(this.droneFlight.isGuardian(i));}
        });
      }return;
    }
    if(m.stage!=='active')return;
    if(m.attack==='gun-blast')while(this.fired*T.gunVolleySeconds<=m.elapsed+1e-9) {
      p.copyGunMuzzle(0,this.leftMuzzle);p.copyGunMuzzle(1,this.rightMuzzle);
      this.playerPosition.addVectors(this.leftMuzzle,this.rightMuzzle).multiplyScalar(.5);
      this.predictAim(this.predicted,T.gunSpeed,this.playerPosition);
      this.projectiles.fireGunVolley(this.leftMuzzle,this.rightMuzzle,this.predicted,this.fired++);p.kickGuns();this.options.audio?.play('specimen-turret-shot',this.leftMuzzle,true,.55);
    } else if(m.attack==='laser-shots')while(this.fired<m.orbCount*(m.phase===1?T.orbBursts:1)) {
      const burst=Math.floor(this.fired/m.orbCount),index=this.fired%m.orbCount,due=burst*T.orbIntervalSeconds+index*T.orbSpreadIntervalSeconds;
      if(due>m.elapsed+1e-9)break;
      if(index===0){if(m.phase===2)this.volleyAim.copy(m.lockedTarget).add(this.direction.set(0,.75,0));else this.predictAim(this.volleyAim,T.orbSpeed,p.eyeMuzzle);}
      this.projectiles.fireOrb(p.eyeMuzzle,this.volleyAim,(index-(m.orbCount-1)/2)*T.orbSpreadRadians);this.fired++;p.kickEye();this.options.audio?.play('volt-shoot-01',p.eyeMuzzle,true,1);
    }
  }
  private predictAim(out:THREE.Vector3,speed:number,origin:THREE.Vector3):void {
    const {body,arena}=this.options,carrier=arena.platforms.find(p=>body.isSupportedBy(p.collider));out.copy(body.position);out.y+=.75;
    if(carrier)for(let i=0;i<4;i++){const flight=out.distanceTo(origin)/speed;arena.copyPredictedPlatformPosition(carrier.collider,flight,out);out.add(this.direction.subVectors(body.position,carrier.current));out.y+=.75;}
  }
  private updateBeam():void {
    const m=this.controller.readModel,p=this.presentation,{body}=this.options;p.beam.visible=false;p.beamCore.visible=false;p.beamImpact.visible=false;
    if(m.attack!=='laser-beam'||m.stage==='recovery')return;
    this.beamStart.copy(p.eyeMuzzle);p.copyBeamDirection(this.direction);this.beamEnd.copy(this.beamStart).addScaledVector(this.direction,FINAL_ARENA.radius*2.5);this.direction.subVectors(this.beamEnd,this.beamStart);
    const world=this.options.world.sweepSphere(this.beamStart,this.direction,T.beamRadius,this.hit,CollisionLayer.Movement);if(world)this.beamEnd.copy(this.hit.point);
    const active=m.stage==='active';p.showBeam(this.beamStart,this.beamEnd,active?T.beamRadius:.08,!active);if(!active)return;
    if(world){p.beamImpact.visible=true;p.beamImpact.position.copy(this.beamEnd);p.beamImpact.scale.setScalar(T.beamRadius*(1.28+.2*Math.sin(this.controller.time*30)));}
    this.line.set(this.beamStart,this.beamEnd);this.line.closestPointToPoint(this.playerPosition.copy(body.position),true,this.closest);const near=this.closest.distanceToSquared(body.position)<(T.beamRadius+body.radiusMetres)**2;
    this.line.closestPointToPoint(this.playerPosition.copy(body.previousPosition),true,this.closest);if(near||this.closest.distanceToSquared(body.previousPosition)<(T.beamRadius+body.radiusMetres)**2)
      this.hitPlayer(T.beamDamage,m.attackSerial*8+m.beamSegment);
  }
  private updateRam():void {
    const m=this.controller.readModel,p=this.presentation,{body,world,arena}=this.options;
    if(m.attack!=='ram'||m.stage!=='active')return;
    arena.breakCoverAlong(this.previousNose,p.eyeMuzzle,T.ramCoverRadius,at=>{p.burst(at,32);this.shake=.14;this.options.audio?.play('world-release-01',at,true,1);});
    this.ramDisplacement.subVectors(p.eyeMuzzle,this.previousNose);
    if(world.sweepSphere(this.previousNose,this.ramDisplacement,T.ramRadius,this.hit,CollisionLayer.Movement)) {
      p.machine.position.add(this.closest.subVectors(this.hit.point,p.eyeMuzzle));p.refreshWorldAnchors();this.ramDisplacement.subVectors(p.eyeMuzzle,this.previousNose);
      if(Math.abs(this.hit.normal.y)<.65&&this.controller.ramHitWall()) {
        this.closest.copy(this.hit.point).addScaledVector(this.hit.normal,-T.ramRadius);
        p.showRamImpact(this.closest,this.hit.normal);this.shake=1.15;
        this.options.audio?.play('world-drone-dissolve-01',this.closest,true,1);
        this.options.audio?.play('world-release-01',this.closest,true,1);
      }
    }
    if(p.ramHull.intersectsPlayer(body.previousPosition,body.position,body.radiusMetres))
      this.hitPlayer(T.ramDamage,m.attackSerial*8+7);
  }
  private updateDrones(dt:number):void {
    const {body}=this.options,t=this.controller.time,p=this.presentation,m=this.controller.readModel,base=m.phase===1?T.phaseOneDroneFireSeconds:T.phaseTwoDroneFireSeconds;
    this.droneFlight.update(dt,t,this.squad.root.children,body,p.machine.position);
    this.squad.root.children.forEach((root,i)=>{
      if(!root.visible)return;this.squad.setDroneFireIntervalSeconds(i,base/(this.droneFlight.isGuardian(i)?T.guardianAttackSpeed:1));
      this.squad.setDroneProjectileSpeedMetresPerSecond(i,this.droneFlight.isGuardian(i)?T.guardianProjectileSpeed:T.droneProjectileSpeed);
      this.drones[i]!.setAimDirection(this.droneFlight.copyAimDirection(i,this.direction));
      this.drones[i]!.setVelocity(this.droneFlight.copyVelocity(i,this.direction));this.drones[i]!.update(dt,t);
    });
    this.squad.update(dt,body,()=>this.hitPlayer(8,this.shotDamageSerial--));let count=0;
    for(const s of this.squad.projectileStates){if(!s.active)continue;this.dummy.position.copy(s.position);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.hostileShots.setMatrixAt(count++,this.dummy.matrix);}this.hostileShots.count=count;if(count)this.hostileShots.instanceMatrix.needsUpdate=true;
  }
  private hitPlayer(amount:number,serial?:number):boolean {
    // Dash protection ends with the actual burst. A dodged hit must not consume
    // damage grace or an attack serial that could hit after the burst ends.
    if(this.options.isPlayerInvulnerable?.()) {
      if(this.controller.canDamagePlayer(amount,serial))this.options.onPlayerDodged?.();
      return false;
    }
    if(!this.controller.damagePlayer(amount,serial))return false;
    this.options.onPlayerDamaged?.(amount);this.options.audio?.play('bob-contact-01',this.options.body.position,true,.8);
    if(this.controller.readModel.playerHealth===0)this.options.requestFailure();return true;
  }
  presentCamera(camera:THREE.PerspectiveCamera):void {
    const m=this.controller.readModel;
    const active=m.state!=='idle'&&m.state!=='suspended'&&m.state!=='complete';
    if(active){this.savedFar??=camera.far;if(camera.far!==FINAL_ARENA.cameraFar){camera.far=FINAL_ARENA.cameraFar;camera.updateProjectionMatrix();}}
    if(!this.cinematic) {
      if(this.savedFov!==undefined){camera.fov=this.savedFov;this.savedFov=undefined;camera.updateProjectionMatrix();}
      if(active&&this.shake>0){this.shakeCamera(camera);camera.updateMatrixWorld(true);}
      if(!active)this.restoreCamera(camera);return;
    }
    this.savedFov??=camera.fov;
    const p=m.progress,z=FINAL_ARENA.centreZ,s=FINAL_ARENA_SCALE;
    if(m.state==='intro') {
      if(p<.35) {camera.position.set((-16+p*10)*s,44,z-FINAL_ARENA.radius*.65);this.closest.copy(this.presentation.coreWorld);}
      else if(p<.7) {camera.position.set(30,33,z-44+(p-.35)*12);this.closest.copy(this.presentation.coreWorld);}
      else {camera.position.set(-5*s,finalArenaY(5),finalArenaZ(192));this.closest.set(0,T.hoverY,z);}
    } else if(m.state==='transition') {
      camera.position.set((14-p*4)*s,finalArenaY(7+p*2),z-40);this.closest.copy(this.presentation.coreWorld);
    } else if(m.state==='defeated') {
      if(p>.25&&p<.55) {
        camera.position.copy(this.options.body.position).add(this.direction.set(-6,3,-5));this.closest.copy(this.presentation.coreWorld);
      } else {camera.position.set((-9+p*3)*s,finalArenaY(9),z-34);this.closest.set(0,Math.max(5,T.hoverY-p*18),z+6);}
    } else {
      const angle=-Math.PI/2+Math.min(1,THREE.MathUtils.smoothstep(p,0,.85)/.88)*Math.PI;
      camera.position.copy(this.options.body.position).add(this.direction.set(-Math.cos(angle)*7+Math.sin(angle)*9,9,-Math.sin(angle)*7-Math.cos(angle)*9));
      this.closest.copy(this.options.body.position).add(this.direction.set(0,1,0));
    }
    camera.fov=m.state==='escape'?58:52;camera.lookAt(this.closest);
    if(this.shake>0)this.shakeCamera(camera);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  restoreCamera(camera:THREE.PerspectiveCamera):void {
    if(this.savedFov!==undefined){camera.fov=this.savedFov;this.savedFov=undefined;}
    if(this.savedFar!==undefined){camera.far=this.savedFar;this.savedFar=undefined;}
    camera.updateProjectionMatrix();
  }
  private shakeCamera(camera:THREE.PerspectiveCamera):void {
    const t=this.controller.time;camera.position.x+=Math.sin(t*83)*this.shake;camera.position.y+=Math.sin(t*67+.8)*this.shake*.65;camera.position.z+=Math.sin(t*97+1.7)*this.shake*.45;
  }
  clearAttacks():void {this.squad.clear();this.droneFlight.reset();this.projectiles.clear();this.reinforcements.reset();this.evasion.reset();this.shake=0;this.hostileShots.count=0;this.presentation.clearRamImpact();this.presentation.beam.visible=false;this.presentation.beamCore.visible=false;this.presentation.beamImpact.visible=false;this.presentation.shield.visible=false;this.presentation.eyeCharge.visible=false;this.presentation.clearAttackWarnings();for(let i=0;i<6;i++)this.options.arena.setSector(i,'inactive');this.oldStage='';this.options.audio?.stopLoop('final-boss-beam');}
  suspend():void {this.controller.suspend();this.clearAttacks();this.healthPacks.reset();this.options.audio?.stopLoop('final-boss-engine');this.hud.hide();}
  reset():void {this.clearAttacks();this.debris.reset();for(const d of this.drones)d.reset();this.healthPacks.reset();this.controller.reset();this.presentation.reset();this.options.arena.reset();this.hud.hide();this.summonSerial=-1;this.weaponSerial=-1;this.reinforcementIndex=0;this.fired=0;this.oldState='idle';this.skipRequested=false;this.explosionPlayed=false;this.options.audio?.stopLoop('final-boss-engine');delete this.options.host.dataset.bossEncounter;}
  dispose():void {if(this.disposed)return;this.reset();this.disposed=true;this.modelAbort.abort();for(const off of this.unregister)off();for(const drone of this.drones)drone.dispose();this.squad.dispose();this.reinforcements.dispose();this.healthPacks.dispose();this.projectiles.dispose();this.hostileShots.removeFromParent();this.hostileShots.dispose();this.shotGeometry.dispose();this.shotMaterial.dispose();this.presentation.dispose();this.debris.dispose();this.modelAsset?.dispose();this.controller.dispose();this.hud.dispose();}
}
