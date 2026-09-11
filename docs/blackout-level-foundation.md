# Blackout Level 3 runtime foundation

Issue #121 establishes the lifecycle contract used by all Level 3 rooms. It does not author the Volt tutorial, electrical devices, merge mechanics, Specimen combat, or the boss.

## Runtime handoff

GameSessionCoordinator owns the Level 2 -> Level 3 replacement. Only LevelProgressionSnapshot crosses the boundary. Level 2 is stopped, unloaded, and disposed before BlackoutLevelRuntime is loaded. Level 3 validates that Bob, Goop, and Volt are all unlocked and preserves the active identity.

Volt remains globally locked in the older roster definition. Level 3 opts into BLACKOUT_SLIME_DEFINITIONS, where all three rescued slimes are playable, so Level 1 cannot accidentally unlock Volt early.

## Three persistent bodies

PersistentSlimeGroup owns exactly one Bob, Goop, and Volt body for the Level 3 runtime. SlimeManager remains the single source of truth for active identity.

Switching changes active ownership only. It does not recreate, teleport, register, unregister, or advance the inactive bodies. This is deliberate for Blackout: parked slimes keep their exact authored positions while future puzzle systems can continue reading their colliders and passive state.

## Checkpoints

BlackoutCheckpointManager supports the complete CP1-CP9 identifier set:

- CP1: Room 1 start
- CP2: after the Volt tutorial
- CP3: Room 2 start
- CP4: after the central bridge puzzle
- CP5: Room 3 start
- CP6: before the reactor chamber
- CP7: before the final three-slime puzzle
- CP8: merged / immediately before the boss
- CP9: optional boss-phase checkpoint

Snapshots contain only plain serializable data: checkpoint ID, three body positions, active identity, room/phase state, connection state, and registered participant state. Three.js objects, callbacks, live meshes, projectiles, and live electrical arcs never enter the snapshot.

Room/device systems that need checkpoint persistence implement
BlackoutCheckpointParticipant. capture() returns serializable state,
resetTransient() clears live transient resources, and restore() applies the
captured authored state. Issue #123 registers the complete electrical-device
network as one participant: every device-local snapshot is restored before
derived upstream power is recomputed once, so restoration cannot depend on
device registration order.

## Recovery order

Recovery is transactional and ordered:

1. suspend player input;
2. explicitly disconnect live systems whose teardown can notify room devices (Volt's tether is cleared here by #122);
3. reset PuzzleRegistry components to their authored geometry/state;
4. run checkpoint-participant transient cleanup as an idempotent safeguard;
5. clone the authoritative snapshot;
6. restore registered doors, hazards, devices, and room-local participants;
7. validate all three spawn anchors against that restored room before moving any body;
8. recover Bob, Goop, and Volt together;
9. restore active identity and phase;
10. reset camera/input presentation and HUD;
11. resume gameplay only after recovery succeeds.

A failed safety validation leaves all three bodies unmoved. PuzzleRegistry remains
the reset authority for authored resettable geometry; checkpoint participants
add serializable state only where a plain reset is insufficient.

Live Volt tethers intentionally do not survive Retry or restart. #122 disconnects
the authoritative tether before PuzzleRegistry reset so a device's disconnect
notification cannot overwrite restored state. The checkpoint participant still
performs transient cleanup later as an idempotent safeguard. Electrical-device
participants restore checkpoint-authored powered or latched state independently.

Failure uses the existing DeathSequence deferred Retry path. The failure request retains checkpoint recovery until the player chooses Retry rather than mutating the room during the fatal fixed step.

## Phase hooks

The foundation exposes guarded phase transitions for later issues:

three-slime -> merging -> specimen -> boss -> boss-defeated -> splitting -> escape -> complete

Actual merge animation, Specimen gameplay, attacks, boss logic, and split presentation belong to their feature issues. Once complete is committed, the phase controller is terminal and the Level 3 completion event is emitted once.

## Resource ownership

BlackoutLevelRuntime owns the minimal foundation scene, collision/surface registries, all three bodies, temporary foundation visuals, Volt's foundation light, checkpoint authority, death UI/state, and camera target. Unload/dispose removes or disposes those resources and clears the camera/input ownership.

The foundation scene is intentionally small and dark. It exists only to prove Level 2 -> Level 3 integration and lifecycle behavior before authored Room 1 replaces it.
