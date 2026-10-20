import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { ContainmentMonitor } from './ContainmentMonitor.ts';
import { RoomOneMonitorDialogue } from './RoomOneMonitorDialogue.ts';

// Facing the north (+Z) exit, right is -X. Centre it on the 12m x 8m side wall.
export const ROOM_ONE_MONITOR_POSITION = Object.freeze({ x: -6.62, y: 4, z: 0 });

export class RoomOneMonitor extends ContainmentMonitor {
  constructor(resources: ContainmentArtResources) {
    super(resources, { roomId: 1, position: ROOM_ONE_MONITOR_POSITION, yaw: Math.PI / 2,
      dialogue: new RoomOneMonitorDialogue() });
  }
}
