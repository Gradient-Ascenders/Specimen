import type { FinalePoint } from './ContainmentFinaleTimeline.ts';
import { finaleTime as F } from './ContainmentFinaleTiming.ts';

/** Metres and seconds, using the same kind of gravity/impulses as a controlled jump. */
export const FINALE_JUMP_GRAVITY = 12;
export const FINALE_DRONE_HOVER: FinalePoint = [-3.3, 95.2, 121.2];
export const FINALE_BUTTON_START: FinalePoint = [-10, 97.95, 130.55];
const LEDGE_LANDING: FinalePoint = [-10, 97.95, 130.1];
const LEDGE_EDGE: FinalePoint = [-10, 97.95, 125.95];
const BOUNCE_PLATFORM: FinalePoint = [-9.5, 96.21, 121.5];
export const FINALE_PLATFORM_LAUNCH: FinalePoint = [-7.65, 96.21, 122.75];
const DRONE_DECK: FinalePoint = [FINALE_DRONE_HOVER[0], FINALE_DRONE_HOVER[1] + .96, FINALE_DRONE_HOVER[2]];
const REST_PLATFORM: FinalePoint = [-.68, 81.542, 115.652];
const REST_EDGE: FinalePoint = [-2.85, 81.542, 115.3];
const FLOOR: FinalePoint = [-5, 75.21, 115];

export interface FinaleJump {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly from: FinalePoint;
  readonly to: FinalePoint;
  readonly chargeStart: number;
  readonly charge: number;
  readonly wallLanding?: boolean;
}
export const FINALE_BOB_JUMPS: readonly FinaleJump[] = [
  { id: 'ledge-jump', start: F(38), end: F(39.25), from: LEDGE_EDGE, to: BOUNCE_PLATFORM, chargeStart: F(37.55), charge: .55 },
  { id: 'drone-jump', start: F(47), end: F(48.05), from: FINALE_PLATFORM_LAUNCH, to: DRONE_DECK, chargeStart: F(46.35), charge: .85 },
  { id: 'drone-dismount', start: F(56.8), end: F(58.4), from: DRONE_DECK, to: REST_PLATFORM, chargeStart: F(56.4), charge: .25 },
  { id: 'floor-jump', start: F(59.7), end: F(61.15), from: REST_EDGE, to: FLOOR, chargeStart: F(59.3), charge: .35 },
  { id: 'vent-dive', start: F(79.5), end: F(80.4), from: [0,75.21,136.45], to: [-.25,73.6,138.5], chargeStart: F(79.15), charge: .4 },
];
export const FINALE_GOOP_DIVE: FinaleJump = {
  id:'goop-vent-dive',start:F(78.3),end:F(79.2),from:[0,75.21,136.45],to:[.25,73.6,138.5],chargeStart:F(78),charge:.4,
};

export function finaleJumpVelocity(jump: FinaleJump, seconds: number): FinalePoint {
  const duration = jump.end - jump.start, age = Math.max(0, Math.min(duration, seconds - jump.start));
  return [(jump.to[0] - jump.from[0]) / duration,
    (jump.to[1] - jump.from[1]) / duration + FINALE_JUMP_GRAVITY * duration / 2 - FINALE_JUMP_GRAVITY * age,
    (jump.to[2] - jump.from[2]) / duration];
}

export function finaleJumpPosition(jump: FinaleJump, t: number): FinalePoint {
  const duration = jump.end - jump.start, age = Math.max(0, Math.min(duration, t - jump.start)), u = age / duration;
  return [jump.from[0] + (jump.to[0] - jump.from[0]) * u,
    jump.from[1] + (jump.to[1] - jump.from[1]) * u + FINALE_JUMP_GRAVITY / 2 * age * (duration - age),
    jump.from[2] + (jump.to[2] - jump.from[2]) * u];
}

