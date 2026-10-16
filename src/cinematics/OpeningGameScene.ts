import * as THREE from 'three';
import { BobCharacterPresentation } from '../render/bob/BobCharacterPresentation.ts';
import { withIsolatedPrewarmState } from '../render/IsolatedResourcePrewarm.ts';
import type { RenderLayer } from '../render/RenderLayer.ts';
import { SPECIMEN_POD_LID_RAISE_METRES } from '../render/environment/containment/ContainmentSpecimenPod.ts';
import { TrailerEggFracture } from '../trailer/TrailerEggFracture.ts';
import { TitleScreenScene, TITLE_EGG_CENTRE } from '../ui/TitleScreenScene.ts';
import { OPENING_GAME_TIMING, OPENING_HATCH_TIMING, openingEase, sampleOpeningGame, type OpeningGameFrame } from './OpeningGameTimeline.ts';
import { OpeningLaboratory, OPENING_LAB_LAYOUT } from './OpeningLaboratory.ts';

/** Give the browser a paint/input opportunity between startup jobs. */
const yieldOpeningPreparation = (): Promise<void> => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});

export interface OpeningSceneOptions {
  readonly deferConstruction?: boolean;
  readonly yieldFrame?: () => Promise<void>;
}

/** Owns the actual menu pod/egg inside a presentation-only authored Room 1. */
export class OpeningGameScene {
  readonly room: TitleScreenScene;
  private bobValue: BobCharacterPresentation | undefined;
  private fractureValue: TrailerEggFracture | undefined;
  private laboratoryValue: OpeningLaboratory | undefined;
  private readonly renderLayer: Pick<RenderLayer, 'gelRendering'> | undefined;
  private readonly options: OpeningSceneOptions;
  get bob(): BobCharacterPresentation { return this.bobValue!; }
  get fracture(): TrailerEggFracture { return this.fractureValue!; }
  get laboratory(): OpeningLaboratory { return this.laboratoryValue!; }
  needsShadowUpdate = true;
  readonly lid = new THREE.Group();
  readonly impactPosition = new THREE.Vector3(2.85, 0, 1.75);
  private readonly impactRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.12, -1.05));
  private readonly rotationMatrix = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly identity = new THREE.Quaternion();
  private readonly lookTarget = new THREE.Vector3();
  private readonly menuCamera = new THREE.Vector3();
  private readonly menuCameraQuaternion = new THREE.Quaternion();
  private menuView: THREE.PerspectiveCamera['view'] = null;
  private menuFov = 50;
  private menuFar = 24;
  private debrisOrigins: THREE.Vector3[] = [];
  private debrisDirections: THREE.Vector3[] = [];
  private debrisRotations: THREE.Quaternion[] = [];
  private readonly podNormal = new THREE.Vector3(2.85, 0, 2.25).normalize();
  private crackViews: readonly {
    focus: THREE.Vector3; direction: THREE.Vector3; start: number; end: number; height: number;
  }[] = [];
  private releaseY = 2;
  private disposed = false;
  private preparation: Promise<void> | undefined;
  private lastShadowScope = '';
  private lastHatchSeconds = -1;
  private debrisSettled = false;

  constructor(room: TitleScreenScene, renderLayer?: Pick<RenderLayer, 'gelRendering'>,
    options: OpeningSceneOptions = {}) {
    this.room = room;
    this.renderLayer = renderLayer;
    this.options = options;
    if (!options.deferConstruction) {
      this.constructHatch();
      this.laboratoryValue = new OpeningLaboratory(room);
    }
  }

  private constructHatch(): void {
    const room = this.room;
    this.bobValue = new BobCharacterPresentation(0.45, this.renderLayer?.gelRendering);
    this.fractureValue = new TrailerEggFracture(room.resources, {
      centre: new THREE.Vector3(), radius: 0.75, initialRadius: 0.2, surface: room.shell.geometry,
    });
    this.fracture.root.name = 'opening-menu-egg-fracture';
    this.crackViews = [1, 2, 3].map(stage => {
      const seam = this.fracture.seams.find(edge => edge.stage === stage)!;
      const focus = seam.a.clone().add(seam.b).multiplyScalar(0.5);
      // The first wave starts at the crown and travels down the back. Its
      // overall normal keeps the growing tail visible, not just its first edge.
      const normal = stage === 1 ? this.fracture.seams.filter(edge => edge.stage === stage)
        .reduce((sum, edge) => sum.add(edge.a).add(edge.b), new THREE.Vector3()) : focus;
      let angle = Math.atan2(normal.x, normal.z);
      // Avoid shooting directly through one of the four real glass supports.
      const supportAngle = Math.round((angle - Math.PI / 4) / (Math.PI / 2)) * Math.PI / 2 + Math.PI / 4;
      if (Math.abs(angle - supportAngle) < 0.2) angle += 0.24;
      const start = stage === 1 ? OPENING_HATCH_TIMING.crackOne : stage === 2 ? OPENING_HATCH_TIMING.crackTwo : OPENING_HATCH_TIMING.crackThree;
      const end = stage === 1 ? OPENING_HATCH_TIMING.crackTwo : stage === 2 ? OPENING_HATCH_TIMING.crackThree : OPENING_HATCH_TIMING.crackComplete;
      return { focus, direction: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), start, end,
        height: stage === 1 ? 3.15 : 2.88 };
    });
    this.lid.name = 'opening-retracting-menu-container';
    room.pod.add(this.lid);
    for (const name of ['upper-gasket', 'upper-crown', 'overhead-feed-neck', 'curved-glass',
      'upper-seal-light', 'crown-edge', 'stanchion-0', 'stanchion-1', 'stanchion-2', 'stanchion-3']) {
      const part = room.pod.getObjectByName(`title-pod-${name}`);
      if (!part) throw new Error(`Missing menu containment component: ${name}`);
      this.lid.add(part);
    }
    for (const fragment of this.fracture.fragments) {
      fragment.shell.castShadow = true;
      fragment.shell.receiveShadow = true;
      fragment.cracks.castShadow = false;
    }
    room.scene.add(this.fracture.root, this.bob.root);
    // The whole tilted shell lands at its true support height, not its centre.
    room.eggRoot.quaternion.copy(this.impactRotation);
    this.impactPosition.y = -this.eggLowestY();
    this.releaseY = 1.66 + this.impactPosition.y;
    this.debrisOrigins = this.fracture.fragments.map(piece => piece.centre.clone()
      .multiply(room.eggRoot.scale).applyQuaternion(this.impactRotation).add(this.impactPosition));
    this.debrisDirections = this.debrisOrigins.map(origin => origin.clone().sub(this.impactPosition).setY(0).normalize());
    this.debrisRotations = this.fracture.fragments.map(piece => new THREE.Quaternion().setFromUnitVectors(
      piece.centre.clone().normalize(), new THREE.Vector3(0, -1, 0)));
    room.eggRoot.rotation.set(0, 0, 0);
    this.fracture.root.visible = false;
    this.bob.root.visible = false;
  }

  begin(): void {
    this.menuCamera.copy(this.room.camera.position);
    this.menuCameraQuaternion.copy(this.room.camera.quaternion);
    this.menuView = this.room.camera.view ? { ...this.room.camera.view } : null;
    this.menuFov = this.room.camera.fov;
    this.menuFar = this.room.camera.far;
    this.apply(sampleOpeningGame(0), this.room.camera.aspect);
  }

  prepare(renderLayer: Pick<RenderLayer, 'renderer' | 'withShadowPreparation'>): Promise<void> {
    return this.preparation ??= this.prepareResources(renderLayer).catch(error => {
      this.preparation = undefined;
      throw error;
    });
  }

  private async prepareResources(renderLayer: Pick<RenderLayer, 'renderer' | 'withShadowPreparation'>): Promise<void> {
    const yieldFrame = this.options.yieldFrame ?? yieldOpeningPreparation;
    if (!this.fractureValue) {
      await yieldFrame();
      if (this.disposed) return;
      this.constructHatch();
    }
    await yieldFrame();
    if (this.disposed) return;
    await this.bob.prepare();
    if (this.disposed) return;
    if (!this.laboratoryValue) {
      await yieldFrame();
      if (this.disposed) return;
      this.laboratoryValue = new OpeningLaboratory(this.room);
    }
    await yieldFrame();
    if (this.disposed) return;
    this.apply(sampleOpeningGame(OPENING_GAME_TIMING.formEnd), this.room.camera.aspect);
    this.laboratory.showAllForPreparation();
    await renderLayer.withShadowPreparation(true, () => renderLayer.renderer.compileAsync(this.room.scene, this.room.camera));
    await yieldFrame();
    if (this.disposed) return;
    // Upload the real later-visible shell/hero/depth resources without overwriting the title frame.
    withIsolatedPrewarmState(renderLayer.renderer, () => renderLayer.withShadowPreparation(true, () => {
      renderLayer.renderer.shadowMap.needsUpdate = true;
      renderLayer.renderer.render(this.room.scene, this.room.camera);
    }));
    await yieldFrame();
    if (this.disposed) return;
    // One wide isolated upload covers all plaques and shared corridor
    // instance buffers before the real fly-through, not a compile at each door.
    this.apply(sampleOpeningGame(OPENING_GAME_TIMING.labEstablished), this.room.camera.aspect);
    this.laboratory.showAllForPreparation();
    const camera = this.room.camera;
    camera.position.set(OPENING_LAB_LAYOUT.centreX, OPENING_LAB_LAYOUT.eyeHeight, OPENING_LAB_LAYOUT.backZ + 12);
    camera.lookAt(OPENING_LAB_LAYOUT.centreX, OPENING_LAB_LAYOUT.eyeHeight, 15);
    camera.fov = 75; camera.aspect = Math.max(0.3, camera.aspect); camera.updateProjectionMatrix();
    withIsolatedPrewarmState(renderLayer.renderer, () => renderLayer.withShadowPreparation(true, () => {
      renderLayer.renderer.shadowMap.needsUpdate = true;
      renderLayer.renderer.render(this.room.scene, camera);
    }));
    this.apply(sampleOpeningGame(0), this.room.camera.aspect);
  }

  apply(frame: OpeningGameFrame, aspect: number, reducedMotion = false): void {
    if (this.disposed || !this.laboratoryValue) return;
    const { room } = this, { tip, fall, opening, spread, formation } = frame;
    const seconds = frame.hatchSeconds;
    this.laboratory.apply(frame, reducedMotion);
    // Keep the same Bob posed inside from the beginning, but do not submit his
    // physical gel/transmission capture until the opaque shell actually opens.
    this.bob.root.visible = frame.seconds >= OPENING_GAME_TIMING.impact;
    // A single already-warmed menu shell is identical to the closed fracture
    // surface. Use it until cracks appear, instead of eighteen hidden-face draws.
    room.shell.visible = frame.eggState === 'intact';
    this.fracture.root.visible = !room.shell.visible;
    const shadowScope = frame.seconds < OPENING_GAME_TIMING.blackoutEnd ? 'menu'
      : frame.seconds < OPENING_GAME_TIMING.doorStart ? 'laboratory' : 'room';
    this.needsShadowUpdate = shadowScope !== this.lastShadowScope || shadowScope !== 'laboratory';
    this.lastShadowScope = shadowScope;
    // The opaque egg/hidden hero are static throughout the corridor. Do not
    // run fracture/support-height/gel work for every fly-through frame.
    if (seconds !== this.lastHatchSeconds || frame.seconds >= OPENING_GAME_TIMING.hatchStart) {
      this.lastHatchSeconds = seconds;
      this.lid.position.y = frame.lid * SPECIMEN_POD_LID_RAISE_METRES;
      room.setPodSuspensionLift(this.lid.position.y);
      const motion = reducedMotion ? 0.35 : 1;
      room.eggRoot.rotation.set(0.2 * tip + Math.sin(seconds * 18) * frame.rock * 0.35 * motion,
        0.12 * tip, -1.05 * tip + Math.sin(seconds * 23) * frame.rock * motion);
      room.eggRoot.position.set(1.65 * tip + 1.2 * fall, 1.66 - this.eggLowestY(),
        TITLE_EGG_CENTRE.z + tip + 1.25 * fall);
      if (seconds >= OPENING_HATCH_TIMING.fallStart) {
        // Constant acceleration over the authored free-fall, followed by contact.
        room.eggRoot.position.y = THREE.MathUtils.lerp(this.releaseY, this.impactPosition.y, fall * fall);
      }
      if (!this.debrisSettled || seconds < OPENING_HATCH_TIMING.impact + 3 || opening < 1) {
        this.fracture.apply(frame.eggState, 0, frame.crackProgress);
      }
      if (seconds < OPENING_HATCH_TIMING.impact) {
        this.debrisSettled = false;
        this.fracture.root.position.copy(room.eggRoot.position);
        this.fracture.root.quaternion.copy(room.eggRoot.quaternion);
        this.fracture.root.scale.copy(room.eggRoot.scale);
        for (const piece of this.fracture.fragments) piece.root.scale.setScalar(1);
        this.bob.root.position.copy(room.eggRoot.position);
        this.bob.root.quaternion.copy(room.eggRoot.quaternion);
        this.bob.root.scale.set(0.52, 0.5, 0.52);
      } else {
        this.fracture.root.position.set(0, 0, 0);
        this.fracture.root.quaternion.identity();
        this.fracture.root.scale.setScalar(1);
        this.poseDebris(seconds - OPENING_HATCH_TIMING.impact, opening);
        // One continuous authored Bob: a heavy, writhing puddle gathers into his
        // familiar silhouette. No spawned tubes, detached fluids or crossfade pop.
        const width = THREE.MathUtils.lerp(0.52 + spread * 0.86, 1, formation);
        const height = THREE.MathUtils.lerp(0.5 - spread * 0.34, 1, formation);
        const wobble = Math.sin(seconds * 8) * spread * (1 - formation) * 0.055 * motion;
        this.bob.root.scale.set(width + wobble, height, width - wobble);
        this.bob.root.quaternion.slerpQuaternions(this.impactRotation, this.identity, spread);
        this.bob.root.position.copy(this.impactPosition);
        this.bob.root.position.y = THREE.MathUtils.lerp(this.impactPosition.y, 0.45 * height, spread);
      }
      this.bob.setExpression('surprise', (1 - formation) * spread * 0.65);
    }
    if (frame.seconds >= OPENING_GAME_TIMING.hatchStart) {
      room.keyLight.target.position.lerpVectors(this.point.set(0, 1.1, -0.5), this.bob.root.position, opening);
    }
    this.poseCamera(frame, aspect, reducedMotion);
    // Authored Bob faces -Z. Keep his face in the reveal, including portrait framing.
    this.bob.setYaw(Math.atan2(this.bob.root.position.x - room.camera.position.x,
      this.bob.root.position.z - room.camera.position.z));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.laboratoryValue?.dispose();
    this.bobValue?.dispose();
    this.fractureValue?.dispose();
    this.room.dispose();
  }

  private poseDebris(age: number, opening: number): void {
    if (this.debrisSettled && age >= 3 && opening === 1) return;
    this.debrisSettled = age >= 3 && opening === 1;
    this.fracture.fragments.forEach((piece, index) => {
      const root = piece.root;
      this.direction.copy(this.debrisDirections[index]);
      piece.currentClearanceDirection.copy(this.direction);
      const flight = Math.max(0, age - index * 0.025);
      const travel = Math.min(1, flight / (0.7 + index * 0.04));
      root.quaternion.slerpQuaternions(this.impactRotation, this.debrisRotations[index],
        openingEase(0.2, 0.9, opening) * travel);
      root.scale.copy(this.room.eggRoot.scale);
      root.position.copy(this.debrisOrigins[index]);
      root.position.addScaledVector(this.direction, opening * (1.1 + index % 2 * 0.25));
      root.position.y += 1.6 * flight - 4.905 * flight * flight;
      let lowest = Infinity, edge = Infinity, podEdge = Infinity;
      for (const mesh of [piece.shell, piece.cracks]) {
        const positions = mesh.geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          this.point.fromBufferAttribute(positions, vertex).multiply(root.scale).applyQuaternion(root.quaternion);
          lowest = Math.min(lowest, this.point.y);
          edge = Math.min(edge, this.point.dot(this.direction));
          podEdge = Math.min(podEdge, this.point.dot(this.podNormal));
        }
      }
      root.position.y = Math.max(-lowest, root.position.y);
      // Separating planes include every triangle, not just fragment centres.
      // Pieces clear Bob before his puddle spreads beyond the intact egg.
      const origin = this.point.copy(root.position).sub(this.impactPosition).dot(this.direction);
      const clearance = 1.04 * Math.min(1, opening / 0.35);
      root.position.addScaledVector(this.direction, Math.max(0, clearance - origin - edge) * Math.min(1, opening / 0.12));
      const podOrigin = root.position.x * this.podNormal.x + (root.position.z - TITLE_EGG_CENTRE.z) * this.podNormal.z;
      root.position.addScaledVector(this.podNormal, Math.max(0, 1.52 - podOrigin - podEdge));
    });
  }

  private eggLowestY(): number {
    const matrix = this.rotationMatrix.makeRotationFromQuaternion(this.room.eggRoot.quaternion).elements;
    const scale = this.room.eggRoot.scale, positions = this.room.shell.geometry.getAttribute('position');
    let lowest = Infinity;
    for (let index = 0; index < positions.count; index++) lowest = Math.min(lowest,
      matrix[1] * positions.getX(index) * scale.x + matrix[5] * positions.getY(index) * scale.y +
      matrix[9] * positions.getZ(index) * scale.z);
    return lowest;
  }

  private poseCamera(frame: OpeningGameFrame, aspect: number, reducedMotion: boolean): void {
    const camera = this.room.camera, t = frame.hatchSeconds;
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    if (frame.seconds < OPENING_GAME_TIMING.blackoutEnd) {
      camera.position.copy(this.menuCamera);
      camera.quaternion.copy(this.menuCameraQuaternion);
      camera.fov = this.menuFov;
      camera.far = this.menuFar;
      const view = this.menuView;
      if (view?.enabled) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
      else camera.clearViewOffset();
    } else if (frame.seconds < OPENING_GAME_TIMING.hatchStart) {
      this.laboratory.poseCamera(frame.seconds, safeAspect);
      return;
    } else {
      camera.clearViewOffset();
      camera.far = 24;
      const revealStart = OPENING_HATCH_TIMING.impact + 1.8;
      const crackCue = OPENING_HATCH_TIMING.crackOne - 0.25;
      let shotFov = 50;
      if (t >= crackCue && t < OPENING_HATCH_TIMING.crackComplete + 0.25) {
        const index = t < OPENING_HATCH_TIMING.crackTwo ? 0 : t < OPENING_HATCH_TIMING.crackThree ? 1 : 2;
        const view = this.crackViews[index];
        const distance = THREE.MathUtils.lerp(2.6, 2.45, openingEase(view.start, view.end, t));
        camera.position.copy(this.room.eggRoot.position).addScaledVector(view.direction, distance);
        camera.position.y = view.height;
        this.point.copy(view.focus).multiply(this.room.eggRoot.scale).applyQuaternion(this.room.eggRoot.quaternion)
          .add(this.room.eggRoot.position);
        this.lookTarget.lerpVectors(this.room.eggRoot.position, this.point, 0.55);
        shotFov = 40;
      } else if (t < crackCue) {
        const close = openingEase(0.35, crackCue, t);
        camera.position.set(3.65 - close * 0.7, 2.85 - close * 0.15, 3.65 - close * 0.65);
        this.lookTarget.set(0, 2.15, -0.5);
      } else if (t < OPENING_HATCH_TIMING.tipStart) {
        // Widen after the last crack, so the entire physical lid lift reads.
        camera.position.set(3.65, 3.05, 3.65);
        this.lookTarget.set(0, 2.75, -0.5);
        shotFov = 54;
      } else if (t < revealStart) {
        camera.position.set(4.05, 1.75, 3.65);
        this.lookTarget.copy(this.room.eggRoot.position);
        this.lookTarget.y = Math.max(0.6, this.lookTarget.y);
      } else {
        const close = openingEase(revealStart, OPENING_HATCH_TIMING.fadeStart - 0.2, t);
        camera.position.set(4.1 - close * 0.4, 1.05 + close * 0.12, 3.65 - close * 0.35);
        // A portrait lens needs more horizontal clearance. Move around Bob,
        // keeping every view inside the authored Room 1 shell.
        camera.position.lerp(this.point.set(1.9, 1.15, 4.5), THREE.MathUtils.clamp((1 - safeAspect) / 0.6, 0, 1));
        this.lookTarget.copy(this.bob.root.position);
        this.lookTarget.y += 0.12;
      }
      camera.lookAt(this.lookTarget);
      camera.fov = Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan(
        Math.tan(THREE.MathUtils.degToRad(shotFov / 2)) / Math.min(1, safeAspect))));
      if (!reducedMotion && t >= OPENING_HATCH_TIMING.impact && t < OPENING_HATCH_TIMING.impact + 0.3) {
        camera.position.y += Math.sin((t - OPENING_HATCH_TIMING.impact) * 55) *
          (1 - (t - OPENING_HATCH_TIMING.impact) / 0.3) * 0.035;
      }
    }
    camera.aspect = safeAspect;
    camera.updateProjectionMatrix();
  }
}
