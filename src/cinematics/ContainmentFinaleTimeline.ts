import { FINALE_BUTTON_START, FINALE_GOOP_DIVE, sampleFinaleBobMotion, finaleGroundTravel, finaleJumpPosition, finaleJumpVelocity } from './ContainmentFinaleBobMotion.ts';
import { ROOM_FIVE_ESCAPE } from '../levels/RoomFiveEscapeLayout.ts';
import { CONTAINMENT_FINALE_TIMING, FINALE_REINFORCEMENT_INTERVAL, finaleTime as F } from './ContainmentFinaleTiming.ts';
import { sampleFinaleGoopCombat, sampleFinaleDroneCombat } from './ContainmentFinaleCombat.ts';
export { CONTAINMENT_FINALE_TIMING } from './ContainmentFinaleTiming.ts';
export type FinalePoint = readonly [number, number, number];
export const FINALE_BOB_START: FinalePoint = FINALE_BUTTON_START;
export const FINALE_GOOP_START: FinalePoint = [0, 76.546, 110];
export const FINALE_VENT = ROOM_FIVE_ESCAPE.drop;

interface Key { t: number; p: FinalePoint; arc?: number }
const GOOP_KEYS: readonly Key[] = [
  { t: 0, p: FINALE_GOOP_START }, { t: 5.3, p: FINALE_GOOP_START },
  { t: 7.5, p: [0, 76.03, 106.5], arc: .6 },
  { t: 9.5, p: [-5.2, 75.21, 105.5], arc: .3 }, { t: F(26), p: [-5.2, 75.21, 105.5] },
  { t: F(54.8), p: [-5.2, 75.21, 105.5] }, { t: F(57.5), p: [-3.6, 75.21, 106] },
  { t: F(60.5), p: [-3.6, 75.21, 111.5] }, { t: F(61.8), p: [-3.6, 75.21, 114.5] },
  { t: F(69.9), p: [-3.6, 75.21, 114.5] },
];
const GOOP_ESCAPE = [
  {t:F(69.9),p:[-3.6,75.21,114.5] as FinalePoint}, {t:F(71.8),p:[-.15,75.21,122] as FinalePoint},
  {t:F(73),p:[0,75.21,126.2] as FinalePoint}, {t:F(74.8),p:[0,75.21,131.5] as FinalePoint},
  {t:F(78),p:[0,75.21,136.45] as FinalePoint},
];
interface Shot {
  readonly id: string; readonly start: number; readonly end: number;
  readonly from: FinalePoint; readonly to?: FinalePoint; readonly target: 'bob' | 'goop' | 'drone' | 'duel' | 'pov-bob' | 'pov-pan' | 'pov-goop' | FinalePoint;
  readonly fov: number; readonly up?: FinalePoint;
}
const AUTHORED_SHOTS: readonly Shot[] = [
  { id: 'button-close', start: 0, end: 2.8, from: [-12.3,99.25,128.7], to: [-11.8,99.05,129.1], target: [-10,98.45,131.14], fov: 48 },
  { id: 'power-shutdown', start: 2.8, end: 5.3, from: [-15,93,101], to: [-14.5,92.5,102], target: [0,83.2,110], fov: 65 },
  { id: 'cell-release', start: 5.3, end: 9.5, from: [-4.6,79,105.2], to: [-8,77.8,105], target: 'goop', fov: 56 },
  { id: 'goop-looks-up', start: 9.5, end: 12, from: [-7.5,76.5,107], to: [-7.3,76.6,107.2], target: 'goop', fov: 46 },
  { id: 'bob-over-ledge', start: 12, end: 15, from: [-11.3,99,122.3], to: [-11,98.8,122.5], target: 'bob', fov: 43 },
  { id: 'surprise-drone', start: 15, end: 18, from: [-10,95.4,119], to: [-11,96.2,120], target: 'drone', fov: 53 },
  { id: 'scan-bob', start: 18, end: 21, from: [0,0,0], target: 'pov-bob', fov: 27 },
  { id: 'scan-pan', start: 21, end: 22.5, from: [0,0,0], target: 'pov-pan', fov: 41 },
  { id: 'scan-goop', start: 22.5, end: 26, from: [0,0,0], target: 'pov-goop', fov: 24 },
  { id: 'duel-wide', start: 26, end: 32, from: [-17.2,80,92.2], to: [-17.2,81,92.8], target: 'duel', fov: 74 },
  { id: 'goop-dodges', start: 32, end: 34.2, from: [-3.8,77.4,113.3], to: [-3.9,77.6,113.6], target: 'goop', fov: 58 },
  { id: 'drone-near-platform', start: 34.2, end: 36, from: [0,98.5,114.5], to: [.3,98.4,115], target: [-6.8,96.5,123.4], fov: 64 },
  { id: 'bob-sees-opening', start: 36, end: 38, from: [-11.8,98.5,122], to: [-11.5,98.3,122.2], target: 'bob', fov: 40 },
  { id: 'platform-approach', start: 38, end: 43, from: [-3.7,98.7,116], to: [-2.9,97.8,118.5], target: 'bob', fov: 54 },
  { id: 'drone-lines-up', start: 43, end: 46.35, from: [-2.8,97.8,119], to: [-1.5,98,119.3], target: 'drone', fov: 55 },
  { id: 'platform-launch', start: 46.35, end: 47, from: [-3.2,98.4,119], to: [-2.3,97.8,119.5], target: 'bob', fov: 54 },
  { id: 'bob-leaps', start: 47, end: 48.05, from: [.8,97.2,115.8], to: [1,96.5,116.5], target: [-4.6,96.5,122.7], fov: 53 },
  { id: 'drone-panic', start: 48.05, end: 54.8, from: [.5,96.5,117], to: [-.8,95.7,117.8], target: 'drone', fov: 49 },
  { id: 'goop-clean-shot', start: 54.8, end: 56.6, from: [-8,77.2,107.5], to: [-7.8,77,107.3], target: 'goop', fov: 48 },
  { id: 'drone-destruction', start: 56.6, end: 57.5, from: [-6.3,95.4,117.7], to: [-6.6,94.6,118], target: 'drone', fov: 56 },
  { id: 'bob-falling', start: 57.5, end: 58.4, from: [-8,91,118], to: [-7.5,84,118], target: 'bob', fov: 56 },
  { id: 'bob-safe-landing', start: 58.4, end: 61.8, from: [-7,83,120], to: [-7,77.2,119], target: 'bob', fov: 52 },
  { id: 'quiet-two-shot', start: 61.8, end: 65.9, from: [-6.6,76.3,118], to: [-6.3,76.2,117.7], target: [-4.25,75.5,114.75], fov: 41 },
  { id: 'reinforcement-reveal', start: 65.9, end: 67.5, from: [4.4,78.2,107], to: [4.7,78.4,106.5], target: [9,76.8,92.5], fov: 59 },
  { id: 'goop-spots-vent', start: 67.5, end: 68.9, from: [-1.8,76.1,117.4], to: [-1.7,76.05,117.8], target:'goop', fov:47 },
  { id: 'acid-opens-vent', start: 68.9, end: 72, from: [-4.8,76.1,118.5], to: [-3.6,75.8,120], target:ROOM_FIVE_ESCAPE.coverPosition, fov:54 },
  { id: 'escape-tracking', start: 72, end: 75, from: [1.1,75.95,129.5], to: [1.1,75.95,134.3], target:'goop', fov:61 },
  { id: 'drones-denied', start:75,end:76.4,from:[0,75.9,127.1],to:[0,75.9,127.4],target:[0,75.9,122.2],fov:61 },
  { id: 'duct-escape',start:76.4,end:78,from:[1.15,76,137.5],to:[1.15,76,140],target:'goop',fov:62 },
  { id: 'vent-dive', start: 78, end: 80.5, from: [1.05,76.15,140.8], to: [1.05,76.15,141], target: [0,75.1,137.6], fov: 68 },
  { id: 'shaft-reverse', start: 80.5, end: 85, from: [0,68.8,138.5], target: [0,76.8,138.1], fov:73,up:[0,0,-1] },
];
export const CONTAINMENT_FINALE_SHOTS: readonly Shot[] = AUTHORED_SHOTS.map(shot => ({
  ...shot, start: F(shot.start), end: F(shot.end),
}));

