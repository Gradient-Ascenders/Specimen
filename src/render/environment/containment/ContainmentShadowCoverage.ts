import * as THREE from 'three';

import type { ContainmentLightingRoomId } from './ContainmentLightingRig.ts';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';

/** Authored finite sources, fitted to traversal and fixture direction. */
export const CONTAINMENT_SHADOW_SOURCES = {
  'room-1-pedestal-soft-key': { size: 1024, near: 0.35 },
  'room-1-fluorescent-a-received-light': { size: 512, near: 0.25 },
  'room-1-fluorescent-b-received-light': { size: 512, near: 0.25 },
  'room-1-to-2-duct-reflected-cue': { size: 256, near: 0.12 },
  'room-1-to-2-duct-low-run-key': { size: 256, near: 0.12 },
  'room-1-to-2-duct-ramp-key': { size: 256, near: 0.12 },
  'room-1-to-2-duct-turn-key': { size: 256, near: 0.12 },
  'room-2-drop-zone-light': { size: 1024, near: 0.35 },
  'room-2-lower-route-light': { size: 1024, near: 0.35 },
  'room-2-sticky-and-exit-route-light': { size: 1024, near: 0.35 },
  'room-3-clinical-entry-received-light': { size: 1024, near: 0.35 },
  'room-3-industrial-route-received-light': { size: 1024, near: 0.35 },
  'room-3-high-exit-vent-cue': { size: 512, near: 0.2 },
  'room-4-lower-amber-received-light': { size: 512, near: 0.3 },
  'room-4-middle-escalation-received-light': { size: 512, near: 0.3 },
  'room-4-upper-arrival-received-light': { size: 512, near: 0.3 },
  'room-5-safe-entry-received-light': { size: 1024, near: 0.35 },
  'room-5-upper-traversal-received-light': { size: 1024, near: 0.35 },
  'room-5-containment-state-light': { size: 512, near: 0.2 },
  'room-5-goop-reveal-rim-light': { size: 512, near: 0.2 },
  'room-5-observation-lever-key': { size: 512, near: 0.2 },
} as const;

export const CONTAINMENT_FIXTURE_AIMS: Readonly<Record<string, readonly [number, number, number]>> = {
  'room-1-fluorescent-a-received-light': [-4.8, 3, 3],
  'room-2-lower-route-light': [0, 7, 43],
  'room-2-sticky-and-exit-route-light': [14, 7, 43],
  'room-3-industrial-route-received-light': [16, 18, 63],
  'room-3-high-exit-vent-cue': [9, 31.2, 79],
  'room-5-upper-traversal-received-light': [18, 82, 116],
};

/** Doorway overlap is spatial presentation, independent of checkpoint/timer state. */
export const CONTAINMENT_SHADOW_HANDOFFS = [
  { rooms: [1, 2], z: 27, halfWidth: 2, minY: 0, maxY: 14 },
  { rooms: [2, 3], z: 49, halfWidth: 2, minY: 9, maxY: 15 },
  { rooms: [3, 4], z: 79.5, halfWidth: 1.5, minY: 29, maxY: 35 },
  { rooms: [4, 5], z: 91.5, halfWidth: 2, minY: 73, maxY: 79 },
] as const;

export function containmentRoomLightWeights(
  roomId: ContainmentLightingRoomId,
  position?: Vector3State,
): ReadonlyMap<ContainmentLightingRoomId, number> {
  if (position) {
    for (const handoff of CONTAINMENT_SHADOW_HANDOFFS) {
      if (position.y < handoff.minY || position.y > handoff.maxY) continue;
      if (Math.abs(position.z - handoff.z) > handoff.halfWidth) continue;
      const t = THREE.MathUtils.smoothstep(
        position.z, handoff.z - handoff.halfWidth, handoff.z + handoff.halfWidth,
      );
      return new Map([[handoff.rooms[0], 1 - t], [handoff.rooms[1], t]]);
    }
    // Progression triggers can lag a doorway crossing (notably the Room 2
    // drop). Keep presentation on the physical side after the overlap ends.
    const spatialRoom = position.z >= 91.5 ? 5 : position.z >= 79.5 ? 4
      : position.z >= 49 ? 3 : position.z >= 27 ? 2 : 1;
    return new Map([[spatialRoom, 1]]);
  }
  return new Map([[roomId, 1]]);
}

