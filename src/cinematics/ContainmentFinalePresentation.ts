import { CinematicMusic } from '../audio/CinematicMusic.ts';
import * as THREE from 'three';
import type { SoundId } from '../audio/SoundCatalog.ts';
import { CONTAINMENT_FINALE_AUDIO_CUES, ContainmentFinaleMovementAudio, containmentProjectileImpactSound } from '../audio/ContainmentFinaleAudio.ts';
import type { ContainmentLevelScene } from '../levels/ContainmentLevelScene.ts';
import type { BobCharacterPresentationState } from '../render/bob/BobCharacterPresentation.ts';
import type { CinematicPreparationJob } from './IdleCinematicPreparation.ts';
import { ContainmentFinaleVisuals } from './ContainmentFinaleVisuals.ts';
import { ContainmentFinaleOverlay } from './ContainmentFinaleOverlay.ts';
import { ContainmentFinaleSetDressing } from './ContainmentFinaleSetDressing.ts';
import { CONTAINMENT_FINALE_TIMING as T, finaleEase, sampleContainmentFinale, type FinalePoint } from './ContainmentFinaleTimeline.ts';
import { ROOM_FIVE_ESCAPE } from '../levels/RoomFiveEscapeLayout.ts';
import { FINALE_BOB_JUMPS, finaleJumpVelocity } from './ContainmentFinaleBobMotion.ts';
import { finaleTime as F } from './ContainmentFinaleTiming.ts';
import { FINALE_GOOP_DODGES } from './ContainmentFinaleCombat.ts';

interface Options {
  readonly scene: THREE.Scene;
  readonly world: ContainmentLevelScene;
  readonly camera: THREE.PerspectiveCamera;
  readonly overlay: ContainmentFinaleOverlay;
  readonly cue: (sound: SoundId, position?: THREE.Vector3, volumeScale?: number) => void;
  readonly openDoor: () => void;
}
const UP = new THREE.Vector3(0, 1, 0), WALL = new THREE.Vector3(0, 0, -1), ZERO = new THREE.Vector3();

/** Borrows the two already-loaded models. Their owners retain all asset ownership. */
export class ContainmentFinalePresentation {
  readonly visuals: ContainmentFinaleVisuals;
  readonly actors = new THREE.Group();
  readonly setDressing = new ContainmentFinaleSetDressing();
  private readonly bobPose = new THREE.Group();
  private readonly goopPose = new THREE.Group();
  private readonly options: Options;
  private bobParent: THREE.Object3D | null = null;
  private goopParent: THREE.Object3D | null = null;
  private bobStart: FinalePoint = [-10, 97.95, 130.55];
  private savedCamera: { fov: number; far: number; near: number; up: THREE.Vector3 } | undefined;
  private foundation: THREE.HemisphereLight | undefined;
  private foundationIntensity = 0;
  private music = new CinematicMusic('escape', T.end);
  private started = false;
  private disposed = false;
  private lastRenderedSeconds = 0;
  private lastFixedSeconds = 0;
  private actorSeconds = 0;
  private doorOpened = false;
  private readonly bobPosition = new THREE.Vector3();
  private readonly goopPosition = new THREE.Vector3();
  readonly shadowParticipants: readonly THREE.Vector3[] = [this.bobPosition, this.goopPosition];
  private readonly bobVelocity = new THREE.Vector3();
  private readonly goopVelocity = new THREE.Vector3();
  private readonly bobIntent = new THREE.Vector3();
  private readonly goopIntent = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly movementAudio = new ContainmentFinaleMovementAudio();
  private readonly bobSurface = new THREE.Vector3(0, 1, 0);
  private readonly bobState: BobCharacterPresentationState = {
    locomotionPositionWorld: this.bobPosition, velocityWorld: this.bobVelocity,
    movementIntentWorld: this.bobIntent, maximumLocomotionSpeedMetresPerSecond: 6,
    surfaceNormalWorld: this.bobSurface, gameplayUpWorld: UP, grounded: true, attached: false,
    chargingJump: false, jumpCharge: 0, contactCount: 0, contactNormalWorld: UP,
    contactSpeedMetresPerSecond: 0, contactName: '', contactSurfaceTag: '', landedThisStep: false,
  };
  private readonly goopState = { locomotionPositionWorld: this.goopPosition, velocityWorld: this.goopVelocity,
    movementIntentWorld: this.goopIntent, maximumLocomotionSpeedMetresPerSecond: 6, grounded: true };

