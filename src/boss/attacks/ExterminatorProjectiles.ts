import * as THREE from 'three';
import { EventBus } from '../../core/EventBus.ts';
import type { CombatTargetRegistry } from '../../combat/CombatTargetRegistry.ts';
import type { SpecimenProjectileSystem } from '../../combat/SpecimenProjectileSystem.ts';
import { ColliderTransformMode, CollisionHit, CollisionLayer, type CollisionWorld } from '../../physics/CollisionWorld.ts';
import { sweptSpherePairFraction } from '../../physics/ContinuousCollision.ts';
import type { SentinelSpecimenTarget } from '../SentinelBossTypes.ts';
import { FINAL_BOSS_TUNING as T } from '../FinalBossConfig.ts';

export type ExterminatorShotKind='gun'|'orb';
export interface ExterminatorShot {
  readonly id:number;readonly kind:ExterminatorShotKind;readonly active:boolean;
  readonly position:THREE.Vector3;readonly previousPosition:THREE.Vector3;readonly direction:THREE.Vector3;
  readonly radius:number;
}
interface Slot {
  id:number;kind:ExterminatorShotKind;active:boolean;position:THREE.Vector3;previousPosition:THREE.Vector3;direction:THREE.Vector3;
  radius:number;age:number;collider:THREE.Mesh|undefined;
}
interface ShotEvents {
  fired:{kind:ExterminatorShotKind;id:number;position:THREE.Vector3};
  impact:{kind:ExterminatorShotKind;id:number;position:THREE.Vector3;intercepted:boolean;world:boolean};
}

/** Fixed capacity, real cover sweeps, and continuous player/projectile-pair hits.
 * Straight laser orbs are combat targets; gun rounds cannot be intercepted.
 * No per-frame mesh allocations. */
export class ExterminatorProjectiles {
  readonly root=new THREE.Group();
  readonly events=new EventBus<ShotEvents>();
  readonly shots:readonly ExterminatorShot[];
  private readonly slots:Slot[]=[];
  private readonly options:{world:CollisionWorld;targets:CombatTargetRegistry;weapon:SpecimenProjectileSystem;onPlayerHit:(damage:number,id:number)=>void;onWorldHit?:(object:THREE.Mesh|null,damage:number,at:THREE.Vector3)=>void};
  private readonly unregister:Array<()=>void>=[];
  private readonly proxyGeometry=new THREE.SphereGeometry(T.orbRadius,12,8);
  private readonly proxyMaterial=new THREE.MeshBasicMaterial({visible:false});
  private readonly gunGeometry=new THREE.CapsuleGeometry(.16,1.7,3,6);
  private readonly orbGeometry=new THREE.SphereGeometry(1,18,12);
  private readonly gunMaterial=new THREE.MeshBasicMaterial({color:0xffa65c});
  private readonly orbMaterial=new THREE.MeshBasicMaterial({color:0xff2058,transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending});
  private readonly coreMaterial=new THREE.MeshBasicMaterial({color:0xffe6ef});
  private readonly guns:THREE.InstancedMesh;
  private readonly orbs:THREE.InstancedMesh;
  private readonly cores:THREE.InstancedMesh;
  private readonly displacement=new THREE.Vector3();
  private readonly otherDisplacement=new THREE.Vector3();
  private readonly targetDisplacement=new THREE.Vector3();
  private readonly aim=new THREE.Vector3();
  private readonly point=new THREE.Vector3();
  private readonly up=new THREE.Vector3(0,1,0);
  private readonly hit=new CollisionHit();
  private readonly dummy=new THREE.Object3D();
  private nextId=1;
  private disposed=false;

