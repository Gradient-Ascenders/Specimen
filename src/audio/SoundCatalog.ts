export interface SoundSpatialProfile {
  readonly refDistance: number;
  readonly rolloffFactor: number;
  readonly maxDistance?: number;
}

// Keep small body/electrical accents local; larger world sounds carry across a room.
const LOCAL: SoundSpatialProfile = { refDistance: 3, rolloffFactor: 1.5 };
const MECHANISM: SoundSpatialProfile = { refDistance: 5, rolloffFactor: 0.8 };
const LASER: SoundSpatialProfile = { refDistance: 4, rolloffFactor: 0.8 };
const MONITOR: SoundSpatialProfile = { refDistance: 4, rolloffFactor: 1 };
const DISSOLVE: SoundSpatialProfile = { refDistance: 5, rolloffFactor: 0.9 };
const HEAVY_IMPACT: SoundSpatialProfile = { refDistance: 8, rolloffFactor: 0.7 };
// The boss sits roughly 80 m from the playable annulus. Small-room falloff
// would make its warnings nearly inaudible; retain direction and some distance.
const BOSS: SoundSpatialProfile = { refDistance: 65, rolloffFactor: .6, maxDistance: 250 };
const BOSS_DRONE: SoundSpatialProfile = { refDistance: 24, rolloffFactor: .7, maxDistance: 200 };
const CINEMATIC: SoundSpatialProfile = { refDistance: 18, rolloffFactor: .6, maxDistance: 180 };

