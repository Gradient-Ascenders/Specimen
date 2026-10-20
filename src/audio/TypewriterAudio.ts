import { Object3D, Vector3 } from 'three';

import { gameplayAudioEvents, type AudioPosition } from './GameplayAudioEvents.ts';
import type { SoundId } from './SoundCatalog.ts';

interface TypewriterAudioOptions {
  readonly sound: SoundId;
  readonly intervalSeconds: number;
  readonly maxDistance: number;
  readonly volumeScale?: number;
  readonly localPosition?: AudioPosition;
}

interface TypewriterReadModel {
  readonly text: string;
  readonly pageIndex: number;
}

/** One positional accent for newly revealed text, never a queued character backlog. */
export class TypewriterAudio {
  private readonly owner: Object3D;
  private readonly options: TypewriterAudioOptions;
  private readonly localPosition = new Vector3();
  private readonly position = new Vector3();
  private previousText = '';
  private previousPage = 0;
  private cooldownSeconds = 0;

  constructor(owner: Object3D, options: TypewriterAudioOptions) {
    this.owner = owner;
    this.options = options;
    if (options.localPosition) this.localPosition.copy(options.localPosition);
  }

  update(deltaSeconds: number, model: TypewriterReadModel, audible = true): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid typewriter audio timestep.');
    this.cooldownSeconds = Math.max(0, this.cooldownSeconds - deltaSeconds);
    const { text, pageIndex } = model;
    if (text === this.previousText && pageIndex === this.previousPage) return;
    const added = text.slice(pageIndex === this.previousPage ? this.previousText.length : 0);
    this.previousText = text;
    this.previousPage = pageIndex;
    if (!audible || this.cooldownSeconds > 0 || !/\S/.test(added)) return;
    for (let ancestor: Object3D | null = this.owner; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) return;
    }
    this.owner.localToWorld(this.position.copy(this.localPosition));
    gameplayAudioEvents.emit('cue', {
      sound: this.options.sound, position: this.position,
      maxDistance: this.options.maxDistance, volumeScale: this.options.volumeScale ?? 1,
    });
    this.cooldownSeconds = this.options.intervalSeconds;
  }

  reset(): void {
    this.previousText = '';
    this.previousPage = 0;
    this.cooldownSeconds = 0;
  }
}
