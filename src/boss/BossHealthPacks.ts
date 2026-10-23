import * as THREE from 'three';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_BOSS_TUNING as T } from './FinalBossConfig.ts';
import { createBossHealthPackModel } from './BossHealthPackModel.ts';

interface Pack {active:boolean;position:THREE.Vector3;previous:THREE.Vector3;velocity:number;age:number;settled:boolean;}

/** Bounded, world-space medical drops. They remain available at full health. */
export class BossHealthPacks {
  readonly root=new THREE.Group();
  readonly packs:readonly Pack[];
  private readonly slots:Pack[]=Array.from({length:T.healthPackCapacity},()=>({active:false,position:new THREE.Vector3(),previous:new THREE.Vector3(),velocity:0,age:0,settled:false}));
  private readonly meshes:THREE.InstancedMesh[]=[];
  private beaconMesh:THREE.InstancedMesh|undefined;
  private readonly geometries:THREE.BufferGeometry[]=[];
  private readonly materials:THREE.Material[]=[];
  private readonly dummy=new THREE.Object3D();
  private readonly point=new THREE.Vector3();
  private readonly displacement=new THREE.Vector3();
  private readonly hit=new CollisionHit();
  private readonly world:CollisionWorld;
  private disposed=false;
  constructor(world:CollisionWorld) {
    this.world=world;this.packs=this.slots;this.root.name='boss-medical-drops';
    for(const {name,geometry,material,beacon} of createBossHealthPackModel()) {
      this.geometries.push(geometry);this.materials.push(material);
      const mesh=new THREE.InstancedMesh(geometry,material,T.healthPackCapacity);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.meshes.push(mesh);this.root.add(mesh);if(beacon)this.beaconMesh=mesh;
    }
  }
  get activeCount():number {return this.slots.filter(s=>s.active).length;}
  drop(at:THREE.Vector3Like):boolean {
    if(this.disposed)return false;const slot=this.slots.find(s=>!s.active);if(!slot)return false;
    // A pursuer killed over the inner edge must still leave a usable reward.
    const dz=at.z-FINAL_ARENA.centreZ,r=Math.hypot(at.x,dz),safe=THREE.MathUtils.clamp(r,FINAL_ARENA_RING.innerRadius+3,FINAL_ARENA_RING.outerRadius-2);
    slot.position.set(r>.001?at.x*safe/r:0,Math.max(FINAL_ARENA.floorY+.8,at.y),FINAL_ARENA.centreZ+(r>.001?dz*safe/r:-safe));
    slot.previous.copy(slot.position);slot.velocity=1;slot.age=0;slot.settled=false;slot.active=true;return true;
  }
  update(dt:number,body:KinematicBody,heal:()=>boolean):void {
    for(const s of this.slots) {
      if(!s.active)continue;s.previous.copy(s.position);s.age+=dt;
      if(!s.settled) {
        s.velocity-=18*dt;this.displacement.set(0,s.velocity*dt,0);
        if(this.world.sweepSphere(s.position,this.displacement,.5,this.hit,CollisionLayer.Movement)) {
          s.position.copy(this.hit.point);s.velocity=0;s.settled=true;
        } else s.position.add(this.displacement);
      }
      if(s.position.distanceToSquared(body.position)<(body.radiusMetres+1.3)**2&&heal())s.active=false;
    }this.present(1);
  }
  present(alpha:number):void {
    let count=0;
    for(const s of this.slots) {
      if(!s.active)continue;this.point.lerpVectors(s.previous,s.position,THREE.MathUtils.clamp(alpha,0,1));
      for(let i=0;i<this.meshes.length;i++) {
        this.dummy.position.copy(this.point);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(1);
        if(this.meshes[i]===this.beaconMesh)this.dummy.scale.setScalar(1+.035*Math.sin(s.age*4));
        this.dummy.updateMatrix();this.meshes[i]!.setMatrixAt(count,this.dummy.matrix);
      }count++;
    }for(const mesh of this.meshes){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
  }
  reset():void {for(const s of this.slots)s.active=false;this.present(1);}
  dispose():void {if(this.disposed)return;this.reset();this.disposed=true;for(const m of this.meshes)m.dispose();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();this.root.removeFromParent();this.root.clear();}
}
