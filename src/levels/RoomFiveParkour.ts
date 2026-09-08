import type { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

/** Deliberately authored landings, not evenly interpolated stairs. Y is the walking surface. */
export const ROOM_FIVE_JUMPS = [
  [[-14.5, 10.8, 28.2, 2.4, 2.4], [-10, 11.8, 31.5, 2.2, 2.2]],
  [[-15, 14.2, 40, 2.4, 2.4], [-15.5, 15.6, 44.5, 2.2, 2.6]],
  [[-12.5, 17.6, 54, 2.4, 2.4], [-11, 18.6, 57, 2.2, 2.2], [-7, 19.2, 61, 2.2, 2.4]],
  [[1.5, 20.8, 64.5, 2.4, 2.4], [6, 21.8, 63, 2.4, 2.4]],
  [[13.5, 23.8, 54, 2.4, 2.4], [14.8, 24.6, 49, 2.2, 2.2]],
  [[9.5, 26.8, 40, 2.4, 2.4], [5, 27.8, 37, 2.4, 2.4]],
] as const;

export function addRoomFiveParkour(b: GreyboxRoomBuilder): void {
  const m = b.materials;
  for (const [section, jumps] of ROOM_FIVE_JUMPS.entries()) {
    for (const [i, [x, y, z, width, depth]] of jumps.entries()) {
      const mesh = b.addCollider({ name: `room-5-route-${section}-jump-${i + 1}`,
        size: [width, .4, depth], position: [x, y - .2, z], material: m.platform });
      Object.assign(mesh.userData, { roomId: 5, routeBeat: ['staggered-entry', 'wall-ascent', 'switchback-climb', 'narrow-crossing', 'reverse-zigzag', 'final-wall-return'][section] });
      // Suspension keeps these obstacles visually part of a research installation.
      b.addVisualBox({ name: `room-5-route-${section}-hanger-${i}`, size: [.1, 38 - y, .1],
        position: [x + width / 2 - .14, (38 + y) / 2, z + depth / 2 - .14], material: m.cable });
    }
  }
}
