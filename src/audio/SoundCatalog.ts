export interface SoundSpatialProfile {
  readonly refDistance: number;
  readonly rolloffFactor: number;
}

// Keep small body/electrical accents local; larger world sounds carry across a room.
const LOCAL: SoundSpatialProfile = { refDistance: 3, rolloffFactor: 1.5 };
const MECHANISM: SoundSpatialProfile = { refDistance: 5, rolloffFactor: 0.8 };
const LASER: SoundSpatialProfile = { refDistance: 4, rolloffFactor: 0.8 };
const MONITOR: SoundSpatialProfile = { refDistance: 4, rolloffFactor: 1 };
const DISSOLVE: SoundSpatialProfile = { refDistance: 5, rolloffFactor: 0.9 };
const HEAVY_IMPACT: SoundSpatialProfile = { refDistance: 8, rolloffFactor: 0.7 };

/** Mono OGG assets; requester-selected ElevenLabs character effects and shared turret audio. */
export const SOUND_DEFINITIONS = {
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
  'volt-circuit-release-01': { path: 'assets/audio/volt/volt-circuit-release-01.ogg', loop: false, volume: 0.38, maxVoices: 3 },
  'volt-shoot-01': { path: 'assets/audio/volt/volt-shoot-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'world-door-movement-loop-01': { path: 'assets/audio/world/world-door-movement-loop-01.ogg', loop: true, volume: 0.3, maxVoices: 2, spatial: MECHANISM },
  'world-door-stop-01': { path: 'assets/audio/world/world-door-stop-01.ogg', loop: false, volume: 0.5, maxVoices: 3, spatial: MECHANISM },
  'world-machinery-loop-01': { path: 'assets/audio/world/world-machinery-loop-01.ogg', loop: true, volume: 0.48, maxVoices: 2, spatial: MECHANISM },
  'world-laser-loop-01': { path: 'assets/audio/world/world-laser-loop-01.ogg', loop: true, volume: 0.55, maxVoices: 1, spatial: LASER },
  'world-activation-01': { path: 'assets/audio/world/world-activation-01.ogg', loop: false, volume: 0.45, maxVoices: 3 },
  'world-release-01': { path: 'assets/audio/world/world-release-01.ogg', loop: false, volume: 0.27, maxVoices: 3 },
  'world-platform-fall-01': { path: 'assets/audio/environment/world-platform-fall-01.ogg', loop: false, volume: 0.95, maxVoices: 3, spatial: HEAVY_IMPACT },
  'world-platform-land-01': { path: 'assets/audio/environment/world-platform-land-01.ogg', loop: false, volume: 1.2, maxVoices: 3, spatial: HEAVY_IMPACT },
  'world-drone-flight-loop-01': { path: 'assets/audio/environment/world-drone-flight-loop-01.ogg', loop: true, volume: 0.24, maxVoices: 2 },
  'world-platform-hover-loop-01': { path: 'assets/audio/environment/world-platform-hover-loop-01.ogg', loop: true, volume: 0.22, maxVoices: 1 },
  'world-sign-tick-01': { path: 'assets/audio/environment/world-sign-tick-01.ogg', loop: false, volume: 0.46, maxVoices: 2, spatial: MONITOR },
  'world-drone-dissolve-01': { path: 'assets/audio/environment/world-drone-dissolve-01.ogg', loop: false, volume: 0.85, maxVoices: 3, spatial: DISSOLVE },
  'specimen-turret-shot': { path: 'assets/audio/turrets/specimen-turret-shot.ogg', loop: false, volume: 0.65, maxVoices: 3 },
} as const;
export type SoundId = keyof typeof SOUND_DEFINITIONS;
const ALL_SOUND_IDS = Object.keys(SOUND_DEFINITIONS) as SoundId[];
// The live Cultivation escape includes Volt taking over a security drone.
/** Cumulative banks start warming ahead of each level's visual preparation. */
export const SOUND_BANKS = {
  containment: ALL_SOUND_IDS.filter(id => id.startsWith('bob-') || id.startsWith('goop-') || id.startsWith('world-') || id === 'specimen-turret-shot'),
  cultivation: ALL_SOUND_IDS.filter(id => !id.startsWith('volt-') ||
    id === 'volt-circuit-connect-01' || id === 'volt-charge-ready-01'),
  blackout: ALL_SOUND_IDS,
} as const;
export interface SoundDefinition { readonly path: string; readonly loop: boolean; readonly volume: number; readonly maxVoices: number; readonly spatial?: SoundSpatialProfile }
export const soundSpatialProfile = (id: SoundId): SoundSpatialProfile =>
  (SOUND_DEFINITIONS[id] as SoundDefinition).spatial ?? LOCAL;
export const soundUrl = (id: SoundId, base = "./"): string => `${base}${SOUND_DEFINITIONS[id].path}`;
