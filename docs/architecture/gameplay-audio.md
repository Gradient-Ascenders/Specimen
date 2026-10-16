# Gameplay audio

Specimen ships the original 54 OGG effects (Bob 16, Goop 18, Volt 19, turrets 1),
plus seven original Containment preview assets. Of the original effects, 51 have
current gameplay mappings; three are reserved for absent mechanics. No new
gameplay mechanics, fire rates, damage rules or puzzle timings are introduced.

## Containment listening preview

Start a new game to hear the preview in Rooms 1–3 (climb, jump, lasers). A
64-second stereo synth score combines slowly changing D-minor/add9, Bbmaj7,
Fadd9 and Csus2 pads with a sparse bell motif and muted bass pulses. A separate
16-second stereo air bed supplies ventilation; a 12-second mono machine loop is
positioned at the starting containment apparatus and fades out on entering
Room 2. Checkpoint changes sound a short confirmation, Room 3 lasers sound on
real enabled-state changes, and accepted character changes sound a quiet click.
Rooms 4–5 and later levels do not inherit the preview score or ambience.

`ContainmentSoundscape` reads authoritative room, checkpoint, identity and laser
state after the gameplay audio update. Retry/restart/debug restoration seeds
those values silently. Sources fade in over 1–2 seconds; leaving the preview
fades music over 1.5 seconds and ambience over 0.8 seconds. Repeated updates do
not extend an outgoing fade. Pause and lost focus freeze the same shared audio
context; recovery clears effects while preserving the score's source and offset.
Unload/disposal stops everything, including any outgoing fades.

Music has its own Settings slider (55% default); Master affects both channels,
and Sound Effects controls character/world cues and ambience. These are session
settings. To audition the score alone, set Sound Effects to 0%; to hear the
environment without music, set Music to 0% and stand still as Bob.

`scripts/generate-containment-audio.py` renders all seven assets using NumPy and
SoundFile/libsndfile with fixed seed 1847. It uses no imported samples or remote
generation service. Note releases and reflections wrap across the musical loop
boundary. Only generated OGG files ship; Python is not a runtime dependency.
`docs/assets/containment-audio-inventory.json` records decoded durations, peaks,
RMS, channels, boundary steps and compressed sizes. The seven files add about
377 KB on disk and roughly 33 MB of decoded PCM at a 48 kHz browser sample rate.
This is a listening prototype, not a completed soundtrack or a replacement of
the original character sound packs.

## Architecture

`src/audio/SoundCatalog.ts` registers every asset. `AudioManager` owns one application Web Audio context, cached decoded buffers, independent effects/music gains, a shared compressor and master gain. `GameplayAudio` owns each level's event subscriptions, character loops and reset suppression. Typed `gameplayAudioEvents` notifications are presentation-only; gameplay never reads audio state. Each current runtime receives the same manager from `main.ts`. Standalone gameplay fixtures need no browser audio context.

Movement uses authoritative KinematicBody events and resolved grounded velocity, not keyboard detection. Acid shots, collisions, burns, electrical connections, receiver charge thresholds, powered devices and turret projectiles publish notifications only after their gameplay conditions succeed. Loop keys identify the character channel, acid projectile, dissolve target, charge receiver or established tether. Character switching clears only character loops; existing corrosion, projectiles and an inactive Volt tether retain ownership.

## Assets and provenance

`public/assets/audio/{bob,goop,volt,turrets}/` contains only runtime OGG files (630,222 bytes total). The three nested character ZIPs contain WAV review copies, OGG previews, manifests and readmes; these are not duplicated in production. The separately supplied turret WAV was transcoded once to OGG Vorbis.

The supplied character-pack manifests/review notes describe original procedural synthesis using oscillators, filtered noise and envelopes, with ChatGPT assistance and no imported audio samples. No separate licence declaration was supplied. The turret was provided separately by the requester; its original creator, synthesis tool and separate licence are not specified. `CREDITS.md` records these distinctions and feeds the existing in-game credits screen.

`docs/assets/gameplay-audio-inventory.json` records all 54 decoded durations, sample rates, channel counts and peaks. Character assets are mono 48 kHz; the turret is mono 48 kHz. Every file was fully decoded using libsndfile, and browser validation checks Web Audio decoding separately. Paths use Vite's relative `BASE_URL` (`./`) and remain beneath a nested deployment directory.

## Mix and volume

Master volume defaults to 100%; sound-effects volume defaults to 80%. Both have independent sliders in Settings, are clamped to 0–100%, and persist for the current application session across level changes/restarts. Either can mute all effects. Loops default to 0.13 gain; idle loops 0.045; projectile flight 0.075; one-shots generally 0.5; small grip/squish cues 0.22; turrets 0.65. A compressor at -12 dB/4:1 protects overlapping effects.

