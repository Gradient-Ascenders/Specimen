import type { SlimeId } from '../slimes/SlimeRoster.ts';

export type PlayableSlimeId = Extract<SlimeId, 'bob' | 'goop'>;
export type LevelThreePlayableSlimeId = Extract<SlimeId, 'bob' | 'goop' | 'volt'>;

/** Small application-owned handoff; level-owned bodies never cross runtimes. */
export interface LevelProgressionSnapshot {
  readonly unlockedSlimeIds: readonly SlimeId[];
  readonly activeSlimeId: SlimeId;
}

export function validateLevelProgressionSnapshot(
  snapshot: LevelProgressionSnapshot,
): void {
  const unlocked = new Set(snapshot.unlockedSlimeIds);
  if (!unlocked.has('bob') || !unlocked.has('goop')) {
    throw new Error('Level 2 requires both Bob and Goop to be unlocked.');
  }
  if (!unlocked.has(snapshot.activeSlimeId)) {
    throw new Error('The active slime must be present in the unlocked roster.');
  }
}

export function validateLevelThreeProgressionSnapshot(
  snapshot: LevelProgressionSnapshot,
): void {
  const unlocked = new Set(snapshot.unlockedSlimeIds);
  for (const slimeId of ['bob', 'goop', 'volt'] as const) {
    if (!unlocked.has(slimeId)) {
      throw new Error(`Level 3 requires ${slimeId} to be unlocked after the Volt rescue.`);
    }
  }
  if (!unlocked.has(snapshot.activeSlimeId)) {
    throw new Error('The active slime must be present in the unlocked Level 3 roster.');
  }
}
