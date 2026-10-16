import * as THREE from 'three';
import { TITLE_SPECIMEN_ORDER, type TitleSpecimenId } from '../ui/TitleSpecimenView.ts';

interface PreviewPose {
  lift: number;
  scaleY: number;
  recoil: number;
}

const DURATION = 1.15;
const REPEAT_DELAY = 1.4;

/** Bounded, presentation-only ability demonstrations in pod-local coordinates. */
export class TitleAbilityPreview {
  readonly roots = { bob: new THREE.Group(), goop: new THREE.Group(), volt: new THREE.Group() };
  readonly poses: Record<TitleSpecimenId, PreviewPose> = {
    bob: { lift: 0, scaleY: 1, recoil: 0 },
    goop: { lift: 0, scaleY: 1, recoil: 0 },
    volt: { lift: 0, scaleY: 1, recoil: 0 },
  };
  private readonly ages: Record<TitleSpecimenId, number> = { bob: Infinity, goop: Infinity, volt: Infinity };
  private hovered: TitleSpecimenId | null = null;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly bounceMaterial = this.glow(0x80e3f2);
  private readonly acidMaterial = this.glow(0x94ff42);
  private readonly acidHaloMaterial = this.glow(0x71e731);
  private readonly bounce: THREE.Mesh;
  private readonly acid: THREE.Mesh;
  private readonly acidHalo: THREE.Mesh;
  private readonly acidDrops: THREE.Mesh[] = [];
  private readonly splash: THREE.Mesh;
  private primed = false;
  private disposed = false;

