/** Mono OGG assets; Bob and Goop use the requester-selected ElevenLabs pack. */
export const SOUND_DEFINITIONS = {
  'bob-contact-01': { path: 'assets/audio/bob/bob-contact-01.ogg', loop: false, volume: 0.4, maxVoices: 3 },
  'bob-charged-jump-01': { path: 'assets/audio/bob/bob-charged-jump-01.ogg', loop: false, volume: 0.6, maxVoices: 3 },
  'bob-detach-01': { path: 'assets/audio/bob/bob-detach-01.ogg', loop: false, volume: 0.42, maxVoices: 3 },
  'bob-fall-01': { path: 'assets/audio/bob/bob-fall-01.ogg', loop: false, volume: 0.55, maxVoices: 3 },
  'bob-jump-01': { path: 'assets/audio/bob/bob-jump-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'bob-land-hard-01': { path: 'assets/audio/bob/bob-land-hard-01.ogg', loop: false, volume: 0.55, maxVoices: 3 },
  'bob-land-soft-01': { path: 'assets/audio/bob/bob-land-soft-01.ogg', loop: false, volume: 0.4, maxVoices: 3 },
  'goop-acid-puddle-loop-01': { path: 'assets/audio/goop/goop-acid-puddle-loop-01.ogg', loop: true, volume: 0.13, maxVoices: 1 },
  'goop-dissolve-complete-01': { path: 'assets/audio/goop/goop-dissolve-complete-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'goop-dissolve-loop-01': { path: 'assets/audio/goop/goop-dissolve-loop-01.ogg', loop: true, volume: 0.2, maxVoices: 3 },
  'goop-projectile-impact-01': { path: 'assets/audio/goop/goop-projectile-impact-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'goop-shoot-01': { path: 'assets/audio/goop/goop-shoot-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-aim-enter-01': { path: 'assets/audio/volt/volt-aim-enter-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-aim-exit-01': { path: 'assets/audio/volt/volt-aim-exit-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-charge-loop-01': { path: 'assets/audio/volt/volt-charge-loop-01.ogg', loop: true, volume: 0.13, maxVoices: 1 },
  'volt-charge-ready-01': { path: 'assets/audio/volt/volt-charge-ready-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-circuit-connect-01': { path: 'assets/audio/volt/volt-circuit-connect-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-circuit-hold-loop-01': { path: 'assets/audio/volt/volt-circuit-hold-loop-01.ogg', loop: true, volume: 0.13, maxVoices: 1 },
  'volt-circuit-release-01': { path: 'assets/audio/volt/volt-circuit-release-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-electric-impact-01': { path: 'assets/audio/volt/volt-electric-impact-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-energy-pulse-01': { path: 'assets/audio/volt/volt-energy-pulse-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-idle-sparks-loop-01': { path: 'assets/audio/volt/volt-idle-sparks-loop-01.ogg', loop: true, volume: 0.045, maxVoices: 1 },
  'volt-jump-01': { path: 'assets/audio/volt/volt-jump-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-land-01': { path: 'assets/audio/volt/volt-land-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-land-hard-01': { path: 'assets/audio/volt/volt-land-hard-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-light-activate-01': { path: 'assets/audio/volt/volt-light-activate-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-movement-loop-01': { path: 'assets/audio/volt/volt-movement-loop-01.ogg', loop: true, volume: 0.13, maxVoices: 1 },
  'volt-platform-power-on-01': { path: 'assets/audio/volt/volt-platform-power-on-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-respawn-01': { path: 'assets/audio/volt/volt-respawn-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-shoot-01': { path: 'assets/audio/volt/volt-shoot-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'volt-terminal-activate-01': { path: 'assets/audio/volt/volt-terminal-activate-01.ogg', loop: false, volume: 0.5, maxVoices: 3 },
  'specimen-turret-shot': { path: 'assets/audio/turrets/specimen-turret-shot.ogg', loop: false, volume: 0.65, maxVoices: 3 },
} as const;
export type SoundId = keyof typeof SOUND_DEFINITIONS;
const ALL_SOUND_IDS = Object.keys(SOUND_DEFINITIONS) as SoundId[];
// Cultivation rescues Volt but does not expose his electrical ability. Its
// combat rooms already use the shared turret cue, so that must not wait for L3.
const CULTIVATION_VOLT_SOUNDS: readonly SoundId[] = [
  'volt-jump-01', 'volt-land-01', 'volt-land-hard-01',
  'volt-movement-loop-01', 'volt-idle-sparks-loop-01', 'volt-respawn-01',
];
/** Cumulative banks start warming ahead of each level's visual preparation. */
export const SOUND_BANKS = {
  containment: ALL_SOUND_IDS.filter(id => id.startsWith('bob-') || id.startsWith('goop-')),
  cultivation: ALL_SOUND_IDS.filter(id => !id.startsWith('volt-') || CULTIVATION_VOLT_SOUNDS.includes(id)),
  blackout: ALL_SOUND_IDS,
} as const;
export interface SoundDefinition { readonly path: string; readonly loop: boolean; readonly volume: number; readonly maxVoices: number }
export const soundUrl = (id: SoundId, base = "./"): string => `${base}${SOUND_DEFINITIONS[id].path}`;