  constructor(options:ExterminatorProjectiles['options']) {
    this.options=options;this.root.name='exterminator-projectile-pool';
    for(let i=0;i<T.gunCapacity+T.orbCapacity;i++) {
      const gun=i<T.gunCapacity;
      const collider=gun?undefined:new THREE.Mesh(this.proxyGeometry,this.proxyMaterial);
      const slot:Slot={id:0,kind:gun?'gun':'orb',active:false,position:new THREE.Vector3(),previousPosition:new THREE.Vector3(),direction:new THREE.Vector3(),radius:gun?T.gunRadius:T.orbRadius,age:0,collider};
      this.slots.push(slot);
      if(collider) {
        collider.name=`exterminator-counterable-orb-${i-T.gunCapacity}`;collider.layers.set(31);collider.visible=false;this.root.add(collider);
        collider.userData.collisionSphereRadius=T.orbRadius;
        options.world.register(collider,CollisionLayer.Projectile,ColliderTransformMode.Dynamic);
        this.unregister.push(()=>options.world.unregister(collider));
        this.unregister.push(options.targets.register({id:collider.name,hitMeshes:[collider],isCombatActive:()=>slot.active,
          copySplashWorldPosition:out=>out.copy(slot.position),
          applyImpact:impact=>{
            if(!slot.active)return {accepted:false,destroyed:false,rejectionReason:'inactive'};
            if(!Number.isFinite(impact.damageUnits)||impact.damageUnits<=0)return {accepted:false,destroyed:false,rejectionReason:'invulnerable'};
            this.finish(slot,true,false);return {accepted:true,destroyed:true};
          }}));
      }
    }
    this.shots=this.slots;
    this.guns=new THREE.InstancedMesh(this.gunGeometry,this.gunMaterial,T.gunCapacity);
    this.orbs=new THREE.InstancedMesh(this.orbGeometry,this.orbMaterial,T.orbCapacity);
    this.cores=new THREE.InstancedMesh(this.orbGeometry,this.coreMaterial,T.orbCapacity);
    for(const mesh of [this.guns,this.orbs,this.cores]){mesh.frustumCulled=false;mesh.count=0;this.root.add(mesh);}
  }
  get liveCount():number {let n=0;for(const s of this.slots)if(s.active)n++;return n;}
  get capacity():number {return this.slots.length;}
  /** Three simultaneous rounds across the two real cannon muzzles. */
  fireGunVolley(left:THREE.Vector3,right:THREE.Vector3,target:THREE.Vector3,volley:number):number {
    let count=0;
    for(let i=0;i<3;i++) {
      const origin=i===0?left:i===1?right:volley%2?left:right;
      this.aim.subVectors(target,origin).normalize().applyAxisAngle(this.up,(i-1)*.026);
      if(this.spawn('gun',origin,this.aim))count++;
    }return count;
  }
  fireOrb(origin:THREE.Vector3,target:THREE.Vector3,spreadRadians=0):boolean {
    return this.spawn('orb',origin,this.aim.subVectors(target,origin).normalize().applyAxisAngle(this.up,spreadRadians));
  }
  private spawn(kind:ExterminatorShotKind,origin:THREE.Vector3,direction:THREE.Vector3):boolean {
    if(this.disposed||direction.lengthSq()<1e-10)return false;
    const slot=this.slots.find(s=>!s.active&&s.kind===kind);if(!slot)return false;
    slot.id=this.nextId++;slot.active=true;slot.age=0;slot.position.copy(origin);slot.previousPosition.copy(origin);slot.direction.copy(direction).normalize();
    this.syncCollider(slot);this.events.emit('fired',{kind,id:slot.id,position:slot.position});return true;
  }
  update(dt:number,target:SentinelSpecimenTarget):void {
    if(this.disposed)return;if(!Number.isFinite(dt)||dt<=0)throw new Error('Boss projectiles require a positive finite step.');
    this.targetDisplacement.subVectors(target.position,target.previousPosition);
    for(const slot of this.slots) {
      if(!slot.active)continue;
      const speed=slot.kind==='gun'?T.gunSpeed:T.orbSpeed,lifetime=slot.kind==='gun'?2.8:5;
      const step=Math.min(dt,Math.max(0,lifetime-slot.age));if(step<=0){this.deactivate(slot);continue;}
      slot.previousPosition.copy(slot.position);
      this.displacement.copy(slot.direction).multiplyScalar(speed*step);
      const world=this.options.world.sweepSphere(slot.position,this.displacement,slot.radius,this.hit,CollisionLayer.Movement);
      let fraction=world?this.hit.fraction:Infinity,kind:'world'|'player'|'friendly'='world',friendlyId=-1;
      const player=sweptSpherePairFraction(slot.position,this.displacement,slot.radius,target.previousPosition,this.targetDisplacement,target.radiusMetres);
      if(player!==undefined&&player<fraction-1e-9){fraction=player;kind='player';}
      if(slot.kind==='orb')for(const friendly of this.options.weapon.projectileStates) {
        if(!friendly.active)continue;
        this.otherDisplacement.subVectors(friendly.position,friendly.previousPosition);
        const cross=sweptSpherePairFraction(slot.position,this.displacement,slot.radius,friendly.previousPosition,this.otherDisplacement,friendly.radiusMetres);
        if(cross!==undefined&&cross<fraction-1e-9){fraction=cross;kind='friendly';friendlyId=friendly.id;}
      }
      if(fraction!==Infinity) {
        slot.position.addScaledVector(this.displacement,fraction);this.syncCollider(slot);
        if(kind==='friendly')this.options.weapon.interceptProjectile(friendlyId,slot.position);
        const id=slot.id,damage=slot.kind==='gun'?T.gunDamage:T.orbDamage;
        this.finish(slot,kind==='friendly',kind==='world');
        if(kind==='player')this.options.onPlayerHit(damage,-id);
        else if(kind==='world')this.options.onWorldHit?.(this.hit.object,damage,slot.position);
      } else {
        slot.position.add(this.displacement);slot.age+=step;this.syncCollider(slot);
        if(slot.age>=lifetime-1e-9)this.deactivate(slot);
      }
    }
    this.present(1);
  }
  present(alpha:number):void {
    let gun=0,orb=0;
    for(const s of this.slots) {
      if(!s.active)continue;
      this.point.lerpVectors(s.previousPosition,s.position,THREE.MathUtils.clamp(alpha,0,1));
      this.dummy.position.copy(this.point);this.dummy.scale.setScalar(1);this.dummy.quaternion.identity();
      if(s.kind==='gun') {
        this.dummy.position.addScaledVector(s.direction,-.8);this.dummy.quaternion.setFromUnitVectors(this.up,s.direction);this.dummy.updateMatrix();this.guns.setMatrixAt(gun++,this.dummy.matrix);
      } else {
        this.dummy.scale.setScalar(s.radius*(1+.06*Math.sin(s.age*18)));this.dummy.updateMatrix();this.orbs.setMatrixAt(orb,this.dummy.matrix);
        this.dummy.scale.setScalar(s.radius*.48);this.dummy.updateMatrix();this.cores.setMatrixAt(orb++,this.dummy.matrix);
      }
    }
    this.guns.count=gun;this.orbs.count=orb;this.cores.count=orb;
    this.guns.instanceMatrix.needsUpdate=true;this.orbs.instanceMatrix.needsUpdate=true;this.cores.instanceMatrix.needsUpdate=true;
  }
  clear():void {for(const s of this.slots)this.deactivate(s);this.present(1);}
  dispose():void {
    if(this.disposed)return;this.clear();for(const off of this.unregister)off();this.unregister.length=0;
    for(const m of [this.guns,this.orbs,this.cores])m.dispose();
    for(const g of [this.proxyGeometry,this.gunGeometry,this.orbGeometry])g.dispose();
    for(const m of [this.proxyMaterial,this.gunMaterial,this.orbMaterial,this.coreMaterial])m.dispose();
    this.events.clear();this.root.removeFromParent();this.root.clear();this.disposed=true;
  }
  private syncCollider(slot:Slot):void {
    if(!slot.collider)return;slot.collider.position.copy(slot.position);slot.collider.visible=slot.active;slot.collider.updateMatrixWorld(true);
  }
  private finish(slot:Slot,intercepted:boolean,world:boolean):void {
    const kind=slot.kind,id=slot.id;this.deactivate(slot);this.events.emit('impact',{kind,id,position:slot.position,intercepted,world});
  }
  private deactivate(slot:Slot):void {slot.active=false;if(slot.collider)slot.collider.visible=false;}
}
