import * as THREE from 'three';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../../physics/CollisionWorld.ts';

/** Conservative cone limit: stop the entire beam at the nearest sampled blocker. */
export class BeamOcclusion {
  private readonly originals = new WeakMap<THREE.BufferGeometry, Float32Array>();
  private readonly hit = new CollisionHit();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly ray = new THREE.Vector3();
  /** Clip each cone edge independently, preserving the visible span of clear edges. */
  clipGeometry(world: CollisionWorld, origin: THREE.Vector3, rotation: THREE.Quaternion,
    geometry: THREE.BufferGeometry, ignored: THREE.Mesh): void {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    let original = this.originals.get(geometry);
    if (!original) {
      original = new Float32Array(positions.array); this.originals.set(geometry, original);
      positions.setUsage(THREE.DynamicDrawUsage);
    }
    for (let i = 0; i < positions.count; i++) {
      const offset = i * 3;
      this.ray.fromArray(original, offset).applyQuaternion(rotation);
      let fraction = 1;
      if (this.ray.lengthSq() > .0001 && world.sweepSphere(origin, this.ray, .01, this.hit, CollisionLayer.LineOfSight, ignored))
        fraction = Math.max(0, this.hit.fraction - .015 / this.ray.length());
      positions.setXYZ(i, original[offset] * fraction, original[offset + 1] * fraction, original[offset + 2] * fraction);
    }
    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
  }
  length(world: CollisionWorld, origin: THREE.Vector3, forward: THREE.Vector3,
    range: number, angle: number, ignored: THREE.Mesh): number {
    this.up.set(Math.abs(forward.y) > .95 ? 1 : 0, Math.abs(forward.y) > .95 ? 0 : 1, 0);
    this.right.crossVectors(forward, this.up).normalize(); this.up.crossVectors(this.right, forward).normalize();
    let length = range;
    for (let sample = 0; sample < 33; sample++) {
      const ring = sample === 0 ? 0 : sample <= 16 ? .5 : 1;
      const theta = (sample - 1) % 16 * Math.PI / 8;
      const radius = Math.tan(angle) * range * ring;
      this.ray.copy(forward).multiplyScalar(range)
        .addScaledVector(this.right, Math.cos(theta) * radius).addScaledVector(this.up, Math.sin(theta) * radius);
      if (world.sweepSphere(origin, this.ray, .015, this.hit, CollisionLayer.LineOfSight, ignored))
        length = Math.min(length, Math.max(0, range * this.hit.fraction - .06));
    }
    return length;
  }
}
