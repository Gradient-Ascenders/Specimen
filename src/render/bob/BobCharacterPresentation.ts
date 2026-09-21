import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type {
  SlimeVisualDiagnostics,
  SlimeVisualImpact,
  SlimeVisualLaunch,
  SlimeVisualState,
  Vector3State,
} from '../slime/SlimeVisual.ts';
import {
  SlimeBurstPresentation,
  type SlimeBurstDiagnostics,
} from '../slime/SlimeBurstPresentation.ts';
import {
  disposeBobGateOneAsset,
  validateBobGateOneAsset,
  type BobGateOneAsset,
} from './BobGateOneAsset.ts';

const BOB_GATE_ONE_ASSET_URL = new URL(
  '../../../assets/characters/bob/bob-gate-one.glb',
  import.meta.url,
).href;
const DEATH_RUPTURE_SECONDS = 0.075;

export type BobGateOneLoader = () => Promise<THREE.Group>;

export interface BobCharacterPresentationDiagnostics
  extends SlimeVisualDiagnostics {
  readonly visible: boolean;
  readonly deathBurst: SlimeBurstDiagnostics;
}

async function loadDefaultBobGateOneAsset(): Promise<THREE.Group> {
  return (await new GLTFLoader().loadAsync(BOB_GATE_ONE_ASSET_URL)).scene;
}

/**
 * Reusable visual-only boundary for Bob.
 *
 * Gate 1 deliberately presents only the approved neutral geometry. It accepts
 * the same authoritative read model as the provisional slime visual without
 * writing to gameplay state; morphs, expressions and frame transitions remain
 * behind their later visual approval gates.
 */
export class BobCharacterPresentation {
  readonly root = new THREE.Group();
  readonly radiusMetres: number;

  private readonly mesh = new THREE.Group();
  private readonly inverseWorldQuaternion = new THREE.Quaternion();
  private readonly velocityWorld = new THREE.Vector3();
  private readonly surfaceNormalWorld = new THREE.Vector3(0, 1, 0);
  private readonly moveDirectionWorld = new THREE.Vector3(0, 0, -1);
  private readonly diagnosticsState = {
    speed: 0,
    locomotionPhase: 0,
    grounded: 1,
    jumpCharge: 0,
    squash: 0,
    stretch: 0,
    impactStrength: 0,
    impactAge: 1.2,
    impactNormalLocal: new THREE.Vector3(0, 1, 0),
    surfaceNormalLocal: new THREE.Vector3(0, 1, 0),
    surfaceTangentLocal: new THREE.Vector3(0, 0, 1),
    moveDirectionLocal: new THREE.Vector3(0, 0, -1),
  } satisfies SlimeVisualDiagnostics;

  private asset: BobGateOneAsset | undefined;
  private readonly deathBurst = new SlimeBurstPresentation();
  private readonly materials = new Set<THREE.Material>();
  private preparation: Promise<void> | undefined;
  private opacity = 1;
  private deathElapsedSeconds = 0;
  private deathActive = false;
  private disposed = false;

  constructor(radiusMetres: number) {
    if (Math.abs(radiusMetres - 0.45) > 1e-6) {
      throw new Error(
        `Bob Gate 1 presentation requires the 0.45 m gameplay radius; received ${radiusMetres}.`,
      );
    }
    this.radiusMetres = radiusMetres;
    this.root.name = 'player-slime-bob-presentation';
    this.mesh.name = 'player-slime-bob-character';
    this.root.add(this.mesh, this.deathBurst.root);
  }

  get ready(): boolean {
    return this.asset !== undefined && !this.disposed;
  }

  get diagnostics(): BobCharacterPresentationDiagnostics {
    return {
      ...this.diagnosticsState,
      visible: this.mesh.visible,
      deathBurst: this.deathBurst.diagnostics,
    };
  }

