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
  bobEnteredRoomThree: roomId >= 3,
  goopEnteredRoomThree: roomId >= 3,
});

/**
 * Advance authored-preview progression from both persistent body positions.
 *
 * Goop may establish his own Room 2 recovery before Bob without changing the
 * shared objective. Room 3 keeps both recovery positions in Room 2 until both
 * slimes physically reach Room 3, so Bob can still return to its release button.
 */
export const advanceLevelTwoPreviewProgression = (
  previous: LevelTwoPreviewProgressionSnapshot,
  resolvedRooms: LevelTwoPreviewResolvedRooms,
): LevelTwoPreviewProgressionSnapshot => {
  let bobRecoveryRoomId = furthestRoom(
    previous.recoveryRoomIds.bob,
    resolvedRooms.bob,
  );
  let goopRecoveryRoomId = furthestRoom(
    previous.recoveryRoomIds.goop,
    resolvedRooms.goop,
  );
  if (previous.roomId < 5 && (resolvedRooms.bob < 5 || resolvedRooms.goop < 5)) {
    bobRecoveryRoomId = Math.min(4, bobRecoveryRoomId) as LevelTwoAuthoredRoomId;
    goopRecoveryRoomId = Math.min(4, goopRecoveryRoomId) as LevelTwoAuthoredRoomId;
  }
  // Boarding is a shared checkpoint: never restore one body beyond the other.
  if (previous.roomId < 4 && (resolvedRooms.bob < 4 || resolvedRooms.goop < 4)) {
    bobRecoveryRoomId = Math.min(3, bobRecoveryRoomId) as LevelTwoAuthoredRoomId;
    goopRecoveryRoomId = Math.min(3, goopRecoveryRoomId) as LevelTwoAuthoredRoomId;
  }
  const bobEnteredRoomThree = resolvedRooms.bob >= 3;
  const goopEnteredRoomThree = resolvedRooms.goop >= 3;
  // A solo arrival must still recover beside Room 2's button, where Bob can
  // release Goop. Promote the recovery pair only once both bodies are across.
  if (previous.roomId < 3 && (!bobEnteredRoomThree || !goopEnteredRoomThree)) {
    bobRecoveryRoomId = Math.min(2, bobRecoveryRoomId) as LevelTwoAuthoredRoomId;
    goopRecoveryRoomId = Math.min(2, goopRecoveryRoomId) as LevelTwoAuthoredRoomId;
  }

  let roomId = previous.roomId;
  if (roomId === 1 && bobRecoveryRoomId >= 2) roomId = 2;
  if (
    roomId === 2 &&
    bobEnteredRoomThree &&
    goopEnteredRoomThree
  ) {
    roomId = 3;
  }

  if (bobRecoveryRoomId === 4 && goopRecoveryRoomId === 4) roomId = 4;
  if (bobRecoveryRoomId === 5 && goopRecoveryRoomId === 5) roomId = 5;
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
