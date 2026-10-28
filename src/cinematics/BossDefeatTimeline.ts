import * as THREE from 'three';
import { FINAL_ARENA, FINAL_ARENA_RING } from '../boss/FinalBossConfig.ts';

export type EndingSlime = 'bob' | 'goop' | 'volt';
export const ENDING_TIMING = Object.freeze({
  charge: 4, bossCharge: 9, fire: 12, specimenFire: 13.45, impact: 13.67, strain: 17, escalation: 22, orbit: 26, explosion: 31,
  split: 31.25, landing: 32.65, bossDrop: 34, bossLost: 39, regroup: 39, together: 44, drones: 52,
  sacrifice: 60, protest: 64.7, insist: 66.8, leave: 71, returnFire: 71.65,
  lookBack: 77.5, goodbye: 80.5, goodbyeEnd: 83.2, runAgain: 84, hideGoop: 84,
  destruction: 94, black: 105, daylight: 111, sky: 127, credits: 133, duration: 179,
});
export const ENDING_DIALOGUE = Object.freeze([
  { start: 46, end: 50.5, speaker: 'volt', text: 'We need to get out of here quickly!' },
  { start: ENDING_TIMING.sacrifice, end: 64.3, speaker: 'goop', text: 'I’ll hold them off! Go, now!' },
  { start: ENDING_TIMING.protest, end: 66.2, speaker: 'volt', text: 'But—' },
  { start: ENDING_TIMING.insist, end: 69.3, speaker: 'goop', text: 'I SAID GO!' },
  { start: ENDING_TIMING.goodbye, end: ENDING_TIMING.goodbyeEnd, speaker: 'goop', text: 'Goodbye… my friends.' },
] as const);
export const ENDING_ANCHOR = new THREE.Vector3(0, 2.05, FINAL_ARENA.centreZ - FINAL_ARENA_RING.radius);
export const ENDING_EXIT_Z = 110;
export const endingProgress = (t: number, a: number, b: number): number => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const ease = (t: number, a: number, b: number) => THREE.MathUtils.smoothstep(t, a, b);
const LANDED = { bob: [-17, -1], goop: [16, 1], volt: [1, -13] } as const;
const MEET = { bob: [-1.7, -6], goop: [1.6, -5], volt: [.2, -8] } as const;

export function endingShot(t: number): string {
  const T = ENDING_TIMING;
  if (t < T.charge) return 'broken-machine';
  if (t < T.bossCharge) return 'specimen-charge';
  if (t < T.fire) return 'last-reserve';
  if (t < T.specimenFire - .3) return 'boss-beam-launch';
  if (t < T.impact + .7) return 'specimen-beam-launch';
  if (t < T.strain) return 'equal-force';
  if (t < T.escalation) return Math.floor((t - T.strain) / 1.3) % 2 ? 'boss-strain' : 'specimen-strain';
  if (t < T.orbit) return 'battlefield-deadlock';
  if (t < T.explosion) return 'collision-orbit';
  if (t < T.bossDrop) return 'violent-separation';
  if (t < T.bossLost) return 'wreck-falls';
  if (t < T.together) return 'regroup';
  if (t < T.drones) return 'collapse-warning';
  if (t < T.sacrifice - 3) return 'reinforcements-arrive';
  if (t < T.leave) return 'goop-decides';
  if (t < T.lookBack) return 'escape';
  if (t < T.runAgain) return 'one-last-look';
  if (t < T.destruction) return 'catching-up';
  if (t < T.black) return 'facility-collapse';
  if (t < T.daylight) return 'silence';
  if (t < T.sky) return 'first-sunlight';
  if (t < T.credits) return 'open-sky';
  return 'credits';
}

export function endingBeamCollision(t: number, source: THREE.Vector3, target: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  // Both emitters always match power. Displacement is small, reversible and bounded.
  const sway = Math.sin(t * 2.4) * .55 + Math.sin(t * 5.7) * .15;
  return out.lerpVectors(source, target, .5 + sway / Math.max(1, source.distanceTo(target)));
}

