# Cultivation Room 5 — playable grey-box

Source design: `Levels/Level 2/Rooms/Room 5 Detailed.md` in the project folder.

## Testing

Enter Level 2 with the existing `0` level shortcut, then press `5` to put both
slimes at the shared vent fork. Normal entry follows the completed Room 4 lift.
`Tab` switches Bob/Goop, then cycles Bob/Goop/Volt after rescue. Goop's existing
right-click aim and left-click projectile controls operate the security contacts.

1. Bob takes the left vertical adhesive shaft to the covered chamber entrance.
2. Goop follows a flat, 2.2m-wide/high duct with increasingly heavy acid patches
   to an open floor hole. There is no vertical pipe below it.
   The drop leads into a 124m-long, 20m-wide vaulted sewer, with a central 6m
   acid channel and dark banks raised 0.8m above it. Access ramps at local
   z=25/124 connect the banks and channel. Both ends have recessed circular,
   barred culverts with tunnel depth behind the grates.
   The damaged drone lies tipped into the acid at (40,-11.7,70), 50m beyond the
   drop; controls are another 48–56m along. Reboot takes 1.5 seconds, lifting it
   about 4m before it hovers, faces Goop in full 3D and fires using existing
   projectile/damage rules. Its shell highlights and accepts acid shots.
3. Goop reaches the red/blue/green toggle switches. Moving handles and illuminated
   I/O indicators distinguish online/offline without relying only on colour.
   The rusted handle itself is the moving acid target, not its cabinet.
   Shooting an enabled switch disables only that network; shooting a different
   handle reactivates the previous network. Shooting the lowered handle again
   raises it and re-enables its network. Rescue shutdown cannot be toggled off.
4. Bob climbs/jumps through six exposed sections around Volt. Sequence:
   red, blue, green, red, blue, green. Directional cover baffles
   provide safe waiting places without enclosing the jump exits.
   The authored route uses staggered jumps, a switchback, a narrow crossing
   and a reverse zigzag, with flying paired patrols and independent network clocks.
   Normal network drones are not soluble targets.
5. Bob stays beside the final animated lever for 1.5 seconds. Security
   shuts down; a four-second camera beat follows the pod lowering/opening.
6. The dry reunion floor appears, and the maintenance door and upper shortcut open. Bob can drop directly onto
   the dry reunion floor; Goop takes the maintenance ramp from the sewer's far end.
7. Select Volt and touch the conductive exit terminal. Bring all three bodies
   through the exit to complete Cultivation. Level 3 is not implemented; the
   completion event marks the handoff without inventing a destination runtime.

## Ownership and recovery

- `SecurityNetworkController`: one disabled network, plus irreversible rescue
  shutdown until reset. Reusable contacts retain impact order even if multiple
  burns finish in one fixed step.
- `CultivationRoomFiveController`: reboot, held release, rescue and checkpoint state.
- `LevelTwoRoomFiveGreybox`: named geometry, interaction contacts and presentation.
- `RoomFiveParkour`: individually authored jumps and wall-to-top transfers.
- `RoomFiveSewer`, `SewerDrainageEnd`, `RustedSewerDrone`: sewer geometry,
  recessed culverts, moving handle presentation and damaged scout artwork.
- `RoomFiveDroneEncounter`: existing SecurityDrone LOS, bounded projectiles and
  health/regen. No parallel damage or target-selection implementation.
- `CultivationLevelRuntime`: player bodies, input/camera, roster unlock, checkpoint
  handoffs and level completion. The existing pair still owns Bob/Goop recovery;
  Volt is a separately registered persistent body in the same SlimeManager.
- Volt's playable definition is scoped to the authored Level 2 runtime. Level 1
  and the older foundation harness retain their existing locked Volt definition.

Checkpoints:

- Lift arrival: both bodies recover at the split; the elevator stays completed.
- Cooperation: requires Bob at the entrance, Goop at controls, and the damaged
  drone destroyed. Retry restores those separate positions, keeps the broken
  drone dead, and returns all security networks online.
