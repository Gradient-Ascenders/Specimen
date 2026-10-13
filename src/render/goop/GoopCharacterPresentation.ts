import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { moveAngleTowards, shortestAngleDelta } from '../BlobFacing.ts';
import { SlimeBurstPresentation } from '../slime/SlimeBurstPresentation.ts';
import type { Vector3State, SlimePresentationLaunch } from '../slime/SlimePresentationContract.ts';
import { disposeGoopAsset, disposeGoopMaterials, validateGoopAsset, type GoopAsset } from './GoopAsset.ts';
import { GOOP_BASE_COLOR, GoopMaterialSet } from './GoopMaterials.ts';

const ASSET_URL = new URL('../../../assets/characters/goop/goop.glb', import.meta.url).href;
export type GoopCharacterLoader = () => Promise<THREE.Group>;
export interface GoopCharacterPresentationState {
  readonly locomotionPositionWorld: Vector3State;
  movementIntentWorld: Vector3State;
  grounded: boolean;
}

/** Visual-only static character: no charged poses, attachment or rebound logic. */
export class GoopCharacterPresentation {
  readonly root = new THREE.Group();
  readonly radiusMetres: number;
  private readonly character = new THREE.Group();
  private readonly shape = new THREE.Group();
  private readonly burst = new SlimeBurstPresentation(GOOP_BASE_COLOR);
  private readonly position = new THREE.Vector3();
  private readonly previousTravel = new THREE.Vector3();
  private readonly travel = new THREE.Vector3();
  private asset: GoopAsset | undefined;
  private materials: GoopMaterialSet | undefined;
  private preparation: Promise<void> | undefined;
  private disposed = false;
  private requestedVisible = true;
  private opacity = 1;
  private shadows = true;
  private environment: THREE.Texture | null = null;
  private bodyReflection = 0;
  private eyeReflection = 0;
  private reflectionSnapPending = true;
  private yaw = 0;
  private previousYaw = 0;
  private targetYaw = 0;
  private seededTravel = false;
  private speed = 0;
  private grounded = true;
  private launchRemaining = 0;
  private landingRemaining = 0;
  private landingStrength = 0;
  private previousSquash = 0;
  private squash = 0;
  private deathActive = false;
  private deathElapsed = 0;

  constructor(radiusMetres = 0.45) {
    if (Math.abs(radiusMetres - 0.45) > 1e-6) throw new Error('Goop requires the approved 0.45 m radius');
    this.radiusMetres = radiusMetres;
    this.root.name = 'player-slime-goop-presentation';
    this.character.name = 'player-slime-goop-character';
    this.shape.name = 'goop-sole-pivot';
    this.shape.position.y = -0.45;
    this.character.add(this.shape);
    this.root.add(this.character, this.burst.root);
    this.applyVisibility();
  }

  get ready(): boolean { return !!this.asset && !this.disposed; }
  get diagnostics() {
    return { ready: this.ready, visible: this.character.visible, opacity: this.opacity,
      facingYawRadians: this.yaw, speed: this.speed, grounded: this.grounded,
      squash: Math.max(0, this.squash), stretch: Math.max(0, -this.squash),
      shadowCasting: this.shadows && this.character.visible,
      deathActive: this.deathActive, deathBurst: this.burst.diagnostics,
      materials: this.materials?.diagnostics,
      asset: this.asset ? { bodyTriangles: 26804, eyeTriangles: 6912, drawCalls: 3, geometries: 3, materials: 2 } : undefined };
  }

