import * as THREE from 'three';
import type { AudioPlayback } from './AudioManager.ts';
import type { AudioPosition } from './GameplayAudioEvents.ts';
import type { SoundId } from './SoundCatalog.ts';

interface SourceOptions {
  readonly root: THREE.Object3D;
  readonly kind: 'door' | 'machinery' | 'laser';
  readonly progress?: () => number;
  readonly settled?: () => boolean;
  readonly enabled?: () => boolean;
  readonly closestPoint?: (listener: AudioPosition, out: THREE.Vector3) => void;
}
const sources = new Set<WorldAudioSource>();
let nextSource = 0;

/** Read-only presentation registration. It never controls a mechanism. */
export class WorldAudioSource {
  readonly key = `world:${++nextSource}`;
  readonly options: SourceOptions;
  generation = 0;
  baseline: number;
  constructor(options: SourceOptions) {
    this.options = options;
    this.baseline = options.progress?.() ?? 0;
    sources.add(this);
  }
  /** A restore/teleport is not physical travel or an arrival. */
  reset(): void { this.baseline = this.options.progress?.() ?? 0; this.generation++; }
  dispose(): void { sources.delete(this); }
}

/** At most two nearby motors and one nearby active laser, owned by a level. */
export class WorldAudio {
  private readonly audio: AudioPlayback;
  private readonly root: THREE.Object3D;
  private readonly samples = new Map<WorldAudioSource, { progress: number; generation: number }>();
  private readonly playing = new Set<string>();
  private readonly point = new THREE.Vector3();

  constructor(audio: AudioPlayback, root: THREE.Object3D) { this.audio = audio; this.root = root; }

  update(listener: AudioPosition | undefined): void {
    const candidates: { key: string; sound: SoundId; distance: number; position: THREE.Vector3; laser: boolean }[] = [];
    for (const source of sources) {
      const options = source.options;
      let ancestor: THREE.Object3D | null = options.root;
      let visible = true;
      while (ancestor && ancestor !== this.root) { visible &&= ancestor.visible; ancestor = ancestor.parent; }
      if (!ancestor) continue;
      const sample = this.samples.get(source) ?? { progress: source.baseline, generation: source.generation };
      const progress = options.progress?.() ?? 0;
      const restored = sample.generation !== source.generation;
      const moved = !restored && Math.abs(progress - sample.progress) > 1e-9;
      sample.progress = progress; sample.generation = source.generation;
      this.samples.set(source, sample);
      if (!listener || !visible || options.enabled?.() === false) continue;
      if (options.closestPoint) options.closestPoint(listener, this.point);
      else options.root.getWorldPosition(this.point);
      const distance = (this.point.x-listener.x)**2 + (this.point.y-listener.y)**2 + (this.point.z-listener.z)**2;
      const laser = options.kind === 'laser';
      if (distance > (laser ? 10 : 16)**2) continue;
      const settled = options.settled?.() ?? false;
      if (options.kind === 'door' && moved && settled)
        this.audio.play('world-door-stop-01', this.point, true);
      if (laser || (moved && !settled)) candidates.push({
        // Keep the laser voice running when a different beam becomes nearest.
        key: laser ? 'world:laser' : source.key, distance, position: this.point.clone(), laser,
        sound: laser ? 'world-laser-loop-01' : options.kind === 'door' ? 'world-door-movement-loop-01' : 'world-machinery-loop-01',
      });
    }
    for (const source of this.samples.keys()) if (!sources.has(source)) this.samples.delete(source);
    candidates.sort((a,b) => a.distance-b.distance);
    const keep = new Set<string>();
    let motors = 0, lasers = 0;
    for (const candidate of candidates) {
      if (candidate.laser ? lasers++ >= 1 : motors++ >= 2) continue;
      keep.add(candidate.key);
      this.audio.startLoop(candidate.key, candidate.sound, candidate.position);
    }
    for (const key of this.playing) if (!keep.has(key)) this.audio.stopLoop(key);
    this.playing.clear();
    for (const key of keep) this.playing.add(key);
  }

  reset(): void {
    for (const key of this.playing) this.audio.stopLoop(key);
    this.playing.clear(); this.samples.clear();
    // Snapshot current poses so a level reset never sounds like an arrival.
    for (const source of sources) this.samples.set(source, { progress: source.options.progress?.() ?? 0, generation: source.generation });
  }
  dispose(): void { this.reset(); this.samples.clear(); }
}

/** The beam's nearest point, including parent room offsets and moving sweeps. */
export function registerLaserAudio(root: THREE.Object3D, start: AudioPosition, end: AudioPosition, enabled: () => boolean): WorldAudioSource {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), delta = new THREE.Vector3();
  return new WorldAudioSource({ root, kind: 'laser', enabled, closestPoint: (listener, out) => {
    root.localToWorld(a.set(start.x,start.y,start.z)); root.localToWorld(b.set(end.x,end.y,end.z));
    delta.subVectors(b,a);
    const length = delta.lengthSq();
    const t = length > 0 ? THREE.MathUtils.clamp(((listener.x-a.x)*delta.x+(listener.y-a.y)*delta.y+(listener.z-a.z)*delta.z)/length,0,1) : 0;
    out.copy(a).addScaledVector(delta,t);
  } });
}
