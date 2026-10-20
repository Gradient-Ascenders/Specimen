/** Extend the scan warning from .9 to 2.7 seconds without shortening combat. */
export const FINALE_WARNING_EXTENSION_SECONDS = 1.8;
export const FINALE_DUCT_TIME_SCALE = .6;
export const FINALE_REINFORCEMENT_INTERVAL = .65;

/** Convert an authored cue/key time to the shared movie clock. */
export function finaleTime(authoredSeconds: number): number {
  if (authoredSeconds < 26) return authoredSeconds;
  // Accelerate only the last run/dive, keeping the readable scans and fight.
  const time = authoredSeconds <= 74.3 ? authoredSeconds : 74.3 + (authoredSeconds - 74.3) * FINALE_DUCT_TIME_SCALE;
  return time + FINALE_WARNING_EXTENSION_SECONDS;
}

export const CONTAINMENT_FINALE_TIMING = Object.freeze({
  powerOff: 1, cellOpen: 3, freed: 9.5, droneReveal: 15, scanBob: 18,
  scanBobComplete: 19.65, scanPan: 21, scanGoop: 22.5, scanGoopComplete: 24.15, terminate: 25.1,
  combat: finaleTime(26), bobNotices: finaleTime(36), platformApproach: finaleTime(38),
  leap: finaleTime(47), latch: finaleTime(48.05), cleanShot: finaleTime(55.8), droneHit: finaleTime(57),
  restLanding: finaleTime(58.4), safeLanding: finaleTime(61.15), thank: finaleTime(64.5),
  reinforcements: finaleTime(65.9), goopSpotsVent: finaleTime(67.5), doorShot: finaleTime(69),
  doorHit: finaleTime(69.6), doorOpen: finaleTime(71.4), chase: finaleTime(72),
  goopDive: finaleTime(78.3), bobDive: finaleTime(79.5), dive: finaleTime(78.3),
  blackout: finaleTime(82.5), end: finaleTime(85),
});
