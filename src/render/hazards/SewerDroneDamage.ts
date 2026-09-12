import * as THREE from 'three';
import { DroneBreakupPresentation } from './DroneBreakupPresentation.ts';

/** Fixed-size spark pool and progressive missing hardware; no gameplay health authority. */
export class SewerDroneDamage {
  private readonly positions = new Float32Array(72);
  private readonly sparks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly parts: THREE.Object3D[];
  private readonly body: THREE.Mesh;
  private elapsed = 0;
  private previousHits = -1;
  private readonly breakup = new DroneBreakupPresentation(1, 2.8);
  constructor(body: THREE.Mesh) {
    this.body = body;
    this.breakup.root.name = 'room-5-sewer-drone-debris';
    body.parent!.add(this.breakup.root);
    this.parts = body.children.filter(part => typeof part.userData.damageStage === 'number');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0xffbb56, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.name = 'room-5-damaged-drone-sparks'; this.sparks.frustumCulled = false;
    body.add(this.sparks); this.update(0, 0);
  }
  update(dt: number, hits: number): void {
    this.elapsed += dt;
    if (hits !== this.previousHits) {
      if (hits === 3 && this.previousHits >= 0 && this.previousHits < 3) {
        this.breakup.burst(0, this.body.position.x, this.body.position.y, this.body.position.z, -12);
        this.body.visible = false;
      } else if (hits < 3) this.breakup.reset();
      this.previousHits = hits; this.elapsed = 0;
      for (const part of this.parts) part.visible = hits < part.userData.damageStage;
      const materials = Array.isArray(this.body.material) ? this.body.material : [this.body.material];
      for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) {
        material.color.setHex(hits === 0 ? 0xffffff : hits === 1 ? 0xc6b4a8 : 0x948a82);
      }
    }
    // The burn coordinator may refresh visibility while its final reaction ends.
    if (hits === 3) this.body.visible = false;
    this.breakup.update(dt);
    this.sparks.visible = hits > 0 && hits < 3;
    if (!this.sparks.visible) return;
    const pulse = this.elapsed < .35 ? 1 : ((this.elapsed * (hits === 1 ? 4 : 8)) % 1 < .55 ? 1 : .08);
    this.sparks.material.opacity = pulse;
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.39996 + this.elapsed * 5;
      const age = (this.elapsed * 3 + i / 12) % 1;
      const x = (i % 2 ? 1 : -1) * .85, y = .2, z = .15;
      const offset = i * 6;
      this.positions[offset] = x; this.positions[offset + 1] = y; this.positions[offset + 2] = z;
      this.positions[offset + 3] = x + Math.cos(angle) * age * .8;
      this.positions[offset + 4] = y + Math.sin(angle * 1.7) * age * .7;
      this.positions[offset + 5] = z + Math.sin(angle) * age * .8;
    }
    this.sparks.geometry.getAttribute('position').needsUpdate = true;
  }
  reset(hits: number): void {
    this.breakup.reset();
    this.previousHits = -1;
    this.update(0, hits);
  }
  dispose(): void {
    this.breakup.dispose();
    this.sparks.removeFromParent(); this.sparks.geometry.dispose(); this.sparks.material.dispose();
  }
}
