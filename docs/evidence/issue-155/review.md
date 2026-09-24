# Issue #155 — Bob mass-transfer locomotion

The production `bob-authored.glb` uses `move-reach` and `move-gather` body and
matching eye-seat targets. The approved curl neutral, the other five body poses,
the collider, and gameplay controls remain unchanged. Resolved support-plane
travel advances a four-part Neutral → Reach → blended transfer → Gather → Neutral
sequence. Speed sets its strength; acceleration briefly adds emphasis. Stopping
freezes phase and fades the pose. A sharp reversal collects to Neutral before
the bounded turn and starts a fresh cycle. Wall attachment starts the same
sequence with a new support frame.

## Authored pose evidence

These Workbench views reload the exported production GLB. They show the leading
side reaching over the planted sole, then the bulk crossing while the rear and
curl catch up. The front views also show the lenses seated on both poses.

| State | Front | Side | Three-quarter |
| --- | --- | --- | --- |
| Neutral | [view](poses/neutral-front.png) | [view](poses/neutral-side.png) | [view](poses/neutral-three-quarter.png) |
| Reach | [view](poses/move-reach.png) | [view](poses/move-reach-side.png) | [view](poses/move-reach-three-quarter.png) |
| Gather | [view](poses/move-gather.png) | [view](poses/move-gather-side.png) | [view](poses/move-gather-three-quarter.png) |

## Built-game movement

The [gameplay-camera clip](mass-transfer-runtime/gameplay-camera-movement.webm)
records real A/D, Space, and wall-climb input in the production build at
960 × 600. The [diagnostics](mass-transfer-runtime/observations.json) come from
the production Bob presentation and authoritative body. The room change uses
the existing development checkpoint shortcut; it does not substitute a motion
driver or alter morph weights.

Observed strength was 0.769 during acceleration and 0.642 at a later cruise
sample. Stopping held phase at 0.706 while strength fell to 0.016. Reversal
collected both locomotion morphs to zero at that phase, then restarted at phase
0.222 after turning. On the Room 1 sticky wall, the body reported attachment
with outward normal `(0, 0, -1)`, phase 0.484, Reach 0.497, Gather 0.485,
and no stale ground reversal. The capture reported no page errors or failed
requests.

The side and three-quarter pose views show distinct Reach and Gather shapes
without sole drift. In the sampled gameplay clip Bob stays grounded during
ordinary travel and the body does not visibly hop or roll. This is evidence for
Gate 3 review, not final visual approval or representative-hardware profiling.

## Reproduce

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-authored.py
blender --background assets/characters/bob/bob-authored.blend --python assets/characters/bob/render-bob-curl-authored-evidence.py -- --output docs/evidence/issue-155/poses --locomotion-only
node tests/BobCharacterPresentation.test.ts
node tests/BobMorphAsset.test.ts
npm run build
node scripts/capture-bob-runtime.mjs
```