  prepare(loader: GoopCharacterLoader = async () => {
    const gltf = await new GLTFLoader().loadAsync(ASSET_URL);
    // GLTF animations are separate from scene.animations.
    gltf.scene.animations = gltf.animations;
    return gltf.scene;
  }): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Cannot prepare disposed Goop'));
    if (this.ready) return Promise.resolve();
    if (this.preparation) return this.preparation;
    const pending = Promise.resolve().then(loader).then(root => {
      try {
        const asset = validateGoopAsset(root);
        if (this.disposed) { disposeGoopAsset(root); return; }
        const imported = new Set<THREE.Material>();
        for (const mesh of [asset.body, ...asset.eyes]) {
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) imported.add(material);
        }
        const materials = new GoopMaterialSet();
        materials.setOpacity(this.opacity);
        materials.setReflectionEnvironment(this.environment);
        materials.setReflectionIntensity(this.bodyReflection, this.eyeReflection, true);
        asset.body.material = materials.body;
        asset.body.customDepthMaterial = materials.bodyDepth;
        asset.body.customDistanceMaterial = materials.bodyDistance;
        for (const eye of asset.eyes) {
          eye.material = materials.eyes;
          eye.customDepthMaterial = materials.eyeDepth;
          eye.customDistanceMaterial = materials.eyeDistance;
          eye.userData.cameraFadeEye = true;
        }
        for (const mesh of [asset.body, ...asset.eyes]) {
          mesh.receiveShadow = true;
          mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
          mesh.geometry.boundingBox!.expandByScalar(0.0045);
          mesh.geometry.boundingSphere!.radius += 0.0045;
        }
        disposeGoopMaterials(imported);
        // Per-load geometry belongs to this instance; no cache or reparenting.
        root.position.y = 0.45;
        this.shape.add(root);
        this.asset = asset; this.materials = materials;
        this.applyVisibility(); this.present();
      } catch (error) { disposeGoopAsset(root, this.environment); throw error; }
    });
    this.preparation = pending;
    void pending.finally(() => { if (this.preparation === pending) this.preparation = undefined; }).catch(() => {});
    return pending;
  }

  setPosition(position: Vector3State): void { this.position.set(position.x, position.y, position.z); this.character.position.copy(this.position); }
  setYaw(yaw: number): void { this.yaw = this.previousYaw = this.targetYaw = yaw; this.present(); }
  setAimDirection(direction: Vector3State): void {
    if (direction.x * direction.x + direction.z * direction.z > 1e-8) this.targetYaw = Math.atan2(-direction.x, -direction.z);
  }
  setVisible(visible: boolean): void { this.requestedVisible = visible; this.applyVisibility(); }
  setOpacity(opacity: number): void { this.opacity = THREE.MathUtils.clamp(opacity, 0, 1); this.materials?.setOpacity(this.opacity); this.applyVisibility(); }
  setShadowCasting(enabled: boolean): void { this.shadows = enabled; this.applyVisibility(); }
  setReflectionEnvironment(environment: THREE.Texture | null): void { this.environment = environment; this.materials?.setReflectionEnvironment(environment); }
  setReflectionIntensity(body: number, eyes: number, snap = false): void {
    this.bodyReflection = body; this.eyeReflection = eyes;
    this.materials?.setReflectionIntensity(body, eyes, snap || this.reflectionSnapPending);
    this.reflectionSnapPending = false;
  }
  async prepareCameraFadePrograms(compile: () => unknown | Promise<unknown>): Promise<void> {
    const opacity = this.opacity;
    this.setOpacity(0.5);
    try { await compile(); } finally { this.setOpacity(opacity); }
  }

  update(deltaSeconds: number, state: GoopCharacterPresentationState): void {
    if (this.disposed || this.deathActive) return;
    const dt = Math.max(0, deltaSeconds);
    this.previousYaw = this.yaw; this.previousSquash = this.squash;
    this.travel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z).sub(this.previousTravel);
    this.previousTravel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z);
    if (!this.seededTravel) this.travel.set(0, 0, 0);
    this.seededTravel = true;
    this.speed = dt > 0 ? Math.hypot(this.travel.x, this.travel.z) / dt : 0;
    const intent = state.movementIntentWorld;
    if (this.speed > 0.08 && this.speed < 20 && intent.x * intent.x + intent.z * intent.z > 0.01) {
      this.targetYaw = Math.atan2(-this.travel.x, -this.travel.z);
    }
    this.yaw = moveAngleTowards(this.yaw, this.targetYaw, Math.PI * 3 * dt);
    this.grounded = state.grounded;
    this.launchRemaining = Math.max(0, this.launchRemaining - dt);
    this.landingRemaining = Math.max(0, this.landingRemaining - dt);
    this.squash = this.landingRemaining > 0
      ? 0.065 * this.landingStrength * Math.sin(Math.PI * this.landingRemaining / 0.28)
      : -0.045 * Math.sin(Math.PI * this.launchRemaining / 0.18);
    this.materials?.update(dt);
  }

  present(alpha = 1): void {
    this.character.position.copy(this.position);
    this.character.rotation.y = this.previousYaw + shortestAngleDelta(this.previousYaw, this.yaw) * THREE.MathUtils.clamp(alpha, 0, 1);
    const squash = THREE.MathUtils.lerp(this.previousSquash, this.squash, THREE.MathUtils.clamp(alpha, 0, 1));
    this.shape.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  }
  onLanding(_normal: Vector3State, impactSpeed: number): void {
    if (this.deathActive || this.disposed) return;
    this.landingStrength = THREE.MathUtils.clamp((impactSpeed - 1.5) / 7, 0, 1);
    this.landingRemaining = 0.28; this.launchRemaining = 0;
    this.materials?.setImpact(new THREE.Vector3(0, -0.32, 0), this.landingStrength);
  }
  onLaunch(_launch: SlimePresentationLaunch): void {
    if (this.deathActive || this.disposed) return;
    this.launchRemaining = 0.18; this.landingRemaining = 0;
  }
  primeDeathResources(position: Vector3State, render: (root: THREE.Object3D) => void): boolean { return this.burst.primeResources(position, render); }
  startDeath(position: Vector3State): boolean {
    if (this.disposed || this.deathActive || !this.burst.start(position)) return false;
    this.deathActive = true; this.deathElapsed = 0;
    this.setPosition(position); this.setOpacity(1);
    this.burst.root.visible = false; this.applyVisibility();
    return true;
  }
  updateDeath(deltaSeconds: number): void {
    if (!this.deathActive) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) throw new Error('Goop death delta must be positive and finite');
    const previous = this.deathElapsed;
    this.deathElapsed += deltaSeconds;
    const burstDelta = this.deathElapsed - Math.max(previous, 0.075);
    if (burstDelta > 1e-9) this.burst.update(burstDelta);
    this.burst.root.visible = this.deathElapsed >= 0.075 && this.burst.diagnostics.active;
    this.applyVisibility();
  }
  finishDeath(position: Vector3State): void { this.setPosition(position); this.reset(); }
  reset(): void {
    this.deathActive = false; this.deathElapsed = 0; this.burst.reset();
    this.launchRemaining = this.landingRemaining = this.squash = this.previousSquash = this.speed = 0;
    this.seededTravel = false; this.yaw = this.previousYaw = this.targetYaw = 0;
    this.reflectionSnapPending = true;
    this.materials?.reset(); this.opacity = 1; this.requestedVisible = true;
    this.applyVisibility(); this.present();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.asset) disposeGoopAsset(this.asset.root, this.environment);
    this.asset = undefined; this.materials = undefined;
    this.burst.dispose(); this.root.removeFromParent(); this.root.clear(); this.applyVisibility();
  }
  private applyVisibility(): void {
    this.character.visible = this.ready && this.requestedVisible && this.opacity > 0 && (!this.deathActive || this.deathElapsed < 0.075);
    if (this.asset) for (const mesh of [this.asset.body, ...this.asset.eyes]) mesh.castShadow = this.shadows && this.character.visible;
  }
}
