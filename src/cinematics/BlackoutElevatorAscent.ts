import * as THREE from 'three';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { BobCharacterPresentation, BobCharacterPresentationState } from '../render/bob/BobCharacterPresentation.ts';
import type { GoopCharacterPresentation } from '../render/goop/GoopCharacterPresentation.ts';
import type { VoltCharacterPresentation } from '../render/volt/VoltCharacterPresentation.ts';
import { BlackoutElevatorAudio } from '../audio/BlackoutCutsceneAudio.ts';
import { CinematicMusic } from '../audio/CinematicMusic.ts';
import { TypewriterAudio } from '../audio/TypewriterAudio.ts';
import { BlackoutAscentLift, BLACKOUT_ASCENT_LIFT as V } from '../levels/BlackoutAscentLift.ts';
import { BlackoutElevatorOverlay } from './BlackoutElevatorOverlay.ts';
import { ELEVATOR_DIALOGUE, ELEVATOR_TIMING as T, elevatorBoardingRoute, sampleElevatorBoarding, elevatorSmooth as smooth,
  elevatorTravel, type ElevatorBoardingRoute, type ElevatorSlime } from './BlackoutElevatorTimeline.ts';

type Presentation = BobCharacterPresentation | GoopCharacterPresentation | VoltCharacterPresentation;
interface Options {
  readonly root: THREE.Group; readonly host: HTMLElement; readonly lift: BlackoutAscentLift;
  readonly bodies: Readonly<Record<ElevatorSlime, KinematicBody>>;
  readonly presentations: Readonly<Record<ElevatorSlime, Presentation>>;
}
interface Actor {
  readonly id: ElevatorSlime; readonly body: KinematicBody; readonly presentation: Presentation; readonly pose: THREE.Group;
  readonly position: THREE.Vector3; readonly previous: THREE.Vector3; readonly velocity: THREE.Vector3; readonly intent: THREE.Vector3;
  readonly state: BobCharacterPresentationState; readonly voice: TypewriterAudio;
  parent: THREE.Object3D | null; route?: ElevatorBoardingRoute; airborne: boolean;
}
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();

export class BlackoutElevatorAscent {
  readonly actors: readonly Actor[];
  readonly overlay: BlackoutElevatorOverlay;
  private readonly options: Options;
  private readonly sound = new BlackoutElevatorAudio();
  private music?: CinematicMusic;
  private playing = false;
  private played = false;
  private disposed = false;
  private skipRequested = false;
  private elapsed = 0;
  private previousElapsed = 0;
  private boardEnd = 0;
  private camera?: THREE.PerspectiveCamera;
  private savedFov = 48;
  private readonly ambient?: THREE.HemisphereLight;
  private savedAmbient = 0;
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly sample = new THREE.Vector3();
  private readonly source = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly look = new THREE.Matrix4();
  private readonly orientation = new THREE.Quaternion();

  constructor(options: Options) {
    this.options = options;
    let ambient: THREE.HemisphereLight | undefined;
    options.root.traverse(node => { if (node instanceof THREE.HemisphereLight) ambient ??= node; }); this.ambient = ambient;
    this.overlay = new BlackoutElevatorOverlay(options.host, () => { this.skipRequested = true; });
    this.actors = (['bob', 'goop', 'volt'] as const).map(id => {
      const body = options.bodies[id], presentation = options.presentations[id], pose = new THREE.Group();
      pose.name = `blackout-elevator-${id}`; pose.visible = false; options.root.add(pose);
      const position = new THREE.Vector3(), previous = new THREE.Vector3(), velocity = new THREE.Vector3(), intent = new THREE.Vector3();
      const state: BobCharacterPresentationState = {
        locomotionPositionWorld: position, velocityWorld: velocity, movementIntentWorld: intent, maximumLocomotionSpeedMetresPerSecond: 6,
        surfaceNormalWorld: UP, gameplayUpWorld: UP, grounded: true, attached: false, chargingJump: false, jumpCharge: 0,
        contactCount: 0, contactNormalWorld: UP, contactSpeedMetresPerSecond: 0, contactName: 'lift-car-floor', contactSurfaceTag: 'default', landedThisStep: false,
      };
      const voice = new TypewriterAudio(pose, { sound: 'bob-contact-01', intervalSeconds: id === 'goop' ? .1 : .14, maxDistance: 30, volumeScale: id === 'goop' ? .45 : .35, localPosition: { x: 0, y: .4, z: 0 } });
      return { id, body, presentation, pose, position, previous, velocity, intent, state, voice, parent: null, airborne: false };
    });
  }
  get active(): boolean { return this.playing; }
  get complete(): boolean { return this.played && !this.playing; }
  get seconds(): number { return this.elapsed; }
  get boardingSeconds(): number { return this.boardEnd; }
  get voltGlowWeight(): number { return this.playing ? .08 + .92 * smooth((this.elapsed - this.boardEnd - T.handback) / (T.duration - T.handback)) : 1; }

