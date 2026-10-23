# Companion regrouping

Cultivation and Blackout automatically move eligible idle slimes along authored
walks to the next safe gathering point. Switching to a slime immediately returns
its movement to the player. The roster shows **Catching up** or **Waiting for a
clear path** while assistance is active.

Cultivation assists Goop through Room 1 once the controlled character reaches
Room 2, and through Room 2's lower passage while Bob holds its release button.
Once Goop has passed the entry shutter, he can finish the corridor after it
relocks. Room 3's lower walk becomes available only after all four ground drones
are disabled, remaining projectiles are gone, and the controlled character has
reached the far bank. Both slimes can then finish the safe approach to the lift.

Blackout assists Bob and Goop from the maintenance bay's far bank through its
main corridor, and Volt along the rising duct after his manual electrical-vent
crossing and turn. Transit assistance starts on the shared exit deck after the
bridge is locked, then gathers the group in boss staging. Platform jumps, wall
climbing, combat, bridge operation and special traversal remain player tasks.
An inactive Volt supplying power or mounted on the maintenance drone stays put.

The level controllers choose eligible routes; `CompanionRegroup` supplies input
to the existing `KinematicBody`. Collision, hazards, physical arrivals and
checkpoint promotion still use the real bodies. Forward collision and support
queries stop assistance at obstructions or missing floors. Only explicitly
marked floor lips permit an ordinary tap jump, with landing and headroom checks.
There are no catch-up teleports, ability automation or puzzle-state overrides.

Waypoints are resolved from the current position each fixed step. Pause, death,
retry and cinematic handoffs clear companion input and status; no destination
queue survives recovery. Uncovered or blocked paths can still require manual
movement. Extend assistance by authoring and testing additional safe walks,
including their puzzle eligibility, rather than broadening the bounds over
hazardous terrain.
