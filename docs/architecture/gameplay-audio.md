# Gameplay sound effects

Specimen ships 66 OGG effects: Bob 7, Goop 5, Volt 5, world interactions 6, environment 6, turrets 1, interaction polish 10, intro 14, Containment escape 9, Cultivation sentries 3. All have current gameplay mappings. All three former procedural character packs have been replaced with requester-selected ElevenLabs recordings and shared body cues. No new gameplay mechanics, fire rates, damage rules or puzzle timings are introduced.

## Architecture

`src/audio/SoundCatalog.ts` registers every asset. `AudioManager` owns one application Web Audio context, cached decoded buffers, an effects gain, compressor and master gain. `GameplayAudio` owns each level's event subscriptions, body motion feedback, world loops and reset suppression. Typed `gameplayAudioEvents` notifications are presentation-only; gameplay never reads audio state. `WorldAudio` reads registered mechanism progress and enabled laser geometry inside the current render scene, with no per-frame scene traversal. It never advances mechanisms. Registrations are removed by their owners on disposal. Each current runtime receives the same manager from `main.ts`. Standalone gameplay fixtures need no browser audio context.

Movement uses authoritative KinematicBody events and resolved grounded velocity, not keyboard detection. Bob, Goop and Volt have quiet contact one-shots every 1.25 m of grounded tangent locomotion, using `locomotionPosition` to exclude carrier transport and teleports. There are no continuous character movement or idle loops. Bob has no charging or wall loop. Motion accents are suppressed while charging, airborne, stationary or landing; their accumulated distance clears on interactions, switch, pause and reset. Goop and Volt reuse Bob's normal jump, soft/hard landings, obstacle contact, rupture and retry; Bob's charged jump and adhesion cues remain specific to Bob. Pressure plate contact with Goop also uses the shared body-contact clip. Acid shots, collisions, burns, electrical connections, receiver charge thresholds, powered devices and turret projectiles publish notifications only after their gameplay conditions succeed. Loop keys identify the nearest acid basin, world mechanism, laser, dissolve target or established tether. Character switching clears body travel accumulation; existing corrosion and an inactive Volt tether retain ownership. Acid projectiles have no flight sounds; neither acid nor electricity has aim-entry/exit sounds. Volt has one quiet sustained-power loop per established tether. Receiver charging uses that same tether sound without layering another loop. A receiver crossing its charge threshold plays one completion cue, replacing the previous stack of completion/device cues. Ordinary powered-device transitions reuse the completion clip at 45% (lights) or 60% (other devices) playback scale. Electrical world collisions have no separate impact clip. An accepted burn starts the dissolution loop directly, without a separate start cue; repeated hits do not restart it. Plain world impacts use only the impact clip.

## Assets and provenance

`public/assets/audio/{bob,goop,volt,world,environment,turrets,polish,intro,escape,cultivation}/` contains only runtime OGG files. Source archives are not shipped in production. The separately supplied turret WAV was transcoded once to OGG Vorbis.

The requester generated Bob's replacement recordings in ElevenLabs and selected them through listening review. The seven originals (six stereo PCM16 WAVs and one stereo Vorbis file, all 48 kHz) are preserved byte-for-byte in `assets/audio/bob/bob-sounds.tar`. `scripts/import-bob-audio.py` prepares the runtime files using NumPy and SoundFile/libsndfile: average stereo to mono, remove DC offset, balance levels without compression, cap peaks with headroom, apply 2 ms edge fades, and encode Vorbis. The powerful jump starts at source 0.58 s and hard landing at 0.30 s to remove separate preparation sounds before their main hit; soft landing starts at 0.065 s to remove its leading delay. Other clips retain their full timeline. `docs/assets/bob-audio-import.json` records source/archive hashes, trims, gains and resulting RMS. Reimport with `python3 scripts/import-bob-audio.py` after installing NumPy and SoundFile; Python is not a game dependency.

Goop's five original stereo PCM16 48 kHz WAVs are preserved byte-for-byte in `assets/audio/goop/goop-sounds.tar`. `scripts/import-goop-audio.py` averages stereo to mono, removes DC offset and balances levels with peak headroom. The impact starts at source 0.02 s. One-shots have 2 ms edge fades. The dissolution loop uses an 80 ms circular overlap; the pool loop trims 80 ms from each end then uses a 120 ms circular overlap to avoid a silent seam. `docs/assets/goop-audio-import.json` records hashes, trims, overlaps, gains and decoded RMS. Reimport with `python3 scripts/import-goop-audio.py` (NumPy/SoundFile required). The original filename `active-dissoloution.wav` is preserved in the source archive.

