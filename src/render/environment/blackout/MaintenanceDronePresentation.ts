import { DEFAULT_USER_KEY_BINDINGS, keyLabel, type UserKeyBindings } from '../../../core/KeyBindings.ts';
import * as THREE from 'three';
import { markDecorativeEffect } from '../../GraphicsResourcePolicy.ts';
import { disposeShadowLight, setShadowMapUpdatesActive } from '../../ShadowLightResources.ts';

import type { MaintenanceDroneReadModel } from '../../../vehicles/MaintenanceDroneTypes.ts';
import type { CollisionWorld } from '../../../physics/CollisionWorld.ts';
import { BeamOcclusion } from '../../hazards/BeamOcclusion.ts';
import type { BlackoutMaintenanceMaterials } from './BlackoutMaintenanceMaterials.ts';
import { MaintenanceDroneModel, type MaintenanceDroneModelLoader } from './MaintenanceDroneModel.ts';

/** Worn, purely visual maintenance craft; gameplay/collision remain runtime-owned. */
export class MaintenanceDronePresentation {
  private readonly root = new THREE.Group();
  private readonly hud: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly tutorial: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly model: MaintenanceDroneModel;
  private readonly cones: { mesh: THREE.Mesh; baseOpacity: number }[] = [];
  private readonly dustPositions: Float32Array;
  private readonly dustGeometry: THREE.BufferGeometry;
  private readonly dust: THREE.Points;
  private readonly sparks: THREE.Points;
  private readonly sparkGeometry: THREE.BufferGeometry;
  private readonly spot: THREE.SpotLight;
  private readonly spotTarget = new THREE.Object3D();
  private elapsed = 0;
  private tutorialElapsed = 0;
  private readonly completeTutorial: () => void;
  private readonly getKeyBindings: () => UserKeyBindings;
  private disposed = false;
  private readonly world?: CollisionWorld;
  private readonly ignored?: THREE.Mesh;
  private readonly occlusion = new BeamOcclusion();
  private readonly beamOrigin = new THREE.Vector3();
  private readonly downward = new THREE.Vector3(0,-1,0);

  constructor(authoringRoot: THREE.Group, host: HTMLElement, world?: CollisionWorld, ignored?: THREE.Mesh, completeTutorial: () => void = () => {}, kit?: BlackoutMaintenanceMaterials, getKeyBindings: () => UserKeyBindings = () => DEFAULT_USER_KEY_BINDINGS) {
    this.getKeyBindings = getKeyBindings;
    this.completeTutorial = completeTutorial;
    this.world=world;this.ignored=ignored;
    this.root.name = 'maintenance-drone-presentation';
    this.root.userData.presentationOnly = true;
    authoringRoot.add(this.root);

    this.model = new MaintenanceDroneModel(kit);
    this.root.add(this.model.root);

    // At normal hover height, cover a 5 x 7 m landing deck with a soft local pool.
    // Keep one shadowed source; the beam geometry and occlusion use its angle.
    this.spot = new THREE.SpotLight(0xffd34f, 0, 32, Math.atan(6/7), .25, 2);
    this.spot.name = 'blackout-maintenance-searchlight';
    this.spot.castShadow=true;
    this.spot.shadow.mapSize.set(512,512);
    this.spot.shadow.camera.near=.05;
    this.spot.shadow.bias=-.0001;
    this.spot.shadow.normalBias=.015;
    this.spot.position.set(0, -.13, 0); this.spot.target = this.spotTarget;
    this.spotTarget.position.set(0, -2.5, 0);
    this.root.add(this.spot, this.spotTarget);
    for (let i = 0; i < 3; i++) {
      const baseOpacity = [.045, .025, .012][i]!;
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xffd64f, transparent: true,
        opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      this.materials.add(coneMat);
      // ConeGeometry's apex is +Y: leave it unrotated so the beam widens down.
      const cone = new THREE.Mesh(this.own(new THREE.ConeGeometry([.74, .86, 1][i]! * Math.tan(this.spot.angle) * 7, 7, 24, 1, true)), coneMat);
      cone.name = 'soft-maintenance-beam'; cone.position.y = -3.63; this.root.add(cone);
      this.cones.push({ mesh: cone, baseOpacity });
    }
    // Fixed-size pooled dust and shorting sparks; positions are reused each frame.
    this.dustPositions = new Float32Array(30 * 3);
    this.dustGeometry = this.own(new THREE.BufferGeometry());
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    markDecorativeEffect(this.dustGeometry);
    const dustMat = new THREE.PointsMaterial({ color: 0xd8bd7a, size: .035, transparent: true, opacity: .34, depthWrite: false });
    this.materials.add(dustMat); this.dust = new THREE.Points(this.dustGeometry, dustMat); this.root.add(this.dust);
    this.sparkGeometry = this.own(new THREE.BufferGeometry());
    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const sparkMat = new THREE.PointsMaterial({ color: 0xffb52f, size: .075, transparent: true, opacity: .9, depthWrite: false });
    this.materials.add(sparkMat); this.sparks = new THREE.Points(this.sparkGeometry, sparkMat); this.sparks.visible = false; this.root.add(this.sparks);

    const doc = host.ownerDocument;
    this.hud = doc.createElement('div'); this.hud.className = 'maintenance-drone-hud';
    Object.assign(this.hud.style, { position: 'absolute', left: '50%', bottom: '18%', transform: 'translateX(-50%)',
      color: '#ffe18a', font: '600 12px/1.45 system-ui,sans-serif', letterSpacing: '.08em', textAlign: 'center',
      textShadow: '0 2px 8px #000', pointerEvents: 'none', whiteSpace: 'pre-line', zIndex: '5' });
    this.prompt = doc.createElement('div');
    this.tutorial = doc.createElement('div'); this.tutorial.style.color = '#f2e8c7'; this.tutorial.style.fontWeight = '400';
    this.status = doc.createElement('div'); this.status.style.color = '#e9c84f';
    this.hud.append(this.prompt, this.status, this.tutorial);
    host.append(this.hud);
  }

