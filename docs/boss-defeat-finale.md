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
recorded voice assets or third-party models, music or textures.

## Preview and ownership

Development build: **Select cutscene → First sunlight**. Natural gameplay:
deliver the final hit to the Level 3 boss. **P** pauses; **Enter** or the skip
button completes the ending through the normal split/escape/completion state
transitions. During the rolling credits the button changes to **Return to
title**: skipping then performs a clean title restart, rather than opening the
same credits a second time. Completion is emitted once.

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
the real credits-skip button and verify that a fresh title page loads.
