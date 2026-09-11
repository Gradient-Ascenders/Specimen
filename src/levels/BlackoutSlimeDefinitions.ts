import {
  SLIME_DEFINITIONS,
  type SlimeDefinition,
} from '../slimes/SlimeRoster.ts';

/**
 * Level 3 opts the rescued Volt into play without changing the global
 * pre-rescue roster used by Levels 1 and 2. PersistentSlimeGroup then restores
 * the already-earned Bob/Goop/Volt unlocks for this level-owned manager.
 */
export const BLACKOUT_SLIME_DEFINITIONS: readonly SlimeDefinition[] =
  SLIME_DEFINITIONS.map((definition) =>
    definition.id === 'volt'
      ? { ...definition, betaAvailability: 'playable' as const }
      : definition,
  );
