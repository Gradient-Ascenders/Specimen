import * as THREE from 'three';

const FRAGMENTS = 6;
const SPARKS = 10;
const LIFETIME = .9;

/** Bounded impact debris in room coordinates; never registers gameplay colliders. */
export class DroneBreakupPresentation {
  readonly root = new THREE.Group();
  private readonly bursts: { age: number; x: number; y: number; z: number; landingY: number; lifetime: number }[];
  private readonly fragments: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  private readonly sparks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly positions: Float32Array;
  private readonly transform = new THREE.Object3D();
  private disposed = false;
  private readonly fragmentScale: number;

  constructor(capacity: number, fragmentScale = 1) {
    this.fragmentScale = fragmentScale;
    this.root.name = 'lift-drone-impact-debris';
    this.root.userData.presentationOnly = true;
    this.bursts = Array.from({ length: capacity }, () => ({ age: LIFETIME, x: 0, y: 0, z: 0, landingY: 0, lifetime: LIFETIME }));
    this.fragments = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x8b938c, roughness: .88, metalness: .35 }), capacity * FRAGMENTS);
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.frustumCulled = false;
    this.positions = new Float32Array(capacity * SPARKS * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0xffba65, toneMapped: false, transparent: true, opacity: .85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparks.frustumCulled = false;
    this.root.add(this.fragments, this.sparks);
    this.reset();
  }

  burst(slot: number, x: number, floorY: number, z: number, landingY = floorY): void {
    const burst = this.bursts[slot];
    burst.age = 0; burst.x = x; burst.y = floorY; burst.z = z;
    burst.landingY = landingY;
    burst.lifetime = LIFETIME + Math.sqrt(Math.max(0, floorY - landingY) / 5);
  }

  update(dt: number): void {
    let fragments = 0, sparks = 0;
    for (const [slot, burst] of this.bursts.entries()) {
      if (burst.age >= burst.lifetime) continue;
      burst.age += dt;
      const t = burst.age;
      if (t >= burst.lifetime) continue;
      const shrink = this.fragmentScale * (1 - THREE.MathUtils.smoothstep(t, burst.lifetime - .45, burst.lifetime));
      for (let i = 0; i < FRAGMENTS; i++) {
        const angle = i * 2.39996 + slot * .71;
        const travel = (.12 + t * (.65 + (i % 3) * .25)) * this.fragmentScale;
        this.transform.position.set(burst.x + Math.cos(angle) * travel,
          Math.max(burst.landingY + .065, burst.y + .18 + (1.8 + i * .12) * t - 5 * t * t),
          burst.z + Math.sin(angle) * travel);
        this.transform.rotation.set(t * (4 + i), angle + t * 3, t * (i % 2 ? -5 : 5));
        this.transform.scale.set(.16 * shrink, .075 * shrink, (.12 + (i % 3) * .045) * shrink);
        this.transform.updateMatrix();
        this.fragments.setMatrixAt(fragments++, this.transform.matrix);
      }
      if (t >= .35) continue;
      for (let i = 0; i < SPARKS; i++) {
        const angle = i * 2.39996 + slot;
        const radius = t * (2 + i % 3) * this.fragmentScale;
        const tail = Math.max(0, radius - .16 * (1 - t / .35) * this.fragmentScale);
        const y = burst.y + .2 + (1 + i % 3) * t - 5 * t * t;
        const offset = sparks++ * 6;
        this.positions[offset] = burst.x + Math.cos(angle) * tail;
        this.positions[offset + 1] = y;
        this.positions[offset + 2] = burst.z + Math.sin(angle) * tail;
        this.positions[offset + 3] = burst.x + Math.cos(angle) * radius;
        this.positions[offset + 4] = y + .05 * (1 - t / .35);
        this.positions[offset + 5] = burst.z + Math.sin(angle) * radius;
      }
    }
    this.fragments.count = fragments;
    this.fragments.instanceMatrix.needsUpdate = fragments > 0;
    this.sparks.geometry.setDrawRange(0, sparks * 2);
    this.sparks.geometry.getAttribute('position').needsUpdate = sparks > 0;
    this.sparks.visible = sparks > 0;
    this.root.visible = fragments > 0 || sparks > 0;
  }

  reset(): void {
    for (const burst of this.bursts) burst.age = burst.lifetime;
    this.fragments.count = 0;
    this.sparks.geometry.setDrawRange(0, 0);
    this.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.fragments.dispose();
    this.fragments.geometry.dispose(); this.fragments.material.dispose();
    this.sparks.geometry.dispose(); this.sparks.material.dispose();
  }
}
