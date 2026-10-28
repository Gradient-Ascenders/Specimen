import { CameraBodyVisibility } from '../CameraBodyVisibility.ts';
import type { CameraRig, CameraFollowTarget } from '../CameraRig.ts';
import type { GelRendering } from '../slime/GelRendering.ts';
import * as THREE from 'three';
import { loadCharacterAsset } from '../slime/LoadCharacterAsset.ts';
import { CharacterDetail, loadCharacterDetail, type CharacterDetailIndices } from '../slime/CharacterDetail.ts';
import { moveAngleTowards, shortestAngleDelta } from '../BlobFacing.ts';
import { SlimeBurstPresentation } from '../slime/SlimeBurstPresentation.ts';
import type { Vector3State, SlimePresentationLaunch } from '../slime/SlimePresentationContract.ts';
import { disposeVoltAsset, disposeVoltMaterials, validateVoltAsset, VOLT_MORPHS, type VoltAsset, type VoltWeights } from './VoltAsset.ts';
import { VOLT_BASE_COLOR, VoltMaterialSet } from './VoltMaterials.ts';
import type { CollisionWorld } from '../../physics/CollisionWorld.ts';
import { VoltHeadroom } from './VoltHeadroom.ts';
import { GEL_LAUNCH_SECONDS, GEL_LANDING_SECONDS, GEL_MAXIMUM_BASE_OFFSET_METRES,
  GEL_MAXIMUM_JUMP_BASE_OFFSET_METRES, GEL_CREST_LAG_METRES, GEL_LANDING_RIPPLE_SECONDS,
  gelLandingSquash, gelAirborneStretch } from '../slime/GelElasticMotion.ts';

