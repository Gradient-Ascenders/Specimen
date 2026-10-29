import * as THREE from 'three';
import { CameraBodyVisibility } from '../CameraBodyVisibility.ts';
import type { CameraRig, CameraFollowTarget } from '../CameraRig.ts';
import { moveAngleTowards, shortestAngleDelta } from '../BlobFacing.ts';
import type { GelRendering } from '../slime/GelRendering.ts';
import { SlimeBurstPresentation } from '../slime/SlimeBurstPresentation.ts';
import type { SlimePresentationLaunch, Vector3State } from '../slime/SlimePresentationContract.ts';
import { GEL_LANDING_SECONDS, GEL_LAUNCH_SECONDS, gelAirborneStretch, gelLandingSquash } from '../slime/GelElasticMotion.ts';
import { disposeSpecimenAsset, loadSpecimenAsset, SPECIMEN_RESTING_SOLE, SPECIMEN_TRIANGLES,
  validateSpecimenAsset, type SpecimenAsset } from './SpecimenAsset.ts';
import { SpecimenMaterials } from './SpecimenMaterials.ts';
import { SpecimenTrail } from './SpecimenTrail.ts';
import { SpecimenActionEffects } from './SpecimenActionEffects.ts';
import { CharacterDetail, loadCharacterDetail, type CharacterDetailIndices } from '../slime/CharacterDetail.ts';

export const SPECIMEN_DETAIL_URL = new URL('../../assets/characters/specimen-lod.bin', import.meta.url).href;

export interface SpecimenCharacterState {
  readonly position: Vector3State;
  readonly locomotionPosition: Vector3State;
  readonly velocity: Vector3State;
  readonly maximumLocomotionSpeedMetresPerSecond: number;
  readonly gameplayUp: Vector3State;
  readonly grounded: boolean;
  readonly attached?: boolean;
  readonly landedThisStep: boolean;
  readonly chargingJump: boolean;
  readonly chargeFraction: number;
}
export interface SpecimenCharacterAttack {
  readonly aimActive: boolean;
  readonly charging?: boolean;
  readonly aimDirection: Vector3State;
  readonly chargeAmount: number;
  readonly overchargeProgress?: number;
  readonly overchargeReady?: boolean;
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
  private readonly deformation = new THREE.Group();
  private readonly shape = new THREE.Group();
  private readonly cameraVisibility = new CameraBodyVisibility();
  private readonly burst = new SlimeBurstPresentation(0x35d7b5);
  private readonly trail: SpecimenTrail;
  private trailEnabled = true;
  private airborne = false;
  private readonly effects: SpecimenActionEffects;
  private readonly bodyPosition = new THREE.Vector3();
  private recoil = 0;
  private previousRecoil = 0;
  private recoilStrength = 0;
  private recoilAge = 1;
  private shotCharge = 0;
  private previousShotCharge = 0;
  private damageAge = 1;
  private damageStrength = 0;
  private damageWobble = 0;
  private previousDamageWobble = 0;
  private chargedLandingPending = false;
  private overcharge = 0;
  private dashing = false;
  private readonly previousTravel = new THREE.Vector3();
  private readonly travel = new THREE.Vector3();
  private readonly localDirection = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly supportRotation = new THREE.Quaternion();
  private readonly previousSupportRotation = new THREE.Quaternion();
  private readonly inverseSupport = new THREE.Quaternion();
  private readonly shotDirection = new THREE.Vector3(0, 0, -1);
  private asset: SpecimenAsset | undefined;
  private materials: SpecimenMaterials | undefined;
  private detail: CharacterDetail | undefined;
  private pending: Promise<void> | undefined;
  private disposed = false;
  private visible = false;
  private opacity = 1;
  private environment: THREE.Texture | null = null;
  private reflection = 0;
  private eyeReflection = 0;
  private seeded = false;
  private clock = 0;
  private spawnYaw = 0;
  private yaw = 0;
  private previousYaw = 0;
  private targetYaw = 0;
  private moving = false;
  private hasTravelHeading = false;
  private reversing = false;
  private reversalRemaining = 0;
  private lean = 0;
  private previousLean = 0;
  private turnBank = 0;
  private previousTurnBank = 0;
  private compression = 0;
  private previousCompression = 0;
  private launchRemaining = 0;
  private launchStrength = 0;
  private landingRemaining = 0;
  private landingStrength = 0;
  private shotFacingRemaining = 0;
  private dead = false;
  private weights = emptyWeights();
  private previousWeights = emptyWeights();

