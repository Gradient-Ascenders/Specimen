import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { ProximityContainmentMonitor } from './ContainmentMonitor.ts';
import { ContainmentMonitorDialogue, MONITOR_DIALOGUE_TIMING } from './ContainmentMonitorDialogue.ts';
import type { MonitorTextColour } from './ContainmentProceduralTextures.ts';

// Above the rear door, facing the central rest platform behind Goop's cell.
export const ROOM_FIVE_MONITOR_POSITION = Object.freeze({ x: 0, y: 83.85, z: 125.08 });
export const ROOM_FIVE_MONITOR_TRIGGER = Object.freeze({
  centre: Object.freeze({ x: -.68, y: 81.542, z: 115.652 }), radius: 3.5,
});
export const ROOM_FIVE_MONITOR_SCRIPT = Object.freeze([
  'We must intervene before he goes further',
  'No, we must first determine the full extent of Bob’s capabilities.',
  'I’ll deploy a drone as a precaution.',
]);
export const ROOM_FIVE_MONITOR_COLOURS = ['red', 'green', 'red'] as const satisfies readonly MonitorTextColour[];
export const ROOM_FIVE_MONITOR_PAGE_HOLD_SECONDS = [MONITOR_DIALOGUE_TIMING.pageHoldSeconds,
  MONITOR_DIALOGUE_TIMING.pageHoldSeconds / 2, MONITOR_DIALOGUE_TIMING.pageHoldSeconds] as const;

export class RoomFiveMonitor extends ProximityContainmentMonitor {
  constructor(resources: ContainmentArtResources) {
    super(resources, { roomId: 5, position: ROOM_FIVE_MONITOR_POSITION, yaw: Math.PI,
      dialogue: new ContainmentMonitorDialogue(ROOM_FIVE_MONITOR_SCRIPT,
        { sectionPageHoldSeconds: ROOM_FIVE_MONITOR_PAGE_HOLD_SECONDS }),
      sectionColours: ROOM_FIVE_MONITOR_COLOURS, trigger: ROOM_FIVE_MONITOR_TRIGGER });
  }
}
