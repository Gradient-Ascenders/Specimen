# Bounded graphics profiles (#190)

Baseline: main `c3e9ed8` (includes #188 gel modes and #189 lighting budgets).
Owner: Uzair; independent reviewer: Kevin, confirmed on the issue.

## Policy and user controls

The application starts in **Minimum hardware** on every device. This is a
conservative engineering default, not GPU detection or a claim that the unknown
assessment PC meets a performance budget. Settings are session-owned and survive
level transitions and restarts, not browser reloads.
The separate Show FPS and Reduce menu motion preferences are saved on the device;
they do not persist a more expensive gameplay profile. Reset to defaults clears
those preferences and restores the safe session defaults in one update.

| Policy | Minimum hardware (default) | Standard |
| --- | --- | --- |
| Absolute drawing-buffer budget | 921,600 pixels (720p area) | 2,073,600 pixels (1080p area) |
| Device-density cap | 1× | 1.5× |
| Render scale after capped density | 75% per dimension | 100% |
| Character gel | Non-transmissive glossy physical gel | Authored refraction with 75% width/height capture |
| Shadow-map maximum, per face | 512×512 | 1024×1024 |
| Opted-in decorative point density | 50%, rounded up | Authored count |
| Main-canvas multisample antialiasing | Off | Off |

Both presets retain existing authored room lighting, shadow casters, occlusion,
warning beams, electricity cores/branches, projectiles, HUD, aiming overlays and
all gameplay authority. They share #189's bounded Cultivation light layouts (up
to four point slots, one of them shadowed, plus three shadowed spot slots).
Level 1/3 keep their existing room-scoped lighting; #190 does not introduce a
second light-selection algorithm or weaken detection to meet a budget.

Canvas MSAA is fixed at context creation. Both presets use the same non-MSAA
context so switching does not recreate the renderer, invalidate asset ownership
or silently retain the startup preset's antialiasing. Standard is sharper but
does not promise the old MSAA look. Three's refraction target still has its
own internal multisampling in Standard/full-refraction modes; Minimum avoids
the character-triggered capture rather than claiming that target is non-MSAA.

Settings exposes the profile, density cap, 50/75/100% render scale and existing
gel options. Overrides are labelled **Custom**, retaining the base profile's
absolute pixel/shadow/effect limits. Choosing a preset resets its graphics
overrides in one notification, without changing sound, camera or input settings.
Full physical refraction remains available as a custom gel choice. None of these
options can bypass the drawing-buffer budget.

Main's independent Normal/Performance preset is retained as **Additional
performance cap**: Off (`normal`) leaves the selected profile/custom settings
alone; On (`performance`) further caps density at 1× and refraction capture scale
at 0.5. It does not overwrite the saved density or gel mode, and an explicit
0.75× density still works in either state. Its refraction cap composes with gel
quality using the smaller scale. Selecting a whole profile resets this override
alongside scale, density and gel; the application still starts in Minimum.

The settings diagnostics show actual buffer dimensions, display/effective DPR,
requested scale, profile/custom base, pixel budget, gel, shadow cap, effects and
lighting/MSAA policy. They update on host resize, settings and display-DPR changes.
`RenderLayer.getDiagnostics()` exposes the same fields. Flight-recorder schema 2
adds them to its frame rows and export snapshot; old columns retain their order.

## Resolution and ownership

The requested density is `min(max(1, displayDPR), densityCap) × renderScale`.
The actual density is the minimum of this, `sqrt(pixelBudget / CSS area)` and
the device's texture/renderbuffer/viewport limits. A longest-edge bound and a
capture-aware physical-pixel floor also handle degenerate/narrow viewports. The
shortest side is at least `ceil(1 / transmissionResolutionScale)` pixels (two
for balanced or Performance-capped refraction), so its multisampled target retains a physical
texel even for a one-CSS-pixel host. The longest edge reserves that short-side
cost inside the same absolute pixel budget, including pathological aspect ratios.
Changes to the capture floor resize the canvas even at unchanged CSS size/DPR. Integer
rounding never increases area beyond the budget. These are area limits, not a
mandatory 16:9 render target; camera framing always uses the CSS aspect ratio.

CSS canvas size and DOM/text/aim controls stay at native browser resolution.
The title, in-game opening and standalone trailers temporarily target 1× CSS-pixel density at
100% render scale, independently of gameplay's 75% default. Their 921,600-pixel
presentation cap composes with the profile budget and device limits, so smaller
windows are not needlessly upscaled and larger windows remain bounded. Leaving
the opening restores the selected gameplay profile/scale; diagnostics report the
active presentation resolution while it is visible.
`setDrawingBufferSize` applies the bounded size/density in one allocation, avoiding
an intermediate old-large-window × new-DPR allocation. A `ResizeObserver`, window
resize and renewed resolution media query cover layout and display/zoom changes.
A cheap DPR comparison before rendering also handles changes that do not deliver
a media-query event; it only recalculates sizing when the density actually changes.