  begin(camera: THREE.PerspectiveCamera): boolean {
    if (this.played || this.disposed) return false;
    this.played = this.playing = true; this.skipRequested = false; this.elapsed = this.previousElapsed = 0;
    this.camera = camera; this.savedFov = camera.fov;
    if (this.ambient) { this.savedAmbient = this.ambient.intensity; this.ambient.intensity = Math.max(.16, this.savedAmbient); }
    this.boardEnd = 4;
    for (const actor of this.actors) {
      actor.position.copy(actor.body.position); actor.previous.copy(actor.position);
      actor.route = elevatorBoardingRoute(actor.id, actor.position, actor.body.radiusMetres); this.boardEnd = Math.max(this.boardEnd, actor.route.duration);
      actor.parent = actor.presentation.root.parent; actor.pose.add(actor.presentation.root); actor.pose.position.copy(actor.position); actor.pose.visible = true;
      actor.presentation.setPosition(ZERO); actor.presentation.reset(); actor.presentation.setYaw(Math.PI); actor.presentation.setVisible(true); actor.presentation.setOpacity(1); actor.voice.reset();
    }
    this.music = new CinematicMusic('ascent', this.boardEnd + T.duration);
    this.music.update(0);
    this.options.host.dataset.cinematic = 'blackout-elevator'; this.overlay.present(-this.boardEnd);
    return true;
  }

  update(dt: number, skip = false): boolean {
    if (!this.playing) return false;
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('Invalid elevator cinematic timestep.');
    this.previousElapsed = this.elapsed;
    this.elapsed = skip || this.skipRequested ? this.boardEnd + T.duration : Math.min(this.boardEnd + T.duration, this.elapsed + dt);
    this.music?.update(this.elapsed);
    const t = this.elapsed - this.boardEnd, before = this.previousElapsed - this.boardEnd;
    for (const actor of this.actors) {
      actor.previous.copy(actor.position); const airborne = this.sampleActor(actor, this.elapsed, actor.position);
      actor.velocity.subVectors(actor.position, actor.previous).divideScalar(dt); actor.intent.copy(actor.velocity); actor.intent.y = 0;
      if (actor.intent.lengthSq() > .001) actor.intent.normalize();
      if (airborne && !actor.airborne) actor.presentation.onLaunch({ directionWorld: actor.velocity, speedMetresPerSecond: 5, chargeFraction: .25 });
      if (!airborne && actor.airborne) actor.presentation.onLanding(UP, 4);
      actor.airborne = airborne; actor.state.grounded = !airborne;
      actor.body.syncKinematicPose(actor.position, actor.previous); actor.pose.position.copy(actor.position); actor.presentation.setPosition(ZERO);
      if (actor.intent.lengthSq() >= .01) actor.presentation.setAimDirection(actor.intent);
      else {
        if (t > -.5 && t < T.lift) {
          const lookAt = actor.id === 'volt' && t >= T.power - 1 ? V.outlet : actor.id === 'goop' ? V.standing.volt : V.standing.goop;
          this.direction.subVectors(lookAt, actor.position); actor.presentation.setAimDirection(this.direction);
        } else { this.direction.set(0, 0, 1); actor.presentation.setAimDirection(this.direction); }
      }
      actor.presentation.update(dt, actor.state);
      const lineIndex = ELEVATOR_DIALOGUE.findIndex(line => t >= line.start && t < line.end && line.speaker === actor.id);
      const line = ELEVATOR_DIALOGUE[lineIndex];
      if (!skip && !this.skipRequested) this.sound.movement.update(actor.id,this.elapsed,actor.position,airborne,true,
        (sound,position,volume,vary)=>this.sound.cue(sound,position,volume,vary));
      actor.voice.update(dt, { text: line ? line.text.slice(0, Math.floor((t - line.start) * 24)) : '', pageIndex: Math.max(0, lineIndex) });
    }
    if (!skip && !this.skipRequested) this.sound.update(before,t);
    this.presentLift(t); this.overlay.present(t);
    if (t >= T.duration) {
      for (const actor of this.actors) actor.body.teleport(actor.position);
      this.release(); this.options.lift.setArrived(true); return true;
    }
    return false;
  }

  private sampleActor(actor: Actor, seconds: number, target: THREE.Vector3): boolean {
    if (seconds < this.boardEnd && actor.route) return sampleElevatorBoarding(actor.route, seconds, target);
    const t = seconds - this.boardEnd, radiusOffset = actor.body.radiusMetres - .45;
    target.copy(V.standing[actor.id]); target.y += radiusOffset;
    if (t >= T.exit) {
      target.lerp(V.landing[actor.id], smooth((t - T.exit - (actor.id === 'goop' ? .25 : 0)) / 4));
      target.y = V.landing[actor.id].y + radiusOffset;
    }
    return false;
  }

