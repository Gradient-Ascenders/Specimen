import type { LevelTwoAuthoredRoomId } from './LevelTwoPreviewScene.ts';

export const CULTIVATION_ROOM_IDS = [1, 2, 3, 4, 5] as const;

/** Scene owns residency/simulation/render selection; the preparation queue owns readiness. */
export class CultivationRoomWorkload {
  readonly resident = new Set<LevelTwoAuthoredRoomId>(CULTIVATION_ROOM_IDS);
  readonly simulated = new Set<LevelTwoAuthoredRoomId>();
  readonly rendered = new Set<LevelTwoAuthoredRoomId>(CULTIVATION_ROOM_IDS);
  readonly prepared = new Set<LevelTwoAuthoredRoomId>();
  readonly preparing = new Set<LevelTwoAuthoredRoomId>();
  roomUpdates = 0;
  cosmeticUpdates = 0;

  snapshot() {
    return { resident: [...this.resident], simulated: [...this.simulated].sort(), rendered: [...this.rendered],
      prepared: [...this.prepared].sort(), preparing: [...this.preparing].sort(),
      roomUpdates: this.roomUpdates, cosmeticUpdates: this.cosmeticUpdates };
  }

  reset(): void {
    this.simulated.clear(); this.rendered.clear();
    this.roomUpdates = 0; this.cosmeticUpdates = 0;
    // Restart retains the queue's ready GPU resources and residency.
  }

  clearPreparation(): void { this.prepared.clear(); this.preparing.clear(); }
  dispose(): void { this.reset(); this.clearPreparation(); this.resident.clear(); }
}
