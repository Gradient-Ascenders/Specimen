# Gameplay sound effects

Specimen ships 24 OGG effects: Bob 7, Goop 5, Volt 5, world interactions 6, turrets 1. All have current gameplay mappings. All three former procedural character packs have been replaced with requester-selected ElevenLabs recordings and shared body cues. No new gameplay mechanics, fire rates, damage rules or puzzle timings are introduced.

## Architecture

`src/audio/SoundCatalog.ts` registers every asset. `AudioManager` owns one application Web Audio context, cached decoded buffers, an effects gain, compressor and master gain. `GameplayAudio` owns each level's event subscriptions, body motion feedback, world loops and reset suppression. Typed `gameplayAudioEvents` notifications are presentation-only; gameplay never reads audio state. `WorldAudio` reads registered mechanism progress and enabled laser geometry inside the current render scene, with no per-frame scene traversal. It never advances mechanisms. Registrations are removed by their owners on disposal. Each current runtime receives the same manager from `main.ts`. Standalone gameplay fixtures need no browser audio context.

Movement uses authoritative KinematicBody events and resolved grounded velocity, not keyboard detection. Bob, Goop and Volt have quiet contact one-shots every 1.25 m of grounded tangent locomotion, using `locomotionPosition` to exclude carrier transport and teleports. There are no continuous character movement or idle loops. Bob has no charging or wall loop. Motion accents are suppressed while charging, airborne, stationary or landing; their accumulated distance clears on interactions, switch, pause and reset. Goop and Volt reuse Bob's normal jump, soft/hard landings, obstacle contact, rupture and retry; Bob's charged jump and adhesion cues remain specific to Bob. Pressure plate contact with Goop also uses the shared body-contact clip. Acid shots, collisions, burns, electrical connections, receiver charge thresholds, powered devices and turret projectiles publish notifications only after their gameplay conditions succeed. Loop keys identify the nearest acid basin, world mechanism, laser, dissolve target or established tether. Character switching clears body travel accumulation; existing corrosion and an inactive Volt tether retain ownership. Acid projectiles have no flight sounds; neither acid nor electricity has aim-entry/exit sounds. Volt has one quiet sustained-power loop per established tether. Receiver charging uses that same tether sound without layering another loop. A receiver crossing its charge threshold plays one completion cue, replacing the previous stack of completion/device cues. Ordinary powered-device transitions reuse the completion clip at 45% (lights) or 60% (other devices) playback scale. Electrical world collisions have no separate impact clip. An accepted burn starts the dissolution loop directly, without a separate start cue; repeated hits do not restart it. Plain world impacts use only the impact clip.

## Assets and provenance

`public/assets/audio/{bob,goop,volt,world,turrets}/` contains only runtime OGG files (367,168 bytes total). Source archives are not shipped in production. The separately supplied turret WAV was transcoded once to OGG Vorbis.

The requester generated Bob's replacement recordings in ElevenLabs and selected them through listening review. The seven originals (six stereo PCM16 WAVs and one stereo Vorbis file, all 48 kHz) are preserved byte-for-byte in `assets/audio/bob/bob-sounds.tar`. `scripts/import-bob-audio.py` prepares the runtime files using NumPy and SoundFile/libsndfile: average stereo to mono, remove DC offset, balance levels without compression, cap peaks with headroom, apply 2 ms edge fades, and encode Vorbis. The powerful jump starts at source 0.58 s and hard landing at 0.30 s to remove separate preparation sounds before their main hit; soft landing starts at 0.065 s to remove its leading delay. Other clips retain their full timeline. `docs/assets/bob-audio-import.json` records source/archive hashes, trims, gains and resulting RMS. Reimport with `python3 scripts/import-bob-audio.py` after installing NumPy and SoundFile; Python is not a game dependency.

Goop's five original stereo PCM16 48 kHz WAVs are preserved byte-for-byte in `assets/audio/goop/goop-sounds.tar`. `scripts/import-goop-audio.py` averages stereo to mono, removes DC offset and balances levels with peak headroom. The impact starts at source 0.02 s. One-shots have 2 ms edge fades. The dissolution loop uses an 80 ms circular overlap; the pool loop trims 80 ms from each end then uses a 120 ms circular overlap to avoid a silent seam. `docs/assets/goop-audio-import.json` records hashes, trims, overlaps, gains and decoded RMS. Reimport with `python3 scripts/import-goop-audio.py` (NumPy/SoundFile required). The original filename `active-dissoloution.wav` is preserved in the source archive.

