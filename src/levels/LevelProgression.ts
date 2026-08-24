import type { SlimeId } from '../slimes/SlimeRoster.ts';

export type PlayableSlimeId = Extract<SlimeId, 'bob' | 'goop'>;

/** Small application-owned handoff; level-owned bodies never cross runtimes. */
export interface LevelProgressionSnapshot {
  readonly unlockedSlimeIds: readonly PlayableSlimeId[];
  readonly activeSlimeId: PlayableSlimeId;
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
