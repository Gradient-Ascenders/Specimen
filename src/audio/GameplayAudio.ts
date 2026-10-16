import type { Object3D } from 'three';
import { WorldAudio } from './WorldAudio.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { SlimeManager } from '../slimes/SlimeManager.ts';
import type { AudioPlayback } from './AudioManager.ts';
import type { AudioPosition } from './GameplayAudioEvents.ts';
import { gameplayAudioEvents } from './GameplayAudioEvents.ts';
import type { SoundId } from './SoundCatalog.ts';

export interface AcidPoolBounds { readonly min: AudioPosition; readonly max: AudioPosition }

/** A level's subscriptions and transient character loops. No gameplay authority. */
export class GameplayAudio {
  private enabled = false;
  private dead = false;
  private resetting = false;
  private resetGeneration = 0;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly bodyMotion = { x: 0, y: 0, z: 0 };
  private bodyMotionTracked = false;
  private bodyContactMetres = 0;
  private readonly worldAudio: WorldAudio | undefined;
  private readonly audio: AudioPlayback;
  private readonly manager: SlimeManager<KinematicBody>;
  private readonly acidPools: readonly AcidPoolBounds[];
  private readonly poolPosition = { x: 0, y: 0, z: 0 };
  private readonly controlledBody: () => KinematicBody | undefined;

  constructor(
    audio: AudioPlayback,
    manager: SlimeManager<KinematicBody>,
    acidPools: readonly AcidPoolBounds[] = [],
    controlledBody: () => KinematicBody | undefined = () => manager.activeBody,
    worldRoot?: Object3D,
  ) {
    this.audio = audio;
    this.manager = manager;
    this.acidPools = acidPools;
    this.controlledBody = controlledBody;
    this.worldAudio = worldRoot ? new WorldAudio(audio, worldRoot) : undefined;
    this.unsubscribers.push(
      gameplayAudioEvents.on('cue', ({ sound, position, volumeScale, maxDistance }) => {
        const listener = this.controlledBody()?.position;
        if (maxDistance !== undefined && position && (!listener ||
          (position.x-listener.x)**2 + (position.y-listener.y)**2 + (position.z-listener.z)**2 > maxDistance**2)) return;
        if (this.enabled && !this.dead && !this.resetting) audio.play(sound, position, false, volumeScale);
      }),
      gameplayAudioEvents.on('loop', ({ key, sound, position }) => {
        if (this.enabled && !this.dead && !this.resetting) audio.startLoop(key, sound, position);
      }),
      gameplayAudioEvents.on('stop', ({ key }) => audio.stopLoop(key)),
      manager.events.on('activeChanged', () => this.clearCharacter()),
    );
    const boundBodies = new WeakSet<KinematicBody>();
    const bindBody = (id: 'bob' | 'goop' | 'volt'): void => {
      const body = manager.getBody(id);
      if (!body || boundBodies.has(body)) return;
      boundBodies.add(body);
      const cue = (sound: SoundId, varyPitch = false, volumeScale = 1) => {
        if (this.enabled && !this.dead && !this.resetting && manager.getBody(id) === body) audio.play(sound, body.position, varyPitch, volumeScale);
      };
      this.unsubscribers.push(
        body.events.on('jumped', ({ chargeFraction }) => {
          this.clearBodyTravel();
          cue(id === 'bob' && chargeFraction >= 0.8 ? 'bob-charged-jump-01' : 'bob-jump-01', true);
        }),
        body.events.on('landed', ({ impactSpeedMetresPerSecond: speed }) => {
          this.clearBodyTravel();
          cue(speed >= 8 ? 'bob-land-hard-01' : 'bob-land-soft-01', true);
        }),
        body.events.on('obstacleImpact', () => {
          this.clearBodyTravel(); cue('bob-contact-01', true, 0.8);
        }),
      );
      if (id === 'bob') this.unsubscribers.push(
        body.events.on('attached', () => { this.clearBodyTravel(); cue('bob-contact-01'); }),
        body.events.on('detached', () => { this.clearBodyTravel(); cue('bob-detach-01', true, 0.65); }),
        body.events.on('bounced', () => {
          this.clearBodyTravel();
          // A hard floor landing already sounded before its passive rebound.
          if (!body.landedThisStep) cue('bob-land-hard-01', true);
        }),
        body.events.on('regripped', () => { this.clearBodyTravel(); cue('bob-contact-01', true, 0.55); }),
      );
    };
    for (const id of ['bob', 'goop', 'volt'] as const) bindBody(id);
    this.unsubscribers.push(manager.events.on('registered', ({ slimeId }) => {
      if (slimeId === 'bob' || slimeId === 'goop' || slimeId === 'volt') bindBody(slimeId);
    }));
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.clearCharacter();
    this.audio.setPaused(!enabled);
  }

