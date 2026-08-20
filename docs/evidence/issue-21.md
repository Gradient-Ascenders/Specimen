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
- Room 4 death recovery restoring elevator pose, timers and the roof checkpoint;
- inactive persistent slimes remaining attached to Room 4 and Room 5 carriers;
- Room 5 retaining its authored starting phase regardless of time spent in
  earlier rooms.

## Manual capture required for review

Attach a full production-build browser recording with the debug overlay and
room-teleport shortcuts unused, showing:

1. Room 1 adhesion and the Room 2 bounce route;
2. the complete Room 3 laser route and one checkpoint recovery;
3. the Room 4 warning, ascent patterns, arrival and one mid-ascent recovery;
4. Room 5's entry checkpoint, final sticky route and observation-room landing;
5. the lever pull, Etch placeholder release and stable completed state;
6. a whole-level restart with no duplicated geometry or listeners;
7. the browser console remaining free of errors for the full run and restart.

Record any unreachable jump, unintended shortcut, camera obstruction or unfair
laser as a follow-up defect rather than silently changing movement tuning.