Volt's five original stereo PCM16 48 kHz WAVs are preserved byte-for-byte in `assets/audio/volt/volt-sounds.tar`. `scripts/import-volt-audio.py` performs mono averaging, DC removal, level balancing, 2 ms one-shot edge fades and Vorbis encoding. Only quiet tails are trimmed: discharge 0.15 s, connection 0.20 s and completion 0.30 s. The sustained-power clip uses a 100 ms circular overlap. `docs/assets/volt-audio-import.json` records hashes, trims, overlaps, gains and decoded RMS. Reimport with `python3 scripts/import-volt-audio.py` (NumPy/SoundFile required).

The four requester-generated world recordings are preserved unchanged in `assets/audio/world/world-interaction-sounds.tar`. `scripts/import-world-audio.py` makes six mono Vorbis assets without synthesising new sounds: door travel from source 0–0.88 s (80 ms circular overlap), door settling from 0.90–2.00 s, machinery and laser loops with 120 ms circular overlaps, and separate press (0.16–0.43 s) / release (0.53–0.85 s) edits from the two-click activation recording. Loops are balanced to 0.035 RMS before encoding; one-shots target 0.065 RMS, with peak headroom and 2 ms edge fades. `docs/assets/world-audio-import.json` records hashes, edits, gains and decoded RMS. Reimport with `python3 scripts/import-world-audio.py` (NumPy/SoundFile required).

The five environment WAVs are preserved unchanged in `assets/audio/environment/environment-sounds.tar`. `scripts/import-environment-audio.py` prepares five mono effects plus one edit of the original Goop recordings. Falling motion uses source 0–0.80 s; heavy landing retains 0–0.80 s and targets 0.10 RMS. Drone and hover loops use 120/160 ms circular overlaps, balanced to 0.045/0.035 RMS. The sign recording contains a series of clicks, so only the first isolated click (0.043–0.085 s) is retained. Drone destruction joins 0–0.55 s of `active-dissoloution.wav` to 0–0.80 s of `dissolution-completed.wav` with a 40 ms crossfade; it adds no new recording. All edits remove DC offset, use gain with peak headroom, and apply 2 ms one-shot edge fades. `docs/assets/environment-audio-import.json` records source hashes, edits and levels. Reimport with `python3 scripts/import-environment-audio.py` (NumPy/SoundFile required). The world importer preserves this separate environment inventory.

All in-game sound effects were generated with ElevenLabs Sound Effects, including the turret shot supplied separately by the requester. Separate licence documentation has not been supplied. `CREDITS.md` records provenance and feeds the existing in-game credits screen.

`docs/assets/gameplay-audio-inventory.json` records all 66 decoded durations, sample rates, channel counts and peaks. All runtime assets are mono 48 kHz. Every file was fully decoded using libsndfile, and browser validation checks Web Audio decoding separately. Paths use Vite's relative `BASE_URL` (`./`) and remain beneath a nested deployment directory.

## Mix and volume

Master volume defaults to 100%; sound-effects volume defaults to 80%. Both have independent sliders in Settings, are clamped to 0–100%, and persist for the current application session across level changes/restarts. Either can mute all effects. Acid pools use 0.13 gain and active dissolution 0.36; dissolution completion uses 0.65. Their distance profile keeps full level through 5 m and uses 0.9 rolloff so corrosion remains audible across a room. Volt's sustained power is deliberately quieter at 0.055 gain with its source balanced to 0.035 RMS before encoding, following the request to reduce its noisy character. Electrical discharge, connection and full completion use 0.5 gain; disconnect uses 0.38. Quieter device activation uses the per-cue scales above. Acid one-shots use 0.5 and turrets 0.65. A compressor at -12 dB/4:1 protects overlapping effects.

Shared body sample base gains are contact 0.4, normal jump 0.5, charged jump 0.6, soft landing 0.4, hard landing/death 0.55 and peel 0.42. Contact uses 35% of its base for ground movement, 25% on walls, 55% for corner regrips, 80% for obstacle contact/retry and 100% for initial attachment. Peel uses 65% of its base so wall-jump release does not overwhelm the launch. These playback scales never modify the shared sample or later cues. The archive has no dedicated attachment clip, so soft body contact supplies attachment/regrip feedback. Heavy floor landings already emit their sound before the automatic rebound; that rebound does not add another impact. Bouncy-surface impulses use the same hard-landing source once.

