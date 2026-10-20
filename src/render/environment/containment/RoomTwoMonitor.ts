import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { ProximityContainmentMonitor } from './ContainmentMonitor.ts';
import { ContainmentMonitorDialogue } from './ContainmentMonitorDialogue.ts';
import type { MonitorTextColour } from './ContainmentProceduralTextures.ts';

// Centre of the clean east-wall panel, level with the adjacent sticky membrane.
export const ROOM_TWO_MONITOR_POSITION = Object.freeze({ x: 14.65, y: 7.73804, z: 31.7 });
// A three-dimensional bubble around the side-jump platform, not the screen:
// standing on the floor below or on the upper return route must not trigger it.
export const ROOM_TWO_MONITOR_TRIGGER = Object.freeze({
  centre: Object.freeze({ x: 4.2, y: 4.56, z: 31.0999 }), radius: 3,
});
export const ROOM_TWO_MONITOR_SCRIPT = Object.freeze([
  'Subject exhibits remarkable elastic resilience.',
  'Could the specimen be impervious to laser radiation?',
  'We will observe',
]);
export const ROOM_TWO_MONITOR_COLOURS = ['red', 'green', 'red'] as const satisfies readonly MonitorTextColour[];

export class RoomTwoMonitor extends ProximityContainmentMonitor {
  constructor(resources: ContainmentArtResources) {
    super(resources, { roomId: 2, position: ROOM_TWO_MONITOR_POSITION, yaw: -Math.PI / 2,
      dialogue: new ContainmentMonitorDialogue(ROOM_TWO_MONITOR_SCRIPT),
      sectionColours: ROOM_TWO_MONITOR_COLOURS, trigger: ROOM_TWO_MONITOR_TRIGGER });
  }
}