export function configureContainmentShadow(light: THREE.PointLight | THREE.SpotLight): boolean {
  const source = CONTAINMENT_SHADOW_SOURCES[light.name as keyof typeof CONTAINMENT_SHADOW_SOURCES];
  if (!source) return false;
  light.castShadow = true;
  light.shadow.mapSize.set(source.size, source.size);
  light.shadow.camera.near = source.near;
  // SpotLightShadow.updateMatrices derives far from distance on every update.
  light.shadow.camera.far = light.distance;
  light.shadow.bias = -0.0001;
  light.shadow.normalBias = light instanceof THREE.PointLight ? 0.01 : 0.015;
  light.shadow.radius = 1.5;
  light.shadow.autoUpdate = true;
  // A sphere around a tall wall/shaft can overlap a distant room's light even
  // when every surface lies outside its frustum. Use conservative world boxes
  // for immutable authored structures; retain Three's morph-aware body path.
  const frustum = light.shadow.getFrustum();
  const intersectsObject = frustum.intersectsObject.bind(frustum);
  const boxes = new WeakMap<THREE.Object3D, { matrix: THREE.Matrix4; box: THREE.Box3 }>();
  frustum.intersectsObject = object => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BoxGeometry ||
      object.userData.staticBatchSourceNames || object instanceof THREE.InstancedMesh)) {
      return intersectsObject(object);
    }
    const localBox = object instanceof THREE.InstancedMesh ? object.boundingBox : object.geometry.boundingBox;
    if (!localBox) return intersectsObject(object);
    let cached = boxes.get(object);
    if (!cached) {
      cached = { matrix: object.matrixWorld.clone(), box: localBox.clone().applyMatrix4(object.matrixWorld) };
      boxes.set(object, cached);
    } else if (!cached.matrix.equals(object.matrixWorld)) {
      cached.matrix.copy(object.matrixWorld);
      cached.box.copy(localBox).applyMatrix4(object.matrixWorld);
    }
    // Frustum plane tests alone also admit very large boxes spanning different
    // corners of the cone. Beyond finite emission range no surface can occlude
    // a lit receiver, so reject those boxes before the plane test.
    return cached.box.distanceToPoint(light.shadow.camera.position) <= light.distance &&
      frustum.intersectsBox(cached.box);
  };
  return true;
}

/** Material roles apply BEFORE consolidation; effects and collider-only surfaces are excluded. */
const SOLID_MATERIALS = new Set([
  'containment-main-ceramic', 'containment-secondary-ceramic',
  'containment-clinical-floor', 'containment-graphite-frame',
  'containment-service-metal', 'containment-dark-structural-steel',
  'containment-elevator-composite-tread', 'containment-mechanical-backing',
  'containment-sticky-membrane', 'containment-sticky-vent-membrane',
  'containment-soluble-composite', 'containment-specimen-shell',
  'containment-specimen-shell-interior',
  'room-5-soluble-biological-composite-source',
  'room-5-authoritative-sticky-lever-handle',
]);

const ELEVATOR_SOLIDS = new Set([
  'room-4-cargo-elevator-industrial-roof',
  'room-4-cargo-elevator-graphite-perimeter-seat',
  'room-4-cargo-elevator-underside-longitudinal-load-frame',
  'room-4-cargo-elevator-underside-cross-member',
  'room-4-cargo-elevator-underside-actuator-motor-housing',
  'room-4-cargo-elevator-room5-closed-shutter',
]);

// Unbatched instrument/track details receive the major assembly's shadow but
// do not need independent silhouettes. Keep measured batch membership intact.
const RECEIVER_ONLY_DETAILS = new Set([
  'room-1-pedestal-instrument-dial',
  'room-1-containment-control-face',
  'room-1-containment-feed-flange',
  'room-1-containment-pressure-line-lower-coupling',
  'room-1-containment-pressure-line-upper-coupling',
  'room-1-containment-overhead-service-coupler',
  'room-1-door-secondary-guide-panel',
  'room-1-door-track-actuator',
  'room-1-door-side-status-housing',
  'room-1-door-floor-track',
]);

export function authorContainmentShadowRoles(root: THREE.Object3D): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // Preserve existing measured batching partitions even when roles converge.
    object.userData.staticBatchPartition = `${Number(object.castShadow)}:${Number(object.receiveShadow)}`;
    if (!materials.every(material => material.visible && !material.transparent &&
      (SOLID_MATERIALS.has(material.name) || ELEVATOR_SOLIDS.has(object.name)))) {
      object.castShadow = false;
      object.receiveShadow = false;
      delete object.userData.shadowIntent;
      return;
    }
    object.castShadow = !RECEIVER_ONLY_DETAILS.has(object.name);
    object.receiveShadow = true;
    object.userData.shadowIntent = object.castShadow ? 'solid-caster-and-receiver' : 'detail-receiver';
  });
}

/** Fit bounds to authored immutable box scales without changing GPU geometry.
 * Three's geometry sphere multiplied by the longest scale greatly overestimates
 * long thin panels, submitting distant rooms to otherwise bounded shadow maps.
 * Root translation/rotation remains supported; these box dimensions are fixed.
 */
export function fitContainmentShadowCullingBounds(root: THREE.Object3D): void {
  const size = new THREE.Vector3();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
    if (object instanceof THREE.InstancedMesh) {
      object.computeBoundingBox();
      object.computeBoundingSphere();
      const fitted = object.boundingBox!.getBoundingSphere(new THREE.Sphere());
      if (fitted.radius < object.boundingSphere!.radius) object.boundingSphere!.copy(fitted);
    } else if (object.geometry instanceof THREE.BoxGeometry) {
      const maximumScale = Math.max(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z));
      if (maximumScale === 0) return;
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox!;
      box.getSize(size).multiply(object.scale).multiplyScalar(.5);
      const fitted = new THREE.Sphere(box.getCenter(new THREE.Vector3()), size.length() / maximumScale);
      // Frustum.intersectsObject supports per-object spheres (as on instances).
      (object as THREE.Mesh & { boundingSphere: THREE.Sphere }).boundingSphere = fitted;
    }
  });
}