const ASSET_URL = new URL('../../../assets/characters/volt/volt.glb', import.meta.url).href;
const DETAIL_URL = new URL('../../assets/characters/volt-lod.bin', import.meta.url).href;
const defaultLoader = () => loadCharacterAsset(ASSET_URL);
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
  private readonly cameraBodyVisibility = new CameraBodyVisibility();
  setCameraView(rig: CameraRig, target: CameraFollowTarget): void { this.cameraBodyVisibility.configure(rig, target); }

  private detail: CharacterDetail | undefined;
  readonly root = new THREE.Group();
  readonly radiusMetres: number;
  private readonly gelRendering: GelRendering | undefined;
  readonly placement = new THREE.Group();
  private readonly character = new THREE.Group();
  private readonly shape = new THREE.Group();
  private readonly headroom = new VoltHeadroom();
  private readonly burst = new SlimeBurstPresentation(VOLT_BASE_COLOR);
  private readonly previousTravel = new THREE.Vector3();
  private readonly travel = new THREE.Vector3();
  private readonly baseOffsetWorld = new THREE.Vector3();
  private readonly previousBaseOffsetWorld = new THREE.Vector3();
  private readonly presentedBaseOffsetWorld = new THREE.Vector3();
  private readonly targetBaseOffsetWorld = new THREE.Vector3();
  private readonly impactNormal = new THREE.Vector3(0, 1, 0);
  private readonly impactPoint = new THREE.Vector3();
  private readonly headroomPositionWorld = new THREE.Vector3();
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
  private spawnYaw = 0;
  private yaw = 0;
  private previousYaw = 0;
  private targetYaw = 0;
  private aimYaw: number | undefined;
  private seededTravel = false;
  private speed = 0;
  private previousLateralSpeed = 0;
  private previousForwardSpeed = 0;
  private moving = false;
  private hasTravelHeading = false;
  private reversing = false;
  private reversalRemaining = 0;
  private lean = 0;
  private previousLean = 0;
  private readonly crestLag = new THREE.Vector2();
  private readonly previousCrestLag = new THREE.Vector2();
  private readonly presentedCrestLag = new THREE.Vector2();
  private crestLandingRemaining = 0;
  private rippleStrength = 0;
  private rippleAge = GEL_LANDING_RIPPLE_SECONDS;
  private previousRippleAge = GEL_LANDING_RIPPLE_SECONDS;
  private impactPending = false;
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
  private squintRemaining = 0;
  private squintStrength = 0;
  private launchRemaining = 0;
  private launchStrength = 0;
  private landingRemaining = 0;
  private landingStrength = 0;
  private damageRemaining = 0;
  private damageStrength = 0;
  private deathActive = false;
  private deathElapsed = 0;
  private readonly weights: VoltWeights = { Squash: 0, Stretch: 0, Blink: 0, CrestFlexLeft: 0, CrestFlexRight: 0 };

  constructor(radiusMetres = 0.45, gelRendering?: GelRendering) {
    if (Math.abs(radiusMetres - 0.45) > 1e-6) throw new Error('Volt requires the approved 0.45 m radius');
    this.radiusMetres = radiusMetres;
    this.gelRendering = gelRendering;
    this.root.name = 'player-slime-volt-presentation';
    this.placement.name = 'player-slime-volt-placement';
    this.character.name = 'player-slime-volt-character';
    this.shape.name = 'volt-sole-pivot'; this.shape.matrixAutoUpdate = false;
    this.character.add(this.shape);
    this.placement.add(this.character); this.root.add(this.placement, this.burst.root);
    this.applyVisibility();
  }
  get ready(): boolean { return !!this.asset && !this.disposed; }
  get diagnostics() {
    return { ready: this.ready, requestedVisible: this.requestedVisible, visible: this.character.visible,
      opacity: this.opacity, facingYawRadians: this.yaw, targetYawRadians: this.targetYaw, speed: this.speed,
      grounded: this.grounded, motionSeeded: this.seededTravel, weights: { ...this.weights },
      locomotionStrength: Math.abs(this.lean), signedLean: this.lean, reversing: this.reversing,
      squash: Math.max(0, this.bodyWeight), stretch: Math.max(0, -this.bodyWeight),
      bodyHeightScale: 1 - this.bodyWeight - Math.abs(this.lean) * 0.025,
      baseMotionStrength: Math.hypot(this.baseOffsetWorld.x, this.baseOffsetWorld.z) / GEL_MAXIMUM_BASE_OFFSET_METRES,
      jumpBaseOffsetMetres: this.baseOffsetWorld.y,
      baseOffsetWorld: { x: this.baseOffsetWorld.x, y: this.baseOffsetWorld.y, z: this.baseOffsetWorld.z },
      polish: { crestLagMetres: this.crestLag.length(), eyeClosure: this.blink, landingRippleStrength: this.rippleStrength,
        landingRippleAgeSeconds: this.rippleAge },
      headroom: this.headroom.diagnostics,
      meshes: this.asset ? [this.asset.body, ...this.asset.eyes].map(mesh => ({ name: mesh.name,
        vertices: mesh.geometry.getAttribute('position').count,
        triangles: (Number.isFinite(mesh.geometry.drawRange.count) ? mesh.geometry.drawRange.count : mesh.geometry.index!.count) / 3,
        weights: Object.fromEntries(VOLT_MORPHS.map(name => [name, mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]]])),
        castShadow: mesh.castShadow })) : [],
      shadowCasting: this.shadows && this.character.visible, deathActive: this.deathActive,
      deathBurst: this.burst.diagnostics, materials: this.materials?.diagnostics,
      asset: this.asset ? { triangles: 38208, drawCalls: 3, geometries: 3, materials: 2 } : undefined };
  }
  prepare(loader: VoltCharacterLoader = defaultLoader,
    detailLoader: (() => Promise<readonly CharacterDetailIndices[]>) | undefined = loader === defaultLoader ? () => loadCharacterDetail(DETAIL_URL) : undefined): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Cannot prepare disposed Volt'));
    if (this.ready) return Promise.resolve();
    if (this.preparation) return this.preparation;
    const pending = Promise.resolve().then(loader).then(async root => {
      let materials: VoltMaterialSet | undefined;
      try {
        if (this.disposed) { disposeVoltAsset(root); return; }
        const asset = validateVoltAsset(root);
        let detailIndices: readonly CharacterDetailIndices[] | undefined;
        try { detailIndices = await detailLoader?.(); }
        catch { /* Optional LOD fetch/decode failures retain the authored GLB. */ }
        if (this.disposed) { disposeVoltAsset(root); return; }
        this.headroom.prepare(asset.body);
        const imported = new Set<THREE.Material>([asset.body.material, ...asset.eyes.map(eye => eye.material)].flat());
        materials = new VoltMaterialSet(...asset.maps, this.gelRendering);
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
          // Include combined morphs, trailing gel and crest lag. Three's scale
          // estimate omits shear, so also pad the sphere for locomotion lean.
          mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
          mesh.geometry.boundingBox!.expandByScalar(0.25);
          mesh.geometry.boundingSphere!.radius = (mesh.geometry.boundingSphere!.radius + 0.25) * 1.16;
        }
        disposeVoltMaterials(imported, new Set(asset.maps));
        this.shape.add(root); for (const mesh of [asset.body, ...asset.eyes]) this.cameraBodyVisibility.bind(mesh);
        this.asset = asset; this.materials = materials;
        if (detailIndices) {
          try { this.detail = new CharacterDetail(root, [asset.body, ...asset.eyes], detailIndices); }
          catch { /* Source validation happens before any geometry is changed. */ }
        }
        this.applyVisibility(); this.present();
      } catch (error) {
        this.detail?.dispose(); this.detail = undefined;
        this.asset = undefined; this.materials = undefined;
        this.headroom.releaseAsset();
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
  updateDetail(camera: THREE.Camera): void { this.detail?.update(camera); }
  get detailDiagnostics() { return this.detail?.diagnostics; }
  setPosition(position: Vector3State): void { this.placement.position.set(position.x, position.y, position.z); }
  setCollisionWorld(world: CollisionWorld): void { this.headroom.setCollisionWorld(world); }
  /** Level heading restored on recovery, independent of temporary cinematic turns. */
  setSpawnYaw(yaw: number): void { this.spawnYaw = yaw; this.setYaw(yaw); }
  setYaw(yaw: number): void {
    this.yaw = this.previousYaw = this.targetYaw = yaw;
    this.reversing = this.hasTravelHeading = false; this.reversalRemaining = 0; this.present();
  }
  setAimDirection(direction?: Vector3State): void {
    if (!direction) { this.aimYaw = undefined; return; }
    if (direction.x * direction.x + direction.z * direction.z > 1e-8) {
      this.aimYaw = this.targetYaw = Math.atan2(-direction.x, -direction.z);
      this.reversing = false; this.reversalRemaining = 0;
    }
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
    this.headroom.update(dt);
    this.previousYaw = this.yaw; this.previousBodyWeight = this.bodyWeight; this.previousFlex = this.flex; this.previousBlink = this.blink;
    this.previousLean = this.lean; this.previousCrestLag.copy(this.crestLag);
    this.previousBaseOffsetWorld.copy(this.baseOffsetWorld); this.previousRippleAge = this.rippleAge;
    this.travel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z).sub(this.previousTravel);
    this.previousTravel.set(state.locomotionPositionWorld.x, state.locomotionPositionWorld.y, state.locomotionPositionWorld.z);
    if (!this.seededTravel) this.travel.set(0, 0, 0);
    this.seededTravel = true;
    this.speed = Math.hypot(this.travel.x, this.travel.z) / dt;
    const intent = state.movementIntentWorld;
    const maximumSpeed = Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6);
    const activeTravel = intent.x * intent.x + intent.z * intent.z > 0.01 && this.speed <= maximumSpeed * 1.5;
    if (!state.grounded || !activeTravel || this.speed <= 0.08) this.moving = false;
    else if (this.speed >= 0.16) this.moving = true;
    if (this.aimYaw !== undefined) this.targetYaw = this.aimYaw;
    else if (this.moving) {
      this.targetYaw = Math.atan2(-this.travel.x, -this.travel.z);
      if (this.hasTravelHeading && !this.reversing && Math.abs(shortestAngleDelta(this.yaw, this.targetYaw)) >= Math.PI * 2 / 3) {
        this.reversing = true; this.reversalRemaining = 0.16;
      }
      this.hasTravelHeading = true;
    }
    this.reversalRemaining = Math.max(0, this.reversalRemaining - dt);
    if (!this.reversing || this.reversalRemaining === 0) {
      const turn = shortestAngleDelta(this.yaw, this.targetYaw);
      this.yaw = moveAngleTowards(this.yaw, this.targetYaw, Math.min(Math.abs(turn) * (1 - Math.exp(-16 * dt)), Math.PI * 3 * dt));
      const remaining = Math.abs(shortestAngleDelta(this.yaw, this.targetYaw));
      if (remaining < 1e-5) this.yaw = this.targetYaw;
      if (remaining < Math.PI / 36) this.reversing = false;
    }
    const forward = activeTravel ? (-Math.sin(this.yaw) * this.travel.x - Math.cos(this.yaw) * this.travel.z) / dt : 0;
    const targetLean = this.moving ? THREE.MathUtils.clamp(forward / maximumSpeed, -1, 1) : 0;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-(targetLean === 0 ? 7 : 11) * dt));
    if (Math.abs(this.lean) < 1e-5) this.lean = 0;
    this.targetBaseOffsetWorld.set(0, 0, 0);
    if (this.moving || (!state.grounded && activeTravel && this.speed > 0.08)) {
      this.targetBaseOffsetWorld.copy(this.travel).setY(0)
        .multiplyScalar(-GEL_MAXIMUM_BASE_OFFSET_METRES / (maximumSpeed * dt)).clampLength(0, GEL_MAXIMUM_BASE_OFFSET_METRES);
    }
    if (!state.grounded) this.targetBaseOffsetWorld.y = -GEL_MAXIMUM_JUMP_BASE_OFFSET_METRES * THREE.MathUtils.clamp(state.velocityWorld.y / 6, -1, 1);
    this.baseOffsetWorld.lerp(this.targetBaseOffsetWorld, 1 - Math.exp(-12 * dt));
    if (state.grounded) this.baseOffsetWorld.y = this.previousBaseOffsetWorld.y = 0;
    for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(this.baseOffsetWorld[axis]) < 1e-6) this.baseOffsetWorld[axis] = 0;
    const lateral = this.moving ? (Math.cos(this.yaw) * this.travel.x - Math.sin(this.yaw) * this.travel.z) / dt : 0;
    const targetFlex = this.moving ? THREE.MathUtils.clamp(-(lateral - this.previousLateralSpeed) * 0.006 / dt -
      shortestAngleDelta(this.previousYaw, this.yaw) * 0.018 / dt, -0.5, 0.5) : 0;
    this.previousLateralSpeed = lateral;
    this.flex += (targetFlex - this.flex) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.flex) < 1e-5) this.flex = 0;
    this.crestLandingRemaining = Math.max(0, this.crestLandingRemaining - dt);
    const acceleration = activeTravel ? (forward - this.previousForwardSpeed) / dt : 0;
    const targetCrest = THREE.MathUtils.clamp(-acceleration * 0.002 +
      0.014 * this.landingStrength * this.crestLandingRemaining / 0.3, -GEL_CREST_LAG_METRES, GEL_CREST_LAG_METRES);
    const turn = THREE.MathUtils.clamp(-shortestAngleDelta(this.previousYaw, this.yaw) / (dt * Math.PI * 3), -1, 1);
    this.previousForwardSpeed = forward;
    const crestResponse = 1 - Math.exp(-9 * dt);
    this.crestLag.x += (GEL_CREST_LAG_METRES * turn - this.crestLag.x) * crestResponse;
    this.crestLag.y += (targetCrest - this.crestLag.y) * crestResponse;
    this.crestLag.clampLength(0, GEL_CREST_LAG_METRES);
    if (this.crestLag.lengthSq() < 1e-12) this.crestLag.set(0, 0);
    this.grounded = state.grounded;
    const wasLanding = this.landingRemaining > 0;
    this.launchRemaining = Math.max(0, this.launchRemaining - dt);
    this.landingRemaining = Math.max(0, this.landingRemaining - dt);
    this.damageRemaining = Math.max(0, this.damageRemaining - dt);
    this.squintRemaining = Math.max(0, this.squintRemaining - dt);
    if (state.grounded) {
      this.launchRemaining = 0;
      this.bodyWeight = this.landingRemaining > 0
        ? gelLandingSquash(GEL_LANDING_SECONDS - this.landingRemaining, this.landingStrength)
        : wasLanding ? 0 : this.bodyWeight * Math.exp(-11 * dt);
      if (Math.abs(this.bodyWeight) < 1e-5) this.bodyWeight = 0;
    } else {
      this.landingRemaining = 0;
      const stretch = gelAirborneStretch(state.velocityWorld.y, this.launchStrength, this.launchRemaining);
      this.bodyWeight += (-stretch - this.bodyWeight) * (1 - Math.exp(-18 * dt));
    }
    if (this.damageRemaining > 0) this.bodyWeight = Math.max(this.bodyWeight, 0.08 * this.damageStrength * this.damageRemaining / 0.22);
    this.rippleAge = Math.min(GEL_LANDING_RIPPLE_SECONDS, this.rippleAge + dt);
    if (!state.grounded || this.rippleAge === GEL_LANDING_RIPPLE_SECONDS) this.rippleStrength = 0;
    // Finish an ongoing blink, but save idle blinks for a visible, grounded
    // character. Launch/impact effort and electrical focus use the same seated
    // eye morph, so they stay attached through the body deformation.
    if (this.blinkClock >= this.nextBlink ||
        (this.requestedVisible && state.grounded && this.squintRemaining === 0 && this.aimYaw === undefined)) this.blinkClock += dt;
    if (this.blinkClock >= this.nextBlink + 0.18) {
      this.blinkClock = 0; this.nextBlink = 3.7 + (++this.blinkCount % 3) * 0.61;
    }
    const idleBlink = this.blinkClock >= this.nextBlink ? Math.sin(Math.PI * (this.blinkClock - this.nextBlink) / 0.18) : 0;
    this.blink = Math.max(idleBlink, this.squintStrength * this.squintRemaining / 0.22, this.aimYaw === undefined ? 0 : 0.1);
    this.materials?.update(dt); this.present(1);
  }
  present(alpha = 1): void {
    const blend = THREE.MathUtils.clamp(alpha, 0, 1);
    // Clear X/Z half-turns introduced when a cinematic restores a quaternion.
    this.character.rotation.set(0, this.previousYaw + shortestAngleDelta(this.previousYaw, this.yaw) * blend, 0);
    const body = THREE.MathUtils.lerp(this.previousBodyWeight, this.bodyWeight, blend);
    const flex = THREE.MathUtils.lerp(this.previousFlex, this.flex, blend);
    const lean = THREE.MathUtils.lerp(this.previousLean, this.lean, blend);
    // Preserve the authored poses, then compensate their scale contribution so
    // the final volume/height equals Goop's response rather than doubling squash.
    this.weights.Squash = THREE.MathUtils.clamp(body / 0.1, 0, 0.5);
    this.weights.Stretch = THREE.MathUtils.clamp(-body / 0.09, 0, 0.5);
    this.weights.Blink = THREE.MathUtils.clamp(THREE.MathUtils.lerp(this.previousBlink, this.blink, blend), 0, 1);
    this.weights.CrestFlexLeft = THREE.MathUtils.clamp(flex, 0, 1); this.weights.CrestFlexRight = THREE.MathUtils.clamp(-flex, 0, 1);
    if (this.asset) for (const mesh of [this.asset.body, ...this.asset.eyes]) for (const name of VOLT_MORPHS) {
      mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]] = this.weights[name];
    }
    const height = 1 - body - Math.abs(lean) * 0.025;
    const authoredHeight = 1 - 0.1 * this.weights.Squash + 0.09 * this.weights.Stretch;
    const authoredSpread = 1 + this.weights.Squash * (1 / Math.sqrt(0.9) - 1) + this.weights.Stretch * (1 / Math.sqrt(1.09) - 1);
    const residualHeight = height / authoredHeight, spread = 1 / (Math.sqrt(height) * authoredSpread);
    const shear = (lean >= 0 ? 0.28 : 0.22) * lean / authoredHeight;
    this.shape.matrix.set(spread, 0, 0, 0,
      0, residualHeight, 0, this.radiusMetres * (residualHeight - 1),
      0, -shear, spread, -shear * this.radiusMetres,
      0, 0, 0, 1);
    this.shape.matrixWorldNeedsUpdate = true;
    // Locked Volt still advances animation, but has no visible surface or shadows.
    // Query the current ceiling again on the first visible pose after unlocking.
    if (this.requestedVisible) {
      // Cutscenes borrow this presentation under a moving carrier. Placement
      // is then local (often zero), not the location of Volt in the facility.
      this.placement.getWorldPosition(this.headroomPositionWorld);
      this.headroom.present(this.headroomPositionWorld, this.shape.matrix, this.weights);
    }
    this.presentedBaseOffsetWorld.lerpVectors(this.previousBaseOffsetWorld, this.baseOffsetWorld, blend);
    this.materials?.setMotion(this.presentedBaseOffsetWorld, this.character.rotation.y,
      this.presentedCrestLag.lerpVectors(this.previousCrestLag, this.crestLag, blend), this.rippleStrength,
      THREE.MathUtils.lerp(this.previousRippleAge, this.rippleAge, blend));
    if (this.impactPending && this.asset && this.materials) {
      this.impactPoint.copy(this.impactNormal).multiplyScalar(-this.radiusMetres).add(this.placement.position);
      this.asset.body.worldToLocal(this.impactPoint);
      this.materials.setImpact(this.impactPoint, this.landingStrength); this.impactPending = false;
    }
  }
  onLaunch(launch: SlimePresentationLaunch): void {
    if (this.disposed || this.deathActive) return;
    this.launchRemaining = GEL_LAUNCH_SECONDS; this.landingRemaining = 0;
    this.launchStrength = THREE.MathUtils.clamp(launch.speedMetresPerSecond / 6, 0, 1);
    this.reactEyes(0.12 * this.launchStrength);
    this.rippleStrength = 0; this.crestLandingRemaining = 0;
  }
  onLanding(normal: Vector3State, impactSpeed: number): void {
    if (this.disposed || this.deathActive) return;
    this.landingRemaining = GEL_LANDING_SECONDS; this.launchRemaining = 0;
    this.landingStrength = THREE.MathUtils.clamp((impactSpeed - 1.5) / 7, 0, 1);
    this.reactEyes(0.18 * this.landingStrength);
    this.crestLandingRemaining = 0.3;
    this.rippleStrength = THREE.MathUtils.clamp((impactSpeed - 4.5) / 4, 0, 1);
    this.rippleAge = this.previousRippleAge = 0;
    this.impactNormal.set(normal.x, normal.y, normal.z).normalize(); this.impactPending = true;
  }
  onDamage(strength: number): void {
    if (this.disposed || this.deathActive) return;
    this.damageRemaining = 0.22; this.damageStrength = THREE.MathUtils.clamp(strength, 0, 1);
    this.reactEyes(0.28 * this.damageStrength);
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
    this.headroom.reset();
    this.deathActive = false; this.deathElapsed = 0; this.burst.reset();
    this.yaw = this.previousYaw = this.targetYaw = this.spawnYaw;
    this.bodyWeight = this.previousBodyWeight = this.flex = this.previousFlex = 0;
    this.blink = this.previousBlink = this.blinkClock = this.blinkCount = this.speed = this.previousLateralSpeed = 0;
    this.nextBlink = 3.7; this.launchRemaining = this.landingRemaining = this.damageRemaining = this.damageStrength = this.landingStrength = 0;
    this.launchStrength = this.lean = this.previousLean = this.previousForwardSpeed = this.reversalRemaining = 0;
    this.crestLag.set(0, 0); this.previousCrestLag.set(0, 0); this.presentedCrestLag.set(0, 0);
    this.crestLandingRemaining = this.rippleStrength = this.squintRemaining = this.squintStrength = 0;
    this.rippleAge = this.previousRippleAge = GEL_LANDING_RIPPLE_SECONDS;
    this.moving = this.hasTravelHeading = this.reversing = this.impactPending = false;
    this.baseOffsetWorld.set(0, 0, 0); this.previousBaseOffsetWorld.set(0, 0, 0);
    this.targetBaseOffsetWorld.set(0, 0, 0); this.impactNormal.set(0, 1, 0);
    this.aimYaw = undefined; this.seededTravel = false; this.grounded = true; this.reflectionSnapPending = true;
    this.materials?.reset(); this.opacity = 1; this.requestedVisible = true; this.applyVisibility(); this.present();
  }
  dispose(): void {
    this.cameraBodyVisibility.dispose();
    if (this.disposed) return;
    this.disposed = true;
    this.detail?.dispose(); this.detail = undefined;
    this.headroom.dispose();
    if (this.asset) disposeVoltAsset(this.asset.root, this.environment);
    this.asset = undefined; this.materials = undefined;
    this.burst.dispose(); this.root.removeFromParent(); this.root.clear(); this.applyVisibility();
  }
  private applyVisibility(): void {
    this.character.visible = this.ready && this.requestedVisible && this.opacity > 0 && (!this.deathActive || this.deathElapsed < 0.075);
    if (this.asset) for (const mesh of [this.asset.body, ...this.asset.eyes]) { mesh.castShadow = this.shadows && this.character.visible; mesh.userData.characterShadowCaster = this.shadows; }
  }
  private reactEyes(strength: number): void {
    this.squintStrength = Math.max(this.squintStrength * this.squintRemaining / 0.22, strength);
    this.squintRemaining = this.squintStrength > 0 ? 0.22 : 0;
  }
}
