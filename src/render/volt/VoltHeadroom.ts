import * as THREE from 'three';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../../physics/CollisionWorld.ts';
import type { VoltWeights } from './VoltAsset.ts';

const START_Y = 0.22;
const END_Y = 0.42;
const MAXIMUM_COMPRESSION = 0.85;
const CEILING_MARGIN_METRES = 0.025;
const FOOTPRINT_RADIUS_METRES = 0.7;

// Integral of smoothstep: a C1 bend above the complete eye seats, with a
// derivative bounded by one. Even the maximum pose keeps positive thickness.
function upperHeight(y: number): number {
  if (y <= START_Y) return 0;
  if (y >= END_Y) return y - (START_Y + END_Y) / 2;
  const t = (y - START_Y) / (END_Y - START_Y);
  return (END_Y - START_Y) * (t * t * t - 0.5 * t * t * t * t);
}

/** Visual-only upper-gel compression against the existing movement geometry.
 * A generated relative morph is shared by visible/depth/distance passes and
 * CPU mesh bounds; approved source vertices and the gameplay body stay intact. */
export class VoltHeadroom {
  private world: CollisionWorld | undefined;
  private mesh: THREE.Mesh | undefined;
  private index = 0;
  private maximumY = 0;
  private maximumReduction = 0;
  private leftFlexRise = 0;
  private rightFlexRise = 0;
  private weight = 0;
  private ceilingY = Infinity;
  private readonly origin = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly hit = new CollisionHit();

  get diagnostics() { return { compression: this.weight, ceilingYWorld: this.ceilingY }; }

  setCollisionWorld(world: CollisionWorld | undefined): void { this.world = world; }

  prepare(mesh: THREE.Mesh): void {
    this.releaseAsset();
    this.mesh = mesh;
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    const offsets = new Float32Array(positions.count * 3), normalOffsets = new Float32Array(positions.count * 3);
    const normal = new THREE.Vector3();
    const left = mesh.geometry.morphAttributes.position![mesh.morphTargetDictionary!.CrestFlexLeft]!;
    const right = mesh.geometry.morphAttributes.position![mesh.morphTargetDictionary!.CrestFlexRight]!;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      offsets[i * 3 + 1] = -MAXIMUM_COMPRESSION * upperHeight(y);
      const height = 1 - MAXIMUM_COMPRESSION * THREE.MathUtils.smoothstep(y, START_Y, END_Y);
      normal.set(normals.getX(i), normals.getY(i) / height, normals.getZ(i)).normalize();
      normalOffsets[i * 3] = normal.x - normals.getX(i);
      normalOffsets[i * 3 + 1] = normal.y - normals.getY(i);
      normalOffsets[i * 3 + 2] = normal.z - normals.getZ(i);
      this.maximumY = Math.max(this.maximumY, y);
      this.leftFlexRise = Math.max(this.leftFlexRise, left.getY(i));
      this.rightFlexRise = Math.max(this.rightFlexRise, right.getY(i));
    }
    this.maximumReduction = MAXIMUM_COMPRESSION * upperHeight(this.maximumY);
    const positionTarget = new THREE.Float32BufferAttribute(offsets, 3), normalTarget = new THREE.Float32BufferAttribute(normalOffsets, 3);
    positionTarget.name = normalTarget.name = 'Headroom';
    this.index = mesh.geometry.morphAttributes.position!.length;
    mesh.geometry.morphAttributes.position!.push(positionTarget); mesh.geometry.morphAttributes.normal!.push(normalTarget);
    mesh.morphTargetDictionary!.Headroom = this.index; mesh.morphTargetInfluences![this.index] = 0;
  }

  update(dt: number): void {
    this.weight *= Math.exp(-12 * dt);
    if (this.weight < 1e-5) this.weight = 0;
  }

  present(position: THREE.Vector3, shape: THREE.Matrix4, weights: VoltWeights): void {
    if (!this.mesh) return;
    this.ceilingY = Infinity;
    if (this.world) this.world.withStableQueryTransforms(() => {
      // Sample the silhouette's footprint, including a crest leaning into a
      // doorway. Rays leave movement/camera sphere-sweep diagnostics untouched.
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
        this.origin.copy(position); this.origin.x += x * FOOTPRINT_RADIUS_METRES; this.origin.z += z * FOOTPRINT_RADIUS_METRES;
        if (this.world!.raycast(this.origin, this.up, 3, this.hit, CollisionLayer.Movement) && this.hit.normal.y < -0.2) {
          this.ceilingY = Math.min(this.ceilingY, this.hit.point.y);
        }
      }
    });
    const height = shape.elements[5], offsetY = shape.elements[13];
    const authoredHeight = 1 - 0.1 * weights.Squash + 0.09 * weights.Stretch;
    const maximumPosedY = (this.maximumY + 0.45) * authoredHeight - 0.45 +
      this.leftFlexRise * weights.CrestFlexLeft + this.rightFlexRise * weights.CrestFlexRight;
    const allowedY = (this.ceilingY - CEILING_MARGIN_METRES - position.y - offsetY) / height;
    const required = THREE.MathUtils.clamp((maximumPosedY - allowedY) / this.maximumReduction, 0, 1);
    // Clamp inward immediately so interpolation cannot penetrate. Recovery
    // advances only on fixed steps; rendering never advances the motion clock.
    this.weight = Math.max(this.weight, required);
    this.mesh.morphTargetInfluences![this.index] = this.weight;
  }

  reset(): void {
    this.weight = 0; this.ceilingY = Infinity;
    if (this.mesh) this.mesh.morphTargetInfluences![this.index] = 0;
  }

  releaseAsset(): void {
    this.reset(); this.mesh = undefined;
    this.maximumY = this.maximumReduction = this.leftFlexRise = this.rightFlexRise = 0;
  }

  dispose(): void { this.releaseAsset(); this.world = undefined; }
}
