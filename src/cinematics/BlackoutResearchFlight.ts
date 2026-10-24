import * as THREE from 'three';
import { FINAL_MERGE_ANCHOR } from '../boss/FinalBossConfig.ts';
import { RESEARCH_WING_ORIGIN as ORIGIN, researchLocalZ } from './BlackoutResearchLayout.ts';
import { RESEARCH_TIMING as T, researchWindow, researchDroneDeathTime, sampleResearchSpecimen, sampleResearchSpecimenWorld, sampleResearchSlime } from './BlackoutResearchTimeline.ts';

export interface ResearchFlightPose { position: THREE.Vector3; yaw: number; pitch: number; bank: number; visible: boolean; }
const before = new THREE.Vector3(), after = new THREE.Vector3(), specimen = new THREE.Vector3();
export const researchHallLaunchTime = (index: number): number => T.pursuit + Math.floor(index / 2) * .5 + index % 2 * .1;
export const researchHallLaunchZ = (index: number): number => 52.6 - Math.floor(index / 2) * (5.2 / 3);
export const researchGalleryLaunchTime = (index: number): number => T.sentries + Math.floor(index / 2) * 1.5 + index % 2 * .2;

function pursuitProgress(t: number, start: number): number {
  const duration = T.firingLine - start, elapsed = THREE.MathUtils.clamp(t - start, 0, duration);
  const rampIn = .8, rampOut = .6, speed = 1 / (duration - (rampIn + rampOut) / 2);
  if (elapsed < rampIn) return speed * elapsed * elapsed / (2 * rampIn);
  if (elapsed < duration - rampOut) return speed * (elapsed - rampIn / 2);
  const remaining = duration - elapsed; return 1 - speed * remaining * remaining / (2 * rampOut);
}

export function researchSearchTarget(index: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const elapsed = Math.max(0, t - T.search - index * .18), phase = index * 2.399963;
  return out.set(Math.sin(elapsed * (.41 + index * .043) + phase) * 5.5, .035,
    researchLocalZ(15.5 + Math.sin(elapsed * (.27 + index * .021) + phase * .7) * 12.5)).add(ORIGIN);
}

function curve(out: THREE.Vector3, u: number, a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
  const v = 1 - u;
  out.set(a[0]! * v ** 3 + b[0]! * 3 * v * v * u + c[0]! * 3 * v * u * u + d[0]! * u ** 3,
    a[1]! * v ** 3 + b[1]! * 3 * v * v * u + c[1]! * 3 * v * u * u + d[1]! * u ** 3,
    a[2]! * v ** 3 + b[2]! * 3 * v * v * u + c[2]! * 3 * v * u * u + d[2]! * u ** 3);
}

export function sampleResearchDronePosition(index: number, t: number, out: THREE.Vector3): void {
  const side = index % 2 ? 1 : -1, row = Math.floor(index / 2), phase = index * 1.731;
  if (index < 8) {
    if (t < T.chase) {
      const entry = researchGalleryLaunchTime(index);
      const launch = researchWindow(t, entry, entry + 1.3), u = researchWindow(t, entry + 1.3, entry + 9.2);
      const endZ = 14 + row * 4.3;
      curve(out, u, [side * 5.6, 5.1, 2], [side * 5.55, 5.15, 8], [side * 5.55, 4.1, endZ - 4], [side * 5.55, 3.8 + row * .12, endZ]);
      if (t < entry + 1.3) out.z = THREE.MathUtils.lerp(-4, 2, launch);
      out.x += u * Math.sin(t * (.29 + index * .017) + phase) * .14;
      out.y += u * Math.sin(t * (.57 + index * .021) + phase) * .12;
      out.z = researchLocalZ(out.z);
    } else {
      const entry = researchHallLaunchTime(index);
      const emerging = researchWindow(t, entry, entry + .4);
      const fly = pursuitProgress(t, entry);
      out.set(THREE.MathUtils.lerp(16 + side * 5.35, 16 + side * 1.85, emerging),
        3.9 + emerging * (row % 2 ? .55 : -.55),
        THREE.MathUtils.lerp(researchLocalZ(researchHallLaunchZ(index)), researchLocalZ(85.5 - row * 4), fly));
      out.x += Math.sin(t * (.43 + index * .037) + phase) * .13 * emerging * (1 - fly);
      out.y += Math.sin(t * (.68 + index * .043) + phase) * .07 * emerging * (1 - fly);
    }
    out.add(ORIGIN); return;
  }
  const id = index - 8, rank = Math.floor(id / 2), entry = T.ambush + id * .045;
  if (t < T.fall) {
    if (t < T.ram) {
      const u = researchWindow(t, entry, T.ram);
      out.set(16 + side * 1.12, 2.2 + rank * .65, THREE.MathUtils.lerp(93.1 - rank * 2.6, 105.4 - rank * 2.6, u));
    } else {
      sampleResearchSpecimen(t, specimen);
      out.set(16 + side * 1.12, 2.2 + rank * .65, specimen.z - 3.05 - rank * 2.6);
    }
    out.add(ORIGIN); return;
  }
  const u = researchWindow(t, T.fall + id * .08, T.landing + 3.1 + id * .17);
  const endX = side * (rank ? 3.1 : 7), endZ = FINAL_MERGE_ANCHOR.z - 8 + rank * 3.1;
  const startZ = ORIGIN.z + 113 - 3.05 - rank * 2.6;
  curve(out, u, [side * 1.05, ORIGIN.y + 2.2 + rank * .5, startZ],
    [side * (3 + id * .4), ORIGIN.y + 2.6, ORIGIN.z + 117],
    [endX + side, 7 + rank, endZ - 1], [endX, 4.8 + rank * 1.4, endZ]);
  out.y += Math.sin(t * (.46 + id * .07) + phase) * .08 * u;
}

