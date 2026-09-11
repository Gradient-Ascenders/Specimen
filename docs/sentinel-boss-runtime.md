# Sentinel boss runtime

Issue #129 implements the deterministic Sentinel backend used by Level 3's
Room 4B encounter. Arena geometry remains #130, final boss presentation remains
#134, and boss audio remains #137.

## Ownership

Three state machines have deliberately separate authority:

- `BlackoutPhaseController` owns the Level 3 macro flow:
  `specimen -> boss -> boss-defeated -> splitting`.
- `SentinelBossController` owns the complete encounter inside `boss`.
- each `SentinelAttack` owns only its own
  `telegraph -> active -> recovery -> complete` lifecycle.

Presentation and audio read state/events. They never decide when damage,
vulnerability, attack timing, or phase progression happens.

## Encounter state graph

The Sentinel uses:

```text
idle
  -> intro
  -> phase-1
  -> vulnerable-1
       | failure to break armour -> phase-1
       | break layer 1          -> phase-2
  -> vulnerable-2
       | failure to break armour -> phase-2
       | break layer 2          -> phase-3
  -> vulnerable-3
       | failure to break armour -> phase-3
       | break layer 3          -> final-vulnerable
  -> final-vulnerable
       | timeout                 -> phase-3
       | full charged direct hit -> defeated
```

A missed vulnerability window therefore never skips progression and never
softlocks the encounter. Partial armour damage is retained when the same phase
repeats.

## Starting tuning

All values are authored configuration rather than hidden constants.

| Setting | Initial value |
| --- | ---: |
| Intro | 2.5 s |
| Armour layers | 3 |
| Armour health per layer | 3 units |
| Standard vulnerability | 5.0 s |
| Final vulnerability | 6.0 s |
| Phase 1 drones | 2 |
| Phase 2 drones | 3 |
| Phase 3 drones | 4 |
| Maximum simultaneous drones | 4 |
| Hostile projectile pool | 16 |
| Drone health | 2 units |
| Sweep warning / active / recovery | 1.0 / 2.8 / 0.9 s |
| Phase 2 rotating laser | 2 beams, 3.8 s active |
| Phase 3 rotating laser | 3 beams, 3.2 s active |
| Shockwave | 13 m development radius |

#130 is expected to retune spatial values against the final arena.

## Deterministic phase scripts

The development composition currently exercises:

### Phase 1

1. sweeping laser;
2. two-drone wave;
3. vulnerability window.

### Phase 2

1. two-beam rotating laser;
2. shockwave;
3. three-drone wave;
4. vulnerability window.

### Phase 3

1. faster reverse sweep;
2. three-beam rotating laser;
3. four-drone wave;
4. first shockwave;
5. second faster shockwave;
6. vulnerability window.

No random selection is used. An attack cannot begin until the previous
attack's recovery stage completes.

## Attack contract

Every Sentinel attack implements the same lifecycle:

```ts
interface SentinelAttack {
  readonly id: string;
  readonly readModel: SentinelAttackReadModel;
  readonly isComplete: boolean;

  start(context: SentinelAttackContext): void;
  update(deltaSeconds: number, context: SentinelAttackContext): void;
  cancel(reason: SentinelAttackCancelReason): void;
  reset(): void;
  dispose(): void;
}
```

All attacks expose `idle`, `telegraph`, `active`, `recovery`, and
`complete` stages. The common timed base consumes large fixed-step deltas
across stage boundaries and aborts immediately if a synchronous failure/reset
callback cancels the attack.

That last rule is important: lethal contact may call Blackout recovery from
inside an attack update, so no remainder of the old attack may execute after
ownership changes.

## Weak point and damage

`SentinelWeakPointTarget` is registered once with the existing
`CombatTargetRegistry`. Vulnerability changes controller state rather than
replacing target identity.

Closed armour remains physically hittable. Impacts return
`weak-point-closed` instead of becoming anonymous world hits, allowing
graphics/audio to present rejected strikes.

During the three armour vulnerabilities:

- direct normal, partial, and fully charged Specimen attacks are accepted;
- splash is rejected;
- damage comes directly from #127's authoritative `CombatImpact.damageUnits`;
- current armour damage persists if the window times out;
- breaking a layer closes the target immediately before the phase transition.

That immediate close prevents multiple projectiles in one fixed step from
overflowing one armour layer into the next.

### Final core rule

The final exposed core requires **one direct fully charged blast**.

Normal or partial-charge direct hits are rejected with
`charge-required`. Splash remains rejected. A valid final hit closes the weak
point immediately, then the controller commits defeat on its following update
boundary.

## Defeat precedence

During Blackout boss gameplay the ordering is:

1. Specimen movement;
2. Specimen aim/charge/projectile simulation;
3. Sentinel weak-point damage resolution;
4. Sentinel controller update and pending defeat commit;
5. only if the boss is still alive, environment/device hazards continue;
6. participating-form out-of-bounds handling.

Consequently a valid final boss hit wins over a later hazard that would have
occurred in that same fixed step.

