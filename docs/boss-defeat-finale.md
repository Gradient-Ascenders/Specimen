# First sunlight — boss defeat finale

The authored Level 3 boss now hands its first confirmed defeat to a 179-second,
in-engine ending. Boss HP, attacks, checkpoint thresholds and weapon balance are
unchanged. Gameplay hazards and minions stop before the movie takes ownership.

## Sequence

- Scorched, damaged EX-04: missing fan, drooping weapon/fan assemblies, torn
  armour, exposed coils and severed wiring. Its remaining core gathers power.
- Both beams visibly travel from their emitters before colliding. Specimen
  fires only after the camera cuts to its emitter, reaching the impact point in
  0.22 seconds. The shared impact point pulses
  around the midpoint; neither side wins. Face cuts, a battlefield wide and a
  rotating collision shot build into a white-out explosion. The deadlock itself
  lasts approximately 17 seconds, instead of the original 38-second hold. The
  old gameplay defeat drop, finishing projectile and premature explosion are
  removed; the finale now owns the boss’s final destruction.
- Boss shrapnel scatters. Smoke masks the fused model swap while Bob, Goop and
  Volt are hurled apart onto the existing ring and land in 1.4 seconds. The
  shattered boss loses its remaining engine assemblies and tumbles down the pit,
  with an ember light following the wreck. They regroup amid falling panels.
- Reinforcements emerge gradually through six wall launch bays using 24 slots.
  Goop interrupts after eight seconds, while the wave is still farther away.
  Goop sends Bob and Volt away, then fires into the wave. Bob brakes, settles,
  then turns smoothly to look back; Goop’s
  farewell gets its own close-up before Bob catches up with low running jumps.
  Goop continues facing the drones. Return fire starts just after Bob and Volt
  leave; three shots land with gel reactions and visible impact rings amid the
  near misses. The goodbye line lasts 2.7 seconds. Half the wave survives.
  Neither Goop nor the drones are shown in the final destruction wide.
- Pull back through the collapsing chamber, fade to black, six seconds of
  silence, then emerge from a fully enclosed, detailed emergency passage into
  daylight. A small concrete doorstep ends exactly where the tunnel floor begins; the
  old four-metre coplanar overlap is removed. The tunnel ends in working daylight
  doors and closes a rear isolation door after the farewell.
  The exterior terrain mesh stops outside the building boundary and cannot rise
  through the lab corridor. The final wide faces the opposite side of the chamber,
  with falling roof girders, renewed ceiling debris, dense smoke and twelve
  staggered explosions rather than looking back at Goop’s doorway.
- The camera lifts toward the sun and sky. A rolling credits presentation reads
  the same `CREDITS.md` supplied to the regular credits ledger. The regular
  credits menu remains available after the cinematic roll finishes.

The exterior uses a contoured terrain mesh, seeded grass/rock distribution, 240
layered fir trees, distant ridges, terrain colour variation, sunlight/contact
shadows and atmospheric haze. Geometry and surface grain are generated locally;
no third-party environment assets are introduced.
Bob and Volt step down onto the meadow and stand among short grass for the final
landscape reveal; no concrete apron extends beneath them. Drone dissolving sound
effects are omitted from the ending while combat and collapse cues remain.

All five requested dialogue lines are preserved verbatim. Character dialogue
uses the game’s existing subtitle/typewriter audio convention; there are no new
recorded voice assets or third-party models or textures.

## Ending sound effects

The 14 requester-selected ElevenLabs WAVs remain unchanged in
`ending-cutscene.tar`. `scripts/import-ending-audio.py` prepares mono Vorbis
assets under `public/assets/audio/ending/`; source hashes, onset trims, gain,
duration fitting and 100 ms circular loop overlaps are recorded in
`docs/assets/ending-audio-import.json`. The supplied `beam-deadlock.wav` is a
two-second impact with a decaying tail, so it provides the initial collision.
There is no separate sustained collision recording: the deeper deadlock layer
reuses the existing boss beam at 0.72 speed with its own voice budget.

`BossDefeatAudio` follows the movie's fixed clock, including the two separate
beam launches and their collision after flight, the overload and explosion,
slime separation, falling wreck, ballistic debris, Goop's actual shots and
three direct hits, and the twelve staggered collapse blasts. Four selected
crossfire lanes provide bounded firing/flyby/impact accents. Existing recordings
provide drone motors/deployment, doors, body contacts, jumps and landings.
Movement follows visible sampled poses, without sounds from teleports or seeks.
These cues use a screen-space mix so the fixed gameplay listener cannot mute
the tunnel escape or outdoor reveal.