Environment landing gain is 4.8 (deliberately heavier than body landings), falling motion 3.8, drone flight 0.24, platform hover 0.22, sign tick 0.46 and drone dissolution 0.85. Falling/landing effects retain full level through 8 m with 0.7 rolloff, and are culled beyond 32/40 m respectively for gameplay drops. Monitor clicks retain full level through 4 m with 1.0 rolloff; their existing 14 m proximity gate remains. Drone dissolution shares the corrosion distance profile. Flight has at most two nearby voices within 20 m; hover engines share one nearby voice within 16 m. Nearest-source changes move these continuing voices without restarting their buffers. Lift drones follow powered engine flames, the maintenance drone follows its authoritative powered state (including startup and parked hover), and the sewer drone follows reboot/active state until destroyed. Room 5 patrols remain audibly hovering when their network disables weapons/motion; mounted ceiling sentries have no flight loop. Stationary platform booster engines use the nearest actual jet, with room transforms applied. Rail-driven platforms retain the existing machinery sound.

Falling platforms, blocks and walls in the authored Cultivation rooms sound once on release and once at landing. The reusable drop assembly also follows actual falling/landing transitions; rope catches reuse the landing at 55% scale when the rope becomes taut. Resets and checkpoint restores produce no falling/impact cues. All four Containment observation monitors share `TypewriterAudio`: a 42 ms click only when new non-whitespace text becomes visible, throttled to one per 120 ms (normally every other 90 ms letter), positional within 14 m. Later rooms retain their proximity activation gates. Goop’s Room 5 speech uses the same no-backlog logic with the shared slime-contact recording at 35% playback scale and a 320 ms minimum interval. Its source is at Goop inside the cell, not the balloon above him, and hidden, out-of-range or released speech cannot emit new blips. Holds, clearing and resets are silent; frame catch-up produces at most one accent per update. Existing sound-effects/master settings, pause/death gating and voice limits apply to both, with no new loops or assets.

Lift-drone burn completion and the sewer drone’s final (third) accepted burn replace the ordinary completion with the Goop-derived destruction edit; stopping the active burn loop happens first. Earlier sewer hits use normal dissolution. This avoids duplicate completion sounds and leaves support-rope dissolution unchanged.

Cultivation Rooms 1 and 2 reuse the same positional terminal ticks and proximity
gates. Goop's Cultivation conversations, including the stopped-elevator exchange
about Volt on the way into Room 5, use the same throttled speech blips,
but follow his current world position (18m range). No elapsed loading time,
camera motion, section hold or reset produces a voice cue. Completed speech
survives checkpoint recovery; a full level restart clears it. Room 1's platform
impact adds one positional wet-impact accent from the existing Goop projectile
sample at 100% scale and 28m range, alongside the normal platform landing sound.
No additional recordings, loops or downloads are needed; pause/death and room
visibility gating remain in the shared gameplay lifecycle.

World door travel uses 1.2 gain and settling 2.0; platform/lift/bridge machinery 1.92; laser hum 2.2; physical press 0.45 and release 0.27. At most two nearby door/machinery loops and one nearby active laser loop play at once. Door motors are audible within 22 m and machinery within 24 m, with full level through 5 m and 0.8 rolloff. Laser distance uses the nearest point on its actual beam segment, including room transforms, within 16 m, with full level through 4 m and 0.8 rolloff. World loops smoothly fade over the final quarter of their audible range; the same edge fade applies to door settling. Distance-gain changes smooth over 25 ms on the continuing voice and preserve their level through pause, delayed decode and voice-capacity waits. Hidden/inactive rooms and disabled or circuit-gated beams are silent. All hazard laser variants register automatically through `LaserHazard`: static, timed/sweeping, circuit-controlled and Sentinel sweep/rotating attacks. They share one continuing positional hum; selecting a different nearest beam moves that voice without restarting its buffer. Inactive boss telegraphs/recovery and disabled beams stay silent. Loop selection follows distance and updates source positions. Controls are culled beyond 16 m from the controlled body.

