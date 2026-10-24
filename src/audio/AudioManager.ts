import { SOUND_BANKS, SOUND_DEFINITIONS, soundSpatialProfile, soundUrl, type SoundId } from './SoundCatalog.ts';
import type { AudioPosition } from './GameplayAudioEvents.ts';

interface Voice {
  readonly sound: SoundId;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner?: PannerNode;
  readonly key?: string;
  volumeScale: number;
  readonly ui: boolean;
}
interface LoopRequest { readonly sound: SoundId; readonly position?: AudioPosition; readonly volumeScale: number; readonly playbackRate: number }
type SpatialAudioTarget = {
  readonly positionX?: AudioParam;
  readonly positionY?: AudioParam;
  readonly positionZ?: AudioParam;
  setPosition?: (x: number, y: number, z: number) => void;
};
type ListenerOrientationTarget = {
  readonly forwardX?: AudioParam;
  readonly forwardY?: AudioParam;
  readonly forwardZ?: AudioParam;
  readonly upX?: AudioParam;
  readonly upY?: AudioParam;
  readonly upZ?: AudioParam;
  setOrientation?: (x: number, y: number, z: number, upX: number, upY: number, upZ: number) => void;
};
type AudioContextConstructor = new () => AudioContext;
type AudioContextGlobal = typeof globalThis & {
  readonly webkitAudioContext?: AudioContextConstructor;
};

const createBrowserAudioContext = (): AudioContext => {
  const scope = globalThis as AudioContextGlobal;
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Context) throw new Error('Web Audio is unavailable.');
  return new Context();
};

/** Modern Firefox/Chromium expose AudioParams; older Firefox/Safari use setPosition. */
const setSpatialPosition = (target: SpatialAudioTarget, position: AudioPosition): void => {
  try {
    const { positionX, positionY, positionZ } = target;
    if (positionX && positionY && positionZ) {
      positionX.value = position.x;
      positionY.value = position.y;
      positionZ.value = position.z;
      return;
    }
  } catch {
    // A partial/nonstandard AudioParam implementation can still expose the
    // older atomic setter below. Optional audio must never stop gameplay.
  }
  try {
    target.setPosition?.(position.x, position.y, position.z);
  } catch {
    // Spatial audio is optional. Leave the node at its default position.
  }
};

const setListenerOrientation = (target: ListenerOrientationTarget, forward: AudioPosition, up: AudioPosition): void => {
  try {
    const { forwardX, forwardY, forwardZ, upX, upY, upZ } = target;
    if (forwardX && forwardY && forwardZ && upX && upY && upZ) {
      forwardX.value = forward.x; forwardY.value = forward.y; forwardZ.value = forward.z;
      upX.value = up.x; upY.value = up.y; upZ.value = up.z;
      return;
    }
  } catch {
    // Partial Web Audio implementations may still support the legacy setter.
  }
  try {
    target.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  } catch {
    // Optional spatial audio must not interrupt camera rendering or gameplay.
  }
};

export interface AudioPlayback {
  play(sound: SoundId, position?: AudioPosition, varyPitch?: boolean, volumeScale?: number): void;
  startLoop(key: string, sound: SoundId, position?: AudioPosition, volumeScale?: number, playbackRate?: number): void;
  stopLoop(key: string): void;
  stopSound?(sound: SoundId): void;
  stopAll(): void;
  setPaused(paused: boolean): void;
  setListener(position: AudioPosition, forward?: AudioPosition, up?: AudioPosition): void;
}

/** One application context, cached buffers, bounded voices and keyed loops. */
export class AudioManager implements AudioPlayback {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private effects: GainNode | undefined;
  private gameplayGain: GainNode | undefined;
  private compressor: DynamicsCompressorNode | undefined;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly voices = new Set<Voice>();
  private readonly loops = new Map<string, LoopRequest>();
  private contextAttempted = false;
  private readonly pending = new Map<SoundId, Promise<void>>();
  private readonly loadQueue: Array<{ sound: SoundId; resolve: () => void }> = [];
  private activeLoads = 0;
  private readonly loadingAbort = typeof AbortController === 'undefined'
    ? undefined
    : new AbortController();
  private paused = true;
  private focused = true;
  private unlocked = false;
  private disposed = false;
  private masterVolume = 1;
  private effectsVolume = 0.8;
  private readonly failed = new Set<SoundId>();
  private playedCount = 0;
  private readonly recent = new Map<SoundId, number>();

