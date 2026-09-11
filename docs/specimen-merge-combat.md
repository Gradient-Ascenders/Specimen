# Specimen merge, movement, and electric-acid combat

Issue #127 adds the merged Specimen gameplay layer on top of the Blackout
runtime. It deliberately stops before Room 4A cinematics and Sentinel boss
authoring. The implementation exposes deterministic gameplay/read-model
contracts for #128, #129, #133, #136, and #137.

## Controlled form and phase ownership

`BlackoutPhaseController` remains the single level-phase authority. A separate
`SpecimenFormController` owns only which physical form participates in player
gameplay:

- `group`: Bob, Goop, and Volt remain persistent and switching can operate in
  the phases that already allow it.
- `specimen`: one dedicated merged body owns locomotion, camera, powered
  carrier participation, hazards, out-of-bounds checks, and combat.

The Specimen is not inserted into `SlimeManager` or the ordinary unlockable
roster.

Merge is a six-second fixed-step transition. `beginMerge()` validates the
authored merged anchor before changing phase, clears held input, Volt's live
tether, transient combat state, and aim presentation, then enters `merging`.
The original bodies remain the same objects but stop participating in hazards,
carrier obstruction, and gameplay once the merged handoff completes. A second
request while the transition is active is a no-op.

At the completion step the merged anchor is validated again before the Specimen
body moves. If the anchor became unsafe during staging, the handoff is aborted
without moving a body.

Split is explicit rather than timer-owned by #127. `beginSplit()` validates
all three authored anchors and enters `splitting`. Presentation/cinematic work
calls `completeSplit()`; the anchors are validated again before any original
body moves, Bob becomes active, and phase advances to `escape`.

## Merged body

The Specimen uses a dedicated `KinematicBody` with a **0.675 m radius**. It
retains normal locomotion/gravity tuning and enables the existing Bob-derived
charged jump, rebound, and sticky adhesion behavior. Weight is therefore a
presentation concern rather than a hidden movement slowdown.

The same `CameraRig` follows the Specimen. Holding RMB uses the existing
near-first-person aim presentation and centre-ray authority. No second camera
or aim coordinate system is introduced.

## Electric-acid charge model

`SpecimenProjectileSystem` owns attack input and all projectile simulation.

A charge starts only from a fresh LMB press while:

- Specimen is the participating form in `specimen` or `boss`;
- gameplay input is enabled;
- pointer lock is held;
- RMB aim is held;
- cooldown is complete.

The single authoritative value is:

`chargeAmount = clamp(heldSeconds / 1.5, 0, 1)`

That same value drives:

| Property | Formula |
| --- | --- |
| Damage | `1 + 2 * chargeAmount` units |
| Cooldown | `0.35 + 0.45 * chargeAmount` seconds |
| Splash radius | `3 * chargeAmount` metres |
| Projectile radius | `0.10 + 0.10 * chargeAmount` metres |

Projectile speed begins at **30 m/s**, maximum range at **60 m**, and maximum
lifetime at **2 s**. These values are configurable starting defaults rather
than boss balance commitments.

A press/release observed in one fixed step fires an uncharged normal shot.
Holding at full charge does not auto-fire. The full-charge event is emitted
once per charge. Aim release, pointer/focus cancellation, pause, death,
recovery, restart, boss-defeat takeover, and form takeover cancel charging
without firing. Held LMB cannot begin another shot without a fresh press.

## Bounded projectile pool and collision

The system preallocates **12 projectile slots**. Slots and public read-state
objects are reused for the lifetime of the system. A release while all slots
are live is rejected; no live shot is replaced and no cooldown begins.

The camera ray chooses an aim point, while the authoritative launch direction
starts from the Specimen body. Launch clearance is sphere-swept on the
projectile collision layer so an offset camera cannot shoot through a nearby
wall or floor.

Every live projectile sphere-sweeps its travelled fixed-step segment. The first
blocking hit resolves once and immediately despawns that slot. Range/lifetime
expiry is likewise deterministic.

## Explicit combat targets

`CombatTargetRegistry` is the only source of attack eligibility. Visual
appearance, material, mesh name, soluble state, and electrical compatibility do
not imply combat vulnerability.

A target registers:

- a stable logical target ID;
- one or more explicit hit meshes;
- combat-active state;
- a splash anchor;
- an impact response.

