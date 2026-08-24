export type SlimeId = 'bob' | 'goop' | 'volt';

export type SlimeAbility =
  | 'adhesion'
  | 'rebound'
  | 'dissolve'
  | 'electrical';

export type SlimeBetaAvailability = 'playable' | 'locked';
export type SlimeJumpMode = 'charged' | 'normal';
export type RadiationResponse = 'lethal' | 'immune';

export interface SlimeAbilityConfiguration {
  /** May attach to and traverse authored sticky surfaces. */
  readonly adhesion: boolean;
  /** Owns authored bounce and passive hard-landing reaction behaviour. */
  readonly rebound: boolean;
  /** May invoke corrosive interactions against authored soluble geometry. */
  readonly dissolve: boolean;
  /** May invoke electrical interactions against authored conductive hooks. */
  readonly electrical: boolean;
}

export interface SlimeDefinition {
  readonly id: SlimeId;
  readonly displayName: string;
  readonly betaAvailability: SlimeBetaAvailability;
  /**
   * Whether a newly-created level roster begins with this slime unlocked.
   * A Beta-playable slime may still begin locked so the level can introduce it.
   */
  readonly initiallyUnlocked: boolean;
  /** Player-facing jump style for this slime identity. */
  readonly jumpMode: SlimeJumpMode;
  readonly hazardResponses: {
    /** Explicit identity policy for authored radioactive hazards. */
    readonly radiation: RadiationResponse;
  };
  readonly abilities: SlimeAbilityConfiguration;
}

/**
 * Stable roster/configuration for the current design.
 *
 * Bob and Goop are the two Beta-playable identities. Volt is deliberately
 * represented as data but remains locked and has no playable runtime body.
 */
export const SLIME_DEFINITIONS: readonly SlimeDefinition[] = [
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
    initiallyUnlocked: false,
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
    betaAvailability: 'locked',
    initiallyUnlocked: false,
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

const SLIME_DEFINITION_BY_ID = new Map<SlimeId, SlimeDefinition>(
  SLIME_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getSlimeDefinition(id: SlimeId): SlimeDefinition {
  const definition = SLIME_DEFINITION_BY_ID.get(id);
  if (!definition) {
    throw new Error(`Unknown slime identity "${id}".`);
  }
  return definition;
}
