# Credits

Credits for the people, music, sounds and tools behind Specimen.

## Game developers

- Kevin Ebrahim
- Uzair Mahomed
- Tyron Van Tonder
- Caleb Perumalsamy

All 3D models were created independently for Specimen.

## Music

| Resource | Creator | Source | Licence | Use |
| --- | --- | --- | --- | --- |
| Osmotic Memory | Tsorthan Grove | [OpenGameArt](https://opengameart.org/content/osmotic-memory) | CC0 | Title music · edited for looping and volume. |
| Thought Loop | GloryToTheMachine | [OpenGameArt](https://opengameart.org/content/thought-loop-glorytothemachine-ambientdeepnostalgic-loop) | CC BY 4.0 | Containment music · edited for volume. |
| Unsolved Investigation | isaiah658 | [OpenGameArt](https://opengameart.org/content/unsolved-investigation) | CC0 | Cultivation music. |
| Searching | yd | [OpenGameArt](https://opengameart.org/content/searching) | CC0 | Blackout music · edited for looping and volume. |

## Sound effects

| Resource | Creator | Source | Licence | Use |
| --- | --- | --- | --- | --- |
| In-game sounds | Made with ElevenLabs | Supplied sound packs and turret recording; see the notes below. | Licence details not supplied | All character, machine, drone and environment effects. |
| Interaction polish sounds | Made with ElevenLabs | Requester-supplied `polish-sounds-01.tar`. | Licence details not supplied | Buttons, bridge locking, lift and laser transitions, vent breaks, escape alarms and menu confirmation. |
| Intro cutscene sounds | Made with ElevenLabs | Requester-supplied `intro-cutscene-sounds.tar`. | Licence details not supplied | Laboratory ambience, camera servos, doors, egg rocking/cracking/falling/breaking, pod seal/lift and Bob's gel movement. |
| Intro camera variants | Made with ElevenLabs | Requester-supplied `intro-camera-sounds.tar`. | Licence details not supplied | Three distinct surveillance-camera movements replacing the original repeated camera cue. |
| Escape cutscene sounds | Made with ElevenLabs | Requester-supplied `escape-cutscene.tar`. | Licence details not supplied | Containment power-down, hatch, drone scans/results/warning/strain/destruction, projectile impacts and shaft falls. |
| Cultivation sentry sounds | Made with ElevenLabs | Requester-supplied `cultivation-sentry-sounds.tar`. | Licence details not supplied | Room 3 sentry shoves, topples and acid splashes; existing Goop dissolution supplies the sinking corrosion. |

## Tools

| Resource | Creator | Source | Licence | Use |
| --- | --- | --- | --- | --- |
| Three.js | mrdoob | [npm package](https://www.npmjs.com/package/three/v/0.185.1) | MIT | 3D graphics. |
| Motion | Motion contributors | [Motion](https://motion.dev) | MIT | On-screen animation. |
| Lucide | Lucide contributors | [Lucide](https://lucide.dev) | ISC | Icons. |
| meshoptimizer | Arseny Kapoulkine | [meshoptimizer](https://github.com/zeux/meshoptimizer) | MIT | Character detail levels. |
| Vite | Evan You | [npm package](https://www.npmjs.com/package/vite/v/8.2.1) | MIT | Game builds. |
| TypeScript | Microsoft Corp. | [npm package](https://www.npmjs.com/package/typescript/v/7.0.2) | Apache-2.0 | Code tools. |
| @types/three | DefinitelyTyped contributors | [npm package](https://www.npmjs.com/package/@types/three/v/0.185.4) | MIT | Three.js code tools. |

## Fonts

| Resource | Creator | Source | Licence | Use |
| --- | --- | --- | --- | --- |
| Michroma | Vernon Adams | [Fontsource](https://fontsource.org/fonts/michroma) | SIL OFL 1.1 | Headings and baked facility signs. |
| Space Grotesk | Florian Karsten | [Fontsource](https://fontsource.org/fonts/space-grotesk) | SIL OFL 1.1 | Text and controls. |

## Code

| Resource | Creator | Source | Licence | Use |
| --- | --- | --- | --- | --- |
| Hash without Sine | David Hoskins · © 2014 | [Shadertoy](https://www.shadertoy.com/view/4djSRW) | MIT | Adapted for acid and dissolve effects. |

## Maintaining this ledger

The sections above appear in the game. Keep those credits short and update them
alongside the full resource notes below whenever resources or licences change.
Record the resource, creator, source, licence and use in the same pull request
that introduces third-party work. Do not merge unattributed third-party work.

### Resource notes

These notes retain versions, source archives, audio edits and project art details
for maintainers. They do not appear in the game.

### Software / libraries

| Resource | Author / creator | Source | Licence | Use in Specimen |
| --- | --- | --- | --- | --- |
| Motion 14.5.0 | Motion contributors | [Motion](https://motion.dev) | MIT | HUD slide and fade animations using motion/mini. |
| Lucide 1.61.0 | Lucide contributors | [Lucide](https://lucide.dev) | ISC | SVG icons for menus and playback controls. |
| Three.js 0.185.1 | mrdoob | [npm package](https://www.npmjs.com/package/three/v/0.185.1) | MIT | 3D rendering framework used by the browser game. |
| meshoptimizer 1.1 (bundled Three.js add-on) | Arseny Kapoulkine | [meshoptimizer](https://github.com/zeux/meshoptimizer) | MIT | Offline, attribute-aware character LOD index generation; no runtime simplifier. |
| Vite 8.2.1 | Evan You | [npm package](https://www.npmjs.com/package/vite/v/8.2.1) | MIT | Development server and production build tool. |
| TypeScript 7.0.2 | Microsoft Corp. | [npm package](https://www.npmjs.com/package/typescript/v/7.0.2) | Apache-2.0 | Type checking and compilation. |
| @types/three 0.185.4 | DefinitelyTyped contributors | [npm package](https://www.npmjs.com/package/@types/three/v/0.185.4) | MIT | Type declarations for Three.js during type checking. |

### Models / meshes

No third-party models or meshes have been introduced yet.

### Textures / materials

No third-party textures or materials have been introduced yet.

Containment issue #32 Phase 1/1.5 uses only project-authored deterministic
procedural texture data and vector-stroke signage generated at runtime. Its
Room 1 geometry is built from project-authored Three.js primitives and the
Three.js `RoundedBoxGeometry` add-on already covered by the framework licence.
It does not use a downloaded texture pack or other third-party art asset.

Level 2 Rooms 1 and 2's shared laboratory finishes and instanced fixture/trim dressing are
original project-authored procedural data and Three.js primitives. No downloaded
textures or additional third-party assets are used in this pass.

Cultivation issue #97 adds original procedural corrosion, condensation and wetness
maps, a small gravity-runoff shader hook, and primitive-based broken service
windows, tank cartridges, drainage pipes and plant silhouettes for Rooms 1–3.
No downloaded textures, models or additional third-party resources are used.

Level 3 Room 1 issue #162 Checkpoint 1 adds original deterministic painted-steel,
corrosion, traction-deck and warning-paint albedo, roughness and tangent-space
normal maps. Its periodic wear generation follows Specimen's existing procedural
material approach. No downloaded textures, external art, or new third-party
techniques are introduced.

Checkpoint 2 extends that project-authored kit with corroded duct steel,
machinery wear and chipped maintenance-yellow paint; small circuit and rubber
fittings share the kit's roughness/normal maps. Object-local metric UVs retain
Three.js's existing curved primitive charts. No external texture assets,
adapted code or additional dependencies were introduced.

Level 3 Room 2 issue #163 reuses Room 1's project-authored prebaked facility maps
for the chamber, transit decks, machinery and retained covers. Sticky walls and
soluble latches use distinct tinted finishes; conducting contacts borrow the
existing data maps while retaining private powered-state materials. No new
texture assets, external code or third-party dependencies were introduced.

### Audio / music

| Resource | Author / creator | Source | Licence | Use in Specimen |
| --- | --- | --- | --- | --- |
| Bob replacement sound pack (7 effects) | Requester-generated using ElevenLabs Sound Effects | Requester-supplied `bob-sounds.tar`, preserved in `assets/audio/bob/` | Requester-supplied; generating account's plan/licence documentation not supplied | Bob contact, jumps, landings, adhesive release and rupture; shared body cues for Goop and Volt. Prepared as mono OGG with onset trims and level balancing; source archive retained unchanged. |
| Goop replacement sound pack (5 effects) | Requester-generated using ElevenLabs Sound Effects | Requester-supplied `goop-sounds.tar`, preserved in `assets/audio/goop/` | Requester-supplied; generating account's plan/licence documentation not supplied | Acid shot/impact, active dissolution/completion and authored acid pool bubbling. Mono OGG with level balancing and loop overlaps; source archive retained unchanged. |
| Volt replacement sound pack (5 effects) | Requester-generated using ElevenLabs Sound Effects | Requester-supplied `volt-sounds.tar`, preserved in `assets/audio/volt/` | Requester-supplied; generating account's plan/licence documentation not supplied | Electrical discharge, connection, quiet sustained power, charge completion/device activation and disconnect. Mono OGG with tail trims, level balancing and loop overlap; source archive retained unchanged. |
| World interaction pack (4 recordings, 6 runtime effects) | Requester-generated using ElevenLabs Sound Effects | Requester-supplied `world-interaction-sounds.tar`, preserved in `assets/audio/world/` | Requester-supplied; generating account's plan/licence documentation not supplied | Door travel/settling, machinery movement, local laser hum and physical control press/release. Mono OGG with documented source edits, quiet loop balancing and circular overlaps; source archive retained unchanged. |
| Environment pack (5 recordings, 6 runtime effects including Goop reuse) | Requester-generated using ElevenLabs Sound Effects | Requester-supplied `environment-sounds.tar`, preserved in `assets/audio/environment/`; existing originals in `assets/audio/goop/goop-sounds.tar` | Requester-supplied; generating account's plan/licence documentation not supplied | Falling platforms, heavy landing, flying/mountable drones, hover engines and monitor typing. Drone destruction edits Goop's active dissolution into completion with a short crossfade. Mono OGG; original archives retained unchanged. |
| Specimen turret shot | Requester-generated using ElevenLabs Sound Effects | Supplied `specimen-turret-shot.wav`, converted to OGG Vorbis | No separate licence declaration supplied | Accepted turret projectile spawns across the shared drone firing system. |
| Interaction polish pack (7 recordings, 10 runtime effects) | Requester-generated using ElevenLabs Sound Effects | Requester-supplied `polish-sounds-01.tar`, retained unchanged at repository root | Requester-supplied; generating account's plan/licence documentation not supplied | Button press/release, bridge latch, lift and laser transitions, vent breaks, escape alarms and menu confirmation. Documented source splits and gains in `docs/assets/polish-audio-import.json`. |
| Osmotic Memory | Tsorthan Grove | [OpenGameArt](https://opengameart.org/content/osmotic-memory) | CC0 | Intro/title screen music; edited for looping and loudness. |
| Thought Loop | GloryToTheMachine | [OpenGameArt](https://opengameart.org/content/thought-loop-glorytothemachine-ambientdeepnostalgic-loop) | CC BY 4.0 | Containment music; edited for loudness. Attribution: Music by GloryToTheMachine. |
| Unsolved Investigation | isaiah658 | [OpenGameArt](https://opengameart.org/content/unsolved-investigation) | CC0 | Cultivation music; lossless WAV source converted to OGG. |
| Searching | yd | [OpenGameArt](https://opengameart.org/content/searching) | CC0 | Blackout music; edited for looping and loudness. |

The complete gameplay sound-effect inventory and mappings are documented in
`docs/architecture/gameplay-audio.md`. Music is independently streamed via
`BackgroundMusic` and is controlled by menu/level state, not gameplay cues.

### Fonts

| Resource | Author / creator | Source | Licence | Use in Specimen |
| --- | --- | --- | --- | --- |
| Michroma | Vernon Adams | [Fontsource package](https://fontsource.org/fonts/michroma) | SIL Open Font License 1.1 | Self-hosted technical display and system-label typeface. |
| Space Grotesk | Florian Karsten | [Fontsource package](https://fontsource.org/fonts/space-grotesk) | SIL Open Font License 1.1 | Self-hosted body, control and HUD typeface. |

### Tutorials / references / adapted code

| Resource | Author / creator | Source | Licence | Use in Specimen |
| --- | --- | --- | --- | --- |
| Hash without Sine (`hash13`) | David Hoskins | [Original Shadertoy](https://www.shadertoy.com/view/4djSRW) | MIT, copyright © 2014 David Hoskins | Adapted with renamed variables as the lattice hash in the soluble-geometry value-noise mask and the baked acid-flow field. |

The dissolve value-noise interpolation, octave composition, gameplay
threshold, corrosion edge, standard-material integration, and matching shadow
passes were written for Specimen. No external texture or shader asset is used.
