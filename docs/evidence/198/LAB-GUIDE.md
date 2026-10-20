# Assessment-PC handoff — Ubuntu / Google Chrome

You do not need to understand the profiler or install Node/Playwright to collect
the lab evidence. Use the supplied **production ZIP or benchmark URL**, Chrome,
keyboard/mouse and this checklist. Allow 30–45 minutes after a practice pass.
The lab run is pending; proposed limits are not approved performance promises.

## 1. Obtain the package and prepare a results folder

Ask the maintainer for the tested production ZIP/URL, its SHA-256 and the exact
Git SHA. Do not benchmark `npm run dev`, `file://`, an unrelated deployment or
a package whose `build-manifest.json` says `dirty: true`.

If using the ZIP locally, Python 3 can serve it without Node:

```bash
mkdir -p "$HOME/specimen-assessment/group-folder"
unzip /path/to/specimen-production.zip -d "$HOME/specimen-assessment/group-folder"
sha256sum /path/to/specimen-production.zip
python3 -m http.server 4173 --bind 127.0.0.1 --directory "$HOME/specimen-assessment"
```

Use a new empty directory for each package; do not mix two builds. Keep the
terminal/server open. The game address is
`http://127.0.0.1:4173/group-folder/?debug=1&benchmark=1`.
For a supplied URL, append `?debug=1&benchmark=1` instead. Those flags add
diagnostics/staging; all three levels use their ordinary production content.

Create a separate folder `assessment-A-results/`. Copy
[`results-template.json`](results-template.json) into it as `intake.json`.
It already lists **21 capture filenames** (seven scenarios × three passes).
Save every requested export/evidence file in that folder using those names.
Use an anonymous machine label such as assessment-A, not a hostname or serial.

## 2. Record the hardware and conditions

Put the following in `intake.json.machine` and a short `hardware.txt`. These
commands are read-only; unavailable commands can be replaced with Settings or
Chrome's GPU report. Do not guess missing values.

```bash
lsb_release -ds
uname -sr
lscpu
free -h
lspci -nnk | grep -A3 -E 'VGA|3D|Display'
google-chrome --version
powerprofilesctl get   # if installed; otherwise record Settings > Power
```

- Ubuntu/kernel; exact CPU model and core/thread count; installed RAM.
- GPU model, kernel graphics driver, Mesa/proprietary driver version.
- Chrome version. In `chrome://gpu`, save/copy the report and retain **GL_RENDERER,
  ANGLE/backend, driver version, Graphics Feature Status**. Report the actual
  renderer, not a launch flag. SwiftShader/llvmpipe/lavapipe/software results
  cannot qualify the assessment GPU.
- Power: AC/battery, power profile, battery saver; keep it constant. Record
  display resolution, refresh rate, desktop scaling and browser zoom (100%).
  Prefer 60 Hz for reproducibility. Do not force a different GPU/backend.
- From the first recorder export, copy `session.userAgent` and
  `webgl.unmaskedRenderer` exactly into `machine.userAgent/webglRenderer`.
- Copy the first **gameplay** export's viewport fields into `intake.json.graphics`:
  profile/preset, render scale, viewport width/height, drawing-buffer width/height,
  device/effective DPR. Keep the window, zoom and graphics unchanged throughout.
  The export also retains gel, shadow, pixel-budget, antialiasing and lighting
  settings. Save a Settings graphics-diagnostics screenshot.

Do not include usernames, profile paths, network addresses, hostnames or serial
numbers in the report. The reviewer needs the hardware/driver facts, not those
identifiers. Use the same machine/settings/package for before/after comparisons.

## 3. Use an explicit browser-cold / browser-warm protocol

**Browser-cold is not driver-cold.** This procedure resets the game's browser
profile/cache, not the OS file cache or global GPU-driver cache. Do not clear
kernel caches, change drivers or claim a driver-cold result.

First practise in a separate ordinary window. For measured pass 1, launch a
fresh isolated Chrome profile into a blank page:

```bash
SPECIMEN_PROFILE=$(mktemp -d /tmp/specimen-assessment.XXXXXX)
printf '%s\n' "$SPECIMEN_PROFILE"  # keep locally; do not include its path in results
google-chrome --user-data-dir="$SPECIMEN_PROFILE" --new-window about:blank
```