Repeated movement/jump/landing/body cues vary playback rate by up to 4%. Sources use inverse distance attenuation (reference 3 m, rolloff 1.5) from the controlled body, with equal-power panning. The listener uses the controlled body and Web Audio's fixed world orientation; camera-relative panning is not implemented. Original effects are mono; the preview's score and air bed are nonpositional stereo.

Voices are bounded at 24 globally and up to three per one-shot effect. Each standard loop has one voice, acid flight up to four and corrosion up to three. Additional world loops wait quietly for capacity. Per-effect one-shots are throttled to 35 ms; extreme rapid overlapping turret shots may be dropped by this mix limiter without changing projectile spawning. Original loops fade in over 40 ms; their stops remain immediate to respect charge cancellation/destruction. Preview beds have the longer fades described above.

## Lifecycle

- Boot preloads/decode-caches the 34 Bob/Goop clips and seven preview assets (41 total) while playback stays suspended. The Cultivation factory adds the shared turret and six rescued-Volt movement/recovery clips (48 total); Blackout adds his electrical clips (61 total). These requests begin ahead of module/visual preparation, without gating boot or transitions on optional audio. Cues arriving before a buffer is ready are dropped, never replayed late. Repeated/overlapping requests share per-sound promises and one context, with at most four fetch/decode jobs active. Unlock only requests the initial bank, never the later banks. Individual failures remain optional and are exposed in diagnostics. Disposal aborts fetches, cancels queued jobs and ignores late decodes. Trusted pointer/key gestures unlock playback; unsupported audio leaves gameplay operational.
- Pause/menus suspend the context and clear transient character loops. World loops preserve their offsets and resume once. Browser blur/visibility adds an independent suspension gate. Fixed-step state recreates character movement/charge loops only if still valid.
- Death stops effect voices, preserves music, plays Bob's accepted-failure cue when applicable, and rejects further world sounds until successful recovery. Retry sounds the restored active identity.
- Restart/checkpoint/puzzle reset clears effect voices and suppresses restoration notifications until the next gameplay update. Music retains its source and offset. Projectile impact, expiry, reset and disposal immediately stop flight ownership; burn completion/reset/disposal stop corrosion ownership.
- Unload/transition removes level subscriptions and all sources. Shutdown removes browser handlers, disconnects audio graph resources and closes the context. Blackout's terminal completion explicitly clears and suspends audio; its session retains the completed scene. Merging clears original-character loops and the merged Specimen owns listener position without borrowing a slime's movement sounds.

## Complete mapping

All names below identify `.ogg` files. Loop behavior is explicit; other sounds are one-shots.

