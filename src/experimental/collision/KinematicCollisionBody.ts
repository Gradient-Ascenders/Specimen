import * as THREE from 'three';
import { KinematicBody } from '../../physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../physics/SurfaceRegistry.ts';
import { GROUND_STEP, type GroundBody, type GroundInput, type GroundMetrics, type Vec3 } from '../ground/GroundBody.ts';
import type { CollisionLabScene } from './CollisionLabScenes.ts';

/** Original controller comparator, using the same finite boxes. */
export class KinematicCollisionBody implements GroundBody {
  readonly kind='kinematic' as const;
  readonly body: KinematicBody;
  private readonly input=new THREE.Vector3();
  constructor(scene: CollisionLabScene) {
    const surfaces=new SurfaceRegistry();surfaces.registerAll(scene.meshes);
    const [x,y,z]=scene.definition.spawn;
    this.body=new KinematicBody({world:scene.world,surfaces,initialPosition:{x,y,z},
      config:{adhesionEnabled:false,reboundEnabled:false,chargedJumpEnabled:false}});
  }
  reset(p: Vec3=[0,.51,0]):void { this.body.teleport({x:p[0],y:p[1],z:p[2]}); }
  step(input: GroundInput):void {this.input.set(input.x,0,input.z).clampLength(0,1);this.body.update(GROUND_STEP,this.input);}
  metrics():GroundMetrics {
    const p=this.body.position,v=this.body.velocity;
    return {centre:[p.x,p.y,p.z],velocity:[v.x,v.y,v.z],contacts:this.body.grounded?1:0,acquired:0,released:0,volumeRatio:1,maxStrain:0,penetration:0,height:.9};
  }
  snapshot():unknown {return {metrics:this.metrics(),previous:{...this.body.previousPosition},grounded:this.body.grounded};}
  dispose():void { /* Scene owns all geometry. */ }
}
