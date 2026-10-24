import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { markVisualOnly } from './ContainmentModularComponents.ts';
import {ContainmentSurveillanceModel,type ContainmentSurveillanceModelLoader} from './ContainmentSurveillanceModel.ts';

export const CONTAINMENT_SURVEILLANCE_PLACEMENTS = [
  { id: 'room-1-monitor-surveillance-camera', roomId: 1, position: [-6.69, 4.25, 2.95], yaw: Math.PI / 2 },
  { id: 'room-2-monitor-surveillance-camera', roomId: 2, position: [14.81, 7.98804, 34.65], yaw: -Math.PI / 2 },
  { id: 'room-2-exit-surveillance-camera', roomId: 2, position: [0, 16.15, 48.81], yaw: Math.PI },
  { id: 'room-3-monitor-surveillance-camera', roomId: 3, position: [16.81, 13.1, 56.15], yaw: -Math.PI / 2 },
  // Facing the rear (+Z) wall, the blank area right of the final strip is -X.
  { id: 'room-3-upper-wall-surveillance-camera', roomId: 3, position: [1.5, 27.85, 76.82], yaw: Math.PI },
  { id: 'room-5-monitor-surveillance-camera', roomId: 5, position: [0, 86.05, 125.24], yaw: Math.PI },
] as const;

export const CONTAINMENT_SURVEILLANCE_TRACKING = Object.freeze({
  responsePerSecond: 6,
  maximumYawRadians: THREE.MathUtils.degToRad(80),
  minimumPitchRadians: THREE.MathUtils.degToRad(-50),
  maximumPitchRadians: THREE.MathUtils.degToRad(80),
});

export interface SurveillanceCameraPlacement {
  readonly id: string;
  readonly roomId: number;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
}
interface CameraPart {
  readonly shape?: 'cylinder';
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly colour: number;
}

/** Three shared meshes per fixture; moving only the pan/tilt joints uploads no buffers. */
export class ContainmentSurveillanceCamera {
  readonly placement: SurveillanceCameraPlacement;
  readonly root = new THREE.Group();
  readonly pan = new THREE.Group();
  readonly tilt = new THREE.Group();
  private readonly localTarget = new THREE.Vector3();

  constructor(placement: SurveillanceCameraPlacement, geometry: readonly THREE.BufferGeometry[],
    housingMaterial: THREE.Material, indicatorMaterial: THREE.Material) {
    this.placement = placement;
    this.root.name = placement.id;
    this.root.position.fromArray(placement.position);
    this.root.rotation.y = placement.yaw;
    this.pan.name = `${placement.id}-pan`;
    this.pan.position.set(0, -.22, .52);
    this.tilt.name = `${placement.id}-tilt`;
    this.tilt.rotation.x = .3;
    this.pan.add(this.tilt);
    this.root.add(this.pan);
    for (const [index, suffix] of ['wall-mount', 'housing', 'lens-and-recording-led'].entries()) {
      const mesh = new THREE.Mesh(geometry[index], index === 2 ? indicatorMaterial : housingMaterial);
      mesh.name = `${placement.id}-${suffix}`;
      (index === 0 ? this.root : this.tilt).add(mesh);
      // Immutable model parts share GPU buffers. Only their two parent joints move.
      mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    }
    this.root.traverse(object => {
      markVisualOnly(object);
      object.userData.resourceOwnership = 'borrowed-containment-surveillance';
    });
    this.root.userData.presentationOwnedBy = 'containment-surveillance-cameras';
  }

  track(bobPosition: Vector3State, blend: number): void {
    // Convert through the live wall/room hierarchy, not a guessed global heading.
    this.root.worldToLocal(this.localTarget.copy(bobPosition)).sub(this.pan.position);
    const horizontal = Math.hypot(this.localTarget.x, this.localTarget.z);
    if (horizontal * horizontal + this.localTarget.y * this.localTarget.y < 1e-8) return;
    const T = CONTAINMENT_SURVEILLANCE_TRACKING;
    const yaw = THREE.MathUtils.clamp(Math.atan2(this.localTarget.x, this.localTarget.z),
      -T.maximumYawRadians, T.maximumYawRadians);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(this.localTarget.y, horizontal),
      T.minimumPitchRadians, T.maximumPitchRadians);
    this.pan.rotation.y += (yaw - this.pan.rotation.y) * blend;
    this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * blend;
  }

  reset(): void { this.pan.rotation.y = 0; this.tilt.rotation.x = .3; }
}

/** Scene-owned pool: three shared geometries, two materials, no textures/lights/shadows. */
export class ContainmentSurveillanceCameras {
  readonly cameras: readonly ContainmentSurveillanceCamera[];
  private readonly model=new ContainmentSurveillanceModel();
  private readonly geometries: readonly THREE.BufferGeometry[];
  private readonly housingMaterial = new THREE.MeshStandardMaterial({
    name: 'containment-surveillance-painted-metal', vertexColors: true,
    roughness: .56, metalness: .3,
  });
  private readonly indicatorMaterial = new THREE.MeshBasicMaterial({
    name: 'containment-surveillance-optics-and-recording-led', vertexColors: true, toneMapped: false,
  });
  private disposed = false;

  constructor(roomRoots: Readonly<Record<number, THREE.Group>>,
    placements: readonly SurveillanceCameraPlacement[] = CONTAINMENT_SURVEILLANCE_PLACEMENTS) {
    this.geometries = createCameraGeometries();
    this.cameras = placements.map(placement => {
      const camera = new ContainmentSurveillanceCamera(placement, this.geometries,
        this.housingMaterial, this.indicatorMaterial);
      roomRoots[placement.roomId].add(camera.root);
      return camera;
    });
  }

