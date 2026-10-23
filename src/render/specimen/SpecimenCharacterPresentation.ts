import * as THREE from 'three';
import { CameraBodyVisibility } from '../CameraBodyVisibility.ts';
import type { CameraRig, CameraFollowTarget } from '../CameraRig.ts';
import { moveAngleTowards } from '../BlobFacing.ts';
import type { GelRendering } from '../slime/GelRendering.ts';
import { SlimeBurstPresentation } from '../slime/SlimeBurstPresentation.ts';
import type { Vector3State } from '../slime/SlimePresentationContract.ts';
import { disposeSpecimenAsset, loadSpecimenAsset, SPECIMEN_RESTING_SOLE, SPECIMEN_TRIANGLES,
  validateSpecimenAsset, type SpecimenAsset } from './SpecimenAsset.ts';
import { SpecimenMaterials } from './SpecimenMaterials.ts';

export interface SpecimenCharacterState {
  readonly locomotionPosition: Vector3State;
  readonly velocity: Vector3State;
  readonly gameplayUp: Vector3State;
  readonly grounded: boolean;
  readonly landedThisStep: boolean;
  readonly chargingJump: boolean;
  readonly chargeFraction: number;
}
export interface SpecimenCharacterAttack {
  readonly aimActive: boolean;
  readonly aimDirection: Vector3State;
  readonly chargeAmount: number;
}
const UP = new THREE.Vector3(0, 1, 0);
const MORPHS = ['Breathe', 'Squash', 'Stretch', 'WobbleLeft', 'WobbleRight', 'Flow', 'Charge',
  'Blink', 'Curious', 'Focus', 'CrestFlexLeft', 'CrestFlexRight'] as const;
type Weights = Record<typeof MORPHS[number], number>;
const emptyWeights = (): Weights => Object.fromEntries(MORPHS.map(name => [name, 0])) as Weights;

/** Authored final fusion; reads simulation state without changing body or abilities. */
export class SpecimenCharacterPresentation {
  readonly radiusMetres: number;
  private readonly gelRendering: GelRendering | undefined;
  readonly root = new THREE.Group();
  readonly placement = new THREE.Group();
  private readonly support = new THREE.Group();
  private readonly facing = new THREE.Group();
  private readonly shape = new THREE.Group();
  private readonly cameraVisibility = new CameraBodyVisibility();
  private readonly burst = new SlimeBurstPresentation(0x35d7b5);
  private readonly previousTravel = new THREE.Vector3();
  private readonly travel = new THREE.Vector3();
  private readonly localDirection = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly supportRotation = new THREE.Quaternion();
  private readonly previousSupportRotation = new THREE.Quaternion();
  private readonly inverseSupport = new THREE.Quaternion();
  private asset: SpecimenAsset | undefined;
  private materials: SpecimenMaterials | undefined;
  private pending: Promise<void> | undefined;
  private disposed = false;
  private visible = false;
  private opacity = 1;
  private environment: THREE.Texture | null = null;
  private reflection = 0;
  private eyeReflection = 0;
  private seeded = false;
  private clock = 0;
  private yaw = 0;
  private previousYaw = 0;
  private landing = 0;
  private dead = false;
  private weights = emptyWeights();
  private previousWeights = emptyWeights();