export function sampleEndingSlime(id: EndingSlime, t: number, out: THREE.Vector3): { visible: boolean; airborne: boolean; facing: number } {
  const T = ENDING_TIMING, land = LANDED[id], meet = MEET[id];
  out.copy(ENDING_ANCHOR); out.y = .87;
  let airborne = false, facing = 0;
  if (t < T.regroup) {
    const p = endingProgress(t, T.split, T.landing);
    out.x += land[0] * p; out.z += land[1] * p;
    out.y += 5.2 * 4 * p * (1 - p); airborne = t > T.split && t < T.landing;
    facing = Math.atan2(-land[0], -land[1]);
  } else {
    const p = ease(t, T.regroup, T.together);
    out.x += THREE.MathUtils.lerp(land[0], meet[0], p); out.z += THREE.MathUtils.lerp(land[1], meet[1], p);
    facing = p < 1 ? Math.atan2(land[0] - meet[0], land[1] - meet[1]) : Math.PI;
  }
  if (t >= T.drones && t < T.sacrifice) facing = -Math.PI * .5;
  if (id === 'goop') {
    if (t >= T.sacrifice && t < T.leave) facing = 0;
    if (t >= T.leave) {
      const dodge = t >= T.returnFire ? Math.sin((t - T.returnFire) * 2.5) : 0;
      out.x = 4 + dodge * .18; out.z = ENDING_ANCHOR.z - 4 + dodge * .48;
      facing = -Math.PI * .5;
    }
  } else if (t >= T.leave && t < T.daylight) {
    const travel = Math.max(0, t - T.leave), speed = 2.9;
    let distance = travel * speed;
    out.x = id === 'bob' ? -1.6 : 1.2;
    facing = 0;
    if (id === 'bob') {
      const looking = t >= T.lookBack && t < T.runAgain;
      if (looking) {
        const stop = endingProgress(t, T.lookBack, T.lookBack + .55);
        distance = (T.lookBack - T.leave) * speed + speed * .55 * (stop - stop * stop / 2);
        facing = Math.PI * ease(t, T.lookBack + .65, T.lookBack + 1.85);
      } else {
        if (t >= T.runAgain) {
          const age = t - T.runAgain, ramp = age < .4 ? age * age / .8 : age - .2;
          distance = Math.min((T.lookBack - T.leave) * speed + speed * .275 + ramp * 7.1, travel * speed - .8);
          facing = Math.PI * (1 - ease(t, T.runAgain, T.runAgain + .4));
        }
        const phase = t < T.lookBack ? (t - T.leave) / (T.lookBack - T.leave) * Math.PI * 8 : (t - T.runAgain) * 7;
        const hop = Math.sin(phase); out.y += Math.max(0, hop) * .65; airborne = hop > 0;
      }
    }
    out.z = ENDING_ANCHOR.z - 8 - distance;
    out.z = Math.max(ENDING_EXIT_Z + 2.5, out.z);
  } else if (t >= T.daylight) {
    const p = ease(t, T.daylight, T.daylight + 10);
    out.set(id === 'bob' ? -1.5 : 1.4, .87, THREE.MathUtils.lerp(ENDING_EXIT_Z + 5, ENDING_EXIT_Z - 17, p));
    out.y -= .62 * (1 - THREE.MathUtils.smoothstep(out.z, ENDING_EXIT_Z - 2.2, ENDING_EXIT_Z - 1.2));
    facing = t < T.daylight + 9 ? 0 : (id === 'bob' ? -.2 : .2);
    if (id === 'bob' && t < T.daylight + 7) { const hop = Math.sin((t - T.daylight) * 5); out.y += Math.max(0, hop) * .4; airborne = hop > 0; }
  }
  // The stationary group shares eye-lines rather than all staring past one
  // another. The headings use the presentations' authored local -Z forward.
  if (t >= T.together && t < T.drones || t >= T.sacrifice && t < T.leave) {
    const target = t < T.drones
      ? id === 'volt' ? [(MEET.bob[0] + MEET.goop[0]) / 2, (MEET.bob[1] + MEET.goop[1]) / 2] : MEET.volt
      : id === 'goop' ? [(MEET.bob[0] + MEET.volt[0]) / 2, (MEET.bob[1] + MEET.volt[1]) / 2] : MEET.goop;
    facing = Math.atan2(out.x - ENDING_ANCHOR.x - target[0]!, out.z - ENDING_ANCHOR.z - target[1]!);
  }
  return { visible: t >= T.split && (id !== 'goop' || t < T.hideGoop), airborne, facing };
}

