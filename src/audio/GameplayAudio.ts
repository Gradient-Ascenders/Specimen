import { Vector3, type Object3D } from 'three';
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
  private movementBody: KinematicBody | undefined;
  private specimenBody: KinematicBody | undefined;
  private specimenActive: () => boolean = () => false;
  private specimenUnsubscribers: (() => void)[] = [];
  private readonly worldAudio: WorldAudio | undefined;
  private readonly audio: AudioPlayback;
  private readonly manager: SlimeManager<KinematicBody>;
  private readonly acidPools: readonly AcidPoolBounds[];
  private readonly poolPosition = { x: 0, y: 0, z: 0 };
  private readonly controlledBody: () => KinematicBody | undefined;
  private readonly listenerCamera: Object3D | undefined;
  private readonly listenerForward = new Vector3(0, 0, -1);
  private readonly listenerUp = new Vector3(0, 1, 0);

  constructor(
    audio: AudioPlayback,
    manager: SlimeManager<KinematicBody>,
    acidPools: readonly AcidPoolBounds[] = [],
    controlledBody: () => KinematicBody | undefined = () => manager.activeBody,
    worldRoot?: Object3D,
    listenerCamera?: Object3D,
  ) {
    this.audio = audio;
    this.manager = manager;
    this.acidPools = acidPools;
    this.controlledBody = controlledBody;
    this.listenerCamera = listenerCamera;
    this.worldAudio = worldRoot ? new WorldAudio(audio, worldRoot) : undefined;
    this.unsubscribers.push(
      gameplayAudioEvents.on('cue', ({ sound, position, volumeScale, maxDistance }) => {
        const listener = this.controlledBody()?.position;
        if (maxDistance !== undefined && position && (!listener ||
          (position.x-listener.x)**2 + (position.y-listener.y)**2 + (position.z-listener.z)**2 > maxDistance**2)) return;
        if (this.enabled && !this.dead && !this.resetting) audio.play(sound, position, false, volumeScale);
      }),
      gameplayAudioEvents.on('loop', ({ key, sound, position, volumeScale }) => {
        if (this.enabled && !this.dead && !this.resetting) audio.startLoop(key, sound, position, volumeScale);
      }),
      gameplayAudioEvents.on('stop', ({ key }) => audio.stopLoop(key)),
      gameplayAudioEvents.on('stopSound', ({ sound }) => audio.stopSound?.(sound)),
      manager.events.on('activeChanged', () => this.clearCharacter()),
    );
    const boundBodies = new WeakSet<KinematicBody>();
    const bindBody = (id: 'bob' | 'goop' | 'volt'): void => {
      const body = manager.getBody(id);
      if (!body || boundBodies.has(body)) return;
      boundBodies.add(body);
      this.unsubscribers.push(...this.bindBodySounds(body, () => manager.getBody(id) === body, id === 'bob', id === 'bob'));
    };
    for (const id of ['bob', 'goop', 'volt'] as const) bindBody(id);
    this.unsubscribers.push(manager.events.on('registered', ({ slimeId }) => {
      if (slimeId === 'bob' || slimeId === 'goop' || slimeId === 'volt') bindBody(slimeId);
    }));
  }

  /** The fusion body lives outside the three-slime roster. Keep its event
   * subscriptions level-owned and silent while a cinematic borrows the actor. */
  bindSpecimen(body: KinematicBody, active: () => boolean = () => true): void {
    for (const unsubscribe of this.specimenUnsubscribers) unsubscribe();
    this.clearBodyTravel();
    this.specimenBody = body; this.specimenActive = active;
    this.specimenUnsubscribers = this.bindBodySounds(body,
      () => this.controlledBody() === body && this.specimenActive(), true, true);
  }

  private bindBodySounds(body: KinematicBody, current: () => boolean, charged: boolean, wallSounds: boolean): (() => void)[] {
    const cue = (sound: SoundId, varyPitch = false, volumeScale = 1) => {
      if (this.enabled && !this.dead && !this.resetting && current()) this.audio.play(sound, body.position, varyPitch, volumeScale);
    };
    const subscriptions = [
      body.events.on('jumped', ({ chargeFraction }) => {
        this.clearBodyTravel();
        cue(charged && chargeFraction >= 0.8 ? 'bob-charged-jump-01' : 'bob-jump-01', true);
      }),
      body.events.on('landed', ({ impactSpeedMetresPerSecond: speed }) => {
        this.clearBodyTravel(); cue(speed >= 8 ? 'bob-land-hard-01' : 'bob-land-soft-01', true);
      }),
      body.events.on('obstacleImpact', () => { this.clearBodyTravel(); cue('bob-contact-01', true, 0.8); }),
    ];
    if (wallSounds) subscriptions.push(
      body.events.on('attached', () => { this.clearBodyTravel(); cue('bob-contact-01'); }),
      body.events.on('detached', () => { this.clearBodyTravel(); cue('bob-detach-01', true, 0.65); }),
      body.events.on('bounced', () => {
        this.clearBodyTravel();
        // A hard landing already sounded before its passive rebound.
        if (!body.landedThisStep) cue('bob-land-hard-01', true);
      }),
      body.events.on('regripped', () => { this.clearBodyTravel(); cue('bob-contact-01', true, 0.55); }),
    );
    return subscriptions;
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
    let body = this.manager.activeBody;
    const controlled = this.controlledBody();
    this.updateListener();
    this.updateAcidPools(controlled?.position);
    this.worldAudio?.update(controlled?.position);
    if (controlled && controlled === this.specimenBody && this.specimenActive()) body = controlled;
    else if (controlled !== body || !body || (id !== 'bob' && id !== 'goop' && id !== 'volt')) { this.clearCharacter(); return; }
    if (this.movementBody !== body) { this.clearBodyTravel(); this.movementBody = body; }
    const v = body.velocity, n = body.groundNormal;
    const normalSpeed = v.x * n.x + v.y * n.y + v.z * n.z;
    const tangentSpeedSquared = Math.max(0, v.x*v.x + v.y*v.y + v.z*v.z - normalSpeed*normalSpeed);
    const moving = body.grounded && tangentSpeedSquared > 0.04;
    this.updateBodyMovement(body, moving);
  }

  /** Called after camera interpolation too: looking around must pan ongoing sounds. */
  updateListener(): void {
    if (!this.enabled || this.dead) return;
    const controlled = this.controlledBody();
    if (!controlled) return;
    if (this.listenerCamera) {
      this.listenerCamera.updateWorldMatrix(true, false);
      this.listenerForward.setFromMatrixColumn(this.listenerCamera.matrixWorld, 2).negate().normalize();
      this.listenerUp.setFromMatrixColumn(this.listenerCamera.matrixWorld, 1).normalize();
      // Body position keeps distance/culling stable; the actual view owns left/right and roll.
      this.audio.setListener(controlled.position, this.listenerForward, this.listenerUp);
    } else this.audio.setListener(controlled.position);
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
    const stride = body === this.specimenBody ? 1.25 * body.radiusMetres / 0.45 : 1.25;
    if (this.bodyContactMetres >= stride) {
      this.bodyContactMetres %= stride;
      this.audio.play('bob-contact-01', body.position, true, body.attached ? 0.25 : body === this.specimenBody ? 0.45 : 0.35);
    }
  }

  private clearBodyTravel(): void {
    this.bodyMotionTracked = false;
    this.bodyContactMetres = 0;
    this.movementBody = undefined;
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
    else if (this.enabled && this.controlledBody() === this.specimenBody && this.specimenBody) this.audio.play('bob-fall-01', this.specimenBody.position);
    // Allow the death one-shot to finish; reject further world events.
    this.dead = true;
  }
  respawn(): void {
    this.reset();
    this.dead = false;
    this.resetting = false;
    this.setEnabled(true);
    const id = this.manager.activeSlimeId;
    const controlled = this.controlledBody();
    if (controlled && (controlled === this.specimenBody || id === 'bob' || id === 'goop' || id === 'volt'))
      this.audio.play('bob-contact-01', controlled.position, false, 0.8);
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
    for (const unsubscribe of this.specimenUnsubscribers) unsubscribe();
    this.specimenUnsubscribers = []; this.specimenBody = undefined;
    this.reset();
    this.worldAudio?.dispose();
  }
}