No frame-time-driven adaptive resolution is enabled. Available measurements do
not establish the assessment GPU, numeric target, or sustained GPU load. Reacting
to first-use compilation/loading stalls would blur the image without removing
their cause. The deterministic pixel cap gives a stable, reproducible starting
point; an adaptive controller with hysteresis needs #198's qualified routes and
budgets first.

`GraphicsResourcePolicy` catalogs on top-level root attachment/detachment, not
every mesh each frame. Future late nested light/effect additions must call
`RenderLayer.refreshGraphicsResources()`. It remembers authored shadow sizes,
caps hidden sources as well as visible ones, never upscales smaller fixtures or
one-pixel fillers, and restores authored sizes when moving to Standard. A size
change disposes and clears the replaced targets once, then invalidates the map.
Root changes immediately clear strong catalog references, even if unload leaves
the renderer idle and there is no following frame to refresh its catalog.
The light owner still releases the final map on unload. No light colour,
intensity, range, layers or detection cone is changed.

Only explicitly marked `Points` geometries are thinned: Containment's restrained
point bursts, maintenance-drone dust and Volt's supplementary travelling sparks.
No gameplay projectile, aim guide, core arc, hazard beam or essential light is
removed. Geometry/position pools and simulation remain unchanged; draw ranges
reduce decorative GPU vertices/overdraw, not their CPU update loops. Standard
restores the authored range; policy teardown does not dispose borrowed geometry.

Loading primers account for effective density. A one-logical-pixel primer can
otherwise become a zero-sized refraction target at sub-native/half-capture
settings. Main's primer policy is preserved: temporarily use transmission scale
1 and a viewport spanning at least one physical pixel, then synchronously restore
the transmission scale, target, viewport, scissor and counters. The draw stays
tiny and offscreen, without changing subsequent gameplay quality.

## Reproduce and review

```sh
npm run type-check
npm test
npm run build
npm run validate:production
npx playwright test tests/browser/GraphicsProfiles.spec.ts
```

The browser regression observes production bundles through a test-only session
exposure; no observer globals are shipped. It checks both profiles, custom
overrides, 3840×2160/320×900/resized windows, changing display DPR, actual canvas
pixels/aspect, native HUD, two level handoffs and three level restarts, late character gel,
map disposal, GL/console/network errors, and 50% scaling with reduced refraction
during handoff. The scene is staged/frozen for deterministic checks; this is not
a native puzzle-completion or sustained gameplay benchmark.

A dedicated narrow-host regression overrides the UI's normal 320px minimum and
performs real production draws at 1×360, 640×1 and 1×1 CSS pixels. It checks
multisampled target dimensions, actual framebuffer completeness and GL errors
while toggling reduced/full/no refraction and the additional Performance cap. This
regression was added in response to review; it has not been browser/GPU-executed
locally because computer testing remains stopped.

For a matched before/after capture, separately build/serve untouched `c3e9ed8`
and the candidate, then supply `SPECIMEN_GRAPHICS_BASELINE_URL` alongside
`SPECIMEN_PRODUCTION_URL`. `SPECIMEN_BROWSER_CDP_URL` can connect to an isolated
native browser. The comparison uses 1920×1080 CSS at DPR 2, identical actor/camera,
five warmup draws, then 24 full WebGL-render timer queries per setting. Buffer,
gel, shadow and MSAA differences are deliberate quality changes, **not same-quality
shader speedups**. Queries include submission gaps and do not establish gameplay
FPS. Software rendering is correctness evidence only.

Captures go under ignored `artifacts/evidence/issue-190/`. Reviewed copies are
retained under [evidence/190](evidence/190/). No dependencies, authored assets,
colliders, damage, level layout or game input bindings changed.

## Retained local evidence and limits

The saved native run completed **before the user stopped computer testing**.
No Windows browser was reopened after resuming repository work. Captures use
AMD Radeon RX 6600 / Edge 155 / ANGLE D3D11, 1920×1080 CSS, display DPR 2.
This is not the unknown assessment GPU or a Dell/Intel qualification.

| Build / profile | Actual drawing buffer | Gel / canvas MSAA | GPU p50 / p95 (ms) |
| --- | --- | --- | ---: |
| Main `c3e9ed8`, legacy default | 3840×2160 (8,294,400 px) | Physical / on | 13.80 / 14.53 |
| Candidate, Minimum | 1280×720 (921,600 px) | Non-transmissive / off | 1.80 / 5.02 |
| Candidate, Standard | 1920×1080 (2,073,600 px) | Half-resolution refraction / off | 3.48 / 7.27 |
| Candidate, Minimum repeat | 1280×720 | Non-transmissive / off | 1.78 / 2.57 |
| Candidate, Standard repeat | 1920×1080 | Half-resolution refraction / off | 4.03 / 7.57 |

