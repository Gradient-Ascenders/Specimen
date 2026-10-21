# Assessment-machine performance work (#222)

Implementation and verification are in progress. This is a diagnostic evidence
package, not a completed seven-scenario hardware qualification. The acceptance
criteria remain in [the optimisation specification](../../architecture/lab-performance-optimisation.md).

The machine is an Intel Core i3-1220P with integrated Alder Lake graphics and
16 GB class RAM, running Ubuntu 24.04.4, i915/Mesa 25.2.8 and Chrome
156.0.8078.47. Captures use hardware ANGLE OpenGL ES, GPU timer queries,
1920 × 1080 viewport, DPR 1, Minimum hardware / Normal / 75% render scale.
The pixel budget gives a 1280 × 720 drawing buffer. Power mode is balanced.

## Initial implementation measurements

| Measurement | Baseline `74af50d` | Initial candidate `dd27d89` |
| --- | --- | --- |
| Level 1 early-skip navigation to control | 29.1 s | 16.7 s |
| Level 2 request to enabled input | 11.4–11.8 s | 8.65 s |
| Initial Level 2 Room 1 average / 1% low | 55.2–55.4 / 7.7–8.1 FPS | 60.0 / 58.3 FPS |
| Initial Room 1 worst frame interval | 183.4–200 ms | 21.8 ms |
| Discarded active simulation time | 1.62–1.85% | 0% |

The candidate column contains one approximately 34-second interactive Room 1
capture. Two full staged survey passes and part of a third were subsequently captured.
The extended sweep was stopped at the user’s request to reduce checks; one
death/input-contaminated recording is retained and excluded. See results.json
for completed captures. No further browser sweeps were run.
The shader-slot change retains the selected authored-light budgets (lift 2
points/1 spot; ordinary 4/2; maintenance 4/3 including one point shadow).
Zero-radiance filler slots share a 5-point, 1-point-shadow, 3-spot signature.
Later-room GPU timing was sampled. A dedicated frozen-pixel equivalence
comparison was prepared but not run; it remains a review limitation.

The four Level 1 warnings were traced separately on `3d7ca55`. Each was an
explicit idle finale compiler submission, with no new program in a live draw.
The guard now tracks identities, records explicit compiler/primer submissions separately,
and detects unexpected new identities even if disposal masks retained-count
growth. The initial warm boundary is unchanged.

## Reproduce the staged diagnostic

Build clean committed source first. The runner rejects dirty manifests, mismatched
commits and mismatched JavaScript asset hashes. `PROFILE_BUILD_REF` defaults to
`HEAD`; set it explicitly when comparing an older clean build. The report records
both the build SHA and the runner SHA/source checksum.

```bash
PROFILE_EXECUTABLE_PATH=/path/to/chrome \
PROFILE_DIST=path/to/clean/dist PROFILE_BUILD_REF=dd27d89 \
PROFILE_LABEL=lab-repeat PROFILE_WIDTH=1920 PROFILE_HEIGHT=1080 \
PROFILE_HEADLESS=0 PROFILE_RUNS=3 PROFILE_KEY_MS=7000 \
PROFILE_RECORDER=1 PROFILE_ROOM_SET=long \
node scripts/profile-lab-performance.mjs
```

Outputs go to `artifacts/performance-overhaul/<label>/`. `raw.json` contains the
protocol, machine/backend details, startup/transition timing, compiler and frame
samples. Each capture also has a full flight-recorder JSON export and screenshot.
Use `scripts/lib/performance-qualification.mjs` to analyse the exports; failed,
non-rendered, unfocused, death-contaminated or incomplete captures are rejected
and retained with reasons. Do not crop hitches into a passing result.

Additional options:

- `PROFILE_SCOPE=one` or `two` isolates Level 1 or Level 2 entry.
- `PROFILE_GRAPHICS_PROFILE=standard` selects the regression profile through UI.
- `PROFILE_RESTARTS=1` adds four ordinary pause-menu restarts per level.
- `PROFILE_TRACE_NEW_PROGRAMS=1` records actual draw/compiler program sources.
- `PROFILE_OPEN_ROOM5=1 PROFILE_SKIP_ONE_SAMPLES=1` stages the chamber/sewer
  observation poses, with short real body movement and sustained native camera input.

These routes use debug staging and native movement/camera input after staging.
They do not substitute for native door crossings, puzzles, combat, lift travel,
electrical interaction or full-session lifecycle qualification. Module routing
also disables HTTP caching: repeated runs are not browser-cold/warm pairs, and
driver shader-cache temperature is uncontrolled. Browser-cold/warm startup remains unverified; no cache-enabled startup sweep
was run. Diagnostic pose overrides must remain explicit in results.

The original baseline archive contains 79 evidence files. SHA-256:
`1a18e89882ec3a8643d7221c3bf39897e9d3417bf546e7e65a7cde08f08d23d0`.
Durable baseline/candidate links and checksums are recorded below with the
review package. Keep #223–#226 open until their verification
and independent review requirements are satisfied.

## Saved evidence and verification limits

