# Gameplay contracts

Specimen is a single-player puzzle-platformer. Inactive bodies remain in the
world and can hold controls, complete circuits or illuminate a route.

| Body | Role |
| --- | --- |
| Bob | Adhesion, wall traversal and charged bouncing. |
| Goop | Acid shots, soluble geometry and radiation-safe routes. |
| Volt | Light, electrical connections and maintenance-drone operation. |
| Specimen | Merged late-game body with charged attacks and dash. |

WASD moves, the mouse looks, Space jumps, Tab switches and P pauses. Aim and
fire use the configured mouse bindings; M mounts/dismounts the maintenance
drone. While mounted, Space ascends and Shift descends. Settings owns rebinding.
F1 hides non-aiming HUD elements without pausing simulation or audio.

## Movement and abilities

`KinematicBody` sweeps a sphere against authored collision boxes. Grounding,
slopes, adhesion, jumping and carrier motion use contact state. Visual mesh
orientation and deformation never determine collision. `CameraRig` follows the
authoritative body and resolves obstruction independently of character art.

`SlimeManager` owns the available roster and active identity. Switching clears
transient controls and retargets camera/presentation without moving inactive
bodies. Goop's dissolve system and Volt's electrical system own their targets,
connections and cleanup. Presentation reads their results.

Cultivation and Blackout can regroup eligible idle slimes along authored safe
walks. `CompanionRegroup` drives the existing body through ordinary input and
collision checks. Switching returns control immediately. Assisted routes must
respect puzzle eligibility, obstructions and floor support; ability use,
platform jumps and combat remain player tasks. Pause, recovery and cinematic
handoffs clear companion input.

## Puzzles, hazards and recovery

Shared puzzle components own their state and deterministic reset. Hazards,
projectiles and combat targets use registered collision/damage contracts.
Triggers evaluate stable body IDs, including inactive bodies. Visual visibility
must not silently disable gameplay registration.

Checkpoint snapshots contain serializable progress and validated body anchors.
Retry resets transient attacks and mechanism state before restoring the group,
active identity, camera and UI. A failed anchor validation must not partially
move the group. Full restart returns to the selected level's initial state.

For changes to these contracts, exercise both active and inactive bodies,
switching on moving supports, pause, death/Retry, checkpoint recovery and full
restart. See [level ownership](levels.md) and [runtime lifecycle](architecture/runtime.md).