- Rescue: retry retains Volt, opens the reunion route and restores the group to
  the reunion area. The exit terminal must be powered again.
- Full room restart/debug teleport clears the rescue and locks/unregisters Volt.

## Geometry and graphics handoff

The chamber is approximately 40m wide, 64m long and 38m high, with a separate
lower sewer. Coordinates in `LevelTwoRoomFiveGreybox.ts` are room-local, Y-up.
Stable `room-5-*` names identify contacts, sticky panels, covers, the pod,
terminal and doors. Export with:

```sh
node scripts/export-level-two-blender.ts '../Levels/Level 2/Blender' 5
```

The generated `Room5.scene.json` and `Room5.blend` live outside the repository,
in the project's Level 2 Blender folder. They are authoring snapshots, not
assets automatically loaded by the game.

This is grey-box art: proxy Volt, existing security drone models, rusted sewer
drone geometry, physical toggle switches,
emissive network identifiers and simple transparent search cones. Final
textures, audio and cinematic animation polish are still
graphics/audio work. Standalone ceiling adhesion is not assumed: the grey-box
uses supported vertical adhesive walls and returns. First-time pacing and the
parkour's overall feel still need human playtesting; no 8–15 minute duration
claim is made from automated checks.

## Verification

`tests/RoomFive.test.ts` covers exclusive/repeated/rapid network selection,
reboot and checkpoint state, burn integration, safe-station drone sightlines,
and exposure of every route to its intended network. Browser smoke checks
exercise room teleport, separate checkpoint recovery, rescue, Volt selection
and restart. These checks do not substitute for an end-to-end manual parkour run.

Additional movement regressions cover every consecutive authored jump pair,
launches from all six waiting platforms, all three wall-to-top handoffs, Goop's
complete duct/sewer/maintenance route, real acid hits on both handle poses,
and the sewer drone's all-angle tracking and reset.

## Latest playtest corrections

The sewer begins with an uninterrupted acid channel: the early bank ramps are
removed, and only the far switch-side ramp remains. Its shallow entry supports
walking without jumping. After Volt's rescue, a level bridge replaces that ramp
to open the maintenance return. Both barred drainage recesses have solid floors
and boundary collision. A short ceiling collar seals the vent drop without a
pipe hanging into the sewer.

The rusted drone takes three acid hits. A hit while dormant immediately wakes
it; successive hits remove hardware, darken the shell, and increase sparking.
The third destroys it. Split-checkpoint recovery restores the intact drone.

Safe-station decks follow their diagonal cover outlines, with collision confined
to the protected side. Wall corners and coloured caps use matching mitred shapes.
Suspension rods connect the decks to the ceiling. Sticky returns meet wall tops
without overlapping faces, and the final route uses two clear jumping platforms.
Bob's controls-checkpoint recovery faces his first jump rather than the entrance.

Regression tests also cover all three damage stages and reset, and walking into
both barred sewer ends without falling through the floor.

## Flying patrol timing revision

The barred ends now have continuous collision across the complete grate,
including its lower rim. The middle sticky wall/return and the overlapping
landing near the fifth waiting station are removed; the adjacent normal jumps
are repositioned to approach the open sides of the cover.

All upper guards use rotor-equipped flying shells without ceiling mounts.
The last three crossings each have two guards on different networks. Their
12-second patrols initially alternate inward/outward gaze with overlapping
watch periods. Disabling a network freezes its patrol clock and stops firing;
re-enabling resumes it without rewinding. Goop can pause one for roughly half a
cycle to align both outward periods, creating a shared crossing window of more
than four seconds. The same switch can restore power; only one network can be
disabled at once. Retry resets patrol timing; freeing Volt shuts them all down.
The earlier single-guard crossings introduce their movement and coloured cones.

