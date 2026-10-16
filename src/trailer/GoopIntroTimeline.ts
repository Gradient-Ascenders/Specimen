export const GOOP_INTRO_DURATION_SECONDS = 11.8;
export const GOOP_INTRO_TIMING = {
  lookUp: 1.6,
  aim: 1.8,
  droneFire: 3,
  reverseCut: 3.14,
  goopLaunch: 3.05,
  goopContact: 3.42,
  goopArrives: 3.78,
  shieldHit: 3.95,
  goopLands: 4.08,
  charge: 4.5,
  acidFire: 5.05,
  impactCut: 5.3,
  droneHit: 5.78,
  breakup: 6,
  heroes: 8.5,
} as const;

export type TrailerPoint = readonly [number, number, number];
export type GoopIntroStage = 'patrol' | 'aiming' | 'rescue' | 'counterattack' | 'destruction' | 'heroes' | 'complete';
export type GoopIntroCameraShot = 'follow-bob' | 'drone-reveal' | 'bob-reverse' | 'drone-impact' | 'heroes';
export const GOOP_INTRO_BLOCK_POSITION: TrailerPoint = [-0.9, 0.45, 0.12];
export const GOOP_INTRO_BOB_POSITION: TrailerPoint = [-2.5, 0.45, 1.35];

export interface GoopIntroFrame {
  readonly seconds: number;
  readonly stage: GoopIntroStage;
  readonly bobPosition: TrailerPoint;
  readonly goopPosition: TrailerPoint;
  readonly dronePosition: TrailerPoint;
  readonly bobAlarm: number;
  readonly bobLookUp: number;
  readonly bobPush: number;
  readonly bobJolt: number;
  readonly goopYaw: number;
  readonly goopJump: number;
  readonly goopLanding: number;
  readonly shieldPulse: number;
  readonly acidCharge: number;
  readonly acidRecoil: number;
  readonly redShotProgress: number | null;
  readonly acidShotProgress: number | null;
  readonly droneImpactAge: number;
  readonly breakupAge: number;
  readonly heroTurn: number;
  readonly cameraPosition: TrailerPoint;
  readonly cameraTarget: TrailerPoint;
  readonly cameraFov: number;
  readonly cameraShot: GoopIntroCameraShot;
}

const GOOP_CONTACT_POSITION: TrailerPoint = [-3.292, 0.45, 0.294];

/** Absolute-time choreography: replay and seeking never depend on past frames. */
export function sampleGoopIntro(seconds: number): GoopIntroFrame {
  const t = Number.isFinite(seconds) ? Math.max(0, Math.min(GOOP_INTRO_DURATION_SECONDS, seconds)) : 0;
  const timing = GOOP_INTRO_TIMING;
  const jump = interval(timing.goopLaunch, timing.goopLands, t);
  const goopPosition = t < timing.goopContact
    ? mixPoint([-4.4, 0.45, -1.9], GOOP_CONTACT_POSITION, ease(timing.goopLaunch, timing.goopContact, t))
    : mixPoint(GOOP_CONTACT_POSITION, GOOP_INTRO_BLOCK_POSITION, ease(timing.goopContact, timing.goopArrives, t));
  const bobWalk = mixPoint([-3.6, 0.45, 2.55], GOOP_INTRO_BOB_POSITION, ease(0, timing.lookUp, t));
  const bobPush = ease(timing.goopContact, timing.goopArrives, t);
  const bobPosition: TrailerPoint = [bobWalk[0] + bobPush * 0.9,
    bobWalk[1] + Math.sin(bobPush * Math.PI) * 0.12, bobWalk[2] + bobPush * 1.2];
  const hoverWeight = 1 - ease(timing.droneHit, timing.breakup, t);
  const dronePosition = mixPoint([4.7, 3.3, -5], [2.8, 2.4, -2.65], ease(0, timing.aim, t));
  const camera = sampleCamera(t, bobPosition, dronePosition);
  const heroTurn = ease(7.3, 9.2, t);
  return {
    seconds: t,
    stage: t >= GOOP_INTRO_DURATION_SECONDS ? 'complete'
      : t >= timing.heroes ? 'heroes'
      : t >= timing.droneHit ? 'destruction'
      : t >= timing.shieldHit ? 'counterattack'
      : t >= timing.droneFire ? 'rescue'
      : t >= timing.aim ? 'aiming' : 'patrol',
    bobPosition,
    goopPosition: [goopPosition[0], goopPosition[1] + Math.sin(jump * Math.PI) * 0.68, goopPosition[2]],
    dronePosition: [dronePosition[0], dronePosition[1] + Math.sin(t * 3.4) * 0.035 * hoverWeight, dronePosition[2]],
    bobAlarm: ease(timing.aim, timing.droneFire, t) * (1 - ease(6.4, 8.1, t)),
    bobLookUp: ease(timing.lookUp, 2.2, t) * (1 - ease(timing.goopContact, timing.goopArrives, t)),
    bobPush,
    bobJolt: pulse(t, timing.goopContact, 0.85),
    goopYaw: (1 - heroTurn) * (-2.67 + 1.82 * ease(timing.goopContact, timing.goopArrives, t)) + heroTurn * -2.4,
    goopJump: Math.sin(jump * Math.PI),
    goopLanding: pulse(t, timing.goopLands, 0.5),
    shieldPulse: pulse(t, timing.shieldHit, 0.4),
    acidCharge: ease(timing.charge, timing.acidFire, t) * (t < timing.acidFire ? 1 : 0),
    acidRecoil: pulse(t, timing.acidFire, 0.38),
    redShotProgress: t >= timing.droneFire && t < timing.shieldHit
      ? interval(timing.droneFire, timing.shieldHit, t) : null,
    acidShotProgress: t >= timing.acidFire && t < timing.droneHit
      ? interval(timing.acidFire, timing.droneHit, t) : null,
    droneImpactAge: t < timing.droneHit ? -1 : t - timing.droneHit,
    breakupAge: t < timing.breakup ? -1 : t - timing.breakup,
    heroTurn,
    cameraPosition: camera.position,
    cameraTarget: camera.target,
    cameraFov: camera.fov,
    cameraShot: camera.shot,
  };
}

