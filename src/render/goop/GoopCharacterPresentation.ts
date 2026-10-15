import type { GelRendering } from '../slime/GelRendering.ts';
import * as THREE from 'three';
import { loadCharacterAsset } from '../slime/LoadCharacterAsset.ts';
import { moveAngleTowards, shortestAngleDelta } from '../BlobFacing.ts';
import { SlimeBurstPresentation } from '../slime/SlimeBurstPresentation.ts';
import type { Vector3State, SlimePresentationLaunch } from '../slime/SlimePresentationContract.ts';
import { disposeGoopAsset, disposeGoopMaterials, validateGoopAsset, type GoopAsset } from './GoopAsset.ts';
import { GOOP_BASE_COLOR, GoopMaterialSet } from './GoopMaterials.ts';
import { GOOP_MAXIMUM_BASE_OFFSET_METRES, GOOP_MAXIMUM_JUMP_BASE_OFFSET_METRES, GOOP_MAXIMUM_BASE_DISPLACEMENT_METRES } from './GoopBaseMotion.ts';
import { GoopPolishMotion, GOOP_CREST_LAG_METRES, GOOP_LANDING_RIPPLE_METRES } from './GoopPolishMotion.ts';
import { GEL_LAUNCH_SECONDS, GEL_LANDING_SECONDS, gelLandingSquash, gelAirborneStretch } from '../slime/GelElasticMotion.ts';

const ASSET_URL = new URL('../../../assets/characters/goop/goop.glb', import.meta.url).href;
const LAUNCH_SECONDS = GEL_LAUNCH_SECONDS;
const LANDING_SECONDS = GEL_LANDING_SECONDS;
const DAMAGE_SECONDS = 0.22;
// Bob's ground response and brief reversal counterlean, with continuous facing.
const LOCOMOTION_RESPONSE = 11;
const LOCOMOTION_SETTLE = 7;
const BASE_RESPONSE = 12;
const START_SPEED = 0.16;
const STOP_SPEED = 0.08;
const FACING_RESPONSE = 16;
const FACING_SETTLE_EPSILON = 1e-5;
const REVERSAL_FINISH_ANGLE = THREE.MathUtils.degToRad(5);
const REVERSAL_ANGLE = THREE.MathUtils.degToRad(120);
const REVERSAL_HOLD_SECONDS = 0.16;
const TURN_SPEED = THREE.MathUtils.degToRad(540);
export type GoopCharacterLoader = () => Promise<THREE.Group>;
export interface GoopCharacterPresentationState {
  readonly locomotionPositionWorld: Vector3State;
  readonly velocityWorld: Vector3State;
  readonly maximumLocomotionSpeedMetresPerSecond: number;
  movementIntentWorld: Vector3State;
  grounded: boolean;
}

/** Visual-only elastic body motion, seated eyes, and a trailing ground skirt. */
export class GoopCharacterPresentation {
  readonly root = new THREE.Group();
  readonly radiusMetres: number;
  private readonly gelRendering: GelRendering | undefined;
  private readonly character = new THREE.Group();
  private readonly shape = new THREE.Group();
  private readonly burst = new SlimeBurstPresentation(GOOP_BASE_COLOR);
  private readonly polish = new GoopPolishMotion();
  private readonly recoil = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly previousTravel = new THREE.Vector3();
  private readonly travel = new THREE.Vector3();
  private readonly previousBaseOffsetWorld = new THREE.Vector3();
  private readonly baseOffsetWorld = new THREE.Vector3();
  private readonly presentedBaseOffsetWorld = new THREE.Vector3();
  private readonly targetBaseOffsetWorld = new THREE.Vector3();
  private readonly impactNormal = new THREE.Vector3(0, 1, 0);
  private readonly impactPoint = new THREE.Vector3();
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
  private moving = false;
  private hasTravelHeading = false;
  private reversing = false;
  private reversalRemaining = 0;
  private previousLean = 0;
  private lean = 0;
  private grounded = true;
  private launchRemaining = 0;
  private launchStrength = 0;
  private landingRemaining = 0;
  private landingStrength = 0;
  private damageRemaining = 0;
  private damageStrength = 0;
  private impactPending = false;
  private impactStrength = 0;
  private previousSquash = 0;
  private squash = 0;
  private deathActive = false;
  private deathElapsed = 0;

