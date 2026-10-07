# Slimes and abilities

## Roster and switching

Stable identities are `bob`, `goop`, and `volt`. `SlimeManager` owns which are
available and which is active. Switching changes input, camera, and HUD
ownership only: inactive bodies remain registered and keep their positions,
contacts, pressure-plate occupancy, and passive state.

Containment begins with Bob and unlocks Goop. Cultivation carries Bob and Goop
through the level and unlocks Volt in its final room. Blackout creates all three
from the progression snapshot. Level transitions reconstruct bodies; they do
not transfer live instances.

## Abilities

- **Bob** uses authored sticky surfaces and charged jumps. Adhesion is surface
  metadata, not visual detection.
- **Goop** aims with the camera and fires pooled acid projectiles. Only explicit
  dissolve/combat targets accept hits. Dissolve state is reversible on reset and
  collision changes are coordinated with the owning component.
- **Volt** acquires registered electrical targets within the active room's
  range and physical line of sight. Connections break on range, obstruction,
  input release, switching, recovery, or disposal. Devices, not Volt's visual
  effects, own powered and latched state.

Ability systems must gate on active identity. Switching cannot hide hazard
contact on an inactive body or grant another slime's immunity. Presentation
such as outlines, tethers, burn shaders, or lights mirrors the authoritative
state and clears immediately when that state ends.

## Persistent groups and recovery

Cultivation recovers Bob and Goop together, then includes Volt after rescue.
Blackout uses `PersistentSlimeGroup` for all three. Checkpoints store separate
validated spawn anchors and the active identity. Failure restores the complete
group transactionally so one slime cannot remain in stale room or puzzle state.

## Merged Specimen

Blackout's merge phase replaces individual control with the merged Specimen
form. `SpecimenFormController` owns phase and movement; the combat registry and
projectile pool own targets and impacts. Electric-acid charge affects explicit
damage values, and the Sentinel final core accepts only the authored fully
charged direct hit. Split/recovery transitions must clear live projectiles,
connections, and transient presentation before returning control to the three
bodies.