export function sampleResearchDrone(index: number, t: number, out: ResearchFlightPose): void {
  sampleResearchDronePosition(index, t, out.position);
  sampleResearchDronePosition(index, t - .03, before); sampleResearchDronePosition(index, t + .03, after);
  after.sub(before);
  const specimenAimStart = index < 8 ? T.reveal - .4 : T.landing - .7;
  const aimingAtSpecimen = t >= specimenAimStart;
  if (aimingAtSpecimen) {
    sampleResearchSpecimenWorld(t, specimen); specimen.y += .7; specimen.sub(out.position).normalize();
    if (after.lengthSq() < .001) after.copy(specimen);
    else after.normalize().lerp(specimen, researchWindow(t, specimenAimStart, specimenAimStart + .35)).normalize();
  } else if (index < 8 && t < T.chase && t >= researchGalleryLaunchTime(index) + 9.2) {
    if (t >= T.search) researchSearchTarget(index, t, after).sub(out.position);
    else {
      after.set(0, 0, 1);
      if (t >= 108) {
        const lock = researchWindow(t, 108, 109.2);
        const targetYaw = Math.atan2(out.position.x - ORIGIN.x, out.position.z - ORIGIN.z - researchLocalZ(25.6));
        const yaw = Math.PI + Math.atan2(Math.sin(targetYaw - Math.PI), Math.cos(targetYaw - Math.PI)) * lock;
        const pitch = Math.atan2(ORIGIN.y + .85 - out.position.y,
          Math.hypot(out.position.x - ORIGIN.x, out.position.z - ORIGIN.z - researchLocalZ(25.6))) * lock;
        after.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      }
    }
  } else if (index < 8 && t >= T.firingLine - 1.2) {
    sampleResearchSlime('bob', t, specimen); specimen.add(ORIGIN); specimen.y += .35;
    const direction = specimen.sub(out.position).normalize();
    if (after.lengthSq() < .001 || t >= T.firingLine) after.copy(direction);
    else after.normalize().lerp(direction, researchWindow(t, T.firingLine - 1.2, T.firingLine)).normalize();
  } else if (after.lengthSq() < .001) after.set(0, 0, 1);
  const horizontal = Math.hypot(after.x, after.z);
  out.yaw = Math.atan2(-after.x, -after.z);
  out.pitch = THREE.MathUtils.clamp(Math.atan2(after.y, horizontal), aimingAtSpecimen || t >= 108 && t < T.chase || index < 8 && t >= T.firingLine - 1.2 ? -1.35 : -.16, aimingAtSpecimen ? 1.35 : .16);
  out.bank = Math.sin(t * (.47 + index * .033) + index * 1.731) * .024;
  if (index < 8) out.visible = (t >= researchGalleryLaunchTime(index) && t < T.chase || t >= researchHallLaunchTime(index)) && t < researchDroneDeathTime(index);
  else out.visible = t >= T.ambush + (index - 8) * .045 && t < researchDroneDeathTime(index);
}