Covered stations are tested through a full patrol cycle, along with freeze,
resume, reset, overlapping watch timing, and the two revised jump approaches.
Human playtesting is still needed to tune the paired crossings' difficulty.

### Upper-route readability pass

Paired patrols now occur on crossings 1, 3 and 6, rather than clustering all
three encounters upstairs. The upper blue/red patrols and final pair have
separate flight areas outside Volt's glass; full-cycle shell bounds are tested
against the pod. The final sticky wall and return are removed. Normal jumps
lead to the last waiting station and a continuous right-hand walkway around
its cover, with warm floor arrows and a light at the release lever. The complete
walk from that station to the lever is checked with Bob's movement controller.

### Subsequent playtest corrections (supersedes the approach above)

The remaining early sticky wall, top return, transfer and support are removed.
Crossing 4 now has two yellow landings rather than three; revised station
approaches are checked with charged jumps. Cover walls no longer have coloured
strips. Drone colours and the switch controls still communicate their networks.

The last dark platform remains, but the yellow cage-side walkway and arrows are
removed. A dark walkway leads in the opposite direction to the lever at local
z=27. This approach is tested for a full cycle without drone damage. The return
catwalk deploys only after rescue and connects to this new lever location.
Patrol lanes have increased separation, including a higher lane for the final
partner; independently shifted cycle samples test every pair of flying models
for overlapping bounds, in addition to the glass-clearance regression.

### Dark-room lighting

Room 5 reduces the foundation ambient fill to .008 and disables its directional
key while the active slime is here; leaving restores the normal lighting.
The sewer's overhead lights and chamber floodlights are removed. The damaged
drone has a faint orange glow, brighter reboot light, and a strong active light
that extinguishes on destruction and resets on retry. Each switch panel has a
local coloured light. Volt's cyan light travels with the containment pod.
Patrol cones have matching shadow-casting spotlights driven by their gaze and power
state. Platform bulbs and their lights are removed for the darker playtest.
Patrol spotlights and Volt's point light use 512-pixel shadow maps. Opaque room
geometry casts and receives shadows; transparent glass and captive Volt do not
block the pod's internal glow. Shadows are enabled only while viewing Room 5,
and their resources are disposed on unload. Small sewer panel lights retain
their inexpensive unshadowed fill.

Upper drone view cones use a .4-radian half angle (about 46 degrees total),
with detection, ray length and spotlights all using a 15-metre range and a
shared origin. The visible cone is double-sided so it remains visible from
inside, with .02 opacity and a single transparency pass to limit brightness
buildup. The sewer drone is unchanged.

The maintenance exit opposite the switches is concealed by matching curved
sewer panels, lifting with the existing exit after rescue. The rectangular face
is invisible, not an exposed doorway. Volt's chamber acid has reduced emissive
intensity (.12), leaving Volt's glow, drone searchlights and the lever light dominant.

The visible beam now clips each cone edge independently against collision, so
clear edges still reach the wall when another part meets nearby cover. The
spotlight uses shadow maps across its full range to block light behind cover
without shortening clear areas. Sampling is spread over three ticks, with invalidated
lengths on reset. Gameplay detection remains independent and unchanged.

Bob's handwritten shader receives sampled, unblocked Room 5 light rather than
its fixed clinical key/rim illumination. Nearby point and spot lights determine
the dominant light and a small fill; the wet rim scales with incident light.
Leaving Room 5 restores the previous lighting profile. The network is blue again:
drone eyes, switch indicators, panel lights and HUD all match. Beams use saturated
blue (#165dff) at .09 opacity rather than pale lavender; their stronger spotlight
intensity is retained. Detection and patrol behaviour are unchanged.

The first blue partner patrol is offset toward the entrance at (-8, 16.5, 24),
instead of standing behind red. Its inward-facing portion reaches the first
landing within 15 metres, with independently shifted red phases tested for both
collider obstruction and visible hardware shadowing. Patrol period and switches
remain unchanged.
