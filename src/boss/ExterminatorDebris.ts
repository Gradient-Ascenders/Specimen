import * as THREE from 'three';

/** A bounded pool of recognisable armour plates, turbine rims and hot sparks.
 * These are visual fragments; they never add colliders or obstruct the fight. */
export class ExterminatorDebris {
  readonly root = new THREE.Group();
  private readonly slots = Array.from({ length: 12 }, () => ({ age: 2, scale: 1, at: new THREE.Vector3() }));
  private readonly plates = new THREE.InstancedMesh(new THREE.BoxGeometry(.3, .065, .22), new THREE.MeshStandardMaterial({ color: 0x927631, roughness: .7, metalness: .55 }), 48);
  private readonly rims = new THREE.InstancedMesh(new THREE.TorusGeometry(.2, .037, 4, 12, Math.PI * 1.35), new THREE.MeshStandardMaterial({ color: 0x67747b, roughness: .42, metalness: .8 }), 24);
  private readonly sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.035, 0), new THREE.MeshBasicMaterial({ color: 0xffaa39, toneMapped: false }), 72);
  private readonly transform = new THREE.Object3D();
  private cursor = 0;
  private disposed = false;
  constructor() {
    this.root.name = 'exterminator-pooled-mechanical-debris'; this.root.userData.presentationOnly = true;
    for (const m of [this.plates, this.rims, this.sparks]) { m.frustumCulled = false; m.count = 0; this.root.add(m); }
  }
  burst(at: THREE.Vector3Like, scale = 1): void {
    const slot = this.slots[this.cursor++ % this.slots.length]!; slot.age = 0; slot.at.copy(at); slot.scale = scale;
  }
  update(dt: number): void {
    let plates = 0, rims = 0, sparks = 0;
    for (const [j, slot] of this.slots.entries()) {
      slot.age += dt; const t = slot.age; if (t >= 1.2) continue;
      for (let i = 0; i < 6; i++) {
        const angle = i * 2.39996 + j * .7, travel = t * (1.4 + i * .25) * slot.scale;
        this.transform.position.set(slot.at.x + Math.cos(angle) * travel, slot.at.y + (2.4 + i * .22) * t - 6 * t * t, slot.at.z + Math.sin(angle) * travel);
        this.transform.rotation.set(t * (3 + i), angle + t * 4, t * (i % 2 ? 5 : -5));
        this.transform.scale.setScalar(slot.scale * (1 - THREE.MathUtils.smoothstep(t, .75, 1.2))); this.transform.updateMatrix();
        if (i < 4) this.plates.setMatrixAt(plates++, this.transform.matrix); else this.rims.setMatrixAt(rims++, this.transform.matrix);
        if (t < .3) {
          this.transform.position.sub(slot.at).multiplyScalar(1.8).add(slot.at);
          this.transform.scale.setScalar(slot.scale * (1 - t / .3)); this.transform.updateMatrix(); this.sparks.setMatrixAt(sparks++, this.transform.matrix);
        }
      }
    }
    for (const [m, count] of [[this.plates, plates], [this.rims, rims], [this.sparks, sparks]] as const) { m.count = count; if (count) m.instanceMatrix.needsUpdate = true; }
  }
  reset(): void { for (const s of this.slots) s.age = 2; this.plates.count = this.rims.count = this.sparks.count = this.cursor = 0; }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.root.removeFromParent(); this.root.clear();
    for (const m of [this.plates, this.rims, this.sparks]) { m.dispose(); m.geometry.dispose(); m.material.dispose(); }
  }
}
