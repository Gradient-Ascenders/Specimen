# Issue #21 evidence — complete Containment grey-box

## Automated verification

Run from the repository root:

```text
npm test
npm run type-check
npm run build
```

The implementation adds automated coverage for:

- sphere-versus-AABB level trigger entry, exit, deduplication and reset;
- unique collider names and sticky-surface texture roles across Rooms 1–5;
- observation lever gating and exactly-once Level 1 completion;
- whole-level reset of completion and checkpoint ownership;
- Room 4 death recovery restoring elevator pose, timers and the roof checkpoint.

## Manual capture required for review

Attach a full browser recording showing:

1. Room 1 adhesion and the Room 2 bounce route;
2. the complete Room 3 laser route and one checkpoint recovery;
3. the Room 4 warning, ascent patterns, arrival and one mid-ascent recovery;
4. Room 5's three checkpoints, final sticky route and observation-room landing;
5. the lever pull, Etch placeholder release and stable completed state;
6. a whole-level restart with no duplicated geometry, listeners or console errors.

Record any unreachable jump, unintended shortcut, camera obstruction or unfair
laser as a follow-up defect rather than silently changing movement tuning.