| Asset | Gameplay mapping / reason unavailable |
| --- | --- |
| `bob-bounce-01` | Applied bouncy-surface impulse; excludes generic impact for that step. |
| `bob-charge-loop-01` | Authoritative Bob jump charging state; stops on launch/cancel/switch/pause/reset. |
| `bob-charged-jump-01` | Accepted launch with charge fraction at least 0.8. |
| `bob-detach-01` | Intentional surface release or sticky-wall-to-floor handoff. |
| `bob-fall-01` | Accepted Bob death sequence, including hazard/out-of-bounds failure. |
| `bob-impact-01` | Non-floor obstacle contact at least 4 m/s, excluding landing/bounce. |
| `bob-jump-01` | Accepted launch with charge fraction below 0.8. |
| `bob-land-hard-01` | Stable landing at least 8 m/s. |
| `bob-land-soft-01` | Stable airborne-to-ground landing below 8 m/s. |
| `bob-movement-loop-01` | Grounded tangent speed above 0.2 m/s; stops in air or at rest. |
| `bob-respawn-01` | Successful checkpoint retry after recovery restores active Bob. |
| `bob-slip-01` | Loss of adhesive support after support/edge probes fail. |
| `bob-squish-01` | Onset of real jump-charge compression; once until charge ends. |
| `bob-stick-01` | First successful authored adhesive attachment. |
| `bob-wall-crawl-loop-01` | Same resolved motion while attached; replaces the ground loop. |
| `bob-wall-step-01` | Successful convex sticky-face regrip; no frame-based footsteps. |
| `goop-acid-puddle-loop-01` | UNWIRED: Goop does not spawn persistent acidic puddles. Authored level acid is not a Goop puddle. |
| `goop-aim-enter-01` | Acid aiming changes inactive to active. |
| `goop-aim-exit-01` | Acid aiming changes active to inactive during gameplay. |
| `goop-dissolve-complete-01` | Burn reaches authoritative completion. |
| `goop-dissolve-invalid-01` | UNWIRED: no dedicated failed-corrosion feedback event; ordinary world impacts are valid acid collisions. |
| `goop-dissolve-loop-01` | Active burn keyed by target ID; survives switching; stops on complete/reset/dispose. |
| `goop-dissolve-start-01` | DissolveSystem accepts a new burn; repeated hits do not retrigger. |
| `goop-idle-bubbles-loop-01` | Active grounded Goop at rest; very quiet and exclusive with movement. |
| `goop-impact-01` | Non-floor obstacle contact at least 4 m/s, excluding landing/bounce. |
| `goop-interact-01` | Pressure plate becomes pressed with Goop among its real occupants. |
| `goop-jump-01` | Accepted Goop launch impulse. |
| `goop-land-hard-01` | Stable landing at least 8 m/s. |
| `goop-land-soft-01` | Stable landing below 8 m/s. |
| `goop-movement-loop-01` | Grounded resolved movement above 0.2 m/s. |
| `goop-projectile-flight-loop-01` | Active acid projectile; follows its world position; keyed by projectile ID. |
| `goop-projectile-impact-01` | Real soluble or world collision, including blocked launch. |
| `goop-respawn-01` | Successful checkpoint retry after recovery restores active Goop. |
| `goop-shoot-01` | Accepted AcidProjectileSystem projectile activation, after cooldown/pool checks. |
| `volt-aim-enter-01` | Electrical aiming changes inactive to active. |
| `volt-aim-exit-01` | Electrical aiming changes active to inactive during gameplay. |
| `volt-charge-loop-01` | Blackout bay/transit electrical receiver starts timed power accumulation; positional at receiver. |
| `volt-charge-ready-01` | Receiver crosses its existing full-charge threshold; once per charge cycle. |
| `volt-circuit-connect-01` | Accepted Volt tether acquisition. |
| `volt-circuit-hold-loop-01` | Established power tether; remains audible when another slime is selected. |
| `volt-circuit-release-01` | Existing tether breaks during gameplay; reset/death/merge/completion/unload are silent. |
| `volt-electric-impact-01` | Electrical discharge successfully acquires a target, or its search beam starts against a blocking world surface. |
| `volt-energy-pulse-01` | UNWIRED: no separate high-energy discharge gameplay event exists; electrical visual pulses are not events. |
| `volt-idle-sparks-loop-01` | Active grounded Volt at rest; very quiet. |
| `volt-jump-01` | Accepted Volt launch impulse. |
| `volt-land-01` | Stable landing below 8 m/s. |
| `volt-land-hard-01` | Stable landing at least 8 m/s. |
| `volt-light-activate-01` | Light device becomes powered, or transit lamp bank finishes its timed charge. |
| `volt-movement-loop-01` | Active grounded Volt resolves tangent movement above 0.2 m/s. |
| `volt-platform-power-on-01` | Motor device first receives power (platform/lift/bridge/door); custom bay door/bridge lock charge completes. |
| `volt-respawn-01` | Successful checkpoint retry after recovery restores active Volt. |
| `volt-shoot-01` | Electrical search beam actually enters its emitting state, once per beam start. |
| `volt-terminal-activate-01` | PoweredDeviceCore terminal/relay/junction false-to-true power transition; custom bay/bridge-lock readiness. |
| `specimen-turret-shot` | DroneProjectileSystem accepts a real spawn; common seam for fixed, ground, ceiling, lift and transit turrets. |
| `containment-score` | Stereo 64-second loop in Containment Rooms 1–3; independent music gain. |
| `lab-air-loop` | Stereo 16-second environmental bed in Rooms 1–3; effects gain. |
| `lab-machine-loop` | Mono 12-second positional hum at the Room 1 containment apparatus. |
| `lab-checkpoint` | Authoritative checkpoint ID changes during normal preview gameplay; restoration is silent. |
| `lab-laser-on` / `lab-laser-off` | Room 3 authoritative beam enabled state changes; no frame-based retriggering. |
| `lab-switch` | Accepted active-body change during preview gameplay; naturally unavailable before Goop rescue, auditionable with the existing debug unlock. |

## Validation

`npm run type-check`, `npm test`, `npm run build`, `npm run validate:production`,
`npm run test:smoke`, `npm run test:integration`, and relevant
`npm run test:browser` checks cover this change. The dedicated audio integration
test exposes the existing runtime for observation without replacing game/audio
logic; the production smoke tests run without runtime injection.

Browser checks can verify decoding, resources and gameplay synchronization, but do not establish a human listening review on speakers/headphones. Cross-browser and subjective final mix review remain useful before release. See the PR for actual executed results.
