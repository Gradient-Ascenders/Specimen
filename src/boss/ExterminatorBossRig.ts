import * as THREE from 'three';
import type { FinalBossReadModel } from './FinalBossController.ts';

/** Rigid authored pivots consume the existing encounter state; no attack clocks
 * or collision transforms are advanced by the art. */
export class ExterminatorBossRig {
  readonly root: THREE.Object3D;
  private readonly fans: THREE.Object3D[];
  private readonly rotors: THREE.Object3D[];
  private readonly guns: THREE.Object3D[];
  private readonly drums: THREE.Object3D[];
  private readonly muzzles: THREE.Object3D[];
  private readonly iris: THREE.Object3D[];
  private readonly vents: THREE.Object3D[];
  private readonly breakaway: THREE.Object3D[];
  private readonly damaged: THREE.Object3D[];
  private readonly eye: THREE.Object3D;
  private readonly localTarget = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly flashes: THREE.Mesh[] = [];
  private readonly flashGeometry = new THREE.ConeGeometry(.43, 1.35, 8);
  private readonly flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc7c, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
  private recoil = 0;
  private flashTime = 0;
  private opening = 0;
  private readonly heatMaterials = new Set<THREE.MeshStandardMaterial>();
  constructor(root: THREE.Object3D) {
    this.root = root;
    const require = (name: string) => { const o = root.getObjectByName(name); if (!o) throw new Error(`Missing boss articulation: ${name}`); return o; };
    this.fans = ['LF', 'LB', 'RF', 'RB'].map(n => require(`EX_Fan_${n}`));
    this.rotors = ['LF', 'LB', 'RF', 'RB'].map(n => require(`EX_Fan_${n}_Rotor`));
    this.guns = ['L', 'R'].map(n => require(`EX_Gun_${n}`));
    this.drums = ['L', 'R'].map(n => require(`EX_Drum_${n}`));
    this.muzzles = ['L', 'R'].map(n => require(`EX_Muzzle_${n}`));
    this.iris = [0, 1, 2, 3].map(n => require(`EX_Iris_${n}`));
    this.vents = Array.from({ length: 7 }, (_, n) => require(`EX_Vent_${n}`));
    this.breakaway = ['L', 'R'].map(n => require(`EX_Breakaway_${n}`));
    this.damaged = ['L', 'R'].map(n => require(`EX_Damaged_${n}`));
    this.eye = require('EX_EyeMuzzle');
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof THREE.MeshStandardMaterial && m.name === 'EX_Red') this.heatMaterials.add(m);
    });
    for (const gun of this.guns) {
      const flash = new THREE.Mesh(this.flashGeometry, this.flashMaterial);
      flash.name = 'exterminator-authored-muzzle-flash'; flash.userData.contactSolid = false;
      flash.rotation.x = -Math.PI / 2; flash.position.set(0, -.1, -4.62); flash.visible = false;
      gun.add(flash); this.flashes.push(flash);
    }
    this.reset();
  }
  update(time: number, open: boolean, phase: 1 | 2, dt: number, model?: Readonly<FinalBossReadModel>, target?: THREE.Vector3Like): void {
    const firing = model?.state === 'combat' && model.attack === 'gun-blast';
    const charge = model?.stage === 'telegraph' ? model.progress : model?.stage === 'active' ? 1 : 0;
    const ram = model?.attack === 'ram', beam = model?.attack === 'laser-beam';
    const speed = ram ? 24 + charge * 38 : firing ? 18 + charge * 30 : phase === 2 ? 27 : 18;
    this.rotors.forEach((o, i) => { o.rotation.y += dt * speed * (i % 2 ? 1 : -1); });
    this.fans.forEach((o, i) => {
      o.rotation.x = THREE.MathUtils.damp(o.rotation.x, ram ? -.15 * charge : beam ? .035 : Math.sin(time * .7 + i) * .035, 7, dt);
      o.rotation.z = THREE.MathUtils.damp(o.rotation.z, (i < 2 ? 1 : -1) * (ram ? .03 : .065), 7, dt);
      // The existing full jump clears a level turbine by centimetres. Brace
      // the gimbals level at release so the art cannot raise that RAM obstacle.
      if (ram && model?.stage === 'active') o.rotation.x = o.rotation.z = 0;
    });
    this.opening = THREE.MathUtils.damp(this.opening, open ? .96 : 0, 14, dt);
    this.iris.forEach(o => { this.axis.set(1, 0, 0).applyQuaternion(o.quaternion); o.position.set(0, -.1, -4.65 + this.opening * .58).addScaledVector(this.axis, this.opening); });
    this.vents.forEach((o, i) => { o.rotation.x = THREE.MathUtils.damp(o.rotation.x, (firing || beam ? .34 * charge : .06) + (phase === 2 ? .22 : 0) + Math.sin(time + i) * .015, 6, dt); });
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 24, dt); this.flashTime = Math.max(0, this.flashTime - dt);
    if (target) { this.localTarget.copy(target); this.root.worldToLocal(this.localTarget); }
    this.guns.forEach((gun, i) => {
      gun.position.z = -2.4 + this.recoil;
      const pitch = firing && target ? Math.atan2(this.localTarget.y - gun.position.y, Math.hypot(this.localTarget.x - gun.position.x, this.localTarget.z - gun.position.z)) : model?.shieldActive ? .2 : -.03;
      gun.rotation.x = THREE.MathUtils.damp(gun.rotation.x, THREE.MathUtils.clamp(pitch, -.65, .5), 10, dt);
      this.drums[i]!.rotation.z += dt * (firing ? speed * 1.7 : .5) * (i ? 1 : -1);
      this.flashes[i]!.visible = firing && this.flashTime > 0;
    });
    this.breakaway.forEach((o, i) => {
      // One panel is torn away, the other stays visibly bent on its mounting.
      o.visible = phase === 1 || i === 1;
      o.rotation.z = phase === 2 ? -.5 : 0;
      o.position.y = phase === 2 ? 2.3 : 2.14;
    });
    this.damaged.forEach(o => { o.visible = phase === 2; });
    for (const m of this.heatMaterials) { m.emissiveIntensity = phase === 2 ? 1.9 : firing ? 1.3 : 1; m.emissive.setHex(phase === 2 ? 0xff2306 : 0xff0210); }
    if (model?.state === 'defeated') {
      const p = THREE.MathUtils.smoothstep(model.progress, .48, .68);
      this.fans.forEach((o, i) => { o.position.y = -.1 - p * (1 + i * .35); o.rotation.z += p * (i % 2 ? -.35 : .35); });
    } else this.fans.forEach(o => { o.position.y = -.1; });
  }
  kickGuns(): void { this.recoil = .34; this.flashTime = .07; }
  copyGunMuzzle(i: number, out: THREE.Vector3): THREE.Vector3 { return this.muzzles[i]!.getWorldPosition(out); }
  copyEyeMuzzle(out: THREE.Vector3): THREE.Vector3 { return this.eye.getWorldPosition(out); }
  reset(): void {
    this.recoil = this.flashTime = this.opening = 0;
    for (const o of [...this.fans, ...this.rotors, ...this.guns, ...this.drums, ...this.vents]) o.rotation.set(0, 0, 0);
    for (const o of this.fans) o.position.y = -.1;
    for (const o of this.guns) o.position.z = -2.4;
    for (const o of this.iris) o.position.set(0, -.1, -4.65);
    for (const o of this.breakaway) { o.visible = true; o.rotation.set(0, 0, 0); o.position.y = 2.14; }
    for (const o of this.damaged) o.visible = false;
    for (const o of this.flashes) o.visible = false;
    for (const m of this.heatMaterials) { m.emissiveIntensity = 1; m.emissive.setHex(0xff0210); }
  }
  dispose(): void { this.flashGeometry.dispose(); this.flashMaterial.dispose(); this.root.removeFromParent(); }
}
