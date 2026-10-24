import * as THREE from 'three';
import type { Vector3State } from '../slime/SlimePresentationContract.ts';

const UP = new THREE.Vector3(0, 1, 0);
const GHOST_LIFE = 0.24;

/** Fixed resources for gathering arcs, a charged landing and four short dash echoes. */
export class SpecimenActionEffects {
  readonly root = new THREE.Group();
  readonly arcs: THREE.LineSegments;
  readonly ghosts: THREE.InstancedMesh;
  private readonly arcPositions = new THREE.Float32BufferAttribute(new Float32Array(24 * 2 * 3), 3);
  private readonly landing = new THREE.Group();
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0x90ffe4, transparent: true,
    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private readonly ringGeometry = new THREE.TorusGeometry(1, 0.016, 4, 64);
  private readonly sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly color = new THREE.Color();
  private readonly sparkPositions = new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3);
  private readonly ghostSlots = Array.from({ length: 4 }, () => ({ age: 1, position: new THREE.Vector3(), yaw: 0 }));
  private readonly dummy = new THREE.Object3D();
  private readonly alignment = new THREE.Quaternion();
  private readonly spin = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private ghostInterval = 0;
  private ghostCursor = 0;
  private landingAge = 1;
  private clock = 0;
  private visible = false;
  private bodyOpacity = 1;
  private arcsRequested = false;
  private arcOpacity = 0.25;
  private disposed = false;
  private primed = false;
  private readonly radius: number;

  constructor(radius: number) {
    this.radius = radius;
    this.root.name = 'specimen-action-effects';
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.arcPositions); this.arcPositions.setUsage(THREE.DynamicDrawUsage);
    this.arcs = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffee8c,
      transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcs.frustumCulled = false; this.arcs.name = 'specimen-charge-arcs';
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(i === 0 ? 1 : 0.7); this.landing.add(ring);
    }
    const sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute('position', this.sparkPositions);
    this.sparkPositions.setUsage(THREE.DynamicDrawUsage);
    this.sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ color: 0xffdd61, size: radius * 0.09,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sparks.frustumCulled = false; this.landing.add(this.sparks); this.landing.name = 'specimen-landing-ring';
    // A tapered bell silhouette, stretched along the burst direction.
    const profile = [[0, -0.85], [0.9, -0.85], [0.96, -0.75], [0.62, -0.45], [0.56, 0.5], [0.42, 0.83], [0, 1]];
    this.ghosts = new THREE.InstancedMesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x!, y!)), 18),
      new THREE.MeshBasicMaterial({ color: 0x68ffe0, transparent: true, opacity: 0.22, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false }), 4);
    this.ghosts.name = 'specimen-dash-afterimages'; this.ghosts.frustumCulled = false;
    this.ghosts.setColorAt(0, this.color);
    this.ghosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.ghosts.count = 0;
    this.root.add(this.arcs, this.landing, this.ghosts); this.reset();
  }
  get diagnostics() { return { landingActive: this.landing.visible, chargeArcsVisible: this.arcs.visible,
    afterimages: this.ghosts.count }; }
  setVisible(visible: boolean): void { this.visible = visible; this.root.visible = visible; if (!visible) this.reset(); }
  setBodyOpacity(opacity: number): void {
    this.bodyOpacity = opacity; this.arcs.visible = this.visible && this.arcsRequested && opacity > 0;
    (this.arcs.material as THREE.LineBasicMaterial).opacity = this.arcOpacity * opacity;
  }

  update(dt: number, state: { position: Vector3State; up: Vector3State; yaw: number; charge: number;
    charging: boolean; overcharge: number; dashing: boolean }): void {
    if (this.disposed || !this.visible) return;
    this.clock += dt; this.up.copy(state.up); this.alignment.setFromUnitVectors(UP, this.up);
    this.arcsRequested = state.charging || state.overcharge >= 1;
    this.arcs.visible = this.arcsRequested && this.bodyOpacity > 0;
    this.arcs.position.copy(state.position); this.arcs.quaternion.copy(this.alignment);
    this.spin.setFromAxisAngle(UP, state.yaw); this.arcs.quaternion.multiply(this.spin);
    const power = Math.max(state.charge, state.overcharge >= 1 ? 0.7 : 0);
    this.arcOpacity = 0.25 + power * 0.65;
    (this.arcs.material as THREE.LineBasicMaterial).opacity = this.arcOpacity * this.bodyOpacity;
    // Six filaments converge onto the muzzle; the travelling pulse accelerates with charge.
    for (let arc = 0; arc < 6; arc++) for (let segment = 0; segment < 4; segment++) for (let end = 0; end < 2; end++) {
      const t = (segment + end) / 4;
      const angle = arc * Math.PI / 3 + this.clock * (1 + power * 2) + t * 0.4;
      const width = this.radius * (0.5 + power * 0.35) * (1 - t);
      const jitter = Math.sin(arc * 9 + (segment + end) * 4 + Math.floor(this.clock * 22)) * this.radius * 0.04 * (1 - t);
      this.arcPositions.setXYZ(arc * 8 + segment * 2 + end,
        Math.cos(angle) * width + jitter, this.radius * (0.2 + t * 0.55) + Math.sin(angle) * width,
        -this.radius * (0.1 + t * 1.02));
    }
    this.arcPositions.needsUpdate = true;
    this.landingAge += dt;
    this.landing.visible = this.landingAge < 0.55;
    if (this.landing.visible) {
      const t = this.landingAge / 0.55;
      this.landing.scale.setScalar(this.radius * (0.65 + t * 3.6));
      this.ringMaterial.opacity = (1 - t) ** 2 * 0.9;
      this.sparks.material.opacity = (1 - t) ** 2;
      for (let i = 0; i < 24; i++) {
        const angle = i * 2.399963;
        this.sparkPositions.setXYZ(i, Math.cos(angle) * (0.5 + t * 0.7),
          Math.max(0.02, Math.sin(t * Math.PI) * (0.12 + i % 3 * 0.05)), Math.sin(angle) * (0.5 + t * 0.7));
      }
      this.sparkPositions.needsUpdate = true;
    }
    for (const slot of this.ghostSlots) slot.age += dt;
    this.ghostInterval -= dt;
    if (state.dashing && this.ghostInterval <= 0) {
      const slot = this.ghostSlots[this.ghostCursor++ % 4]!;
      slot.age = 0; slot.position.copy(state.position); slot.yaw = state.yaw;
      this.ghostInterval = 0.045;
    }
    if (!state.dashing) this.ghostInterval = 0;
    let count = 0;
    for (const slot of this.ghostSlots) {
      if (slot.age >= GHOST_LIFE) continue;
      this.dummy.position.copy(slot.position); this.dummy.quaternion.copy(this.alignment);
      this.spin.setFromAxisAngle(UP, slot.yaw); this.dummy.quaternion.multiply(this.spin);
      this.dummy.scale.set(this.radius * 0.95, this.radius * 0.85, this.radius * 1.45);
      this.dummy.updateMatrix(); this.ghosts.setMatrixAt(count, this.dummy.matrix);
      this.ghosts.setColorAt(count++, this.color.setScalar((1 - slot.age / GHOST_LIFE) ** 2));
    }
    this.ghosts.count = count;
    if (count) { this.ghosts.instanceMatrix.needsUpdate = true; this.ghosts.instanceColor!.needsUpdate = true; }
  }
  land(position: Vector3State, up: Vector3State): void {
    if (!this.visible || this.disposed) return;
    this.landingAge = 0; this.landing.position.copy(position).addScaledVector(up, -this.radius + 0.045);
    this.landing.quaternion.setFromUnitVectors(UP, up); this.landing.visible = true;
  }
  reset(): void {
    this.landingAge = 1; this.landing.visible = this.arcs.visible = false;
    this.arcsRequested = false;
    this.ghosts.count = this.ghostInterval = this.ghostCursor = 0;
    for (const slot of this.ghostSlots) slot.age = 1;
  }
  primeResources(position: Vector3State, render: (root: THREE.Object3D) => void): void {
    if (this.disposed || this.primed || this.arcs.visible || this.landing.visible || this.ghosts.count > 0) return;
    const visible = this.visible, clock = this.clock;
    try {
      this.setVisible(true); this.land(position, UP);
      this.update(1 / 60, { position, up: UP, yaw: 0, charge: 1, charging: true, overcharge: 1, dashing: true });
      render(this.root); this.primed = true;
    } finally { this.reset(); this.clock = clock; this.visible = this.root.visible = visible; }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.reset(); this.root.removeFromParent();
    this.arcs.geometry.dispose(); (this.arcs.material as THREE.Material).dispose();
    this.ringGeometry.dispose(); this.ringMaterial.dispose(); this.sparks.geometry.dispose(); this.sparks.material.dispose();
    this.ghosts.dispose(); this.ghosts.geometry.dispose(); (this.ghosts.material as THREE.Material).dispose();
  }
}
