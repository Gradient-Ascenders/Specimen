# Blackout

Blackout is Level 3. `BlackoutLevelRuntime` creates fresh Bob, Goop, and Volt
bodies, validates the incoming roster snapshot, and owns checkpoints, powered
devices, maintenance-drone traversal, the merge/Specimen phases, and the
Sentinel encounter.

## Checkpoint and phase model

`BlackoutCheckpointManager` supports the authored CP1–CP9 sequence. Snapshots
contain plain data: checkpoint ID, three positions, active identity, room/phase,
connection state, and participant state. Live meshes, callbacks, electrical
arcs, and projectiles are excluded.

Recovery first disconnects live systems, then resets puzzle geometry, clears
participant transients, restores serialized state, validates all three anchors,
recovers the group, and restores identity/camera/HUD. A failed validation leaves
all bodies unmoved. Volt tethers never survive Retry or restart.

The macro phase sequence is:

```text
three-slime -> merging -> specimen -> boss -> boss-defeated
  -> splitting -> escape -> complete
```

Only the phase controller advances this sequence; room, boss, presentation, and
audio systems request or reflect transitions.

## Authored route

Room 1 establishes Volt's maintenance drone and local electrical devices. While
mounted, WASD moves horizontally, Space ascends, Shift descends, and M
dismounts. Aim freezes authoritative flight velocity. Mounting is Volt-only and
cannot carry stale input across pause, switch, or recovery.

Room 2 is the powered transit gauntlet. Volt reveals and powers infrastructure,
Goop changes retained cover, and Bob traverses lifts, sticky sections, lasers,
and drones. The final bridge requires Bob to hold a switch until Volt reaches
and powers the far contact. Room-scoped electrical range must not leak back into
Room 1.

The final sector merges the three bodies into Specimen and runs the deterministic
Sentinel encounter. The boss owns three armour phases and a final exposed core;
missed vulnerability windows return to the current phase without skipping
progress. Boss attacks reuse shared laser/projectile contracts and preallocated
pools. A valid final hit takes precedence over later same-step hazards.

## Verification focus

Verify each checkpoint and room shortcut resets the same authored state as
normal entry. Exercise drone mount/dismount and failure, electrical range and
line of sight, early room arrival, lift riding while switching, bridge
cooperation, hazard Retry, merge/split cleanup, every Sentinel phase, missed
vulnerability windows, and repeated final-hit attempts. Full restart returns to
Blackout's opening with three separate bodies and no live tether/projectile.