function sampleCamera(t: number, bob: TrailerPoint, drone: TrailerPoint): {
  shot: GoopIntroCameraShot; position: TrailerPoint; target: TrailerPoint; fov: number;
} {
  const timing = GOOP_INTRO_TIMING;
  if (t < timing.lookUp) return {
    shot: 'follow-bob', position: [bob[0] - 1.8, 1.15, bob[2] + 0.8],
    // Frame Bob and the floor, keeping the entire attacker above the shot.
    // The drone stays in the scene: the upward camera move reveals it naturally.
    target: [bob[0] + 0.2, 0.35, bob[2] - 0.12], fov: 44,
  };
  // A rising crane follows Bob's gaze into a close view of the attacker.
  if (t < timing.reverseCut) {
    const tilt = ease(timing.lookUp, 2.65, t);
    return { shot: 'drone-reveal',
      position: mixPoint([-4.3, 1.15, 2.15], [-0.2, 2.05, 0.85], tilt),
      target: mixPoint([-2.3, 0.35, 1.23], drone, ease(timing.lookUp, 2.55, t)),
      fov: 44 - tilt * 4,
    };
  }
  // Hard reverse cut: Bob faces the camera. Goop enters from beyond the right
  // edge, bumps him clear and fills the foreground before returning fire.
  if (t < timing.impactCut) {
    const pullback = ease(timing.reverseCut + 0.12, 4.15, t);
    return { shot: 'bob-reverse',
      position: mixPoint([0.4, 1.22, -0.6], [1.5, 1.4, -1.45], pullback),
      target: mixPoint([-2.5, 0.75, 1.35], [-1.25, 0.8, 0.65], pullback),
      fov: 44 - pullback,
    };
  }
  // Cut on the acid shot; stay with the drone as the hit breaks it apart and
  // follow its actual pieces down, instead of leaving the action off-screen.
  if (t < timing.heroes) {
    // Keep the landing in frame now that the hardware falls under gravity.
    const fall = ease(timing.breakup, 7.2, t);
    const age = Math.max(0, t - timing.droneHit);
    const shake = t < timing.droneHit ? 0 : Math.exp(-age * 8) * 0.03;
    const position = mixPoint([0, 2.75, 1.4], [0.35, 1.35, 3.2], fall);
    return { shot: 'drone-impact',
      position: [position[0] + Math.sin(age * 75) * shake, position[1] + Math.sin(age * 61) * shake, position[2]],
      target: mixPoint([2.8, 2.4, -2.65], [2.8, 0.4, -2.65], fall), fov: 43 + fall * 5,
    };
  }
  return { shot: 'heroes',
    position: mixPoint([3.7, 1.3, 5.8], [3.5, 1.25, 5.6], ease(timing.heroes, GOOP_INTRO_DURATION_SECONDS, t)),
    target: [-1.25, 0.75, 1.3], fov: 42,
  };
}

function interval(start: number, end: number, time: number): number {
  return Math.max(0, Math.min(1, (time - start) / (end - start)));
}

function ease(start: number, end: number, time: number): number {
  const p = interval(start, end, time);
  return p * p * (3 - 2 * p);
}

function pulse(time: number, start: number, duration: number): number {
  return time < start || time >= start + duration ? 0 : Math.sin(interval(start, start + duration, time) * Math.PI);
}

function mixPoint(a: TrailerPoint, b: TrailerPoint, amount: number): TrailerPoint {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}