The Sentinel controller emits `defeated` and
`finalCinematicRequested` once. Blackout consumes a one-shot defeat request
and is the only owner allowed to commit the macro `boss-defeated` phase.
External callers cannot skip directly to that state.

## Sweeping and rotating lasers

Both attacks reuse `LaserHazard` and `LaserHazardSystem`.

Telegraph:
- authored beam geometry exists for presentation;
- the circuit gate is disabled;
- contact is non-lethal.

Active:
- the circuit gate enables;
- deterministic `LaserHazard` sweep timelines advance;
- the actual Specimen sphere is tested;
- the first group contact owns the single failure request.

Recovery:
- beams are gated off again.

Reset/cancel returns authored laser poses, clears contact latches, and disables
lethality. No separate boss beam collision implementation exists.

## Shockwave

`SentinelShockwaveAttack` is a gameplay-only radial authority. Presentation
can later render its public radius however it chooses.

During active state the wave expands at a fixed rate. Collision compares the
previous and current wave radii against the Specimen's previous/current radial
position, so a fast ring cannot tunnel through the player between fixed steps.

The hazard is jumpable: once the bottom of the Specimen sphere is above the
authored lethal wave height it no longer contacts the ring.

Cancel/reset sets both current and previous radii to zero and clears the
one-contact latch.

## Drone waves

Boss drones are separate from the older Bob/Goop `SecurityDrone` targeting
contract because merged Specimen is a distinct controlled form.

`SentinelDroneSquad` preallocates exactly four reusable drone objects and one
16-slot hostile projectile pool.

Phase waves deploy 2, 3, then 4 slots. No fifth drone can be authored through
the squad contract.

Each deployed drone is an explicit `CombatTarget` with 2 damage units of
health. Destruction:

1. marks the preallocated slot inactive;
2. clears its owned hostile projectiles;
3. unregisters its projectile/LOS collider;
4. hides the proxy;
5. stops further firing.

The other drones continue independently. If the player destroys an entire wave,
the drone attack may move immediately to recovery.

Hostile shots continuously sweep against both world geometry and the moving
Specimen sphere. A collision requests the existing Blackout failure/death path;
the boss does not introduce a separate player health system.

Pool exhaustion skips a hostile shot rather than allocating or replacing a
live projectile.

## Checkpoint policy

The preferred boss retry remains CP8/full-fight restart, matching #130.

`SentinelBossController` is nevertheless a Blackout checkpoint participant so
optional CP9 remains structurally possible.

Snapshots contain only plain stable encounter data:

- boss state;
- broken armour count;
- current armour health;
- core health.

They never contain live attacks, lasers, drones, hostile projectiles, callbacks,
or collision objects.

Capture is allowed only at stable encounter boundaries:
- idle;
- defeated;
- the start of an attack phase before its first attack begins.

Attempting to capture during intro, a live attack, or a vulnerability window
throws in development instead of serializing a half-complete hazard.

Recovery order remains:

1. live Sentinel attack/transients cancel;
2. PuzzleRegistry resets authored boss resources;
3. checkpoint participant restores stable boss state;
4. Blackout validates the participating Specimen spawn;
5. Specimen recovers;
6. camera/input/death UI ownership resumes.

## Reset and disposal

`reset()` is idempotent and always returns:

- `idle`;
- three pristine armour layers;
- 3 units on the current layer;
- pristine final core;
- closed weak point;
- no active attack;
- zero drones;
- zero hostile projectiles;
- reset/gated lasers;
- zero shockwave radius;
- defeat/cinematic one-shot flags cleared.

The development rig disposes controller attacks before unregistering the
weak-point target, then disposes the drone squad and its target registrations.
Construction rollback follows the same dependency order.

## Development rig

`SentinelBossDevelopmentRig` exists only so #129 is executable before #130 and
#134 land. It includes:

- a simple Sentinel proxy;
- one explicit weak-point collider;
- authored laser origins;
- four fixed drone anchors;
- one shockwave origin;
- the complete deterministic phase script.

#130 should replace those positions with the real arena. #134 should replace
the proxy visuals/telegraphs. Neither issue should move gameplay timing or
damage authority out of this backend.

## Downstream integration

### #130 — arena

Provides final:
- boss location;
- cover;
- laser origins/end ranges;
- drone spawn anchors;
- shockwave radius/height;
- traversal-safe weak-point angles;
- optional CP9 placement.

### #134 — graphics

Reads:
- Sentinel boss state/read model;
- current attack ID/stage/progress;
- weak-point open/closed/defeated state;
- laser authoritative endpoints;
- shockwave authoritative radius;
- drone active state.

Presentation does not mutate encounter state.

### #137 — audio

Subscribes to boss and attack events for:
- activation;
- attack warnings;
- active/recovery transitions;
- weak-point open/close;
- armour damage/break;
- phase changes;
- final charge rejection;
- defeat/cinematic request.

Loops must stop on pause, failure, reset, phase change, and disposal without
becoming gameplay timers.
