# Audio

`SoundCatalog.ts` defines effect IDs, public paths, gains, voice limits, loops
and spatial policies. `AudioManager` owns the shared Web Audio context, decoded
buffer cache, master/effects gains and compressor. `GameplayAudio` and cinematic
audio owners subscribe to authoritative events. Audio never decides damage,
movement, puzzle state or progression.

`WorldAudio` observes registered machinery, lasers and other mechanisms;
registrations are removed by their owners. Body contact cues use resolved
`KinematicBody` motion rather than keyboard presses. Shared body recordings are
reused across slimes where appropriate. Keep loop keys stable so repeated state
notifications cannot stack duplicate voices.

## Sources and import

Runtime OGG files live in `public/assets/audio/`. Original packs are grouped
under `assets/audio/`; `assets/audio/manifests/` holds the inventory, archive and
recording hashes, trims, gains and processing notes. Archive member names retain
the supplied spelling. The source files are excluded from production builds.

Reimport a pack from the repository root with its script, for example:

```sh
python3 scripts/audio/import-bob-audio.py
python3 scripts/audio/import-blackout-cutscene-audio.py
python3 scripts/audio/import-ending-audio.py
```

Importers require NumPy and SoundFile/libsndfile. They prepare the existing
recordings and update provenance/inventory files. Reimporting is an authoring
operation; normal builds use the checked-in OGGs. Music preparation is a
separate `scripts/audio/prepare-soundtrack.py` tool; some cinematic suites were
supplied as complete edited recordings. Preserve their bytes and synchronized
timing. [CREDITS.md](../../CREDITS.md) records creators, licences and edits.

## Playback and lifecycle

`BackgroundMusic` streams the music files independently of effect cues.
`CinematicMusic` and `BossMusic` coordinate existing tracks with cutscene and
combat state. Track keys stay stable even when filenames change.

All controls feed the shared gain path. Muting must work for both streamed music
and Web Audio effects. Apply per-cue scaling alongside catalog gain; do not
change timing, gameplay or source processing to adjust a mix.

Owned loops and tails stop on pause/reset, skip, completion, scene handoff and
disposal according to their lifecycle owner. Pending loads must not restart a
cancelled scene. Ending audio follows `BossDefeatTimeline`; its collapse silence
and daylight handoff must stay aligned with the supplied score.

Use the audio unit tests and `tests/browser/integration/GameplayAudio.spec.ts` when changing
routing. Check decoded playback, transitions, muted starts, pause/resume,
retry/skip and teardown in a real browser. Source hashes and automated checks
do not replace a listening review.
