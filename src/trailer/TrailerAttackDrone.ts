import * as THREE from 'three';
import type { SecurityDroneConfig } from '../hazards/SecurityDrone.ts';
import { SecurityDronePresentation, SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { GOOP_INTRO_BOB_POSITION, GOOP_INTRO_DURATION_SECONDS, GOOP_INTRO_TIMING, sampleGoopIntro, type GoopIntroFrame } from './GoopIntroTimeline.ts';
import { TrailerDebrisMotion } from './TrailerDebrisMotion.ts';

interface WreckPart {
  readonly root: THREE.Group;
  readonly motion: TrailerDebrisMotion;
}

/** The game's sentry head on four lift fans; its real parts become the wreck. */
export class TrailerAttackDrone {
  readonly root = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly wreck = new THREE.Group();
  readonly fireOrigin = new THREE.Vector3();
  readonly hitPosition = new THREE.Vector3();
  readonly presentation: SecurityDronePresentation;

  private readonly resources = new SecurityDronePresentationResources(undefined, true);
  private readonly fans: THREE.Group[] = [];
  private readonly rotors: THREE.Group[] = [];
  private readonly pieces: WreckPart[] = [];
  private readonly wreckGeometries = new Set<THREE.BufferGeometry>();
  private readonly direction = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();
  private readonly baseColours = ['armour', 'armourShadow', 'mechanism', 'barrel'].map(role => {
    const material = this.resources.material(role as 'armour' | 'armourShadow' | 'mechanism' | 'barrel');
    return { material, colour: material.color.clone() };
  });
  private readonly corrosionColour = new THREE.Color(0x263c2c);
  private disposed = false;

  constructor() {
    const config: SecurityDroneConfig = {
      id: 'trailer-attack-drone', type: 'ceiling',
      initialPosition: new THREE.Vector3(), colliderSize: new THREE.Vector3(1.45, 0.66, 1.25),
      forward: new THREE.Vector3(0, 0, -1), scanAxis: new THREE.Vector3(0, 1, 0),
      scanHalfAngleRadians: 0.3, scanSpeedRadiansPerSecond: 0.6,
      detectionHalfAngleRadians: 0.3, detectionRangeMetres: 20,
      warningSeconds: 0.3, fireIntervalSeconds: 1, targetLossGraceSeconds: 0.2, cooldownSeconds: 0.5,
      muzzleAnchor: new THREE.Vector3(0, 0, -0.7), targetPolicy: 'bob-only', initialScanPhase: 0,
    };
    this.root.name = 'trailer-flying-attack-drone';
    this.rig.name = 'trailer-intact-flying-drone';
    this.wreck.name = 'trailer-drone-authored-wreck';
    this.presentation = new SecurityDronePresentation(config, this.resources);
    // No ceiling brackets on a free-flying craft.
    for (const part of [...this.presentation.root.children]) {
      if (part.name.endsWith('-mount') || part.name.endsWith('-linkage')) part.removeFromParent();
    }
    this.rig.add(this.presentation.root);
    this.root.add(this.rig, this.wreck);
    this.buildFans();
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
    });
    this.pose(sampleGoopIntro(GOOP_INTRO_TIMING.droneFire));
    this.root.updateMatrixWorld(true);
    this.presentation.eye.getWorldPosition(this.fireOrigin);
    this.direction.fromArray(GOOP_INTRO_BOB_POSITION).sub(this.fireOrigin).normalize();
    this.fireOrigin.addScaledVector(this.direction, 0.08);
    this.pose(sampleGoopIntro(GOOP_INTRO_TIMING.droneHit));
    this.hitPosition.copy(this.rig.position);
    this.pose(sampleGoopIntro(GOOP_INTRO_TIMING.breakup));
    this.captureWreckParts();
    this.apply(sampleGoopIntro(0));
  }

  apply(frame: GoopIntroFrame): void {
    if (this.disposed) return;
    this.pose(frame);
    const broken = frame.breakupAge >= 0;
    this.rig.visible = !broken;
    this.wreck.visible = broken;
    this.presentation.setState(broken ? 'disabled' : frame.seconds >= GOOP_INTRO_TIMING.droneFire
      ? 'firing' : frame.seconds >= GOOP_INTRO_TIMING.aim ? 'warning' : 'scanning', !broken);
    // The lens changes colour, not physical size, including at detachment.
    this.presentation.eye.scale.setScalar(1);
    const corrosion = frame.droneImpactAge < 0 ? 0 : Math.min(1, frame.droneImpactAge * 4);
    const glow = frame.droneImpactAge < 0 ? 0 : Math.exp(-frame.droneImpactAge * 7) * 0.75;
    for (const { material, colour } of this.baseColours) {
      material.color.copy(colour).lerp(this.corrosionColour, corrosion * 0.78);
      material.emissive.setHex(0x8aff24);
      material.emissiveIntensity = glow;
    }
    if (!broken) return;
    for (const piece of this.pieces) piece.motion.apply(frame.breakupAge, piece.root);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.wreck.clear();
    this.presentation.dispose();
    this.resources.dispose();
    for (const geometry of this.wreckGeometries) geometry.dispose();
    this.wreckGeometries.clear();
    this.root.clear();
    this.pieces.length = this.fans.length = this.rotors.length = 0;
  }

  private pose(frame: GoopIntroFrame): void {
    this.rig.position.fromArray(frame.dronePosition);
    this.rig.rotation.set(Math.sin(frame.seconds * 2) * 0.025, Math.sin(frame.seconds * 1.5) * 0.04, Math.sin(frame.seconds * 2.7) * 0.035);
    this.direction.fromArray(GOOP_INTRO_BOB_POSITION).sub(this.rig.position).normalize();
    this.inverse.copy(this.rig.quaternion).invert();
    this.direction.applyQuaternion(this.inverse);
    this.presentation.setAimDirection(this.direction);
    this.rotors.forEach((rotor, i) => { rotor.rotation.y = frame.seconds * (i % 2 ? -54 : 54) + i; });
  }

  private captureWreckParts(): void {
    this.root.updateMatrixWorld(true);
    const casing = new THREE.Group();
    casing.name = 'trailer-drone-casing';
    const assemblies: THREE.Group[] = [casing];
    const worldClone = (source: THREE.Object3D) => {
      const clone = source.clone(true);
      source.getWorldPosition(clone.position);
      source.getWorldQuaternion(clone.quaternion);
      source.getWorldScale(clone.scale);
      return clone;
    };
    // Materials are merged for rendering, not physical assemblies. Keep the
    // housing together, but let the two disconnected gun barrels fall separately.
    for (const source of this.presentation.aimHead.children) {
      if (!(source instanceof THREE.Mesh)) continue;
      if (!source.name.endsWith('-barrels')) { casing.add(worldClone(source)); continue; }
      for (const side of [-1, 1]) {
        const barrel = worldClone(source) as THREE.Mesh;
        barrel.name = `${source.name}-${side < 0 ? 'left' : 'right'}`;
        barrel.geometry = this.splitBarrel(source.geometry, side);
        const assembly = new THREE.Group();
        assembly.name = barrel.name;
        assembly.add(barrel);
        assemblies.push(assembly);
      }
    }
    for (const fan of this.fans) {
      const assembly = new THREE.Group();
      assembly.name = fan.name;
      assembly.add(worldClone(fan));
      assemblies.push(assembly);
    }
    assemblies.forEach((root, index) => {
      this.wreck.add(root);
      root.updateMatrixWorld(true);
      const origin = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
      root.position.copy(origin);
      for (const child of root.children) child.position.sub(origin);
      root.updateMatrixWorld(true);
      const support: THREE.Vector3[] = [];
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          support.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).sub(origin));
        }
      });
      const angle = index * 2.39996;
      const speed = index === 0 ? 0.65 : 1.3 + index % 3 * 0.25;
      // Scatter away from the real assembly centre, not arbitrary directions
      // that send opposing fans back through the falling housing.
      const blast = origin.clone().sub(this.hitPosition).setY(0).normalize().multiplyScalar(speed);
      if (index === 0) blast.set(0.25, 0, -0.15);
      blast.y = 0.3 + index % 3 * 0.22;
      this.pieces.push({ root,
        motion: new TrailerDebrisMotion(support, origin,
          blast,
          new THREE.Vector3(Math.cos(angle) * 3.2, Math.sin(angle) * 2.2, index % 2 ? -3.8 : 3.8),
          GOOP_INTRO_DURATION_SECONDS - GOOP_INTRO_TIMING.breakup),
      });
    });
  }

  private splitBarrel(geometry: THREE.BufferGeometry, side: number): THREE.BufferGeometry {
    const positions = geometry.getAttribute('position');
    const selected: number[] = [];
    for (let i = 0; i < positions.count; i += 3) {
      const centre = positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2);
      if (centre * side > 0) selected.push(i, i + 1, i + 2);
    }
    const split = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new Float32Array(selected.length * attribute.itemSize);
      selected.forEach((vertex, i) => {
        for (let axis = 0; axis < attribute.itemSize; axis++) values[i * attribute.itemSize + axis] = attribute.getComponent(vertex, axis);
      });
      split.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
    }
    this.wreckGeometries.add(split);
    return split;
  }

  private buildFans(): void {
    const metal = this.resources.material('armourShadow');
    const dark = this.resources.material('mechanism');
    const ringGeometry = this.resources.geometry('trailer-lift-ring', () => new THREE.TorusGeometry(0.31, 0.037, 6, 20).rotateX(Math.PI / 2));
    const hubGeometry = this.resources.geometry('trailer-lift-hub', () => new THREE.CylinderGeometry(0.055, 0.07, 0.1, 10));
    const bladeGeometry = this.resources.geometry('trailer-lift-blade', () => new THREE.BoxGeometry(0.23, 0.016, 0.065));
    const armGeometry = this.resources.geometry('trailer-lift-arm', () => new THREE.CylinderGeometry(0.035, 0.045, 1, 8));
    for (const x of [-0.88, 0.88]) for (const z of [-0.49, 0.49]) {
      const fan = new THREE.Group();
      fan.name = `trailer-drone-lift-fan-${this.fans.length}`;
      fan.position.set(x, 0.2, z);
      fan.add(new THREE.Mesh(ringGeometry, dark), new THREE.Mesh(hubGeometry, metal));
      const rotor = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(bladeGeometry, metal);
        const angle = i * Math.PI * 2 / 3;
        blade.position.set(Math.cos(angle) * 0.16, 0.02, Math.sin(angle) * 0.16);
        blade.rotation.y = -angle;
        rotor.add(blade);
      }
      fan.add(rotor);
      const arm = new THREE.Mesh(armGeometry, dark);
      this.direction.copy(fan.position).normalize();
      arm.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.direction);
      arm.scale.y = fan.position.length();
      arm.position.copy(fan.position).multiplyScalar(-0.5);
      fan.add(arm);
      this.rig.add(fan);
      this.fans.push(fan);
      this.rotors.push(rotor);
    }
  }
}