  async prepare(borrowFinish:(name:string)=>THREE.Material,loader?:ContainmentSurveillanceModelLoader):Promise<void>{
    await this.model.prepare(borrowFinish,loader);
    if(this.disposed)return;
    for(const camera of this.cameras)this.model.attachCamera(camera.tilt);
  }
  get authoredRenderMeshes():readonly THREE.Mesh[]{return this.model.renderMeshes;}
  get modelDiagnostics(){return this.model.diagnostics;}

  update(deltaSeconds: number, bobPosition?: Vector3State): void {
    if (this.disposed) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid camera timestep.');
    if (!isFinitePosition(bobPosition)) return;
    const blend = -Math.expm1(-CONTAINMENT_SURVEILLANCE_TRACKING.responsePerSecond * deltaSeconds);
    if (blend === 0) return;
    for (const camera of this.cameras) camera.track(bobPosition, blend);
  }

  reset(bobPosition?: Vector3State): void {
    if (this.disposed) return;
    for (const camera of this.cameras) camera.reset();
    if (isFinitePosition(bobPosition)) {
      for (const camera of this.cameras) camera.track(bobPosition, 1);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.model.dispose();
    for (const camera of this.cameras) { camera.root.removeFromParent(); camera.root.clear(); }
    for (const geometry of this.geometries) geometry.dispose();
    this.housingMaterial.dispose(); this.indicatorMaterial.dispose();
  }
}

function isFinitePosition(position?: Vector3State): position is Vector3State {
  return !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function createCameraGeometries(): readonly THREE.BufferGeometry[] {
  const boxes = new THREE.BoxGeometry(1, 1, 1), cylinders = new THREE.CylinderGeometry(.5, .5, 1, 12);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Euler(), orientation = new THREE.Quaternion(), colour = new THREE.Color();
  const bake = (name: string, parts: readonly CameraPart[]) => {
    const pieces = parts.map(part => {
      const geometry = (part.shape === 'cylinder' ? cylinders : boxes).clone();
      position.set(...part.position); scale.set(...part.size);
      rotation.set(...(part.rotation ?? [0, 0, 0])); orientation.setFromEuler(rotation);
      geometry.applyMatrix4(matrix.compose(position, orientation, scale));
      colour.setHex(part.colour);
      const colours = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colours.length; i += 3) {
        colours[i] = colour.r; colours[i + 1] = colour.g; colours[i + 2] = colour.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      return geometry;
    });
    const geometry = mergeGeometries(pieces)!;
    for (const piece of pieces) piece.dispose();
    geometry.name = name; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  };
  const mount = bake('containment-surveillance-shared-wall-mount', [
    { size: [.34, .52, .08], position: [0, .08, 0], colour: 0x28373e },
    // Meet the upright at Z=.46; overlapping equal-width boxes put their side
    // faces on top of each other.
    { size: [.12, .12, .46], position: [0, -.08, .23], colour: 0x6c7f86 },
    { size: [.12, .22, .12], position: [0, -.16, .52], colour: 0x52666e },
    ...[-.11, .11].flatMap(x => [-.08, .24].map(y => ({
      size: [.045, .045, .018] as const, position: [x, y, .047] as const, colour: 0x9ba9aa,
    }))),
  ]);
  const housing = bake('containment-surveillance-shared-camera-housing', [
    { size: [.48, .3, .66], position: [0, 0, .15], colour: 0xbac9c9 },
    { size: [.58, .05, .8], position: [0, .18, .19], colour: 0xd3dede },
    { size: [.04, .25, .69], position: [-.265, .025, .18], colour: 0x536a75 },
    { size: [.04, .25, .69], position: [.265, .025, .18], colour: 0x536a75 },
    { size: [.45, .27, .035], position: [0, 0, .498], colour: 0x15262e },
    { size: [.36, .06, .46], position: [0, -.18, .12], colour: 0x425c68 },
    ...[0, 1, 2, 3].map(index => ({ size: [.25, .018, .015] as const,
      position: [0, -.06 + index * .05, -.187] as const, colour: 0x1c3038 })),
    { shape: 'cylinder', size: [.16, .13, .16], position: [0, 0, .55], rotation: [Math.PI / 2, 0, 0], colour: 0x213b46 },
    { shape: 'cylinder', size: [.18, .05, .18], position: [0, 0, .622], rotation: [Math.PI / 2, 0, 0], colour: 0x859a9f },
    ...[-.295, .295].map(x => ({ shape: 'cylinder' as const, size: [.11, .07, .11] as const,
      position: [x, -.025, .02] as const, rotation: [0, 0, Math.PI / 2] as const, colour: 0x405c68 })),
  ]);
  const indicators = bake('containment-surveillance-shared-optics', [
    { shape: 'cylinder', size: [.132, .014, .132], position: [0, 0, .654], rotation: [Math.PI / 2, 0, 0], colour: 0x112832 },
    { shape: 'cylinder', size: [.069, .016, .069], position: [0, 0, .662], rotation: [Math.PI / 2, 0, 0], colour: 0x448899 },
    { size: [.034, .034, .02], position: [.181, .075, .526], colour: 0xff4557 },
  ]);
  boxes.dispose(); cylinders.dispose();
  return [mount, housing, indicators];
}
