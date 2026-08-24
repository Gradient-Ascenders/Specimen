import * as THREE from 'three';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';

const TETHER_LOCAL_UP = new THREE.Vector3(0, 1, 0);

export type GreyboxDropPreviewState = 'suspended' | 'falling' | 'landed';

export interface GreyboxDropPreviewOptions {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly solubleTargetId: string;
  readonly suspendedPosition: THREE.Vector3;
  readonly landingPosition: THREE.Vector3;
  readonly fallDurationSeconds: number;
  readonly fallTiltRadians?: number;
  /** Optional unit-height visual tether stretching from an authored anchor. */
  readonly tetherMesh?: THREE.Mesh;
  readonly tetherAnchorPosition?: THREE.Vector3;
  readonly tetherAttachmentOffsetY?: number;
}

/**
 * Development-only authored drop used to playtest Level 2 geometry while the
 * reusable production assembly from Issue #94 is developed independently.
 * The dissolve target remains the sole release authority.
 */
export class GreyboxDropPreview {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly solubleTargetId: string;

  private readonly suspendedPosition: THREE.Vector3;
  private readonly landingPosition: THREE.Vector3;
  private readonly fallDurationSeconds: number;
  private readonly fallTiltRadians: number;
  private readonly tetherMesh: THREE.Mesh | undefined;
  private readonly tetherAnchorPosition: THREE.Vector3 | undefined;
  private readonly tetherAttachmentOffsetY: number;
  private readonly tetherAttachmentPosition = new THREE.Vector3();
  private readonly tetherDirection = new THREE.Vector3();
  private unsubscribeCompleted: (() => void) | undefined;
  private stateValue: GreyboxDropPreviewState = 'suspended';
  private elapsedSeconds = 0;

  constructor(options: GreyboxDropPreviewOptions) {
    if (!options.id || !options.solubleTargetId) {
      throw new Error('Greybox drop previews require stable IDs.');
    }
    if (
      !Number.isFinite(options.fallDurationSeconds) ||
      options.fallDurationSeconds <= 0
    ) {
      throw new Error('Greybox drop duration must be positive and finite.');
    }
    if (
      (options.tetherMesh === undefined) !==
      (options.tetherAnchorPosition === undefined)
    ) {
      throw new Error(
        'Greybox drop tether meshes require an authored anchor position.',
      );
    }

    this.id = options.id;
    this.mesh = options.mesh;
    this.solubleTargetId = options.solubleTargetId;
    this.suspendedPosition = options.suspendedPosition.clone();
    this.landingPosition = options.landingPosition.clone();
    this.fallDurationSeconds = options.fallDurationSeconds;
    this.fallTiltRadians = options.fallTiltRadians ?? 0.08;
    this.tetherMesh = options.tetherMesh;
    this.tetherAnchorPosition = options.tetherAnchorPosition?.clone();
    this.tetherAttachmentOffsetY = options.tetherAttachmentOffsetY ?? 0;
    this.reset();
  }

  get state(): GreyboxDropPreviewState {
    return this.stateValue;
  }

  bind(targets: readonly DissolveTarget[]): void {
    this.unsubscribeCompleted?.();
    const target = targets.find(
      (candidate) => candidate.id === this.solubleTargetId,
    );
    if (!target) {
      throw new Error(
        `Missing dissolve target "${this.solubleTargetId}" for "${this.id}".`,
      );
    }

    this.unsubscribeCompleted = target.events.on('completed', () => {
      if (this.stateValue !== 'suspended') return;
      this.stateValue = 'falling';
      this.elapsedSeconds = 0;
      this.mesh.userData.previewState = 'falling';
    });
  }

  update(deltaSeconds: number): void {
    if (this.stateValue !== 'falling') return;
    this.elapsedSeconds = Math.min(
      this.elapsedSeconds + deltaSeconds,
      this.fallDurationSeconds,
    );
    const progress = this.elapsedSeconds / this.fallDurationSeconds;
    const acceleratedProgress = progress * progress;
    this.mesh.position.lerpVectors(
      this.suspendedPosition,
      this.landingPosition,
      acceleratedProgress,
    );
    this.mesh.rotation.z =
      Math.sin(progress * Math.PI) * this.fallTiltRadians;
    this.syncTether();

    if (progress < 1) return;
    this.mesh.position.copy(this.landingPosition);
    this.mesh.rotation.set(0, 0, 0);
    this.syncTether();
    this.stateValue = 'landed';
    this.mesh.userData.previewState = 'landed';
  }

  reset(): void {
    this.stateValue = 'suspended';
    this.elapsedSeconds = 0;
    this.mesh.position.copy(this.suspendedPosition);
    this.mesh.rotation.set(0, 0, 0);
    this.syncTether();
    this.mesh.userData.previewState = 'suspended';
  }

  dispose(): void {
    this.unsubscribeCompleted?.();
    this.unsubscribeCompleted = undefined;
  }

  private syncTether(): void {
    if (!this.tetherMesh || !this.tetherAnchorPosition) return;

    this.tetherAttachmentPosition.copy(this.mesh.position);
    this.tetherAttachmentPosition.y += this.tetherAttachmentOffsetY;
    this.tetherDirection.subVectors(
      this.tetherAnchorPosition,
      this.tetherAttachmentPosition,
    );
    const length = this.tetherDirection.length();
    this.tetherMesh.position
      .copy(this.tetherAttachmentPosition)
      .addScaledVector(this.tetherDirection, 0.5);
    this.tetherMesh.scale.set(1, length, 1);
    this.tetherMesh.quaternion.setFromUnitVectors(
      TETHER_LOCAL_UP,
      this.tetherDirection.normalize(),
    );
  }
}
