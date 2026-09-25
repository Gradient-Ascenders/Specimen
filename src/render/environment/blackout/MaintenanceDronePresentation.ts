import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import type { MaintenanceDroneReadModel } from '../../../vehicles/MaintenanceDroneTypes.ts';
import type { CollisionWorld } from '../../../physics/CollisionWorld.ts';
import { BeamOcclusion } from '../../hazards/BeamOcclusion.ts';

/** Worn, purely visual maintenance craft; gameplay/collision remain runtime-owned. */
export class MaintenanceDronePresentation {
  private readonly root = new THREE.Group();
  private readonly hud: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly tutorial: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly fans: THREE.Group[] = [];
  private readonly cones: { mesh: THREE.Mesh; baseOpacity: number }[] = [];
  private readonly lamps: THREE.MeshStandardMaterial[] = [];
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
  private disposed = false;
  private readonly world?: CollisionWorld;
  private readonly ignored?: THREE.Mesh;
  private readonly occlusion = new BeamOcclusion();
  private readonly beamOrigin = new THREE.Vector3();
  private readonly downward = new THREE.Vector3(0,-1,0);

  constructor(authoringRoot: THREE.Group, host: HTMLElement, world?: CollisionWorld, ignored?: THREE.Mesh, completeTutorial: () => void = () => {}) {
    this.completeTutorial = completeTutorial;
    this.world=world;this.ignored=ignored;
    this.root.name = 'maintenance-drone-presentation';
    this.root.userData.presentationOnly = true;
    authoringRoot.add(this.root);

    const mat = (color: number, roughness: number, metalness: number) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this.materials.add(m);
      return m;
    };
    const yellow = mat(0xc79b27, .78, .35);
    const edgeYellow = mat(0x84651c, .88, .28);
    const darkMetal = mat(0x252a27, .52, .78);
    const steel = mat(0x66706b, .44, .82);
    const rubber = mat(0x171a18, .96, .05);
    const glass = mat(0x182522, .24, .35);
    const shellGeo = this.own(new RoundedBoxGeometry(1.45, .38, 1.34, 4, .13));
    const shell = new THREE.Mesh(shellGeo, yellow);
    shell.name = 'maintenance-drone-worn-yellow-shell';
    shell.position.y = .02;
    this.root.add(shell);

