import type { AudioPlayback } from './AudioManager.ts';
import type { AudioPosition } from './GameplayAudioEvents.ts';

export interface ContainmentAudioState {
  readonly roomId: number;
  readonly checkpointId: string;
  readonly activeSlimeId: string | undefined;
  readonly playing: boolean;
  readonly lasers: readonly { readonly id: string; readonly enabled: boolean; readonly start: AudioPosition }[];
}

const SCORE = 'containment:score';
const AIR = 'containment:air';
const MACHINE = 'containment:machine';
const MACHINE_POSITION = { x: 0, y: 2.5, z: -2.6 };

/** Listening preview for Containment Rooms 1–3. Reads authority, never changes it. */
export class ContainmentSoundscape {
  private checkpoint = '';
  private activeSlimeId: string | undefined;
  private readonly laserStates = new Map<string, boolean>();
  private disposed = false;
  private readonly audio: AudioPlayback;
  private readonly readState: () => ContainmentAudioState;

  constructor(
    audio: AudioPlayback,
    readState: () => ContainmentAudioState,
  ) {
    this.audio = audio;
    this.readState = readState;
    this.reset();
  }

  /** Seed restored state silently: Retry/debug/reset are not puzzle successes. */
  reset(): void {
    const state = this.readState();
    this.checkpoint = state.checkpointId;
    this.activeSlimeId = state.activeSlimeId;
    this.laserStates.clear();
    for (const laser of state.lasers) this.laserStates.set(laser.id, laser.enabled);
  }

  update(): void {
    if (this.disposed) return;
    const state = this.readState();
    const inPreview = state.roomId <= 3;
    // Death clears world sounds, but the score keeps its musical position.
    if (state.playing && inPreview) this.audio.startLoop(SCORE, 'containment-score');
    else if (!inPreview) this.audio.stopLoop(SCORE, 1.5);
    if (state.playing && inPreview) {
      this.audio.startLoop(AIR, 'lab-air-loop');
      if (state.roomId === 1) this.audio.startLoop(MACHINE, 'lab-machine-loop', MACHINE_POSITION);
      else this.audio.stopLoop(MACHINE, 0.8);
      if (this.checkpoint !== state.checkpointId) this.audio.play('lab-checkpoint');
      if (this.activeSlimeId !== state.activeSlimeId) this.audio.play('lab-switch');
      if (state.roomId === 3) for (const laser of state.lasers) {
        const previous = this.laserStates.get(laser.id);
        if (previous !== undefined && previous !== laser.enabled) {
          this.audio.play(laser.enabled ? 'lab-laser-on' : 'lab-laser-off', laser.start, true);
        }
      }
    } else {
      this.audio.stopLoop(AIR, 0.8);
      this.audio.stopLoop(MACHINE, 0.8);
    }
    this.checkpoint = state.checkpointId;
    this.activeSlimeId = state.activeSlimeId;
    for (const laser of state.lasers) this.laserStates.set(laser.id, laser.enabled);
  }

  dispose(): void {
    this.disposed = true;
    this.audio.stopLoop(SCORE);
    this.audio.stopLoop(AIR);
    this.audio.stopLoop(MACHINE);
    this.laserStates.clear();
  }
}
