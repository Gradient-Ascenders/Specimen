# Gameplay sound effects

Specimen ships 32 OGG effects: Bob 7, Goop 5, Volt 19, turrets 1. Of these, 31 have current gameplay mappings; Volt's energy pulse is reserved for an absent mechanic. Bob's former 16-effect and Goop's former 18-effect procedural packs have been replaced with requester-selected ElevenLabs recordings and shared body cues. No new gameplay mechanics, fire rates, damage rules or puzzle timings are introduced.

## Architecture

`src/audio/SoundCatalog.ts` registers every asset. `AudioManager` owns one application Web Audio context, cached decoded buffers, an effects gain, compressor and master gain. `GameplayAudio` owns each level's event subscriptions, character loops and reset suppression. Typed `gameplayAudioEvents` notifications are presentation-only; gameplay never reads audio state. Each current runtime receives the same manager from `main.ts`. Standalone gameplay fixtures need no browser audio context.

Movement uses authoritative KinematicBody events and resolved grounded velocity, not keyboard detection. Bob and Goop have quiet contact one-shots every 1.25 m of grounded tangent locomotion, using `locomotionPosition` to exclude carrier transport and teleports. They have no continuous movement loop, idle loop or charging sound; Bob also has no wall loop. Motion accents are suppressed while charging, airborne, stationary or landing; their accumulated distance clears on interactions, switch, pause and reset. Volt retains his existing movement and idle loops. Goop reuses Bob's normal jump, soft/hard landings, obstacle contact, rupture and retry; Bob's charged jump and adhesion cues remain specific to Bob. Pressure plate contact with Goop also uses the shared body-contact clip. Acid shots, collisions, burns, electrical connections, receiver charge thresholds, powered devices and turret projectiles publish notifications only after their gameplay conditions succeed. Loop keys identify the character channel, nearest acid basin, dissolve target, charge receiver or established tether. Character switching clears only character loops; existing corrosion and an inactive Volt tether retain ownership. Acid projectiles have no flight or aiming sounds. An accepted burn starts the dissolution loop directly, without a separate start cue; repeated hits do not restart it. Plain world impacts use only the impact clip.

## Assets and provenance

`public/assets/audio/{bob,goop,volt,turrets}/` contains only runtime OGG files (416,533 bytes total). Source archives are not shipped in production. The separately supplied turret WAV was transcoded once to OGG Vorbis.

The requester generated Bob's replacement recordings in ElevenLabs and selected them through listening review. The seven originals (six stereo PCM16 WAVs and one stereo Vorbis file, all 48 kHz) are preserved byte-for-byte in `assets/audio/bob/bob-sounds.tar`. `scripts/import-bob-audio.py` prepares the runtime files using NumPy and SoundFile/libsndfile: average stereo to mono, remove DC offset, balance levels without compression, cap peaks with headroom, apply 2 ms edge fades, and encode Vorbis. The powerful jump starts at source 0.58 s and hard landing at 0.30 s to remove separate preparation sounds before their main hit; soft landing starts at 0.065 s to remove its leading delay. Other clips retain their full timeline. `docs/assets/bob-audio-import.json` records source/archive hashes, trims, gains and resulting RMS. Reimport with `python3 scripts/import-bob-audio.py` after installing NumPy and SoundFile; Python is not a game dependency.

Goop's five original stereo PCM16 48 kHz WAVs are preserved byte-for-byte in `assets/audio/goop/goop-sounds.tar`. `scripts/import-goop-audio.py` averages stereo to mono, removes DC offset and balances levels with peak headroom. The impact starts at source 0.02 s. One-shots have 2 ms edge fades. The dissolution loop uses an 80 ms circular overlap; the pool loop trims 80 ms from each end then uses a 120 ms circular overlap to avoid a silent seam. `docs/assets/goop-audio-import.json` records hashes, trims, overlaps, gains and decoded RMS. Reimport with `python3 scripts/import-goop-audio.py` (NumPy/SoundFile required). The original filename `active-dissoloution.wav` is preserved in the source archive.

The retained Volt pack manifest describes original procedural synthesis using oscillators, filtered noise and envelopes, with ChatGPT assistance and no imported audio samples. No separate licence declaration was supplied. The turret was provided separately by the requester; its original creator, synthesis tool and separate licence are not specified. `CREDITS.md` records these distinctions and feeds the existing in-game credits screen.

`docs/assets/gameplay-audio-inventory.json` records all 32 decoded durations, sample rates, channel counts and peaks. All runtime assets are mono 48 kHz. Every file was fully decoded using libsndfile, and browser validation checks Web Audio decoding separately. Paths use Vite's relative `BASE_URL` (`./`) and remain beneath a nested deployment directory.

## Mix and volume

Master volume defaults to 100%; sound-effects volume defaults to 80%. Both have independent sliders in Settings, are clamped to 0–100%, and persist for the current application session across level changes/restarts. Either can mute all effects. Loops generally use 0.13 gain; active dissolution uses 0.2 and Volt's idle loop 0.045; acid one-shots use 0.5 and turrets 0.65. A compressor at -12 dB/4:1 protects overlapping effects.

