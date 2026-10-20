/** Room-5-local positions shared by the real wall aperture and the movie. */
export const VOLT_FINALE_VENT = Object.freeze({
  x: 20.25, y: 27.8, z: 61.5, dropX: 42, branchX: 27,
  inspectionX: 48, endX: 54, roomBackZ: 52.5,
});

// Raise the actual extraction cell to Bob's level. The scanner can now face
// him almost level, while Volt boards from the neighbouring cell's front lip.
export const VOLT_FINALE_CELL = Object.freeze({ y: 31, scannerY: 29.9 });
// Includes the scout's antenna, not just its ceramic deck. The panel's lower
// face sits just above that silhouette when it finishes tipping over.
export const VOLT_FINALE_COVER = Object.freeze({ droneY: 27.81, restOffsetY: .95 });

// The scout's ceramic deck is 0.30 m above its origin. The approved slime
// assets have their resting sole at -0.45 m: embed it by 1 cm, not in mid-air.
export const VOLT_FINALE_RIDER_OFFSETS = Object.freeze({
  bob: [-.42, .74, -.12], volt: [.42, .74, .12],
} as const);