/** Mono OGG assets; requester-selected ElevenLabs character effects and shared turret audio. */
export const SOUND_DEFINITIONS = {
  'ending-boss-strain-loop-01': { path: 'assets/audio/ending/ending-boss-strain-loop-01.ogg', loop: true, volume: 1, maxVoices: 1 },
  'ending-specimen-charge-01': { path: 'assets/audio/ending/ending-specimen-charge-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'ending-specimen-beam-loop-01': { path: 'assets/audio/ending/ending-specimen-beam-loop-01.ogg', loop: true, volume: 1.2, maxVoices: 1 },
  'ending-beam-collision-impact-01': { path: 'assets/audio/ending/ending-beam-collision-impact-01.ogg', loop: false, volume: 1.1, maxVoices: 1 },
  // The supplied pack has the collision impact but no sustained deadlock clip.
  // A separate ID gives this deeper layer its own voice budget and mix.
  'ending-beam-collision-loop-01': { path: 'assets/audio/boss/boss-beam-sustain-loop-01.ogg', loop: true, volume: 1, maxVoices: 1 },
  'ending-energy-overload-rise-01': { path: 'assets/audio/ending/ending-energy-overload-rise-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'ending-slime-separate-01': { path: 'assets/audio/ending/ending-slime-separate-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'ending-boss-wreck-fall-01': { path: 'assets/audio/ending/ending-boss-wreck-fall-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'ending-structural-rumble-loop-01': { path: 'assets/audio/ending/ending-structural-rumble-loop-01.ogg', loop: true, volume: 1.4, maxVoices: 1 },
  'ending-debris-impact-01': { path: 'assets/audio/ending/ending-debris-impact-01.ogg', loop: false, volume: 1, maxVoices: 3 },
  'ending-girder-crash-01': { path: 'assets/audio/ending/ending-girder-crash-01.ogg', loop: false, volume: 1, maxVoices: 4 },
  'ending-projectile-flyby-01': { path: 'assets/audio/ending/ending-projectile-flyby-01.ogg', loop: false, volume: 1, maxVoices: 3 },
  'ending-goop-hit-01': { path: 'assets/audio/ending/ending-goop-hit-01.ogg', loop: false, volume: 1.1, maxVoices: 2 },
  'ending-collapse-blast-01': { path: 'assets/audio/ending/ending-collapse-blast-01.ogg', loop: false, volume: 1, maxVoices: 5 },
  'ending-outdoor-ambience-loop-01': { path: 'assets/audio/ending/ending-outdoor-ambience-loop-01.ogg', loop: true, volume: 1, maxVoices: 1 },
  'blackout-lift-power-restore-01': { path: 'assets/audio/blackout/blackout-lift-power-restore-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: CINEMATIC },
  'blackout-lift-start-01': { path: 'assets/audio/blackout/blackout-lift-start-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: CINEMATIC },
  'blackout-lift-travel-loop-01': { path: 'assets/audio/blackout/blackout-lift-travel-loop-01.ogg', loop: true, volume: .8, maxVoices: 1, spatial: CINEMATIC },
  'blackout-lift-stop-01': { path: 'assets/audio/blackout/blackout-lift-stop-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: CINEMATIC },
  'research-light-rupture-01': { path: 'assets/audio/blackout/research-light-rupture-01.ogg', loop: false, volume: 1, maxVoices: 3, spatial: CINEMATIC },
  'research-energy-absorb-01': { path: 'assets/audio/blackout/research-energy-absorb-01.ogg', loop: false, volume: .75, maxVoices: 4, spatial: CINEMATIC },
  'research-drone-destroy-01': { path: 'assets/audio/escape/escape-drone-destruction-01.ogg', loop: false, volume: .9, maxVoices: 4, spatial: CINEMATIC },
  'research-fusion-charge-loop-01': { path: 'assets/audio/blackout/research-fusion-charge-loop-01.ogg', loop: true, volume: 1, maxVoices: 1, spatial: CINEMATIC },
  'research-slime-fusion-01': { path: 'assets/audio/blackout/research-slime-fusion-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: CINEMATIC },
  'research-fusion-burst-01': { path: 'assets/audio/blackout/research-fusion-burst-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: CINEMATIC },
  'specimen-heavy-blast-01': { path: 'assets/audio/blackout/specimen-heavy-blast-01.ogg', loop: false, volume: 1.1, maxVoices: 2, spatial: CINEMATIC },
  'research-door-breach-01': { path: 'assets/audio/blackout/research-door-breach-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: CINEMATIC },
  'research-glass-shatter-01': { path: 'assets/audio/blackout/research-glass-shatter-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: CINEMATIC },
  'research-shaft-fall-01': { path: 'assets/audio/blackout/research-shaft-fall-01.ogg', loop: false, volume: .8, maxVoices: 1 },
  'research-specimen-land-01': { path: 'assets/audio/blackout/research-specimen-land-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: CINEMATIC },
  'research-pit-unlock-01': { path: 'assets/audio/blackout/research-pit-unlock-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'research-pit-retract-loop-01': { path: 'assets/audio/blackout/research-pit-retract-loop-01.ogg', loop: true, volume: 1, maxVoices: 1, spatial: BOSS },
  'research-pit-stop-01': { path: 'assets/audio/blackout/research-pit-stop-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: BOSS },
  'boss-hover-loop-01': { path: 'assets/audio/boss/boss-hover-loop-01.ogg', loop: true, volume: .65, maxVoices: 1, spatial: BOSS },
  'boss-emergence-01': { path: 'assets/audio/boss/boss-emergence-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-cannon-spin-up-01': { path: 'assets/audio/boss/boss-cannon-spin-up-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-cannon-volley-01': { path: 'assets/audio/boss/boss-cannon-volley-01.ogg', loop: false, volume: 1, maxVoices: 4, spatial: BOSS },
  'boss-orb-charge-01': { path: 'assets/audio/boss/boss-orb-charge-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-orb-launch-01': { path: 'assets/audio/boss/boss-orb-launch-01.ogg', loop: false, volume: 1, maxVoices: 4, spatial: BOSS },
  'boss-orb-burst-01': { path: 'assets/audio/boss/boss-orb-burst-01.ogg', loop: false, volume: 1, maxVoices: 4, spatial: BOSS },
  'boss-beam-charge-01': { path: 'assets/audio/boss/boss-beam-charge-01.ogg', loop: false, volume: .9, maxVoices: 1, spatial: BOSS },
  'boss-beam-ignite-01': { path: 'assets/audio/boss/boss-beam-ignite-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: BOSS },
  'boss-beam-sustain-loop-01': { path: 'assets/audio/boss/boss-beam-sustain-loop-01.ogg', loop: true, volume: 1.25, maxVoices: 1, spatial: BOSS },
  'boss-beam-shutdown-01': { path: 'assets/audio/boss/boss-beam-shutdown-01.ogg', loop: false, volume: .8, maxVoices: 1, spatial: BOSS },
  'boss-shield-activate-01': { path: 'assets/audio/boss/boss-shield-activate-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-shield-regeneration-loop-01': { path: 'assets/audio/boss/boss-shield-regeneration-loop-01.ogg', loop: true, volume: .8, maxVoices: 1, spatial: BOSS },
  'boss-shield-collapse-01': { path: 'assets/audio/boss/boss-shield-collapse-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-drone-deploy-01': { path: 'assets/audio/boss/boss-drone-deploy-01.ogg', loop: false, volume: 1, maxVoices: 2, spatial: BOSS },
  // Reuse the small turret recording with an arena-sized range and its own
  // voice budget, keeping other levels' turret mix independent.
  'boss-drone-shot-01': { path: 'assets/audio/turrets/specimen-turret-shot.ogg', loop: false, volume: .9, maxVoices: 6, spatial: BOSS_DRONE },
  'boss-ram-windup-01': { path: 'assets/audio/boss/boss-ram-windup-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-ram-rush-01': { path: 'assets/audio/boss/boss-ram-rush-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-ram-impact-01': { path: 'assets/audio/boss/boss-ram-impact-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: BOSS },
  'boss-cover-break-01': { path: 'assets/audio/boss/boss-cover-break-01.ogg', loop: false, volume: 1, maxVoices: 3, spatial: BOSS },
  'boss-core-hit-01': { path: 'assets/audio/boss/boss-core-hit-01.ogg', loop: false, volume: 1, maxVoices: 4, spatial: BOSS },
  'boss-hit-blocked-01': { path: 'assets/audio/boss/boss-hit-blocked-01.ogg', loop: false, volume: .8, maxVoices: 3, spatial: BOSS },
  'boss-phase-two-overload-01': { path: 'assets/audio/boss/boss-phase-two-overload-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-reactor-failure-01': { path: 'assets/audio/boss/boss-reactor-failure-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: BOSS },
  'boss-final-explosion-01': { path: 'assets/audio/boss/boss-final-explosion-01.ogg', loop: false, volume: 1.2, maxVoices: 1, spatial: BOSS },
  'boss-health-pickup-01': { path: 'assets/audio/boss/boss-health-pickup-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'specimen-damage-01': { path: 'assets/audio/boss/specimen-damage-01.ogg', loop: false, volume: 1, maxVoices: 2 },
  'specimen-dash-01': { path: 'assets/audio/boss/specimen-dash-01.ogg', loop: false, volume: 1, maxVoices: 2 },
  'blackout-vent-slime-slide-01': { path: 'assets/audio/blackout/blackout-vent-slime-slide-01.ogg', loop: false, volume: .35, maxVoices: 1 },
  'cultivation-volt-cell-open-01': { path: 'assets/audio/cultivation/cultivation-volt-cell-open-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: MECHANISM },
  'cultivation-cover-break-free-01': { path: 'assets/audio/cultivation/cultivation-cover-break-free-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: MECHANISM },
  'cultivation-cover-drone-impact-01': { path: 'assets/audio/cultivation/cultivation-cover-drone-impact-01.ogg', loop: false, volume: 1.1, maxVoices: 1, spatial: HEAVY_IMPACT },
  'cultivation-volt-drone-hijack-01': { path: 'assets/audio/cultivation/cultivation-volt-drone-hijack-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: MECHANISM },
  'cultivation-duct-floor-strain-01': { path: 'assets/audio/cultivation/cultivation-duct-floor-strain-01.ogg', loop: false, volume: 1, maxVoices: 1, spatial: MECHANISM },
  'cultivation-sentry-shove-01': { path: 'assets/audio/cultivation/cultivation-sentry-shove-01.ogg', loop: false, volume: 1, maxVoices: 2, spatial: MECHANISM },
  'cultivation-sentry-topple-01': { path: 'assets/audio/cultivation/cultivation-sentry-topple-01.ogg', loop: false, volume: .9, maxVoices: 2, spatial: MECHANISM },
  'cultivation-sentry-acid-splash-01': { path: 'assets/audio/cultivation/cultivation-sentry-acid-splash-01.ogg', loop: false, volume: 1, maxVoices: 2, spatial: MECHANISM },
  'escape-power-down-01': { path: 'assets/audio/escape/escape-power-down-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'escape-cell-hatch-open-01': { path: 'assets/audio/escape/escape-cell-hatch-open-01.ogg', loop: false, volume: 0.9, maxVoices: 1 },
  'escape-drone-scan-01': { path: 'assets/audio/escape/escape-drone-scan-01.ogg', loop: false, volume: 0.85, maxVoices: 1 },
  'escape-scan-result-01': { path: 'assets/audio/escape/escape-scan-result-01.ogg', loop: false, volume: 0.85, maxVoices: 1 },
  'escape-termination-warning-01': { path: 'assets/audio/escape/escape-termination-warning-01.ogg', loop: false, volume: 0.9, maxVoices: 1 },
  'escape-drone-strain-loop-01': { path: 'assets/audio/escape/escape-drone-strain-loop-01.ogg', loop: true, volume: 0.7, maxVoices: 1, spatial: MECHANISM },
  'escape-projectile-metal-impact-01': { path: 'assets/audio/escape/escape-projectile-metal-impact-01.ogg', loop: false, volume: 0.8, maxVoices: 3, spatial: MECHANISM },
  'escape-drone-destruction-01': { path: 'assets/audio/escape/escape-drone-destruction-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'escape-shaft-fall-01': { path: 'assets/audio/escape/escape-shaft-fall-01.ogg', loop: false, volume: 0.7, maxVoices: 2 },
  'intro-door-open-01': { path: 'assets/audio/intro/intro-door-open-01.ogg', loop: false, volume: 0.9, maxVoices: 1 },
  'intro-door-close-01': { path: 'assets/audio/intro/intro-door-close-01.ogg', loop: false, volume: 0.9, maxVoices: 1 },
  'intro-camera-servo-01': { path: 'assets/audio/intro/intro-camera-servo-01.ogg', loop: false, volume: 0.5, maxVoices: 1 },
  'intro-camera-servo-02': { path: 'assets/audio/intro/intro-camera-servo-02.ogg', loop: false, volume: 0.5, maxVoices: 1 },
  'intro-camera-servo-03': { path: 'assets/audio/intro/intro-camera-servo-03.ogg', loop: false, volume: 0.5, maxVoices: 1 },
  'intro-lab-ambience-loop-01': { path: 'assets/audio/intro/intro-lab-ambience-loop-01.ogg', loop: true, volume: 0.5, maxVoices: 1 },
  'intro-egg-rock-01': { path: 'assets/audio/intro/intro-egg-rock-01.ogg', loop: false, volume: 0.65, maxVoices: 1 },
  'intro-egg-crack-01': { path: 'assets/audio/intro/intro-egg-crack-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'intro-pod-seal-release-01': { path: 'assets/audio/intro/intro-pod-seal-release-01.ogg', loop: false, volume: 0.8, maxVoices: 1 },
  'intro-pod-lid-raise-01': { path: 'assets/audio/intro/intro-pod-lid-raise-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'intro-egg-fall-01': { path: 'assets/audio/intro/intro-egg-fall-01.ogg', loop: false, volume: 0.8, maxVoices: 1 },
  'intro-egg-break-impact-01': { path: 'assets/audio/intro/intro-egg-break-impact-01.ogg', loop: false, volume: 1.1, maxVoices: 1 },
  'intro-bob-splat-01': { path: 'assets/audio/intro/intro-bob-splat-01.ogg', loop: false, volume: 0.7, maxVoices: 1 },
  'intro-bob-reform-01': { path: 'assets/audio/intro/intro-bob-reform-01.ogg', loop: false, volume: 1, maxVoices: 1 },
  'bob-contact-01': { path: 'assets/audio/bob/bob-contact-01.ogg', loop: false, volume: 0.4, maxVoices: 3 },
  'bob-charged-jump-01': { path: 'assets/audio/bob/bob-charged-jump-01.ogg', loop: false, volume: 0.6, maxVoices: 3 },
  'bob-detach-01': { path: 'assets/audio/bob/bob-detach-01.ogg', loop: false, volume: 0.42, maxVoices: 3 },
  'bob-fall-01': { path: 'assets/audio/bob/bob-fall-01.ogg', loop: false, volume: 0.55, maxVoices: 3 },
  'bob-jump-01': { path: 'assets/audio/bob/bob-jump-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'bob-land-hard-01': { path: 'assets/audio/bob/bob-land-hard-01.ogg', loop: false, volume: 0.55, maxVoices: 3 },
  'bob-land-soft-01': { path: 'assets/audio/bob/bob-land-soft-01.ogg', loop: false, volume: 0.4, maxVoices: 3 },
  'goop-acid-puddle-loop-01': { path: 'assets/audio/goop/goop-acid-puddle-loop-01.ogg', loop: true, volume: 0.13, maxVoices: 1 },
  'goop-dissolve-complete-01': { path: 'assets/audio/goop/goop-dissolve-complete-01.ogg', loop: false, volume: 0.65, maxVoices: 3, spatial: DISSOLVE },
  'goop-dissolve-loop-01': { path: 'assets/audio/goop/goop-dissolve-loop-01.ogg', loop: true, volume: 0.36, maxVoices: 3, spatial: DISSOLVE },
  'goop-projectile-impact-01': { path: 'assets/audio/goop/goop-projectile-impact-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'goop-shoot-01': { path: 'assets/audio/goop/goop-shoot-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-charge-ready-01': { path: 'assets/audio/volt/volt-charge-ready-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-circuit-connect-01': { path: 'assets/audio/volt/volt-circuit-connect-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-circuit-hold-loop-01': { path: 'assets/audio/volt/volt-circuit-hold-loop-01.ogg', loop: true, volume: 0.055, maxVoices: 1 },
  'specimen-charge-loop-01': { path: 'assets/audio/volt/volt-circuit-hold-loop-01.ogg', loop: true, volume: 0.24, maxVoices: 1, spatial: MECHANISM },
  'volt-circuit-release-01': { path: 'assets/audio/volt/volt-circuit-release-01.ogg', loop: false, volume: 0.38, maxVoices: 3 },
  'volt-shoot-01': { path: 'assets/audio/volt/volt-shoot-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'world-door-movement-loop-01': { path: 'assets/audio/world/world-door-movement-loop-01.ogg', loop: true, volume: 1.2, maxVoices: 2, spatial: MECHANISM },
  'world-door-stop-01': { path: 'assets/audio/world/world-door-stop-01.ogg', loop: false, volume: 2, maxVoices: 3, spatial: MECHANISM },
  'world-machinery-loop-01': { path: 'assets/audio/world/world-machinery-loop-01.ogg', loop: true, volume: 1.92, maxVoices: 2, spatial: MECHANISM },
  'world-laser-loop-01': { path: 'assets/audio/world/world-laser-loop-01.ogg', loop: true, volume: 2.2, maxVoices: 1, spatial: LASER },
  'world-activation-01': { path: 'assets/audio/world/world-activation-01.ogg', loop: false, volume: 0.45, maxVoices: 3 },
  'world-release-01': { path: 'assets/audio/world/world-release-01.ogg', loop: false, volume: 0.27, maxVoices: 3 },
  'world-button-press-01': { path: 'assets/audio/polish/world-button-press-01.ogg', loop: false, volume: 0.9, maxVoices: 3, spatial: MECHANISM },
  'world-button-release-01': { path: 'assets/audio/polish/world-button-release-01.ogg', loop: false, volume: 0.65, maxVoices: 3, spatial: MECHANISM },
  'world-lever-lock-01': { path: 'assets/audio/polish/world-lever-lock-01.ogg', loop: false, volume: 1.1, maxVoices: 2, spatial: MECHANISM },
  'world-lift-start-01': { path: 'assets/audio/polish/world-lift-start-01.ogg', loop: false, volume: 1, maxVoices: 2, spatial: MECHANISM },
  'world-lift-stop-01': { path: 'assets/audio/polish/world-lift-stop-01.ogg', loop: false, volume: 1.2, maxVoices: 2, spatial: MECHANISM },
  'world-laser-on-01': { path: 'assets/audio/polish/world-laser-on-01.ogg', loop: false, volume: 0.85, maxVoices: 2, spatial: LASER },
  'world-laser-off-01': { path: 'assets/audio/polish/world-laser-off-01.ogg', loop: false, volume: 0.7, maxVoices: 2, spatial: LASER },
  'world-vent-break-01': { path: 'assets/audio/polish/world-vent-break-01.ogg', loop: false, volume: 1.1, maxVoices: 2, spatial: MECHANISM },
  'world-containment-alarm-loop-01': { path: 'assets/audio/polish/world-containment-alarm-loop-01.ogg', loop: true, volume: 0.9, maxVoices: 1 },
  'ui-confirm-01': { path: 'assets/audio/polish/ui-confirm-01.ogg', loop: false, volume: 0.35, maxVoices: 2 },
  'world-platform-fall-01': { path: 'assets/audio/environment/world-platform-fall-01.ogg', loop: false, volume: 3.8, maxVoices: 3, spatial: HEAVY_IMPACT },
  'world-platform-land-01': { path: 'assets/audio/environment/world-platform-land-01.ogg', loop: false, volume: 4.8, maxVoices: 3, spatial: HEAVY_IMPACT },
  'world-drone-flight-loop-01': { path: 'assets/audio/environment/world-drone-flight-loop-01.ogg', loop: true, volume: 0.24, maxVoices: 2 },
  'world-platform-hover-loop-01': { path: 'assets/audio/environment/world-platform-hover-loop-01.ogg', loop: true, volume: 0.22, maxVoices: 1 },
  'world-sign-tick-01': { path: 'assets/audio/environment/world-sign-tick-01.ogg', loop: false, volume: 0.46, maxVoices: 2, spatial: MONITOR },
  'world-drone-dissolve-01': { path: 'assets/audio/environment/world-drone-dissolve-01.ogg', loop: false, volume: 0.85, maxVoices: 3, spatial: DISSOLVE },
  'specimen-turret-shot': { path: 'assets/audio/turrets/specimen-turret-shot.ogg', loop: false, volume: 0.65, maxVoices: 3 },
} as const;
export type SoundId = keyof typeof SOUND_DEFINITIONS;
const ALL_SOUND_IDS = Object.keys(SOUND_DEFINITIONS) as SoundId[];
export const BOSS_SOUND_IDS = ALL_SOUND_IDS.filter(id => !id.startsWith('ending-') && (id.startsWith('boss-') || SOUND_DEFINITIONS[id].path.startsWith('assets/audio/boss/')));
export const BLACKOUT_CUTSCENE_SOUND_IDS = ALL_SOUND_IDS.filter(id => id.startsWith('research-') || SOUND_DEFINITIONS[id].path.startsWith('assets/audio/blackout/') && id !== 'blackout-vent-slime-slide-01');
export const ENDING_SOUND_IDS = ALL_SOUND_IDS.filter(id => id.startsWith('ending-'));
const EARLIER_SOUND_IDS = ALL_SOUND_IDS.filter(id => !BOSS_SOUND_IDS.includes(id) && !BLACKOUT_CUTSCENE_SOUND_IDS.includes(id) && !ENDING_SOUND_IDS.includes(id));
// The live Cultivation escape includes Volt taking over a security drone.
/** Cumulative banks start warming ahead of each level's visual preparation. */
export const SOUND_BANKS = {
  escape: ALL_SOUND_IDS.filter(id => id.startsWith('escape-')),
  intro: ALL_SOUND_IDS.filter(id => id.startsWith('intro-')),
  containment: EARLIER_SOUND_IDS.filter(id => id !== 'specimen-charge-loop-01' && !id.startsWith('volt-') && !id.startsWith('cultivation-') && !id.startsWith('blackout-')),
  cultivation: EARLIER_SOUND_IDS.filter(id => id !== 'specimen-charge-loop-01' && !id.startsWith('blackout-') && (!id.startsWith('volt-') ||
    id === 'volt-circuit-connect-01' || id === 'volt-charge-ready-01')),
  blackout: ALL_SOUND_IDS,
} as const;
export interface SoundDefinition { readonly path: string; readonly loop: boolean; readonly volume: number; readonly maxVoices: number; readonly spatial?: SoundSpatialProfile }
export const soundSpatialProfile = (id: SoundId): SoundSpatialProfile =>
  (SOUND_DEFINITIONS[id] as SoundDefinition).spatial ?? LOCAL;
export const soundUrl = (id: SoundId, base = "./"): string => `${base}${SOUND_DEFINITIONS[id].path}`;