  constructor(options: Options) {
    this.visuals = new ContainmentFinaleVisuals([options.world.roomFive.art.root, ...options.world.roomFive.collisionMeshes],
      options.world.roomFive.art.shell.ready);
    this.options = options; this.actors.name = 'containment-finale-borrowed-actors';
    this.actors.visible = false; this.actors.add(this.bobPose, this.goopPose);
    this.visuals.root.add(this.setDressing.root);
    options.scene.add(this.visuals.root, this.actors);
  }
  get active(): boolean { return this.started; }
  *preparationJobs(): Generator<CinematicPreparationJob> {
    yield* this.visuals.preparationJobs();
    const art = this.options.world.roomFive.art;
    yield* this.setDressing.preparationJobs(art.containmentAssembly, art.containmentPanelRoot);
  }

  begin(position: THREE.Vector3): void {
    if (this.started || this.disposed) return;
    const { world, camera } = this.options;
    this.bobStart = [position.x, position.y, position.z];
    this.bobParent = world.bob.root.parent; this.goopParent = world.roomFive.goopPresentation.root.parent;
    this.bobPose.add(world.bob.root); this.goopPose.add(world.roomFive.goopPresentation.root);
    world.bob.reset(); world.roomFive.goopPresentation.reset();
    world.bob.setPosition(ZERO); world.roomFive.goopPresentation.setPosition(ZERO);
    world.goop.setVisible(false); world.roomFive.goopSpeech.root.visible = false;
    this.savedCamera = { fov: camera.fov, near: camera.near, far: camera.far, up: camera.up.clone() };
    camera.near = .08; camera.far = 90;
    world.lighting.setActiveRoom(5);
    const foundation = this.options.scene.getObjectByName('containment-cold-clinical-foundation');
    if (foundation instanceof THREE.HemisphereLight) {
      this.foundation = foundation; this.foundationIntensity = foundation.intensity;
      foundation.intensity = Math.max(foundation.intensity, .7);
    }
    this.visuals.root.visible = this.actors.visible = true;
    this.setDressing.begin();
    this.started = true; this.lastRenderedSeconds = 0; this.lastFixedSeconds = 0; this.doorOpened = false;
    this.actorSeconds = 0; this.updateActors(0, 0);
    this.movementAudio.reset();
    this.movementAudio.update(sampleContainmentFinale(0, this.bobStart), () => {});
    this.music = new CinematicMusic('escape', T.end);
    this.render(0);
  }

  fixedUpdate(seconds: number): void {
    if (!this.started || this.disposed) return;
    this.music.update(seconds);
    const { cue } = this.options, before = this.lastFixedSeconds;
    for (const [time, sound] of CONTAINMENT_FINALE_AUDIO_CUES) if (time > before && time <= seconds) cue(sound);
    for (const shot of this.visuals.shots) if (shot.t > before && shot.t <= seconds) {
      this.direction.fromArray(shot.from); cue(shot.green ? 'goop-shoot-01' : 'specimen-turret-shot', this.direction);
      if (shot.green) {
        this.direction.set(shot.to[0] - shot.from[0], shot.to[1] - shot.from[1], shot.to[2] - shot.from[2]).normalize();
        this.options.world.roomFive.goopPresentation.onAcidFired(this.direction);
      }
    }
    for (const shot of this.visuals.shots) if (shot.t+shot.duration>before && shot.t+shot.duration<=seconds) {
      const sound = containmentProjectileImpactSound(shot);
      if (sound) { this.direction.fromArray(shot.to); cue(sound, this.direction); }
    }
    for (const jump of FINALE_GOOP_DODGES) {
      if (jump.start>before && jump.start<=seconds) cue('bob-jump-01');
      if (jump.end>before && jump.end<=seconds) cue('bob-land-soft-01');
    }
    this.advanceActors(seconds);
    this.movementAudio.update(sampleContainmentFinale(seconds, this.bobStart), (position, volumeScale) => {
      this.direction.fromArray(position);
      cue('bob-contact-01', this.direction, volumeScale);
    });
    if (!this.doorOpened && seconds >= T.doorHit) { this.doorOpened = true; this.options.openDoor(); }
    this.lastFixedSeconds = seconds;
  }