  async prepare(
    loader: BobGateOneLoader = loadDefaultBobGateOneAsset,
  ): Promise<void> {
    if (this.ready) return;
    if (this.disposed) {
      throw new Error('Cannot prepare a disposed Bob presentation.');
    }
    if (this.preparation) return this.preparation;

    const preparation = loader().then((root) => {
      let asset: BobGateOneAsset;
      try {
        asset = validateBobGateOneAsset(root);
      } catch (error) {
        disposeBobGateOneAsset(root);
        throw error;
      }

      if (this.disposed) {
        disposeBobGateOneAsset(root);
        return;
      }
      this.asset = asset;
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) this.materials.add(material);
      });
      this.mesh.add(root);
      this.applyOpacity();
    });
    this.preparation = preparation;
    try {
      await preparation;
    } finally {
      if (!this.ready) this.preparation = undefined;
    }
  }

  setPosition(position: Vector3State): void {
    this.mesh.position.set(position.x, position.y, position.z);
  }

  setYaw(yawRadians: number): void {
    this.mesh.rotation.set(0, yawRadians, 0);
  }

  setOpacity(opacity: number): void {
    this.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    this.applyOpacity();
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  update(deltaSeconds: number, state: SlimeVisualState): void {
    this.velocityWorld.set(
      state.velocityWorld.x,
      state.velocityWorld.y,
      state.velocityWorld.z,
    );
    const sourceNormal = state.grounded || state.attached
      ? state.surfaceNormalWorld
      : state.gameplayUpWorld;
    this.surfaceNormalWorld
      .set(sourceNormal.x, sourceNormal.y, sourceNormal.z)
      .normalize();
    this.moveDirectionWorld
      .copy(this.velocityWorld)
      .projectOnPlane(this.surfaceNormalWorld);
    const tangentialSpeed = this.moveDirectionWorld.length();
    if (tangentialSpeed > 1e-6) {
      this.moveDirectionWorld.multiplyScalar(1 / tangentialSpeed);
    }
    this.diagnosticsState.speed = THREE.MathUtils.clamp(
      tangentialSpeed /
        Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6),
      0,
      1,
    );
    this.diagnosticsState.grounded = state.grounded ? 1 : 0;
    this.diagnosticsState.jumpCharge = THREE.MathUtils.clamp(
      state.jumpCharge,
      0,
      1,
    );
    this.diagnosticsState.impactAge += deltaSeconds;
  }

  present(): void {
    this.mesh.getWorldQuaternion(this.inverseWorldQuaternion).invert();
    this.diagnosticsState.surfaceNormalLocal
      .copy(this.surfaceNormalWorld)
      .applyQuaternion(this.inverseWorldQuaternion);
    this.diagnosticsState.moveDirectionLocal
      .copy(this.moveDirectionWorld)
      .applyQuaternion(this.inverseWorldQuaternion);
    this.diagnosticsState.surfaceTangentLocal
      .crossVectors(
        this.diagnosticsState.moveDirectionLocal,
        this.diagnosticsState.surfaceNormalLocal,
      );
    if (this.diagnosticsState.surfaceTangentLocal.lengthSq() > 1e-8) {
      this.diagnosticsState.surfaceTangentLocal.normalize();
    }
  }

  onImpact(impact: SlimeVisualImpact): void {
    this.diagnosticsState.impactStrength = THREE.MathUtils.clamp(
      impact.strength,
      0,
      1,
    );
    this.diagnosticsState.impactAge = 0;
    this.diagnosticsState.impactNormalLocal.set(
      impact.normalWorld.x,
      impact.normalWorld.y,
      impact.normalWorld.z,
    );
  }

  onLanding(
    normalWorld: Vector3State,
    impactSpeedMetresPerSecond: number,
  ): void {
    this.onImpact({
      normalWorld,
      strength: THREE.MathUtils.clamp(
        (impactSpeedMetresPerSecond - 1.5) / (8.5 - 1.5),
        0,
        1,
      ),
      kind: 'landing',
    });
  }

  onLaunch(_launch: SlimeVisualLaunch): void {
    // Gate 1 holds the neutral silhouette; Launch belongs to Gate 3.
  }

  primeDeathResources(
    position: Vector3State,
    render: (root: THREE.Object3D) => void,
  ): boolean {
    return this.deathBurst.primeResources(position, render);
  }

  /** Begin the visual rupture at the authoritative death position. */
  startDeath(position: Vector3State): boolean {
    if (this.deathActive) return false;
    if (!this.deathBurst.start(position)) return false;

    this.deathActive = true;
    this.deathElapsedSeconds = 0;
    this.setPosition(position);
    this.setOpacity(1);
    this.mesh.scale.setScalar(1);
    this.setVisible(true);
    return true;
  }

  /** Continue visual-only death work while gameplay simulation is suspended. */
  updateDeath(deltaSeconds: number): void {
    if (!this.deathActive) return;

    this.deathElapsedSeconds += deltaSeconds;
    this.deathBurst.update(deltaSeconds);

    if (this.deathElapsedSeconds < DEATH_RUPTURE_SECONDS) {
      const anticipation = THREE.MathUtils.smoothstep(
        this.deathElapsedSeconds,
        0,
        DEATH_RUPTURE_SECONDS,
      );
      this.mesh.scale.setScalar(
        1 + Math.sin(anticipation * Math.PI) * 0.12,
      );
      return;
    }

    this.setVisible(false);
  }

  /** Restore the live character after authoritative recovery succeeds. */
  finishDeath(position: Vector3State): void {
    this.deathActive = false;
    this.setPosition(position);
    this.reset();
  }

  reset(): void {
    this.deathActive = false;
    this.deathElapsedSeconds = 0;
    this.deathBurst.reset();
    this.setVisible(true);
    this.mesh.scale.setScalar(1);
    this.setOpacity(1);
    this.velocityWorld.set(0, 0, 0);
    this.surfaceNormalWorld.set(0, 1, 0);
    this.moveDirectionWorld.set(0, 0, -1);
    this.diagnosticsState.speed = 0;
    this.diagnosticsState.locomotionPhase = 0;
    this.diagnosticsState.grounded = 1;
    this.diagnosticsState.jumpCharge = 0;
    this.diagnosticsState.squash = 0;
    this.diagnosticsState.stretch = 0;
    this.diagnosticsState.impactStrength = 0;
    this.diagnosticsState.impactAge = 1.2;
    this.diagnosticsState.impactNormalLocal.set(0, 1, 0);
    this.diagnosticsState.surfaceNormalLocal.set(0, 1, 0);
    this.diagnosticsState.surfaceTangentLocal.set(0, 0, 1);
    this.diagnosticsState.moveDirectionLocal.set(0, 0, -1);
    this.present();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deathBurst.dispose();
    if (this.asset) disposeBobGateOneAsset(this.asset.root);
    this.asset = undefined;
    this.materials.clear();
    this.mesh.removeFromParent();
    this.mesh.clear();
    this.root.removeFromParent();
    this.root.clear();
  }

  private applyOpacity(): void {
    for (const material of this.materials) {
      material.transparent = this.opacity < 1;
      material.opacity = this.opacity;
      material.depthWrite = this.opacity >= 1;
    }
  }
}
