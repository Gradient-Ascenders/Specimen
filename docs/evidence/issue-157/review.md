# Bob Gate 3 Level 1 review — #157

Status: implementation and current runtime evidence are ready for explicit
Gate 3 review. This document does not grant visual approval or close the gate.

## Reviewed build and method

- Review date: 25 September 2026 SAST.
- Source baseline: `aa15a31a5791265dd0cf7fef78c027d4457dc768`.
- Runtime: the Vite production build served by `npm run preview`.
- Browser: Playwright Chromium at 960 × 600, recording the gameplay canvas at
  15 fps.
- Development helpers were enabled only to expose the already-constructed
  runtime, place Bob at repeatable Room 1/2 checkpoints, request the existing
  Level 1 hazard failure, and inspect public diagnostics. They did not drive
  morph weights or replace Bob's controller.

[The raw gameplay recording](gate-three-gameplay.webm) and the extracted raw
frames in this directory come from one continuous browser session. The full
machine-readable sample is [observations.json](observations.json).

## What the session exercised

Real keyboard input exercised idle, acceleration and cruise, stopping, sharp
reversal, full jump charge, launch, airborne travel, landing, sticky-wall
travel, wall reversal, a full charge while still attached, wall detach, and
the development `R` restart binding. The same Level 1 session also exercised
the authoritative hazard-death request, game-over screen, Retry action, and
runtime unload.

Level 1 has no nonfatal gameplay damage model. The nonfatal Stress sample uses
Bob's existing public `onDamage(0.8)` presentation hook while the runtime is
paused at a real Room 2 state. Likewise, each independent eye expression is an
inspection request through `setExpression`; the runtime has no gameplay rule
that independently requests all four expressions. Those inspection states are
evidence of the approved presentation interface, not invented gameplay.

Useful visual checkpoints:

- [full ground charge](05-full-charge.png),
  [airborne](07-airborne.png), and [landing](08-landing.png);
- [wall travel](10-wall-travel.png),
  [wall reversal](11-wall-reversal.png),
  [attached full wall charge](12-wall-charge.png), and
  [wall detach](13-wall-detach.png);
- [nonfatal Stress](14-damage.png) and
  [death anticipation](15-death-stress.png);
- [Blink](09-expression-blink.png),
  [Effort](09-expression-effort.png),
  [Surprise](09-expression-surprise.png), and
  [Stress expression](09-expression-stress-expression.png).

## Diagnostic results

- The authoritative collider radius remained `0.45 m`. Presentation sampling
  never wrote a new body position or gameplay-up value.
- Body pose weights and both eye-seat pose weights matched exactly at every
  checkpoint: maximum observed delta `0`.
- The sum of the seven primary body-pose weights never exceeded `1.0`; charge,
  launch/airborne, landing, locomotion, and Stress did not accumulate unrelated
  full-strength families.
- Full wall charge reported `attached: true`, `chargeFraction: 1`, support
  `room-1-vent-sticky-entry-wall`, and the authored Squash family at `1.0`.
- Retry and restart cleared all seven body poses, all four expressions on both
  eyes, the death burst, locomotion strength, frame history, charge, and impact
  state. Restart returned to `room-1-floor` and incremented the lifecycle
  restart count once.
- Unload left Bob unprepared, detached his root, removed all root children, and
  left the runtime in `unloaded`.
- Failed requests: `0`. Unexplained console/page errors: `0`.

The development shader guard emitted four known cold-program diagnostics as
the cache grew `99 → 107 → 108 → 110 → 111`. The earlier curl-production
review reproduced the same debug-guard class on the untouched
`origin/style/bob-model` baseline. A focused attempt to rerun the dedicated
plain-production prewarm browser test made no progress for more than five
minutes in this software-WebGL environment and was interrupted; none of its
three selected tests completed. This evidence therefore records the messages
as known diagnostics, not as a newly explained pass of that separate prewarm
gate.

## Visual reconciliation

The reviewed ground charge, airborne, landing, wall travel, wall reversal,
wall charge, detach, damage, and death frames show no new silhouette break,
detached eye lens, wall penetration, or speculative morph requirement. The
attached wall-charge camera is unusually close and shows only a sliver of one
eye, so the recording and diagnostics are the stronger evidence for that
transition. The four independent expressions are present in the current
runtime samples, but final readability and motion feel remain subjective Gate
3 decisions for a human reviewer.

No gameplay, collider, control, morph, shader, or level source was changed for
#157. The demonstrated implementation already reconciles the previously
reported wall-facing and charged-wall-contact defects in commits `85c70d2`,
`962183e`, and `37b847f`.

## Reproduce

```bash
npm run build
node scripts/capture-bob-gate-three.mjs
```

The recorder asserts eye-seat parity, bounded primary-family accumulation,
clean retry/restart state, unload cleanup, no failed requests, and no
unexplained browser errors before returning success.

## Approval boundary

Review the recording with real player-control feel in mind, especially reversal,
wall orientation, the close attached-charge view, eye-expression readability,
and damage/death timing. Stop here for explicit Gate 3 approval before any Bob
migration to later levels.
