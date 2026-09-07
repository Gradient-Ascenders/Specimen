import * as THREE from 'three';

import type {
  AcidAimReadModel,
  AcidProjectileEvents,
  AcidProjectileReadState,
  ReadonlyVector3State,
} from '../../abilities/AcidProjectileSystem.ts';
import type { DissolveTarget } from '../../abilities/DissolveTarget.ts';
import type { EventBus } from '../../core/EventBus.ts';
import type { CameraRig } from '../CameraRig.ts';

const HIGHLIGHT_TRANSITION_SECONDS = 0.2;
const CANDIDATE_HIGHLIGHT_STRENGTH = 0.34;
const BURN_PROGRESS_SPAN = 0.22;
const BURN_PRESENTATION_SECONDS = 0.55;
const PROJECTILE_TRAIL_POINTS = 7;
const IMPACT_DROPLET_CAPACITY = 48;
const IMPACT_FLASH_CAPACITY = 8;
const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);

export type GoopCrosshairState =
  | 'hidden'
  | 'neutral'
  | 'ready'
  | 'cooldown';

export function resolveGoopCrosshairState(
  aim: AcidAimReadModel,
  allowed: boolean,
): GoopCrosshairState {
  if (!allowed || !aim.active) return 'hidden';
  if (aim.targetedSolubleId === undefined) return 'neutral';
  return aim.canFire ? 'ready' : 'cooldown';
}

export interface GoopAcidPresentationSource {
  readonly aimReadModel: AcidAimReadModel;
  readonly projectileStates: readonly AcidProjectileReadState[];
  readonly events: Pick<EventBus<AcidProjectileEvents>, 'on'>;
}

export interface GoopAcidPresentationOptions {
  readonly host: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraRig: CameraRig;
  readonly source: GoopAcidPresentationSource;
  readonly targets: readonly DissolveTarget[];
  readonly document?: Document;
}

export interface GoopAcidPresentationDiagnostics {
  readonly crosshairState: GoopCrosshairState;
  readonly crosshairElementCount: number;
  readonly highlightedTargetCount: number;
  readonly selectedTargetCount: number;
  readonly burningTargetCount: number;
  readonly activeProjectileCount: number;
  readonly activeTrailCount: number;
  readonly activeDropletCount: number;
  readonly activeFlashCount: number;
  readonly projectileSlotCount: number;
  readonly dropletCapacity: number;
  readonly flashCapacity: number;
  readonly corrosionUniformUpdateCount: number;
  readonly projectileSlotUpdateCount: number;
  readonly dropletMatrixUploadCount: number;
}

interface TargetPresentationState {
  readonly target: DissolveTarget;
  aimStrength: number;
  selectedStrength: number;
  burning: boolean;
  burnStartProgress: number;
  burnElapsedSeconds: number;
  burnStrength: number;
}

interface ProjectilePresentationSlot {
  readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  readonly halo: THREE.Sprite;
  readonly trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly trailPositions: THREE.BufferAttribute;
}

interface ImpactDroplet {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  ageSeconds: number;
  lifetimeSeconds: number;
  initialScale: number;
  active: boolean;
}

interface ImpactFlash {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly worldPoint: THREE.Vector3;
  readonly localPoint: THREE.Vector3;
  target: DissolveTarget | undefined;
  ageSeconds: number;
  lifetimeSeconds: number;
  maximumScale: number;
  maximumOpacity: number;
  active: boolean;
}

/**
 * Presentation-only adapter for #91's stable Goop aim/projectile state.
 *
 * It performs no eligibility queries, raycasts, collision, projectile motion,
 * burn scheduling, or dissolve progression. All transient resources are fixed
 * at construction and reconciled against the authoritative read models.
 */
export class GoopAcidPresentation {
  readonly root = new THREE.Group();
  readonly crosshairElement: HTMLElement;

  private readonly cameraRig: CameraRig;
  private readonly source: GoopAcidPresentationSource;
  private readonly targets: readonly TargetPresentationState[];
  private readonly targetById = new Map<string, TargetPresentationState>();
  private readonly activeTargetStates = new Set<TargetPresentationState>();
  private readonly projectileSlots: readonly ProjectilePresentationSlot[];
  private readonly activeProjectileIndices = new Set<number>();
  private readonly unsubscribeEvents: readonly (() => void)[];