  constructor() {
    for (const id of TITLE_SPECIMEN_ORDER) {
      this.roots[id].name = `title-${id}-ability-preview`;
      this.roots[id].visible = false;
    }
    this.bounce = this.mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 48), this.bounceMaterial, this.roots.bob);
    this.bounce.rotation.x = Math.PI / 2;
    this.bounce.position.y = 0.48;
    this.acid = this.mesh(new THREE.SphereGeometry(0.13, 12, 8), this.acidMaterial, this.roots.goop);
    this.acid.name = 'title-goop-acid-projectile';
    this.acidHalo = this.mesh(new THREE.SphereGeometry(0.21, 12, 8), this.acidHaloMaterial, this.roots.goop);
    for (let i = 0; i < 5; i++) {
      this.acidDrops.push(this.mesh(new THREE.SphereGeometry(0.045, 6, 4), this.acidMaterial, this.roots.goop));
    }
    this.splash = this.mesh(new THREE.SphereGeometry(0.27, 16, 8), this.acidMaterial, this.roots.goop);
    this.splash.position.set(0.72, 0.49, -0.65);
  }

  get blackoutRequested(): boolean { return this.hovered === 'volt'; }

  select(id: TitleSpecimenId | null, replay = false): void {
    if (this.disposed || (id === this.hovered && !replay)) return;
    this.hovered = id;
    if (id) this.ages[id] = 0;
  }

  reset(): void {
    this.hovered = null;
    for (const id of TITLE_SPECIMEN_ORDER) this.ages[id] = Infinity;
    this.update(0, false);
  }

  update(deltaSeconds: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    const dt = Number.isFinite(deltaSeconds) ? THREE.MathUtils.clamp(deltaSeconds, 0, 0.1) : 0;
    for (const id of TITLE_SPECIMEN_ORDER) {
      this.ages[id] += dt;
      if (!reducedMotion && this.hovered === id && this.ages[id] >= DURATION + REPEAT_DELAY) this.ages[id] = 0;
      this.roots[id].visible = this.ages[id] < DURATION;
      Object.assign(this.poses[id], { lift: 0, scaleY: 1, recoil: 0 });
    }
    this.updateBob(this.ages.bob, reducedMotion);
    this.updateGoop(this.ages.goop, reducedMotion);
    this.roots.volt.visible = this.blackoutRequested;
  }

  dimForBlackout(amount: number): void {
    for (const material of this.materials) material.opacity *= 1 - amount;
  }

  /** Include transparent VFX in the hidden boot draw, before the shader guard. */
  withPrimedEffects(draw: () => void): void {
    if (this.primed) { draw(); return; }
    const visibility = new Map<THREE.Object3D, boolean>();
    const opacity = new Map<THREE.Material, number>();
    try {
      for (const id of TITLE_SPECIMEN_ORDER) this.roots[id].traverse(object => {
        visibility.set(object, object.visible); object.visible = true;
      });
      for (const material of this.materials) { opacity.set(material, material.opacity); material.opacity = 0; }
      draw();
      this.primed = true;
    } finally {
      for (const [object, visible] of visibility) object.visible = visible;
      for (const [material, value] of opacity) material.opacity = value;
    }
  }

  private updateBob(age: number, reducedMotion: boolean): void {
    this.bounceMaterial.opacity = 0;
    if (age >= DURATION) return;
    const pose = this.poses.bob;
    const strength = reducedMotion ? 0.35 : 1;
    if (age < 0.18) {
      pose.scaleY = 1 - Math.sin(age / 0.18 * Math.PI / 2) * 0.2 * strength;
      this.bounceMaterial.opacity = age / 0.18 * 0.5;
      this.bounce.scale.setScalar(1);
    } else if (age < 0.88) {
      const flight = (age - 0.18) / 0.7;
      pose.lift = 4 * flight * (1 - flight) * (reducedMotion ? 0.22 : 0.85);
      pose.scaleY = 1 + Math.sin(flight * Math.PI) * 0.14 * strength;
    } else {
      const landing = (age - 0.88) / (DURATION - 0.88);
      pose.scaleY = 1 - Math.sin(landing * Math.PI) * 0.18 * strength;
      this.bounce.scale.setScalar(1 + landing * 0.85);
      this.bounceMaterial.opacity = (1 - landing) * 0.65;
    }
  }

  private updateGoop(age: number, reducedMotion: boolean): void {
    this.acidMaterial.opacity = 0;
    this.acidHaloMaterial.opacity = 0;
    this.acid.visible = this.acidHalo.visible = false;
    this.splash.visible = false;
    for (const drop of this.acidDrops) drop.visible = false;
    if (age >= DURATION) return;
    this.poses.goop.recoil = Math.sin(Math.min(1, age / 0.3) * Math.PI) * (reducedMotion ? 0.025 : 0.1);
    if (age < 0.16) return;
    this.acidMaterial.opacity = 1;
    if (age < 0.8) {
      const travel = (age - 0.16) / 0.64;
      this.acid.visible = this.acidHalo.visible = true;
      this.acid.position.set(0.72 * travel, 0.96 + 0.2 * Math.sin(travel * Math.PI) - 0.47 * travel ** 2,
        -0.42 - travel * 0.23);
      this.acidHalo.position.copy(this.acid.position);
      this.acidHaloMaterial.opacity = 0.22;
      for (const [index, drop] of this.acidDrops.entries()) {
        const tail = Math.max(0, travel - (index + 1) * 0.05);
        drop.visible = true;
        drop.position.set(0.72 * tail, 0.96 + 0.2 * Math.sin(tail * Math.PI) - 0.47 * tail ** 2, -0.42 - tail * 0.23);
      }
    } else {
      const splash = (age - 0.8) / (DURATION - 0.8);
      this.acidMaterial.opacity = 1 - splash;
      this.splash.visible = true;
      this.splash.scale.set(0.5 + splash, 0.08, 0.4 + splash * 0.6);
      for (const [index, drop] of this.acidDrops.entries()) {
        const angle = index / this.acidDrops.length * Math.PI * 2;
        drop.visible = true;
        drop.position.set(0.72 + Math.cos(angle) * splash * 0.35,
          0.49 + Math.sin(splash * Math.PI) * (reducedMotion ? 0.08 : 0.23), -0.65 + Math.sin(angle) * splash * 0.3);
      }
    }
  }

  private glow(color: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.materials.add(material);
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of TITLE_SPECIMEN_ORDER) { this.roots[id].removeFromParent(); this.roots[id].clear(); }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
