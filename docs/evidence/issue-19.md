# Issue #19 verification

The grey-box puzzle rig provides manual evidence for deterministic restoration
and checkpoint recovery.

## Checks performed

- Activated the pressure plate, advanced the door/platform, released the plate
  while both were returning, then ran **Run 10 reset cycles**.
- Confirmed every cycle restores the pressure plate to released, the door to
  closed, the platform to its authored start pose, the active checkpoint to the
  initial checkpoint, and the simulated slime to the initial safe spawn.
- Activated the elevated checkpoint and used **Recover at checkpoint**. The
  checkpoint manager validates the spawn against the authored clearance callback
  when registered, activated, and recovered.
- Ran `npm run type-check` and `npm run build` successfully.

## Scope boundary

This issue supplies deterministic puzzle and checkpoint restoration. It does not
create a competing game-wide restart operation; issue #23 will invoke this work
from the lifecycle-owned restart path.
