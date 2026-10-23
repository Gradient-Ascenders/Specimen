/** Shared art/solid layout. The staggered additions leave the 70 m inner
 * running lane and the main 82.5 m circuit clear, with cover on both sides. */
export const EXTERMINATION_LAIR_COVER = [
  ...Array.from({ length: 6 }, (_, i) => ({
    angle: -Math.PI / 2 + (i + .5) * Math.PI / 3, radius: 89,
    size: [8.5, 5.2, 4] as readonly [number, number, number], yaw: -(-Math.PI / 2 + (i + .5) * Math.PI / 3),
    template: ['Bastion', 'HeatSink', 'Capacitor'][i % 3]!,
  })),
  ...[-Math.PI / 6, Math.PI / 6, Math.PI * 5 / 6, Math.PI * 7 / 6].map((angle, i) => ({
    angle, radius: 76, size: [10.5, 5.6, 4.4] as readonly [number, number, number], yaw: Math.PI / 2 - angle,
    template: i % 2 ? 'HeatSink' : 'Bastion',
  })),
] as const;
