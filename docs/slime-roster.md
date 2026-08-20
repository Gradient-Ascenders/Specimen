# Multi-slime roster and ability configuration

Issue #27 introduces the data/runtime boundary needed by later slime switching
and corrosive-interaction work. It intentionally does not implement switching,
Goop dissolve interactions, playable Volt, merge/split, or Level 3.

The official slime identities are:

- **Bob** — sticky and bouncy traversal slime.
- **Goop** — corrosive slime; cannot use Bob's sticky/bouncy traversal gates.
- **Volt** — future electrical slime; represented in configuration but locked
  for the current Beta scope.

## Stable identities

```text
SlimeId = 'bob' | 'goop' | 'volt'
```

Each identity has one immutable configuration describing display name, Beta
availability, initial unlock state, and adhesion/rebound/dissolve/electrical
capability gates.

| Slime | Beta | Initially unlocked | Adhesion | Rebound | Dissolve | Electrical |
| --- | --- | --- | --- | --- | --- | --- |
| Bob | playable | yes | yes | yes | no | no |
| Goop | playable | no | no | no | yes | no |
| Volt | locked | no | no | no | no | yes |

Volt's electrical capability is deliberately represented as configuration so
future systems have a stable hook, but `SlimeManager` refuses to unlock,
register, activate, or invoke it during Beta.

## SlimeManager ownership

`SlimeManager<Body>` is level-owned and generic over the concrete runtime body
type. In Level 1 it is `SlimeManager<KinematicBody>`.

The manager owns unlock state, runtime body registration, active/inactive
selection, availability, ability gating, and typed discrete roster events.
It does not construct/move/render/recover/dispose bodies and does not own raw
input or the level lifecycle.

## Availability model

```text
configured → Beta-playable? → unlocked? → body registered? → available → active
```

Goop is configured as Beta-playable but begins locked. A later level/system may
unlock it; Goop still cannot become active until its runtime body is registered.
Volt remains configured but Beta-locked.

## Ability gating

Configuration alone does not make an ability invokable. `canUseAbility()` also
requires runtime availability, and `invokeActiveAbility()` only executes its
callback when the active slime is available and owns the requested capability.

Thus Bob cannot invoke dissolve, Goop cannot invoke adhesion/rebound, and locked
Volt cannot invoke electrical behaviour despite its future-facing config.

## Level lifecycle

`GreyboxLevelRuntime.loadResources()` creates the current Bob body, creates the
level-owned manager, and registers Bob. `restartResources()` asks the manager to
revalidate active state while preserving unlocks/registrations. `unloadResources()`
clears runtime registrations and disposes the manager inside the existing level
teardown. No second restart/lifecycle path is introduced.

## Diagnostics and evidence

The F2 overlay exposes active slime, roster state, counts, Bob/Goop ability
configuration, and locked Volt electrical configuration.

**Check slime roster** runs a dependency-free regression covering Bob default
registration, Goop unlock/register/activate, ability rejection/permission,
Volt lock enforcement, restart stability, and unload clearing stale body refs.

Expected:

```text
Slime roster: PASS — Bob + Goop configs — Volt locked — ability gates enforced — restart stable — unload clear
```

## Deferred scope

No slime-switching input/UI, concurrent gameplay control, Goop world dissolve,
Volt gameplay, merge/split, or Level 3 content is implemented here.
