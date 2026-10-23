import * as THREE from 'three';
import type { CombatTargetRegistry } from '../combat/CombatTargetRegistry.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import { CollisionLayer } from '../physics/CollisionWorld.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { ExterminatorMinionPresentation } from './ExterminatorMinionPresentation.ts';
import type { ExterminatorModelAsset } from './ExterminatorModelAsset.ts';
import { SentinelDroneSquad } from './attacks/SentinelDroneAttack.ts';
import { ExterminatorDroneFlight } from './ExterminatorDroneFlight.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING as T } from './FinalBossConfig.ts';

interface Wing {readonly squad:SentinelDroneSquad;readonly flight:ExterminatorDroneFlight;readonly visuals:ExterminatorMinionPresentation[];deployed:boolean;}

/** Three preallocated independent wings: new thresholds never erase survivors. */
export class ExterminatorReinforcements {
  readonly root=new THREE.Group();
  readonly wings:readonly Wing[];
  private readonly slots:Wing[]=[];
  private readonly off:Array<()=>void>=[];
  private readonly shots:THREE.InstancedMesh;
  private readonly geometry=new THREE.SphereGeometry(.24,7,5);
  private readonly material=new THREE.MeshBasicMaterial({color:0xffb254});
  private readonly dummy=new THREE.Object3D();
  private readonly direction=new THREE.Vector3();
  private readonly anchor=new THREE.Vector3(0,T.hoverY,FINAL_ARENA.centreZ);
  private damageSerial=-2000000;
  private disposed=false;
  constructor(options:{world:CollisionWorld;targets:CombatTargetRegistry;onDestroyed:(position:THREE.Vector3,attacker:boolean)=>void;onShot:(position:THREE.Vector3)=>void}) {
    this.root.name='advanced-drone-reinforcements';this.wings=this.slots;
    for(let wave=0;wave<T.reinforcementHealth.length;wave++) {
      const size=new THREE.Vector3(1.8,1,1.7).multiplyScalar(T.advancedScale*T.minionScale),count=T.advancedGroups.reduce((a,b)=>a+b,0)+T.advancedPursuers;
      const squad=new SentinelDroneSquad({collisionWorld:options.world,targetRegistry:options.targets,anchors:Array.from({length:count},()=>new THREE.Vector3()),maximumDrones:count,
        droneHealthUnits:T.droneHealth,colliderSize:size,fireIntervalSeconds:T.phaseOneDroneFireSeconds/T.advancedAttackSpeed,fireStaggerSeconds:.04,deploymentDelaySeconds:1.2,
        projectileSpeedMetresPerSecond:T.droneProjectileSpeed,projectileLifetimeSeconds:6,projectileRangeMetres:180,projectileCapacity:T.advancedProjectileCapacity,
        projectileCollisionMask:CollisionLayer.Movement,idPrefix:`advanced-wing-${wave+1}`,blocksLineOfSight:false});
      const flight=new ExterminatorDroneFlight(options.world,{capacity:count,pursuers:T.advancedPursuers,collisionRadius:1.5*T.minionScale,bearingOffset:wave*Math.PI*2/3});
      const wing:Wing={squad,flight,visuals:[],deployed:false};this.slots.push(wing);this.root.add(squad.root);
      squad.root.children.forEach((root,index)=>{
        ((root.children[0] as THREE.Mesh).material as THREE.Material).visible=false;
        const visual=new ExterminatorMinionPresentation(true);
        visual.root.name=`advanced-drone-${wave}-${index}`;wing.visuals.push(visual);root.add(visual.root);
      });
      this.off.push(squad.events.on('destroyed',e=>options.onDestroyed(squad.root.children[e.slotIndex]!.position,!flight.isGuardian(e.slotIndex))),
        squad.events.on('projectileFired',e=>{const i=Number(e.droneId.split('-').at(-1))-1;wing.visuals[i]!.fire();options.onShot(squad.root.children[i]!.position);}));
    }
    this.shots=new THREE.InstancedMesh(this.geometry,this.material,T.advancedProjectileCapacity*this.slots.length);this.shots.frustumCulled=false;this.shots.count=0;this.root.add(this.shots);
  }
  get activeCount():number {return this.slots.reduce((n,w)=>n+w.squad.activeCount,0);}
  adoptModels(asset:ExterminatorModelAsset):void {for(const w of this.slots)for(const v of w.visuals)v.adopt(asset);}
  get liveProjectileCount():number {return this.slots.reduce((n,w)=>n+w.squad.liveProjectileCount,0);}
  deploy(index:number,machine:THREE.Object3D,body:KinematicBody):boolean {
    const w=this.slots[index];if(!w||w.deployed||this.disposed)return false;
    w.deployed=true;w.squad.deploy(8);w.flight.beginWave(T.advancedGroups,w.squad.root.children,machine,body);
    w.squad.root.children.forEach((_,i)=>{w.squad.setDroneHitboxScale(i,w.flight.isGuardian(i)?1:1.4);w.visuals[i]!.reset();w.visuals[i]!.setGuardian(w.flight.isGuardian(i));});return true;
  }
  update(dt:number,time:number,body:KinematicBody,hit:(damage:number,serial:number)=>boolean):void {
    let count=0;
    for(const wing of this.slots) {
      if(!wing.deployed)continue;wing.flight.update(dt,time,wing.squad.root.children,body,this.anchor);
      wing.squad.root.children.forEach((root,i)=>{
        if(!root.visible)return;
        wing.squad.setDroneFireIntervalSeconds(i,T.phaseOneDroneFireSeconds/(T.advancedAttackSpeed*(wing.flight.isGuardian(i)?T.guardianAttackSpeed:1)));
        wing.squad.setDroneProjectileSpeedMetresPerSecond(i,wing.flight.isGuardian(i)?T.guardianProjectileSpeed:T.droneProjectileSpeed);
        wing.visuals[i]!.setAimDirection(wing.flight.copyAimDirection(i,this.direction));
        wing.visuals[i]!.setVelocity(wing.flight.copyVelocity(i,this.direction));wing.visuals[i]!.update(dt,time);
      });
      wing.squad.update(dt,body,()=>hit(8,this.damageSerial--));
      for(const s of wing.squad.projectileStates)if(s.active){this.dummy.position.copy(s.position);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.shots.setMatrixAt(count++,this.dummy.matrix);}
    }this.shots.count=count;if(count)this.shots.instanceMatrix.needsUpdate=true;
  }
  present(alpha:number):void {
    for(const w of this.slots)if(w.deployed)w.squad.root.children.forEach((root,i)=>{if(root.visible)w.visuals[i]!.root.position.copy(w.flight.copyPresentationOffset(i,root.position,alpha,this.direction));});
  }
  reset():void {for(const w of this.slots){w.squad.clear();w.flight.reset();w.deployed=false;for(const v of w.visuals)v.reset();}this.shots.count=0;this.damageSerial=-2000000;}
  dispose():void {
    if(this.disposed)return;this.reset();this.disposed=true;for(const off of this.off)off();
    for(const w of this.slots){for(const v of w.visuals)v.dispose();w.squad.dispose();}this.shots.dispose();this.geometry.dispose();this.material.dispose();this.root.removeFromParent();this.root.clear();
  }
}