  private readonly base: string;
  private readonly createContext: () => AudioContext;
  constructor(base = './', createContext = createBrowserAudioContext) {
    this.base = base;
    this.createContext = createContext;
  }

  get diagnostics() {
    return { loaded: this.buffers.size, failed: [...this.failed], voices: this.voices.size,
      loops: this.loops.size, played: this.playedCount, contextState: this.context?.state ?? 'unavailable',
      paused: this.paused, masterVolume: this.masterVolume, effectsVolume: this.effectsVolume,
      pending: this.pending.size, activeLoads: this.activeLoads };
  }

  preload(sounds: readonly SoundId[] = SOUND_BANKS.blackout): Promise<void> {
    if (this.disposed || !this.ensureContext()) return Promise.resolve();
    const promises = sounds.map(sound => {
      if (this.buffers.has(sound) || this.failed.has(sound)) return Promise.resolve();
      let pending = this.pending.get(sound);
      if (!pending) {
        pending = new Promise<void>(resolve => { this.loadQueue.push({ sound, resolve }); });
        this.pending.set(sound, pending);
      }
      return pending;
    });
    this.pumpLoads();
    return Promise.all(promises).then(() => {});
  }

  private ensureContext(): boolean {
    if (this.contextAttempted) return !!this.context;
    this.contextAttempted = true;
    try {
      this.context = this.createContext();
      this.master = this.context.createGain();
      this.effects = this.context.createGain();
      this.gameplayGain = this.context.createGain();
      this.gameplayGain.gain.value = this.paused ? 0 : 1;
      this.gameplayGain.connect(this.effects);
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.ratio.value = 4;
      this.effects.connect(this.compressor);
      this.compressor.connect(this.master);
      this.master.connect(this.context.destination);
      this.setVolumes(this.masterVolume, this.effectsVolume);
    } catch {
      void this.context?.close().catch(() => {});
      this.context = undefined;
      return false; // Audio is optional on unsupported devices.
    }
    this.syncContext();
    return true;
  }

  private pumpLoads(): void {
    // Bound both network requests and concurrent decodes during level loading.
    while (!this.disposed && this.activeLoads < 4 && this.loadQueue.length) {
      const { sound, resolve } = this.loadQueue.shift()!;
      this.activeLoads++;
      void this.loadSound(sound).finally(() => {
        this.activeLoads--;
        this.pending.delete(sound);
        resolve();
        this.pumpLoads();
      });
    }
  }

  private async loadSound(sound: SoundId): Promise<void> {
    try {
      const response = await fetch(soundUrl(sound, this.base), this.loadingAbort
        ? { signal: this.loadingAbort.signal }
        : undefined);
      if (!response.ok) throw new Error('Audio request failed');
      const bytes = await response.arrayBuffer();
      if (this.disposed) return;
      const buffer = await this.decodeAudioData(bytes);
      if (!(buffer.duration > 0)) throw new Error('Empty audio');
      if (!this.disposed) { this.buffers.set(sound, buffer); this.reconcileLoops(); }
    } catch { if (!this.disposed) this.failed.add(sound); }
  }

  /** Call synchronously in a trusted pointer/key event; never replay old shots. */
  unlock(): void {
    if (this.disposed) return;
    // Pointer/key auto-repeat must not allocate a new bank-sized Promise.all
    // on every gesture. Still retry context resume on later trusted events.
    if (!this.unlocked) {
      this.unlocked = true;
      void this.preload(SOUND_BANKS.containment);
    }
    this.syncContext();
  }

