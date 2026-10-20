import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { ProximityContainmentMonitor } from './ContainmentMonitor.ts';
import { ContainmentMonitorDialogue } from './ContainmentMonitorDialogue.ts';
import type { MonitorTextColour } from './ContainmentProceduralTextures.ts';

// Low on the clean east-entry panel, left of the first sticky-wall installation.
export const ROOM_THREE_MONITOR_POSITION = Object.freeze({ x: 16.65, y: 12.85, z: 53.2 });
// The pictured gap platform is wider than Room 2's side-jump platform. Include
// all of its corners, without activating at the entrance or on the upper route.
export const ROOM_THREE_MONITOR_TRIGGER = Object.freeze({
  centre: Object.freeze({ x: 11.2583, y: 12.1429, z: 59 }), radius: 3.5,
});
export const ROOM_THREE_MONITOR_SCRIPT = Object.freeze([
  'Another Acid leak?',
  'Due to Goop’s poor behavior',
  'His termination may be considered',
]);
export const ROOM_THREE_MONITOR_COLOURS = ['green', 'red', 'red'] as const satisfies readonly MonitorTextColour[];

export class RoomThreeMonitor extends ProximityContainmentMonitor {
  constructor(resources: ContainmentArtResources) {
    super(resources, { roomId: 3, position: ROOM_THREE_MONITOR_POSITION, yaw: -Math.PI / 2,
      dialogue: new ContainmentMonitorDialogue(ROOM_THREE_MONITOR_SCRIPT),
      sectionColours: ROOM_THREE_MONITOR_COLOURS, trigger: ROOM_THREE_MONITOR_TRIGGER });
  }
}
