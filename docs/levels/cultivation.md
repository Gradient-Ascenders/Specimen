# Cultivation

Cultivation is Level 2 and is owned by `CultivationLevelRuntime`, its scene and
room controllers, `CultivationCheckpointManager`, and the Bob/Goop persistent
pair. It receives only the Level 1 progression snapshot and creates fresh level
resources.

## Progression and checkpoints

The five-room route combines split-body traversal, radiation, soluble supports,
a Bob-held door control, security drones, an elevator descent, network controls,
Volt rescue, and a three-body exit. Sensors evaluate stable body IDs rather than
the active camera owner. When a boundary requires both bodies, partial occupancy
does not advance the authoritative room.

Checkpoint definitions store separate body anchors, active identity, room
boundary, and the minimum progression flags needed for recovery. Room state
remains with resettable owners. Failure cancels transient work, resets the
authoritative puzzle group, validates anchors, recovers the group, restores
active identity/camera state, and resumes after Retry presentation.

## Room summary

1. Room 1 establishes the Bob/Goop split and radioactive-floor rule.
2. Room 2 combines soluble supports with a Bob-only sticky wall control and a
   Goop route through a safe, obstruction-aware blast door.
3. Room 3 brings both paths through drone and acid/cover interactions.
4. Room 4 is the authored elevator descent and combat/traversal sequence.
5. Room 5 splits Bob's adhesive security route from Goop's acid/sewer route.
   Goop manipulates exclusive security networks; Bob completes the release;
   Volt joins the persistent roster. All three must regroup and power the exit.

Radiation response is slime-definition data: Bob is lethal and Goop is immune.
Inactive bodies are still evaluated. Security drones and soluble targets use
the existing shared hazard/ability contracts rather than room-local damage
implementations.

## Completion and verification

Completion emits `level-3` only after Volt is unlocked and all three bodies meet
the authored exit requirements. Verify both orders at dual-body boundaries,
failure before and after each checkpoint, door obstruction, soluble support
reset, elevator reset, network switching, drone destruction, Volt rescue, and
three-body exit. A full restart returns to Cultivation's initial state and must
not retain Volt or final-room progress.
