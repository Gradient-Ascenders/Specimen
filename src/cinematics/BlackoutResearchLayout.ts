import * as THREE from 'three';
import { FINAL_MERGE_ANCHOR } from '../boss/FinalBossConfig.ts';

export const RESEARCH_WING_ORIGIN = new THREE.Vector3(-16, 26, FINAL_MERGE_ANCHOR.z - 6 - 111.3);
export const RESEARCH_HALL_EXTENSION = 24;
export function researchLocalZ(z: number): number {
  return z - RESEARCH_HALL_EXTENSION * THREE.MathUtils.clamp((84 - z) / 54, 0, 1);
}
export function researchWorldPoint(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, y, researchLocalZ(z)).add(RESEARCH_WING_ORIGIN);
}
export const RESEARCH_GLASS = new THREE.Vector3(16, 4.9, 111.3);
export const RESEARCH_OVERLOAD_LAMP = new THREE.Vector3(0, 7.7, researchLocalZ(25));
export const RESEARCH_GALLERY_PORTS = Object.freeze([
  new THREE.Vector3(-5.6, 5.1, researchLocalZ(-4)), new THREE.Vector3(5.6, 5.1, researchLocalZ(-4)),
]);
export const RESEARCH_HALL_PORTS = Object.freeze([
  new THREE.Vector3(10.65, 3.9, researchLocalZ(50)), new THREE.Vector3(21.35, 3.9, researchLocalZ(50)),
]);

export function createResearchObservationCutout(): THREE.Plane[] {
  const min = RESEARCH_WING_ORIGIN.clone().add(new THREE.Vector3(7.7, -.35, 83.7));
  const max = RESEARCH_WING_ORIGIN.clone().add(new THREE.Vector3(24.3, 10.5, 111.8));
  return [new THREE.Plane(new THREE.Vector3(1, 0, 0), -max.x), new THREE.Plane(new THREE.Vector3(-1, 0, 0), min.x),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -max.y), new THREE.Plane(new THREE.Vector3(0, -1, 0), min.y),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -max.z), new THREE.Plane(new THREE.Vector3(0, 0, -1), min.z)];
}
