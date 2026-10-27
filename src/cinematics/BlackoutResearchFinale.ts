import * as THREE from 'three';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { BobCharacterPresentation, BobCharacterPresentationState } from '../render/bob/BobCharacterPresentation.ts';
import type { GoopCharacterPresentation } from '../render/goop/GoopCharacterPresentation.ts';
import type { VoltCharacterPresentation } from '../render/volt/VoltCharacterPresentation.ts';
import type { SpecimenCharacterPresentation, SpecimenCharacterState } from '../render/specimen/SpecimenCharacterPresentation.ts';
import type { FinalBossPresentation } from '../boss/FinalBossPresentation.ts';
import type { ExterminationArena } from '../boss/ExterminationArena.ts';
import { SecurityDronePresentation, SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { BlackoutResearchAudio } from '../audio/BlackoutCutsceneAudio.ts';
import { CinematicMusic } from '../audio/CinematicMusic.ts';
import { TypewriterAudio } from '../audio/TypewriterAudio.ts';
import { BlackoutResearchWing } from './BlackoutResearchWing.ts';
import { RESEARCH_WING_ORIGIN as ORIGIN, RESEARCH_OVERLOAD_LAMP, createResearchObservationCutout } from './BlackoutResearchLayout.ts';
import { BlackoutResearchCamera } from './BlackoutResearchCamera.ts';
import { BlackoutResearchEffects } from './BlackoutResearchEffects.ts';
import { BlackoutResearchOverlay } from './BlackoutResearchOverlay.ts';
import { sampleResearchDrone, sampleResearchDronePosition, researchSearchTarget, type ResearchFlightPose } from './BlackoutResearchFlight.ts';
import { RESEARCH_TIMING as T, RESEARCH_DIALOGUE, researchWindow, researchShot, researchPursuerShotTime,
  sampleResearchSlime, sampleResearchSpecimenWorld, type ResearchSlime } from './BlackoutResearchTimeline.ts';
import { preserveResearchPresentation } from './BlackoutResearchPreparation.ts';
import { ResearchArenaReveal } from './ResearchArenaReveal.ts';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';

type Presentation = BobCharacterPresentation | GoopCharacterPresentation | VoltCharacterPresentation;
interface Options {
  root: THREE.Group; host: HTMLElement;
  bodies: Readonly<Record<ResearchSlime, KinematicBody>>;
  presentations: { bob: BobCharacterPresentation; goop: GoopCharacterPresentation; volt: VoltCharacterPresentation };
  specimen: SpecimenCharacterPresentation; specimenBody: KinematicBody;
  boss: FinalBossPresentation; arena: ExterminationArena;
}
interface Actor {
  id: ResearchSlime; body: KinematicBody; presentation: Presentation; pose: THREE.Group;
  position: THREE.Vector3; previous: THREE.Vector3; velocity: THREE.Vector3; intent: THREE.Vector3;
  initial: THREE.Vector3; parent: THREE.Object3D | null; voice: TypewriterAudio;
  state: BobCharacterPresentationState; airborne: boolean;
}
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const SPECIMEN_SHOTS = [T.blast, T.doorBlast, ...[0, 1, 2, 3].map(researchPursuerShotTime)];
export const RESEARCH_PREPARATION_SAMPLES = Object.freeze([3, 22, 39, 73, 96, 109, 118, 122, 124, 128, 131, 142, 157, 168.8, 171, 188,
  196, 204, 207, 208.2, 209.1, 211, 214, 217, 221, 222.6, 227.3, 237, T.ambush + .2, T.glass + .05, T.fall + .2,
  T.fall + 1.5, T.landing + .6, T.clearPursuers + .15, T.clearPursuers + 1.55, T.pitUnlock + .4, T.pitOpen + 1, T.pitOpen + 3.5, T.boss + 3, T.handback - 3]);

export class BlackoutResearchFinale {
  readonly wing = new BlackoutResearchWing();
  readonly overlay: BlackoutResearchOverlay;
  readonly actors: readonly Actor[];
  readonly effectsRoot = new THREE.Group();
  readonly preparation = { complete: false, frames: 0 };
  private readonly effects = new BlackoutResearchEffects();
  private readonly arenaReveal = new ResearchArenaReveal();
  private readonly options: Options;
  private music?: CinematicMusic;
  private readonly cinematicCamera = new BlackoutResearchCamera();
  private readonly resources = new SecurityDronePresentationResources(undefined, true);
  private readonly drones: SecurityDronePresentation[] = [];
  private readonly dronePositions = Array.from({ length: 12 }, () => new THREE.Vector3());
  private readonly flightPoses: ResearchFlightPose[] = this.dronePositions.map(position => ({ position, yaw: 0, pitch: 0, bank: 0, visible: false }));
  private readonly torches: THREE.Mesh[] = [];
  private readonly searchPools: THREE.Mesh[] = [];
  private readonly searchLights: THREE.SpotLight[] = [];
  private readonly searchTargets: THREE.Object3D[] = [];
  private readonly torchGeometry = new THREE.CylinderGeometry(.05, 1.6, 1, 32, 1, true);
  private readonly poolGeometry = new THREE.CircleGeometry(1, 32);
  private readonly poolMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;void main(){float a=pow(max(0.,1.-length(vUv-.5)*2.),1.6);gl_FragColor=vec4(.45,.78,1.,a*.34);}' });
  private readonly torchMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN,vV;varying float vH;void main(){vN=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vV=-p.xyz;vH=position.y+.5;gl_Position=projectionMatrix*p;}',
    fragmentShader: 'varying vec3 vN,vV;varying float vH;void main(){float soft=pow(abs(dot(normalize(vN),normalize(vV))),1.8);gl_FragColor=vec4(.65,.85,1.,soft*.035*smoothstep(0.,.2,vH));}' });
  private readonly direction = new THREE.Vector3(); private readonly end = new THREE.Vector3();
  private readonly start = new THREE.Vector3(); private readonly point = new THREE.Vector3();
  private readonly specimenPosition = new THREE.Vector3(); private readonly previousSpecimen = new THREE.Vector3();
  private readonly specimenVelocity = new THREE.Vector3(); private readonly groupAnchor = new THREE.Vector3();
  private readonly cameraAnchors: { bob: THREE.Vector3; group: THREE.Vector3; specimen: THREE.Vector3 };
  private readonly scientistVoice: TypewriterAudio;
  private readonly ambient?: THREE.HemisphereLight;
  private savedAmbient = 0; private savedFov = 65; private camera?: THREE.PerspectiveCamera;
  private elapsed = 0; private previousElapsed = 0;
  private playing = false; private played = false; private disposed = false; private skipRequested = false;
  private readonly sound = new BlackoutResearchAudio();
  private releaseArenaCutout?: () => void;
  private restoreWorld?: () => void;
  private restoreArenaDoors?: () => void;
  private arenaVisibility = new Map<THREE.Object3D, boolean>();
  private retainedLights?: { entries: { light: THREE.Light; actor: Actor; intensity: number }[]; restore: () => void };
  private readonly specimenState: SpecimenCharacterState;

  constructor(options: Options) {
    this.options = options; options.root.add(this.wing.root, this.wing.lightRoot, this.effectsRoot);
    this.effectsRoot.name = 'research-finale-transient-presentation'; this.effectsRoot.visible = false;
    this.effectsRoot.add(this.effects.root, this.arenaReveal.root); this.wing.lightRoot.add(this.effects.light);
    let ambient: THREE.HemisphereLight | undefined;
    (options.root.parent ?? options.root).traverse(o => { if (o instanceof THREE.HemisphereLight) ambient ??= o; }); this.ambient = ambient;
    this.overlay = new BlackoutResearchOverlay(options.host, () => { this.skipRequested = true; });
    this.actors = (['bob', 'goop', 'volt'] as const).map(id => {
      const body = options.bodies[id], presentation = options.presentations[id], pose = new THREE.Group();
      pose.name = `research-cinematic-${id}`; pose.visible = false; options.root.add(pose);
      const position = new THREE.Vector3(), previous = new THREE.Vector3(), velocity = new THREE.Vector3(), intent = new THREE.Vector3();
      const state: BobCharacterPresentationState = { locomotionPositionWorld: position, velocityWorld: velocity, movementIntentWorld: intent,
        maximumLocomotionSpeedMetresPerSecond: 6, surfaceNormalWorld: UP, gameplayUpWorld: UP,
        grounded: true, attached: false, chargingJump: false, jumpCharge: 0, contactCount: 0,
        contactNormalWorld: UP, contactSpeedMetresPerSecond: 0, contactName: 'research-wing-floor', contactSurfaceTag: 'default', landedThisStep: false };
      const voice = new TypewriterAudio(pose, { sound: 'bob-contact-01', intervalSeconds: id === 'goop' ? .12 : .16,
        maxDistance: 30, volumeScale: .4, localPosition: { x: 0, y: .35, z: 0 } });
      return { id, body, presentation, pose, position, previous, velocity, intent, initial: new THREE.Vector3(), parent: null, voice, state, airborne: false };
    });
    this.cameraAnchors = { bob: this.actors[0]!.position, group: this.groupAnchor, specimen: this.specimenPosition };
    this.scientistVoice = new TypewriterAudio(this.wing.monitorDrone, { sound: 'world-sign-tick-01', intervalSeconds: .11, maxDistance: 30, volumeScale: .48 });
    this.specimenState = { position: this.specimenPosition, locomotionPosition: this.specimenPosition, velocity: this.specimenVelocity,
      maximumLocomotionSpeedMetresPerSecond: 15, gameplayUp: UP, grounded: true, landedThisStep: false, chargingJump: false, chargeFraction: 0 };
    for (let i = 0; i < 12; i++) {
      const drone = new SecurityDronePresentation({ id: `research-sentry-${i}`, type: 'ceiling', colliderSize: new THREE.Vector3(1.8, 1, 1.7),
        initialPosition: ZERO, forward: new THREE.Vector3(0, 0, -1), scanAxis: UP, scanHalfAngleRadians: 1,
        scanSpeedRadiansPerSecond: 1, detectionHalfAngleRadians: 1, detectionRangeMetres: 100, warningSeconds: 1,
        fireIntervalSeconds: .8, targetLossGraceSeconds: 1, cooldownSeconds: 1, muzzleAnchor: ZERO,
        targetPolicy: 'bob-only', initialScanPhase: 0 }, this.resources);
      drone.setState('firing', true); drone.root.visible = false; this.drones.push(drone); this.effectsRoot.add(drone.root);
      if (i < 8) {
        const cone = new THREE.Mesh(this.torchGeometry, this.torchMaterial); cone.visible = false;
        this.torches.push(cone); this.effectsRoot.add(cone);
        const pool = new THREE.Mesh(this.poolGeometry, this.poolMaterial); pool.rotation.x = -Math.PI / 2; pool.visible = false;
        this.searchPools.push(pool); this.effectsRoot.add(pool);
        if (i < 3) {
          const light = new THREE.SpotLight(0xc7f0ff, 0, 28, .34, .9, 2), target = new THREE.Object3D();
          light.target = target; this.wing.lightRoot.add(light, target); this.searchLights.push(light); this.searchTargets.push(target);
        }
      }
    }
  }
  get ready(): Promise<void> { return this.wing.ready; }
  get active(): boolean { return this.playing; }
  get complete(): boolean { return this.played && !this.playing; }
  get seconds(): number { return this.elapsed; }
  get audioBody(): KinematicBody { return this.elapsed >= T.fusion ? this.options.specimenBody : this.options.bodies.bob; }
  get diagnostics() { return { active: this.active, complete: this.complete, seconds: this.elapsed, shot: researchShot(this.elapsed),
    visibleDrones: this.drones.filter(d => d.root.visible).length, specimenVisible: this.elapsed >= T.fusion + .5,
    glassIntact: this.wing.glass.visible, effects: this.effects.diagnostics, preparation: { ...this.preparation }, ...this.wing.diagnostics, ...this.arenaReveal.diagnostics }; }

  inspectView(camera: THREE.PerspectiveCamera) {
    const scene = this.options.root.parent ?? this.options.root; scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(camera.position, camera.getWorldDirection(new THREE.Vector3()), 0, 12); ray.camera = camera;
    const hits = ray.intersectObject(scene, true).filter(h => {
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
      return h.object instanceof THREE.Mesh && [h.object.material].flat().some(m => m.visible);
    }).slice(0, 6).map(h => ({ name: h.object.name, parent: h.object.parent?.name, distance: h.distance }));
    return { direction: camera.getWorldDirection(new THREE.Vector3()).toArray(), hits,
      lights: this.wing.lightRoot.children.filter(o => o instanceof THREE.Light).map(o => ({ type: o.type, position: o.position.toArray(), intensity: (o as THREE.Light).intensity })) };
  }

  connectArenaCutout(renderer: THREE.WebGLRenderer): void {
    if (this.releaseArenaCutout) return;
    const planes = createResearchObservationCutout(), previous = renderer.localClippingEnabled;
    const saved = new Map<THREE.Material, { planes: THREE.Plane[] | null; intersection: boolean; shadows: boolean }>();
    this.options.arena.root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const material of [o.material].flat()) if (material instanceof THREE.MeshStandardMaterial && !saved.has(material)) {
        saved.set(material, { planes: material.clippingPlanes, intersection: material.clipIntersection, shadows: material.clipShadows });
        material.clippingPlanes = planes; material.clipIntersection = true; material.clipShadows = true; material.needsUpdate = true;
      }
    });
    renderer.localClippingEnabled = true;
    this.releaseArenaCutout = () => {
      renderer.localClippingEnabled = previous;
      for (const [material, value] of saved) { material.clippingPlanes = value.planes; material.clipIntersection = value.intersection; material.clipShadows = value.shadows; material.needsUpdate = true; }
    };
  }

  primeResources(render: (roots: readonly THREE.Object3D[]) => void): void {
    const pools = [this.effects.bolts, this.effects.shots, this.effects.sparks, this.effects.shards], counts = pools.map(p => p.count);
    try { pools.forEach(p => { p.count = Math.max(1, p.count); }); render([this.wing.root, this.effectsRoot, this.options.specimen.root, this.options.boss.root]); }
    finally { pools.forEach((p, i) => { p.count = counts[i]!; }); }
  }

  private isolateWorld(): () => void {
    const owned = new Set<THREE.Object3D>();
    for (const root of [this.wing.root, this.wing.lightRoot, this.effectsRoot, this.options.boss.root, this.options.arena.root,
      this.options.specimen.root, ...this.actors.map(a => a.presentation.root)]) root.traverse(o => owned.add(o));
    const hidden = new Map<THREE.Object3D, boolean>();
    const previousArenaVisibility = this.arenaVisibility;
    const arenaVisibility = new Map<THREE.Object3D, boolean>();
    this.options.arena.root.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite) arenaVisibility.set(o, o.visible);
    });
    this.arenaVisibility = arenaVisibility;
    this.options.root.traverse(o => {
      if (owned.has(o) || !(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite)) return;
      hidden.set(o, o.visible); o.visible = false;
    });
    return () => {
      for (const [o, visible] of hidden) o.visible = visible;
      for (const [o, visible] of arenaVisibility) o.visible = visible;
      this.arenaVisibility = previousArenaVisibility;
    };
  }

  private retainActorLights() {
    const entries: { light: THREE.Light; actor: Actor; intensity: number }[] = [];
    const saved: { light: THREE.Light; parent: THREE.Object3D | null; position: THREE.Vector3; visible: boolean }[] = [];
    for (const actor of this.actors) actor.presentation.root.traverse(o => {
      if (o instanceof THREE.Light) entries.push({ light: o, actor, intensity: o.intensity });
    });
    for (const { light } of entries) {
      saved.push({ light, parent: light.parent, position: light.position.clone(), visible: light.visible });
      light.getWorldPosition(this.point); this.wing.lightRoot.add(light); light.position.copy(this.point); light.visible = true;
    }
    let restored = false;
    return { entries, restore: () => {
      if (restored) return; restored = true;
      saved.forEach((s, i) => { if (s.parent) s.parent.add(s.light); else s.light.removeFromParent(); s.light.position.copy(s.position); s.light.visible = s.visible; s.light.intensity = entries[i]!.intensity; });
    } };
  }

  async primePresentationFrames(scene: THREE.Scene, render: (camera: THREE.PerspectiveCamera) => Promise<void>, current = () => true): Promise<void> {
    if (this.disposed || this.playing) return;
    const restore = preserveResearchPresentation(scene), camera = new THREE.PerspectiveCamera();
    const oldLights = this.retainedLights; this.retainedLights = this.retainActorLights(); const restoreWorld = this.isolateWorld();
    camera.far = 850; camera.aspect = 16 / 9;
    const actorPositions = this.actors.map(a => a.position.clone()), specimenBefore = this.specimenPosition.clone();
    const groupBefore = this.groupAnchor.clone();
    this.preparation.complete = false; this.preparation.frames = 0;
    try {
      for (const t of RESEARCH_PREPARATION_SAMPLES) {
        if (this.disposed || !current()) return;
        this.groupAnchor.set(0, 0, 0);
        for (const actor of this.actors) {
          const sample = sampleResearchSlime(actor.id, t, actor.position); actor.position.add(ORIGIN);
          actor.presentation.setPosition(actor.position); actor.presentation.root.traverse(o => { if (!(o instanceof THREE.Light)) o.visible = true; });
          actor.presentation.root.visible = sample.visible; this.groupAnchor.add(actor.position);
        }
        this.groupAnchor.multiplyScalar(1 / 3).setY(ORIGIN.y);
        sampleResearchSpecimenWorld(t, this.specimenPosition);
        this.options.specimen.setPosition(this.specimenPosition); this.options.specimen.root.traverse(o => { if (!(o instanceof THREE.Light)) o.visible = true; });
        this.options.specimen.root.visible = t >= T.fusion;
        this.presentWorld(t, true); this.cinematicCamera.present(camera, t, this.cameraAnchors, 65);
        await render(camera); this.preparation.frames++;
      }
      this.preparation.complete = true;
    } finally {
      this.retainedLights?.restore(); this.retainedLights = oldLights; restoreWorld(); restore(); this.actors.forEach((a, i) => a.position.copy(actorPositions[i]!));
      this.specimenPosition.copy(specimenBefore); this.groupAnchor.copy(groupBefore);
    }
  }

  begin(camera: THREE.PerspectiveCamera): boolean {
    if (this.played || this.disposed) return false;
    this.played = this.playing = true; this.skipRequested = false; this.elapsed = this.previousElapsed = 0;
    this.camera = camera; this.savedFov = camera.fov;
    this.restoreWorld = this.isolateWorld(); this.retainedLights = this.retainActorLights();
    const entry = this.options.arena.entryDoor.position.clone(), exit = this.options.arena.exitDoor.position.clone();
    this.restoreArenaDoors = () => {
      this.options.arena.entryDoor.position.copy(entry); this.options.arena.exitDoor.position.copy(exit);
      this.options.arena.entryDoor.updateMatrixWorld(true); this.options.arena.exitDoor.updateMatrixWorld(true);
    };
    this.options.arena.setDoors(true);
    if (this.ambient) { this.savedAmbient = this.ambient.intensity; this.ambient.intensity = .5; }
    for (const actor of this.actors) {
      actor.initial.copy(actor.body.position); actor.parent = actor.presentation.root.parent;
      actor.pose.add(actor.presentation.root); actor.pose.visible = true; actor.presentation.reset();
      actor.presentation.setPosition(ZERO); actor.presentation.setYaw(Math.PI); actor.presentation.setOpacity(1); actor.presentation.setVisible(true);
      actor.presentation.setReflectionIntensity(.8, .65); actor.voice.reset(); actor.airborne = false;
      sampleResearchSlime(actor.id, 0, actor.position); actor.position.add(ORIGIN); actor.previous.copy(actor.position);
    }
    this.options.specimen.reset(); this.options.specimen.setVisible(false); this.options.boss.root.visible = false;
    this.music = new CinematicMusic('research', T.duration);
    this.music.update(0);
    this.options.host.dataset.cinematic = 'blackout-research'; this.scientistVoice.reset();
    this.presentActors(0, 1 / 60, true); this.presentWorld(0); this.overlay.present(0); return true;
  }
  update(dt: number, skip = false): boolean {
    if (!this.playing) return false;
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('Invalid research cinematic timestep.');
    this.previousElapsed = this.elapsed; this.elapsed = skip || this.skipRequested ? T.duration : Math.min(T.duration, this.elapsed + dt);
    this.music?.update(this.elapsed);
    this.presentActors(this.elapsed, dt, false);
    if (!skip && !this.skipRequested) this.sound.update(this.previousElapsed, this.elapsed, this.options.boss.machine.position);
    this.presentWorld(this.elapsed); this.overlay.present(this.elapsed);
    if (this.elapsed >= T.duration) { this.release(false); return true; } return false;
  }
  private presentActors(t: number, dt: number, seed: boolean): void {
    this.groupAnchor.set(0, 0, 0);
    for (const actor of this.actors) {
      actor.previous.copy(actor.position); const sample = sampleResearchSlime(actor.id, t, actor.position); actor.position.add(ORIGIN);
      if (seed) actor.previous.copy(actor.position);
      actor.velocity.subVectors(actor.position, actor.previous).divideScalar(dt); actor.intent.copy(actor.velocity).setY(0);
      if (actor.intent.lengthSq() > .001) actor.intent.normalize();
      actor.state.landedThisStep = !sample.airborne && actor.airborne;
      if (sample.airborne && !actor.airborne) actor.presentation.onLaunch({ directionWorld: actor.velocity, speedMetresPerSecond: 6, chargeFraction: .2 });
      if (actor.state.landedThisStep) actor.presentation.onLanding(UP, 5.5);
      actor.airborne = sample.airborne; actor.state.grounded = !sample.airborne;
      actor.state.chargingJump = actor.id === 'bob' && t >= T.doorJump - .6 && t < T.doorJump;
      actor.state.jumpCharge = actor.state.chargingJump ? researchWindow(t, T.doorJump - .6, T.doorJump) * .4 : 0;
      actor.body.syncKinematicPose(actor.position, actor.previous); actor.pose.position.copy(actor.position); actor.pose.scale.setScalar(sample.scale);
      actor.pose.rotation.x = actor.id === 'bob' && sample.airborne ? Math.min(.16, Math.abs(actor.velocity.z) * .025) : 0;
      actor.pose.visible = sample.visible; actor.presentation.setPosition(ZERO);
      if (t >= 25 && t < 29.5) this.direction.set(-1, 0, .3);
      else if (t >= 29.5 && t < 34) this.direction.set(1, 0, .3);
      else if (actor.id === 'volt' && t >= T.overload - .7 && t < T.blackout) this.direction.copy(RESEARCH_OVERLOAD_LAMP).add(ORIGIN).sub(actor.position);
      else if (actor.id === 'volt' && t >= 177 && t < 189) this.direction.copy(this.actors[1]!.position).sub(actor.position);
      else if (actor.id !== 'volt' && t >= 177.6 && t < 194) this.direction.copy(this.actors[2]!.position).sub(actor.position);
      else if (t >= 189 && t < T.fusion + 2 && actor.id !== 'bob') this.direction.copy(this.actors[0]!.position).sub(actor.position);
      else if (t >= T.doorJump && t < T.doorLand) this.direction.set(0, 0, 1);
      else if (t >= T.alarm && t < T.blackout || t >= T.doorLand) this.direction.set(0, 0, -1);
      else if (actor.intent.lengthSq() > .01) this.direction.copy(actor.intent);
      else this.direction.set(0, 0, 1);
      actor.presentation.setAimDirection(this.direction); actor.presentation.update(dt, actor.state);
      if (actor.id === 'bob') this.options.presentations.bob.setExpression(t >= T.crossfire ? 'stress-expression' : 'surprise', t >= 46 ? .65 : .25);
      if (actor.id === 'goop') this.options.presentations.goop.setExpression(t >= T.alarm ? 'alert' : 'relieved', .65);
      const index = RESEARCH_DIALOGUE.findIndex(l => t >= l.start && t < l.end && l.speaker === actor.id), line = RESEARCH_DIALOGUE[index];
      actor.voice.update(dt, { text: line ? line.text.slice(0, Math.floor((t - line.start) * 22)) : '', pageIndex: Math.max(0, index) }); this.groupAnchor.add(actor.position);
    }
    this.groupAnchor.multiplyScalar(1 / 3).setY(ORIGIN.y);
    const index = RESEARCH_DIALOGUE.findIndex(l => t >= l.start && t < l.end && (l.speaker === 'green' || l.speaker === 'red')), scientist = RESEARCH_DIALOGUE[index];
    const text = scientist ? scientist.text.slice(0, Math.floor((t - scientist.start) * 22)) : '';
    this.wing.setScientist(text, scientist?.speaker === 'red' ? 'red' : 'green'); this.scientistVoice.update(dt, { text, pageIndex: Math.max(0, index) });
    this.previousSpecimen.copy(this.specimenPosition); sampleResearchSpecimenWorld(t, this.specimenPosition);
    if (seed) this.previousSpecimen.copy(this.specimenPosition);
    this.specimenVelocity.subVectors(this.specimenPosition, this.previousSpecimen).divideScalar(dt);
    if (t >= T.fusion) this.options.specimenBody.syncKinematicPose(this.specimenPosition, this.previousSpecimen);
    const specimen = this.options.specimen, visible = t >= T.fusion + .5;
    specimen.setVisible(visible); specimen.setTrailEnabled(t >= T.escape && t < T.boss); specimen.setOpacity(1);
    specimen.setPosition(this.specimenPosition); specimen.setReflectionIntensity(1.7, 1.2);
    specimen.placement.scale.setScalar(.55 + .45 * researchWindow(t, T.fusion + .5, T.reveal));
    specimen.placement.rotation.x = t >= T.ram && t < T.landing ? Math.sin(researchWindow(t, T.ram, T.landing) * Math.PI) * .16 : 0;
    if (visible) {
      const falling = t >= T.fall && t < T.landing;
      const state = { ...this.specimenState, grounded: !falling && t < T.glass || t >= T.landing, landedThisStep: this.previousElapsed < T.landing && t >= T.landing };
      if (state.landedThisStep) specimen.onLanding(24, this.specimenPosition, UP);
      this.specimenAim(t, this.direction);
      const charge = t >= T.charge && t < T.blast ? researchWindow(t, T.charge, T.blast) : t < T.reveal ? .65 : 0;
      specimen.update(dt, state, { aimActive: true, charging: charge > 0, chargeAmount: charge, aimDirection: this.direction });
      for (const fire of SPECIMEN_SHOTS) if (this.previousElapsed < fire && t >= fire) specimen.onShot(this.direction, fire >= T.clearPursuers ? .4 : 1);
    }
  }
  private specimenAim(t: number, out: THREE.Vector3): void {
    if (t < 226) { out.set(0, 0, -1); return; }
    if (t < T.fall) { out.set(0, 0, 1); return; }
    if (t < T.turnPursuers) { out.set(0, 0, 1); return; }
    if (t >= T.turnPursuers && t < T.pitUnlock - .4) {
      const i = THREE.MathUtils.clamp(Math.floor((t - T.clearPursuers) / .7), 0, 3);
      sampleResearchDronePosition(8 + i, t, out); out.sub(this.specimenPosition).normalize(); return;
    }
    out.set(0, 0, t >= T.noticeBoss ? 1 : -1);
  }
  private presentWorld(t: number, preparing = false): void {
    this.wing.present(t); this.effectsRoot.visible = true;
    this.arenaReveal.present(t);
    for (const [object, visible] of this.arenaVisibility) object.visible = visible && t >= T.escape;
    if (this.ambient) this.ambient.intensity = t < T.blackout ? .5 : t < T.chase ? 0 : t < T.overlook ? .19 : this.savedAmbient;
    if (t >= T.overlook) { this.options.arena.setDoors(true); if (!preparing) this.options.arena.setPowered(true); }
    for (const entry of this.retainedLights?.entries ?? []) {
      entry.light.visible = true; entry.light.position.copy(entry.actor.position);
      entry.light.intensity = t < T.blackout || t >= T.chase && t < T.fusion ? entry.intensity : 0;
    }
    for (const [i, drone] of this.drones.entries()) {
      const pose = this.flightPoses[i]!; sampleResearchDrone(i, t, pose);
      drone.root.visible = pose.visible; drone.root.position.copy(pose.position); drone.root.rotation.set(0, 0, 0);
      drone.aimHead.rotation.set(pose.pitch, pose.yaw, pose.bank, 'YXZ');
    }
    for (const [i, cone] of this.torches.entries()) {
      const active = t >= T.search + i * .18 && t < T.chase; cone.visible = active;
      const light = this.searchLights[i], target = this.searchTargets[i], pool = this.searchPools[i]!;
      if (light) light.intensity = active ? 550 : 0; pool.visible = active;
      if (active) {
        this.start.copy(this.dronePositions[i]!); researchSearchTarget(i, t, this.end);
        this.direction.subVectors(this.end, this.start); const length = this.direction.length(); this.direction.normalize();
        cone.position.lerpVectors(this.start, this.end, .5); cone.scale.set(1, length, 1); cone.quaternion.setFromUnitVectors(UP, this.direction.negate());
        if (light && target) { light.position.copy(this.start); target.position.copy(this.end); target.updateMatrixWorld(true); }
        pool.position.copy(this.end); pool.position.y += .018; pool.scale.set(2.1, 2.6, 1);
      }
    }
    this.effects.present(t, this.actors, this.specimenPosition, this.dronePositions);
    this.options.boss.root.visible = t >= T.boss;
    if (t >= T.boss) {
      if (preparing) this.options.boss.machine.position.set(0, 18, FINAL_ARENA.centreZ);
      else this.options.boss.presentArrival(t, researchWindow(t, T.boss - 3, T.boss + 6));
    }
  }
  present(camera: THREE.PerspectiveCamera, alpha: number): void {
    if (!this.playing) return;
    const t = THREE.MathUtils.lerp(this.previousElapsed, this.elapsed, THREE.MathUtils.clamp(alpha, 0, 1));
    for (const actor of this.actors) {
      const sample = sampleResearchSlime(actor.id, t, this.point); actor.pose.position.copy(this.point).add(ORIGIN);
      actor.pose.visible = sample.visible; actor.pose.scale.setScalar(sample.scale); actor.presentation.setPosition(ZERO); actor.presentation.present(alpha);
    }
    sampleResearchSpecimenWorld(t, this.point); this.options.specimen.setPosition(this.point); this.options.specimen.present(alpha);
    this.presentWorld(t); this.overlay.present(t); this.cinematicCamera.present(camera, t, this.cameraAnchors, this.savedFov);
  }
  reset(complete = false): void { this.release(true); this.played = complete; this.elapsed = this.previousElapsed = 0; this.wing.reset(complete); }
  private release(restoreBodies: boolean): void {
    this.music?.stop(); this.music = undefined;
    this.sound.stop();
    if (this.playing) {
      for (const actor of this.actors) {
        if (restoreBodies) actor.body.teleport(actor.initial);
        if (actor.parent) actor.parent.add(actor.presentation.root); else actor.presentation.root.removeFromParent();
        actor.pose.visible = false; actor.pose.scale.setScalar(1); actor.pose.rotation.set(0, 0, 0);
        actor.presentation.setPosition(actor.body.position); actor.presentation.reset(); actor.airborne = false;
      }
      this.options.specimen.placement.scale.setScalar(1); this.options.specimen.placement.rotation.set(0, 0, 0); this.options.specimen.reset(); this.options.specimen.setVisible(false);
      this.options.boss.root.visible = false;
      if (this.camera) { this.camera.fov = this.savedFov; this.camera.updateProjectionMatrix(); }
      if (this.ambient) this.ambient.intensity = this.savedAmbient;
    }
    if (restoreBodies) this.restoreArenaDoors?.(); this.restoreArenaDoors = undefined;
    this.playing = false; this.wing.reset(!restoreBodies && this.played); this.effectsRoot.visible = false; this.effects.reset(); this.arenaReveal.reset();
    this.retainedLights?.restore(); this.retainedLights = undefined; this.restoreWorld?.(); this.restoreWorld = undefined;
    for (const light of this.searchLights) light.intensity = 0;
    this.overlay.hide(); if (this.options.host.dataset.cinematic === 'blackout-research') delete this.options.host.dataset.cinematic;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.release(true); this.wing.dispose(); this.overlay.dispose(); this.effects.dispose(); this.arenaReveal.dispose();
    this.releaseArenaCutout?.(); this.releaseArenaCutout = undefined;
    this.actors.forEach(a => a.pose.removeFromParent()); this.drones.forEach(d => d.dispose()); this.resources.dispose();
    this.torchGeometry.dispose(); this.torchMaterial.dispose(); this.poolGeometry.dispose(); this.poolMaterial.dispose();
    this.effectsRoot.removeFromParent(); this.effectsRoot.clear();
  }
}
