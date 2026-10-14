import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { moveAngleTowards, shortestAngleDelta } from '../BlobFacing.ts';
import { SlimeBurstPresentation } from '../slime/SlimeBurstPresentation.ts';
import type { Vector3State, SlimePresentationLaunch } from '../slime/SlimePresentationContract.ts';
import { disposeVoltAsset, disposeVoltMaterials, validateVoltAsset, VOLT_MORPHS, type VoltAsset, type VoltWeights } from './VoltAsset.ts';
import { VOLT_BASE_COLOR, VoltMaterialSet } from './VoltMaterials.ts';

const ASSET_URL = new URL('../../../assets/characters/volt/volt.glb', import.meta.url).href;
export type VoltCharacterLoader = () => Promise<THREE.Group>;
export interface VoltCharacterPresentationState {
  readonly locomotionPositionWorld: Vector3State;
  readonly velocityWorld: Vector3State;
  readonly maximumLocomotionSpeedMetresPerSecond: number;
  movementIntentWorld: Vector3State;
  grounded: boolean;
}

/** Per-instance authored gel. Placement, facing and burst are separate so a
 * level-owned navigation light follows placement even while aiming or fading. */
export class VoltCharacterPresentation {
  readonly root = new THREE.Group();
  readonly radiusMetres: number;
  readonly placement = new THREE.Group();
  private readonly character = new THREE.Group();
  private readonly burst = new SlimeBurstPresentation(VOLT_BASE_COLOR);
  private readonly previousTravel = new THREE.Vector3();
  private readonly travel = new THREE.Vector3();
  private asset: VoltAsset | undefined;
  private materials: VoltMaterialSet | undefined;
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
  private aimYaw: number | undefined;
  private seededTravel = false;
  private speed = 0;
  private previousLateralSpeed = 0;
  private grounded = true;
  private bodyWeight = 0;
  private previousBodyWeight = 0;
  private flex = 0;
  private previousFlex = 0;
  private blink = 0;
  private previousBlink = 0;
  private blinkClock = 0;
  private blinkCount = 0;
  private nextBlink = 3.7;
  private launchRemaining = 0;
  private landingRemaining = 0;
  private landingStrength = 0;
  private damageRemaining = 0;
  private damageStrength = 0;
  private deathActive = false;
  private deathElapsed = 0;
  private readonly weights: VoltWeights = { Squash: 0, Stretch: 0, Blink: 0, CrestFlexLeft: 0, CrestFlexRight: 0 };

