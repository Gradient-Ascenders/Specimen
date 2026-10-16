import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { SlimeManager } from '../slimes/SlimeManager.ts';
import type { AcidProjectileSystem } from '../abilities/AcidProjectileSystem.ts';
import type { AudioPlayback } from './AudioManager.ts';
import { gameplayAudioEvents } from './GameplayAudioEvents.ts';
import type { SoundId } from './SoundCatalog.ts';

/** A level's subscriptions and transient character loops. No gameplay authority. */
export class GameplayAudio {
  private enabled = false;
  private dead = false;
  private resetting = false;
  private resetGeneration = 0;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly characterLoops = ['character:movement', 'character:idle'];
  private readonly bobMotion = { x: 0, y: 0, z: 0 };
  private bobMotionTracked = false;
  private bobContactMetres = 0;
  private readonly audio: AudioPlayback;
  private readonly manager: SlimeManager<KinematicBody>;
  private readonly acid: AcidProjectileSystem<KinematicBody>;
  private readonly controlledBody: () => KinematicBody | undefined;

  constructor(
    audio: AudioPlayback,
    manager: SlimeManager<KinematicBody>,
    acid: AcidProjectileSystem<KinematicBody>,
    controlledBody: () => KinematicBody | undefined = () => manager.activeBody,
  ) {
    this.audio = audio;
    this.manager = manager;
    this.acid = acid;
    this.controlledBody = controlledBody;
    this.unsubscribers.push(
      gameplayAudioEvents.on('cue', ({ sound, position }) => {
        if (this.enabled && !this.dead && !this.resetting) audio.play(sound, position);
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
          if (id === 'bob') this.clearBobTravel();
          cue(id === 'bob' && chargeFraction >= 0.8 ? 'bob-charged-jump-01' : `${id}-jump-01`, true);
        }),
        body.events.on('landed', ({ impactSpeedMetresPerSecond: speed }) => {
          if (id === 'bob') this.clearBobTravel();
          cue(speed >= 8 ? `${id}-land-hard-01` : id === 'volt' ? 'volt-land-01' : `${id}-land-soft-01`, true);
        }),
        body.events.on('obstacleImpact', () => {
          if (id === 'bob') { this.clearBobTravel(); cue('bob-contact-01', true, 0.8); }
          else if (id === 'goop') cue('goop-impact-01', true);
        }),
      );
      if (id === 'bob') this.unsubscribers.push(
        body.events.on('attached', () => { this.clearBobTravel(); cue('bob-contact-01'); }),
        body.events.on('detached', () => { this.clearBobTravel(); cue('bob-detach-01', true, 0.65); }),
        body.events.on('bounced', () => {
          this.clearBobTravel();
          // A hard floor landing already sounded before its passive rebound.
          if (!body.landedThisStep) cue('bob-land-hard-01', true);
        }),
        body.events.on('regripped', () => { this.clearBobTravel(); cue('bob-contact-01', true, 0.55); }),
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
    if (controlled !== body) { this.clearCharacter(); this.updateProjectiles(); return; }
    if (!body || (id !== 'bob' && id !== 'goop' && id !== 'volt')) { this.clearCharacter(); return; }
    const v = body.velocity, n = body.groundNormal;
    const normalSpeed = v.x * n.x + v.y * n.y + v.z * n.z;
    const tangentSpeedSquared = Math.max(0, v.x*v.x + v.y*v.y + v.z*v.z - normalSpeed*normalSpeed);
    const moving = body.grounded && tangentSpeedSquared > 0.04;
    if (moving && id !== 'bob') this.audio.startLoop('character:movement', `${id}-movement-loop-01`, body.position);
    else this.audio.stopLoop('character:movement');
    if (id === 'bob') this.updateBobMovement(body, moving);
    if (!moving && body.grounded && (id === 'goop' || id === 'volt'))
      this.audio.startLoop('character:idle', id === 'goop' ? 'goop-idle-bubbles-loop-01' : 'volt-idle-sparks-loop-01', body.position);
    else this.audio.stopLoop('character:idle');
    this.updateProjectiles();
  }

  private updateBobMovement(body: KinematicBody, moving: boolean): void {
    // This position excludes carrier transport and teleports. Velocity alone
    // must not make a blocked body or an elevator passenger sound like walking.
    const position = body.locomotionPosition;
    const dx = position.x - this.bobMotion.x, dy = position.y - this.bobMotion.y, dz = position.z - this.bobMotion.z;
    const tracked = this.bobMotionTracked;
    this.bobMotion.x = position.x; this.bobMotion.y = position.y; this.bobMotion.z = position.z;
    this.bobMotionTracked = true;
    if (!tracked || !moving || body.chargingJump || body.landedThisStep) {
      this.bobContactMetres = 0;
      return;
    }
    const normal = body.groundNormal;
    const normalDistance = dx * normal.x + dy * normal.y + dz * normal.z;
    const tangentDistance = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - normalDistance * normalDistance));
    this.bobContactMetres += tangentDistance;
    if (this.bobContactMetres >= 1.25) {
      this.bobContactMetres %= 1.25;
      this.audio.play('bob-contact-01', body.position, true, body.attached ? 0.25 : 0.35);
    }
  }

  private clearBobTravel(): void {
    this.bobMotionTracked = false;
    this.bobContactMetres = 0;
  }

  private updateProjectiles(): void {
    for (const projectile of this.acid.projectileStates) {
      const key = `acid:${projectile.id}`;
      if (projectile.active) this.audio.startLoop(key, 'goop-projectile-flight-loop-01', projectile.position);
    }
  }

  died(id: string | undefined): void {
    this.reset();
    if (id === 'bob' && this.enabled) this.audio.play('bob-fall-01', this.manager.getBody('bob')?.position);
    // Allow the death one-shot to finish; reject further world events.
    this.dead = true;
  }
  respawn(): void {
    this.reset();
    this.dead = false;
    this.resetting = false;
    this.setEnabled(true);
    const id = this.manager.activeSlimeId;
    if (id === 'bob') this.audio.play('bob-contact-01', this.manager.activeBody?.position, false, 0.8);
    else if (id === 'goop' || id === 'volt') this.audio.play(`${id}-respawn-01`, this.manager.activeBody?.position);
  }
  private clearCharacter(): void {
    for (const key of this.characterLoops) this.audio.stopLoop(key);
    this.clearBobTravel();
  }
  reset(): void {
    this.dead = false;
    this.resetting = true;
    this.clearCharacter();
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
  }
}