  /** Resolve authored geometry before the runtime compiles its material forms. */
  prepare(loader?: MaintenanceDroneModelLoader): Promise<void> { return this.model.prepare(loader); }

  update(dt: number, state: MaintenanceDroneReadModel, activeVolt = true): void {
    if (this.disposed) return;
    const step = Math.max(0, Math.min(dt, .1)); this.elapsed += step;
    const started = state.state === 'starting';
    const lit = state.lightEnabled || started;
    const ramp = started ? THREE.MathUtils.smoothstep(state.startupProgress, 0, 1) : (state.lightEnabled ? 1 : 0);
    this.spot.intensity = 100 * ramp;
    // Keep the source registered for stable programs; unpowered maps do no work.
    setShadowMapUpdatesActive(this.spot, lit);
    let beamLength=32;
    if(lit && this.world && this.ignored) {
      this.root.updateWorldMatrix(true,false);
      this.beamOrigin.set(0,-.13,0);this.root.localToWorld(this.beamOrigin);
      beamLength=this.occlusion.length(this.world,this.beamOrigin,this.downward,this.spot.distance,this.spot.angle,this.ignored);
    }
    for(const cone of this.cones) {
      cone.mesh.scale.setScalar(beamLength/7);
      cone.mesh.position.y=-.13-beamLength/2;
    }
    for (const cone of this.cones) (cone.mesh.material as THREE.MeshBasicMaterial).opacity = cone.baseOpacity * ramp;
    for (let i = 0; i < this.model.rotors.length; i++) {
      const fan = this.model.rotors[i]!;
      const spinning = state.powered || started;
      fan.rotation.y += step * (spinning ? 21 : 0.35) * (i % 2 ? -1 : 1);
    }
    for (let i = 0; i < this.model.lamps.length; i++) {
      this.model.lamps[i]!.emissiveIntensity = lit ? .8 + Math.sin(this.elapsed * 5 + i) * .16 : .16;
      if (state.state === 'shorted') this.model.lamps[i]!.emissive.setHex(i % 2 ? 0xff421e : 0xffc42e);
      else this.model.lamps[i]!.emissive.setHex(0xffc42e);
    }
    const positions = this.dustPositions;
    for (let i = 0; i < positions.length / 3; i++) {
      const phase = this.elapsed * (.28 + (i % 5) * .035) + i * 2.399;
      positions[i * 3] = Math.sin(phase) * (.25 + i % 4 * .12);
      positions[i * 3 + 1] = -.13 - ((phase * .16 + i * .071) % Math.max(.001,Math.min(2.2,beamLength-.03)));
      positions[i * 3 + 2] = Math.cos(phase * .83) * (.22 + i % 3 * .13);
    }
    this.dustGeometry.attributes.position!.needsUpdate = true;
    this.dust.visible = lit;
    const shorted = state.state === 'shorted';
    const idleSpark = (state.state === 'damaged-idle' || state.state === 'grounded-idle') && this.elapsed % 5.2 < .16;
    this.sparks.visible = shorted || idleSpark;
    const sparkPos = this.sparkGeometry.attributes.position as THREE.BufferAttribute;
    if (this.sparks.visible) for (let i = 0; i < sparkPos.count; i++) {
      const t = (shorted ? this.elapsed * 13 : (this.elapsed % 5.2) * 13) + i * 3.71;
      sparkPos.setXYZ(i, -.32 + Math.sin(t) * .12, -.05 - (t % .23), .65 + Math.cos(t * 1.7) * .06);
    }
    if (this.sparks.visible) sparkPos.needsUpdate = true;

    const showMount = state.mountAvailable && !state.mounted;
    this.prompt.hidden = !activeVolt || (!showMount && !state.mounted);
    const keys = this.getKeyBindings(), mount = keyLabel(keys.mountDrone);
    this.prompt.textContent = state.mounted ? `${mount} · Dismount` : (showMount ? `${mount} · Mount` : '');
    if (!state.firstMountTutorialAvailable || state.tutorialCompleted) this.tutorialElapsed = 0;
    this.tutorial.hidden = !activeVolt || !state.mounted || !state.firstMountTutorialAvailable || state.tutorialCompleted;
    // Only count time actually visible after startup. The controller owns the
    // one-shot completion flag and restores it with its checkpoint snapshot.
    if (!this.tutorial.hidden) {
      this.tutorialElapsed += step;
      if (this.tutorialElapsed >= 4) {
        this.completeTutorial();
        this.tutorialElapsed = 0;
        this.tutorial.hidden = true;
      }
    }
    this.tutorial.textContent = this.tutorial.hidden ? '' : `${[keys.moveForward, keys.moveLeft, keys.moveBackward, keys.moveRight].map(keyLabel).join(' ')} · Move  ·  ${keyLabel(keys.jump)} · Rise  ·  ${keyLabel(keys.droneDescend)} · Descend  ·  ${mount} · Dismount`;
    this.status.textContent = !activeVolt ? '' : shorted ? 'ELECTRICAL FAULT' : started ? 'SYSTEM STARTING…' : '';
    this.status.hidden = !activeVolt || (!shorted && !started);
  }

  resetTutorial(): void {
    this.tutorialElapsed = 0;
    this.tutorial.hidden = true;
    this.tutorial.textContent = '';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeShadowLight(this.spot);
    this.model.dispose();
    this.root.removeFromParent(); this.root.clear(); this.hud.remove();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear(); this.materials.clear();
  }

  private own<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry); return geometry;
  }
}