  constructor(radiusMetres = 0.45, gelRendering?: GelRendering) {
    if (Math.abs(radiusMetres - 0.45) > 1e-6) throw new Error('Goop requires the approved 0.45 m radius');
    this.radiusMetres = radiusMetres;
    this.gelRendering = gelRendering;
    this.root.name = 'player-slime-goop-presentation';
    this.character.name = 'player-slime-goop-character';
    this.shape.name = 'goop-sole-pivot';
    this.shape.position.y = -0.45;
    this.shape.matrixAutoUpdate = false;
    this.character.add(this.shape);
    this.root.add(this.character, this.burst.root);
    this.applyVisibility();
  }

  get ready(): boolean { return !!this.asset && !this.disposed; }
  get diagnostics() {
    return { ready: this.ready, visible: this.character.visible, opacity: this.opacity,
      facingYawRadians: this.yaw, speed: this.speed, grounded: this.grounded,
      locomotionStrength: Math.abs(this.lean), signedLean: this.lean, reversing: this.reversing,
      baseMotionStrength: Math.hypot(this.baseOffsetWorld.x, this.baseOffsetWorld.z) / GOOP_MAXIMUM_BASE_OFFSET_METRES,
      jumpBaseOffsetMetres: this.baseOffsetWorld.y,
      baseOffsetWorld: { x: this.baseOffsetWorld.x, y: this.baseOffsetWorld.y, z: this.baseOffsetWorld.z },
      polish: this.polish.diagnostics,
      squash: Math.max(0, this.squash), stretch: Math.max(0, -this.squash),
      shadowCasting: this.shadows && this.character.visible,
      deathActive: this.deathActive, deathBurst: this.burst.diagnostics,
      materials: this.materials?.diagnostics,
      asset: this.asset ? { bodyTriangles: 26804, eyeTriangles: 6912, drawCalls: 3, geometries: 3, materials: 2 } : undefined };
  }