export function sampleEndingBossWreck(t: number, out: THREE.Vector3): THREE.Vector3 {
  const age = Math.max(0, t - ENDING_TIMING.explosion);
  return out.set(Math.sin(age * .8) * age * .8, 12 + age * 2 - 3.2 * age * age, FINAL_ARENA.centreZ - 20 + age * 1.4);
}
export const ENDING_DRONE_BAYS = Object.freeze(Array.from({ length: 6 }, (_, group) => {
  const angle = -.65 + group * .07;
  return Object.freeze({ angle, x: Math.cos(angle) * 96, y: 11 + group * 1.2, z: FINAL_ARENA.centreZ + Math.sin(angle) * 96 });
}));
export function endingDroneEntryTime(index: number): number { return ENDING_TIMING.drones + Math.floor(index / 4) * 1.2 + index % 4 * .45; }
export function endingDroneDeathTime(index: number): number {
  if (index % 4 === 0) return ENDING_TIMING.leave + 2 + Math.floor(index / 4) * 1.5;
  if (index % 4 === 1) return ENDING_TIMING.goodbye + 2 + Math.floor(index / 4) * 1.4;
  return Infinity;
}
export function sampleEndingDrone(index: number, t: number, out: THREE.Vector3): boolean {
  const start = endingDroneEntryTime(index), age = t - start;
  const group = Math.floor(index / 4), lane = index % 4;
  const bay = ENDING_DRONE_BAYS[group]!, side = (lane - 1.5) * .45;
  const exit = THREE.MathUtils.clamp(age / 1.6, 0, 1), p = ease(t, start + 1.6, start + 17);
  out.set(THREE.MathUtils.lerp(bay.x - Math.cos(bay.angle) * exit * 6 - Math.sin(bay.angle) * side, 17 + group * 3 + lane * 1.2, p),
    THREE.MathUtils.lerp(bay.y + (lane % 2 ? .5 : -.5), 3.4 + lane * .9, p),
    THREE.MathUtils.lerp(bay.z - Math.sin(bay.angle) * exit * 6 + Math.cos(bay.angle) * side, ENDING_ANCHOR.z + (lane - 1.5) * 3.3 + group * 2, p));
  out.x += Math.sin(age * 1.1 + index * 2.1) * .35 * p;
  out.y += Math.sin(age * 1.7 + index) * .25 * p;
  return age >= 0 && t < endingDroneDeathTime(index) && t < ENDING_TIMING.destruction;
}

export function sampleEndingIncomingShot(index: number, launch: number, from: THREE.Vector3, to: THREE.Vector3): boolean {
  if (launch < ENDING_TIMING.returnFire || launch >= ENDING_TIMING.hideGoop || !sampleEndingDrone(index, launch, from)) return false;
  sampleEndingSlime('goop', launch + .65, to);
  const dx = to.x - from.x, dz = to.z - from.z, distance = Math.max(.1, Math.hypot(dx, dz));
  const miss = (index % 2 ? 1 : -1) * (1.35 + index % 3 * .12);
  to.x += -dz / distance * miss + dx / distance * 3.5;
  to.z += dx / distance * miss + dz / distance * 3.5;
  to.y = FINAL_ARENA.floorY + .08; from.y -= .1;
  return true;
}

export function endingGoopHitTime(index: number): number { return ENDING_TIMING.returnFire + 3.2 + index * 3.4; }
export function sampleEndingGoopHit(index: number, from: THREE.Vector3, to: THREE.Vector3): void {
  const hit = endingGoopHitTime(index); sampleEndingDrone(2 + index * 4, hit - .55, from);
  sampleEndingSlime('goop', hit, to); to.x += .28; to.y += .48; from.y -= .1;
}
export function endingCollapseBlastTime(index: number): number { return ENDING_TIMING.destruction + .3 + index * .7; }
export function endingCollapseBlastPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
  const a = .08 + (index % 6) * .24;
  return out.set(Math.cos(a) * 92, 9 + index * 17 % 61, FINAL_ARENA.centreZ + Math.sin(a) * 92);
}