Door travel follows actual progress changes, including reversals; issuing an unchanged open request does not create sound. Endpoint arrival plays the settling edit once; blocked doors stop their motor without a false arrival. Held, unpowered or obstructed platforms have no movement sound. The shared MovingPlatform covers the Containment elevator and parkour platforms and Blackout powered carriers. Rotating bridges, the transit deployable bridge and Cultivation's scrolling-shaft descent register their own authoritative progress. Press/release sounds follow actual pressure-plate, wall-button and transit bridge-switch changes; resets/disabled controls stay silent. Goop plate contact can also retain its existing body-contact cue.

Repeated movement/jump/landing/body cues vary playback rate by up to 4%. Sources use inverse distance attenuation from the controlled body with equal-power panning. Small body, projectile, ambient and electrical effects retain reference 3 m / rolloff 1.5; the per-effect world profiles above give large mechanisms and impacts more reach without increasing every sound. These profiles are defined with the gains in `SoundCatalog.ts`. Listener position stays on the controlled body so zoom and camera obstruction do not change hearing distance, while forward/up follow the actual camera world orientation, including wall-climbing roll. Every level refreshes it after camera interpolation as well as during fixed updates, so existing voices pan when the player only looks around. Modern listener AudioParams and the legacy orientation setter are supported. All sounds are mono.

Voices are bounded at 24 globally and three per one-shot effect. Each standard loop has one voice and corrosion up to three. Authored acid pools in Containment, Cultivation and Blackout share one environmental voice: it plays within 18 m of the nearest surface point, follows the controlled body across wide basins, and stops outside that range. The clip does not create persistent projectile puddles or imply that ordinary impacts corrode surfaces. Additional world loops wait quietly for capacity. Per-effect one-shots are throttled to 35 ms; extreme rapid overlapping turret shots may be dropped by this mix limiter without changing projectile spawning. Loops fade in over 40 ms; stops are immediate to respect charge cancellation/destruction.

## Interaction polish pack

The seven requester-generated ElevenLabs stereo WAVs remain unchanged in
`polish-sounds-01.tar`. Run `python3 scripts/import-polish-audio.py` with
NumPy/SoundFile to create ten mono 48 kHz Vorbis clips in
`public/assets/audio/polish/`. `docs/assets/polish-audio-import.json` records
archive/source hashes, pair splits, gains, loop overlap and decoded levels.
The importer splits the actual waveforms, removes DC, balances levels with peak
headroom and applies 2 ms one-shot fades. The alarm gets a 20 ms circular overlap;
its runtime loop is 4.98 seconds. Source archives never ship with the game.

| Clip | Live mapping |
| --- | --- |
| `world-button-press-01` / `world-button-release-01` | Real wall-button and transit bridge-button state changes; both finale release-button presses. Pressure plates keep their existing heavier accents. |
| `world-lever-lock-01` | One mechanical clunk when Volt latches the transit bridge. There is no standalone lever mechanic; restoring an already-locked bridge is silent. |
| `world-lift-start-01` / `world-lift-stop-01` | Vertical MovingPlatform travel and the Cultivation scrolling lift. Startup follows actual motion; braking follows arrival or a physical hold. Restoration is silent. |
| `world-laser-on-01` / `world-laser-off-01` | Nearby actual beam power changes, including timed/circuit/boss beams. Range entry, visibility changes, nearest-source selection and reset do not make switching cues. |
| `world-vent-break-01` | Cultivation's metal cover breaking loose and its later duct-floor break; Blackout's entry-duct collapse. Containment's wooden acid-dissolved cover keeps its existing material cues. |
| `world-containment-alarm-loop-01` | Containment drone reveal/combat and reinforcement escape, ending before the quiet exchange/blackout; Cultivation cell opening through escape to the vent. Background level is lowered after Containment reveals and during Cultivation dialogue. |
| `ui-confirm-01` | Enabled menu-button confirmation by mouse, keyboard or controller, and nested-menu back actions. No sounds on automatic focus restoration. |

Polish base gains are button press/release 0.9/0.65, bridge lock 1.1,
lift start/stop 1.0/1.2, laser on/off 0.85/0.7, vent break 1.1, alarm 0.9
and menu confirmation 0.35. Mechanisms/vents use the existing mechanism distance
profile; laser switching uses the beam profile. Alarms and UI are nonpositional.
Alarms are keyed loops, stopped by skip/reset/unload and suspended with pause.

Menu confirmation uses the same cached audio context, compressor and effects/master
controls. A gameplay gain bus mutes world voices while a menu click temporarily
resumes the context; it suspends again when the click ends if gameplay is still
paused. Focus muting still applies. No gameplay listener, mechanism, puzzle
timing, damage or checkpoint state depends on any sound.

