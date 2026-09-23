# Bob locomotion visual approval gate

Status: **candidate for visual approval; not integrated into production.**

The shipped `bob-authored.glb` and `BobCharacterPresentation.ts` are unchanged.
The separate [candidate Blender source](../../../../assets/characters/bob/bob-locomotion-candidate.blend)
exports `move-forward` and `move-reverse` shape keys. Its neutral mesh is the
approved curl neutral. The body, eye seats and sprout deform together; no
rigid whole-model pitch or gameplay collider change is involved.

## Pose evidence

| State | Side | Three-quarter |
| --- | --- | --- |
| Neutral | [view](neutral-side.png) | [view](neutral-three-quarter.png) |
| Full-speed forward | [view](full-speed-forward-side.png) | [view](full-speed-forward-three-quarter.png) |
| Reversal crossing neutral | [view](reversal-neutral-crossing-side.png) | — |
| Opposite lean | [view](opposite-lean-side.png) | [view](opposite-lean-three-quarter.png) |

These Workbench renders reload the candidate GLB. The leading side compresses
slightly, the trailing side stretches, and the upper mass shifts over a fixed
sole. The sprout visibly lags the shoulder as the lean changes sign.

## Gameplay-camera evidence

- [Short movement clip](gameplay-camera-movement.webm): Room 2, starting neutral,
  moving with A, reversing with D, then settling after release. The clip records
  the real game canvas at 960 × 600.
- 1440 × 900 frames: [neutral](gameplay-neutral.png),
  [full-speed](gameplay-forward.png), [reversal](gameplay-reversal.png),
  [opposite travel](gameplay-opposite-travel.png),
  [settled](gameplay-settled.png).
- [Observed movement state](gameplay-observations.json): the clip reached
  normalized lean 0.887 at full speed, -0.768 during reversal and 0.037 after
  stopping. The browser reported no page errors or failed requests.

The browser script loads the candidate only through a route override. A
temporary page-local driver maps authoritative resolved velocity to sustained
forward/reverse morph weights and briefly holds the old facing through the
counterlean. It does not change game source, physics, collider, camera, or
the production asset. The clip tests the proposed presentation direction;
runtime integration and feel review remain behind this approval gate.

## Reproduce and checks

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-locomotion-candidate.py
blender --background --factory-startup --python assets/characters/bob/render-bob-locomotion-candidate.py
node scripts/validate-bob-locomotion-candidate.mjs
npm run build
node scripts/capture-bob-locomotion-candidate.mjs
BOB_CAPTURE_CLIP_ONLY=1 node scripts/capture-bob-locomotion-candidate.mjs
```

The candidate validator passed: all neutral vertices and triangles match the
approved curl export; all morph deltas are finite; all default weights are
zero. The 97 sampled sole vertices have zero movement in both locomotion
targets. Average shoulder travel is about 0.160 m in either direction, while
the sprout moves 0.059 m forward or 0.080 m in reverse. `npm run build` and
the existing Bob morph/presentation test files passed. The built game was
served locally for the gameplay capture.