Chromium documents this [profile option](https://www.chromium.org/developers/creating-and-using-profiles/).
If lab policy blocks temporary profiles, ask the maintainer for an agreed cache
procedure; label the result unqualified rather than calling a normal reload cold.

Before navigating to the game, open DevTools (Ctrl+Shift+I), undock it into its
own window, and enable **Preserve log** in Console and Network. Leave **Disable
cache unchecked**, and use **No throttling** for network and CPU. Do not record a
Performance trace or video during a timed capture. Chrome documents these
[Network controls](https://developer.chrome.com/docs/devtools/network/reference).
Keep this setup identical for all passes, with the game window focused during
gameplay. Undocking avoids changing the measured viewport.

Navigate the blank tab to the benchmark URL. Choose **Minimum hardware / Normal
(additional performance cap Off)** explicitly. Keep the default 75% render scale;
do not lower quality to make a run pass. Press Start as soon as ready, then Skip
Opening promptly on every pass. Click the canvas as soon as gameplay is ready.
For each level transition, click Enter Level immediately when it becomes ready.
The export distinguishes request, ready and actual input/draw control times,
so long human delays must be noted, not mistaken for loading work.
The initial startup limit includes the entire navigation-to-control interval;
handoff limits cover request-to-control.

After all seven scenarios on pass 1, reload normally with **Ctrl+R in the same
profile** for pass 2. Do not clear/disable the cache, hard-reload or restart the
browser/server. Repeat for pass 3. Reselect the same graphics settings on each
reload (gameplay graphics are session-owned). Label pass 1 `browser-cold` and
passes 2/3 `browser-warm`; write these actions in `cacheProtocol`.

## 4. The capture recipe (same for every scenario)

Controls: WASD move; mouse look; Space charge/release jump; Tab switch slime;
right mouse aim, left mouse use/fire ability; M mount/dismount a maintenance
drone (Volt), Space/Shift rise/descend while mounted. P opens Pause. In diagnostic
mode number keys stage rooms; 0 completes the current level's normal handoff.

1. Stage/practise the scenario **before** recording. Wait for loading to finish.
   Hide the developer panel with F2 if it is open. The recorder must say
   **benchmark mode · 8192 raw frames**. Click the canvas to capture the pointer.
2. Press **Shift+P** once to start. Perform the scenario for **35 seconds**.
   Keep real actor movement, some camera movement and input throughout; alternate
   short opposing moves near safe positions rather than walking off a ledge.
3. Release movement/buttons, press **Shift+P** to stop, then **Shift+E** to export
   immediately. Do not resize/open Settings or change tabs between stop/export.
4. Rename the downloaded `specimen-performance-...json` to the exact filename
   in `intake.json` (for example `cold-l1-traversal-1.json`). Do not edit raw JSON.
5. If you died, lost focus/pointer lock, paused, changed room/graphics, or saw a
   loading screen during the capture, keep it separately as a failed attempt and
   repeat. Invalid captures cannot be repaired by deleting rows. Do not disable
   hazards or use invulnerability cheats to obtain a score.

The ring is bounded. If a very high-refresh display produces more than 8192
frames, full coverage fails explicitly; use the agreed 60 Hz display mode or
ask the maintainer to adjust the protocol. Do not silently accept truncation.

## 5. Seven consistent scenarios on each pass

Stay inside the specified room during each timed capture. Transitions, deaths
and cutscenes are measured separately. Use the HUD's slime name and objective
to confirm the state; give the reviewer screenshots/functional clips showing
the listed interactions. Make clips on a separate functional pass so encoding
does not compete with measured rendering.

| ID / export filename pattern | Staging and activity during 35 seconds |
| --- | --- |
| `l1-traversal` / `cold-l1-traversal-1.json` | Level 1, press 1 before recording. Bob: short WASD traversal loops near the entry floor, turn the camera, charge/release jumps. Stay in Room 1. |
| `l2-switching` | Enter Level 2 using 0 / Enter Level 2 (this unlocks Goop through the normal completion handler). Stage Room 1. Alternate Bob/Goop with Tab every ~5 seconds; **move both bodies**, turn the camera and use a jump / Goop aim. Switching between distant stationary bodies alone is invalid. |
| `l2-room5-bob` | Press 5 before recording. Bob: traverse the authored safe platform/cover approach while the room's security patrols/beams remain active. Keep inactive Goop safe. Do not trigger the final release cutscene. |
| `l2-room5-goop` | In Room 5, Tab to Goop; use the sewer/cover-side route and aim/fire at an authored soluble target while moving and turning. Keep Bob safe. Preserve all patrol/hazard settings. |
| `l3-electrical` | Enter Level 3 using 0 / Enter Level 3. Press 1, Tab until Volt. Move around the maintenance bay; right-aim at a receiver and left-click/hold to connect/power a device, disconnect/reposition and repeat. Include actor/camera motion, not a stationary beam-only capture. |
| `l3-platform` | Press 2 to stage the transit gauntlet. Follow the HUD: Volt reveals/powers infrastructure, Goop drops retained cover, Bob traverses the cargo lifts/sticky route. Capture movement onto/with a powered moving lift and off it; show real platform travel in the separate functional evidence. |
| `l3-combat` | Stay in Room 2 with its surveillance drones/lasers/projectiles active. Approach from retained cover, dodge and reposition as the security encounter acquires/fires. Preserve the ordinary hazard/readability setup. Show actual encounter activity; an empty corridor is not this scenario. |

For warm passes replace `cold`/`1` in filenames with `warm`/`2` or `warm`/`3`.
Use the [current Blackout route notes](../../levels/blackout.md) for puzzle context,
but prefer current source/HUD if historical prose conflicts. **The live Room 3
shortcut is a safe boss-staging area, not an authored Sentinel benchmark.**
Level 3 combat here deliberately uses the shipped Room 2 surveillance encounter.
If a required interaction cannot be completed, mark it blocked with evidence;
do not substitute stationary footage or declare it passed.

## 6. Restart, recovery and repeated unload checks

For each level, first practise/warm its scenarios. Then, **before its timed
captures**, perform **three** P → Restart cycles, clicking back into the canvas
and waiting at least **5 seconds** after each. Each restart returns to the same
initial viewpoint; stage the required room again afterward. The recorder follows
these operations even while recording is off. It samples renderer counters only
after at least 2 seconds of unchanged counts with active input/focus. A missing
sample means wait longer/repeat, not a zero resource increase.

The first post-warm restart is the resource baseline, not the cold peak. Finish
all scenarios on a page and export the last capture **after** these cycles, so
that export contains the page's full lifecycle history. If you perform extra
late cycles, repeat the last scenario for the full 35 seconds afterward and
select its new export in the intake. Keep the earlier export separately as
unused evidence; don't edit it. Submit exactly seven selected scenario exports
per page, rather than adding a short lifecycle-only capture. Lifecycle evidence
is bounded to 32
events per page; the prescribed three restarts per level stays below that cap.

Outside a timed capture, verify a real hazard death → Retry, pause/resume, slime
switching, an electrical interaction, lift travel and combat. Debug F can also
exercise the recovery path, but label it a staged trigger rather than native
hazard contact. Take proof/notes. The three page passes repeatedly unload the
levels and recreate the page; transitions and restarts must keep working.

Resource counts are not GPU allocation bytes. Unsupported heap/GPU counters are
unavailable, never zero. Late cache growth or GC fluctuations are not alone proof
of a leak; retain all stabilized samples for review.

## 7. Export the evidence and send it back

- Save the package's `.../group-folder/build-manifest.json` with Chrome's Save
  Page As as `build-manifest.json`. Keep the supplied ZIP hash in `hardware.txt`.
- Keep all 21 unmodified JSON captures. Their `qualification` sections contain
  loading/control timestamps, stable restart samples and captured errors;
  `retainedFrames` contains the bounded complete raw sequence.
- In DevTools, save/copy Console errors (or a clean-console screenshot), save
  Network requests as HAR, and include the GPU/graphics report. Use a test server
  with no login; review HAR for unrelated/private URLs before sharing. Do not
  upload a whole Chrome profile. Any unexpected browser/GL/404 error invalidates
  the page run; report it rather than hiding it.
- Add concise functional clips/screenshots and notes for switching, electrical,
  platform, combat, recovery, transitions and restart. List their filenames in
  `attachments`; set per-capture `evidenceFiles` to the relevant listed files.
  Set `actionsVerified: true` only when you actually performed the named scenario.
- Fill machine/graphics/cache fields, behaviour checkboxes and browser error
  counts in `intake.json`. **Leave `targetReview`, `behaviourReview` and budget
  approval pending** for the independent reviewer. Missing facts remain blank
  with an explanation in `notes`.
- Zip **only** this results folder and send its link/file to the team member
  handling issue #198. Include the build SHA, package hash, machine alias, dates,
  blocked scenarios and the exact cache/power/graphics protocol. Don't commit
  large videos/HARs/traces to the repository. The reviewer should retain a shared
  raw-evidence link and SHA-256 hashes in the final report.

The maintainer generates the numerical results (you need no Node on the lab PC):

```bash
node scripts/qualify-performance.mjs /path/to/assessment-A-results/intake.json \
  docs/evidence/198/proposed-budgets.json artifacts/assessment-A-results.json
```

Exit **2 / unqualified** is expected while approvals or required evidence are
pending. Numeric `checks` still show each observed value and proposed limit.
Exit 1 means complete approved evidence exceeded a limit; exit 0 requires all
evidence and approvals plus all approved checks passing. Never turn missing GPU
or memory values into zero to obtain a pass.

For before/after, collect separate folders for each supplied package on the same
machine/protocol. Run the evaluator for each and compare corresponding scenario
repetitions, frame tails, CPU/GPU, simulation loss, loading and stabilized resource
samples. Do not compare just average FPS or cherry-pick the best repetition.
The team reviews the lab evidence and versions/approves budgets **after** these
measurements. Issue #198 remains open until that review and sign-off are complete.