## Intro cutscene effects

The twelve supplied stereo WAVs remain unchanged in `intro-cutscene-sounds.tar`.
`python3 scripts/import-intro-audio.py` (NumPy/SoundFile) creates fourteen mono
48 kHz OGG effects in `public/assets/audio/intro/`. The manifest at
`docs/assets/intro-audio-import.json` records source/archive hashes, gains and
decoded levels. Import uses DC removal, peak headroom and 2 ms one-shot fades.
Camera recordings come from the separate `intro-camera-sounds.tar`. Its three
variants play in order 01, 02, 03, 01 across the corridor; the fourth cue is
slightly quieter. The first variant has 80 ms of leading quiet trimmed. The
original camera recording remains preserved in the initial archive. Both
archives and each clip's source archive are recorded in the import manifest.
The cracking clip loses 80 ms of leading silence and ambience uses an 80 ms
circular overlap. No music is added.

`OpeningAudio` follows the existing 54-second `OpeningGameTimeline` in both the
default live player and explicit MP4 backup. The media file remains muted;
the backup cues follow its actual `currentTime`, not loading or wall-clock time.
Camera servos accompany the corridor pass. Door cues follow opening/closing at
24.8/31 seconds. Rocking builds from 33.2 seconds; cracks play at 35.2, 37 and
38.7 seconds. The seal releases just before the 40.7-second lid lift; falling
starts at 44.2 seconds, shell impact at 44.8, gel spread at 45.05 and reforming
at 46.75. Ambience fades in with the corridor reveal, softens for the hatching
and fades out at the end. These are nonpositional cinematic cues sharing the
existing effects/master sliders and focus muting.

Sounds start only with visible playback, not shader preparation. Hidden tabs
and video buffering suspend intro playback; repeated frames do not replay cues.
Large seeks discard skipped one-shots. Skip/end/disposal stop only the intro's
own loop and samples, preserving gameplay/menu audio during the handoff.

## Containment escape effects and developer preview

`escape-cutscene.tar` retains the nine supplied WAVs. Run
`python3 scripts/import-escape-audio.py` with NumPy/SoundFile to create mono
48 kHz OGG clips in `public/assets/audio/escape/`. Source/archive hashes,
gains, trims and decoded levels are recorded in
`docs/assets/escape-audio-import.json`. Only the strain motor loops, using
an 80 ms circular overlap. The result notification loses its silent tail.

The existing movie clock drives power-down, cell opening, both scans and
results, the termination warning, drone destruction and both shaft drops.
The strain motor replaces normal flight while Bob is aboard. Projectile
impact sounds play at authored surface hits, not open-air endpoints or the
final duct near miss. Bob and Goop reuse the gameplay squishy contact sound
every 1.25 metres of grounded travel, with slight pitch variation; waiting,
charging, airborne movement and drone transport do not trigger steps.
Movement cues follow the fixed movie clock, not camera/render updates.
Existing button, gunfire and alarm sounds remain in use. The wooden vent uses the normal Goop dissolution loop and
completion cue; no wooden-breaking or metal-vent sound is substituted.
Skip/completion release the escape clips and its flight, alarm and dissolve
loops. Pause follows the existing shared audio lifecycle.

In `npm run dev`, the title menu offers **Select cutscene**, styled like the
level selector, with **Bob's awakening** (intro) and **Goop's escape** (Containment)
entries. Each starts directly without playing through a level. Back or Escape
returns from the selector to the title menu.
The escape entry prepares the normal Level 1 assets and starts the real Room 5 ending
without playing the intro or solving the level. Alternatively open
`/?cutscene=escape` and click **Start trial**. The existing **9** shortcut
starts the same ending from anywhere in running Level 1. These preview
entry points are development-only; `?debug=1` does not enable them in a
production build. Normal pause, skip and level handoff still apply.

## Cultivation Room 3 sentry cutscene

`cultivation-sentry-sounds.tar` retains the three supplied WAVs. Run
`python3 scripts/import-cultivation-sentry-audio.py` with NumPy/SoundFile
to produce mono 48 kHz OGG one-shots in `public/assets/audio/cultivation/`.
The importer preserves each recording's duration, balances gain with peak
headroom, and applies 2 ms fades. Source hashes and levels are recorded in
`docs/assets/cultivation-sentry-audio-import.json`.