  constructor(radiusMetres = 0.675, gelRendering?: GelRendering) {
    this.radiusMetres = radiusMetres; this.gelRendering = gelRendering;
    this.trail = new SpecimenTrail(radiusMetres);
    this.effects = new SpecimenActionEffects(radiusMetres);
    this.cameraVisibility.bind(this.trail.root);
    this.cameraVisibility.bind(this.effects.arcs);
    this.cameraVisibility.bind(this.effects.ghosts);
    this.root.name = 'player-specimen-presentation';
    this.placement.name = 'player-specimen-placement';
    this.shape.name = 'specimen-sole-pivot';
    const assetScale = radiusMetres / 0.675;
    this.shape.scale.setScalar(assetScale);
    this.shape.position.y = -radiusMetres - SPECIMEN_RESTING_SOLE * assetScale;
    this.deformation.name = 'specimen-elastic-motion'; this.deformation.matrixAutoUpdate = false;
    this.deformation.add(this.shape); this.facing.add(this.deformation); this.support.add(this.facing);
    this.placement.add(this.support); this.root.add(this.placement, this.burst.root, this.trail.root, this.effects.root);
    this.applyVisibility();
  }
  get ready(): boolean { return !!this.asset && !this.disposed; }
  get diagnostics() {
    return { ready: this.ready, visible: this.support.visible, opacity: this.opacity, deathActive: this.dead,
      weights: { ...this.weights }, yaw: this.yaw, signedLean: this.lean, turnBank: this.turnBank,
      reversing: this.reversing, bodyHeightScale: 1 - this.compression - this.shotCharge * 0.055 - (this.dashing ? 0.1 : 0),
      launchRemaining: this.launchRemaining, trail: this.trail.diagnostics, triangles: this.asset ? SPECIMEN_TRIANGLES : 0,
      recoil: this.recoil, damageRipple: this.damageStrength * Math.max(0, 1 - this.damageAge / 0.55),
      overcharge: this.overcharge, effects: this.effects.diagnostics, dashing: this.dashing,
      meshCount: this.asset?.meshes.length ?? 0, soleOffset: -this.radiusMetres,
      meshes: this.asset?.meshes.map(mesh => ({ name: mesh.name, weights: [...mesh.morphTargetInfluences!] })) ?? [] };
  }
  prepare(loader: () => Promise<THREE.Group> = loadSpecimenAsset,
    detailLoader: (() => Promise<readonly CharacterDetailIndices[]>) | undefined = loader === loadSpecimenAsset
      ? () => loadCharacterDetail(SPECIMEN_DETAIL_URL) : undefined): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Cannot prepare disposed Specimen'));
    if (this.ready) return Promise.resolve();
    if (this.pending) return this.pending;
    // Optional detail failure retains the complete authored model. Fetch both
    // together, then install the one immutable index buffer before any draw.
    const detailReady = detailLoader ? Promise.resolve().then(detailLoader).catch(() => undefined) : undefined;
    const pending = Promise.resolve().then(loader).then(async root => {
      const indices = await detailReady;
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
        if (indices) {
          try { this.detail = new CharacterDetail(root, asset.meshes, indices); }
          catch { /* Optional detail must not prevent the final form loading. */ }
        }
        this.shape.add(root); this.asset = asset; this.materials = materials;
        this.applyVisibility(); this.present(1);
      } catch (error) {
        this.detail?.dispose(); this.detail = undefined;
        this.cameraVisibility.dispose(); disposeSpecimenAsset(root, this.environment); throw error;
      }
    });
    this.pending = pending;
    void pending.finally(() => { if (this.pending === pending) this.pending = undefined; }).catch(() => {});
    return pending;
  }
  setCameraView(rig: CameraRig, target: CameraFollowTarget): void { this.cameraVisibility.configure(rig, target); }
  updateDetail(camera: THREE.Camera, combatBudget = false): void { this.detail?.update(camera, combatBudget ? 1.4 : .1, combatBudget); }
  get detailDiagnostics() { return this.detail?.diagnostics; }
  setPosition(position: Vector3State): void { this.placement.position.set(position.x, position.y, position.z); }
  /** Level heading restored on recovery, independent of temporary cinematic turns. */
  setSpawnYaw(yaw: number): void { this.spawnYaw = yaw; this.setYaw(yaw); }
  setYaw(yaw: number): void {
    this.yaw = this.previousYaw = this.targetYaw = yaw;
    this.reversing = this.hasTravelHeading = false; this.reversalRemaining = 0;
    this.lean = this.previousLean = this.turnBank = this.previousTurnBank = 0;
    this.present(1);
  }
  setVisible(visible: boolean): void { this.visible = visible; this.applyVisibility(); }
  setTrailEnabled(enabled: boolean): void {
    this.trailEnabled = enabled;
    if (!enabled) this.dashing = this.chargedLandingPending = false;
    this.applyVisibility();
  }
  setDashing(active: boolean): void { this.dashing = active; }
  setOpacity(opacity: number): void {
    this.opacity = THREE.MathUtils.clamp(opacity, 0, 1); this.materials?.setOpacity(this.opacity); this.applyVisibility();
    this.trail.setOpacity(this.opacity);
    this.effects.setBodyOpacity(this.opacity);
  }
  setReflectionEnvironment(texture: THREE.Texture | null): void {
    this.environment = texture; this.materials?.setReflectionEnvironment(texture);
  }
  setReflectionIntensity(body: number, eyes: number): void {
    this.reflection = body; this.eyeReflection = eyes; this.materials?.setReflectionIntensity(body, eyes);
  }
  update(dt: number, state: SpecimenCharacterState, attack: SpecimenCharacterAttack): void {
    if (this.dead || this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    this.clock += dt;
    Object.assign(this.previousWeights, this.weights);
    this.previousLean = this.lean; this.previousTurnBank = this.turnBank;
    this.previousCompression = this.compression;
    this.previousRecoil = this.recoil; this.previousShotCharge = this.shotCharge;
    this.previousDamageWobble = this.damageWobble;
    this.recoilAge += dt; this.damageAge += dt;
    this.recoil = this.recoilAge < 0.3 ? Math.sin(this.recoilAge / 0.3 * Math.PI) * Math.exp(-this.recoilAge * 8) * this.recoilStrength : 0;
    this.damageWobble = this.damageAge < 0.55 ? Math.sin(this.damageAge * 44) * Math.exp(-this.damageAge * 7) * this.damageStrength : 0;
    this.shotCharge += ((attack.charging ? attack.chargeAmount : 0) - this.shotCharge) * (1 - Math.exp(-24 * dt));
    this.overcharge = attack.overchargeReady ? 1 : (attack.overchargeProgress ?? 0) * 0.55;
    this.bodyPosition.copy(state.position);
    this.previousYaw = this.yaw; this.previousSupportRotation.copy(this.supportRotation);
    this.up.set(state.gameplayUp.x, state.gameplayUp.y, state.gameplayUp.z).normalize();
    this.supportRotation.setFromUnitVectors(UP, this.up);
    this.inverseSupport.copy(this.supportRotation).invert();
    this.travel.set(state.locomotionPosition.x, state.locomotionPosition.y, state.locomotionPosition.z);
    this.localDirection.copy(this.travel).sub(this.previousTravel).applyQuaternion(this.inverseSupport);
    if (!this.seeded) this.localDirection.set(0, 0, 0);
    const speed = Math.hypot(this.localDirection.x, this.localDirection.z) / dt;
    this.previousTravel.copy(this.travel); this.seeded = true;
    const supported = state.grounded || state.attached === true;
    this.airborne = !supported;
    this.applyVisibility();
    const maximumSpeed = Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6);
    this.trail.update(dt, state.position, state.locomotionPosition, this.up,
      Math.max(maximumSpeed, Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z)), attack.chargeAmount);
    this.effects.update(dt, { position: state.position, up: this.up, yaw: this.yaw, charge: attack.chargeAmount,
      charging: attack.charging === true, overcharge: attack.overchargeReady ? 1 : 0, dashing: this.dashing });
    const resolvedTravel = speed <= maximumSpeed * (this.dashing ? 3.5 : 1.5);
    this.shotFacingRemaining = Math.max(0, this.shotFacingRemaining - dt);
    const facingShot = this.shotFacingRemaining > 0;
    const facingAim = attack.aimActive || attack.charging === true || attack.chargeAmount > 0;
    if (!supported || !resolvedTravel || speed <= 0.08) this.moving = false;
    else if (speed >= 0.16) this.moving = true;
    if (facingAim || facingShot) {
      this.travel.copy(facingShot && !facingAim ? this.shotDirection : attack.aimDirection).applyQuaternion(this.inverseSupport);
      if (Math.hypot(this.travel.x, this.travel.z) > 0.001) this.targetYaw = Math.atan2(-this.travel.x, -this.travel.z);
      this.reversing = false; this.reversalRemaining = 0;
    } else if (this.moving && !state.chargingJump) {
      const desiredYaw = Math.atan2(-this.localDirection.x, -this.localDirection.z);
      if (Math.abs(shortestAngleDelta(this.targetYaw, desiredYaw)) >= Math.PI / 36) this.targetYaw = desiredYaw;
      if (this.hasTravelHeading && !this.reversing && Math.abs(shortestAngleDelta(this.yaw, this.targetYaw)) >= Math.PI * 2 / 3) {
        this.reversing = true; this.reversalRemaining = 0.14;
      }
      this.hasTravelHeading = true;
    }
    this.reversalRemaining = Math.max(0, this.reversalRemaining - dt);
    if (this.reversalRemaining === 0) {
      const turn = shortestAngleDelta(this.yaw, this.targetYaw);
      this.yaw = moveAngleTowards(this.yaw, this.targetYaw,
        Math.min(Math.abs(turn) * (1 - Math.exp(-(facingAim || facingShot ? 24 : 14) * dt)), Math.PI * (facingAim || facingShot ? 6 : 3) * dt));
      if (Math.abs(shortestAngleDelta(this.yaw, this.targetYaw)) < Math.PI / 36) this.reversing = false;
    }
    const motion = this.moving ? THREE.MathUtils.clamp(speed / maximumSpeed, 0, 1) : 0;
    const forwardSpeed = (-Math.sin(this.yaw) * this.localDirection.x - Math.cos(this.yaw) * this.localDirection.z) / dt;
    const targetLean = this.moving && !state.chargingJump ? THREE.MathUtils.clamp(forwardSpeed / maximumSpeed, -1, 1) : 0;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-(targetLean === 0 ? 8 : 11) * dt));
    const targetBank = supported && !state.chargingJump
      ? THREE.MathUtils.clamp(shortestAngleDelta(this.previousYaw, this.yaw) / (dt * Math.PI * 3), -1, 1) * Math.max(motion, facingAim || facingShot ? 0.25 : 0) : 0;
    this.turnBank += (targetBank - this.turnBank) * (1 - Math.exp(-12 * dt));
    if (Math.abs(this.lean) < 1e-5) this.lean = 0;
    if (Math.abs(this.turnBank) < 1e-5) this.turnBank = 0;

    // Event-driven takeoff and impact keep the elastic response on the same
    // fixed step as the actual impulse/contact. Falling off a ledge is not a jump.
    if (state.landedThisStep && this.landingRemaining === 0) this.onLanding(8);
    this.launchRemaining = Math.max(0, this.launchRemaining - dt);
    this.landingRemaining = Math.max(0, this.landingRemaining - dt);
    let targetCompression: number;
    if (supported) {
      this.launchRemaining = 0;
      const charge = state.chargingJump ? 0.12 + 0.24 * THREE.MathUtils.smoothstep(state.chargeFraction, 0, 1) : 0;
      const landing = this.landingRemaining > 0 ? gelLandingSquash(GEL_LANDING_SECONDS - this.landingRemaining, this.landingStrength) : 0;
      targetCompression = charge > 0 ? Math.max(charge, landing) : landing;
    } else {
      this.landingRemaining = 0;
      const verticalSpeed = state.velocity.x * this.up.x + state.velocity.y * this.up.y + state.velocity.z * this.up.z;
      targetCompression = -gelAirborneStretch(verticalSpeed, this.launchStrength, this.launchRemaining);
    }
    this.compression += (targetCompression - this.compression) * (1 - Math.exp(-(this.launchRemaining > 0 ? 40 : 24) * dt));
    if (Math.abs(this.compression) < 1e-5) this.compression = 0;
    const sway = Math.sin(this.clock * (5 + motion * 5)) * motion * 0.045;
    const blinkPhase = this.clock % 4.7;
    Object.assign(this.weights, {
      Breathe: 0.3 + Math.sin(this.clock * 2) * 0.22,
      Flow: 0.5 + Math.sin(this.clock * 1.6) * 0.45,
      Squash: THREE.MathUtils.clamp(this.compression / 0.36, 0, 1),
      Stretch: THREE.MathUtils.clamp(-this.compression / 0.3, 0, 1),
      WobbleLeft: Math.max(0, sway + this.turnBank * 0.35), WobbleRight: Math.max(0, -sway - this.turnBank * 0.35),
      CrestFlexLeft: THREE.MathUtils.clamp(sway * 1.5 - this.turnBank * 0.6 + this.recoil * 0.7 + Math.max(0, this.damageWobble), 0, 1),
      CrestFlexRight: THREE.MathUtils.clamp(-sway * 1.5 + this.turnBank * 0.6 + this.recoil * 0.7 + Math.max(0, -this.damageWobble), 0, 1),
      Blink: blinkPhase > 4.48 ? Math.sin((blinkPhase - 4.48) / 0.22 * Math.PI) : 0,
      Charge: attack.chargeAmount, Focus: facingAim || facingShot ? 0.65 : 0, Curious: 0,
    });
  }
  onShot(direction: Vector3State, charge = 0, overcharged = false): void {
    if (this.dead || this.disposed) return;
    this.shotDirection.copy(direction);
    this.shotFacingRemaining = 0.3;
    this.recoilAge = 0; this.recoilStrength = 0.25 + charge * 0.65 + (overcharged ? 0.3 : 0);
    // A tap can begin and release in one fixed step. Face its real muzzle
    // direction immediately so the projectile never leaves a sideways actor.
    this.travel.copy(this.shotDirection).applyQuaternion(this.inverseSupport);
    if (Math.hypot(this.travel.x, this.travel.z) > 0.001) {
      this.yaw = this.previousYaw = this.targetYaw = Math.atan2(-this.travel.x, -this.travel.z);
      this.reversing = false; this.reversalRemaining = 0;
    }
  }
  present(alpha = 1): void {
    alpha = THREE.MathUtils.clamp(alpha, 0, 1);
    this.support.quaternion.slerpQuaternions(this.previousSupportRotation, this.supportRotation, alpha);
    // Restored quaternions can decompose a half-turn onto X/Z. This rig is yaw-only.
    this.facing.rotation.set(0, this.previousYaw + shortestAngleDelta(this.previousYaw, this.yaw) * alpha, 0);
    const squash = THREE.MathUtils.lerp(this.previousWeights.Squash, this.weights.Squash, alpha);
    const stretch = THREE.MathUtils.lerp(this.previousWeights.Stretch, this.weights.Stretch, alpha);
    const shotCharge = THREE.MathUtils.lerp(this.previousShotCharge, this.shotCharge, alpha);
    const recoil = THREE.MathUtils.lerp(this.previousRecoil, this.recoil, alpha);
    const damageWobble = THREE.MathUtils.lerp(this.previousDamageWobble, this.damageWobble, alpha);
    const height = 1 - THREE.MathUtils.lerp(this.previousCompression, this.compression, alpha) - shotCharge * 0.055 + (this.dashing ? -0.1 : 0);
    const residualHeight = height / (1 - 0.12 * squash + 0.1 * stretch);
    const spreadX = 1 / (Math.sqrt(height) * (1 + 0.085 * squash - 0.045 * stretch));
    const spreadZ = (this.dashing ? 1.3 : 1) / (Math.sqrt(height) * (1 + 0.055 * squash - 0.035 * stretch));
    const lean = THREE.MathUtils.lerp(this.previousLean, this.lean, alpha);
    const bank = THREE.MathUtils.lerp(this.previousTurnBank, this.turnBank, alpha);
    const shearX = -0.16 * bank + damageWobble * 0.12, shearZ = -0.32 * lean + recoil * 0.3 - shotCharge * 0.05;
    // Shear and stretch about the support plane instead of tipping the base
    // through the floor. The whole asset, including eyes and veins, follows.
    this.deformation.matrix.set(spreadX, shearX, 0, shearX * this.radiusMetres,
      0, residualHeight, 0, this.radiusMetres * (residualHeight - 1),
      0, shearZ, spreadZ, shearZ * this.radiusMetres,
      0, 0, 0, 1);
    this.deformation.matrixWorldNeedsUpdate = true;
    for (const mesh of this.asset?.meshes ?? []) {
      mesh.morphTargetInfluences!.fill(0);
      for (const name of MORPHS) {
        const index = mesh.morphTargetDictionary![name];
        if (index !== undefined) mesh.morphTargetInfluences![index] = THREE.MathUtils.lerp(this.previousWeights[name], this.weights[name], alpha);
      }
    }
    this.materials?.setCharge(THREE.MathUtils.lerp(this.previousWeights.Charge, this.weights.Charge, alpha));
    this.materials?.setTime(this.clock);
    this.materials?.setDamage(this.damageStrength * Math.max(0, 1 - this.damageAge / 0.55) ** 2, this.damageAge);
    this.materials?.setOvercharge(this.overcharge);
    this.materials?.setRecoil(recoil);
  }
  onLaunch(launch: SlimePresentationLaunch): void {
    if (this.dead || this.disposed) return;
    this.launchRemaining = GEL_LAUNCH_SECONDS;
    this.launchStrength = 0.65 + THREE.MathUtils.clamp(launch.chargeFraction, 0, 1) * 0.35;
    this.landingRemaining = 0;
    this.chargedLandingPending = launch.chargeFraction >= 0.85;
  }
  onLanding(impactSpeedMetresPerSecond: number, position?: Vector3State, up?: Vector3State): void {
    if (this.dead || this.disposed) return;
    this.landingRemaining = GEL_LANDING_SECONDS;
    this.landingStrength = THREE.MathUtils.clamp((impactSpeedMetresPerSecond - 1.5) / 7, 0, 1);
    this.launchRemaining = 0;
    if (this.chargedLandingPending && impactSpeedMetresPerSecond >= 8) this.effects.land(position ?? this.bodyPosition, up ?? this.up);
    this.chargedLandingPending = false;
  }
  onDamage(amount: number): void {
    if (this.dead || this.disposed || !Number.isFinite(amount) || amount <= 0) return;
    this.damageAge = 0; this.damageStrength = THREE.MathUtils.clamp(0.4 + amount / 45, 0, 1);
  }
  startDeath(position: Vector3State): void { this.dead = true; this.burst.start(position); this.applyVisibility(); }
  updateDeath(dt: number): void { this.burst.update(dt); }
  primeDeathResources(position: Vector3State, render: (root: THREE.Object3D) => void): void {
    this.burst.primeResources(position, render); this.trail.primeResources(position, render);
    this.effects.primeResources(position, render);
  }
  reset(): void {
    this.dead = false; this.burst.reset(); this.seeded = false; this.clock = 0;
    this.yaw = this.previousYaw = this.targetYaw = this.spawnYaw;
    this.moving = this.hasTravelHeading = this.reversing = false; this.reversalRemaining = 0;
    this.lean = this.previousLean = this.turnBank = this.previousTurnBank = 0;
    this.compression = this.previousCompression = 0;
    this.launchRemaining = this.launchStrength = this.landingRemaining = this.landingStrength = 0;
    this.shotFacingRemaining = 0;
    this.airborne = false;
    this.dashing = this.chargedLandingPending = false;
    this.recoil = this.previousRecoil = this.recoilStrength = this.shotCharge = this.previousShotCharge = 0;
    this.damageWobble = this.previousDamageWobble = this.damageStrength = this.overcharge = 0;
    this.recoilAge = this.damageAge = 1; this.effects.reset();
    this.trail.reset();
    this.supportRotation.identity(); this.previousSupportRotation.identity();
    this.weights = emptyWeights(); this.previousWeights = emptyWeights();
    this.setOpacity(1); this.present(1); this.applyVisibility();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.cameraVisibility.dispose();
    this.detail?.dispose(); this.detail = undefined;
    if (this.asset) disposeSpecimenAsset(this.asset.root, this.environment);
    this.asset = undefined; this.materials = undefined; this.burst.dispose(); this.trail.dispose(); this.effects.dispose(); this.root.removeFromParent(); this.root.clear();
  }
  private applyVisibility(): void {
    this.support.visible = this.visible && !this.dead && this.opacity > 0 && !this.disposed;
    this.trail.setVisible(this.support.visible && this.trailEnabled && this.airborne);
    this.effects.setVisible(this.visible && !this.dead && !this.disposed && this.trailEnabled);
  }
}
