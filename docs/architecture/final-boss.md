# The Extermination Chamber

Implemented from the [original boss level plan](https://github.com/Gradient-Ascenders/Specimen/blob/1a213a0/docs/planning/boss%20level%20plan.md); initial investigation is in
`final-boss-investigation.md`. The optional fusion tutorial remains saved on
`feat/fused-slime-mechanics` at local commit `a70a1c9`, outside this branch.

## Route and local controls

Finish Level 3's transit cooperation puzzle, bring all three slimes into the
staging corridor and pass its gathering point. A six-second visual merge leads
into the boss deployment. The optional tutorial is not loaded.

For iteration, run `npm run dev` with `?debug=1`, enter Level 3 and let its
arrival finish, then press **4**. Existing **0** shortcuts advance earlier
levels; **1/2/3** retain their Level 3 destinations. Production without debug
ignores the Room 4 shortcut.

While in the boss room under `npm run dev`, press **I** or click the HUD's
**DEV · I · INVINCIBILITY** button to toggle player invincibility. It starts
**OFF**, blocks all boss/drone damage and death requests, and returns falls to
the safe ring spawn without resetting the fight. It persists through the phase
transition and pause; retry, restart and leaving the level reset it to OFF.
Production builds and `npm run preview` cannot enable it, including with
`?debug=1`.

- WASD moves; Space fully charges a jump in **.35 s** (Bob retains **.7 s**);
  right mouse optionally aims/zooms. Launch strength/gravity are unchanged.
- Tap/release left mouse fires electric goop: 2 direct damage.
- Hold left mouse **1.5 seconds**, release: 18 direct damage and up to **14 m**
  splash, with swept collision and cover/line-of-sight checks. Partial charge
  retains direct damage but has no area damage.
- Left mouse works without right mouse. Damage increases continuously with
  charge: **2 / 6 / 10 / 18** at tap / quarter / half / full charge.
  Hip-fire retains the shoulder camera, crosshair and charge meter. Camera rays
  converge on combat targets, removing close-range third-person parallax misses.
- In **phase two only**, a full-charge projectile aimed at the exposed boss core
  provokes a physical sideways barrel roll. Phase one takes full-charge hits
  normally. RAM disables evasion throughout its windup, charge and recovery,
  allowing full-charge counterhits. Use partial charges in other phase-two moves; full charges
  remain useful for destroying groups of drones and hostile orbs.
- Attacking-drone kills drop green medical packs. Touching one restores
  **25% of maximum integrity** (**25 HP**), capped at 100; full health does not
  consume the pack. Guardians do not drop them. Drops persist across the phase
  transition, then clear on death/retry, defeat or unload.
- Enter skips the current cinematic; P pauses.
- Before reaching phase two, Death's Retry restores full health and a fresh
  phase-one fight at **CP8**, skipping the long intro. Reaching phase two
  automatically saves **CP9**: subsequent retries start straight in phase two
  with **100 boss HP**, **100 player HP**, and no transition replay. Both use
  the safe main-ring spawn. Restart Trial still returns to Level 3's CP1.

## Arena and locomotion

`BlackoutLevelScene` appends `ExterminationArena` beyond the old sealed staging
corridor: a **200 m-wide, 96 m-high white laboratory** surrounding a
**520 m-deep open shaft**. Exactly one continuous playable annulus runs from
radius **62 to 99.5 m** at the original floor elevation. The specimen spawns on
its front arc. There are no fixed tiers, ramps or central foundation. Six lab
equipment covers occupy the outer half of the ring; the inner circuit remains
walkable. No railing or invisible floor prevents falling into the pit.
Boss-only fall failure begins below **-100 m**; earlier rooms retain their bounds.

White panels, recessed cool-white lighting, dark seams, mint guide strips,
observation glazing and warning bands establish the clean-room style. Receding
service bands, height-darkened lining and five local haze layers hide the
distant bottom. Earlier darkness puzzles receive no global fog/light changes.

Floating platforms are currently **disabled**, including their collision
meshes. `FINAL_ARENA_ORBIT.enabled` can restore them; tests explicitly opt in
with `new ExterminationArena({orbitingPlatforms:true})` to keep their code verified.
The retained system has **four total 9 m square lifts**, 90 degrees apart on a **55 m-radius**
orbit at **.255 rad/s** (about **14 m/s**). They rise/descend together between
**6 and 24 m** over a 32-second cycle, preserving equal 3D spacing. Neighbouring
centres are roughly **78 m apart**. Solid transforms advance once after normal
fixed-step locomotion; existing carrier displacement carries supported bodies
while respecting obstacles. Interpolation never changes colliders.
Pause/cinematics freeze the lifts; retry restores initial poses.

Shared geometries bake solid dimensions. Static scenery and each lift's trim
are instanced by material; source colliders stay available on a non-camera
layer. Doors (and lifts when opted in) have dynamic transforms. The original
z=190 staging opening retains its width/full-height jambs. Only this encounter
extends the camera far plane to **850 m**, restoring it on retry/unload.

`FinalBossConfig` scopes the 1.65 m merged radius, **13.2 m/s** movement,
stronger acceleration/air control and **2.5x Bob jump velocities**, with
**27 m/s² gravity** (**1.5x** Bob's), to the final form. A full jump now reaches
about **11 m** and lands sooner. Original slimes and the
legacy Sentinel fixture keep their tuning. The fused visual is deliberately
replaceable: Bob's body/antenna, Goop-like fins and electrical veins.

## Combat authority and phase-one moves

`FinalBossController` is a pure fixed-step authority with **200 boss HP** and
**100 player integrity**. The core is vulnerable throughout normal combat,
including warnings/recovery; only the shield and cinematic boundaries close
it. Charged and quick shots both retain their full configured damage.

Every normal selection is uniform among **Gun Blast, Laser Shots and Laser
Beam**, excluding the previous normal move. Thus the first pick has three
equal choices, and subsequent picks have two equal choices. A defensive wave
does not erase the last normal move. An injectable random source supports
deterministic tests without adding production inspection/debug hooks.

| Move | Warning / active / recovery | Behaviour |
| --- | --- | --- |
| Gun Blast | 1.1 / 11.55 / 1.05 s | Both articulated guns fire **three simultaneous rounds total** every **.16 s** at **164 m/s**. Each hit deals **7**. The barrage lasts **3x longer**, with **2x faster** rounds. Alternating the extra round balances the two muzzles. |
| Laser Shots | 1.35 / 3.65 / 1.15 s | **Five three-orb spread bursts** (**15** total) start **.8 s** apart, with **.13 s** between burst members and **.095 rad** horizontal spacing. Each burst locks its launch aim. Straight **1.25 m-radius** orbs travel at **63 m/s**, deal **20** each, and can be shot down. |
| Summon and Defend | 1.35 s / until cleared / 1.2 s | A **28 m-radius** shield blocks damage, the boss rises to **26 m**, and heals **2.5 HP/s**, capped at maximum HP. Destroy every summoned drone to end it. |
| Laser Beam | 2.6 / 16.4 / 1.5 s | **Three mandatory alternating 360-degree circles**. Cruise speed is **360° / 4.667 s**; **.8 s** velocity ramps ease into/out of each arc, giving **5.467 s** per full lap. The beam stays on through reversals. Its **2.7 m radius**, **40 damage**, and world **y=3.4 m** are unchanged. |

The defense starts at the first crossings of **85%, 70%, 55%** HP
(**170 / 140 / 110 HP**), deploying
**11, 13, 18** drones respectively. Each threshold is consumed once per attempt;
healing cannot retrigger it. A hit that would skip a mandatory threshold clamps
to that boundary and closes the shield synchronously, rejecting later hits in
the same step. There is **no timed shield release**. The last drone's real
destruction event drops the shield and stops healing.

The escalation cinematic begins at **100 HP** (**50% health**), after the three
defense gates. Its crossing clamps overkill and closes damage synchronously.
Finishing or skipping it commits the phase-two checkpoint once, without moving
or healing the live player. Recovery skips all three old shield waves, rearms
the advanced waves, restores cover, and clears projectiles, drops and evasion.
It never serializes a live attack. Full-level restart/debug boss replay clears
this checkpoint; the legacy Sentinel fixture keeps its original CP9 rules.
Defeat, transition and completion notifications remain once-only.
Damage is disabled during cinematics; **.45 s** grace limits projectile bursts.
The beam can damage once per lap, even if other projectiles hit in between.
When the warning ends, the authority chooses the shortest signed rotation from
the warning ray **toward the player's latest position**, not a fixed clockwise
start. Moving during the windup therefore changes the initial direction. The
choice is locked for that attack; every subsequent arc alternates, independently
of RNG or frame rate. Aligned/opposite bearings use a deterministic tie, and
wraparound at ±180° cannot make the boss take the long way. Smooth lap
acceleration/deceleration prevents snapping when the boss reverses. HUD sweep
counts and the actual eye orientation use that same authoritative rotation.

### Projectiles, cover and orbiting targets

`ExterminatorProjectiles` owns fixed pools of **96 gun rounds and 24 orbs**,
rendered with three instanced meshes. Rounds originate from the actual animated
cannon anchors; orbs and the beam originate from the actual eye anchor.

Laser orbs are registered combat targets: a direct electric-goop tap or charged
splash can destroy them. Relative swept-sphere checks also catch fast friendly
and enemy shots crossing between fixed frames, consuming both on interception.
The externally intercepted friendly shot emits its usual impact without
inventing through-wall splash. Gun rounds have neither combat proxies nor
projectile-pair interception: player shots pass through them, so dodge or use cover.

Enemy shots sweep the real Movement solids, stopping at walls, cover and decks.
Earliest cover/player/friendly-projectile contact wins. The beam uses the same
clipped start/end for visible cylinders, wall impact glow and damage.

Gun rounds and orbs both commit to their launch trajectory; **neither homes**.
Orbs keep their reduced **63 m/s** speed and can still be destroyed by a tap
or charged splash. Running/dodging and shooting them are both valid counters.
For a supported lift rider, the encounter also solves the initial launch aim
against the authored orbit/lift curve, so an idle rider is not automatically
immune simply because the carrier moves quickly.

The final specimen launches from an upper-body muzzle **.75 m** above its body
centre. Boss shots aim at the exposed upper body, rather than into a rider's
deck. The retained orbiting colliders opt into exact rounded sphere/box sweeps for
both sides' projectiles, avoiding inflated square-corner hits. Shallow downward
shots clear the lift; shots genuinely into it still collide. Other weapons and
scenery retain their existing muzzle and collision defaults.

The new opt-in analytical sphere query matches the visible shield and orb
proxies instead of their bounding cubes. Other level colliders retain their
existing box-query behaviour. Broadphase-on/off regressions cover both shapes.

### Phase-two emergency attacks and reinforcements

At **100 HP**, the damaged hull enters phase two and emits smoke from its engines. A separate
**48-slot** instanced puff pool gives persistent dark trails without allocating
meshes when the phase starts. Normal selection now includes **RAM**, uniformly
excluding the previous move. Gun Blast retains its original phase-one timing,
triple volleys and damage.

- **Laser Shots:** exactly **five** straight orbs in a rapid **.13 s** sequence, at
  **.095 radians** of horizontal separation. The burst locks the player's
  upper-body position at launch instead of homing. Warning / active / recovery
  are **.8 / .7 / .8 s**. Orbs remain shootable and deal **20 HP**.
- **Laser Beam:** **1.5x phase-one cruise speed**, retaining the **.8 s** turn easing.
  One complete circle captures Bob's current bearing, then reverses continuously
  toward the appropriate **−90° / +90°** boundary (depending on the selected
  initial direction; the entry leg depends on Bob's bearing). It makes
  **five alternating 180° passes** between **−90° / +90°**, keeping that captured
  bearing at each pass's exact midpoint. Each half takes **2.356 s**. There is
  no laser-off realignment, angular teleport, or extra-fast targeting turn.
  The full circle, entry and five halves have separate damage-contact identities.
  The warning/recovery are **1.6 / 1 s**; active duration depends on the entry arc.
- **RAM:** **2.1 s** floor-path warning, **1.05 s** high-speed charge and
  **1.8 s** recovery. The hull retreats **12 m**, lowers and pitches up while
  turbines rev and floor chevrons accelerate, then accelerates along its locked
  path. Continuous contact against **all solid rendered model parts** deals
  **45 HP**, at most once per charge. The warning spans the model's full width,
  including its turbines, rather than a nose-only damage sphere. The independent
  **8 m** hull/wall sweep and **20 m** cover-clearing radius stay unchanged.
  A swept wall hit stops the charge once, producing an expanding amber
  shockwave, debris/sound and a strong, time-decayed three-axis camera shake,
  followed by recoil and a climb back to hover. Cover assemblies/colliders are
  destroyed across the hull's path, with impact bursts/sound and shake;
  retries restore all cover. Ring floors and walls are never destructible.
  Evasion is disabled for the entire move, including windup and recovery:
  committed RAMs cannot dodge fully charged hits.

At first crossings of **70 / 50 / 20 HP**, the boss summons an independent
**eight-drone advanced wing** while continuing its current attack. No shield,
healing, attack reset or mandatory minion-clear gate is added. Overkill clamps
at each unconsumed reinforcement threshold so all three waves can appear.
Survivors are not erased by the next wave; at most **24** advanced drones can
coexist. Each wave has two separated **three-drone guardian groups** and **two
attackers**, with its own bounded steering and **64-shot** hostile pool.

Advanced drones reuse the sewer drone's detailed industrial hull, but are
**1.8x larger** with clean metallic silver/blue armour and amber targeting eyes,
not rust. They have **6 HP** (three **2-damage taps**, or one full charge). Matching
roles now use **the same firing cadence as phase one**: attackers every **1.05 s**,
guardians every **.7 s**. Their **28 / 84 m/s** role-specific projectile speeds remain.
Only their attackers leave medical drops. All wings are prebuilt and share
presentation resources; reset/unload removes their shots, adapters and colliders.

### Physical charged-shot evasion

**Only phase two** sweeps active fully charged player shots against the actual
eye collider up to **.22 s** before contact. Cover, armour, near misses and
distant shots cannot provoke a dodge. RAM is excluded, including its windup
and recovery, so it remains a full-charge punish window. The boss moves **34 m** sideways
(bounded inside the arena near walls), rolls once in the first **.48 s**, holds
upright while the projectile passes, and returns smoothly within **1.6 s**.
Lateral departure takes **.24 s**; return starts at **.75 s**. A dedicated child roll rig separates
that single flip from steering; the return never adds another flip. The visible
hull and core/armour proxies move together; damage is
not secretly rejected or made invulnerable. Quick and partial shots do not
trigger this response. Evasion offsets do not accumulate in hover movement,
and reset clears heading, offset and projectile ownership.

### Phase-one summoned drone roles

The encounter owns an **18-slot** `SentinelDroneSquad` and **128** hostile-shot
slots. Defaults for legacy four-slot squads are unchanged. Drones have **6 HP**
(three uncharged taps or one sufficiently charged direct hit). Pursuers fire **28 m/s**
shots; grouped guardians fire **84 m/s** shots (**3x faster**), all for **8 damage**.
Each pooled projectile keeps its launch speed even if its owner's role changes.
Only mobile attackers receive a **2x** uniform hit-envelope scale; their visible
models, movement avoidance radius, and guardian/legacy hitboxes are unchanged.

There are at most **three mobile pursuers** in every wave; guardians are not
promoted when a pursuer dies. The remaining drones form distinct boss-side
groups outside the shield at radius **36 m**:

| Shield | Pursuers | Guardian groups | Total |
| --- | --- | --- | --- |
| 85% | 3 | 4 + 4 | 11 |
| 70% | 3 | 5 + 5 | 13 |
| 55% | 3 | 5 + 5 + 5 | 18 |

Group centres are **1.05 radians** apart; members have staggered heights and
small formation motion. Pursuers fire
every **1.05 s**; guardians fire every **.7 s**, exactly **1.5x** the attack
speed. Deployment has a **1.6 s** grace and staggered starts. Flight sweeps
against real solids and slides around nearby decks. `ExterminatorDroneFlight`
limits travel to **20 m/s**, acceleration to **28 m/s²**, and climb/descent to
**9 m/s**. Pursuers hold a rotating **11 m** standoff, use a short horizontal
lead, avoid bunching together, and smoothly track jumps and landings. Changing
height never reroutes them through the arena centre. Departures use the same
steering instead of interpolating whole distances in a few frames.
Render interpolation offsets only each visible model, never its authoritative
squad root or collider, so higher display refresh rates do not expose fixed-step jitter.
Their projectiles ignore their own combat shield but still collide with cover.
Minion hitboxes do not act as blast-proof cover for each other; the boss shield
and real walls still block splash. The stronger full-charge radius/damage can
destroy several members of a guardian group in one real impact.

## Presentation and lifecycle

`FinalBossPresentation` owns the dedicated `ExterminatorWarDrone`, shaders,
shield, charge glow, beam/impact effects and a 64-particle pool. The threefold
scaled hero asset is roughly **48 m across**, normally hovering at **18 m**.
Four armoured ducted fans, counter-rotating blades, bevelled ochre/gunmetal hull
plates, hydraulics, fasteners, two six-barrel rotary cannons, red heat vents
and cold-white lamps follow the industrial reference. Procedural wear adds
variation without fetched textures. Static parts merge by material; rotors,
iris shutters, cannon pods and drums remain articulated.

Gun warnings accelerate the barrels and fans; firing adds muzzle flashes,
pod aim, recoil and orange heat. Eye attacks gather a bright charge and pulse
on launch. The beam visibly lowers the entire machine, traces its warning,
sweeps continuously and rises in recovery. Defense retracts the guns, closes
the iris, raises the hull and reveals a pulsing grid/Fresnel shield with
healing colour. The HUD names the attack and counts remaining defenders.

Four separated graphite annular iris quadrants have real gaps and no
overlapping shutter faces. Trim sits at distinct depths. The reactor's blue
pupil/rings use one shader surface, becoming amber when vulnerable; outer
danger lights stay red. Invisible gameplay hit proxies remain separate.

The 9-second intro, 5-second escalation, 7-second destruction and 6-second
escape use simulation time. Pause freezes them; skip settles the next stable
state. FOV/input ownership restore on handback, retry or unload. Destruction
includes a scripted charge/blast and breached exit. Escape follows the safe
annulus before the far door rather than crossing the absent central floor.

The existing boss-defeated -> splitting -> escape -> complete macro chain
opens the application's credits once. Split anchors settle out of view;
Back loads a fresh title. Level 3 loading/hidden-form preparation warms assets.
Four finite-range, non-shadowing lights keep stable slots. Existing positional
audio/music is reused. Reset/death/unload clear projectiles, drones, shield,
effects, loops and cinematic ownership. Owners dispose all instanced buffers,
geometries, materials, target adapters and dynamic colliders.

## Validation and limitations

The current suite covers uniform/no-repeat selection, all first crossings,
overkill/synchronous shield closure, healing caps/no timeout, real 11/13/18
deployments, last-kill release, separated groups, and the guardian/pursuer
cadence ratio. Physical tests verify orb interception and non-interceptable gun rounds,
five straight eye launches, actual idle-carrier hits, cover, full beam
rotation/height, shield geometry, bounded pools, reset/disposal and pause.
Regressions cover sustained gun duration, upper/lower lift firing angles,
hostile hits on high orbiting lifts, and bounded pursuit through an actual
charged jump and landing without a retreat toward the boss.
Existing ring traversal, pit falls, strong jump/lift boarding, sustained carry,
camera restoration, natural entry and exactly-once ending remain covered.

Previous executed gates (22 October 2026, before the expanded waves and tuning
above; current verification is recorded below):

- Full Node suite: **1,477 passed, one existing skip** (1,478 total), no failures.
- Focused boss, runtime, legacy attacks and weapon suite: **74 passed**.
- `npm run build` / TypeScript: passed; existing large-chunk advisory remains.
- `npm run check:generated-assets`: passed.
- `npm run validate:production`: passed, 77 deployed files at the nested path.
- Production Chromium/SwiftShader: **passed in 1.7 minutes**. All **20** canvas
  captures report **GL error 0**, with no browser/shader errors. Inspected gun,
  eye-orb, lowered-beam and defensive-formation frames use the real production
  renderer. Shield captures show **8/9/10** live drones and rising boss HP.

`tests/smoke/FinalBoss.spec.ts` exercises actual DOM charge/release/jump,
projectile damage, idle death/retry and carrier travel. The charge/jump fixture
temporarily protects the player; the subsequent idle-death check restores real
damage. Later attack/wave/ending fixtures explicitly drive public authority
and target adapters. This is not a claimed human-input victory. Only the test's intercepted bundle
exposes its composition root; no inspection hook ships. Captured PNG/JSON
record actual WebGL frames, draw/resource counts and GL errors.

Artifacts are under `/tmp/specimen-proper-boss-browser-results/`. Native-HD
attack samples show 154-284 draw calls / 44,592-86,968 triangles, depending on
the visible room/attack/formation. Textures stay at 64; shader programs span
66-75 as effects first appear. Friendly, minion and boss projectile capacities
stay bounded at **12 / 128 / 104**. These are view-dependent resource samples,
not a constant-residency claim or a hardware FPS measurement. The runner steps
simulation without drawing every frame; synchronous software readback timings
are not a performance qualification.

Software Chromium is not target Ubuntu/lab hardware qualification. Difficulty,
cinematic pacing and positional audio still need human playtesting on intended
hardware. The fused model is intentionally not a final asset.

### Previous expanded-wave and smooth-flight verification (23 October 2026)

- Full Node suite: **1,484 passed, one existing skip** (1,485 total), zero failures.
- Final focused mechanics/runtime check: **47 passed**. Regressions include
  jump/landing speed and acceleration bounds, no centreward retreat, visible-only
  interpolation, all three group layouts/cadences, high-carrier incoming hits,
  and charged shots clearing shallow deck angles while real cover still blocks.
- Final production build/TypeScript, generated-asset reproducibility,
  production-layout validation (**77 files**) and `git diff --check`: passed.
- Updated production Chromium/SwiftShader scenario: **passed in 2.4 minutes**.
  All **20** captured frames report **GL error 0**; no browser/shader errors.
  The shield captures contain **11 / 13 / 18** live drones with increasing HP.
  Beam, gun and expanded-wave frames were visually inspected.
- Friendly/minion/boss shot capacities remain **12 / 128 / 104**. Drones are
  preallocated to **18** slots and share presentation resources.

Current PNG/JSON evidence is under `/tmp/specimen-boss-update-browser-results/`.
The browser scenario still uses controlled authority/target adapters for later
attacks, waves and the ending, rather than an uninterrupted human-input victory.
The actual DOM firing/jump, damage/retry and carrier checks remain exercised.
Its initial charged-shot check now waits for a real projectile impact instead
of assuming that an 80-frame flight always spans the enlarged arena.

### Previous three-sweep, hip-fire and group-blast verification (23 October 2026)

- Full Node suite: **1,495 passed, one existing skip** (1,496 total), zero failures.
  The final focused boss/runtime/weapon/legacy-drone suite passed **92 tests**.
- At that revision, all four two-coin reversal outcomes guaranteed three completed circles.
  Rendered forward/reversing sweeps accumulate **1080 degrees of absolute
  travel**, without angle snaps. Each lap has its own damage-contact identity.
- Real projectile tests confirm **3 / 6.75 / 10.5 / 18** hip-fire damage,
  camera/muzzle convergence, pointer-lock cancellation, padded attacker wing
  hits, **84 vs 28 m/s** guardian/pursuer shots, and multi-kills against the
  actual guardian formation. Default scenes contain no floating-platform
  visuals or colliders; retained-platform traversal tests opt in explicitly.
- Final TypeScript/production build, generated assets, production-layout
  validation (**77 files**) and `git diff --check`: passed.
- Updated production Chromium/SwiftShader scenario: **passed in 2.3 minutes**.
  All **21** captured frames report **GL error 0**, without browser/shader errors.
  Actual LMB-only partial-charge input damaged the core from the shoulder view;
  default platform removal and the third beam lap were asserted in the browser.
  Later phase/ending checks still use the explicitly controlled adapters.
- Current evidence: `/tmp/specimen-boss-three-sweeps-browser-results/`.
  Friendly/minion/boss projectile capacities remain **12 / 128 / 104**.

This is production-renderer and controlled-scenario evidence, not a full
human-input victory or a hardware FPS qualification.

### Previous homing-orb and mandatory-reversal verification (23 October 2026)

- Full Node suite: **1,496 passed, one existing skip** (1,497 total), zero failures.
  Final focused boss/runtime/weapon/presentation/collision suite: **90 passed**.
- Every beam now uses **[1, -1, 1]**, independent of subsequent RNG. Both real
  turnarounds stay smooth, with **1080 degrees** of absolute travel in **14 s**.
- Real projectile regressions verify a tap destroys a homing orb, charged
  splash clears several orbs, and neither can destroy gun rounds. Continuous
  crossing checks preserve earlier cover contact. Homing tracks horizontal
  and vertical movement at **63 m/s**, with bounded turns; gun headings stay
  fixed. Reset removes all orb hit proxies and slot reuse restores launch aim.
- Production build/TypeScript, generated assets, production-layout validation
  (**77 files**) and `git diff --check`: passed.
- Production Chromium/SwiftShader scenario: **passed in 2.9 minutes**. Actual
  mouse input destroyed a real moving eye orb exactly once; partial/full
  shots still damaged the core during non-interceptable gun fire. The third
  beam lap asserted **[1, -1, 1]**. All **23** captures report **GL error 0**,
  with no browser/shader errors. Later waves and the ending remain controlled
  authority/target fixtures, not a human-input victory or hardware qualification.
- Current evidence: `/tmp/specimen-boss-homing-browser-results/`, including
  `orb-counter-evidence.json`. Projectile capacities remain **12 / 128 / 104**.

### Previous damaged phase-two, health drops and straight-orb verification (23 October 2026)

- Full Node suite: **1,507 passed, one existing skip** (**1,508 total**), zero
  failures. Focused boss/controller/mechanics/phase-two/runtime suite:
  **84 passed**. The new phase-two file has **11** dedicated scenarios.
- Regressions verify the **50 HP** transition rather than half health;
  non-shielding **35/25/10 HP** reinforcements; all **24** advanced survivors;
  two-tap/full-charge kills, exact doubled weapon cadence, and attacker-only
  **25 HP** drops with real pickup/capped healing/full-health persistence.
- All **five** reverse half-sweeps cross their independently locked player
  bearing at the exact arc midpoint. Fixed-step physical checks cover RAM
  movement, high damage, complete cover/collider removal and retry restoration.
  A real full-charge projectile provokes the lateral roll and misses the core;
  a real partial shot still damages it. Straight orbs remain counterable.
- Final production build/TypeScript, generated assets, production-layout
  validation (**77 files**) and `git diff --check`: passed.
- Production Chromium/SwiftShader scenario: **passed in 2.9 minutes**, all
  **29** captures reporting **GL error 0**, without browser/shader errors.
  Actual DOM charge/release triggers the spin; actual partial-charge input
  damages the core; a tap destroys an eye orb. The real boosted/heavier jump,
  idle death and retry also run. A controlled pickup pose restores **60 → 85 HP**.
- Later public-authority fixtures show the **50 HP** transition, visible engine
  smoke, full-circle-plus-five-half-sweeps, rapid spread volley, physical RAM
  cover destruction, **8 / 16 / 24** surviving advanced drones at **35 / 25 / 10
  HP**, and once-only defeat-to-credits cleanup. These are controlled scenarios,
  not an uninterrupted human-input victory or a hardware FPS qualification.
- Evidence: `/tmp/specimen-boss-phase-two-browser-results/`. Sample advanced
  wing frames use **203–289 draw calls**, with **38–39** smoke puffs; these
  values are view-dependent. Friendly / phase-one-minion / boss-shot capacities
  remain **12 / 128 / 104**; advanced wings add **3 × 64** bounded hostile slots.

### Previous phase-two-only dodge correction (23 October 2026)

- Evasion now requires **phase two** as well as active combat and an exposed
  core. Phase-one full-charge hits deal their normal damage; phase-two full
  charges still provoke the physical roll. Partial shots work in both phases.
- Focused boss/runtime suite: **85 passed**. Full Node suite: **1,508 passed,
  one existing skip** (**1,509 total**), zero failures. Build/TypeScript,
  production-layout validation (**77 files**) and whitespace checks passed.
- Maximum boss HP remains **360** in this correction. The original committed
  controller used **180**; the earlier combat retune raised it to 360. The
  phase-two feature update changed the HUD from percentage to raw HP, not the
  maximum. Choosing a different HP total is a separate balance change.
- Production Chromium/SwiftShader: **passed in 3.1 minutes**. Actual charged
  mouse input reduced phase-one HP **360 → 342** without a dodge, while the
  same input triggered the phase-two roll and left HP at **50**. All **30**
  captures report **GL error 0**; no browser/shader errors. Later phase/wave
  fixtures retain their controlled-scenario limitations described above.
  Evidence: `/tmp/specimen-boss-phase-two-dodge-only-browser-results/`.

### 200 HP rebalance and single dodge flip (23 October 2026)

- Boss maximum/retry HP is **200**; phase two begins exactly at **100 HP**.
  Shield percentages remain **85 / 70 / 55%**, now **170 / 140 / 110 HP**.
  Threshold products are rounded to avoid floating-point noise displaying
  the final shield as 111 HP. Phase-two reinforcements scale proportionally
  to **70 / 50 / 20 HP**, without changing wave sizes, healing or attack cadence.
- The phase-two dodge completes **one 360-degree roll in .42 s**, then stays
  upright throughout its hold and return. A child hull rig separates the roll
  from base steering and carries the visible model, core, armour and exhaust
  anchors together. Both left/right dodges have exactly one turn and cannot
  retrigger from the same projectile. Phase one still never dodges.
- Final focused suite: **87 passed**. Full Node suite: **1,510 passed, one
  existing skip** (**1,511 total**). Production build/TypeScript, generated
  assets, production-layout validation (**77 files**) and whitespace checks pass.
- Final production Chromium/SwiftShader scenario: **passed in 2.5 minutes**.
  The rendered hull trace measures exactly **360 degrees**, with **20 upright
  return frames**, then zero roll/offset and inactive evasion. Real input gives
  **200 → 182 HP** in phase one; the same full shot is dodged at **100 HP** in
  phase two. Reinforcement captures show **8 / 16 / 24** drones at **70 / 50 / 20
  HP**. All **30** captures report **GL error 0**, with no browser/shader errors.
  Later waves/ending remain controlled fixtures, not a human-input victory or
  hardware qualification. Evidence (including `single-roll-evidence.json`):
  `/tmp/specimen-boss-200hp-single-roll-browser-results/`.

### Phase-two checkpoint verification (23 October 2026)

- Authored Level 3 registers **CP9** at the safe fused-form main-ring spawn.
  Completing/skipping the phase transition activates it once, without healing
  or moving the current player. Before then, **CP8** remains the retry point.
- CP9 recovery starts immediate phase-two combat at **100/200 boss HP** and
  **100/100 player HP**, with phase-one shields consumed and all advanced
  waves rearmed. It restores cover and clears normal/advanced drones, hostile
  and friendly shots, charging, health packs, evasion and cinematic ownership.
  Repeated recovery does not overwrite the saved checkpoint. Full restart
  clears it; the boss debug replay still starts a new phase-one attempt.
- Focused controller/boss/runtime/foundation suite: **113 passed**. Tests cover
  natural/skipped transitions, pause, repeated death/Retry, physical pit falls,
  safe spawn, input restoration, stable target counts and legacy CP9 gating.
- Full Node suite: **1,512 passed, one existing skip** (**1,513 total**).
  Production build/TypeScript, generated assets, production-layout validation
  (**77 files**) and whitespace checks pass.
- Production Chromium/SwiftShader scenario: **passed in 2.3 minutes**. After
  spawning an advanced wing and breaking cover, a controlled fatal request and
  the actual death-screen Retry button restore **CP9**, phase two, **100 boss
  HP / 100 player HP**, fresh cover and zero drones/projectiles/packs, without
  an intro or transition. Later waves rearm and the ending still completes.
  All **31** captures report **GL error 0**, with no browser/shader errors.
  This remains controlled-scenario evidence, not a full human-input victory.
  Evidence: `/tmp/specimen-boss-phase-two-checkpoint-browser-results/`, including
  `phase-two-checkpoint-retry.json` and the captured post-retry frame.

### Last-second evasion, continuous beams and RAM polish (23 October 2026)

- Full Node suite: **1,514 passed**, **one existing skip**, no failures.
  Focused boss/controller/mechanics/phase-two suite: **59 passed**. Production
  build/TypeScript, generated-asset reproduction, the **77-file** deployment
  validation and whitespace checks pass.
- Collision regressions distinguish imminent eye hits from blocked shots,
  partial charges and near misses. Both dodge directions make exactly one
  roll and settle upright before returning. Beam tests cover identical cruise
  speeds, continuous angular velocity, slower **.8 s** reversal ramps, a
  captured player-centred entry, and five alternating half-circle passes.
  Actual hull sweeps verify RAM damages/breaks cover, hits the wall once,
  delivers a shockwave/strong camera shake, and resets cleanly.
- Production Chromium/SwiftShader: **passed in 2.3 minutes**, **33 captures**,
  all **GL error 0**, no browser/shader errors. Actual DOM input verifies the
  **.35 s** full-height jump, centre-orb interception, partial/full shot damage
  and idle death/retry. The old counter fixture now targets the centre member
  of the new spread, not an outer orb's stale position.
- Real charged-shot input produces a **34 m** lateral dodge with exactly
  **2π** roll travel, **48 upright return frames**, and no premature roll in
  the initial flight. A **100-sample** phase-two beam trace confirms it stays
  lit at its full **2.7 m** radius throughout the entry/turnarounds/half-sweeps,
  never exceeds phase-one angular speed, and finishes all five halves.
  RAM windup, charge, wall impact and the wide mid-roll were visually inspected.
  Boss projectile capacity is now bounded at **120** (**96 + 24**) to support
  repeated three-orb bursts; friendly/minion pools remain **12 / 128**.
- CP9 Retry still restores **100 boss HP / 100 player HP**, clears live attacks
  and reinforcements, and starts phase two without the intro or shield replay.
  Later attacks, reinforcements and the ending use controlled public adapters;
  these are scenario checks, not a full human-input victory or hardware FPS
  qualification. Evidence: `/tmp/specimen-boss-attack-polish-browser-results/`,
  including `single-roll-evidence.json` and `continuous-beam-evidence.json`.

### Phase-two speed, firing cadence and counter balance (23 October 2026)

- Phase-two beam cruise is **1.5x** phase one, including its full circle,
  continuous entry and five alternating half-sweeps. Turn ramps stay **.8 s**;
  phase one is unchanged. Each phase-two half now takes **2.356 s** rather than
  speeding up the reversal ramps or adding a laser-off correction.
- Advanced attackers fire every **1.05 s** and advanced guardians every **.7 s**,
  matching the corresponding phase-one roles. Size, health, movement, wave
  counts, projectile speeds and damage are unchanged.
- RAM disables evasion during **all three stages**. Close-range registered-eye
  projectile tests deliver a genuine **18-damage** full-charge hit during each
  stage, with no roll or lateral evasion. Other phase-two moves still evade
  imminent full-charge shots.
- Uncharged player damage is **2**, continuously scaling to **6 / 10 / 18** at
  quarter / half / full charge. Full-only **14 m** splash is unchanged. Both
  ordinary and advanced **6-HP** drones consequently take three uncharged taps
  or one sufficiently charged hit; their health was not silently reduced.
- Focused boss tests: **62 passed**. Full regression suite: **1,517 passed**,
  **one existing skip**, no failures. TypeScript/production build, generated
  assets, production layout (**77 files**) and whitespace checks pass.
- Production Chromium/SwiftShader: **passed in 2.2 minutes**, **34 captures**,
  all **GL error 0**, no browser/shader errors. Actual DOM hip-fire reduces
  phase-two HP **100 → 98**; a real charged jump clears cover and a fully
  charged RAM counter reduces **98 → 80**, with no roll or sideways evasion.
  A **74-sample** faster-beam trace stays continuously lit through the entry
  and five alternating halves. CP9 retry, health drops, all advanced waves and
  the ending still pass their controlled scenarios. This is not a full
  human-input victory or hardware FPS qualification. Evidence:
  `/tmp/specimen-boss-phase-two-balance-browser-results/`, including
  `ram-charged-counter-evidence.json` and `continuous-beam-evidence.json`.

### Player-directed beam opening (23 October 2026)

- At the telegraph/active boundary, the controller compares the warning ray
  with the player's **latest bearing** and takes the shortest angular route
  toward them. The decision is made once, not at attack selection, and does
  not consume RNG. Wraparound at **±180°** is handled; exact alignment or
  opposition has a stable tie rule rather than jittering between directions.
- Both phases can now start with either rotation sign. All later arcs reverse
  that sign in sequence. Phase two mirrors its entry boundary and all **five**
  half-sweeps when the first direction changes, preserving the captured player
  midpoint, continuous beam, **1.5x** cruise speed and **.8 s** eased turns.
- Focused boss tests: **72 passed**. The new cases cover last-moment player
  movement, signed wraparound/ties, direction locking, no extra random draws,
  the complete mirrored phase-two pattern, and actual rendered rays approaching
  both sides of the player in both phases. Full suite: **1,527 passed**,
  **one existing skip**. Production build/TypeScript, generated assets,
  **77-file** layout validation and whitespace checks pass.
- Production Chromium/SwiftShader: **passed in 2.5 minutes**, **35 captures**,
  all **GL error 0**, no browser/shader errors. A controlled late-windup move
  puts the player **.2 rad** clockwise from the warning ray; the real authority
  chooses **[-1, +1, -1, +1, -1, +1, -1]** and the rendered beam's angular gap
  closes within the first **20 fixed steps**, rather than turning away.
  A **73-sample** trace completes all five mirrored half-sweeps without hiding
  the damaging beam. Actual input still deals **2** uncharged damage and **18**
  on the RAM counter with no dodge; CP9 and the controlled ending remain valid.
  Later positioning/attacks use explicit scenario fixtures, not a human-input
  victory or hardware qualification. Evidence:
  `/tmp/specimen-boss-directed-beam-browser-results/`, including
  `boss-phase-two-beam-toward-player.png` and `continuous-beam-evidence.json`.

### Previous tighter RAM damage sphere (23 October 2026)

- Player-only RAM damage radius is **6.5 m**, down from **8 m** (**18.75%**
  tighter). The telegraph path narrows from **16 m** to **13 m** accordingly.
  The independent **8 m** wall/hull sweep, **20 m** cover-clearing radius,
  **45 HP** damage, locked trajectory, recoil and impact shake are unchanged.
- Real arena/body fixtures move sideways only after the charge commits. On
  both sides, a **6 m** offset that the old hitbox catches is now safe, while
  **4 m** offsets still take exactly **45 HP**. The same runs verify cover
  destruction and the wall shockwave still happen. The tests use a charge
  crossing the ring before the wall, rather than the narrow entry jambs.
- Focused boss suite: **76 passed**. Full suite: **1,531 passed**, **one existing
  skip**, no failures. Production build/TypeScript, **77-file** deployment
  validation and whitespace checks pass. No additional production
  browser capture was run for this numeric damage-zone/warning-width change;
  the preceding browser evidence applies to the earlier beam-direction build.

### Solid-model RAM contact and jump clearance (23 October 2026)

- RAM damage now tests the actual **solid model geometry**, including the
  fuselage, eye collar, guns, braces, turbines and spinning parts. Invisible
  projectile proxies and muzzle-flash effects are excluded. A cached per-mesh
  triangle BVH preserves genuine holes/gaps rather than joining components
  into one oversized box or sphere. Its construction happens with the model,
  not when a charge starts; queries reuse scratch storage.
- Relative player/model translation is swept continuously. Animated rotation
  is subdivided with at most **1 cm** of curvature padding under the authored
  fixed uniform scale, so fast parts cannot pass through the player between
  fixed updates. Already-penetrating solid contacts count too. Damage remains
  **45**, once per charge, under the existing player damage-grace rules.
- The warning now follows the model's full **48.9 m** width. Wall stopping,
  cover destruction, attack timing and the no-roll RAM counter window remain
  separate and unchanged.
- There is **no airborne immunity**. A real charged KinematicBody jump can
  clear the lower outer turbine path at the current scale/height, whereas a
  lower jump clips it and counts as contact. The central hull is taller:
  jumping into it still hurts. Jump tests use the real **.35 s** charge,
  launch/gravity and visible geometry, with a controlled late-RAM-speed pass.
- Boss/checkpoint/geometry suite: **115 passed**. Full Node suite: **1,538
  passed**, **one existing skip**. Production build/TypeScript, generated assets,
  **77-file** deployment layout and whitespace checks pass.
- Production Chromium/SwiftShader: **passed in 2.8 minutes**. The controlled
  turbine contact pose produces a real **45 HP** runtime hit, away from the
  old nose sphere, while the apex measured from actual Space input clears the
  low turbine section. Earlier actual tap/full-charge/RAM-counter inputs and
  the phase-two checkpoint still pass. Later poses, waves and ending remain
  explicit scenario fixtures, not a human-input victory or hardware FPS claim.
  Evidence: `/tmp/specimen-boss-model-ram-browser-results/`, including
  `ram-model-contact-evidence.json` and the solid-model-contact capture.

### Current-main integration and PR handoff (23 October 2026)

- Integrated current main's camera modes, menus, sounds and Level 3 transit
  encounters. Resolutions preserve final-boss gathering/credits/checkpoints
  alongside those features, rather than restoring the old transit objectives.
  Fused-model descendants all use the shared camera-pass visibility hooks;
  authored boss cinematics override the view temporarily without resetting
  the player's selected first-/third-person preference. A real-camera runtime
  regression verifies suppression/restoration for every fused body part.
- Final post-integration full suite: **1,659 passed**, **one existing skip**, no
  failures. Production build/TypeScript, generated-asset reproduction,
  **120-file** production layout validation and whitespace checks pass.
- Post-integration production Chromium/SwiftShader: **passed in 3.0 minutes**,
  **36 captures**, all **GL error 0**, no browser/shader errors. The measured
  **13.0625 m** jump apex clears the low turbine section, and a controlled solid
  turbine contact still causes **45 HP** runtime damage. Real firing/jumping,
  checkpoint Retry, all later waves and credits still pass. Later positioning
  and authority are controlled fixtures, not a full human-input victory or
  hardware qualification. Final browser evidence:
  `/tmp/specimen-boss-main-merge-browser-results/`.

### 750 HP boss tuning (24 October 2026)

- Boss maximum/retry HP is **750**, with phase two and CP9 recovery at **375 HP**.
- The existing 85 / 70 / 55% shield gates now fall at **637.5 / 525 / 412.5 HP**.
  Phase-two reinforcement gates retain their proportions at **262.5 / 187.5 / 75 HP**.
  Wave sizes, healing rate and attack cadence remain unchanged.