export function finaleEase(start: number, end: number, seconds: number): number {
  const u = Math.max(0, Math.min(1, (seconds - start) / (end - start)));
  return u * u * (3 - 2 * u);
}
export function finaleMix(a: FinalePoint, b: FinalePoint, u: number): FinalePoint {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
function route(keys: readonly Key[], t: number): FinalePoint {
  for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) {
    const a = keys[i - 1], b = keys[i], u = finaleEase(a.t,b.t,t), p = finaleMix(a.p,b.p,u);
    return [p[0], p[1] + Math.sin(u * Math.PI) * (b.arc ?? 0), p[2]];
  }
  return keys[keys.length - 1].p;
}

export function sampleContainmentFinale(seconds: number, bobStart: FinalePoint = FINALE_BOB_START) {
  const T = CONTAINMENT_FINALE_TIMING;
  const t = Number.isFinite(seconds) ? Math.max(0,Math.min(T.end,seconds)) : 0;
  const bobMotion = sampleFinaleBobMotion(t);
  let bob = bobMotion.position, goop = route(GOOP_KEYS,t);
  if (t < 3.4) bob = [bob[0]+(bobStart[0]-FINALE_BOB_START[0])*(1-finaleEase(2.8,3.4,t)),
    bob[1]+(bobStart[1]-FINALE_BOB_START[1])*(1-finaleEase(2.8,3.4,t)),
    bob[2]+(bobStart[2]-FINALE_BOB_START[2])*(1-finaleEase(2.8,3.4,t))];
  if(t>=F(69.9))goop=finaleGroundTravel(GOOP_ESCAPE,t);
  if(t>=FINALE_GOOP_DIVE.start&&t<FINALE_GOOP_DIVE.end)goop=finaleJumpPosition(FINALE_GOOP_DIVE,t);
  else if(t>=FINALE_GOOP_DIVE.end){
    const age=t-FINALE_GOOP_DIVE.end;
    const drift=finaleEase(0,.6,age);
    goop=[.25+.25*drift,Math.max(68,73.6+finaleJumpVelocity(FINALE_GOOP_DIVE,FINALE_GOOP_DIVE.end)[1]*age-6*age*age),138.5+.4*drift];
  }
  const battle = t >= T.combat && t < F(54.8);
  const goopCombat = battle ? sampleFinaleGoopCombat(t) : undefined;
  if (goopCombat) goop = goopCombat.position;
  const enter = finaleEase(15,18,t);
  const scanBobPosition: FinalePoint = [-8,98.7,121];
  const scanGoopPosition: FinalePoint = [-7.5,87.5,104];
  let drone: FinalePoint = finaleMix([9,96,106],scanBobPosition,enter);
  if (t >= 21) drone = finaleMix(scanBobPosition,scanGoopPosition,finaleEase(21,22.5,t));
  if (t >= T.combat) drone = sampleFinaleDroneCombat(t);
  const latched = t >= T.latch && t < F(56.8);
  const mountCompression = latched ? finaleEase(T.latch,T.latch+.3,t) * (1-finaleEase(F(56.4),F(56.8),t)) : 0;
  if (t >= T.latch && t < T.droneHit) {
    const envelope = Math.min(finaleEase(T.latch,T.latch+.35,t),1-finaleEase(F(56.4),F(56.8),t));
    drone = [drone[0]+Math.sin(t*11)*.55*envelope,drone[1]+Math.sin(t*15)*.3*envelope,
      drone[2]+Math.cos(t*9)*.35*envelope];
    // Compression keeps the sole on the fixed upper deck, not hovering above it.
    if (latched) bob = [drone[0],drone[1]+.96-.1125*mountCompression,drone[2]];
  }
  const shot = CONTAINMENT_FINALE_SHOTS.find(shot=>t<shot.end) ?? CONTAINMENT_FINALE_SHOTS.at(-1)!;
  let cameraPosition = finaleMix(shot.from,shot.to ?? shot.from,finaleEase(shot.start,shot.end,t));
  let cameraTarget: FinalePoint = typeof shot.target !== 'string' ? shot.target
    : shot.target === 'bob' ? [bob[0],bob[1]+.12,bob[2]]
    : shot.target === 'goop' ? [goop[0],goop[1]+.14,goop[2]] : shot.target === 'duel' ? finaleMix(goop,drone,.5) : drone;
  const pov = typeof shot.target === 'string' && shot.target.startsWith('pov-');
  if (pov) {
    cameraTarget = shot.target === 'pov-bob' ? bob : shot.target === 'pov-goop' ? goop
      : finaleMix(bob,goop,finaleEase(21,22.5,t));
    const dx=cameraTarget[0]-drone[0],dy=cameraTarget[1]-drone[1],dz=cameraTarget[2]-drone[2];
    const length=Math.hypot(dx,dy,dz);
    cameraPosition=[drone[0]+dx/length*1.1,drone[1]+dy/length*1.1,drone[2]+dz/length*1.1];
  }
  return { seconds:t, shot:shot.id, bob, goop, drone, latched, mountCompression, pov,
    scan: t>=18 && t<21 ? 'bob' as const : t>=22.5 && t<T.combat ? 'goop' as const : undefined,
    scanProgress: t<21 ? finaleEase(T.scanBob,T.scanBobComplete,t) : finaleEase(T.scanGoop,T.scanGoopComplete,t),
    scanStage: t>=T.scanBob&&t<T.scanPan ? (t<T.scanBobComplete?'scanning':'threat') as 'scanning'|'threat'
      : t>=T.scanGoop&&t<T.combat ? t<T.scanGoopComplete?'scanning':t<T.terminate?'threat':'terminate' : 'search',
    panelOpen:finaleEase(3,5.5,t), droneVisible:t>=15&&t<T.droneHit,
    reinforcementCount:Math.max(0,Math.min(3,Math.floor((t-T.reinforcements)/FINALE_REINFORCEMENT_INTERVAL)+1)),
    bobAttached:bobMotion.attached, bobAirborne:bobMotion.airborne,
    bobCharging:bobMotion.charging, bobCharge:bobMotion.charge,
    goopAirborne:(t>5.3&&t<9.5)||t>=T.goopDive||!!goopCombat?.airborne,
    goopCharging:!!goopCombat?.charging, goopCharge:goopCombat?.charge ?? 0,
    thank:t>=T.thank&&t<T.reinforcements,
    fade: Math.max(1-finaleEase(0,.6,t),finaleEase(F(81.7),T.blackout,t)),
    cameraPosition,cameraTarget,cameraFov:shot.fov,cameraUp:shot.up ?? [0,1,0] as FinalePoint,
  };
}
export type ContainmentFinaleFrame = ReturnType<typeof sampleContainmentFinale>;
