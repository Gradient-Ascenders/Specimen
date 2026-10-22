import { EventBus } from '../core/EventBus.ts';
import type { SoundId } from './SoundCatalog.ts';

export interface AudioPosition { readonly x: number; readonly y: number; readonly z: number }
/** Presentation notifications only. Gameplay never reads audio state. */
export const gameplayAudioEvents = new EventBus<{
  cue: { readonly sound: SoundId; readonly position?: AudioPosition; readonly volumeScale?: number; readonly maxDistance?: number };
  loop: { readonly key: string; readonly sound: SoundId; readonly position?: AudioPosition; readonly volumeScale?: number };
  stop: { readonly key: string };
  stopSound: { readonly sound: SoundId };
}>();
