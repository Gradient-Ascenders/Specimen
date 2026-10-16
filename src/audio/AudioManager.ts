import { SOUND_BANKS, SOUND_DEFINITIONS, soundUrl, type SoundId } from './SoundCatalog.ts';
import type { AudioPosition } from './GameplayAudioEvents.ts';

interface Voice {
  readonly sound: SoundId;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner?: PannerNode;
  readonly key?: string;
}
interface LoopRequest { readonly sound: SoundId; readonly position?: AudioPosition }
export interface AudioPlayback {
  play(sound: SoundId, position?: AudioPosition, varyPitch?: boolean): void;
  startLoop(key: string, sound: SoundId, position?: AudioPosition): void;
  stopLoop(key: string): void;
  stopAll(): void;
  setPaused(paused: boolean): void;
  setListener(position: AudioPosition): void;
}

/** One application context, cached buffers, bounded voices and keyed loops. */
export class AudioManager implements AudioPlayback {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private effects: GainNode | undefined;
  private menu: GainNode | undefined;
  private readonly menuVoices = new Set<OscillatorNode>();
  private lastMenuCueMs = -Infinity;
  private compressor: DynamicsCompressorNode | undefined;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly voices = new Set<Voice>();
  private readonly loops = new Map<string, LoopRequest>();
  private contextAttempted = false;
  private readonly pending = new Map<SoundId, Promise<void>>();
  private readonly loadQueue: Array<{ sound: SoundId; resolve: () => void }> = [];
  private activeLoads = 0;
  private readonly loadingAbort = new AbortController();
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
  constructor(base = './', createContext = () => new AudioContext()) {
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
      this.menu = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.ratio.value = 4;
      this.effects.connect(this.compressor);
      this.menu.connect(this.compressor);
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
      const response = await fetch(soundUrl(sound, this.base), { signal: this.loadingAbort.signal });
      if (!response.ok) throw new Error('Audio request failed');
      const bytes = await response.arrayBuffer();
      if (this.disposed) return;
      const buffer = await this.context!.decodeAudioData(bytes);
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
      if (this.paused) this.effects.gain.setValueAtTime(0, this.context.currentTime);
      else this.effects.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.025);
      this.menu?.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.025);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.context && this.effects) {
      if (paused) this.effects.gain.setValueAtTime(0, this.context.currentTime);
      else this.effects.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.025);
    }
    this.syncContext();
  }
  setFocused(focused: boolean): void { this.focused = focused; this.syncContext(); }
  private syncContext(): void {
    const context = this.context;
    if (!context || this.disposed || context.state === 'closed') return;
    const shouldRun = this.unlocked && (!this.paused || this.menuVoices.size > 0) && this.focused;
    const operation = shouldRun ? context.resume() : context.suspend();
    void operation.then(() => { if (shouldRun) this.reconcileLoops(); }).catch(() => {});
  }

  /** Quiet synthesized UI cues share master/effects volume and the one context.
   * Gameplay has its own muted bus while a cue briefly wakes a paused context. */
  playMenuCue(cue: 'navigate' | 'confirm' | 'back'): void {
    if (cue !== 'navigate') this.unlock();
    if (!this.unlocked || !this.focused || this.disposed || !this.context || !this.menu ||
      this.masterVolume === 0 || this.effectsVolume === 0 || this.menuVoices.size >= 4) return;
    const nowMs = performance.now();
    if (cue === 'navigate' && nowMs - this.lastMenuCueMs < 90) return;
    this.lastMenuCueMs = nowMs;
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const duration = cue === 'navigate' ? 0.035 : 0.075;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(cue === 'back' ? 520 : cue === 'confirm' ? 740 : 620, now);
    oscillator.frequency.exponentialRampToValueAtTime(cue === 'back' ? 380 : 900, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(cue === 'navigate' ? 0.022 : 0.035, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.menu);
    this.menuVoices.add(oscillator);
    oscillator.onended = () => {
      this.menuVoices.delete(oscillator);
      oscillator.disconnect(); gain.disconnect();
      this.syncContext();
    };
    this.syncContext();
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  play(sound: SoundId, position?: AudioPosition, varyPitch = false): void {
    if (!this.canPlay()) return;
    const now = this.context!.currentTime;
    // Per-effect limiter also bounds rapid turrets distributed across the level.
    if (now - (this.recent.get(sound) ?? -Infinity) < 0.035) return;
    if (this.createVoice(sound, position, undefined, varyPitch)) this.recent.set(sound, now);
  }

  startLoop(key: string, sound: SoundId, position?: AudioPosition): void {
    if (this.disposed) return;
    const previous = this.loops.get(key);
    if (previous && previous.sound !== sound) this.stopLoop(key);
    this.loops.set(key, { sound, position });
    const voice = [...this.voices].find(candidate => candidate.key === key);
    if (voice) this.positionVoice(voice, position);
    else if (this.canPlay()) this.createVoice(sound, position, key, sound.includes('movement'));
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

  stopAll(): void {
    this.loops.clear();
    this.recent.clear();
    for (const voice of this.voices) this.stopVoice(voice);
  }

  setListener(position: AudioPosition): void {
    const listener = this.context?.listener;
    if (!listener) return;
    listener.positionX.value = position.x;
    listener.positionY.value = position.y;
    listener.positionZ.value = position.z;
  }

  private canPlay(): boolean {
    return !this.disposed && this.unlocked && !this.paused && this.focused && this.context?.state === 'running';
  }
  private reconcileLoops(): void {
    if (!this.canPlay()) return;
    for (const [key, request] of this.loops) this.startLoop(key, request.sound, request.position);
  }
  private createVoice(sound: SoundId, position?: AudioPosition, key?: string, varyPitch = false): boolean {
    const buffer = this.buffers.get(sound), context = this.context, effects = this.effects;
    if (!buffer || !context || !effects) return false;
    const definition = SOUND_DEFINITIONS[sound];
    if (this.voices.size >= 24 || [...this.voices].filter(v => v.sound === sound).length >= definition.maxVoices) return false;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.loop = key !== undefined;
    source.playbackRate.value = varyPitch ? 0.96 + Math.random() * 0.08 : 1;
    gain.gain.value = key ? 0 : definition.volume;
    if (key) gain.gain.linearRampToValueAtTime(definition.volume, context.currentTime + 0.04);
    const panner = position ? context.createPanner() : undefined;
    if (panner) {
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3;
      panner.maxDistance = 45;
      panner.rolloffFactor = 1.5;
      source.connect(gain); gain.connect(panner); panner.connect(effects);
    } else { source.connect(gain); gain.connect(effects); }
    const voice: Voice = { sound, source, gain, panner, key };
    this.positionVoice(voice, position);
    this.voices.add(voice);
    source.onended = () => { this.releaseVoice(voice); this.reconcileLoops(); };
    source.start();
    this.playedCount++;
    return true;
  }
  private positionVoice(voice: Voice, position?: AudioPosition): void {
    if (!position || !voice.panner) return;
    voice.panner.positionX.value = position.x;
    voice.panner.positionY.value = position.y;
    voice.panner.positionZ.value = position.z;
  }
  private stopVoice(voice: Voice): void {
    try { voice.source.stop(); } catch { /* already ended */ }
    this.releaseVoice(voice);
  }
  private releaseVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect(); voice.gain.disconnect(); voice.panner?.disconnect();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadingAbort.abort();
    for (const { sound, resolve } of this.loadQueue.splice(0)) {
      this.pending.delete(sound); resolve();
    }
    this.stopAll(); this.buffers.clear();
    for (const oscillator of this.menuVoices) oscillator.stop();
    this.menuVoices.clear();
    this.menu?.disconnect(); this.effects?.disconnect(); this.compressor?.disconnect(); this.master?.disconnect();
    void this.context?.close().catch(() => {});
  }
}
