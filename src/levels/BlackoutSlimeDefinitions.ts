import type { SlimeDefinition } from '../slimes/SlimeRoster.ts';

/**
 * Level 3 unlocks the complete roster without changing the global Beta-era
 * definition used by Levels 1 and 2 before Volt is rescued.
 */
export const BLACKOUT_SLIME_DEFINITIONS: readonly SlimeDefinition[] = [
  {
    id: 'bob',
    displayName: 'Bob',
    betaAvailability: 'playable',
    initiallyUnlocked: true,
    jumpMode: 'charged',
    hazardResponses: { radiation: 'lethal' },
    abilities: {
      adhesion: true,
      rebound: true,
      dissolve: false,
      electrical: false,
    },
  },
  {
    id: 'goop',
    displayName: 'Goop',
    betaAvailability: 'playable',
    initiallyUnlocked: true,
    jumpMode: 'normal',
    hazardResponses: { radiation: 'immune' },
    abilities: {
      adhesion: false,
      rebound: false,
      dissolve: true,
      electrical: false,
    },
  },
  {
    id: 'volt',
    displayName: 'Volt',
    betaAvailability: 'playable',
    initiallyUnlocked: true,
    jumpMode: 'normal',
    hazardResponses: { radiation: 'lethal' },
    abilities: {
      adhesion: false,
      rebound: false,
      dissolve: false,
      electrical: true,
    },
  },
] as const;
