import * as THREE from 'three';
import { FINAL_ARENA, FINAL_MERGE_ANCHOR } from '../boss/FinalBossConfig.ts';
import { RESEARCH_WING_ORIGIN, researchLocalZ } from './BlackoutResearchLayout.ts';
import { RESEARCH_TIMING as T, researchWindow } from './BlackoutResearchTimeline.ts';

type Point = readonly [number, number, number];
type Anchor = 'bob' | 'group' | 'specimen' | 'arena' | 'pit';
export interface ResearchCameraAnchors { bob: THREE.Vector3; group: THREE.Vector3; specimen: THREE.Vector3; }
interface Shot { start: number; end: number; anchor?: Anchor; targetAnchor?: Anchor;
  eye: Point; to: Point; target: Point; targetTo?: Point; fov: number; region?: 'hall'; }
export const RESEARCH_CAMERA_SHOTS: readonly Shot[] = [
  { start: 0, end: 7, anchor: 'group', eye: [-4.8, 2.7, -2.4], to: [-4.4, 2.3, -2], target: [0, 1.2, 4], fov: 67 },
  { start: 7, end: 19, anchor: 'group', eye: [-3.4, 1.55, 4], to: [-3, 1.45, 3.6], target: [0, .65, 0], fov: 51 },
  { start: 19, end: 25, anchor: 'bob', eye: [-1.3, .9, 2.7], to: [-1, .85, 2.6], target: [0, .4, 0], fov: 41 },
  { start: 25, end: 29.5, eye: [-5.35, 3.3, 12], to: [-5.6, 3.3, 12.3], target: [-7.48, 3.3, 12], fov: 57 },
  { start: 29.5, end: 34, eye: [5.3, 3.3, 19.3], to: [5.5, 3.3, 19], target: [7.48, 3.3, 19], fov: 57 },
  { start: 34, end: 46, eye: [-.9, 3.7, 21.4], to: [0, 4, 23.5], target: [0, 4.2, 30.7], fov: 55 },
  { start: 46, end: 58, eye: [-3.3, 1.6, 28.7], to: [-2.9, 1.5, 28.3], target: [.6, 1.1, 25.4], fov: 49 },
  { start: 58, end: 66, eye: [2.9, 1.55, 28.7], to: [2.6, 1.5, 28.4], target: [-.6, 1, 25.5], fov: 48 },
  { start: 66, end: 74, eye: [-5.5, 5, 29.5], to: [-5.2, 4.7, 29.3], target: [0, 3.8, 4], fov: 69 },
  { start: 74, end: 80, eye: [2, 4.4, 6.5], to: [1.5, 4.2, 7], target: [-5.6, 4.9, -1], fov: 67 },
  { start: 80, end: 91, eye: [-3.4, 2.7, 27.2], to: [-2.8, 2.9, 27.5], target: [0, 4.2, 11], targetTo: [0, 4.1, 21.4], fov: 67 },
  { start: 91, end: 112.2, eye: [.8, 4, 27.5], to: [.35, 4, 27], target: [0, 4.1, 21.4], fov: 58 },
  { start: 112.2, end: T.overload, eye: [-1.8, 1.5, 28.5], to: [-1.6, 1.5, 28.1], target: [1.45, .95, 25], fov: 47 },
  { start: T.overload, end: T.lampBurst, eye: [4.3, 1.6, 28.2], to: [4.1, 1.7, 28.3], target: [.3, 3.7, 25], fov: 80 },
  { start: T.lampBurst, end: T.findThem, eye: [0, 3, 29.5], to: [.3, 3, 29.3], target: [0, 4, 12], fov: 76 },
  { start: T.findThem, end: 133, eye: [.8, 4, 27.5], to: [.35, 4, 27], target: [0, 4.1, 21.4], fov: 58 },
  { start: 133, end: T.chase, eye: [.2, 2.8, 29.5], to: [-.3, 2.7, 29.3], target: [0, 2.2, 10], fov: 78 },
  { start: T.chase, end: 146, anchor: 'group', eye: [-2.2, 1.65, 7.5], to: [-1.8, 1.6, 7], target: [0, .9, 0], fov: 68 },
  { start: 146, end: 152, anchor: 'group', eye: [2.3, 1.8, 6], to: [2, 1.7, 6.5], target: [-.5, 1, 0], fov: 64 },
  { start: 152, end: 164, anchor: 'group', eye: [-2.3, 1.8, 6.5], to: [-2.1, 1.7, 6], target: [0, 1, -4], fov: 65 },
  { start: 164, end: 168, eye: [12.7, 1.6, 91.2], to: [12.9, 1.5, 91.4], target: [16, 1, 89], fov: 65 },
  { start: 168, end: 169.5, eye: [19.3, 1.6, 93.6], to: [19, 1.5, 93.6], target: [16, 1.1, 93.1], fov: 66 },
  { start: 169.5, end: 170, eye: [19, 1.4, 93.7], to: [18.8, 1.45, 93.6], target: [16, 1, 90.7], fov: 58 },
  { start: 170, end: 173.5, eye: [16, 2.7, 62], to: [16, 2.6, 65], target: [16, 3.9, 50], fov: 62, region: 'hall' },
  { start: 173.5, end: 177.3, eye: [16, 2.15, 91.7], to: [16, 2.3, 91.4], target: [16, 3.1, 65], targetTo: [16, 3.1, 76], fov: 65 },
  { start: 177.3, end: 180, eye: [12, 1.6, 93.6], to: [12.2, 1.55, 93.5], target: [16, .9, 89.8], fov: 72 },
  { start: 180, end: 186, eye: [12.6, 1.5, 92], to: [12.9, 1.4, 91.6], target: [17.45, 1, 88.7], fov: 52 },
  { start: 186, end: 189.5, eye: [16.3, 1.25, 91.1], to: [16.1, 1.2, 90.9], target: [14.55, .8, 88.7], fov: 46 },
  { start: 189.5, end: 195, eye: [19.2, 1.4, 92], to: [19, 1.4, 91.7], target: [16, .75, 90.5], fov: 59 },
  { start: 195, end: 205, eye: [12, 2.3, 89.8], to: [12.5, 2, 90.1], target: [16, .8, 92.1], fov: 65 },
  { start: 205, end: 208, eye: [18.2, 1.25, 93.7], to: [17.5, 1.4, 93.7], target: [16, 1, 92.1], fov: 57 },
  { start: 208, end: 213, eye: [12.8, 1.4, 87.4], to: [19.2, 2.3, 86.8], target: [16, 2.5, 92.1], fov: 72 },
  { start: 213, end: 219, eye: [12.8, 1.6, 86.4], to: [19, 1.9, 86.4], target: [16, 2.8, 92.1], fov: 64 },
  { start: 219, end: 222, eye: [19, 3.2, 88.5], to: [18.7, 3.2, 88.7], target: [16, 2.9, 92.1], fov: 58 },
  { start: 222, end: 226, eye: [18.2, 2.8, 89.6], to: [18.3, 3, 89.2], target: [16, 3.1, 73], fov: 69 },
  { start: 226, end: 230, eye: [12.7, 2.5, 90.3], to: [12.8, 2.6, 90.7], target: [16, 3.1, 94.5], fov: 71 },
  { start: 230, end: 236, eye: [19, 3.6, 108], to: [19.1, 3.6, 108.7], target: [16, 2.8, 98], targetTo: [16, 2.8, 106], fov: 69 },
  { start: 236, end: 241.8, eye: [18.3, 5.3, 107.5], to: [18, 5.1, 108.5], targetAnchor: 'pit', target: [0, 5, 0], fov: 70 },
  { start: 241.8, end: 242.6, eye: [20.2, 3.8, 110.4], to: [20, 3.7, 110.3], target: [16, 2.7, 98], targetTo: [16, 2.7, 103], fov: 69 },
  { start: 242.6, end: 243.35, eye: [22, 3.8, 109.4], to: [22.2, 3.6, 109.8], target: [16, 2.7, 108.5], targetTo: [16, 2.8, 110.3], fov: 73 },
  { start: 243.35, end: 244.6, anchor: 'arena', eye: [7, 27.5, 3], to: [7.5, 25.2, 3.3], targetAnchor: 'specimen', target: [0, .7, 0], fov: 69 },
  { start: 244.6, end: T.landing, anchor: 'arena', eye: [9, 18, 3], to: [8, 4.2, 5], targetAnchor: 'specimen', target: [0, .7, 0], fov: 65 },
  { start: T.landing, end: T.turnPursuers, anchor: 'arena', eye: [-6, 2.2, -8], to: [-5.7, 2.3, -8.5], target: [0, 4, 15], fov: 64 },
  { start: T.turnPursuers, end: 256, anchor: 'arena', eye: [-7, 3.5, 7], to: [-6.6, 3.5, 7.5], target: [0, 4, -8], fov: 67 },
  { start: 256, end: T.noticeBoss, anchor: 'pit', eye: [-28, 38, -54], to: [-24, 34, -50], target: [0, .4, 0], fov: 70 },
  { start: T.noticeBoss, end: T.boss, anchor: 'arena', eye: [-11, 3, -7], to: [-10.5, 3.3, -8], target: [0, 3, 55], fov: 71 },
  { start: T.boss, end: 266, anchor: 'arena', eye: [-10, 2.8, -7], to: [-10.5, 3, -8], target: [0, 7, 70], targetTo: [0, 14, 78], fov: 71 },
  { start: 266, end: 271, anchor: 'arena', eye: [-12, 3.5, -8], to: [-12.5, 4.3, -7.5], target: [0, 15, 54], fov: 69 },
  { start: 271, end: T.handback, anchor: 'arena', eye: [9, 5, -3], to: [9.5, 5.4, -2.5], target: [0, 18, 60], fov: 65 },
  { start: T.handback, end: T.duration, anchor: 'arena', eye: [0, 6.3, -11.4], to: [0, 6.3, -11.4], target: [0, 3, 12], fov: 65 },
];
const UP = new THREE.Vector3(0, 1, 0), PIT = new THREE.Vector3(0, 0, FINAL_ARENA.centreZ);