These are 24 warmed full-render queries per row at one frozen Level 1 pose.
Actor position and camera position/quaternion match exactly. All queries
completed, none were disjoint, and both raw logs contain no GL/console/network
errors. Driver cache, power state and unrelated desktop workload were not
controlled. The repeats show variance and are not combined into a sustained
gameplay result. **The nine-times-smaller Minimum buffer, different refraction,
shadow detail and MSAA policy explain a quality/performance trade-off, not a
same-quality shader optimization.** No startup or frame-pacing improvement is
claimed from this short comparison.

- [Raw comparison, asset hashes and individual GPU queries](evidence/190/comparison.json)
- [Raw lifecycle/resize/DPR snapshots](evidence/190/lifecycle.json)
- Matched screenshots: [legacy default](evidence/190/baseline-main-legacy-default.png),
  [Minimum](evidence/190/candidate-minimum.png), [Standard](evidence/190/candidate-standard.png)
- Readability review: [320px settings](evidence/190/settings-narrow.png),
  [Level 2 Minimum](evidence/190/level-2-minimum.png), [Level 3 Minimum](evidence/190/level-3-minimum.png)

The lifecycle run records 28 snapshots across profiles, custom overrides,
resizes, DPR 2/1.25/1, handoffs and restarts. Both later-level entries retain the
custom 50% scale with reduced refraction (640×360 buffer), with visible pixels
and no GL errors. All 59 sampled live shadow targets were disposed exactly once
by final unload. This is sampled ownership evidence, not a maximum GPU-memory
measurement or complete puzzle/combat playthrough.

The raw hashes identify the original browser-tested candidate. Subsequent work
released stale catalog references on root changes and merged main `e53d27d` (PR
#201), including its independent Performance cap and safe primer-scale policy.
Those integrations have repository regression coverage; native browser/GPU tests
were not rerun after the user stopped computer testing. Do not describe these
captures as measurements of the merged or final rebuilt bundle.

Final repository validation:

- `npm run type-check`, `npm run build`, `npm run validate:production` (83 files)
  and `git diff --check` passed.
- The full unit suite passed: `node --test --test-concurrency=2 tests/*.test.ts`
  (141 test-file groups). Concurrency was limited for the repository-only rerun.
- Six focused test-file groups also passed after the catalog cleanup, covering
  profiles, resolution, loading primers, gel settings, menu state and recorder.
- The saved final native graphics run passed both browser regressions (48.2 s)
  before the stop. Earlier failed harness/candidate runs were corrected; their
  captures are not used in the retained report.
- No new uninstrumented/nested-path browser smoke run was completed for #190.
  The saved graphics tests observe production bundles through test-only exposure.

The authored Level 2 journey still uses production `?debug=1`; #197 owns content
parity. #198's exact assessment GPU/browser and numeric budgets, plus Kevin's
independent normal-play visual/implementation review, remain outstanding. Issue
#190 is not ready for final hardware sign-off or automatic closure.

## Main integration

The conflict resolution merges main `e53d27d` (PR #201). Its pause/movement and
Volt runtime changes remain unchanged. The independent Performance cap now
composes with the bounded profiles; diagnostics record both the saved density
choice and effective cap. A new renderer-policy integration test covers physical
and Balanced gel, cap toggles, 0.75× density and the unchanged absolute budget.

Main's safe primer-scale override is kept and checked alongside the sub-native
physical-texel regression. The legacy graphics browser test now explicitly selects
Standard/full refraction before comparing Normal/Performance, because the app
defaults to Minimum. Playwright discovery lists all four cases in the two graphics
files, but no browser/GPU execution was performed for this merge. Existing raw
captures remain evidence for their original recorded build, not this integration.

Merge verification: all 141 unit test-file groups passed with bounded concurrency,
along with type-checking, the production build and production asset validation
(83 files). The six focused graphics/settings/primer groups also passed.

## Review follow-up: one-pixel transmission targets

The canvas minimum now derives from the effective transmission capture scale,
and the longest-edge bound reserves its short-side cost within the pixel budget.
The resize cache also checks physical dimensions, covering gel or Performance-cap
changes at unchanged CSS size and DPR. Unit regressions cover full/half/quarter
capture, sub-native scaling, extreme aspect ratios, tiny budgets and incompatible
device/pixel limits. The new narrow-host browser regression is described above;
discovery succeeded, but no browser or GPU tests were run for this follow-up.

Repository verification passed: all 144 unit test-file groups (bounded
concurrency), four focused graphics/gel/primer groups, type-checking, production
build, production validation (85 files) and diff checks. Playwright discovered
five graphics cases across the two graphics files; discovery is not execution.