    // Raised service hatch, bumper rails and unmistakable hazard paint.
    const hatch = new THREE.Mesh(this.own(new RoundedBoxGeometry(.69, .1, .65, 3, .045)), edgeYellow);
    hatch.position.set(0, .245, -.04); this.root.add(hatch);
    const window = new THREE.Mesh(this.own(new RoundedBoxGeometry(.37, .055, .2, 3, .025)), glass);
    window.position.set(0, .31, -.1); this.root.add(window);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.035, .035, 1.13, 8)), darkMetal);
      rail.rotation.z = Math.PI / 2; rail.position.set(0, -.07, side * .62); this.root.add(rail);
      const stripe = new THREE.Mesh(this.own(new THREE.BoxGeometry(.28, .012, .018)), edgeYellow);
      stripe.position.set(side * .39, .218, .655); stripe.rotation.y = -.28; this.root.add(stripe);
    }
    // Four guarded ducted fans with simple rotating three-blade rotors.
    for (const x of [-.52, .52]) for (const z of [-.49, .49]) {
      const fan = new THREE.Group(); fan.position.set(x, .25, z); fan.name = 'guarded-lift-fan'; this.root.add(fan);
      const ring = new THREE.Mesh(this.own(new THREE.TorusGeometry(.195, .035, 7, 18)), darkMetal);
      ring.rotation.x = Math.PI / 2; fan.add(ring);
      const hub = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.055, .07, .09, 10)), steel);
      hub.position.y = .01; fan.add(hub);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(this.own(new THREE.BoxGeometry(.13, .018, .07)), steel);
        blade.position.set(Math.cos(i * Math.PI * 2 / 3) * .095, .012, Math.sin(i * Math.PI * 2 / 3) * .095);
        blade.rotation.y = i * Math.PI * 2 / 3 + .3; fan.add(blade);
      }
      this.fans.push(fan);
    }
    // Functional-looking service fittings and bundled exposed cable, no weaponry.
    const hoseMat = mat(0x332b1b, .92, .08);
    for (let i = 0; i < 3; i++) {
      const cable = new THREE.Mesh(this.own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.37 + i * .16, .02, .66), new THREE.Vector3(-.3 + i * .16, -.1, .72),
        new THREE.Vector3(-.12 + i * .16, -.12, .69), new THREE.Vector3(-.07 + i * .16, -.015, .65),
      ]), 12, .014, 5, false)), hoseMat);
      this.root.add(cable);
    }
    for (const x of [-.49, .49]) {
      const foot = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.065, .085, .19, 8)), rubber);
      foot.position.set(x, -.19, .43); this.root.add(foot);
    }

    for (const [x, z] of [[-.47, -.684], [.47, -.684], [-.47, .684], [.47, .684]]) {
      const lampMat = mat(0x44351a, .35, .18); lampMat.emissive.setHex(0xffc42e); lampMat.emissiveIntensity = .3;
      this.lamps.push(lampMat);
      const lamp = new THREE.Mesh(this.own(new THREE.SphereGeometry(.045, 8, 6)), lampMat);
      lamp.position.set(x, .03, z); this.root.add(lamp);
    }

    // The visible cone and real spotlight share the same angle and useful range.
    this.spot = new THREE.SpotLight(0xffd34f, 0, 32, Math.atan(2/7), .5, 2);
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
      const cone = new THREE.Mesh(this.own(new THREE.ConeGeometry([1.48, 1.72, 2][i]!, 7, 24, 1, true)), coneMat);
      cone.name = 'soft-maintenance-beam'; cone.position.y = -3.63; this.root.add(cone);
      this.cones.push({ mesh: cone, baseOpacity });
    }
    // Fixed-size pooled dust and shorting sparks; positions are reused each frame.
    this.dustPositions = new Float32Array(30 * 3);
    this.dustGeometry = this.own(new THREE.BufferGeometry());
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
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

  update(dt: number, state: MaintenanceDroneReadModel, activeVolt = true): void {
    if (this.disposed) return;
    const step = Math.max(0, Math.min(dt, .1)); this.elapsed += step;
    const started = state.state === 'starting';
    const lit = state.lightEnabled || started;
    const ramp = started ? THREE.MathUtils.smoothstep(state.startupProgress, 0, 1) : (state.lightEnabled ? 1 : 0);
    this.spot.intensity = 100 * ramp;
    let beamLength=32;
    if(lit && this.world && this.ignored) {
      this.root.updateWorldMatrix(true,false);
      this.beamOrigin.set(0,-.13,0);this.root.localToWorld(this.beamOrigin);
      beamLength=this.occlusion.length(this.world,this.beamOrigin,this.downward,32,Math.atan(2/7),this.ignored);
    }
    for(const cone of this.cones) {
      cone.mesh.scale.setScalar(beamLength/7);
      cone.mesh.position.y=-.13-beamLength/2;
    }
    for (const cone of this.cones) (cone.mesh.material as THREE.MeshBasicMaterial).opacity = cone.baseOpacity * ramp;
    for (const fan of this.fans) {
      const spinning = state.powered || started;
      fan.rotation.y += step * (spinning ? 21 : 0.35) * (this.fans.indexOf(fan) % 2 ? -1 : 1);
    }
    for (let i = 0; i < this.lamps.length; i++) {
      this.lamps[i]!.emissiveIntensity = lit ? .8 + Math.sin(this.elapsed * 5 + i) * .16 : .16;
      if (state.state === 'shorted') this.lamps[i]!.emissive.setHex(i % 2 ? 0xff421e : 0xffc42e);
      else this.lamps[i]!.emissive.setHex(0xffc42e);
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
    this.prompt.textContent = state.mounted ? '[M] DISMOUNT' : (showMount ? '[M] MOUNT' : '');
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
    this.tutorial.textContent = this.tutorial.hidden ? '' : 'FLIGHT CONTROLS  ·  WASD MOVE  ·  SPACE RISE  ·  SHIFT DESCEND  ·  M DISMOUNT';
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
    this.spot.dispose();
    this.root.removeFromParent(); this.root.clear(); this.hud.remove();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear(); this.materials.clear();
  }

  private own<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry); return geometry;
  }
}
