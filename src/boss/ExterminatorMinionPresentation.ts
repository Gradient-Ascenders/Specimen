import * as THREE from 'three';
import type { ExterminatorMinionStyle, ExterminatorModelAsset } from './ExterminatorModelAsset.ts';
import { FINAL_BOSS_TUNING as T } from './FinalBossConfig.ts';

interface Rig { root: THREE.Object3D; fans: THREE.Object3D[]; rotors: THREE.Object3D[]; eye: THREE.Object3D; emitter: THREE.Object3D; }

/** Flying body, banking and recoil are visual children of the squad's collider.
 * Rigid clones borrow the encounter's geometry/materials, including on retry. */
export class ExterminatorMinionPresentation {
  readonly root = new THREE.Group();
  readonly advanced: boolean;
  private readonly rigs: Rig[] = [];
  private guardian = true;
  private recoil = 0;
  private shotTime = 0;
  private yaw = 0;
  private readonly aim = new THREE.Vector3(0, 0, -1);
  private readonly motion = new THREE.Vector3();
  private readonly localMotion = new THREE.Vector3();
  constructor(advanced = false) {
    this.advanced = advanced;
    this.root.name = advanced ? 'advanced-flying-exterminator-drone' : 'flying-exterminator-drone';
    this.root.scale.setScalar(T.minionScale * (advanced ? T.advancedScale : 1));
  }
  adopt(asset: ExterminatorModelAsset): void {
    if (this.rigs.length) return;
    const styles: ExterminatorMinionStyle[] = this.advanced ? ['Advanced'] : ['Guardian', 'Pursuer'];
    for (const style of styles) {
      const root = asset.cloneMinion(style), parts = new Map<string, THREE.Object3D>();
      root.traverse(o => { if (typeof o.userData.dronePart === 'string') parts.set(o.userData.dronePart, o); });
      const require = (n: string) => { const o = parts.get(n); if (!o) throw new Error(`Missing ${style} articulation: ${n}`); return o; };
      this.rigs.push({ root, fans: ['L', 'R'].map(s => require(`SW_Fan_${s}`)), rotors: ['L', 'R'].map(s => require(`SW_Fan_${s}_Rotor`)), eye: require('SW_Eye'), emitter: require('SW_Emitter') });
      this.root.add(root);
    }
    this.setGuardian(this.guardian);
  }
  setGuardian(guardian: boolean): void {
    this.guardian = guardian;
    this.rigs.forEach((r, i) => { r.root.visible = this.advanced || i === (guardian ? 0 : 1); r.emitter.visible = guardian; });
  }
  setAimDirection(direction: THREE.Vector3Like): void { this.aim.copy(direction).normalize(); }
  setVelocity(velocity: THREE.Vector3Like): void { this.motion.copy(velocity); }
  fire(): void { this.recoil = .065; this.shotTime = .12; }
  update(dt: number, time: number): void {
    const targetYaw = Math.atan2(-this.aim.x, -this.aim.z);
    const turn = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    this.yaw += turn * (1 - Math.exp(-12 * dt));
    this.root.rotation.y = this.yaw;
    this.localMotion.copy(this.motion).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.yaw);
    const bank = THREE.MathUtils.clamp(-this.localMotion.x * .012 - turn * .15, -.22, .22);
    const pitch = THREE.MathUtils.clamp(this.localMotion.z * .009, -.15, .15);
    this.root.rotation.z = THREE.MathUtils.damp(this.root.rotation.z, bank, 8, dt);
    this.root.rotation.x = THREE.MathUtils.damp(this.root.rotation.x, pitch, 8, dt);
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 22, dt); this.shotTime = Math.max(0, this.shotTime - dt);
    for (const r of this.rigs) {
      if (!r.root.visible) continue;
      r.root.position.z = this.recoil;
      r.rotors.forEach((o, i) => { o.rotation.y += dt * (40 + this.motion.length() * .5) * (i ? 1 : -1); });
      r.fans.forEach((o, i) => { o.rotation.x = -pitch * .6; o.rotation.z = -bank * .5 + (i ? 1 : -1) * .035; });
      r.eye.scale.setScalar(1 + this.shotTime * .8);
      r.emitter.rotation.z = Math.sin(time * .8) * .06;
    }
  }
  reset(): void {
    this.yaw = this.recoil = this.shotTime = 0; this.motion.set(0, 0, 0); this.aim.set(0, 0, -1);
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0);
    for (const r of this.rigs) {
      r.root.position.set(0, 0, 0); r.eye.scale.setScalar(1);
      for (const o of [...r.rotors, ...r.fans, r.emitter]) o.rotation.set(0, 0, 0);
    }
  }
  dispose(): void { this.root.removeFromParent(); this.root.clear(); this.rigs.length = 0; }
}
