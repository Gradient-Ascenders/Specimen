import { ContainmentMonitorDialogue, MONITOR_COLUMNS, MONITOR_ROWS,
  MONITOR_DIALOGUE_TIMING } from './ContainmentMonitorDialogue.ts';

export { paginateMonitorSections } from './ContainmentMonitorDialogue.ts';
export const ROOM_ONE_MONITOR_SCRIPT = Object.freeze([
  'Interesting...',
  'Specimen: Bob has awoken',
  'We are observing',
]);
export const ROOM_ONE_MONITOR_TIMING = Object.freeze({ delaySeconds: 6, ...MONITOR_DIALOGUE_TIMING });
export const ROOM_ONE_MONITOR_COLUMNS = MONITOR_COLUMNS;
export const ROOM_ONE_MONITOR_ROWS = MONITOR_ROWS;

/** Room 1 retains its six-second gameplay delay, independent of preload time. */
export class RoomOneMonitorDialogue extends ContainmentMonitorDialogue {
  constructor(sections: readonly string[] = ROOM_ONE_MONITOR_SCRIPT,
    columns = ROOM_ONE_MONITOR_COLUMNS, rows = ROOM_ONE_MONITOR_ROWS) {
    super(sections, { delaySeconds: ROOM_ONE_MONITOR_TIMING.delaySeconds, columns, rows });
  }
}