Registration identity is stronger than the authored string ID. Removing a
target and registering a later replacement with the same ID cannot inherit a
stale live registration.

Impact payloads include projectile ID, logical target ID, charge amount,
full-charge state, damage, direct/splash classification, impact point, and
direction.

### Armour and weak points

The reusable fixture adapter supplies three policies:

- **ordinary**: accepts normal direct and splash damage;
- **reinforced**: requires a **direct, fully charged** hit;
- **weak-point**: rejects all damage while closed and accepts direct impacts
  only while open.

The contracts are intentionally boss-agnostic. #129 owns Sentinel health,
phase progression, armour layout, and attacks.

## Charged splash

Splash uses the same charge-scaled radius and damage. Candidates are enumerated
in stable registry order and collected **before** any reaction is applied.
This means destroying cover or unregistering a target during the direct-hit
callback cannot reveal an additional target inside the same blast.

The direct target receives direct damage only; it is omitted from the splash
set even if it owns multiple hit meshes. Other candidates receive linear
distance attenuation and require line of sight from the impact point. Ordinary
world geometry can therefore occlude the area attack.

The Specimen body is never registered as a combat target, so there is no
self-damage or implicit chaining explosion.

## Opt-in drone destruction

Existing SecurityDrone instances remain non-destructible by default.
`SecurityDroneCombatTarget` is an explicit adapter that uses small owner hooks
on `SecurityDrone` to:

- clear hostile projectiles;
- disable targeting/firing;
- unregister movement/projectile collision and its surface entry;
- hide drone presentation.

Reset restores the same drone object, authored collider/surface registration,
visibility, and enabled AI without reconstructing the level.

## Checkpoints and recovery

Blackout snapshots now carry plain serializable:

- `controlledForm`;
- original Bob/Goop/Volt positions and active identity;
- optional Specimen position;
- room/phase state;
- registered device/combat participant state.

CP8 and CP9 are authored as Specimen checkpoints with **0.675 m clearance**.
Recovery first resets transient systems and restores puzzle/device/combat
participants. It then validates the body that will actually participate in the
restored form.

- group checkpoint: validate and recover Bob, Goop, and Volt;
- Specimen checkpoint: validate and recover Specimen only, leaving the original
  body objects unmoved.

No participating body moves before validation succeeds. CP8 restores stable
Specimen directly without replaying merge. Full restart restores the original
three-slime entry state. Charge, cooldown, live projectiles, merge staging, and
aim effects are reset rather than serialized.

## Fixed-step ordering

During ordinary merged gameplay Blackout updates in this order:

1. Specimen movement and charged jump;
2. Volt system maintenance with gameplay input disabled for the hidden form;
3. Specimen aim/charge/projectile simulation;
4. powered-device propagation and mechanical movement using the participating
   Specimen carrier only;
5. electrical tether revalidation/power recomputation;
6. electrical hazards using only participating carriers;
7. participating-form out-of-bounds handling.

During `merging` and `splitting`, player locomotion and combat are frozen.
Original bodies remain alive as persistent objects but are excluded from those
participation lists.

## Development harness and presentation

`SpecimenCombatDevelopmentRig` provides independent proof fixtures for:

- ordinary damage;
- reinforced full-charge armour;
- closed/open weak-point behavior;
- open and covered splash targets;
- an opt-in destructible drone;
- an authored sticky wall.

The final Room 4A and boss layouts remain downstream work.

The temporary presentation is deliberately bounded: a red 0.675 m Specimen
proxy, one point light, shared first-person camera transition, a fixed-size
InstancedMesh for pooled projectiles, a centre crosshair, SPECIMEN label, and a
charge meter. Gameplay read models/events own truth so #133/#136/#137 can
replace this treatment without moving authority.

## Starting values

| Setting | Value |
| --- | ---: |
| Specimen radius | 0.675 m |
| Merge duration | 6 s |
| Full attack charge | 1.5 s |
| Cooldown | 0.35–0.8 s |
| Projectile speed | 30 m/s |
| Projectile range | 60 m |
| Projectile lifetime | 2 s |
| Projectile pool | 12 |
| Projectile radius | 0.10–0.20 m |
| Damage | 1–3 units |
| Splash radius | 0–3 m |
