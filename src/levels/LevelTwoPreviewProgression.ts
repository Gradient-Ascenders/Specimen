import type {
  LevelTwoAuthoredRoomId,
  LevelTwoPreviewSlimeId,
} from './LevelTwoPreviewScene.ts';

export interface LevelTwoPreviewResolvedRooms {
  readonly bob: LevelTwoAuthoredRoomId;
  readonly goop: LevelTwoAuthoredRoomId;
}

export interface LevelTwoPreviewProgressionSnapshot {
  /** Shared objective room. Room 1 is Bob-owned; Room 3 requires both slimes. */
  readonly roomId: LevelTwoAuthoredRoomId;
  /** Per-slime recovery ownership prevents an unreached body moving forward. */
  readonly recoveryRoomIds: Readonly<
    Record<LevelTwoPreviewSlimeId, LevelTwoAuthoredRoomId>
  >;
  readonly bobEnteredRoomThree: boolean;
  readonly goopEnteredRoomThree: boolean;
}

export const createLevelTwoPreviewProgression = (
  roomId: LevelTwoAuthoredRoomId = 1,
): LevelTwoPreviewProgressionSnapshot => ({
  roomId,
  recoveryRoomIds: { bob: roomId, goop: roomId },
  bobEnteredRoomThree: roomId === 3,
  goopEnteredRoomThree: roomId === 3,
});

/**
 * Advance authored-preview progression from both persistent body positions.
 *
 * Goop may establish his own Room 2 recovery before Bob without changing the
 * shared objective. Room 3 remains a split checkpoint until both slimes have
 * physically reached their identity-owned entrances.
 */
export const advanceLevelTwoPreviewProgression = (
  previous: LevelTwoPreviewProgressionSnapshot,
  resolvedRooms: LevelTwoPreviewResolvedRooms,
): LevelTwoPreviewProgressionSnapshot => {
  const bobRecoveryRoomId = furthestRoom(
    previous.recoveryRoomIds.bob,
    resolvedRooms.bob,
  );
  const goopRecoveryRoomId = furthestRoom(
    previous.recoveryRoomIds.goop,
    resolvedRooms.goop,
  );
  const bobEnteredRoomThree = bobRecoveryRoomId === 3;
  const goopEnteredRoomThree = goopRecoveryRoomId === 3;

  let roomId = previous.roomId;
  if (roomId === 1 && bobRecoveryRoomId >= 2) roomId = 2;
  if (
    roomId === 2 &&
    bobEnteredRoomThree &&
    goopEnteredRoomThree
  ) {
    roomId = 3;
  }

  if (
    roomId === previous.roomId &&
    bobRecoveryRoomId === previous.recoveryRoomIds.bob &&
    goopRecoveryRoomId === previous.recoveryRoomIds.goop &&
    bobEnteredRoomThree === previous.bobEnteredRoomThree &&
    goopEnteredRoomThree === previous.goopEnteredRoomThree
  ) {
    return previous;
  }

  return {
    roomId,
    recoveryRoomIds: {
      bob: bobRecoveryRoomId,
      goop: goopRecoveryRoomId,
    },
    bobEnteredRoomThree,
    goopEnteredRoomThree,
  };
};

const furthestRoom = (
  first: LevelTwoAuthoredRoomId,
  second: LevelTwoAuthoredRoomId,
): LevelTwoAuthoredRoomId => Math.max(first, second) as LevelTwoAuthoredRoomId;