export class BlackoutResearchCamera {
  private readonly eye = new THREE.Vector3(); private readonly target = new THREE.Vector3();
  private readonly origin = new THREE.Vector3(); private readonly endpoint = new THREE.Vector3();
  private readonly look = new THREE.Matrix4(); private readonly quaternion = new THREE.Quaternion();
  sample(t: number, anchors: ResearchCameraAnchors, eye: THREE.Vector3, target: THREE.Vector3): number {
    const shot = RESEARCH_CAMERA_SHOTS.find(s => t < s.end) ?? RESEARCH_CAMERA_SHOTS.at(-1)!;
    const u = researchWindow(t, shot.start, shot.end);
    const origin = (anchor: Anchor | undefined): THREE.Vector3 => anchor === 'arena' ? FINAL_MERGE_ANCHOR : anchor === 'pit' ? PIT : anchor ? anchors[anchor] : RESEARCH_WING_ORIGIN;
    this.origin.copy(origin(shot.anchor));
    eye.fromArray(shot.eye).lerp(this.endpoint.fromArray(shot.to), u).add(this.origin);
    target.fromArray(shot.target).lerp(this.endpoint.fromArray(shot.targetTo ?? shot.target), u).add(origin(shot.targetAnchor ?? shot.anchor));
    if (!shot.anchor) eye.z = RESEARCH_WING_ORIGIN.z + researchLocalZ(eye.z - RESEARCH_WING_ORIGIN.z);
    if (!(shot.targetAnchor ?? shot.anchor)) target.z = RESEARCH_WING_ORIGIN.z + researchLocalZ(target.z - RESEARCH_WING_ORIGIN.z);
    if (t < T.glass) {
      const local = eye.sub(RESEARCH_WING_ORIGIN);
      const hall = shot.region === 'hall' || t >= T.chase && t < T.deadEnd, trap = t >= T.deadEnd && t < T.escape, overlook = t >= T.escape;
      local.x = THREE.MathUtils.clamp(local.x, hall ? 12.7 : trap ? 10.6 : overlook ? 8.7 : -7.3, hall ? 19.3 : trap ? 21.4 : overlook ? 23.3 : 7.3);
      local.z = THREE.MathUtils.clamp(local.z, researchLocalZ(hall ? 30.4 : trap ? 84.5 : overlook ? 95.4 : -1.3), researchLocalZ(hall ? 93.8 : trap ? 94 : overlook ? 110.7 : 30.3));
      eye.add(RESEARCH_WING_ORIGIN);
    }
    return shot.fov;
  }
  present(camera: THREE.PerspectiveCamera, t: number, anchors: ResearchCameraAnchors, savedFov: number): void {
    const fov = this.sample(t, anchors, this.eye, this.target);
    const shock = (at: number, length: number, strength: number): number => t >= at && t < at + length ? strength * (1 - (t - at) / length) : 0;
    const buildup = t >= T.crossfire + 3 && t < T.fusion ? researchWindow(t, T.crossfire + 3, T.fusion) * .5 : 0;
    const machinery = t >= T.pitOpen && t < T.pitClear ? .06 * Math.sin(Math.PI * (t - T.pitOpen) / (T.pitClear - T.pitOpen)) : 0;
    const impact = buildup + machinery + shock(T.collision, .25, .07) + shock(T.fusion, 1.1, .55) + shock(T.ram, .4, .24) + shock(T.glass, .8, .36) + shock(T.landing, .7, .28) + shock(T.pitClear, .7, .14);
    this.eye.x += Math.sin(t * 83) * impact; this.eye.y += Math.cos(t * 71) * impact * .55;
    this.look.lookAt(this.eye, this.target, UP); this.quaternion.setFromRotationMatrix(this.look);
    const handback = researchWindow(t, T.handback, T.duration);
    camera.position.lerpVectors(this.eye, camera.position, handback); camera.quaternion.slerp(this.quaternion, 1 - handback);
    camera.fov = THREE.MathUtils.lerp(fov, savedFov, handback); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
}