  constructor(radiusMetres = 0.675, gelRendering?: GelRendering) {
    this.radiusMetres = radiusMetres; this.gelRendering = gelRendering;
    this.root.name = 'player-specimen-presentation';
    this.placement.name = 'player-specimen-placement';
    this.shape.name = 'specimen-sole-pivot';
    const assetScale = radiusMetres / 0.675;
    this.shape.scale.setScalar(assetScale);
    this.shape.position.y = -radiusMetres - SPECIMEN_RESTING_SOLE * assetScale;
    this.facing.add(this.shape); this.support.add(this.facing);
    this.placement.add(this.support); this.root.add(this.placement, this.burst.root);
    this.applyVisibility();
  }
  get ready(): boolean { return !!this.asset && !this.disposed; }
  get diagnostics() {
    return { ready: this.ready, visible: this.support.visible, opacity: this.opacity, deathActive: this.dead,
      weights: { ...this.weights }, yaw: this.yaw, triangles: this.asset ? SPECIMEN_TRIANGLES : 0,
      meshCount: this.asset?.meshes.length ?? 0, soleOffset: -this.radiusMetres,
      meshes: this.asset?.meshes.map(mesh => ({ name: mesh.name, weights: [...mesh.morphTargetInfluences!] })) ?? [] };
  }
  prepare(loader: () => Promise<THREE.Group> = loadSpecimenAsset): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Cannot prepare disposed Specimen'));
    if (this.ready) return Promise.resolve();
    if (this.pending) return this.pending;
    const pending = Promise.resolve().then(loader).then(root => {
      if (this.disposed) { disposeSpecimenAsset(root); return; }
      try {
        const asset = validateSpecimenAsset(root);
        const materials = new SpecimenMaterials(asset, this.gelRendering);
        materials.setReflectionEnvironment(this.environment);
        materials.setReflectionIntensity(this.reflection, this.eyeReflection);
        materials.setOpacity(this.opacity);
        for (const mesh of asset.meshes) {
          this.cameraVisibility.bind(mesh);
          mesh.geometry.computeBoundingSphere();
          mesh.geometry.boundingSphere!.radius += 0.35;
        }
        this.shape.add(root); this.asset = asset; this.materials = materials;
        this.applyVisibility(); this.present(1);
      } catch (error) {
        this.cameraVisibility.dispose(); disposeSpecimenAsset(root, this.environment); throw error;
      }
    });
    this.pending = pending;
    void pending.finally(() => { if (this.pending === pending) this.pending = undefined; }).catch(() => {});
    return pending;
  }
  setCameraView(rig: CameraRig, target: CameraFollowTarget): void { this.cameraVisibility.configure(rig, target); }
  setPosition(position: Vector3State): void { this.placement.position.set(position.x, position.y, position.z); }
  setYaw(yaw: number): void { this.yaw = this.previousYaw = yaw; this.present(1); }
  setVisible(visible: boolean): void { this.visible = visible; this.applyVisibility(); }
  setOpacity(opacity: number): void {
    this.opacity = THREE.MathUtils.clamp(opacity, 0, 1); this.materials?.setOpacity(this.opacity); this.applyVisibility();
  }
  setReflectionEnvironment(texture: THREE.Texture | null): void {
    this.environment = texture; this.materials?.setReflectionEnvironment(texture);
  }
  setReflectionIntensity(body: number, eyes: number): void {
    this.reflection = body; this.eyeReflection = eyes; this.materials?.setReflectionIntensity(body, eyes);
  }
  update(dt: number, state: SpecimenCharacterState, attack: SpecimenCharacterAttack): void {
    if (this.dead) return;
    this.clock += dt;
    Object.assign(this.previousWeights, this.weights);
    this.previousYaw = this.yaw; this.previousSupportRotation.copy(this.supportRotation);
    this.up.set(state.gameplayUp.x, state.gameplayUp.y, state.gameplayUp.z).normalize();
    this.supportRotation.setFromUnitVectors(UP, this.up);
    this.inverseSupport.copy(this.supportRotation).invert();
    this.travel.set(state.locomotionPosition.x, state.locomotionPosition.y, state.locomotionPosition.z);
    this.localDirection.copy(this.travel).sub(this.previousTravel).applyQuaternion(this.inverseSupport);
    const speed = this.seeded ? Math.hypot(this.localDirection.x, this.localDirection.z) / dt : 0;
    this.previousTravel.copy(this.travel); this.seeded = true;
    if (attack.aimActive) this.localDirection.set(attack.aimDirection.x, attack.aimDirection.y, attack.aimDirection.z)
      .applyQuaternion(this.inverseSupport);
    if (attack.aimActive || speed > 0.08) this.yaw = moveAngleTowards(this.yaw,
      Math.atan2(-this.localDirection.x, -this.localDirection.z), dt * 7);
    if (state.landedThisStep) this.landing = 1;
    else this.landing = Math.max(0, this.landing - dt * 4.5);
    const motion = THREE.MathUtils.clamp(speed / 5, 0, 1);
    const sway = Math.sin(this.clock * (5 + motion * 5)) * motion * 0.18;
    const blinkPhase = this.clock % 4.7;
    Object.assign(this.weights, {
      Breathe: 0.3 + Math.sin(this.clock * 2) * 0.22,
      Flow: 0.5 + Math.sin(this.clock * 1.6) * 0.45,
      Squash: Math.max(this.landing * 0.65, state.chargingJump ? state.chargeFraction * 0.45 : 0),
      Stretch: state.grounded ? 0 : Math.min(0.48, Math.abs(state.velocity.y) / 18),
      WobbleLeft: Math.max(0, sway), WobbleRight: Math.max(0, -sway),
      CrestFlexLeft: Math.max(0, sway * 1.5), CrestFlexRight: Math.max(0, -sway * 1.5),
      Blink: blinkPhase > 4.48 ? Math.sin((blinkPhase - 4.48) / 0.22 * Math.PI) : 0,
      Charge: attack.chargeAmount, Focus: attack.aimActive ? 0.65 : 0, Curious: 0,
    });
  }
  present(alpha = 1): void {
    alpha = THREE.MathUtils.clamp(alpha, 0, 1);
    this.support.quaternion.slerpQuaternions(this.previousSupportRotation, this.supportRotation, alpha);
    this.facing.rotation.y = this.previousYaw + Math.atan2(Math.sin(this.yaw - this.previousYaw), Math.cos(this.yaw - this.previousYaw)) * alpha;
    for (const mesh of this.asset?.meshes ?? []) {
      mesh.morphTargetInfluences!.fill(0);
      for (const name of MORPHS) {
        const index = mesh.morphTargetDictionary![name];
        if (index !== undefined) mesh.morphTargetInfluences![index] = THREE.MathUtils.lerp(this.previousWeights[name], this.weights[name], alpha);
      }
    }
    this.materials?.setCharge(THREE.MathUtils.lerp(this.previousWeights.Charge, this.weights.Charge, alpha));
  }
  startDeath(position: Vector3State): void { this.dead = true; this.burst.start(position); this.applyVisibility(); }
  updateDeath(dt: number): void { this.burst.update(dt); }
  primeDeathResources(position: Vector3State, render: (root: THREE.Object3D) => void): void { this.burst.primeResources(position, render); }
  reset(): void {
    this.dead = false; this.burst.reset(); this.seeded = false; this.clock = this.landing = 0;
    this.yaw = this.previousYaw = 0;
    this.supportRotation.identity(); this.previousSupportRotation.identity();
    this.weights = emptyWeights(); this.previousWeights = emptyWeights();
    this.setOpacity(1); this.present(1); this.applyVisibility();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.cameraVisibility.dispose();
    if (this.asset) disposeSpecimenAsset(this.asset.root, this.environment);
    this.asset = undefined; this.materials = undefined; this.burst.dispose(); this.root.removeFromParent(); this.root.clear();
  }
  private applyVisibility(): void { this.support.visible = this.visible && !this.dead && this.opacity > 0 && !this.disposed; }
}
