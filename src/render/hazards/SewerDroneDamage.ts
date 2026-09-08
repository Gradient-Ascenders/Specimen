import * as THREE from 'three';

/** Fixed-size spark pool and progressive missing hardware; no gameplay health authority. */
export class SewerDroneDamage {
  private readonly positions = new Float32Array(72);
  private readonly sparks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly parts: THREE.Object3D[];
  private readonly body: THREE.Mesh;
  private elapsed = 0;
  private previousHits = -1;
  constructor(body: THREE.Mesh) {
    this.body = body;
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
      this.previousHits = hits; this.elapsed = 0;
      for (const part of this.parts) part.visible = hits < part.userData.damageStage;
      const materials = Array.isArray(this.body.material) ? this.body.material : [this.body.material];
      for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) {
        material.color.setHex(hits === 0 ? 0xffffff : hits === 1 ? 0xc6b4a8 : 0x948a82);
      }
    }
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
  dispose(): void {
    this.sparks.removeFromParent(); this.sparks.geometry.dispose(); this.sparks.material.dispose();
  }
}