Each real cinematic push sounds the shove, followed 120 ms later by the
topple. Each sentry's authoritative acid disable triggers its splash once,
then a keyed instance of the existing Goop dissolve loop for 2.2 seconds.
Completion, reset and disposal stop those loops; normal pause suspends audio
and the movie clock together. Descent jumps/landings retain their existing
effects. No sentry, collision, descent or puzzle timings are changed.

In development, **Select cutscene → Sentries into the acid** prepares the
normal Cultivation runtime, establishes Bob's real support on the Room 3
upper island, then starts the existing descent and four-sentry sequence
automatically. No level playthrough or extra Enter Level click is needed.
The runtime entry remains unavailable in production, including `?debug=1`.

## Lifecycle

- Boot preloads/decode-caches the 12 Bob/Goop, twelve world/environment clips, ten polish effects, fourteen intro effects, nine escape effects and the shared turret recording needed by the Containment finale (58 total) while playback stays suspended. The Cultivation bank adds three sentry effects and Volt's connection and ready accents for his live escape (63 total); he already has the shared body samples. Blackout adds the three remaining electrical clips (66 total). These requests begin ahead of module/visual preparation, without gating boot or transitions on optional audio. Cues arriving before a buffer is ready are dropped, never replayed late. Repeated/overlapping requests share per-sound promises and one context, with at most four fetch/decode jobs active. Unlock only requests the initial bank, never the later banks. Individual failures remain optional and are exposed in diagnostics. Disposal aborts fetches, cancels queued jobs and ignores late decodes. Trusted pointer/key gestures unlock playback; unsupported audio leaves gameplay operational.

Cultivation's Volt-release finale uses the supplied alarm loop and schedules button, body
launch/landing accents, positional gunfire, acid impacts and drone destruction at
fixed story events. A single positional flight source follows the hijacked craft;
ordinary encounter sources are suppressed. Goop's typed “Now we're even” originates
at the high escape vent beside Volt's cell; Volt's “Get on” has a positional response accent.
Goop's "Follow me, I know the way out" uses the same positional blips after the
entrance landing. Existing metal/body cues cover the shoulder strike, duct
shudder and floor failure; shaking/failure sounds originate at the breaking panel.
The alarm follows the movie clock from cell opening until the vent camera, softens under dialogue and stops on skip/reset/completion. Existing room lights retain their authored 2.4-second pulse.
These events stop advancing with pause, and skipped shots are not replayed in bulk.
- Pause/menus suspend the context and clear body travel accumulation. World loops preserve their offsets and resume once. Browser blur/visibility adds an independent suspension gate. Fixed-step state resumes body contact sampling and re-evaluates nearby basins, motors and active beams. Mechanism progress snapshots prevent resume from replaying an arrival.
- Death stops existing voices, plays the shared rupture cue for Bob/Goop/Volt when applicable, and rejects further world sounds until successful recovery. Retry sounds the restored active identity.
- Restart/checkpoint/puzzle reset clears voices and suppresses restoration notifications until the next gameplay update. Burn completion/reset/disposal stop corrosion ownership. Basin and world-interaction ambience is re-evaluated from the controlled position on the next enabled gameplay update. Mechanism restores update their presentation baseline so teleports do not sound like motion or arrival.
- Unload/transition removes level subscriptions and all sources. Shutdown removes browser handlers, disconnects audio graph resources and closes the context. Blackout's terminal completion explicitly clears and suspends audio; its session retains the completed scene. Merging clears original-character travel and the merged Specimen owns listener position without borrowing a slime's movement sounds.

## Background music

Four team-approved OGG tracks are stored in `public/assets/audio/music/` and
credited in `CREDITS.md`. `BackgroundMusic` streams them with at most two
HTMLAudioElements rather than decoding them into the sound-effects buffer bank.
It uses no per-frame update work and does not change the 58/63/66 sound-effects
bank counts. Music follows the existing menu, pause, opening, transition, level
and completion state, and uses the master volume without the effects slider.

The title track attempts to play as soon as the title is shown. Browsers can
reject audible autoplay with `NotAllowedError` until a trusted user gesture;
the main menu then exposes an explicit **Enable music** button. Existing global
key/pointer listeners retry playback without restarting the currently selected
song. This is a browser permission boundary, not a soundtrack load failure.

## Complete mapping

All names below identify `.ogg` files. Loop behavior is explicit; other sounds are one-shots.

