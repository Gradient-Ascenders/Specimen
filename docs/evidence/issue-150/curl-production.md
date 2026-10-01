# Approved curl in Bob's production presentation

Status: implemented locally; final Gate 2 and Gate 3 visual approval remains open.

The runtime `bob-authored.glb` now derives its neutral body and lenses from the
exact Gate 1-approved `bob-curl-candidate.glb` generator. The approved candidate
artifact itself was not changed. A regression test compares every neutral
vertex and triangle in all three meshes between the two exports. The authored
asset has 3,264 body triangles, 504 eye triangles, seven body poses, matching
eye-seat targets and four eye expressions. The validator accepts the archived
original Gate 1 profile and the new curl profile with distinct bounds.

## Silhouette and pose review

These Workbench images reload the exported authored GLB. They are raw pose
evidence; they do not establish how every transition feels during play.

- Neutral: [front](curl-production/neutral-front.png),
  [side](curl-production/neutral-side.png),
  [three-quarter](curl-production/neutral-three-quarter.png).
- Locomotion: [Reach](curl-production/move-reach.png),
  [Gather](curl-production/move-gather.png).
- Traversal and reactions: [Squash](curl-production/squash.png),
  [Flatten](curl-production/flatten.png),
  [Launch](curl-production/launch.png),
  [Airborne](curl-production/airborne.png),
  [Stress](curl-production/stress.png),
  [Blink](curl-production/blink.png).

The curl remains connected to the dome across these poses. Squash and Flatten
lower and widen it with the body; Launch and Airborne raise it. This pass does
not introduce another body target or an independent antenna rig.

## Material and gameplay review

The existing cyan gel and glossy black lens materials are retained. The gel
vertex wobble is now suppressed across the curl asset's actual eye-seat depth.
No collider, gameplay movement or ability state changed. Bob's visual frame
turns toward the authoritative support normal with a bounded angular speed,
holds that frame through the brief Launch envelope, then returns toward
gameplay up while airborne. The existing floor reversal timing stays intact.

- [Clinical Room 2 gameplay camera](curl-production/clinical-gameplay.png).
- [Green hazard Room 3 gameplay camera](curl-production/hazard-gameplay.png).
- [Room 5 warning backdrop](curl-production/alarm-gameplay.png).
- [Room 2 sticky-wall attachment](curl-production/wall-attachment-gameplay.png).

These browser images came from the built game at 1440 × 900 using the
development room shortcuts. In the same operation, W movement, Space charge
and launch, Room 5 teleport and R restart were exercised. No failed requests
or page errors occurred during that operation. The debug recorder is visible
in the images and reported cold shader compilations after teleport. The same
Room 2 shader-guard regression reproduced on the untouched
`origin/style/bob-model` archive in this environment. The targeted browser
tests for real Level 1 ground locomotion, stopping, reversal, and the
damage-to-burst handoff passed.

The wall capture uses a debug placement near Room 2's catch wall, then real D
input and collision; the authoritative body reported `attached: true` on
`room-2-sticky-catch-wall` with normal `(-1, 0, 0)`. The gameplay camera was
orbited to inspect the contact silhouette. Automated coverage also checks the
launch hold, airborne recovery and reset. The Room 5 warning capture shows
contrast against the red backdrop, but Bob is outside the brightest red light.
Direct red-light response, a full wall-climb traversal and representative
lab-hardware performance remain to be reviewed before full visual acceptance.

## Reproduce

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-authored.py
blender --background assets/characters/bob/bob-authored.blend --python assets/characters/bob/render-bob-curl-authored-evidence.py
node --test tests/BobGateOneAsset.test.ts tests/BobMorphAsset.test.ts tests/BobCharacterPresentation.test.ts
npm test
npm run build
```

Run `npm run preview`, start Level 1 and use W, Space and the sticky surfaces to
inspect Bob through locomotion, charge, jump, landing and wall attachment.
