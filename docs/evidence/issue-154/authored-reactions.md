# Bob authored traversal and reactions — #154

Historical evidence for the original neutral. The later approved curl export
and its pose review are recorded in
[curl-production.md](../issue-150/curl-production.md).

The production Bob presentation now loads `bob-authored.glb`. Its neutral
geometry is generated from the unchanged Gate 1 source. The new deterministic
generator adds seven body targets, seven identically named seat targets on
each lens, and four independent eye expressions. The generated `.blend` is
the editable inspection artifact; the GLB is the runtime artifact. No new
third-party assets were introduced.

## State mapping

| Authoritative input | Presentation |
| --- | --- |
| Supported jump charge | Neutral → Squash, with bounded Effort |
| Launch event | 0.18-second Launch envelope, crossfading into Airborne |
| Unsupported state | Airborne; clears stale landing compression |
| Landing event | 0.28-second ordered Neutral → Squash → Flatten compression |
| Damage notification | 0.22-second Stress envelope, overriding traversal |
| Death | Stress anticipation for 0.075 seconds, then existing droplet burst |
| Reset, retry, unload | Clear weights, expressions, envelopes and secondary material state |

Level 1 already supplies launch, landing, death and recovery events. There is
no separate nonfatal damage event in its current gameplay model. `onDamage`
provides the tested presentation hook without introducing health or damage
eligibility. Independent expression requests use `setExpression`.

Body weights are copied by name to both eye seats. Expression weights have a
shared pose-dependent budget: large blinks become smaller during severe
compression rather than intersecting the skin. A regression test samples every
eye vertex against the morphed body across 120 combinations of compression,
launch, airborne, damage, individual expressions and combined expressions.
Its permitted surface gap is -2 mm to 55 mm, including the authored domed lens
depth. This caught and corrected an initially excessive Flatten/Blink blend.

The existing Gate 2 shader contains only bounded wobble and local ripple. It
has no major squash/stretch contribution to enable alongside these morphs,
so no additional suppression uniform or persistent suppression state is
needed. Whole-model death scaling was replaced with Stress. The existing burst
is hidden during anticipation so its core does not overlap the live body.

## Browser evidence

Captured from the production build in Chromium at 1440 × 900, using the real
Level 1 camera and Room 2 lighting. The existing room-teleport helper placed
Bob in open space. Actual Space-key input then drove charge, launch, airborne
travel and landing; sampled peak weights were Squash 1.0, Launch 0.907,
Airborne 1.0, and Flatten 0.881. Console/page errors and failed requests: zero.

- [Neutral](poses/neutral.png) and [real-input charge](poses/charge-gameplay.png).
- Inspection poses at full weight: [Reach](poses/move-reach.png),
  [Gather](poses/move-gather.png), [Squash](poses/squash.png),
  [Flatten](poses/flatten.png), [Launch](poses/launch.png),
  [Airborne](poses/airborne.png), [Stress](poses/stress.png).
- Independent inspection expressions on Neutral at full weight:
  [Blink](poses/blink.png), [Effort](poses/effort.png),
  [Surprise](poses/surprise.png), [Stress](poses/stress-expression.png).
- [Runtime-bounded Flatten plus Blink](poses/flatten-blink-bounded.png).

Inspection captures hold the presentation and select exported targets directly;
they are asset evidence, not claims that each pose was reached through input.
The browser also invoked the public death/recovery hooks and the real runtime
restart, confirming Stress anticipation, burst handoff, and all eleven eye
weights cleared. Automated tests cover disposal and late death updates.

## Reproduce

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-authored.py
node --test tests/BobMorphAsset.test.ts tests/BobGateOneAsset.test.ts tests/BobCharacterPresentation.test.ts
npm run type-check
npm test
npm run build
npm run preview
```

Open the preview URL, start Level 1, reach Room 2, hold Space to charge, then
release and land. Bob should compress, stretch briefly, settle into the milder
airborne silhouette, and compress again on landing. Eyes follow every pose.

## Review and scope

Verification completed: 577 tests passed in the full suite; type-check and
production build passed. Focused asset and presentation tests passed, including
the unchanged Gate 1 contract. Browser checks reported no errors or failed
requests. The asset remains 2,856 triangles (2,352 body and 504 eyes).

Standards review: no blockers. The eye-target validation gap raised during
review was tightened; zero deltas are allowed only for Gather's intentionally
stationary frontal seats. Cross-language morph names remain independently
checked by the exported-asset tests.

Spec review: no #154 blockers. Ground locomotion belongs to #155; Reach and
Gather are authored here but are not yet driven by travel. Support-frame work
and complete Gate 3 motion approval remain separate. These captures do not
claim representative lab-hardware performance or final Gate 3 approval.
