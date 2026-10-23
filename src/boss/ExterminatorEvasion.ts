import * as THREE from 'three';
import type { SpecimenProjectileReadState } from '../combat/SpecimenProjectileSystem.ts';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING as T, FINAL_SPECIMEN_WEAPON } from './FinalBossConfig.ts';

/** Predict an incoming full-charge core hit, then physically barrel-roll clear. */
export class ExterminatorEvasion {
  readonly offset=new THREE.Vector3();
  roll=0;
  private elapsed:number=T.dodgeDuration;
  private lastProjectile=-1;
  private side=1;
  private readonly escape=new THREE.Vector3();
  private readonly difference=new THREE.Vector3();
  private readonly point=new THREE.Vector3();
  private readonly origin=new THREE.Vector3();
  private readonly hit=new CollisionHit();
  private readonly options:{world:CollisionWorld;eye:THREE.Mesh;machine:THREE.Object3D};
  constructor(options:ExterminatorEvasion['options']) {this.options=options;}
  get active():boolean {return this.elapsed<T.dodgeDuration;}
  update(dt:number,enabled:boolean,core:THREE.Vector3,shots:readonly SpecimenProjectileReadState[]):void {
    if(!enabled){this.elapsed=T.dodgeDuration;this.offset.set(0,0,0);this.roll=0;return;}
    if(!this.active)for(const shot of shots) {
      if(!shot.active||!shot.fullyCharged||shot.id===this.lastProjectile)continue;
      this.difference.subVectors(core,shot.position);
      const along=this.difference.dot(shot.direction),speed=FINAL_SPECIMEN_WEAPON.projectileSpeedMetresPerSecond!;
      if(along<0||along-6-shot.radiusMetres>speed*T.dodgeLookaheadSeconds)continue;
      // Use the same swept collider/occlusion as a real shot. A distant shot,
      // near miss, or one blocked by cover/armour must not trigger a roll.
      this.point.copy(shot.direction).multiplyScalar(speed*T.dodgeLookaheadSeconds);
      if(!this.options.world.sweepSphere(this.origin.copy(shot.position),this.point,shot.radiusMetres,this.hit,CollisionLayer.Projectile)||this.hit.object!==this.options.eye)continue;
      this.lastProjectile=shot.id;this.elapsed=0;this.side*=-1;
      this.escape.set(shot.direction.z,0,-shot.direction.x);if(this.escape.lengthSq()<.01)this.escape.set(1,0,0);
      this.escape.normalize().multiplyScalar(this.side*T.dodgeDistance);
      // Wide central rolls, but no escape through the cylindrical arena wall
      // when the carrier is recovering from a ram near the outer ring.
      const machine=this.options.machine.position,limit=FINAL_ARENA.radius-24;
      this.point.copy(machine).add(this.escape);const radius=Math.hypot(this.point.x,this.point.z-FINAL_ARENA.centreZ);
      if(radius>limit){this.point.x*=limit/radius;this.point.z=FINAL_ARENA.centreZ+(this.point.z-FINAL_ARENA.centreZ)*limit/radius;this.escape.subVectors(this.point,machine);}
      break;
    }
    this.elapsed=Math.min(T.dodgeDuration,this.elapsed+dt);
    const out=THREE.MathUtils.smoothstep(this.elapsed,0,.24),back=1-THREE.MathUtils.smoothstep(this.elapsed,.75,T.dodgeDuration);
    this.offset.copy(this.escape).multiplyScalar(out*back);
    // Complete exactly one roll while clearing the shot. Hold the hull upright
    // through the remaining hold/return instead of finishing the spin afterwards.
    const spin=this.elapsed/T.dodgeRollSeconds;
    this.roll=spin<1?Math.PI*2*THREE.MathUtils.smoothstep(spin,0,1)*this.side:0;
    if(!this.active){this.offset.set(0,0,0);this.roll=0;}
  }
  reset():void {this.elapsed=T.dodgeDuration;this.lastProjectile=-1;this.side=1;this.offset.set(0,0,0);this.escape.set(0,0,0);this.roll=0;}
}
