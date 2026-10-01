# Level 3 Room 2 — Powered Transit Gauntlet

Playable-room implementation of `docs/planning/Level 3/Rooms/Room 2 Detailed.md`.

## Layout and progression

The chamber spans 44 × 76 metres, with a 22-metre ceiling. Bob's parkour uses generous landing pads separated by roughly 4–5 metres of clear space rather than a dense staircase of platforms. Goop uses the lower acid basin; Volt operates from the west service catwalk.

Bob's full obstacle chain sits at x≈10, on the player's left when entering facing +Z, across the chamber from Volt at x=-16. Matching cover panels, drones, lasers, lifts, the final sticky switch, and recovery positions move with that route. The recessed basin is sealed down to its subfloor, and the corridor entrance has an empty structural doorframe.

Volt can acquire electrical targets from 100 metres away in authored Level 3 (warning at 110m, tether limit 120m), still subject to physical line of sight and movement breaking the connection. While aiming, available conducting devices receive depth-tested amber outlines; a valid selected or connected device turns green. Shoot the actual hanging light fitting to charge it, not a remote catwalk control. Lift contacts are mounted to and move with the lifts. The bridge has no railings or railing mounts. Its final lock uses the existing exit door's lower edge instead of a floating bridge-end socket; Volt must still reach the far end before that contact becomes available, preserving the crossing puzzle.

Bob and Goop walk through Room 1's flickering corridor and up a shallow ramp into the transit entrance deck. Volt's vent turns west, then climbs in a separate enclosed duct onto the west service catwalk. It does not rejoin the main corridor. Once all three have entered Room 2, its entry checkpoint is saved without teleporting their live bodies. Room 2 hazards are already active if one slime arrives before the others. The maintenance drone stays behind.

Level 3's number-key shortcuts reset the relevant puzzle state and move all three bodies safely: `1` starts Room 1, `2` starts Room 2 on its split routes, and `3` goes to a sealed Room 3 boss-sector staging room. This last destination is explicitly a placeholder, not the finished boss arena. Shortcuts are ignored while gameplay/debug interaction is disabled.

The intended sequence is:

1. Volt charges a light bank to reveal a cover support.
2. Goop dissolves the support, lowering the retained panel into the drone's sightline.
3. Bob crosses the protected route, using the two electrically powered lifts, sticky surfaces and laser timing sections.
4. Bob holds the wall switch while inactive to provide Volt's bridge. Goop shields that crossing with the final cover.
5. Volt crosses and powers the exit door's lower edge to lock the bridge, freeing Bob to leave the switch.
6. All three regroup on the far deck.

Lights latch after charging. Lifts require power/residual energy and return when it is removed. Covers retain authored final poses rather than using uncontrolled physics. Drone gameplay and beam occlusion use the same collision world.

Conducting fixtures have no idle emissive glow or yellow ring markers. Selection outlines are exclusive to actively aiming Volt and hide immediately on input release, character switching, or pointer unlock; powered lamps still illuminate the room normally. Drones scan a ±12.6-degree arc and track visible targets with their heads. Red beam volumes sample their own spotlight shadow depth per fragment, so clear parts reach surfaces while platforms and covers cast shadows through the volume. Range is 30m, warning 80ms, fire interval 45ms, and projectiles travel at 120m/s. The first laser sweeps vertically through 2.5m every 1.2 seconds; the harder second laser stays continuously active and sweeps 2.8m every 0.9 seconds. Both use the shared production metal-emitter presentation and reset their timing on retry.

## Checkpoints and scope

The authored room tracks CP3 at entry, CP4 after the initial cooperation sequence, and CP5 before the bridge. Explicit checkpoint recovery can restore progress, but death retry always resets Room 2 to CP3: all three slime positions, lights, covers, lifts, bridge, laser timing, drone state, and shots start fresh. Full-level restart still returns to Room 1.

The far deck leads beneath a half-raised shutter physically propped up by a shipping crate. An 18m, fully enclosed hallway with independently flickering ceiling lights connects it to the safe boss-sector staging room; the floor is continuous and all three slimes can walk through without jumping. Staging and its shortcut checkpoint sit beyond the hallway, with the final arena bulkhead still sealed. Room 3 is now the boss room; this implementation does not silently load the obsolete gauntlet or the foundation's development boss fixture. Final boss-room integration, texture polish (#163), and dedicated audio remain separate work.

## Verification

Use `npm test` and `npm run build`. Room-specific coverage is in `BlackoutTransitRoom.test.ts`, `BlackoutTransitTraversal.test.ts`, the transit controller tests, and the Room 1/2 runtime handoff tests in `BlackoutRoomOneRuntime.test.ts`.

For playtesting, check the first unlit view, local light-bank reveals, Goop's upward aiming, lift riding while switching bodies, bridge switch holding, and death/retry at each stage. The layout should be tuned from actual movement probes and player feedback, not shortened by adding extra filler platforms.
