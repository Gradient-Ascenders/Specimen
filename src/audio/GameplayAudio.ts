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
  private readonly characterLoops = ['character:movement', 'character:charge', 'character:idle'];
  private charging = false;
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
      const cue = (suffix: string, varyPitch = false) => {
        if (this.enabled && !this.dead && !this.resetting && manager.getBody(id) === body) audio.play(`${id}-${suffix}-01` as SoundId, body.position, varyPitch);
      };
      this.unsubscribers.push(
        body.events.on('jumped', ({ chargeFraction }) => {
          if (manager.activeSlimeId === id && manager.getBody(id) === body) {
            audio.stopLoop('character:charge');
            this.charging = false;
          }
          cue(id === 'bob' && chargeFraction >= 0.8 ? 'charged-jump' : 'jump', true);
        }),
        body.events.on('landed', ({ impactSpeedMetresPerSecond: speed }) => {
          cue(speed >= 8 ? 'land-hard' : id === 'volt' ? 'land' : 'land-soft', true);
        }),
        body.events.on('obstacleImpact', () => { if (id !== 'volt') cue('impact', true); }),
      );
      if (id === 'bob') this.unsubscribers.push(
        body.events.on('attached', () => cue('stick')),
        body.events.on('detached', ({ lostSupport }) => cue(lostSupport ? 'slip' : 'detach')),
        body.events.on('bounced', () => cue('bounce', true)),
        body.events.on('regripped', () => cue('wall-step', true)),
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
    if (moving) this.audio.startLoop('character:movement',
      id === 'bob' && body.attached ? 'bob-wall-crawl-loop-01' : `${id}-movement-loop-01`, body.position);
    else this.audio.stopLoop('character:movement');

    if (id === 'bob' && body.chargingJump) {
      this.audio.startLoop('character:charge', 'bob-charge-loop-01', body.position);
      // The renderer compresses Bob while charging. Sound the onset once.
      if (!this.charging) this.audio.play('bob-squish-01', body.position);
      this.charging = true;
    } else { this.audio.stopLoop('character:charge'); this.charging = false; }
    if (!moving && body.grounded && (id === 'goop' || id === 'volt'))
      this.audio.startLoop('character:idle', id === 'goop' ? 'goop-idle-bubbles-loop-01' : 'volt-idle-sparks-loop-01', body.position);
    else this.audio.stopLoop('character:idle');
    this.updateProjectiles();
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
    if (id === 'bob' || id === 'goop' || id === 'volt') this.audio.play(`${id}-respawn-01`, this.manager.activeBody?.position);
  }
  private clearCharacter(): void {
    for (const key of this.characterLoops) this.audio.stopLoop(key);
    this.charging = false;
  }
  reset(): void {
    this.dead = false;
    this.resetting = true;
    this.clearCharacter();
    if (this.audio.stopGameplay) this.audio.stopGameplay();
    else this.audio.stopAll();
    const generation = ++this.resetGeneration;
    queueMicrotask(() => {
      if (generation === this.resetGeneration) this.resetting = false;
    });
  }
  dispose(): void {
    this.enabled = false;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.reset();
    this.audio.stopAll();
  }
}
