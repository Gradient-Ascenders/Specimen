import * as THREE from 'three';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { BobCharacterPresentation, BobCharacterPresentationState } from '../render/bob/BobCharacterPresentation.ts';
import type { GoopCharacterPresentation } from '../render/goop/GoopCharacterPresentation.ts';
import type { VoltCharacterPresentation } from '../render/volt/VoltCharacterPresentation.ts';
import type { SpecimenCharacterPresentation, SpecimenCharacterState } from '../render/specimen/SpecimenCharacterPresentation.ts';
import type { FinalBossPresentation } from '../boss/FinalBossPresentation.ts';
import type { ExterminationArena } from '../boss/ExterminationArena.ts';
import { SecurityDronePresentation, SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { gameplayAudioEvents } from '../audio/GameplayAudioEvents.ts';
import { CinematicMusic } from '../audio/CinematicMusic.ts';
import type { SoundId } from '../audio/SoundCatalog.ts';
import { TypewriterAudio } from '../audio/TypewriterAudio.ts';
import { optimizeFiniteLightEvaluation } from '../render/environment/cultivation/FiniteLightEvaluation.ts';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';
import { preserveResearchPresentation } from './BlackoutResearchPreparation.ts';
import { BossDefeatSet } from './BossDefeatSet.ts';
import { BossDefeatEffects } from './BossDefeatEffects.ts';
import { BossDefeatCamera } from './BossDefeatCamera.ts';
import { BossDefeatOverlay } from './BossDefeatOverlay.ts';
import { ENDING_TIMING as T, ENDING_ANCHOR as A, ENDING_DIALOGUE, endingProgress, endingShot,
  sampleEndingSlime, sampleEndingDrone, sampleEndingBossWreck, endingDroneDeathTime, endingGoopHitTime, endingCollapseBlastTime, type EndingSlime } from './BossDefeatTimeline.ts';

type Presentation = BobCharacterPresentation | GoopCharacterPresentation | VoltCharacterPresentation;
interface Options {
  root: THREE.Group; host: HTMLElement; arena: ExterminationArena; boss: FinalBossPresentation;
  bodies: Record<EndingSlime, KinematicBody>;
  presentations: { bob: BobCharacterPresentation; goop: GoopCharacterPresentation; volt: VoltCharacterPresentation };
  specimen: SpecimenCharacterPresentation;
  creditsMarkdown?: string;
}
interface Actor {
  id: EndingSlime; presentation: Presentation; pose: THREE.Group; parent: THREE.Object3D | null;
  position: THREE.Vector3; previous: THREE.Vector3; velocity: THREE.Vector3; intent: THREE.Vector3;
  state: BobCharacterPresentationState; voice: TypewriterAudio; airborne: boolean;
}
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const PREPARATION = [1, 6, 10, 12.5, T.specimenFire - .05, T.specimenFire + .08, 16, 18, 23, 28, 31.2, 32, 34.5, 37, 41, 48,
  T.drones + 4, T.sacrifice + 1, T.insist + 1, T.leave + 2, T.lookBack + 1, endingGoopHitTime(2) + .08,
  T.goodbye + 1, T.runAgain + 4, T.destruction + .5, T.destruction + 3, T.destruction + 7, T.daylight + 3, T.sky + 1, T.credits + 5];
const CUES: readonly { at: number; sound: SoundId; gain: number }[] = [
  { at: 1, sound: 'escape-drone-strain-loop-01', gain: .4 },
  { at: T.charge, sound: 'volt-charge-ready-01', gain: .8 },
  { at: T.fire, sound: 'volt-shoot-01', gain: 1 },
  { at: T.specimenFire, sound: 'volt-shoot-01', gain: 1 },
  { at: T.impact, sound: 'cultivation-cover-drone-impact-01', gain: .55 },
  { at: T.strain, sound: 'cultivation-duct-floor-strain-01', gain: .7 },
  { at: T.escalation, sound: 'cultivation-cover-break-free-01', gain: .7 },
  { at: T.explosion, sound: 'escape-drone-destruction-01', gain: 1 },
  { at: T.explosion + .12, sound: 'world-platform-land-01', gain: .65 },
  { at: T.landing, sound: 'bob-land-hard-01', gain: .5 },
  { at: T.drones - .8, sound: 'world-activation-01', gain: .65 },
  { at: T.destruction, sound: 'cultivation-cover-drone-impact-01', gain: .8 },
];
const LOOP_KEYS = ['ending-energy-roar', 'ending-electrical-strain', 'ending-collapse'];

export class BossDefeatFinale {
  readonly set = new BossDefeatSet();
  readonly effects = new BossDefeatEffects();
  readonly overlay: BossDefeatOverlay;
  readonly actors: readonly Actor[];
  readonly preparation = { complete: false, frames: 0 };
  private readonly options: Options;
  private music?: CinematicMusic;
  private readonly cameraTrack = new BossDefeatCamera();
  private readonly droneResources = new SecurityDronePresentationResources(undefined, true);
  private readonly drones: SecurityDronePresentation[] = [];
  private readonly owned = new THREE.Group();
  private readonly scene: THREE.Scene | THREE.Object3D;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly bossSource = new THREE.Vector3();
  private readonly specimenSource = new THREE.Vector3();
  private readonly damageMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly damagedClones: THREE.Material[] = [];
  private readonly damagedColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private readonly emissiveMeshes = new Map<THREE.Mesh, boolean>();
  private readonly damageParts: THREE.Object3D[] = [];
  private restore?: () => void;
  private camera?: THREE.PerspectiveCamera;
  private savedCamera?: { fov: number; far: number; position: THREE.Vector3; quaternion: THREE.Quaternion };
  private oldBackground: THREE.Scene['background'] = null;
  private oldFog: THREE.Scene['fog'] = null;
  private readonly daylightBackground = new THREE.Color(0xb2d5dc);
  private readonly daylightFog = new THREE.FogExp2(0xb3c8b4, .0015);
  private elapsed = 0; private previousElapsed = 0;
  private playing = false; private played = false; private disposed = false; private skipRequested = false;
  private preparing = false;
  private didSkipCredits = false;
  private readonly specimenState: SpecimenCharacterState;

  constructor(options: Options) {
    this.options = options; this.scene = options.root.parent ?? options.root;
    this.owned.name = 'boss-defeat-cinematic-ownership'; this.owned.visible = false;
    options.boss.rollRig.add(this.set.bossDamage);
    options.root.add(this.owned, this.set.lights); this.owned.add(this.set.root, this.effects.root);
    this.overlay = new BossDefeatOverlay(options.host, () => { this.skipRequested = true; }, options.creditsMarkdown);
    this.actors = (['bob', 'goop', 'volt'] as const).map(id => {
      const position = new THREE.Vector3(), previous = new THREE.Vector3(), velocity = new THREE.Vector3(), intent = new THREE.Vector3();
      const pose = new THREE.Group(); pose.name = `ending-slime-${id}`; this.owned.add(pose);
      const state: BobCharacterPresentationState = { locomotionPositionWorld: position, velocityWorld: velocity, movementIntentWorld: intent,
        maximumLocomotionSpeedMetresPerSecond: 7, surfaceNormalWorld: UP, gameplayUpWorld: UP,
        grounded: true, attached: false, chargingJump: false, jumpCharge: 0, contactCount: 1, contactNormalWorld: UP,
        contactSpeedMetresPerSecond: 0, contactName: 'ending-floor', contactSurfaceTag: 'default', landedThisStep: false };
      const voice = new TypewriterAudio(pose, { sound: 'bob-contact-01', intervalSeconds: .13, maxDistance: 90, volumeScale: .35 });
      return { id, presentation: options.presentations[id], pose, parent: null, position, previous, velocity, intent, state, voice, airborne: false };
    });
    this.specimenState = { position: this.position, locomotionPosition: this.position, velocity: this.velocity,
      maximumLocomotionSpeedMetresPerSecond: 15, gameplayUp: UP, grounded: true, landedThisStep: false, chargingJump: false, chargeFraction: 0 };
    for (let i = 0; i < 24; i++) {
      const drone = new SecurityDronePresentation({ id: `ending-reinforcement-${i}`, type: 'ceiling', colliderSize: new THREE.Vector3(1.8, 1, 1.7),
        initialPosition: ZERO, forward: new THREE.Vector3(0, 0, -1), scanAxis: UP, scanHalfAngleRadians: 1, scanSpeedRadiansPerSecond: 1,
        detectionHalfAngleRadians: 1, detectionRangeMetres: 100, warningSeconds: 1, fireIntervalSeconds: .8,
        targetLossGraceSeconds: 1, cooldownSeconds: 1, muzzleAnchor: ZERO, targetPolicy: 'bob-only', initialScanPhase: 0 }, this.droneResources);
      drone.setState('firing', true); drone.root.visible = false; this.drones.push(drone); this.owned.add(drone.root);
    }
    const cloneCache = new Map<THREE.Material, THREE.Material>();
    options.boss.rollRig.traverse(o => {
      if (o.name === 'armoured-ducted-fan' || o.name === 'articulated-rotary-cannon') this.damageParts.push(o);
      if (o instanceof THREE.Mesh && [o.material].flat().some(m => m instanceof THREE.MeshBasicMaterial && m.visible)) this.emissiveMeshes.set(o, o.visible);
      if (!(o instanceof THREE.Mesh) || ![o.material].flat().some(m => m instanceof THREE.MeshStandardMaterial)) return;
      const clones = [o.material].flat().map(m => {
        if (!(m instanceof THREE.MeshStandardMaterial)) return m;
        let clone = cloneCache.get(m);
        if (!clone) { const c = m.clone(); c.color.multiplyScalar(.4); c.roughness = .95; c.metalness = .25; optimizeFiniteLightEvaluation(c, true); clone = c;
          cloneCache.set(m, c); this.damagedClones.push(c); this.damagedColors.set(c, c.color.clone()); }
        return clone;
      });
      this.damageMaterials.set(o, Array.isArray(o.material) ? clones : clones[0]!);
    });
  }
  get active(): boolean { return this.playing && !this.preparing; }
  get complete(): boolean { return this.played && !this.playing; }
  get seconds(): number { return this.preparing ? 0 : this.elapsed; }
  get skippedCredits(): boolean { return this.didSkipCredits; }
  get diagnostics() { return { active: this.active, complete: this.complete, seconds: this.seconds, shot: endingShot(this.elapsed),
    visibleDrones: this.drones.filter(d => d.root.visible).length, bossVisible: this.options.boss.machine.visible,
    debris: this.set.debris.count, structural: this.set.structural.count, wreckage: this.set.wreckage.count,
    bossFinalShotVisible: this.options.boss.finalShot.visible, effects: this.effects.diagnostics, preparation: { ...this.preparation },
    actors: this.actors.map(a => ({ id: a.id, position: a.position.toArray(), visible: a.pose.visible })) }; }

  begin(camera: THREE.PerspectiveCamera, rehearsal = false): boolean {
    if (this.disposed || this.playing || this.played && !rehearsal) return false;
    this.restore = preserveResearchPresentation(this.scene); this.playing = true; this.played = !rehearsal;
    this.preparing = rehearsal;
    this.elapsed = this.previousElapsed = 0; this.skipRequested = this.didSkipCredits = false; this.camera = camera;
    this.savedCamera = { fov: camera.fov, far: camera.far, position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    if (this.scene instanceof THREE.Scene) { this.oldBackground = this.scene.background; this.oldFog = this.scene.fog; }
    const allowed = new Set<THREE.Object3D>();
    for (const root of [this.owned, this.set.lights, this.options.arena.root, this.options.boss.root,
      this.options.specimen.root, ...this.actors.map(a => a.presentation.root)]) root.traverse(o => allowed.add(o));
    this.options.root.traverse(o => {
      if (!allowed.has(o) && (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite)) o.visible = false;
    });
    this.scene.traverse(o => { if (o instanceof THREE.Light) o.intensity = o instanceof THREE.HemisphereLight ? .55 : 0; });
    this.owned.visible = true; this.options.boss.root.visible = true; this.options.arena.root.visible = true;
    this.options.arena.entryDoor.position.y = 16;
    for (const actor of this.actors) {
      actor.parent = actor.presentation.root.parent; actor.pose.add(actor.presentation.root); actor.presentation.reset();
      actor.presentation.setVisible(true); actor.presentation.setOpacity(1); actor.presentation.setPosition(ZERO); actor.voice.reset(); actor.airborne = false;
    }
    const originals: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    for (const [mesh, materials] of this.damageMaterials) { originals.push([mesh, mesh.material]); mesh.material = materials; }
    const restore = this.restore; this.restore = () => { for (const [mesh, material] of originals) mesh.material = material; restore?.(); };
    this.options.specimen.reset(); this.options.specimen.setOpacity(1); this.options.specimen.setTrailEnabled(false);
    if (!rehearsal) {
      this.music = new CinematicMusic('ending', T.duration);
      this.music.update(0);
      this.options.host.dataset.cinematic = 'boss-defeat';
    }
    this.sample(0, 1 / 60, true); if (!rehearsal) this.overlay.present(0); return true;
  }
  update(dt: number, skip = false): boolean {
    if (!this.playing) return false;
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('Invalid boss ending timestep.');
    this.previousElapsed = this.elapsed; this.elapsed = skip || this.skipRequested ? T.duration : Math.min(T.duration, this.elapsed + dt);
    this.music?.update(this.elapsed);
    this.didSkipCredits = (skip || this.skipRequested) && this.previousElapsed >= T.credits;
    if (!skip && !this.skipRequested) this.soundStep(this.previousElapsed, this.elapsed);
    this.sample(this.elapsed, dt, false); this.overlay.present(this.elapsed);
    if (this.elapsed >= T.duration) { this.release(); return true; } return false;
  }
  private sample(t: number, dt: number, quiet: boolean): void {
    for (const actor of this.actors) {
      actor.previous.copy(actor.position); const sample = sampleEndingSlime(actor.id, t, actor.position);
      if (quiet) actor.previous.copy(actor.position);
      actor.velocity.subVectors(actor.position, actor.previous).divideScalar(dt); actor.intent.copy(actor.velocity).setY(0);
      if (actor.intent.lengthSq() > .001) actor.intent.normalize();
      actor.state.grounded = !sample.airborne; actor.state.landedThisStep = actor.airborne && !sample.airborne;
      if (!quiet && sample.airborne && !actor.airborne) actor.presentation.onLaunch({ directionWorld: actor.velocity, speedMetresPerSecond: 5, chargeFraction: .15 });
      if (!quiet && actor.state.landedThisStep) actor.presentation.onLanding(UP, 5);
      actor.airborne = sample.airborne; actor.pose.position.copy(actor.position); actor.pose.visible = sample.visible;
      if (actor.id === 'goop' && t >= T.leave) actor.intent.set(0, 0, 0);
      actor.pose.rotation.z = actor.id === 'goop' && t >= T.returnFire ? Math.sin((t - T.returnFire) * 2.5) * -.075 : 0;
      if (actor.id === 'goop') for (let i = 0; i < 3; i++) {
        const hit = endingGoopHitTime(i), age = t - hit;
        if (age >= 0 && age < .4) actor.pose.rotation.z += Math.exp(-age * 10) * .25;
        if (t >= hit && t - dt < hit) this.options.presentations.goop.onDamage(.85);
      }
      actor.presentation.setPosition(ZERO); actor.presentation.setYaw(sample.facing);
      this.direction.set(-Math.sin(sample.facing), 0, -Math.cos(sample.facing)); actor.presentation.setAimDirection(this.direction);
      actor.presentation.update(dt, actor.state);
      if (actor.id === 'bob') this.options.presentations.bob.setExpression(t >= T.daylight ? 'surprise' : 'stress-expression', t >= T.daylight ? .6 : .8);
      if (actor.id === 'goop') this.options.presentations.goop.setExpression(t >= T.sacrifice ? 'determined' : 'alert', .85);
      const index = ENDING_DIALOGUE.findIndex(l => t >= l.start && t < l.end && l.speaker === actor.id), line = ENDING_DIALOGUE[index];
      if (!quiet) actor.voice.update(dt, { text: line ? line.text.slice(0, Math.floor((t - line.start) * 25)) : '', pageIndex: Math.max(0, index) });
    }
    this.position.copy(A); this.velocity.set(0, 0, 0); this.direction.set(0, .09, 1);
    const charge = t < T.fire ? endingProgress(t, T.charge, T.fire) : 1;
    this.options.specimen.setVisible(t < T.split); this.options.specimen.setPosition(this.position); this.options.specimen.setYaw(Math.PI);
    this.options.specimen.update(dt, this.specimenState, { aimActive: true, aimDirection: this.direction, charging: t >= T.charge && t < T.explosion, chargeAmount: charge });
    this.world(t); this.effects.present(t, this.specimenSource, this.bossSource, this.actors[1]!.position);
  }
  private world(t: number): void {
    const { boss } = this.options;
    const wrecked = t >= T.explosion, age = Math.max(0, t - T.explosion);
    this.set.bossDamage.visible = t < T.bossLost;
    boss.machine.visible = t < T.bossLost;
    sampleEndingBossWreck(t, boss.machine.position);
    if (!wrecked) boss.machine.position.y += Math.sin(t * 3) * .1;
    boss.machine.rotation.set(wrecked ? .4 + age * .38 : .025 * Math.sin(t * 7), wrecked ? age * .22 : 0, wrecked ? .5 + age * .51 : .03 * Math.sin(t * 5)); boss.rollRig.rotation.set(0, 0, 0);
    this.damageParts.forEach((part, i) => {
      part.rotation.z = (i % 2 ? 1 : -1) * (wrecked ? .65 + i * .11 : .12 + (i % 3) * .09);
      part.visible = i !== 0 && (!wrecked || part.name !== 'armoured-ducted-fan' || i % 3 === 0);
    });
    for (const [clone, color] of this.damagedColors) clone.color.copy(color).multiplyScalar(wrecked ? .22 : 1);
    for (const [mesh, visible] of this.emissiveMeshes) mesh.visible = !wrecked && visible;
    boss.core.visible = !wrecked; boss.shield.visible = false;
    for (const mesh of [boss.beam, boss.beamCore, boss.beamImpact, boss.eyeCharge, boss.finalShot, boss.explosion, boss.ramWarning, boss.beamWarning]) mesh.visible = false;
    boss.machine.updateMatrixWorld(true);
    if (!wrecked) boss.rollRig.localToWorld(this.bossSource.set(0, -.1, -4.65));
    else this.bossSource.set(0, 11.7, FINAL_ARENA.centreZ - 33.95);
    this.specimenSource.copy(A); this.specimenSource.y += .8; this.specimenSource.z += 1.2;
    this.drones.forEach((drone, i) => {
      drone.root.visible = sampleEndingDrone(i, t, drone.root.position);
      if (!drone.root.visible) return;
      this.direction.subVectors(this.actors[1]!.position, drone.root.position); this.direction.y += .5;
      drone.root.rotation.set(Math.atan2(this.direction.y, Math.hypot(this.direction.x, this.direction.z)), Math.atan2(-this.direction.x, -this.direction.z), Math.sin(t * 1.4 + i * 3.1) * .035);
    });
    this.set.present(t);
    if (this.scene instanceof THREE.Scene) {
      this.scene.background = t >= T.daylight ? this.daylightBackground : this.oldBackground;
      this.scene.fog = t >= T.daylight ? this.daylightFog : this.oldFog;
    }
  }
  present(camera: THREE.PerspectiveCamera, alpha: number): void {
    if (!this.playing) return;
    const t = THREE.MathUtils.lerp(this.previousElapsed, this.elapsed, THREE.MathUtils.clamp(alpha, 0, 1));
    for (const actor of this.actors) { const pose = sampleEndingSlime(actor.id, t, this.direction); actor.pose.position.copy(this.direction); actor.pose.visible = pose.visible; actor.presentation.present(alpha); }
    this.options.specimen.present(alpha); this.world(t); this.effects.present(t, this.specimenSource, this.bossSource, this.actors[1]!.position);
    this.cameraTrack.present(camera, t, this.specimenSource, this.bossSource, this.effects.collision, this.actors[0]!.position, this.actors[1]!.position, this.actors[2]!.position);
    if (!this.preparing) this.overlay.present(t);
  }
  private soundStep(before: number, t: number): void {
    for (const cue of CUES) if (before < cue.at && t >= cue.at) gameplayAudioEvents.emit('cue', { sound: cue.sound, volumeScale: cue.gain });
    if (before < T.charge && t >= T.charge) gameplayAudioEvents.emit('loop', { key: LOOP_KEYS[0]!, sound: 'world-machinery-loop-01', volumeScale: .2 });
    if (before < T.fire && t >= T.fire) gameplayAudioEvents.emit('loop', { key: LOOP_KEYS[1]!, sound: 'escape-drone-strain-loop-01', volumeScale: .65 });
    if (before < T.explosion && t >= T.explosion) { for (const key of LOOP_KEYS.slice(0, 2)) gameplayAudioEvents.emit('stop', { key });
      gameplayAudioEvents.emit('loop', { key: LOOP_KEYS[2]!, sound: 'world-machinery-loop-01', volumeScale: .18 }); }
    if (before < T.black && t >= T.black) this.stopSound();
    if (t > T.explosion && t < T.black && Math.floor((t - T.explosion) / 3) !== Math.floor((before - T.explosion) / 3))
      gameplayAudioEvents.emit('cue', { sound: 'cultivation-duct-floor-strain-01', volumeScale: .25 });
    for (let i = 0; i < 24; i++) { const death = endingDroneDeathTime(i);
      if (before < death - 1 && t >= death - 1) gameplayAudioEvents.emit('cue', { sound: 'volt-shoot-01', position: this.actors[1]!.position, volumeScale: .35, maxDistance: 120 });
    }
    if (t >= T.leave && t < T.hideGoop && Math.floor((t - T.leave) / .7) !== Math.floor((before - T.leave) / .7))
      gameplayAudioEvents.emit('cue', { sound: 'volt-shoot-01', position: this.actors[1]!.position, volumeScale: .25, maxDistance: 100 });
    if (t >= T.returnFire && t < T.hideGoop && Math.floor((t - T.returnFire) / .32) !== Math.floor((before - T.returnFire) / .32))
      gameplayAudioEvents.emit('cue', { sound: 'specimen-turret-shot', volumeScale: .16 });
    for (let i = 0; i < 3; i++) if (before < endingGoopHitTime(i) && t >= endingGoopHitTime(i))
      gameplayAudioEvents.emit('cue', { sound: 'world-door-stop-01', volumeScale: .17 });
    for (let i = 0; i < 12; i++) if (before < endingCollapseBlastTime(i) && t >= endingCollapseBlastTime(i))
      gameplayAudioEvents.emit('cue', { sound: 'cultivation-cover-drone-impact-01', volumeScale: .55 });
  }
  async primePresentationFrames(render: (camera: THREE.PerspectiveCamera) => Promise<void>, current: () => boolean): Promise<void> {
    if (this.disposed || this.playing || !current()) return;
    const camera = new THREE.PerspectiveCamera(52, 16 / 9, .1, 1800), wasPlayed = this.played;
    if (!this.begin(camera, true)) return;
    this.preparation.complete = false; this.preparation.frames = 0;
    try {
      for (const t of PREPARATION) {
        if (!current()) return;
        this.elapsed = this.previousElapsed = t; this.sample(t, 1 / 60, true); this.present(camera, 1);
        await render(camera); this.preparation.frames++;
      }
      this.preparation.complete = current();
    } finally { this.release(); this.played = wasPlayed; this.elapsed = this.previousElapsed = 0; }
  }
  private stopSound(): void { for (const key of LOOP_KEYS) gameplayAudioEvents.emit('stop', { key }); gameplayAudioEvents.emit('stopSound', { sound: 'escape-drone-strain-loop-01' }); }
  private release(): void {
    this.music?.stop(); this.music = undefined;
    if (!this.preparing) this.stopSound();
    if (this.playing) {
      for (const actor of this.actors) {
        if (actor.parent) actor.parent.add(actor.presentation.root); else actor.presentation.root.removeFromParent();
        actor.presentation.reset(); actor.voice.reset(); actor.airborne = false;
      }
      this.options.specimen.reset(); this.restore?.(); this.restore = undefined;
      if (this.scene instanceof THREE.Scene) { this.scene.background = this.oldBackground; this.scene.fog = this.oldFog; }
      if (this.camera && this.savedCamera) { const s = this.savedCamera; this.camera.fov = s.fov; this.camera.far = s.far;
        this.camera.position.copy(s.position); this.camera.quaternion.copy(s.quaternion); this.camera.updateProjectionMatrix(); }
    }
    this.playing = this.preparing = false; this.owned.visible = false; this.set.reset(); this.overlay.hide();
    if (this.options.host.dataset.cinematic === 'boss-defeat') delete this.options.host.dataset.cinematic;
  }
  reset(): void { this.release(); this.played = false; this.didSkipCredits = false; this.elapsed = this.previousElapsed = 0; }
  dispose(): void { if (this.disposed) return; this.reset(); this.disposed = true; this.overlay.dispose(); this.effects.dispose(); this.set.dispose();
    this.drones.forEach(d => d.dispose()); this.droneResources.dispose(); this.damagedClones.forEach(m => m.dispose()); this.owned.removeFromParent(); }
}