Structural rumble carries the collapse; six quiet panel/debris accents and two
major girder crashes replace the previous repeated metallic hits. The rumble
fades in with the boss-defeat handoff, rises at the final explosion, and uses
1.4 catalog gain (about +3 dB) for a more audible aftermath. Floor-shot
ricochets are sparse as well. Combat and rumble soften during Goop's goodbye. All requested effects, including
one-shot tails, stop at 105 seconds; the exit door remains silent until the
111-second daylight reveal. Outdoor ambience fades out before the credits at
133 seconds. Pause freezes the shared AudioContext; skip, reset, normal completion
and disposal release the ending's own loops and reused one-shots. Rehearsal
remains silent. The score, dialogue and 179-second duration are unchanged.

## First Sunlight soundtrack

`public/assets/audio/music/10-blackout-first-sunlight-ending.ogg` is copied
unchanged from the approved `first-sunlight-complete-ending.ogg` (SHA-256
`60212b64ba1f8fcb101ce5d51cd7df89ca8f785b9f4e105c99b00da2660ae175`).
It is one 179-second stereo Vorbis stream: Claimed by the Void at 0–105s,
six seconds of silence, then Exploration Theme at 111–179s, including the
credits beginning at 133s. Both works are separately credited in `CREDITS.md`;
the existing menu ledger and rolling credits read that same source.

Real `begin()` creates one `CinematicMusic('ending', ENDING_TIMING.duration)`
token at time zero. Fixed updates advance its clock through daylight and the
credits without a restart. Rehearsal creates no token. The shared
`BackgroundMusic` players cancel outgoing boss ownership/fades before starting
the nonlooping score at normal speed and zero source offset, with the existing
0.28 music gain and master/music controls. The supplied file owns its fades;
the ending bypasses the usual runtime end envelope and stops immediately on
completion, skip, reset or disposal. Other cinematic and boss mixes are unchanged.
Pause, focus and slow-frame synchronization use the existing music owner.

## Preview and ownership

Development build: **Select cutscene → First sunlight**. Natural gameplay:
deliver the final hit to the Level 3 boss. **P** pauses; **Enter** or the skip
button jumps to the start of the rolling credits at 133 seconds. This stops
the movie's effects, seeds the sky/credits view without replaying skipped cues,
and seeks the existing soundtrack to the same time. The ending retains ownership
and progression remains uncommitted while the credits roll.
During the rolling credits the button changes to **Return to
title**: returning fades to black over 0.4 seconds, restores a fresh title scene
behind an app-owned cover, then fades into the menu without a page reload. The
cover survives cinematic cleanup, so restored characters/cameras cannot flash
through. That return action enters menu preparation directly without activating
the standalone credits ledger. The regular ledger's return action uses the same handoff.
Completion is emitted once.

Character yaw rigs rebuild the full rotation after rehearsal restores their
quaternions, clearing equivalent X/Z half-turns that could reverse the visible
face. Dialogue participants look toward the speaker; escape and look-back
headings retain their authored directions.

All borrowed actor parents, transforms, lights, materials, camera settings and
scene background/fog are restored on recovery, restart and disposal. Fixed-size
effect pools and 30 rendered lighting/camera samples are prepared behind the
existing loading mask. Rehearsal does not advance bodies, expose cinematic UI,
emit dialogue sounds or commit progression. Changing graphics reruns preparation.

## Validation

- `npm run type-check`
- `npm test`
- `npm run build`
- `npm run validate:production`
- `playwright test tests/smoke/BossDefeatFinale.spec.ts --config playwright.smoke.config.ts`

The production smoke uses a controlled phase-two damage adapter to exercise the
actual defeat handoff, pause, sampled story frames and the terminal credits
handoff. It is not evidence of a human-input victory or hardware frame-rate
qualification.

Set `SPECIMEN_ENDING_SKIP_CREDITS=1` for the browser smoke to additionally press
the real credits-skip button and verify the covered transition to a fresh title
scene on the same page.

Set `SPECIMEN_ENDING_SKIP_TO_CREDITS=1` to click the real skip button during
the beam struggle and verify the active rolling credits, cleared effects and
synchronized soundtrack. Combine it with `SPECIMEN_ENDING_SKIP_CREDITS=1` to
verify both successive actions through to the menu.