  render(seconds: number): void {
    if (!this.started || this.disposed) return;
    this.music.update(seconds);
    const frame = sampleContainmentFinale(seconds, this.bobStart), t = frame.seconds;
    const dt = Math.min(.05, Math.max(0, t - this.lastRenderedSeconds)); this.lastRenderedSeconds = t;
    this.advanceActors(t);
    const { world, camera, overlay } = this.options, goop = world.roomFive.goopPresentation;
    world.surveillanceCameras?.update(dt, this.bobPosition);
    world.roomFive.art.setReleaseProgress(frame.panelOpen);
    world.roomFive.setReleaseButtonProgress(finaleEase(0,.25,t));
    this.visuals.update(frame);
    camera.position.fromArray(frame.cameraPosition); camera.up.fromArray(frame.cameraUp);
    camera.fov = frame.cameraFov; camera.updateProjectionMatrix();
    this.direction.fromArray(frame.cameraTarget); camera.lookAt(this.direction); camera.updateMatrixWorld(true);
    goop.updateDetail(camera);
    overlay.render(frame);
  }

  /** Gameplay poses tick on the movie clock, not on how often a frame is drawn. */
  private advanceActors(seconds: number): void {
    const target = sampleContainmentFinale(seconds).seconds;
    if (target < this.actorSeconds || target - this.actorSeconds > .75) {
      // Editor seeks / Skip must not replay thousands of animation steps in one frame.
      this.options.world.bob.reset(); this.options.world.roomFive.goopPresentation.reset();
      this.actorSeconds = Math.max(0,target-.65); this.updateActors(this.actorSeconds,0);
    }
    while (target - this.actorSeconds > 1e-9) {
      const next = Math.min(target,this.actorSeconds+1/60);
      this.updateActors(next,next-this.actorSeconds); this.actorSeconds = next;
    }
  }