Volt's five original stereo PCM16 48 kHz WAVs are preserved byte-for-byte in `assets/audio/volt/volt-sounds.tar`. `scripts/import-volt-audio.py` performs mono averaging, DC removal, level balancing, 2 ms one-shot edge fades and Vorbis encoding. Only quiet tails are trimmed: discharge 0.15 s, connection 0.20 s and completion 0.30 s. The sustained-power clip uses a 100 ms circular overlap. `docs/assets/volt-audio-import.json` records hashes, trims, overlaps, gains and decoded RMS. Reimport with `python3 scripts/import-volt-audio.py` (NumPy/SoundFile required).

The four requester-generated world recordings are preserved unchanged in `assets/audio/world/world-interaction-sounds.tar`. `scripts/import-world-audio.py` makes six mono Vorbis assets without synthesising new sounds: door travel from source 0–0.88 s (80 ms circular overlap), door settling from 0.90–2.00 s, machinery and laser loops with 120 ms circular overlaps, and separate press (0.16–0.43 s) / release (0.53–0.85 s) edits from the two-click activation recording. Loops are balanced to 0.035 RMS before encoding; one-shots target 0.065 RMS, with peak headroom and 2 ms edge fades. `docs/assets/world-audio-import.json` records hashes, edits, gains and decoded RMS. Reimport with `python3 scripts/import-world-audio.py` (NumPy/SoundFile required).

The turret was provided separately by the requester; its original creator, synthesis tool and separate licence are not specified. `CREDITS.md` records provenance and feeds the existing in-game credits screen.

`docs/assets/gameplay-audio-inventory.json` records all 24 decoded durations, sample rates, channel counts and peaks. All runtime assets are mono 48 kHz. Every file was fully decoded using libsndfile, and browser validation checks Web Audio decoding separately. Paths use Vite's relative `BASE_URL` (`./`) and remain beneath a nested deployment directory.

## Mix and volume

Master volume defaults to 100%; sound-effects volume defaults to 80%. Both have independent sliders in Settings, are clamped to 0–100%, and persist for the current application session across level changes/restarts. Either can mute all effects. Acid pools use 0.13 gain and active dissolution 0.2. Volt's sustained power is deliberately quieter at 0.055 gain with its source balanced to 0.035 RMS before encoding, following the request to reduce its noisy character. Electrical discharge, connection and full completion use 0.5 gain; disconnect uses 0.38. Quieter device activation uses the per-cue scales above. Acid one-shots use 0.5 and turrets 0.65. A compressor at -12 dB/4:1 protects overlapping effects.

Shared body sample base gains are contact 0.4, normal jump 0.5, charged jump 0.6, soft landing 0.4, hard landing/death 0.55 and peel 0.42. Contact uses 35% of its base for ground movement, 25% on walls, 55% for corner regrips, 80% for obstacle contact/retry and 100% for initial attachment. Peel uses 65% of its base so wall-jump release does not overwhelm the launch. These playback scales never modify the shared sample or later cues. The archive has no dedicated attachment clip, so soft body contact supplies attachment/regrip feedback. Heavy floor landings already emit their sound before the automatic rebound; that rebound does not add another impact. Bouncy-surface impulses use the same hard-landing source once.

World door travel uses 0.14 gain and settling 0.38; platform/lift/bridge machinery 0.30; laser hum 0.32; physical press 0.45 and release 0.27. At most two nearby door/machinery loops and one nearby active laser loop play at once. Motors are audible within 16 m; laser distance uses the nearest point on its actual beam segment, including room transforms, within 10 m. Hidden/inactive rooms and disabled or circuit-gated beams are silent. All hazard laser variants register automatically through `LaserHazard`: static, timed/sweeping, circuit-controlled and Sentinel sweep/rotating attacks. They share one continuing positional hum; selecting a different nearest beam moves that voice without restarting its buffer. Inactive boss telegraphs/recovery and disabled beams stay silent. Loop selection follows distance and updates source positions. Controls are culled beyond 16 m from the controlled body.