  private readonly coreGeometry = new THREE.SphereGeometry(0.11, 16, 10);
  private readonly coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8dc38,
    emissive: 0x85ff21,
    emissiveIntensity: 2.4,
    roughness: 0.22,
    metalness: 0,
  });
  private readonly haloTexture = createRadialTexture();
  private readonly haloMaterial = new THREE.SpriteMaterial({
    map: this.haloTexture,
    color: 0xc8ff49,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly trailMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  private readonly dropletGeometry = new THREE.SphereGeometry(0.045, 7, 5);
  private readonly dropletMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  private readonly dropletMesh = new THREE.InstancedMesh(
    this.dropletGeometry,
    this.dropletMaterial,
    IMPACT_DROPLET_CAPACITY,
  );
  private readonly droplets: readonly ImpactDroplet[];
  private readonly activeDropletIndices = new Set<number>();
  private readonly flashes: readonly ImpactFlash[];
  private readonly activeFlashes = new Set<ImpactFlash>();
  private readonly instanceObject = new THREE.Object3D();
  private readonly impactColour = new THREE.Color();
  private readonly impactDirection = new THREE.Vector3();
  private readonly interpolatedPosition = new THREE.Vector3();

  private crosshairState: GoopCrosshairState = 'hidden';
  private presentationTimeSeconds = 0;
  private nextDropletIndex = 0;
  private nextFlashIndex = 0;
  private dropletMatricesDirty = false;
  private corrosionUniformUpdateCount = 0;
  private projectileSlotUpdateCount = 0;
  private dropletMatrixUploadCount = 0;
  private suspended = false;
  private transientPresentationSuppressed = true;
  private disposed = false;

  constructor(options: GoopAcidPresentationOptions) {
    this.cameraRig = options.cameraRig;
    this.source = options.source;
    this.root.name = 'goop-acid-presentation';

    for (const target of options.targets) {
      if (this.targetById.has(target.id)) {
        throw new Error(`Duplicate Goop presentation target ID "${target.id}".`);
      }
      this.targetById.set(target.id, {
        target,
        aimStrength: 0,
        selectedStrength: 0,
        burning: false,
        burnStartProgress: target.progress,
        burnElapsedSeconds: 0,
        burnStrength: 0,
      });
    }
    this.targets = [...this.targetById.values()];

    this.projectileSlots = this.source.projectileStates.map(() =>
      this.createProjectileSlot(),
    );
    for (let index = 0; index < this.source.projectileStates.length; index += 1) {
      if (this.source.projectileStates[index]?.active) {
        this.activeProjectileIndices.add(index);
      }
    }

    this.dropletMesh.name = 'goop-acid-impact-droplets';
    this.dropletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropletMesh.frustumCulled = false;
    this.dropletMesh.count = 0;
    this.root.add(this.dropletMesh);
    this.droplets = Array.from(
      { length: IMPACT_DROPLET_CAPACITY },
      () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        ageSeconds: 0,
        lifetimeSeconds: 0,
        initialScale: 0,
        active: false,
      }),
    );
    // Impacts always use per-instance colours. Reserve that eventual render
    // state now so Level 1's hidden shader prewarm sees the same attribute
    // signature as the first gameplay impact.
    this.dropletMesh.setColorAt(0, this.impactColour.setHex(0xffffff));
    if (this.dropletMesh.instanceColor) {
      this.dropletMesh.instanceColor.needsUpdate = true;
    }
    this.initializeDropletMatrices();
    this.flashes = Array.from(
      { length: IMPACT_FLASH_CAPACITY },
      () => this.createImpactFlash(),
    );
    this.clearImpactEffects();

    const hostDocument =
      options.document ?? options.host.ownerDocument ?? document;
    this.crosshairElement = hostDocument.createElement('div');
    this.crosshairElement.className = 'goop-aim-crosshair';
    this.crosshairElement.dataset.state = 'neutral';
    this.crosshairElement.hidden = true;
    this.crosshairElement.setAttribute('aria-hidden', 'true');
    options.host.append(this.crosshairElement);

    this.unsubscribeEvents = [
      this.source.events.on('projectileFired', ({ projectileId }) => {
        this.trackProjectile(projectileId);
        if (this.crosshairState !== 'hidden') {
          this.crosshairElement.classList.remove('is-firing');
          // Force a bounded CSS animation restart only at the discrete shot.
          void this.crosshairElement.offsetWidth;
          this.crosshairElement.classList.add('is-firing');
        }
      }),
      this.source.events.on('worldImpact', ({ projectileId, point }) => {
        this.untrackProjectile(projectileId);
        this.spawnImpact(point, projectileId, 'world');
      }),
      this.source.events.on(
        'solubleImpact',
        ({ projectileId, targetId, point, burnStarted }) => {
          this.untrackProjectile(projectileId);
          this.spawnImpact(
            point,
            projectileId,
            burnStarted ? 'valid' : 'repeat',
            this.targetById.get(targetId)?.target,
          );
        },
      ),
      this.source.events.on('burnStarted', ({ targetId }) => {
        const state = this.targetById.get(targetId);
        if (!state) return;
        state.burning = true;
        state.burnStartProgress = state.target.progress;
        state.burnElapsedSeconds = 0;
        this.activeTargetStates.add(state);
      }),
      this.source.events.on('burnCompleted', ({ targetId }) => {
        this.clearBurn(targetId);
      }),
      this.source.events.on('burnReset', ({ targetId }) => {
        this.clearBurn(targetId);
        this.clearFlashesForTarget(targetId);
      }),
    ];

    options.scene.add(this.root);
  }

  update(
    interpolationAlpha: number,
    deltaSeconds: number,
    aimPresentationAllowed: boolean,
    advanceEffects = true,
  ): void {
    this.assertNotDisposed('update');
    const safeAlpha = THREE.MathUtils.clamp(interpolationAlpha, 0, 1);
    const safeDeltaSeconds = Math.max(0, deltaSeconds);
    const allowed = aimPresentationAllowed && !this.suspended;
    const aimActive = allowed && this.source.aimReadModel.active;

    this.cameraRig.setAimPresentationActive(aimActive, !allowed);
    this.syncCrosshair(resolveGoopCrosshairState(this.source.aimReadModel, allowed));
    if (!allowed) {
      this.suppressTransientPresentation();
      return;
    }

    this.transientPresentationSuppressed = false;
    if (advanceEffects) this.presentationTimeSeconds += safeDeltaSeconds;
    this.updateTargetPresentation(aimActive, safeDeltaSeconds, advanceEffects);
    this.updateProjectiles(safeAlpha);
    this.updateImpactEffects(safeDeltaSeconds, advanceEffects);
  }

  /** Hide transient visuals while preserving #91 live states for reconciliation. */
  suspend(): void {
    if (this.disposed) return;
    this.suspended = true;
    this.cameraRig.setAimPresentationActive(false, true);
    this.syncCrosshair('hidden');
    this.suppressTransientPresentation();
  }

  resume(): void {
    if (this.disposed) return;
    this.suspended = false;
  }

  /** Reconcile all transient state after #91 and puzzle reset. */
  reset(): void {
    if (this.disposed) return;
    this.suspended = false;
    this.presentationTimeSeconds = 0;
    this.cameraRig.setAimPresentationActive(false, true);
    this.syncCrosshair('hidden');
    for (const state of this.targets) {
      state.aimStrength = 0;
      state.selectedStrength = 0;
      state.burning = false;
      state.burnElapsedSeconds = 0;
      state.burnStartProgress = state.target.progress;
      state.burnStrength = 0;
      state.target.clearCorrosionPresentation();
    }
    this.activeTargetStates.clear();
    for (const slot of this.projectileSlots) this.hideProjectileSlot(slot);
    this.activeProjectileIndices.clear();
    this.clearImpactEffects();
    this.transientPresentationSuppressed = true;
  }

  getDiagnostics(): GoopAcidPresentationDiagnostics {
    this.assertNotDisposed('read diagnostics');
    let highlightedTargetCount = 0;
    let selectedTargetCount = 0;
    let burningTargetCount = 0;
    for (const state of this.targets) {
      if (state.aimStrength > 0.001) highlightedTargetCount += 1;
      if (state.selectedStrength > 0.001) selectedTargetCount += 1;
      if (state.burning) burningTargetCount += 1;
    }
    const activeProjectileCount = this.projectileSlots.filter(
      (slot) => slot.core.visible,
    ).length;
    return {
      crosshairState: this.crosshairState,
      crosshairElementCount: this.crosshairElement.isConnected ? 1 : 0,
      highlightedTargetCount,
      selectedTargetCount,
      burningTargetCount,
      activeProjectileCount,
      activeTrailCount: this.projectileSlots.filter(
        (slot) => slot.trail.visible,
      ).length,
      activeDropletCount: this.activeDropletIndices.size,
      activeFlashCount: this.activeFlashes.size,
      projectileSlotCount: this.projectileSlots.length,
      dropletCapacity: this.droplets.length,
      flashCapacity: this.flashes.length,
      corrosionUniformUpdateCount: this.corrosionUniformUpdateCount,
      projectileSlotUpdateCount: this.projectileSlotUpdateCount,
      dropletMatrixUploadCount: this.dropletMatrixUploadCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    for (const unsubscribe of this.unsubscribeEvents) unsubscribe();
    this.crosshairElement.remove();
    this.root.removeFromParent();
    this.root.clear();
    for (const slot of this.projectileSlots) slot.trail.geometry.dispose();
    for (const flash of this.flashes) flash.material.dispose();
    this.coreGeometry.dispose();
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
    this.haloTexture.dispose();
    this.trailMaterial.dispose();
    this.dropletGeometry.dispose();
    this.dropletMaterial.dispose();
    this.disposed = true;
  }

  private updateTargetPresentation(
    aimActive: boolean,
    deltaSeconds: number,
    advanceEffects: boolean,
  ): void {
    const visibleIds = this.source.aimReadModel.visibleSolubleIds;
    const selectedId = this.source.aimReadModel.targetedSolubleId;
    const states: Iterable<TargetPresentationState> = aimActive
      ? this.targets
      : this.activeTargetStates;
    for (const state of states) {
      const candidate =
        aimActive &&
        !state.target.completed &&
        visibleIds.includes(state.target.id);
      const selected = candidate && selectedId === state.target.id;
      const previousAimStrength = state.aimStrength;
      const previousSelectedStrength = state.selectedStrength;
      const previousBurnStrength = state.burnStrength;
      state.aimStrength = approach(
        state.aimStrength,
        selected ? 1 : candidate ? CANDIDATE_HIGHLIGHT_STRENGTH : 0,
        deltaSeconds / HIGHLIGHT_TRANSITION_SECONDS,
      );
      state.selectedStrength = approach(
        state.selectedStrength,
        selected ? 1 : 0,
        deltaSeconds / HIGHLIGHT_TRANSITION_SECONDS,
      );

      if (advanceEffects && state.burning) {
        state.burnElapsedSeconds += deltaSeconds;
      }
      if (state.target.completed) state.burning = false;
      const progressFade = state.burning
        ? 1 -
          THREE.MathUtils.clamp(
            (state.target.progress - state.burnStartProgress) /
              BURN_PROGRESS_SPAN,
            0,
            1,
          )
        : 0;
      const timeFade = state.burning
        ? 1 -
          THREE.MathUtils.clamp(
            state.burnElapsedSeconds / BURN_PRESENTATION_SECONDS,
            0,
            1,
          )
        : 0;
      state.burnStrength = Math.min(progressFade, timeFade);
      const visuallyActive =
        state.aimStrength > 0 ||
        state.selectedStrength > 0 ||
        state.burnStrength > 0 ||
        state.burning;
      if (visuallyActive) this.activeTargetStates.add(state);
      else this.activeTargetStates.delete(state);

      const strengthsChanged =
        state.aimStrength !== previousAimStrength ||
        state.selectedStrength !== previousSelectedStrength ||
        state.burnStrength !== previousBurnStrength;
      const animatedUniformsActive =
        advanceEffects &&
        deltaSeconds > 0 &&
        (state.selectedStrength > 0 || state.burnStrength > 0);
      if (strengthsChanged || animatedUniformsActive) {
        state.target.setCorrosionPresentation(
          state.aimStrength,
          state.selectedStrength,
          state.burnStrength,
          this.presentationTimeSeconds,
        );
        this.corrosionUniformUpdateCount += 1;
      }
    }
  }

  private updateProjectiles(interpolationAlpha: number): void {
    for (const index of this.activeProjectileIndices) {
      const authoritative = this.source.projectileStates[index];
      const slot = this.projectileSlots[index];
      if (!authoritative?.active || !slot) {
        if (slot) this.hideProjectileSlot(slot);
        this.activeProjectileIndices.delete(index);
        continue;
      }
      this.projectileSlotUpdateCount += 1;

      this.interpolatedPosition.set(
        THREE.MathUtils.lerp(
          authoritative.previousPosition.x,
          authoritative.position.x,
          interpolationAlpha,
        ),
        THREE.MathUtils.lerp(
          authoritative.previousPosition.y,
          authoritative.position.y,
          interpolationAlpha,
        ),
        THREE.MathUtils.lerp(
          authoritative.previousPosition.z,
          authoritative.position.z,
          interpolationAlpha,
        ),
      );
      slot.core.visible = true;
      slot.halo.visible = true;
      slot.trail.visible = true;
      slot.core.position.copy(this.interpolatedPosition);
      slot.halo.position.copy(this.interpolatedPosition);
      this.impactDirection.set(
        authoritative.direction.x,
        authoritative.direction.y,
        authoritative.direction.z,
      );
      if (this.impactDirection.lengthSq() > 1e-10) {
        this.impactDirection.normalize();
        slot.core.quaternion.setFromUnitVectors(
          PROJECTILE_FORWARD,
          this.impactDirection,
        );
      }

      const positions = slot.trailPositions.array as Float32Array;
      for (let pointIndex = 0; pointIndex < PROJECTILE_TRAIL_POINTS; pointIndex += 1) {
        const alpha = pointIndex / (PROJECTILE_TRAIL_POINTS - 1);
        const offset = pointIndex * 3;
        positions[offset] = THREE.MathUtils.lerp(
          authoritative.previousPosition.x,
          this.interpolatedPosition.x,
          alpha,
        );
        positions[offset + 1] = THREE.MathUtils.lerp(
          authoritative.previousPosition.y,
          this.interpolatedPosition.y,
          alpha,
        );
        positions[offset + 2] = THREE.MathUtils.lerp(
          authoritative.previousPosition.z,
          this.interpolatedPosition.z,
          alpha,
        );
      }
      slot.trailPositions.needsUpdate = true;
    }
  }

  private updateImpactEffects(
    deltaSeconds: number,
    advanceEffects: boolean,
  ): void {
    let dropletMatricesChanged = false;
    const advanceDroplets = advanceEffects && deltaSeconds > 0;
    for (const index of this.activeDropletIndices) {
      const droplet = this.droplets[index];
      if (!droplet?.active) {
        this.activeDropletIndices.delete(index);
        continue;
      }
      if (advanceDroplets) {
        droplet.ageSeconds += deltaSeconds;
        droplet.position.addScaledVector(droplet.velocity, deltaSeconds);
        droplet.velocity.y -= 4.5 * deltaSeconds;
      }
      if (droplet.ageSeconds >= droplet.lifetimeSeconds) {
        droplet.active = false;
        this.activeDropletIndices.delete(index);
      }
      const remaining = droplet.active
        ? 1 - droplet.ageSeconds / droplet.lifetimeSeconds
        : 0;
      if (advanceDroplets || this.dropletMatricesDirty || !droplet.active) {
        this.writeDropletMatrix(index, droplet, remaining);
        dropletMatricesChanged = true;
      }
    }
    this.dropletMatricesDirty = false;
    if (dropletMatricesChanged) {
      this.dropletMesh.instanceMatrix.needsUpdate = true;
      this.dropletMatrixUploadCount += 1;
    }
    if (this.activeDropletIndices.size === 0) this.dropletMesh.count = 0;

    for (const flash of this.activeFlashes) {
      if (advanceEffects) flash.ageSeconds += deltaSeconds;
      if (
        flash.ageSeconds >= flash.lifetimeSeconds ||
        flash.target?.completed
      ) {
        this.hideFlash(flash);
        continue;
      }
      if (flash.target) {
        flash.target.mesh.updateWorldMatrix(true, false);
        flash.sprite.position
          .copy(flash.localPoint)
          .applyMatrix4(flash.target.mesh.matrixWorld);
      } else {
        flash.sprite.position.copy(flash.worldPoint);
      }
      const normalized = flash.ageSeconds / flash.lifetimeSeconds;
      const strength = 1 - normalized;
      const scale = flash.maximumScale * (0.65 + normalized * 0.7);
      flash.material.opacity = flash.maximumOpacity * strength;
      flash.sprite.scale.set(scale, scale, 1);
    }
  }

  private spawnImpact(
    point: ReadonlyVector3State,
    seed: number,
    kind: 'world' | 'valid' | 'repeat',
    target?: DissolveTarget,
  ): void {
    if (this.disposed || this.suspended) return;
    this.transientPresentationSuppressed = false;
    const dropletCount = kind === 'valid' ? 9 : kind === 'repeat' ? 5 : 4;
    const speed = kind === 'valid' ? 1.7 : kind === 'repeat' ? 1.2 : 0.85;
    const lifetime = kind === 'valid' ? 0.42 : kind === 'repeat' ? 0.3 : 0.26;
    const scale = kind === 'valid' ? 1.15 : kind === 'repeat' ? 0.86 : 0.68;
    for (let index = 0; index < dropletCount; index += 1) {
      const dropletIndex = this.nextDropletIndex;
      const droplet = this.droplets[dropletIndex];
      if (!droplet) continue;
      this.nextDropletIndex =
        (this.nextDropletIndex + 1) % this.droplets.length;
      droplet.active = true;
      this.activeDropletIndices.add(dropletIndex);
      droplet.ageSeconds = 0;
      droplet.lifetimeSeconds = lifetime * (0.82 + hash01(seed, index, 1) * 0.36);
      droplet.initialScale = scale * (0.75 + hash01(seed, index, 2) * 0.5);
      droplet.position.set(point.x, point.y, point.z);
      deterministicDirection(this.impactDirection, seed, index);
      droplet.velocity.copy(this.impactDirection).multiplyScalar(
        speed * (0.72 + hash01(seed, index, 3) * 0.56),
      );

      this.impactColour.setHex(
        kind === 'valid' ? 0xcaff54 : kind === 'repeat' ? 0xaedc3d : 0x6d8e2d,
      );
      this.dropletMesh.setColorAt(dropletIndex, this.impactColour);
    }
    this.dropletMesh.count = this.droplets.length;
    this.dropletMatricesDirty = true;
    if (this.dropletMesh.instanceColor) {
      this.dropletMesh.instanceColor.needsUpdate = true;
    }

    this.spawnFlash(
      point,
      target,
      kind === 'valid' ? 0.34 : kind === 'repeat' ? 0.22 : 0.18,
      kind === 'valid' ? 0.9 : kind === 'repeat' ? 0.56 : 0.38,
      kind === 'valid' ? 0.72 : kind === 'repeat' ? 0.42 : 0.24,
      kind === 'world' ? 0x759b30 : 0xd0ff5b,
    );
  }

  private spawnFlash(
    point: ReadonlyVector3State,
    target: DissolveTarget | undefined,
    lifetimeSeconds: number,
    maximumScale: number,
    maximumOpacity: number,
    colour: number,
  ): void {
    const flash = this.flashes[this.nextFlashIndex];
    if (!flash) return;
    this.nextFlashIndex = (this.nextFlashIndex + 1) % this.flashes.length;
    flash.active = true;
    this.activeFlashes.add(flash);
    flash.ageSeconds = 0;
    flash.lifetimeSeconds = lifetimeSeconds;
    flash.maximumScale = maximumScale;
    flash.maximumOpacity = maximumOpacity;
    flash.target = target;
    flash.worldPoint.set(point.x, point.y, point.z);
    flash.localPoint.copy(flash.worldPoint);
    if (target) {
      target.mesh.updateWorldMatrix(true, false);
      target.mesh.worldToLocal(flash.localPoint);
    }
    flash.material.color.setHex(colour);
    flash.material.opacity = maximumOpacity;
    flash.sprite.position.copy(flash.worldPoint);
    flash.sprite.visible = true;
  }

  private createProjectileSlot(): ProjectilePresentationSlot {
    const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    core.name = 'goop-acid-projectile-core';
    core.scale.set(0.82, 0.82, 1.28);
    core.visible = false;
    core.renderOrder = 12;

    const halo = new THREE.Sprite(this.haloMaterial);
    halo.name = 'goop-acid-projectile-halo';
    halo.scale.set(0.38, 0.38, 1);
    halo.visible = false;
    halo.renderOrder = 11;

    const positions = new Float32Array(PROJECTILE_TRAIL_POINTS * 3);
    const colours = new Float32Array(PROJECTILE_TRAIL_POINTS * 3);
    for (let index = 0; index < PROJECTILE_TRAIL_POINTS; index += 1) {
      const strength = index / (PROJECTILE_TRAIL_POINTS - 1);
      const offset = index * 3;
      colours[offset] = 0.26 + strength * 0.48;
      colours[offset + 1] = 0.45 + strength * 0.55;
      colours[offset + 2] = 0.08 + strength * 0.18;
    }
    const geometry = new THREE.BufferGeometry();
    const trailPositions = new THREE.BufferAttribute(positions, 3);
    trailPositions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', trailPositions);
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const trail = new THREE.Line(geometry, this.trailMaterial);
    trail.name = 'goop-acid-projectile-trail';
    trail.visible = false;
    trail.frustumCulled = false;
    trail.renderOrder = 10;
    this.root.add(trail, halo, core);
    return { core, halo, trail, trailPositions };
  }

  private createImpactFlash(): ImpactFlash {
    const material = new THREE.SpriteMaterial({
      map: this.haloTexture,
      color: 0xd0ff5b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = 'goop-acid-impact-flash';
    sprite.visible = false;
    sprite.renderOrder = 13;
    this.root.add(sprite);
    return {
      sprite,
      material,
      worldPoint: new THREE.Vector3(),
      localPoint: new THREE.Vector3(),
      target: undefined,
      ageSeconds: 0,
      lifetimeSeconds: 0,
      maximumScale: 0,
      maximumOpacity: 0,
      active: false,
    };
  }

  private hideProjectileSlot(slot: ProjectilePresentationSlot): void {
    slot.core.visible = false;
    slot.halo.visible = false;
    slot.trail.visible = false;
  }

  private trackProjectile(projectileId: number): void {
    const index = this.source.projectileStates.findIndex(
      (state) => state.id === projectileId && state.active,
    );
    if (index >= 0) this.activeProjectileIndices.add(index);
  }

  private untrackProjectile(projectileId: number): void {
    for (const index of this.activeProjectileIndices) {
      if (this.source.projectileStates[index]?.id !== projectileId) continue;
      const slot = this.projectileSlots[index];
      if (slot) this.hideProjectileSlot(slot);
      this.activeProjectileIndices.delete(index);
      return;
    }
  }

  private suppressTransientPresentation(): void {
    if (this.transientPresentationSuppressed) return;
    this.transientPresentationSuppressed = true;

    for (const state of this.activeTargetStates) {
      state.aimStrength = 0;
      state.selectedStrength = 0;
      state.burnStrength = 0;
      state.target.setCorrosionPresentation(
        0,
        0,
        0,
        this.presentationTimeSeconds,
      );
      this.corrosionUniformUpdateCount += 1;
      if (!state.burning) this.activeTargetStates.delete(state);
    }
    for (const index of this.activeProjectileIndices) {
      const slot = this.projectileSlots[index];
      if (slot) this.hideProjectileSlot(slot);
    }
    this.clearImpactEffects();
  }

  private clearImpactEffects(): void {
    let dropletMatricesChanged = false;
    for (const index of this.activeDropletIndices) {
      const droplet = this.droplets[index];
      if (!droplet) continue;
      droplet.active = false;
      droplet.ageSeconds = 0;
      droplet.lifetimeSeconds = 0;
      this.writeDropletMatrix(index, droplet, 0);
      dropletMatricesChanged = true;
    }
    this.activeDropletIndices.clear();
    this.dropletMatricesDirty = false;
    this.dropletMesh.count = 0;
    if (dropletMatricesChanged) {
      this.dropletMesh.instanceMatrix.needsUpdate = true;
      this.dropletMatrixUploadCount += 1;
    }
    for (const flash of this.activeFlashes) this.hideFlash(flash);
  }

  private initializeDropletMatrices(): void {
    for (let index = 0; index < this.droplets.length; index += 1) {
      const droplet = this.droplets[index];
      if (droplet) this.writeDropletMatrix(index, droplet, 0);
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
    this.dropletMatrixUploadCount += 1;
  }

  private writeDropletMatrix(
    index: number,
    droplet: ImpactDroplet,
    remaining: number,
  ): void {
    const scale = droplet.initialScale * Math.max(0, remaining);
    this.instanceObject.position.copy(droplet.position);
    this.instanceObject.scale.setScalar(scale);
    this.instanceObject.updateMatrix();
    this.dropletMesh.setMatrixAt(index, this.instanceObject.matrix);
  }

  private hideFlash(flash: ImpactFlash): void {
    flash.active = false;
    this.activeFlashes.delete(flash);
    flash.target = undefined;
    flash.ageSeconds = 0;
    flash.material.opacity = 0;
    flash.sprite.visible = false;
  }

  private clearBurn(targetId: string): void {
    const state = this.targetById.get(targetId);
    if (!state) return;
    state.burning = false;
    state.burnElapsedSeconds = 0;
    state.burnStartProgress = state.target.progress;
    state.burnStrength = 0;
    state.target.setCorrosionPresentation(
      state.aimStrength,
      state.selectedStrength,
      0,
      this.presentationTimeSeconds,
    );
    this.corrosionUniformUpdateCount += 1;
    if (state.aimStrength <= 0 && state.selectedStrength <= 0) {
      this.activeTargetStates.delete(state);
    }
  }

  private clearFlashesForTarget(targetId: string): void {
    const target = this.targetById.get(targetId)?.target;
    if (!target) return;
    for (const flash of this.flashes) {
      if (flash.target === target) this.hideFlash(flash);
    }
  }

  private syncCrosshair(state: GoopCrosshairState): void {
    if (this.crosshairState === state) return;
    this.crosshairState = state;
    const hidden = state === 'hidden';
    this.crosshairElement.hidden = hidden;
    this.crosshairElement.classList.remove('is-firing');
    if (!hidden) this.crosshairElement.dataset.state = state;
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} disposed Goop acid presentation.`);
    }
  }
}

function approach(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  if (current < target) return Math.min(target, current + maximumDelta);
  if (current > target) return Math.max(target, current - maximumDelta);
  return current;
}

function createRadialTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / centre;
      const alpha = THREE.MathUtils.clamp(1 - distance, 0, 1);
      const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(smoothAlpha * 255);
    }
  }
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = 'goop-acid-radial-presentation-texture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function deterministicDirection(
  target: THREE.Vector3,
  seed: number,
  index: number,
): THREE.Vector3 {
  const azimuth = hash01(seed, index, 4) * Math.PI * 2;
  const elevation = 0.18 + hash01(seed, index, 5) * 0.72;
  const planar = Math.sqrt(Math.max(0, 1 - elevation * elevation));
  return target.set(
    Math.cos(azimuth) * planar,
    elevation,
    Math.sin(azimuth) * planar,
  );
}

function hash01(seed: number, index: number, salt: number): number {
  let value = Math.imul(seed + salt * 374761393, 668265263);
  value ^= Math.imul(index + salt * 1274126177, 2246822519);
  value ^= value >>> 13;
  value = Math.imul(value, 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}
