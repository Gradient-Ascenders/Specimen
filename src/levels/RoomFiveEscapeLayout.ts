/** Shared gameplay/cinematic dimensions, in the authored Room 5 world coordinates. */
export const ROOM_FIVE_ESCAPE = Object.freeze({
  floorY: 74.75,
  wallZ: 125.5,
  ventWidth: 1.8,
  ventHeight: 1.65,
  coverSize: [2.35,1.8,.9] as const,
  coverPosition: [0,75.65,124.72] as const,
  neckEndZ: 128,
  ductHalfWidth: 1.6,
  ductCeilingY: 77.05,
  ductEndZ: 142,
  drop: Object.freeze({x:0,y:74.75,z:138.5,width:2.6}),
});
