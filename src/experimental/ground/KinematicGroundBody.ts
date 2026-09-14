import * as THREE from 'three';
import { KinematicBody } from '../../physics/KinematicBody.ts';
import { CollisionWorld } from '../../physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../../physics/SurfaceRegistry.ts';
import { GROUND_STEP, type GroundBody, type GroundInput, type GroundMetrics, type Vec3 } from './GroundBody.ts';

/** Actual baseline controller, with only a floor and no jump input. */
export class KinematicGroundBody implements GroundBody {
  readonly kind = 'kinematic' as const;
  readonly body: KinematicBody;
  private readonly floor = new THREE.Mesh(new THREE.BoxGeometry(2000000, 1, 2000000));
  private readonly direction = new THREE.Vector3();
  private tick = 0;

  constructor() {
    const world = new CollisionWorld();
    const surfaces = new SurfaceRegistry();
    this.floor.position.y = -.5;
    this.floor.name = 'ground-lab-floor';
    this.floor.updateWorldMatrix(true, false);
    // One enormous floor: bypass spatial indexing for this isolated comparator.
    world.register(this.floor, undefined, 'dynamic');
    surfaces.register(this.floor);
    this.body = new KinematicBody({ world, surfaces, initialPosition: { x: 0, y: .51, z: 0 } });
  }
  reset(position: Vec3 = [0,.51,0]): void {
    this.tick=0;
    this.direction.set(0,0,0);
    this.body.teleport({ x: position[0], y: position[1], z: position[2] });
  }
  step(input: GroundInput): void {
    this.tick++;
    this.direction.set(input.x,0,input.z).clampLength(0,1);
    this.body.update(GROUND_STEP,this.direction);
  }
  metrics(): GroundMetrics {
    const p=this.body.position, v=this.body.velocity;
    return {
      centre: [p.x,p.y,p.z], velocity: [v.x,v.y,v.z], contacts: this.body.grounded ? 1 : 0,
      acquired: 0, released: 0, volumeRatio: 1, maxStrain: 0, penetration: 0,
      height: this.body.radiusMetres*2,
    };
  }
  snapshot(): unknown {
    return { tick: this.tick, metrics: this.metrics(), previous: {...this.body.previousPosition},
      grounded: this.body.grounded, contacts: this.body.contactsThisStep };
  }
  dispose(): void { this.floor.geometry.dispose(); (this.floor.material as THREE.Material).dispose(); }
}