  private updateActors(t: number, dt: number): void {
    const frame = sampleContainmentFinale(t,this.bobStart);
    const before = sampleContainmentFinale(Math.max(0,t-.001),this.bobStart);
    const { world } = this.options, bob = world.bob, goop = world.roomFive.goopPresentation;
    this.bobPosition.fromArray(frame.bob); this.goopPosition.fromArray(frame.goop);
    this.bobVelocity.set((frame.bob[0] - before.bob[0]) / .001, (frame.bob[1] - before.bob[1]) / .001, (frame.bob[2] - before.bob[2]) / .001);
    this.goopVelocity.set((frame.goop[0] - before.goop[0]) / .001, (frame.goop[1] - before.goop[1]) / .001, (frame.goop[2] - before.goop[2]) / .001);
    if (frame.latched) this.bobVelocity.set(0,0,0); // Carrier jitter is not player locomotion.
    this.bobIntent.copy(this.bobVelocity).normalize(); this.goopIntent.copy(this.goopVelocity).normalize();
    this.bobState.grounded = !frame.bobAirborne && !frame.bobAttached;
    this.bobState.attached = frame.bobAttached;
    this.bobSurface.copy(frame.bobAttached?WALL:UP);
    this.bobState.chargingJump = frame.bobCharging; this.bobState.jumpCharge = frame.bobCharge;
    this.goopState.grounded = !frame.goopAirborne;
    this.bobPose.position.copy(this.bobPosition); this.goopPose.position.copy(this.goopPosition);
    this.bobPose.rotation.set(0, 0, 0); this.goopPose.rotation.set(0, 0, 0);
    const bobTarget = t < 3 ? [-10, 98.45, 131.14] : t < T.bobNotices || (t >= F(61.8) && t < T.reinforcements) ? frame.goop
      : t < T.droneHit ? frame.drone : t<T.reinforcements?frame.goop:t<T.goopSpotsVent?[0,81,111]:[0,75,140];
    const goopTarget = t < 15 || (t >= F(61.8) && t < T.reinforcements) ? frame.bob
      :t<T.goopSpotsVent?frame.drone:t<F(69.9)?ROOM_FIVE_ESCAPE.coverPosition:[0,75.5,140];
    const charging = FINALE_BOB_JUMPS.find(jump=>t>=jump.chargeStart&&t<jump.start);
    if (charging) this.direction.set(charging.to[0]-charging.from[0],0,charging.to[2]-charging.from[2]);
    else if (!frame.latched && Math.hypot(this.bobVelocity.x,this.bobVelocity.z)>.15) this.direction.copy(this.bobVelocity);
    else this.direction.set(bobTarget[0]-frame.bob[0],0,bobTarget[2]-frame.bob[2]);
    // Locomotion owns facing while moving. Reapplying a look command every
    // step would restart the authored 180-degree reversal hold indefinitely.
    if(frame.bobCharging||!this.bobState.grounded||Math.hypot(this.bobVelocity.x,this.bobVelocity.z)<.15)
      bob.setAimDirection(this.direction);
    const goopCharge = FINALE_GOOP_DODGES.find(jump=>t>=jump.chargeStart&&t<jump.start);
    const movingGoop = (t > 5.3 && t < 9.5) || t >= F(69.9) || (t>=T.combat && t<T.cleanShot);
    if(goopCharge)this.direction.set(goopCharge.to[0]-goopCharge.from[0],0,goopCharge.to[2]-goopCharge.from[2]);
    else if (movingGoop) this.direction.copy(this.goopVelocity);
    else this.direction.set(goopTarget[0]-frame.goop[0],0,goopTarget[2]-frame.goop[2]);
    if(frame.goopCharging||!this.goopState.grounded||Math.hypot(this.goopVelocity.x,this.goopVelocity.z)<.15)goop.setAimDirection(this.direction);
    for (const jump of FINALE_BOB_JUMPS) {
      if (this.actorSeconds < jump.start && t >= jump.start) {
        this.direction.fromArray(finaleJumpVelocity(jump,jump.start));
        const speed=this.direction.length(); this.direction.normalize();
        bob.onLaunch({directionWorld:this.direction,speedMetresPerSecond:speed,chargeFraction:jump.charge});
      }
      if (jump.id !== 'vent-dive' && this.actorSeconds < jump.end && t >= jump.end) {
        const velocity=finaleJumpVelocity(jump,jump.end);
        bob.onLanding(jump.wallLanding?WALL:UP,Math.abs(jump.wallLanding?velocity[2]:velocity[1]));
      }
    }
    for (const jump of FINALE_GOOP_DODGES) {
      if(this.actorSeconds<jump.start&&t>=jump.start){
        this.direction.fromArray(finaleJumpVelocity(jump,jump.start));
        const speed=this.direction.length();this.direction.normalize();
        goop.onLaunch({directionWorld:this.direction,speedMetresPerSecond:speed,chargeFraction:jump.charge});
      }
      if(this.actorSeconds<jump.end&&t>=jump.end)goop.onLanding(UP,Math.abs(finaleJumpVelocity(jump,jump.end)[1]));
    }
    if (this.actorSeconds < 5.3 && t >= 5.3) goop.onLaunch({directionWorld:UP,speedMetresPerSecond:3,chargeFraction:.3});
    if (this.actorSeconds < 9.5 && t >= 9.5) goop.onLanding(UP,3);
    if (this.actorSeconds < T.goopDive && t >= T.goopDive) goop.onLaunch({directionWorld:UP,speedMetresPerSecond:5,chargeFraction:.5});
    bob.update(dt,this.bobState); goop.update(dt,this.goopState);
    const pulse=(start:number,hold:number,end:number)=>finaleEase(F(start),F(hold),t)*(1-finaleEase(F(hold),F(end),t));
    const surprise=Math.max(pulse(15,16,26),pulse(65.9,66.4,69));
    bob.setExpression('surprise',surprise*.85);
    bob.setExpression('effort',Math.max(pulse(35.8,37,48.3)*.6,pulse(70,71.4,80.5)*.5));
    bob.setExpression('stress-expression',frame.mountCompression*.8);
    bob.setExpression('blink',Math.max(pulse(62.3,62.4,62.55),pulse(64,64.1,64.25)));
    goop.setExpression('alert',Math.max(pulse(15,16,26),pulse(65.9,66.4,69)));
    goop.setExpression('determined',Math.max(pulse(25.1,26,61.8)*.9,pulse(67.5,68.9,80)*.8));
    goop.setExpression('relieved',pulse(61.8,62.6,65.9));
    goop.setExpression('blink',pulse(63.1,63.2,63.4));
    this.bobPose.scale.set(1+.12*frame.mountCompression,1-.25*frame.mountCompression,1+.12*frame.mountCompression);
    // Goop has no charge morph: compress around the planted sole before each
    // dodge, then let his normal launch/airborne/landing gel animation take over.
    const goopCompression=frame.goopCharge*.22;
    this.goopPose.scale.set(1+goopCompression*.6,1-goopCompression,1+goopCompression*.6);
    this.goopPose.position.y-=goop.radiusMetres*goopCompression;
    if (t >= 10.5 && t < F(37.55)) this.bobPose.rotation.x = -.12 * (1-finaleEase(F(36.5),F(37.55),t));
    if (t>=T.bobDive)this.bobPose.rotation.x=finaleEase(T.bobDive,T.bobDive+.8,t)*Math.PI/2;
    if (t>=T.goopDive)this.goopPose.rotation.x=finaleEase(T.goopDive,T.goopDive+.8,t)*Math.PI/2;
    if (t >= 9.5 && t < T.droneHit && !movingGoop) {
      const dx=goopTarget[0]-frame.goop[0], dz=goopTarget[2]-frame.goop[2];
      this.goopPose.rotation.x = -.16 * dz / Math.max(.001,Math.hypot(dx,dz));
    }
    bob.setPosition(ZERO); goop.setPosition(ZERO); bob.present(); goop.present();
    bob.setOpacity(1); goop.setOpacity(1); bob.setVisible(true); goop.setVisible(true);
  }

  reset(): void {
    this.music.stop();
    this.movementAudio.reset();
    if (!this.started) return;
    const { world, camera } = this.options;
    this.setDressing.reset();
    this.bobParent?.add(world.bob.root); this.goopParent?.add(world.roomFive.goopPresentation.root);
    world.bob.reset(); world.roomFive.goopPresentation.reset();
    world.roomFive.goopPresentation.setPosition(new THREE.Vector3(0, 76.546, 110));
    if (this.savedCamera) { camera.fov = this.savedCamera.fov; camera.near = this.savedCamera.near;
      camera.far = this.savedCamera.far; camera.up.copy(this.savedCamera.up); camera.updateProjectionMatrix(); }
    if (this.foundation) this.foundation.intensity = this.foundationIntensity;
    this.foundation = undefined; this.visuals.root.visible = this.actors.visible = false;
    this.bobPose.scale.set(1, 1, 1); this.goopPose.scale.set(1,1,1); this.started = false; this.options.overlay.hide();
  }
  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.disposed = true; this.setDressing.dispose(); this.visuals.dispose(); this.actors.removeFromParent();
  }
}