- [Baseline archive](https://github.com/Gradient-Ascenders/Specimen/blob/918e2cb0ab8df3ddb00d0b9fe3ce4c788cecca69/docs/evidence/222/assessment-baseline.tar.gz): immutable original measurements.
- [Candidate archive](https://github.com/Gradient-Ascenders/Specimen/blob/918e2cb0ab8df3ddb00d0b9fe3ce4c788cecca69/docs/evidence/222/candidate-evidence.tar.gz): raw exports, screenshots, failed experiments, logs and executed runners.
- [Checksums and file inventory](https://github.com/Gradient-Ascenders/Specimen/blob/918e2cb0ab8df3ddb00d0b9fe3ce4c788cecca69/docs/evidence/222/evidence-index.json). Candidate SHA-256: `773e549dbdd49bec2a5e9c4acd5b30648ec2efef233af4973ce7befef045561d`.

The final hardware survey has 22 valid captures and one explicitly excluded
recording. Four early-skip starts took 16.46–16.85 seconds from navigation and
15.67–15.88 seconds from Start. Four Level 2 transitions took 8.65–8.70 seconds;
two Level 3 transitions took 10.73 and 11.33 seconds, including arrival.

The full unit suite passed on the measured implementation (1,421 passed, one
existing skip); type checking and production build passed. After the final
primer-attribution adjustment, 18 focused tests and type checking passed. The
final adjustment was not followed by another full suite, build or hardware sweep,
in accordance with the request to reduce checks. The versioned diagnostic runner
was used for the survey and passed JavaScript syntax checking.

Outstanding: final guard verification on hardware, explicit browser-cold/warm
loading pairs, Standard correctness/performance, natural opening comparison,
frozen-pixel equivalence, matched native crossings/combat/electrical/lift routes,
three complete lifecycle repetitions, and independent teammate review. These
remain limitations; neither #226 nor the parent is complete.

## Firefox diagnostic (21 October 2026)

The clean `f09156f9eac9` build was measured in native Firefox 158.0 on the
same machine, using an isolated profile and Minimum / Normal / 75%. The
viewport was 1920 × 1080 and the drawing buffer 1280 × 720. Firefox reported
an Intel renderer; its process opened the Intel render device. GPU timer
queries were unavailable, so these measurements contain no GPU milliseconds.

| Near-spawn movement capture | Average FPS | 1% low FPS | Worst interval |
| --- | --- | --- | --- |
| Level 1 Room 1, Bob | 59.89 | 48.73 | 33 ms |
| Level 2 Room 1, Bob, after arrival | 60.00 | 55.56 | 18 ms |
| Level 3 Room 1, Volt | 59.95 | 52.04 | 29 ms |

Each usable capture lasted approximately 37 seconds, passed the shared raw-frame
analyzer, lost no simulation time and contained no frame over 50 ms. No browser
errors were recorded. The Level 1 shader guard remained at 139 programs with no
growth events. A separate Level 2 entry capture included the vent-arrival
cutscene and was rejected in full; it is excluded from the table.

The original distorted-camera capture is also excluded. The benchmark driver's
uninitialized pointer source emitted a large cursor-origin jump when pointer
lock began. Initializing that source at the viewport centre before locking
corrected the automation. A repeated native keyboard/mouse probe confirmed zero
vertical mouse movement and unchanged camera pitch. No game camera or input code
was changed for that benchmark.

[The machine-readable summary](firefox-summary.json) records the protocol,
capture hashes, rejection reasons and startup caveats. Raw exports, screenshots,
the executed Python/WebDriver harness and camera probes are saved locally under
`artifacts/firefox-benchmark/`; these new raw files have not been published in
the earlier evidence archives. The harness serves instrumented production assets
and disables HTTP caching. Previous probes warmed persistent shader caches, so
the observed 3.55-second Start-to-input result is not a cold-load comparison.
Level 2 input enabled before its arrival cutscene ended.

These are short movement samples around the initial rooms, with debug level
staging. They support smooth Firefox performance at the measured settings but
do not establish later-room, combat, switching, puzzle, Standard-profile or
full-session qualification. There is no matched Firefox baseline or matched-input
comparison with Chrome. No further full test suite was run for this evidence-only
addition.

## Browser input and movie recovery

Subsequent compatibility work clears held actions and pending camera motion when
pointer lock is lost, and releases a late pointer-lock grant if gameplay input
has already been disabled. The optional opening movie now ignores rejected
playback promises from an earlier pause/resume attempt. Both fixes use the same
browser-neutral code in Firefox and Chrome; CI configuration is unchanged.

[Focused compatibility results](browser-compatibility.json) record 26 passing
unit tests, a passing production build including TypeScript checking, and short
native Firefox 158 and Chrome 156 checks for audio, input recovery, tab return,
opening playback and slime switching. Acid firing and electrical beam rendering
were also exercised in both browsers. Chrome passed a Standard-profile draw and
restart check. The additional Firefox probe stopped when a graphics preparation
overlay intercepted the settings Back click; Standard and restart are not
claimed as passing in Firefox. Testing then stopped at the user's request.

Physical Escape and speaker output remain manual checks. Browser-scoped pointer
release, decoded audio, scheduled Web Audio voices and media playback were
observed. These checks used a local build containing the uncommitted fixes at the
time of measurement, and do not qualify a complete puzzle/combat playthrough.