  setVolumes(master: number, effects = this.effectsVolume): void {
    const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    this.masterVolume = clamp(master);
    this.effectsVolume = clamp(effects);
    if (this.context && this.master && this.effects) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.025);
      this.effects.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.025);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.gameplayGain) this.gameplayGain.gain.value = paused ? 0 : 1;
    this.syncContext();
  }
  setFocused(focused: boolean): void { this.focused = focused; this.syncContext(); }
  private syncContext(): void {
    const context = this.context;
    if (!context || this.disposed || context.state === 'closed') return;
    const shouldRun = this.unlocked && this.focused && (!this.paused || [...this.voices].some(voice => voice.ui));
    const operation = shouldRun ? context.resume() : context.suspend();
    void operation.then(() => { if (shouldRun) this.reconcileLoops(); }).catch(() => {});
  }

  play(sound: SoundId, position?: AudioPosition, varyPitch = false, volumeScale = 1): void {
    // resume() is asynchronous. Schedule a decoded first-frame one-shot on
    // the suspended context's clock rather than dropping it before resume
    // completes. Intentional pause, focus loss and locked audio still reject it.
    if (this.disposed || !this.unlocked || this.paused || !this.focused ||
      !this.context || this.context.state === 'closed') return;
    const scale = Number.isFinite(volumeScale) ? Math.max(0, Math.min(1, volumeScale)) : 0;
    if (scale === 0) return;
    const now = this.context!.currentTime;
    // Per-effect limiter also bounds rapid turrets distributed across the level.
    if (now - (this.recent.get(sound) ?? -Infinity) < 0.035) return;
    if (this.createVoice(sound, position, undefined, varyPitch, scale)) this.recent.set(sound, now);
  }

  /** Menu one-shots share the effects/master mix, while paused world voices stay muted. */
  playUI(): void {
    if (this.disposed || !this.unlocked || !this.focused || !this.context || this.context.state === 'closed') return;
    const sound = 'ui-confirm-01', now = this.context.currentTime;
    if (now - (this.recent.get(sound) ?? -Infinity) < .035) return;
    if (this.createVoice(sound, undefined, undefined, false, 1, true)) {
      this.recent.set(sound, now);
      this.syncContext();
    }
  }

  startLoop(key: string, sound: SoundId, position?: AudioPosition, volumeScale = 1, playbackRate = 1): void {
    if (this.disposed) return;
    const scale = Number.isFinite(volumeScale) ? Math.max(0, Math.min(1, volumeScale)) : 0;
    const rate = Number.isFinite(playbackRate) ? Math.max(0.25, Math.min(4, playbackRate)) : 1;
    const previous = this.loops.get(key);
    if (previous && previous.sound !== sound) this.stopLoop(key);
    this.loops.set(key, { sound, position, volumeScale: scale, playbackRate: rate });
    const voice = [...this.voices].find(candidate => candidate.key === key);
    if (voice) {
      this.positionVoice(voice, position);
      if (previous?.playbackRate !== rate) voice.source.playbackRate.value = rate;
      if (voice.volumeScale !== scale) {
        voice.volumeScale = scale;
        voice.gain.gain.cancelScheduledValues(this.context!.currentTime);
        voice.gain.gain.setTargetAtTime(SOUND_DEFINITIONS[sound].volume * scale, this.context!.currentTime, 0.025);
      }
    } else if (this.canPlay()) this.createVoice(sound, position, key, sound.includes('movement'), scale, false, rate);
  }

  stopLoop(key: string): void {
    this.loops.delete(key);
    let released = false;
    for (const voice of this.voices) if (voice.key === key) {
      this.stopVoice(voice);
      released = true;
    }
    if (released) this.reconcileLoops();
  }

  /** Release a cinematic's own clips without stopping gameplay/menu audio. */
  stopSound(sound: SoundId): void {
    for (const [key, request] of this.loops) if (request.sound === sound) this.loops.delete(key);
    for (const voice of this.voices) if (voice.sound === sound) this.stopVoice(voice);
    this.reconcileLoops();
  }

  stopAll(): void {
    this.loops.clear();
    this.recent.clear();
    for (const voice of this.voices) this.stopVoice(voice);
  }

  setListener(position: AudioPosition, forward?: AudioPosition, up?: AudioPosition): void {
    const listener = this.context?.listener;
    if (!listener) return;
    setSpatialPosition(listener, position);
    if (forward && up) setListenerOrientation(listener, forward, up);
  }

  private decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    const context = this.context;
    if (!context) return Promise.reject(new Error('Web Audio is unavailable.'));
    return new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      const succeed = (buffer: AudioBuffer): void => {
        if (settled) return;
        settled = true;
        resolve(buffer);
      };
      const fail = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        reject(error ?? new Error('Audio decode failed.'));
      };
      try {
        // Supplying callbacks supports pre-Promise Safari implementations.
        // Current implementations also return a Promise; the settled guard
        // safely accepts whichever completion mechanism fires first.
        const decoding = context.decodeAudioData(bytes, succeed, fail);
        if (decoding && typeof decoding.then === 'function') {
          void decoding.then(succeed, fail);
        }
      } catch (error) {
        fail(error);
      }
    });
  }

  private canPlay(): boolean {
    return !this.disposed && this.unlocked && !this.paused && this.focused && this.context?.state === 'running';
  }
  private reconcileLoops(): void {
    if (!this.canPlay()) return;
    for (const [key, request] of this.loops) this.startLoop(key, request.sound, request.position, request.volumeScale, request.playbackRate);
  }
  private createVoice(sound: SoundId, position?: AudioPosition, key?: string, varyPitch = false, volumeScale = 1, ui = false, playbackRate = 1): boolean {
    const buffer = this.buffers.get(sound), context = this.context, bus = ui ? this.effects : this.gameplayGain;
    if (!buffer || !context || !bus) return false;
    const definition = SOUND_DEFINITIONS[sound];
    if (this.voices.size >= 24 || [...this.voices].filter(v => v.sound === sound).length >= definition.maxVoices) return false;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.loop = key !== undefined;
    source.playbackRate.value = playbackRate * (varyPitch ? 0.96 + Math.random() * 0.08 : 1);
    gain.gain.value = key ? 0 : definition.volume * volumeScale;
    if (key) gain.gain.linearRampToValueAtTime(definition.volume * volumeScale, context.currentTime + 0.04);
    const panner = position ? context.createPanner() : undefined;
    if (panner) {
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      const spatial = soundSpatialProfile(sound);
      panner.refDistance = spatial.refDistance;
      panner.maxDistance = 45;
      panner.rolloffFactor = spatial.rolloffFactor;
      source.connect(gain); gain.connect(panner); panner.connect(bus);
    } else { source.connect(gain); gain.connect(bus); }
    const voice: Voice = { sound, source, gain, panner, key, volumeScale, ui };
    this.positionVoice(voice, position);
    this.voices.add(voice);
    source.onended = () => { this.releaseVoice(voice); this.reconcileLoops(); };
    source.start();
    this.playedCount++;
    return true;
  }
  private positionVoice(voice: Voice, position?: AudioPosition): void {
    if (!position || !voice.panner) return;
    setSpatialPosition(voice.panner, position);
  }
  private stopVoice(voice: Voice): void {
    try { voice.source.stop(); } catch { /* already ended */ }
    this.releaseVoice(voice);
  }
  private releaseVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect(); voice.gain.disconnect(); voice.panner?.disconnect();
    if (voice.ui) this.syncContext();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadingAbort?.abort();
    for (const { sound, resolve } of this.loadQueue.splice(0)) {
      this.pending.delete(sound); resolve();
    }
    this.stopAll(); this.buffers.clear();
    this.gameplayGain?.disconnect(); this.effects?.disconnect(); this.compressor?.disconnect(); this.master?.disconnect();
    void this.context?.close().catch(() => {});
  }
}
