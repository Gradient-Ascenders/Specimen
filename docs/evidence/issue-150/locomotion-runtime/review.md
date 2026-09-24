# Bob directional locomotion in the built game

Historical evidence for the directional-lean implementation before issue #155's
Reach/Gather mass-transfer pass. The current production movement is documented
under `docs/evidence/issue-155/mass-transfer-runtime/`.

At the time of this capture, production `bob-authored.glb` contained the approved candidate's
`move-forward` and `move-reverse` body and eye-seat morphs. The neutral curl,
collider, gameplay physics, controls, and the other five reaction poses are
unchanged. `BobCharacterPresentation` uses resolved movement to gate a signed,
velocity-scaled lean. It holds through steady travel, settles on stopping, and
crosses into a brief counterlean before a bounded facing turn. Charge, launch,
airborne, landing, and damage retain their primary-pose priority.

[Gameplay-camera clip](gameplay-camera-movement.webm) records the built game at
960 × 600. It includes acceleration, cruise, stop, sharp reversal, charge,
jump, landing, and the Room 1 sticky wall. The [observations](observations.json)
come from the production Bob presentation and kinematic body. The capture only
exposes the already-constructed runtime for diagnostics and moves between
rooms through the existing development checkpoint shortcut. It does not
replace the GLB or drive morph weights.

The captured full-speed cruise held forward weight 0.987. Stopping reduced it
to 0.021. During reversal the reverse target reached 0.605 before Bob finished
the bounded turn. Charge used Squash, the jump used Airborne, and landing used
Squash. The wall sample had `attached: true`, outward support normal `(0, 0,
-1)`, and positive forward lean while ascending. The browser reported no page
errors or failed requests.

The current generator and capture script produce the issue #155 movement.
Use commit `5fd2655` to reproduce this archived directional-lean capture.

The plain-production browser control test is in
`tests/browser/LevelOneShaderProgramStability.spec.ts`.
