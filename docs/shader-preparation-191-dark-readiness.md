# Issue #191: dark-room readiness review fix

This supplements the [main integration record](shader-preparation-191-main213.md)
for PR [#214](https://github.com/Gradient-Ascenders/Specimen/pull/214).
The prior reviewed head was `584fc1c48dfb3e07361eb07cb7809b3a1adbbeb4`.
Production source for this correction is `f018dcd7d261b7e360965cdd3fcdc5bdb5058365`;
later changes retain test evidence and document verification.

## Cause and correction

`render()` requested the actual dark configuration, but `prepareCurrent()`
always selected bright. When bright was ready and dark needed preparation,
the helper could return bright readiness and discard dark demand. The outer
resource-preparation loop then rendered again, rediscovered dark demand and
retried without awaiting the asynchronous compiler.

`prepareCurrent(dark)` now requires an explicit mode and uses it before and
after its awaited preparation. Both runtime preparation paths and rendering
share the existing Room 5 / completed Room 4 lift rule, derived from the active
body and authored controller. Disposed queues return immediately and late
completion cannot re-arm demand. Existing synchronous light restoration before
awaiting compilation remains intact. No compilation coverage, shader checks,
primer dimensions, scheduler budgets or material signatures were removed.

## Failing-first evidence

Commit `72b0d72` adds the regressions before the source correction:

- Two unit cases fail on the old source because dark preparation returns bright
  readiness instead of reaching the held asynchronous compiler.
- The browser case fails against the prior production build with
  `Dark demand retried without awaiting preparation`. The test bounds retries
  so the faulty microtask loop fails rather than hanging the browser.

The unit fixture starts with the matching bright configuration prepared and
adds a real visible light-signature difference to prevent valid subset reuse.
It holds the compiler promise, verifies timers still run and renderer state is
restored during the wait, then tests completion and disposal separately.
Temporary shadow targets/textures, borrowed geometry and workload ownership
retain their existing assertions. A second call on ready dark state performs
no additional compilation.

The browser fixture uses actual Room 5 gameplay and the session graphics gate.
It deliberately invalidates readiness metadata for an earlier light layout
while retaining GPU programs, establishing bright-ready/dark-unprepared demand
without removing valid production reuse. It exercises a resource-only
transmission scale change, then Minimum and physical shader changes. This is a
controlled regression fixture, not evidence of the bug's frequency in ordinary
play or driver-cold performance.

## Verification

The corrected focused unit cases pass; the complete suite passes **1,064 tests**
with no failures, cancellations or skips. Type-check, generated-asset
reproducibility, production build, archive byte verification and production
layout validation (**90 files**) pass.

The five focused native Edge browser cases pass: room/fade shader coverage and
background lighting isolation in Normal and Performance, plus the new dark-room
regression. Both isolation cases retain 313 compiler submissions / 508 primers,
maximum pixel difference **0**, no live program growth, state changes or GL
errors.

The new regression records:

- All three preparation calls request dark mode; bright and dark finish ready,
  with no pending demand, and the resource-only change retains the queue.
- Two resource-preparation render attempts and 44 asynchronous timer turns
  across the complete three-change test; no retry-loop starvation.
- 37 resumed gameplay draws with zero program growth, shader inspections,
  texture/renderbuffer storage calls or GL errors; no console/page errors.
- The graphics gate opens and closes exactly once per change.

Three additional native Edge browser cases pass: retained-target sizing,
all-level graphics cycles/fades/switching/restarts, and direct transmission
switches on active gameplay. The latter records 12 switches and 221 resumed
draws: 48 storage calls behind preparation, zero live storage/inspections/program
growth, and no full shader preparation passes. Two default software-renderer
production smoke cases also pass against the extracted ZIP at `/group-folder/`,
covering plain boot/credits/start/restart and Cultivation/Blackout load/restart.
That is **10 distinct browser/smoke cases** in this correction pass; the earlier
35-case integration selection remains a separate historical run. A representative
current Level 2 physical-profile screenshot was inspected. This was correctness
verification, not a fresh performance benchmark.

Independent source review found no verified blocker in mode selection,
restoration, cancellation or ownership. No prior shader, pixel, switching or
lifecycle assertion was weakened.

## Reproduction and artifacts

Run with Node 24.x / npm 11.x from the feature worktree:

```text
node --test --test-name-pattern=current-dark tests/CultivationPresentationPreparation.test.ts
npm test
npm run type-check
npm run check:generated-assets
npm run archive
npm run validate:production
npx playwright test --config artifacts/playwright.transmission.config.ts tests/browser/CultivationBobPresentation.spec.ts --grep "dark-room graphics preparation|background compilation and primers|draws prepared room and fade" --output artifacts/191-dark-focused-browser-results
```

The archived native Edge configuration and `artifacts/run-191-dark-validation.ps1`
reproduce graphics-cycle/transmission and ZIP-extracted nested smoke checks.
Logs, failing-first results and the dark-room raw JSON are retained under
`artifacts/191-dark-*`. The evidence bundle is `artifacts/191-dark-evidence.zip`;
its embedded manifest records revisions and individual entry hashes/lengths.
The prior integration bundle remains separate and unchanged.

Production ZIP: `artifacts/specimen-production-191-dark.zip` (12,883,598 bytes).
SHA-256: `C90CCB1D008A9BAAF8FC8FAEEAA3438098E3D0AB786FB29F75952320C919B209`.

## Scope and outstanding performance work

This correction changes configuration selection and cancellation only. It
retains the existing Minimum variant reduction; there are no new matched
loading benchmarks in this review pass. Historical timings and cinematic
startup definitions in the linked report remain historical, not new results.
The five-pair fresh Standard navigation + Level 2 waiting regression
(63.819 to 67.960 seconds on the earlier pre-cinematic route), warm frame-tail
limitations and Wits hardware qualification remain open under #191.

The expected assessment machine is the photographed ASUS NUC12WSK-B with
**i3-1220P / Alder Lake GT2**, 16 GiB, Ubuntu 24.04.1 / GNOME 46 Wayland.
It remains untested. These Windows UHD 620 / native Edge correctness checks
cannot establish performance on that machine. Keep #191 open; do not merge
without independent PR review.

## Subsequent shadow-cap review correction (2026-10-17)

A second review found that Minimum + Physical to Standard retains its shader
class while changing the shadow-map cap from 512 to 1024. The resource policy
disposes affected maps, and the transmission-only primer deliberately suppresses
shadow updates. The failing-first native Edge regression reproduced two storage
calls on ordinary draws and no full preparation pass on the prior PR build.

The production settings boundary now uses `graphicsPreparationKey()`, combining
the unchanged shader class with the shadow-map cap. Cap changes use the existing
full runtime preparation path, including its restoration and ownership rules.
Capture-scale-only changes still use resource preparation without a full pass.
This deliberately pays the full preparation cost behind the gate on a profile
cap change; it makes no claim that this extra loading work is free. No shader
variants, error checks, lifecycle assertions or preparation coverage were removed.
Direct browser fixtures now use the production key rather than legacy literals.

Focused verification passes: 22 tests across `GraphicsPreparation.test.ts`,
`GraphicsProfiles.test.ts` and `RenderShadowPolicy.test.ts`; type-check;
production build and 90-file production-layout validation; and three native
Edge browser cases. The new real-settings regression covers all three levels:
one full preparation pass per cap change and zero storage/inspection calls,
program growth or GL errors across 165 subsequent ordinary draws, including
at least 12 resumed gameplay draws per level. The existing transmission-only
regression covers 12 switches / 226 resumed draws, with zero full preparation
passes or live storage/inspection/program growth. The updated dark-room
regression also passes. This pass intentionally uses focused coverage rather
than repeating the complete unit/browser suites or loading benchmarks.

The first corrected browser attempt had no cold storage calls, but exposed a
probe error: multiple lights referenced a shared fallback map and registered
multiple disposal listeners on it. The probe now observes each unique target
once; the disposal assertion remains strict. Failed runs remain preserved.
Independent source review found no verified production blocker.

Reproduction/evidence: `artifacts/191-shadow-before*` retains the failing-first
run; `artifacts/191-shadow-after*` retains the probe failure;
`artifacts/191-shadow-final*` and `artifacts/191-shadow-dark*` retain final browser
results and JSON. Targeted unit, type-check, build and production-layout logs
use the same `191-shadow-` prefix. Earlier production ZIPs and benchmark tables
above belong to their recorded revisions, not this correction. No new loading
benchmark was run. Standard loading, warm frame tails and Wits qualification
remain unresolved under #191.
