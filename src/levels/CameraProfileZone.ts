import * as THREE from 'three';

import type {
  ContextualCameraAnchor,
  ContextualCameraContext,
  ContextualCameraProfile,
} from '../render/CameraProfile.ts';
import {
  LevelTriggerVolume,
  type TriggerContactTarget,
} from './LevelTriggerVolume.ts';

export interface CameraProfileZoneOptions {
  readonly id: string;
  readonly centre: THREE.Vector3;
  readonly size: THREE.Vector3;
  readonly profile: ContextualCameraProfile;
  readonly anchor: ContextualCameraAnchor;
}

/**
 * Authored trigger-backed resolver for a reusable contextual camera profile.
 *
 * The zone owns no camera state. It returns one stable context while occupied,
 * allowing the level runtime to hand that context to CameraRig without camera
 * code learning about rooms, elevators, or other authored set pieces.
 */
export class CameraProfileZone {
  readonly volume: LevelTriggerVolume;

  private readonly context: ContextualCameraContext;

  constructor(options: CameraProfileZoneOptions) {
    this.volume = new LevelTriggerVolume({
      id: options.id,
      centre: options.centre,
      size: options.size,
    });
    this.context = {
      profile: options.profile,
      anchor: options.anchor,
    };
  }

  get id(): string {
    return this.volume.id;
  }

  get occupied(): boolean {
    return this.volume.occupied;
  }

  resolve(target: TriggerContactTarget): ContextualCameraContext | undefined {
    this.volume.update(target);
    return this.volume.occupied ? this.context : undefined;
  }

  reset(): void {
    this.volume.reset();
  }

  dispose(): void {
    this.volume.dispose();
  }
}