  update(): void {
    if (!this.enabled || this.dead) return;
    this.resetting = false;
    const id = this.manager.activeSlimeId;
    const body = this.manager.activeBody;
    const controlled = this.controlledBody();
    if (controlled) this.audio.setListener(controlled.position);
    this.updateAcidPools(controlled?.position);
    this.worldAudio?.update(controlled?.position);
    if (controlled !== body) { this.clearCharacter(); return; }
    if (!body || (id !== 'bob' && id !== 'goop' && id !== 'volt')) { this.clearCharacter(); return; }
    const v = body.velocity, n = body.groundNormal;
    const normalSpeed = v.x * n.x + v.y * n.y + v.z * n.z;
    const tangentSpeedSquared = Math.max(0, v.x*v.x + v.y*v.y + v.z*v.z - normalSpeed*normalSpeed);
    const moving = body.grounded && tangentSpeedSquared > 0.04;
    this.updateBodyMovement(body, moving);
  }

  private updateBodyMovement(body: KinematicBody, moving: boolean): void {
    // This position excludes carrier transport and teleports. Velocity alone
    // must not make a blocked body or an elevator passenger sound like walking.
    const position = body.locomotionPosition;
    const dx = position.x - this.bodyMotion.x, dy = position.y - this.bodyMotion.y, dz = position.z - this.bodyMotion.z;
    const tracked = this.bodyMotionTracked;
    this.bodyMotion.x = position.x; this.bodyMotion.y = position.y; this.bodyMotion.z = position.z;
    this.bodyMotionTracked = true;
    if (!tracked || !moving || body.chargingJump || body.landedThisStep) {
      this.bodyContactMetres = 0;
      return;
    }
    const normal = body.groundNormal;
    const normalDistance = dx * normal.x + dy * normal.y + dz * normal.z;
    const tangentDistance = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - normalDistance * normalDistance));
    this.bodyContactMetres += tangentDistance;
    if (this.bodyContactMetres >= 1.25) {
      this.bodyContactMetres %= 1.25;
      this.audio.play('bob-contact-01', body.position, true, body.attached ? 0.25 : 0.35);
    }
  }

  private clearBodyTravel(): void {
    this.bodyMotionTracked = false;
    this.bodyContactMetres = 0;
  }

  private updateAcidPools(listener: AudioPosition | undefined): void {
    // One nearby basin voice, placed at its nearest surface point rather than
    // its centre: the authored pools can be wider than the hearing range.
    let nearest = 18 * 18;
    let found = false;
    if (listener) for (const pool of this.acidPools) {
      const x = Math.max(pool.min.x, Math.min(pool.max.x, listener.x));
      const y = pool.max.y;
      const z = Math.max(pool.min.z, Math.min(pool.max.z, listener.z));
      const distance = (x-listener.x)**2 + (y-listener.y)**2 + (z-listener.z)**2;
      if (distance < nearest) {
        nearest = distance; found = true;
        this.poolPosition.x = x; this.poolPosition.y = y; this.poolPosition.z = z;
      }
    }
    if (found) this.audio.startLoop('environment:acid', 'goop-acid-puddle-loop-01', this.poolPosition);
    else this.audio.stopLoop('environment:acid');
  }

  died(id: string | undefined): void {
    this.reset();
    if ((id === 'bob' || id === 'goop' || id === 'volt') && this.enabled) this.audio.play('bob-fall-01', this.manager.getBody(id)?.position);
    // Allow the death one-shot to finish; reject further world events.
    this.dead = true;
  }
  respawn(): void {
    this.reset();
    this.dead = false;
    this.resetting = false;
    this.setEnabled(true);
    const id = this.manager.activeSlimeId;
    if (id === 'bob' || id === 'goop' || id === 'volt') this.audio.play('bob-contact-01', this.manager.activeBody?.position, false, 0.8);
  }
  private clearCharacter(): void {
    this.clearBodyTravel();
  }
  reset(): void {
    this.dead = false;
    this.resetting = true;
    this.clearCharacter();
    this.worldAudio?.reset();
    this.audio.stopAll();
    const generation = ++this.resetGeneration;
    queueMicrotask(() => {
      if (generation === this.resetGeneration) this.resetting = false;
    });
  }
  dispose(): void {
    this.enabled = false;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.reset();
    this.worldAudio?.dispose();
  }
}