  private presentLift(t: number): void {
    this.source.copy(this.actors[2]!.position); this.source.y += .45;
    const pulse = t >= T.power && t < T.power + 1.55 && (t - T.power) % .65 < .24;
    this.options.lift.present(elevatorTravel(t), smooth((t + 1.8) / 1.6), smooth((t - T.open) / 1.8),
      smooth((t - T.power) / (T.powered - T.power)), t, pulse ? this.source : undefined);
  }

  present(camera: THREE.PerspectiveCamera, alpha: number): void {
    if (!this.playing) return;
    const seconds = THREE.MathUtils.lerp(this.previousElapsed, this.elapsed, THREE.MathUtils.clamp(alpha, 0, 1)), t = seconds - this.boardEnd;
    for (const actor of this.actors) {
      this.sampleActor(actor, seconds, this.sample); actor.pose.position.copy(this.sample); actor.presentation.setPosition(ZERO); actor.presentation.present(alpha);
      actor.presentation.setVisible(true); actor.presentation.setOpacity(1);
    }
    this.presentLift(t); this.overlay.present(t);
    let fov = 49;
    if (t < 0) {
      const u = smooth(seconds / Math.max(4, this.boardEnd));
      this.eye.set(-3.1 + u * .8, 2.7, 183.4); this.target.set(.2, 1.15, 176.9 + 2 * u); fov = 58;
    } else if (t >= .65 && t < 5.15) {
      const u = smooth((t - .65) / 4.1);
      this.eye.set(2.8 - .2 * u, 1.9, 183.7); this.target.set(.25, 1.25, 180.65); fov = 52;
    } else if (t < T.power) {
      const u = smooth(t / T.power); this.eye.set(-2.8 + .3 * u, 1.9, 177.8); this.target.set(.6, 1.3, 181); fov = 51;
    } else if (t < T.lift + 1) {
      const u = smooth((t - T.power) / 4.4); this.eye.set(-.1 + .3 * u, 2.1, 179.6); this.target.set(2.65, 1.7, 181.25); fov = 49;
    } else if (t < 22) {
      const u = smooth((t - T.lift - 1) / (22 - T.lift - 1));
      this.eye.set(-4.9 + .3 * u, 3.15 + .25 * u, 178.8); this.target.set(.3, 1.45 + .2 * u, 181.15); fov = 57;
    } else if (t < 32) {
      const u = smooth((t - 22) / 10); this.eye.set(.45 - .2 * u, 1.95, 184.35); this.target.set(0, 1.3, 181.05); fov = 58;
    } else if (t < 40) {
      const u = smooth((t - 32) / 8); this.eye.set(3.3 - .3 * u, 2.5 + .15 * u, 177.5); this.target.set(-.6, 1.35 + .1 * u, 181.2); fov = 55;
    } else {
      const u = smooth((t - T.exit) / 5); this.eye.set(-3.05 + .4 * u, 2.7, 177.6 + 2 * u); this.target.set(0, 1.3, 181.6 + 4.8 * u); fov = 57;
    }
    this.look.lookAt(this.eye, this.target, UP); this.orientation.setFromRotationMatrix(this.look);
    const blend = smooth((t - T.handback) / (T.duration - T.handback));
    if (this.ambient) this.ambient.intensity = THREE.MathUtils.lerp(Math.max(.16, this.savedAmbient), this.savedAmbient, blend);
    camera.position.lerpVectors(this.eye, camera.position, blend); camera.quaternion.slerp(this.orientation, 1 - blend);
    camera.fov = THREE.MathUtils.lerp(fov, this.savedFov, blend); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }

  reset(arrived = false): void {
    this.release(); this.played = arrived; this.elapsed = this.previousElapsed = 0; this.options.lift.setArrived(arrived);
  }
  private release(): void {
    this.music?.stop(); this.music = undefined;
    this.sound.stop();
    if (this.playing) {
      for (const actor of this.actors) {
        if (actor.parent) actor.parent.add(actor.presentation.root); else actor.presentation.root.removeFromParent();
        actor.pose.visible = false; actor.presentation.setPosition(actor.body.position); actor.airborne = false;
      }
      if (this.camera) { this.camera.fov = this.savedFov; this.camera.updateProjectionMatrix(); }
      if (this.ambient) this.ambient.intensity = this.savedAmbient;
    }
    this.playing = false; this.overlay.hide();
    if (this.options.host.dataset.cinematic === 'blackout-elevator') delete this.options.host.dataset.cinematic;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.release(); this.overlay.dispose(); this.actors.forEach(actor => actor.pose.removeFromParent());
  }
}
