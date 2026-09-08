# Cultivation Room 4: elevator descent

In the development build, enter Level 2 with **0**, then press **4** to restore
both slimes at the elevator checkpoint. The F2 panel also has a Room 4 button.
Room 3 opens directly onto the boarding area, with no connecting passage.
The doorway stays green/unlocked and opens automatically on approach. It is fixed
at Room 3's exit, five metres behind the lift deck. The elevator independently
requires both bodies fully aboard for 1.5 seconds before starting its 60-second
clock. The entrance and its landing scroll upward continuously with the shaft;
the door stays at its world landing rather than travelling with the lift. There
is no instantaneous replacement wall at the start of descent.
A deck-edge safety guard rises during boarding confirmation, before the old
landing scrolls away. It prevents either slime stepping into the rear gap.

The platform stays fixed in local coordinates while shaft modules scroll past.
The motion curve accelerates for two seconds, cruises until 57 seconds, and
brakes until 60. This keeps jumping, inactive bodies, camera movement and acid
projectiles in the same stable physics frame. The arrival shield closes during
the 1.5-second pause, while the end of the shaft passes above the landing.
The arrival shutter opens a small vent directly in the wall beside the deck;
there is no separate bottom landing room. Yellow shaft bars recycle only above
the winch roof, and the arrival shield is offset from their final position.
The vent shutter uses the shaft's dark material and retracts behind its header;
it is not a bright box visible on the wall throughout the ride.

## Authoring and tuning

- `LevelTwoRoomFourGreybox.ts` owns geometry, doors, shaft modules, and cable anchors.
- `CultivationRoomFourController.ts` owns boarding, authoritative time, arrival,
  objectives, and the immutable wave schedule: 2 drones at 15/17 seconds;
  4 at 30/32/34/36; and 6 at 45–52.5 (1.5-second spacing). There is no fourth wave.
- `ElevatorDroneEncounter.ts` reuses SecurityDrone, DissolveSystem,
  DroneProjectileSystem and SlimeDamageSystem. Room 3's reinstalling drone
  lifecycle is independent of this encounter.

Each of the 12 drones starts 30 metres above the platform. Approach speeds are
7 metres/second for wave 1, 9 for wave 2, and 14 for wave 3.
Target acquisition begins at 12 metres; firing is gated until
8 metres. Unresolved drones creep toward a critical five-metre height. Shots
travel at 24 metres/second and deal 15 damage. Acquisition warns for 0.8 seconds;
volleys repeat every 0.9 seconds. Drones are 50% larger than the initial version.
Their soluble cables stretch from the top of the drone to roof winches at 44 metres,
updating collision and appearance together. At most eight approaching/firing drones are
admitted; overdue spawns wait for capacity. Target preference follows the active
slime with a 1.5-second retarget cooldown. Both bodies remain damageable.

One acid hit starts the existing 0.8-second automatic dissolve and immediately
disables that drone. Its solid wreck falls onto the deck or an earlier wreck,
remains jumpable after arrival, and clears on restart. A swept falling-body hit
ejects Bob or Goop fully clear with the dropping-platform 24m/s sideways and
12m/s upward knockback. Drone bodies are acid-resistant. Arrival clears all
remaining live threats without requiring every cable to be destroyed.
Centre-front wrecks drift sideways while falling, keeping the vent approach
clear. Reset restores their original winch coordinates as well as their height.

Retry resets both bodies to the boarding checkpoint, cancels burns/projectiles,
restores all cables, hides pending targets, restores health, and resets the clock
and doors. Neither Room 3 nor Room 4 advances a single slime's checkpoint ahead
of the other. Bob arriving alone in Room 3 still recovers at Room 2's entrance,
where he can return to the button and let Goop through.

## Blender

Export only Room 4 without overwriting Rooms 2–3:

```sh
node scripts/export-level-two-blender.ts '../Levels/Level 2/Blender' 4
```

Use `scripts/build-room-blend.py` to convert `Room4.scene.json` to `Room4.blend`.
Preserve object names and metadata when editing. Blender coordinates map to
TypeScript as `(X,Y,Z) = (x,-z,y)`. The snapshot contains starting geometry;
wave timing and animation stay in TypeScript. Pending cable anchors are in the
hidden-runtime collection. Final art, audio assets, and shaft effects remain
presentation work; the grey-box includes functional lighting and status cues.

## Verification

The encounter tests cover boarding cancellation, the full schedule, one-hit
corrosion, overlap/cap behavior, arrival cleanup, shared checkpoint promotion,
and repeated resets with stable collider counts. The Level 2 integration tests
also check Room 4 spawn clearance and registration of moving doors/shield.