interface TravelKey { readonly t: number; readonly p: FinalePoint }
/** C1-continuous ground travel: intermediate waypoints do not stop the actor. */
export function finaleGroundTravel(keys: readonly TravelKey[], t: number): FinalePoint {
  for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) {
    const a = keys[i - 1], b = keys[i], duration = b.t - a.t;
    const u = Math.max(0, Math.min(1, (t - a.t) / duration)), u2 = u * u, u3 = u2 * u;
    const before = keys[Math.max(0, i - 2)], after = keys[Math.min(keys.length - 1, i + 1)];
    const same=(p:FinalePoint,q:FinalePoint)=>p[0]===q[0]&&p[1]===q[1]&&p[2]===q[2];
    const stationary=same(a.p,b.p);
    return a.p.map((value, axis) => {
      const entry=i===1||stationary||same(before.p,a.p)?0:(b.p[axis]-before.p[axis])/(b.t-before.t);
      const exit=i===keys.length-1||stationary||same(b.p,after.p)?0:(after.p[axis]-value)/(after.t-a.t);
      return (2*u3-3*u2+1)*value + (u3-2*u2+u)*duration*entry + (-2*u3+3*u2)*b.p[axis] + (u3-u2)*duration*exit;
    }) as unknown as FinalePoint;
  }
  return keys[keys.length - 1].p;
}
const LEDGE_WALK = [{ t: 2.8, p: FINALE_BUTTON_START }, { t: 3.4, p: LEDGE_LANDING }, { t: 9.8, p: LEDGE_EDGE }];
// A measured walk to the platform lip, followed by a planted charge. There is
// no wall detour: the nearby drone is already within a normal charged jump.
const PLATFORM_WALK = [{ t: F(39.25), p: BOUNCE_PLATFORM }, { t: F(41.55), p: FINALE_PLATFORM_LAUNCH }];
const REST_WALK = [{ t: F(58.4), p: REST_PLATFORM }, { t: F(59.3), p: REST_EDGE }];
const ESCAPE = [
  { t: F(70.35), p: FLOOR }, { t: F(72.5), p: [-.05,75.21,122.8] as FinalePoint },
  { t: F(74.3), p: [0,75.21,127.7] as FinalePoint }, { t:F(76.5),p:[0,75.21,132.5] as FinalePoint },
  { t:F(78.3),p:[0,75.21,134.8] as FinalePoint },
  { t:F(79.15),p:[0,75.21,136.45] as FinalePoint },
];

export function sampleFinaleBobMotion(t: number) {
  const jump = FINALE_BOB_JUMPS.find(jump => t >= jump.start && t < jump.end);
  const charge = FINALE_BOB_JUMPS.find(jump => t >= jump.chargeStart && t < jump.start);
  let position: FinalePoint = FINALE_BUTTON_START;
  if (jump) position = finaleJumpPosition(jump, t);
  else if (t >= F(80.4)) {
    // Continue the dive with its existing downward velocity; finish unseen under the fade.
    const age = t - F(80.4), y = Math.max(68, 73.6 + finaleJumpVelocity(FINALE_BOB_JUMPS.at(-1)!,F(80.4))[1]*age - 6*age*age);
    const u=Math.max(0,Math.min(1,age/.6)),drift=u*u*(3-2*u);
    position = [-.25-.45*drift,y,138.5-.4*drift];
  } else if (t >= F(70.35)) position = finaleGroundTravel(ESCAPE,t);
  else if (t >= F(61.15)) position = FLOOR;
  else if (t >= F(58.4)) position = finaleGroundTravel(REST_WALK,t);
  else if (t >= F(48.05)) position = DRONE_DECK;
  else if (t >= F(39.25)) position = finaleGroundTravel(PLATFORM_WALK,t);
  else if (t >= 2.8) position = finaleGroundTravel(LEDGE_WALK,t);
  return { position, airborne: !!jump || t >= F(80.4), attached: false,
    charging: !!charge, charge: charge ? charge.charge * (t-charge.chargeStart)/(charge.start-charge.chargeStart) : 0 };
}