| Asset | Gameplay mapping / reason unavailable |
| --- | --- |
| `bob-contact-01` | Bob/Goop/Volt quiet grounded motion, obstacle contact and retry; Goop plate contact; Bob attachment and regrip. Goop’s Room 5 pleas reuse it at 35% playback scale for soft speech blips, at most once per 0.32 s while new text is visible. Gains vary by context; no idle/charge playback. |
| `bob-charged-jump-01` | Accepted Bob launch with charge fraction at least 0.8. |
| `bob-detach-01` | Intentional surface release, loss of sticky support or sticky-wall-to-floor handoff. |
| `bob-fall-01` | Accepted Bob/Goop/Volt death sequence, including hazard/out-of-bounds failure. |
| `bob-jump-01` | Bob launch with charge fraction below 0.8; every accepted Goop/Volt launch. |
| `bob-land-hard-01` | Bob/Goop/Volt stable landing at least 8 m/s, or a Bob bouncy-surface impulse. A hard landing's passive reaction hop does not duplicate its impact. |
| `bob-land-soft-01` | Bob/Goop/Volt stable airborne-to-ground landing below 8 m/s. |
| `goop-acid-puddle-loop-01` | Nearby authored acid pools in all three levels; one positional looping voice within 18 m of the nearest surface. No projectile puddle mechanic. |
| `goop-dissolve-complete-01` | Burn reaches authoritative completion. |
| `goop-dissolve-loop-01` | Active burn keyed by target ID; survives switching; stops on complete/reset/dispose. |
| `goop-projectile-impact-01` | Real soluble or world collision, including blocked launch. |
| `goop-shoot-01` | Accepted AcidProjectileSystem projectile activation, after cooldown/pool checks. |
| `volt-charge-ready-01` | Receiver crosses its full-charge threshold once per charge cycle; also quieter ordinary device power-on transitions. |
| `volt-circuit-connect-01` | Accepted Volt tether acquisition. |
| `volt-circuit-hold-loop-01` | One quiet loop for an established power tether, including receiver charging; remains audible when another slime is selected. No additional charge loop. |
| `volt-circuit-release-01` | Existing tether breaks during gameplay; reset/death/merge/completion/unload are silent. |
| `volt-shoot-01` | Electrical search beam actually enters its emitting state, once per beam start. |
| `world-door-movement-loop-01` | Hinge doors, proximity shutters and blast doors while progress actually changes; stops while blocked and at endpoints. |
| `world-door-stop-01` | Actual door endpoint arrival, once; no cue on restore/reset. |
| `world-machinery-loop-01` | Actual nearby platform, lift and bridge travel, including the Cultivation scrolling-shaft elevator. |
| `world-laser-loop-01` | Nearest nearby enabled laser segment; disabled/circuit-gated beams are silent. |
| `world-activation-01` | Accepted pressure-plate, wall-button or transit bridge-switch press. |
| `world-release-01` | Physical control release during gameplay; no reset/disable playback. |
| `world-platform-fall-01` | Actual start of falling platforms, blocks, walls and suspended drop/catch assemblies. |
| `world-platform-land-01` | Actual ground arrival; a quieter reuse for the rope catching its platform. |
| `world-drone-flight-loop-01` | Nearby powered lift drones, flying patrols, rebooted sewer drone and Volt’s maintenance drone; at most two voices. |
| `world-platform-hover-loop-01` | Nearest stationary Room 5 platform booster engine; one voice. |
| `world-sign-tick-01` | Newly revealed characters on the Room 1, 2, 3 and 5 observation monitors; at most once per 0.12 s, within 14 m of the screen. Proximity-triggered screens remain silent until activated. |
| `world-drone-dissolve-01` | Goop-derived edit replacing normal completion for destroyed lift drones and the third sewer-drone burn. |
| `specimen-turret-shot` | DroneProjectileSystem accepts a real spawn; common seam for fixed, ground, ceiling, lift and transit turrets. |

## Validation

`npm run type-check`, `npm test`, `npm run build`, `npm run validate:production`,
`npm run test:smoke`, `npm run test:integration`, and relevant
`npm run test:browser` checks cover this change. The dedicated audio integration
test exposes the existing runtime for observation without replacing game/audio
logic; the production smoke tests run without runtime injection.

Browser checks can verify decoding, resources and gameplay synchronization, but do not establish a human listening review on speakers/headphones. Cross-browser and subjective final mix review remain useful before release. See the PR for actual executed results.
