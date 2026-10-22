# Mandatory drone encounter evidence

Production Chromium captures use normal game lighting and exposure. Camera
surveys stage authored body positions; real controllers, collision bodies,
acid projectiles and hostile projectiles perform the checked interactions.
They are repeatable encounter checks, not an uninterrupted playthrough.

| Situation | Capture |
| --- | --- |
| Widened normal surveillance beam covering Bob's route | ![Widened route scan](route-surveillance.png) |
| Bob's lift remains unpowered while its guard lives | ![Locked Bob lift](mandatory-bob-lift-locked.png) |
| Volt's bridge remains retracted while guards live | ![Locked Volt crossing](mandatory-volt-bridge-locked.png) |
| Physical hallway shutter before destruction | ![Closed security shutter](mandatory-exit-shutter-closed.png) |
| Half-submerged guard during emergence | ![Emerging guard](mandatory-guard-emerging.png) |
| First guard redirects its beam and fires at Goop | ![First guard retaliating](mandatory-guard-1-retaliating.png) |
| Second guard redirects its beam and fires at Goop | ![Second guard retaliating](mandatory-guard-2-retaliating.png) |
| West guard retaliates toward Goop's basin firing position | ![West guard retaliating](mandatory-guard-3-retaliating.png) |
| Bob can operate the bridge switch after the guards are destroyed | ![Bob's released route](mandatory-bob-bridge-released.png) |
| The same Volt crossing after Goop destroys the guards | ![Released Volt crossing](mandatory-volt-bridge-released.png) |
| The same hallway view with the security shutter released | ![Open security shutter](mandatory-exit-shutter-open.png) |

The closed/open Volt and hallway pairs use identical survey cameras. Tests also
assert real projectile hits on Goop, physical blocking before clearance, Bob and
Volt walking through afterward, and locked/open checkpoint recovery.

Reproduce with:

```text
npm run build
npx playwright test tests/smoke/EmergingSewerDrones.spec.ts --config playwright.smoke.config.ts --grep "mandatory drone"
```

Additional machine-readable results and logs are ignored local artifacts:
`artifacts/evidence/batch-3-drone-refinement/mandatory-encounter-results.json`
and `test-results/mandatory-*.log`.

See [implementation and validation](../../mandatory-drone-encounter.md).