  prepare(loader: GoopCharacterLoader = () => loadCharacterAsset(ASSET_URL)): Promise<void> {
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
        const materials = new GoopMaterialSet(this.gelRendering);
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
          const displacement = 0.0045 + (mesh === asset.body
            ? GOOP_MAXIMUM_BASE_DISPLACEMENT_METRES + GOOP_CREST_LAG_METRES + GOOP_LANDING_RIPPLE_METRES : 0);
          mesh.geometry.boundingBox!.expandByScalar(displacement);
          // Matrix4's scale estimate omits shear. Pad the sphere for the
          // maximum lean as well as the protected surface waves.
          mesh.geometry.boundingSphere!.radius = (mesh.geometry.boundingSphere!.radius + displacement) * 1.16;
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
  setYaw(yaw: number): void {
    this.yaw = this.previousYaw = this.targetYaw = yaw;
    this.reversing = false; this.reversalRemaining = 0; this.hasTravelHeading = false;
    this.present();
  }
  setAimDirection(direction: Vector3State): void {
    if (direction.x * direction.x + direction.z * direction.z > 1e-8) {
      this.targetYaw = Math.atan2(-direction.x, -direction.z);
      this.reversing = false; this.reversalRemaining = 0;
    }
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
    this.previousYaw = this.yaw; this.previousSquash = this.squash; this.previousLean = this.lean;
    this.previousBaseOffsetWorld.copy(this.baseOffsetWorld);
    this.travel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z).sub(this.previousTravel);
    this.previousTravel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z);
    if (!this.seededTravel) this.travel.set(0, 0, 0);
    this.seededTravel = true;
    this.speed = dt > 0 ? Math.hypot(this.travel.x, this.travel.z) / dt : 0;
    const intent = state.movementIntentWorld;
    const maximumSpeed = Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6);
    // Travel excludes carrier transport. Intent and the speed bound also keep
    // passive motion and discontinuities from becoming a locomotion pose.
    const activeTravel = this.speed <= maximumSpeed * 1.5 &&
      intent.x * intent.x + intent.z * intent.z > 0.01;
    if (!state.grounded || !activeTravel || this.speed <= STOP_SPEED) this.moving = false;
    else if (this.speed >= START_SPEED) this.moving = true;
    if (this.moving) {
      const desiredYaw = Math.atan2(-this.travel.x, -this.travel.z);
      const hadHeading = this.hasTravelHeading;
      // Follow every resolved heading. A heading dead zone made gentle turns
      // hold still and then jump in five-degree steps, even with interpolation.
      this.targetYaw = desiredYaw;
      this.hasTravelHeading = true;
      if (hadHeading && !this.reversing && Math.abs(shortestAngleDelta(this.yaw, this.targetYaw)) >= REVERSAL_ANGLE) {
        this.reversing = true; this.reversalRemaining = REVERSAL_HOLD_SECONDS;
      }
    }
    this.reversalRemaining = Math.max(0, this.reversalRemaining - dt);
    if (!this.reversing || this.reversalRemaining === 0) {
      const delta = shortestAngleDelta(this.yaw, this.targetYaw);
      const dampedStep = Math.abs(delta) * (1 - Math.exp(-FACING_RESPONSE * dt));
      this.yaw = moveAngleTowards(this.yaw, this.targetYaw, Math.min(dampedStep, TURN_SPEED * dt));
      const remaining = Math.abs(shortestAngleDelta(this.yaw, this.targetYaw));
      if (remaining < FACING_SETTLE_EPSILON) this.yaw = this.targetYaw;
      if (remaining < REVERSAL_FINISH_ANGLE) this.reversing = false;
    }
    const signedSpeed = dt > 0 ? (-Math.sin(this.yaw) * this.travel.x - Math.cos(this.yaw) * this.travel.z) / dt : 0;
    const targetLean = this.moving ? THREE.MathUtils.clamp(signedSpeed / maximumSpeed, -1, 1) : 0;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-(targetLean === 0 ? LOCOMOTION_SETTLE : LOCOMOTION_RESPONSE) * dt));
    if (Math.abs(this.lean) < 1e-5) this.lean = 0;
    this.targetBaseOffsetWorld.set(0, 0, 0);
    const trailingTravel = this.moving || (!state.grounded && activeTravel && this.speed > STOP_SPEED);
    if (trailingTravel && dt > 0) {
      this.targetBaseOffsetWorld.copy(this.travel).setY(0)
        .multiplyScalar(-GOOP_MAXIMUM_BASE_OFFSET_METRES / (maximumSpeed * dt))
        .clampLength(0, GOOP_MAXIMUM_BASE_OFFSET_METRES);
    }
    if (!state.grounded) {
      // As with ground travel, the lower gel trails the body's motion. Relax
      // through the apex, then let it lag upward during the descent.
      this.targetBaseOffsetWorld.y = -GOOP_MAXIMUM_JUMP_BASE_OFFSET_METRES *
        THREE.MathUtils.clamp(state.velocityWorld.y / 6, -1, 1);
    }
    this.baseOffsetWorld.lerp(this.targetBaseOffsetWorld, 1 - Math.exp(-BASE_RESPONSE * dt));
    if (state.grounded) {
      // Every render sample plants the sole as soon as the body lands.
      this.baseOffsetWorld.y = this.previousBaseOffsetWorld.y = 0;
    }
    for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(this.baseOffsetWorld[axis]) < 1e-6) this.baseOffsetWorld[axis] = 0;
    this.grounded = state.grounded;
    const wasLanding = this.landingRemaining > 0;
    this.launchRemaining = Math.max(0, this.launchRemaining - dt);
    this.landingRemaining = Math.max(0, this.landingRemaining - dt);
    this.damageRemaining = Math.max(0, this.damageRemaining - dt);
    if (this.grounded) {
      this.launchRemaining = 0;
      if (this.landingRemaining > 0) {
        const age = LANDING_SECONDS - this.landingRemaining;
        // Compress at contact, release, then give the gel one small overshoot.
        // This is a visual recovery; the kinematic body stays on its support.
        this.squash = gelLandingSquash(age, this.landingStrength);
      } else {
        this.squash = wasLanding ? 0 : this.squash * Math.exp(-LOCOMOTION_RESPONSE * dt);
        if (Math.abs(this.squash) < 1e-5) this.squash = 0;
      }
    } else {
      this.landingRemaining = 0;
      const stretch = gelAirborneStretch(state.velocityWorld.y, this.launchStrength, this.launchRemaining);
      this.squash += (-stretch - this.squash) * (1 - Math.exp(-18 * dt));
    }
    if (this.damageRemaining > 0) {
      this.squash = Math.max(this.squash, 0.08 * this.damageStrength * this.damageRemaining / DAMAGE_SECONDS);
    }
    this.polish.update(dt, shortestAngleDelta(this.previousYaw, this.yaw), this.grounded, this.character.visible);
    this.materials?.update(dt);
  }

  present(alpha = 1): void {
    this.character.position.copy(this.position);
    const blend = THREE.MathUtils.clamp(alpha, 0, 1);
    this.character.rotation.y = this.previousYaw + shortestAngleDelta(this.previousYaw, this.yaw) * blend;
    const squash = THREE.MathUtils.lerp(this.previousSquash, this.squash, blend);
    const lean = THREE.MathUtils.lerp(this.previousLean, this.lean, blend);
    this.presentedBaseOffsetWorld.lerpVectors(this.previousBaseOffsetWorld, this.baseOffsetWorld, blend);
    this.materials?.setBaseOffset(this.presentedBaseOffsetWorld, this.character.rotation.y);
    if (this.materials) this.polish.present(this.materials, blend);
    this.polish.copyRecoil(blend, this.recoil);
    this.recoil.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.character.rotation.y);
    const leanShear = (lean >= 0 ? 0.28 : 0.22) * lean;
    const height = 1 - squash - Math.abs(lean) * 0.025 - this.polish.recoilCompression(blend);
    const spread = 1 / Math.sqrt(height);
    this.shape.scale.set(spread, height, spread);
    // Shear toward local -Z rather than rotating the skirt into the floor.
    // One volume-preserving transform keeps eyes seated and spikes cohesive;
    // its inverse-transpose also supplies correct surface and shadow normals.
    this.shape.matrix.set(
      spread, this.recoil.x, 0, 0,
      0, height, 0, -this.radiusMetres,
      0, -leanShear + this.recoil.z, spread, 0,
      0, 0, 0, 1,
    );
    this.shape.matrixWorldNeedsUpdate = true;
    if (this.impactPending && this.asset && this.materials) {
      this.impactPoint.copy(this.impactNormal).multiplyScalar(-this.radiusMetres).add(this.position);
      this.asset.body.worldToLocal(this.impactPoint);
      this.materials.setImpact(this.impactPoint, this.impactStrength);
      this.impactPending = false;
    }
  }
  onLanding(normal: Vector3State, impactSpeed: number): void {
    if (this.deathActive || this.disposed) return;
    this.polish.onLanding(impactSpeed);
    this.landingStrength = THREE.MathUtils.clamp((impactSpeed - 1.5) / 7, 0, 1);
    this.landingRemaining = LANDING_SECONDS; this.launchRemaining = 0;
    this.impactNormal.set(normal.x, normal.y, normal.z).normalize();
    this.impactStrength = this.landingStrength; this.impactPending = true;
  }
  onLaunch(launch: SlimePresentationLaunch): void {
    if (this.deathActive || this.disposed) return;
    this.launchRemaining = LAUNCH_SECONDS; this.landingRemaining = 0;
    this.launchStrength = THREE.MathUtils.clamp(launch.speedMetresPerSecond / 6, 0, 1);
  }
  onDamage(strength: number): void {
    if (this.deathActive || this.disposed) return;
    this.polish.onDamage(strength);
    this.damageRemaining = DAMAGE_SECONDS;
    this.damageStrength = THREE.MathUtils.clamp(strength, 0, 1);
  }
  onAcidFired(direction: Vector3State): void {
    if (this.deathActive || this.disposed) return;
    this.polish.onAcidFired(direction);
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
    this.polish.reset();
    this.deathActive = false; this.deathElapsed = 0; this.burst.reset();
    this.launchRemaining = this.landingRemaining = this.squash = this.previousSquash = this.speed = 0;
    this.launchStrength = this.landingStrength = this.damageRemaining = this.damageStrength = 0;
    this.lean = this.previousLean = this.reversalRemaining = this.impactStrength = 0;
    this.baseOffsetWorld.set(0, 0, 0); this.previousBaseOffsetWorld.set(0, 0, 0);
    this.moving = this.hasTravelHeading = this.reversing = this.impactPending = false;
    this.grounded = true; this.impactNormal.set(0, 1, 0);
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