Door travel follows actual progress changes, including reversals; issuing an unchanged open request does not create sound. Endpoint arrival plays the settling edit once; blocked doors stop their motor without a false arrival. Held, unpowered or obstructed platforms have no movement sound. The shared MovingPlatform covers the Containment elevator and parkour platforms and Blackout powered carriers. Rotating bridges, the transit deployable bridge and Cultivation's scrolling-shaft descent register their own authoritative progress. Press/release sounds follow actual pressure-plate, wall-button and transit bridge-switch changes; resets/disabled controls stay silent. Goop plate contact can also retain its existing body-contact cue.

Repeated movement/jump/landing/body cues vary playback rate by up to 4%. Sources use inverse distance attenuation (reference 3 m, rolloff 1.5) from the controlled body, with equal-power panning. The listener uses the controlled body and Web Audio's fixed world orientation; camera-relative panning is not implemented. All sounds are mono.

Voices are bounded at 24 globally and three per one-shot effect. Each standard loop has one voice and corrosion up to three. Authored acid pools in Containment, Cultivation and Blackout share one environmental voice: it plays within 18 m of the nearest surface point, follows the controlled body across wide basins, and stops outside that range. The clip does not create persistent projectile puddles or imply that ordinary impacts corrode surfaces. Additional world loops wait quietly for capacity. Per-effect one-shots are throttled to 35 ms; extreme rapid overlapping turret shots may be dropped by this mix limiter without changing projectile spawning. Loops fade in over 40 ms; stops are immediate to respect charge cancellation/destruction.

## Lifecycle

- Boot preloads/decode-caches the 12 Bob/Goop and six world-interaction clips (18 total) while playback stays suspended. The Cultivation factory adds the shared turret (19 total); rescued Volt already has the shared body samples. Blackout adds his five electrical clips (24 total). These requests begin ahead of module/visual preparation, without gating boot or transitions on optional audio. Cues arriving before a buffer is ready are dropped, never replayed late. Repeated/overlapping requests share per-sound promises and one context, with at most four fetch/decode jobs active. Unlock only requests the initial bank, never the later banks. Individual failures remain optional and are exposed in diagnostics. Disposal aborts fetches, cancels queued jobs and ignores late decodes. Trusted pointer/key gestures unlock playback; unsupported audio leaves gameplay operational.
- Pause/menus suspend the context and clear body travel accumulation. World loops preserve their offsets and resume once. Browser blur/visibility adds an independent suspension gate. Fixed-step state resumes body contact sampling and re-evaluates nearby basins, motors and active beams. Mechanism progress snapshots prevent resume from replaying an arrival.
- Death stops existing voices, plays the shared rupture cue for Bob/Goop/Volt when applicable, and rejects further world sounds until successful recovery. Retry sounds the restored active identity.
- Restart/checkpoint/puzzle reset clears voices and suppresses restoration notifications until the next gameplay update. Burn completion/reset/disposal stop corrosion ownership. Basin and world-interaction ambience is re-evaluated from the controlled position on the next enabled gameplay update. Mechanism restores update their presentation baseline so teleports do not sound like motion or arrival.
- Unload/transition removes level subscriptions and all sources. Shutdown removes browser handlers, disconnects audio graph resources and closes the context. Blackout's terminal completion explicitly clears and suspends audio; its session retains the completed scene. Merging clears original-character travel and the merged Specimen owns listener position without borrowing a slime's movement sounds.

## Complete mapping

All names below identify `.ogg` files. Loop behavior is explicit; other sounds are one-shots.

| Asset | Gameplay mapping / reason unavailable |
| --- | --- |
| `bob-contact-01` | Bob/Goop/Volt quiet grounded motion, obstacle contact and retry; Goop plate contact; Bob attachment and regrip. Gains vary by context; no idle/charge playback. |
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
| `specimen-turret-shot` | DroneProjectileSystem accepts a real spawn; common seam for fixed, ground, ceiling, lift and transit turrets. |

## Validation

`npm run type-check`, `npm test`, `npm run build`, `npm run validate:production`,
`npm run test:smoke`, `npm run test:integration`, and relevant
`npm run test:browser` checks cover this change. The dedicated audio integration
test exposes the existing runtime for observation without replacing game/audio
logic; the production smoke tests run without runtime injection.

Browser checks can verify decoding, resources and gameplay synchronization, but do not establish a human listening review on speakers/headphones. Cross-browser and subjective final mix review remain useful before release. See the PR for actual executed results.
