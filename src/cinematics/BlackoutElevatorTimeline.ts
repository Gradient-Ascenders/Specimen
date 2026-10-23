import * as THREE from 'three';
import { BLACKOUT_ASCENT_LIFT as V } from '../levels/BlackoutAscentLift.ts';

export type ElevatorSlime = 'bob' | 'goop' | 'volt';
export const elevatorSmooth = (u: number): number => { const x = THREE.MathUtils.clamp(u, 0, 1); return x * x * (3 - 2 * x); };
export const ELEVATOR_DIALOGUE = Object.freeze([
  { start: .8, end: 5, speaker: 'goop', text: 'Might need some of that electricity of yours, Volt.' },
  { start: 5.4, end: 8.5, speaker: 'volt', text: 'When do you ever not need it?' },
  { start: 24, end: 27.1, speaker: 'goop', text: 'This place is a living hell' },
  { start: 28, end: 30.5, speaker: 'volt', text: 'Tell me about it' },
] as const);
export const ELEVATOR_TIMING = Object.freeze({ power: 9.1, powered: 11.3, lift: 12.5, arrival: 44.5, open: 46, exit: 48, handback: 53, duration: 55 });

interface Segment { readonly from: THREE.Vector3; readonly to: THREE.Vector3; readonly start: number; readonly end: number; readonly jump: number; }
export interface ElevatorBoardingRoute { readonly origin: THREE.Vector3; readonly segments: readonly Segment[]; readonly duration: number; }

export function elevatorBoardingRoute(id: ElevatorSlime, position: THREE.Vector3, radius: number): ElevatorBoardingRoute {
  const segments: Segment[] = []; let from = position.clone(), time = .3;
  const add = (to: THREE.Vector3, jump = 0): void => {
    const distance = from.distanceTo(to); if (distance < .01) return;
    const duration = Math.max(.65, distance / 3.7);
    segments.push({ from, to, start: time, end: time + duration, jump }); time += duration; from = to;
  };
  const floor = V.floorY + radius + .01;
  if (position.z < 156.8) {
    if (id === 'volt' && position.x < -6) {
      add(new THREE.Vector3(-16, 2.5 + radius + .01, Math.max(136.5, position.z)));
      add(new THREE.Vector3(0, floor, 145.7));
    } else if (position.y > 3) {
      add(new THREE.Vector3(-1.3, floor, 149.5), 2.5);
    } else if (position.y < .3) {
      add(new THREE.Vector3(-1.4, position.y, 145.5));
      add(new THREE.Vector3(-1.4, floor, 150), 1.1);
    } else if (position.z < 148) add(new THREE.Vector3(-1.4, floor, 150));
    add(new THREE.Vector3(-1.4, floor, 154.1));
    add(new THREE.Vector3(-1.4, floor, 158.3));
  }
  if (position.z < 176.5) add(new THREE.Vector3(V.standing[id].x, floor, 175.5));
  add(new THREE.Vector3(V.standing[id].x, floor, V.standing[id].z));
  return { origin: position.clone(), segments, duration: time + .5 };
}

export function sampleElevatorBoarding(route: ElevatorBoardingRoute, t: number, target: THREE.Vector3): boolean {
  const segment = route.segments.find(s => t < s.end) ?? route.segments.at(-1);
  if (!segment) { target.copy(route.origin); return false; }
  const u = THREE.MathUtils.clamp((t - segment.start) / (segment.end - segment.start), 0, 1);
  target.lerpVectors(segment.from, segment.to, elevatorSmooth(u));
  target.y += Math.sin(Math.PI * u) * segment.jump;
  return segment.jump > 0 && u > 0 && u < 1;
}

export function elevatorTravel(t: number): number {
  const duration = ELEVATOR_TIMING.arrival - ELEVATOR_TIMING.lift;
  const seconds = THREE.MathUtils.clamp(t - ELEVATOR_TIMING.lift, 0, duration);
  const ramp = 3, speed = 2.4;
  if (seconds < ramp) return speed * seconds * seconds / (2 * ramp);
  const cruise = speed * (seconds - ramp / 2);
  const brake = Math.max(0, seconds - (duration - ramp));
  return cruise - speed * brake * brake / (2 * ramp);
}

export function elevatorShot(t: number): string {
  if (t < 0) return 'boarding';
  if (t < ELEVATOR_TIMING.power) return 'power-request';
  if (t < ELEVATOR_TIMING.lift + 1) return 'outlet';
  if (t < 22) return 'ascent-wide';
  if (t < 32) return 'quiet-conversation';
  if (t < 40) return 'passing-lights';
  if (t < ELEVATOR_TIMING.exit) return 'lab-arrival';
  return 'lab-handoff';
}