Shared body sample base gains are contact 0.4, normal jump 0.5, charged jump 0.6, soft landing 0.4, hard landing/death 0.55 and peel 0.42. Contact uses 35% of its base for ground movement, 25% on walls, 55% for corner regrips, 80% for obstacle contact/retry and 100% for initial attachment. Peel uses 65% of its base so wall-jump release does not overwhelm the launch. These playback scales never modify the shared sample or later cues. The archive has no dedicated attachment clip, so soft body contact supplies attachment/regrip feedback. Heavy floor landings already emit their sound before the automatic rebound; that rebound does not add another impact. Bouncy-surface impulses use the same hard-landing source once.

Repeated movement/jump/landing/body cues vary playback rate by up to 4%. Sources use inverse distance attenuation (reference 3 m, rolloff 1.5) from the controlled body, with equal-power panning. The listener uses the controlled body and Web Audio's fixed world orientation; camera-relative panning is not implemented. All sounds are mono.

Voices are bounded at 24 globally and three per one-shot effect. Each standard loop has one voice and corrosion up to three. Authored acid pools in Containment, Cultivation and Blackout share one environmental voice: it plays within 18 m of the nearest surface point, follows the controlled body across wide basins, and stops outside that range. The clip does not create persistent projectile puddles or imply that ordinary impacts corrode surfaces. Additional world loops wait quietly for capacity. Per-effect one-shots are throttled to 35 ms; extreme rapid overlapping turret shots may be dropped by this mix limiter without changing projectile spawning. Loops fade in over 40 ms; stops are immediate to respect charge cancellation/destruction.

## Lifecycle

- Boot preloads/decode-caches the 12 Bob/Goop clips while playback stays suspended. The Cultivation factory adds the shared turret and six rescued-Volt movement/recovery clips (19 total); Blackout adds his electrical clips (32 total). These requests begin ahead of module/visual preparation, without gating boot or transitions on optional audio. Cues arriving before a buffer is ready are dropped, never replayed late. Repeated/overlapping requests share per-sound promises and one context, with at most four fetch/decode jobs active. Unlock only requests the initial bank, never the later banks. Individual failures remain optional and are exposed in diagnostics. Disposal aborts fetches, cancels queued jobs and ignores late decodes. Trusted pointer/key gestures unlock playback; unsupported audio leaves gameplay operational.
- Pause/menus suspend the context and clear transient character loops. World loops preserve their offsets and resume once. Browser blur/visibility adds an independent suspension gate. Fixed-step state recreates character movement/idle and nearby basin loops only if still valid.
- Death stops existing voices, plays the shared rupture cue for Bob/Goop when applicable, and rejects further world sounds until successful recovery. Retry sounds the restored active identity.
- Restart/checkpoint/puzzle reset clears voices and suppresses restoration notifications until the next gameplay update. Burn completion/reset/disposal stop corrosion ownership. Basin ambience is re-evaluated from the controlled position on the next enabled gameplay update.
- Unload/transition removes level subscriptions and all sources. Shutdown removes browser handlers, disconnects audio graph resources and closes the context. Blackout's terminal completion explicitly clears and suspends audio; its session retains the completed scene. Merging clears original-character loops and the merged Specimen owns listener position without borrowing a slime's movement sounds.

## Complete mapping

All names below identify `.ogg` files. Loop behavior is explicit; other sounds are one-shots.

| Asset | Gameplay mapping / reason unavailable |
| --- | --- |
| `bob-contact-01` | Bob/Goop quiet grounded motion, obstacle contact and retry; Goop plate contact; Bob attachment and regrip. Gains vary by context; no idle/charge playback. |
| `bob-charged-jump-01` | Accepted launch with charge fraction at least 0.8. |
| `bob-detach-01` | Intentional surface release, loss of sticky support or sticky-wall-to-floor handoff. |
| `bob-fall-01` | Accepted Bob/Goop death sequence, including hazard/out-of-bounds failure. |
| `bob-jump-01` | Bob launch with charge fraction below 0.8; every accepted Goop launch. |
| `bob-land-hard-01` | Bob/Goop stable landing at least 8 m/s, or a Bob bouncy-surface impulse. A hard landing's passive reaction hop does not duplicate its impact. |
| `bob-land-soft-01` | Bob/Goop stable airborne-to-ground landing below 8 m/s. |
| `goop-acid-puddle-loop-01` | Nearby authored acid pools in all three levels; one positional looping voice within 18 m of the nearest surface. No projectile puddle mechanic. |
| `goop-dissolve-complete-01` | Burn reaches authoritative completion. |
| `goop-dissolve-loop-01` | Active burn keyed by target ID; survives switching; stops on complete/reset/dispose. |
| `goop-projectile-impact-01` | Real soluble or world collision, including blocked launch. |
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

## Validation

`npm run type-check`, `npm test`, `npm run build`, `npm run validate:production`,
`npm run test:smoke`, `npm run test:integration`, and relevant
`npm run test:browser` checks cover this change. The dedicated audio integration
test exposes the existing runtime for observation without replacing game/audio
logic; the production smoke tests run without runtime injection.

Browser checks can verify decoding, resources and gameplay synchronization, but do not establish a human listening review on speakers/headphones. Cross-browser and subjective final mix review remain useful before release. See the PR for actual executed results.
