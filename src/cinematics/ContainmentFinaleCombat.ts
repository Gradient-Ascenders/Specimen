import type { FinalePoint } from './ContainmentFinaleTimeline.ts';
import { CONTAINMENT_FINALE_TIMING as T } from './ContainmentFinaleTiming.ts';
import { FINALE_DRONE_HOVER, finaleGroundTravel, finaleJumpPosition, type FinaleJump } from './ContainmentFinaleBobMotion.ts';

const FLOOR = 75.21;
const point = (x: number, z: number): FinalePoint => [x, FLOOR, z];
const key = (age: number, p: FinalePoint) => ({ t: T.combat + age, p });
// Stay to the left of the real containment cell and below the traversal route.
// The holds before each leap let the authored gel animation visibly compress.
const GOOP_PATH = [
  key(0, point(-5.2,105.5)), key(.65,point(-5.6,105.2)), key(.95,point(-5.6,105.2)),
  key(2.05,point(-10.4,101.3)), key(3.7,point(-12.4,103.9)),
  key(5.3,point(-10.6,107.8)), key(5.65,point(-10.6,107.8)), key(7.1,point(-5.2,110.6)),
  key(8.7,point(-6.7,112.2)), key(10.8,point(-12,110.8)),
  key(12.65,point(-13.2,105)), key(13,point(-13.2,105)), key(14.2,point(-8.3,100.1)),
  key(15.95,point(-6.5,100.1)), key(16.3,point(-6.5,100.1)), key(17.5,point(-10.8,104.4)),
  key(19.65,point(-13.5,111.2)), key(20,point(-13.5,111.2)), key(21.35,point(-8.5,112.1)),
  key(24,point(-7.2,108)), key(27.8,point(-5.2,105.5)), key(29.8,point(-5.2,105.5)),
];
const dodge = (id: string, start: number, end: number, from: FinalePoint, to: FinalePoint, windup: number): FinaleJump => ({
  id, start:T.combat+start, end:T.combat+end, from, to, chargeStart:T.combat+start-windup, charge:.55,
});
export const FINALE_GOOP_DODGES: readonly FinaleJump[] = [
  dodge('first-evasion',.95,2.05,point(-5.6,105.2),point(-10.4,101.3),.3),
  dodge('return-fire-leap',5.65,7.1,point(-10.6,107.8),point(-5.2,110.6),.35),
  dodge('cross-floor-leap',13,14.2,point(-13.2,105),point(-8.3,100.1),.35),
  dodge('second-evasion',16.3,17.5,point(-6.5,100.1),point(-10.8,104.4),.35),
  dodge('last-evasion',20,21.35,point(-13.5,111.2),point(-8.5,112.1),.35),
];

export function sampleFinaleGoopCombat(t: number) {
  const jump = FINALE_GOOP_DODGES.find(jump => t>=jump.start && t<jump.end);
  const charge = FINALE_GOOP_DODGES.find(jump => t>=jump.chargeStart && t<jump.start);
  return { position: jump ? finaleJumpPosition(jump,t) : finaleGroundTravel(GOOP_PATH,t),
    airborne: !!jump, charging: !!charge,
    charge: charge ? charge.charge*(t-charge.chargeStart)/(charge.start-charge.chargeStart) : 0 };
}

const DRONE_PATH = [
  key(0,[-7.5,87.5,104]), key(1.5,[-13,85.5,105]), key(3.8,[-9,83.8,111]),
  key(6,[-2,88.5,118]), key(8.2,FINALE_DRONE_HOVER), key(10,FINALE_DRONE_HOVER),
  key(11.8,[-8.8,90.5,117.4]), key(14,[-13.2,85.5,110.7]),
  key(16.4,[-11.7,89.7,101.5]), key(18.3,[-6.5,94,110.5]),
  key(19.5,FINALE_DRONE_HOVER), key(22.05,FINALE_DRONE_HOVER),
];
/** Broad, continuous strafing passes, then a stable deck for Bob's real jump. */
export function sampleFinaleDroneCombat(t: number): FinalePoint {
  return finaleGroundTravel(DRONE_PATH,t);
}