  constructor(radiusMetres = 0.45) {
    if (Math.abs(radiusMetres - 0.45) > 1e-6) throw new Error('Volt requires the approved 0.45 m radius');
    this.radiusMetres = radiusMetres;
    this.root.name = 'player-slime-volt-presentation';
    this.placement.name = 'player-slime-volt-placement';
    this.character.name = 'player-slime-volt-character';
    this.placement.add(this.character); this.root.add(this.placement, this.burst.root);
    this.applyVisibility();
  }
  get ready(): boolean { return !!this.asset && !this.disposed; }
  get diagnostics() {
    return { ready: this.ready, requestedVisible: this.requestedVisible, visible: this.character.visible,
      opacity: this.opacity, facingYawRadians: this.yaw, targetYawRadians: this.targetYaw, speed: this.speed,
      grounded: this.grounded, motionSeeded: this.seededTravel, weights: { ...this.weights },
      meshes: this.asset ? [this.asset.body, ...this.asset.eyes].map(mesh => ({ name: mesh.name,
        vertices: mesh.geometry.getAttribute('position').count, triangles: mesh.geometry.index!.count / 3,
        weights: Object.fromEntries(VOLT_MORPHS.map(name => [name, mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]]])),
        castShadow: mesh.castShadow })) : [],
      shadowCasting: this.shadows && this.character.visible, deathActive: this.deathActive,
      deathBurst: this.burst.diagnostics, materials: this.materials?.diagnostics,
      asset: this.asset ? { triangles: 38208, drawCalls: 3, geometries: 3, materials: 2 } : undefined };
  }
  prepare(loader: VoltCharacterLoader = async () => {
    const gltf = await new GLTFLoader().loadAsync(ASSET_URL);
    gltf.scene.animations = gltf.animations; return gltf.scene;
  }): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Cannot prepare disposed Volt'));
    if (this.ready) return Promise.resolve();
    if (this.preparation) return this.preparation;
    const pending = Promise.resolve().then(loader).then(root => {
      let materials: VoltMaterialSet | undefined;
      try {
        if (this.disposed) { disposeVoltAsset(root); return; }
        const asset = validateVoltAsset(root);
        const imported = new Set<THREE.Material>([asset.body.material, ...asset.eyes.map(eye => eye.material)].flat());
        materials = new VoltMaterialSet(...asset.maps);
        materials.setOpacity(this.opacity); materials.setReflectionEnvironment(this.environment);
        materials.setReflectionIntensity(this.bodyReflection, this.eyeReflection, true);
        asset.body.material = materials.body;
        asset.body.customDepthMaterial = materials.bodyDepth; asset.body.customDistanceMaterial = materials.bodyDistance;
        for (const eye of asset.eyes) {
          eye.material = materials.eyes; eye.customDepthMaterial = materials.eyeDepth;
          eye.customDistanceMaterial = materials.eyeDistance; eye.userData.cameraFadeEye = true;
        }
        for (const mesh of [asset.body, ...asset.eyes]) {
          mesh.receiveShadow = true;
          // Three includes individual morph bounds. Pad for simultaneous legal
          // body/blink/flex states without altering the gameplay sphere.
          mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
          mesh.geometry.boundingBox!.expandByScalar(0.25); mesh.geometry.boundingSphere!.radius += 0.25;
        }
        disposeVoltMaterials(imported, new Set(asset.maps));
        this.character.add(root); this.asset = asset; this.materials = materials;
        this.applyVisibility(); this.present();
      } catch (error) {
        if (materials) {
          // Replacement can fail before every shadow variant has attached.
          const owned = new Set<THREE.Material>([materials.body, materials.eyes, materials.bodyDepth,
            materials.bodyDistance, materials.eyeDepth, materials.eyeDistance]);
          root.traverse(object => { if (object instanceof THREE.Mesh) {
            for (const m of [object.material].flat()) owned.add(m);
            object.geometry.dispose();
          } });
          disposeVoltMaterials(owned, new Set(this.environment ? [this.environment] : []));
          root.removeFromParent(); root.clear();
        } else disposeVoltAsset(root, this.environment);
        throw error;
      }
    });
    this.preparation = pending;
    void pending.finally(() => { if (this.preparation === pending) this.preparation = undefined; }).catch(() => {});
    return pending;
  }
  setPosition(position: Vector3State): void { this.placement.position.set(position.x, position.y, position.z); }
  setYaw(yaw: number): void { this.yaw = this.previousYaw = this.targetYaw = yaw; this.present(); }
  setAimDirection(direction?: Vector3State): void {
    if (!direction) { this.aimYaw = undefined; return; }
    if (direction.x * direction.x + direction.z * direction.z > 1e-8) this.aimYaw = this.targetYaw = Math.atan2(-direction.x, -direction.z);
  }
  setVisible(visible: boolean): void { this.requestedVisible = visible; this.applyVisibility(); }
  setOpacity(opacity: number): void { this.opacity = THREE.MathUtils.clamp(opacity, 0, 1); this.materials?.setOpacity(this.opacity); this.applyVisibility(); }
  setShadowCasting(enabled: boolean): void { this.shadows = enabled; this.applyVisibility(); }
  setReflectionEnvironment(environment: THREE.Texture | null): void { this.environment = environment; this.materials?.setReflectionEnvironment(environment); }
  setReflectionIntensity(body: number, eyes: number, snap = false): void {
    this.bodyReflection = body; this.eyeReflection = eyes;
    this.materials?.setReflectionIntensity(body, eyes, snap || this.reflectionSnapPending); this.reflectionSnapPending = false;
  }
  async prepareCameraFadePrograms(compile: () => unknown | Promise<unknown>): Promise<void> {
    const opacity = this.opacity; this.setOpacity(0.5);
    try { await compile(); } finally { this.setOpacity(opacity); }
  }
  update(deltaSeconds: number, state: VoltCharacterPresentationState): void {
    if (this.disposed || this.deathActive || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const dt = deltaSeconds;
    this.previousYaw = this.yaw; this.previousBodyWeight = this.bodyWeight; this.previousFlex = this.flex; this.previousBlink = this.blink;
    this.travel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z).sub(this.previousTravel);
    this.previousTravel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z);
    if (!this.seededTravel) this.travel.set(0, 0, 0);
    this.seededTravel = true;
    this.speed = Math.hypot(this.travel.x, this.travel.z) / dt;
    const intent = state.movementIntentWorld;
    const moving = intent.x * intent.x + intent.z * intent.z > 0.01 && this.speed > 0.08 &&
      this.speed <= state.maximumLocomotionSpeedMetresPerSecond * 1.5;
    if (this.aimYaw !== undefined) this.targetYaw = this.aimYaw;
    else if (moving) this.targetYaw = Math.atan2(-this.travel.x, -this.travel.z);
    const turn = shortestAngleDelta(this.yaw, this.targetYaw);
    this.yaw = moveAngleTowards(this.yaw, this.targetYaw, Math.min(Math.abs(turn) * (1 - Math.exp(-16 * dt)), Math.PI * 3 * dt));
    if (Math.abs(shortestAngleDelta(this.yaw, this.targetYaw)) < 1e-5) this.yaw = this.targetYaw;
    const lateral = moving ? (Math.cos(this.yaw) * this.travel.x - Math.sin(this.yaw) * this.travel.z) / dt : 0;
    const targetFlex = moving ? THREE.MathUtils.clamp(-(lateral - this.previousLateralSpeed) * 0.006 / dt -
      shortestAngleDelta(this.previousYaw, this.yaw) * 0.018 / dt, -0.5, 0.5) : 0;
    this.previousLateralSpeed = lateral;
    this.flex += (targetFlex - this.flex) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.flex) < 1e-5) this.flex = 0;
    this.grounded = state.grounded;
    this.launchRemaining = Math.max(0, this.launchRemaining - dt);
    this.landingRemaining = Math.max(0, this.landingRemaining - dt);
    this.damageRemaining = Math.max(0, this.damageRemaining - dt);
    // Signed body weight makes squash/stretch mutually exclusive even during interpolation.
    this.bodyWeight = this.landingRemaining > 0 && state.grounded
      ? 0.45 * this.landingStrength * this.landingRemaining / 0.3
      : !state.grounded && this.launchRemaining > 0 ? -0.4 * this.launchRemaining / 0.22 : 0;
    if (this.damageRemaining > 0) this.bodyWeight = Math.max(this.bodyWeight, 0.18 * this.damageStrength * this.damageRemaining / 0.2);
    this.blinkClock += dt;
    if (this.blinkClock >= this.nextBlink + 0.18) {
      this.blinkClock = 0; this.nextBlink = 3.7 + (++this.blinkCount % 3) * 0.61;
    }
    this.blink = this.blinkClock >= this.nextBlink ? Math.sin(Math.PI * (this.blinkClock - this.nextBlink) / 0.18) : 0;
    this.materials?.update(dt); this.present(1);
  }
  present(alpha = 1): void {
    const blend = THREE.MathUtils.clamp(alpha, 0, 1);
    this.character.rotation.y = this.previousYaw + shortestAngleDelta(this.previousYaw, this.yaw) * blend;
    const body = THREE.MathUtils.lerp(this.previousBodyWeight, this.bodyWeight, blend);
    const flex = THREE.MathUtils.lerp(this.previousFlex, this.flex, blend);
    this.weights.Squash = THREE.MathUtils.clamp(body, 0, 1); this.weights.Stretch = THREE.MathUtils.clamp(-body, 0, 1);
    this.weights.Blink = THREE.MathUtils.clamp(THREE.MathUtils.lerp(this.previousBlink, this.blink, blend), 0, 1);
    this.weights.CrestFlexLeft = THREE.MathUtils.clamp(flex, 0, 1); this.weights.CrestFlexRight = THREE.MathUtils.clamp(-flex, 0, 1);
    if (this.asset) for (const mesh of [this.asset.body, ...this.asset.eyes]) for (const name of VOLT_MORPHS) {
      mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]] = this.weights[name];
    }
  }
  onLaunch(_launch: SlimePresentationLaunch): void {
    if (this.disposed || this.deathActive) return;
    this.launchRemaining = 0.22; this.landingRemaining = 0;
  }
  onLanding(_normal: Vector3State, impactSpeed: number): void {
    if (this.disposed || this.deathActive) return;
    this.landingRemaining = 0.3; this.launchRemaining = 0;
    this.landingStrength = THREE.MathUtils.clamp((impactSpeed - 1.5) / 7, 0, 1);
  }
  onDamage(strength: number): void {
    if (this.disposed || this.deathActive) return;
    this.damageRemaining = 0.2; this.damageStrength = THREE.MathUtils.clamp(strength, 0, 1);
  }
  primeDeathResources(position: Vector3State, render: (root: THREE.Object3D) => void): boolean { return this.burst.primeResources(position, render); }
  startDeath(position: Vector3State): boolean {
    if (this.disposed || this.deathActive || !this.burst.start(position)) return false;
    this.deathActive = true; this.deathElapsed = 0; this.setPosition(position); this.setOpacity(1);
    this.burst.root.visible = false; this.applyVisibility(); return true;
  }
  updateDeath(deltaSeconds: number): void {
    if (!this.deathActive) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) throw new Error('Volt death delta must be positive and finite');
    const previous = this.deathElapsed; this.deathElapsed += deltaSeconds;
    const burstDelta = this.deathElapsed - Math.max(previous, 0.075);
    if (burstDelta > 1e-9) this.burst.update(burstDelta);
    this.burst.root.visible = this.deathElapsed >= 0.075 && this.burst.diagnostics.active; this.applyVisibility();
  }
  finishDeath(position: Vector3State): void { this.setPosition(position); this.reset(); }
  reset(): void {
    this.deathActive = false; this.deathElapsed = 0; this.burst.reset();
    this.yaw = this.previousYaw = this.targetYaw = this.bodyWeight = this.previousBodyWeight = this.flex = this.previousFlex = 0;
    this.blink = this.previousBlink = this.blinkClock = this.blinkCount = this.speed = this.previousLateralSpeed = 0;
    this.nextBlink = 3.7; this.launchRemaining = this.landingRemaining = this.damageRemaining = this.damageStrength = this.landingStrength = 0;
    this.aimYaw = undefined; this.seededTravel = false; this.grounded = true; this.reflectionSnapPending = true;
    this.materials?.reset(); this.opacity = 1; this.requestedVisible = true; this.applyVisibility(); this.present();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.asset) disposeVoltAsset(this.asset.root, this.environment);
    this.asset = undefined; this.materials = undefined;
    this.burst.dispose(); this.root.removeFromParent(); this.root.clear(); this.applyVisibility();
  }
  private applyVisibility(): void {
    this.character.visible = this.ready && this.requestedVisible && this.opacity > 0 && (!this.deathActive || this.deathElapsed < 0.075);
    if (this.asset) for (const mesh of [this.asset.body, ...this.asset.eyes]) { mesh.castShadow = this.shadows && this.character.visible; mesh.userData.characterShadowCaster = this.shadows; }
  }
}
