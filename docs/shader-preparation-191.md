# Shader preparation (#191)

Baseline: `0cbd21ade13b5dba584d1858c49db93747a8dadf`.
Implementation branch: `codex/191-shader-preparation`. No push/PR/merge is part
of this work. The photographed expected Wits target is an ASUS NUC12WSK-B,
i3-1220P / Alder Lake GT2, 16 GiB, Ubuntu 24.04.1, GNOME 46 / Wayland.
That machine has not been measured here.

## Reproduction and evidence

Use Node 24 / locked npm 11 dependencies. Build an untouched baseline checkout
and the candidate, then use the SAME diagnostic script with each build:

```powershell
npm ci
npm run build
node scripts/profile-shader-preparation.mjs --label before-matched --dist <baseline-dist> --runs 2 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label after-matched --runs 2 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label before-standard --dist <baseline-dist> --profile standard --runs 1 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label after-standard --profile standard --runs 1 --channel msedge --headed
```

The script does not force a Windows backend and can select a locally installed
Chromium channel on Linux. Record the actual renderer, browser, buffer, settings
and extension data; software rendering cannot qualify hardware performance.
It serves production files, opens an ordinary URL and only exposes existing
runtime owners. Controller completion/room entry is staged. Short opposing real
keyboard movements, jump and mouse input follow room inspection; this is not a
full puzzle playthrough or a sustained performance/thermal qualification.

Fresh means a new browser process/profile per pair; warm means another navigation
in that same browser context. Playwright response routing disables HTTP cache.
Driver/OS caches, temperature and clocks are uncontrolled. Never call these
guaranteed driver-cold measurements. Navigation-to-control includes automatic
title preparation; Start-to-control is reported separately. Level 2 readiness
starts at completion/transition request, BEFORE the Enter button becomes visible.
The early exploratory `before-minimum` run incorrectly timed only Enter-to-control
as Level 2 loading; exclude that field. Its individual preparation phases remain
raw diagnostic evidence, not the matched comparison.

Raw JSON, shader source text/SHA-256 hashes, program cache keys, GL call times,
screenshots and test logs live under ignored `artifacts/`. The implementation
report must identify the exact final captures and hashes. Reviewers need the
evidence bundle as well as these committed reproduction commands.

Compilation submission is measured separately from elapsed promise time. The
latter includes browser scheduling and any other overlapping work; it is not
isolated GPU compiler time. Frame GPU queries cover the complete live renderer
draw, including its transmission/shadow work. Invalid/disjoint/pending samples
are not invented. Inspector wrappers and shader-source retention have overhead;
use identical instrumentation before/after and keep raw rows.

## Confirmed regressions

- The Settings regression on the baseline creates new physical/linear programs
  after switching Minimum to Standard. Its log is `artifacts/191-readiness-before.log`.
- With its old exception removed, the baseline F1 smoke fails on exactly three
  depth programs with seven point lights (`artifacts/191-f1-before.log`). The
  layer-probe test called `RenderLayer.render()` outside Cultivation's bounded
  runtime light selection, poisoning Three's previous-light state. F1 was not
  the cause. The corrected probe must use `runtime.render()` and reject growth.
- The stronger inspection test fails even after compilation-count stability:
  opaque linear-output and gel programs run `getProgramInfoLog` on the live
  draw (`artifacts/191-inspection-before.log`). Compile completion alone did not
  establish first-use readiness.

## Implementation decisions

Only crossing between zero and positive gel transmission changes shader
features in current profiles. Resolution/capture scale, shadow-map size and
decorative draw counts remain resource changes. Physical/reduced transmission
share shader programs. Session preparation serializes shader-affecting material
mutations, coalesces queued changes, and gates rendering/simulation/resume.
Startup/transition preparation also excludes overlapping settings mutations.
Cancellation invalidates owner/readiness state; stale completions cannot restart
an unloaded runtime. Failure keeps an explicit reload-to-retry status.

Preparation continues to own copies and borrow live geometry/textures/uniforms.
Cultivation reuses copies and completed visible coverage only for the SAME source
material, drawable features, shader-affecting material state and bounded light
signature. It does not merge live materials on GLSL similarity. Unique linked
programs and duplicate submissions are distinct metrics.

Effective materials, including dormant/captive forms, determine whether opaque
linear-output variants are needed. Minimum can omit those forms. Depth/distance
programs, comparison samplers, fades, morphs, instance attributes and uploads
remain required. Character LOD uses one immutable index bank with draw-range
changes, so LOD transitions must retain its existing uploaded bindings.

Real isolated linear primers exercise inspection/bindings. Transmissive screen
primers use cloned bounded lights but the retained live scene/camera. All live
objects are excluded from the temporary layer and masks/hierarchy are restored
synchronously. Effective capture scale/dimensions are retained; a one-pixel
temporary scene must not create a separate renderer-owned transmission target.
The canvas scissor preserves live pixels, but does NOT make transmission-target
work free. Individual driver operations remain indivisible; nominal queue slice
budgets are not maximum stall guarantees.

## Validation and measurements

Final matched measurements and verification results are recorded after the final
implementation build. Historical Windows UHD 620 and Radeon reports are not
baseline measurements for the new Wits Linux target. No visual quality reduction,
shader-error-check disablement, Three.js fork or gameplay shortcut is authorized
as a performance optimization.
