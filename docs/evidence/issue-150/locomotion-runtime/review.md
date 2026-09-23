# Bob directional locomotion in the built game

The production `bob-authored.glb` now contains the approved candidate's
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

Reproduce from the repository root:

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-authored.py
node --test --test-isolation=none tests/BobGateOneAsset.test.ts tests/BobMorphAsset.test.ts tests/BobCharacterPresentation.test.ts
npm run build
node scripts/capture-bob-runtime.mjs
```

The plain-production browser control test is in
`tests/browser/LevelOneShaderProgramStability.spec.ts`.
