import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPassiveInteractionStatus,
  getSlimeRosterEntryView,
  SlimeSwitchFeedbackModel,
} from '../src/ui/SlimeRosterView.ts';
import type { SlimeHUDSnapshot } from '../src/slimes/SlimeHUDState.ts';

const roster = [
  {
    id: 'bob' as const,
    displayName: 'Bob',
    betaPlayable: true,
    unlocked: true,
    registered: true,
    active: false,
  },
  {
    id: 'goop' as const,
    displayName: 'Goop',
    betaPlayable: true,
    unlocked: true,
    registered: true,
    active: true,
  },
];

function snapshot(
  overrides: Partial<SlimeHUDSnapshot> = {},
): SlimeHUDSnapshot {
  return {
    roster,
    activeSlimeId: 'goop',
    passiveInteractions: [],
    playerSwitchFeedback: undefined,
    resetSwitchFeedback: false,
    ...overrides,
  };
}

test('roster view uses explicit text and shape states for active, switchable, and locked slimes', () => {
  const bob = {
    id: 'bob' as const,
    displayName: 'Bob',
    betaPlayable: true,
    unlocked: true,
    registered: true,
    active: true,
  };
  const goop = {
    id: 'goop' as const,
    displayName: 'Goop',
    betaPlayable: true,
    unlocked: false,
    registered: false,
    active: false,
  };
  const volt = {
    id: 'volt' as const,
    displayName: 'Volt',
    betaPlayable: false,
    unlocked: false,
    registered: false,
    active: false,
  };

  assert.deepEqual(getSlimeRosterEntryView(bob), {
    state: 'active',
    stateLabel: 'ACTIVE — CONTROLLED',
    controlLabel: 'ACTIVE BODY',
    ariaLabel: 'Bob: active, controlled body',
  });
  assert.match(getSlimeRosterEntryView(goop)?.stateLabel ?? '', /LOCKED/);
  assert.equal(getSlimeRosterEntryView(volt), undefined);

  const inactiveBob = { ...bob, active: false };
  const activeGoop = {
    ...goop,
    unlocked: true,
    registered: true,
    active: true,
  };
  assert.equal(getSlimeRosterEntryView(inactiveBob)?.state, 'switchable');
  assert.match(
    getSlimeRosterEntryView(inactiveBob)?.controlLabel ?? '',
    /TAB.*SWITCH/,
  );
  assert.equal(getSlimeRosterEntryView(activeGoop)?.state, 'active');
});

test('passive interaction status explains why an inactive body remains effective', () => {
  assert.equal(
    formatPassiveInteractionStatus(
      snapshot({
        passiveInteractions: [{ slimeId: 'bob', label: 'pressure plate' }],
      }),
    ),
    'Bob holds the pressure plate while inactive. Switching keeps it active.',
  );
});

test('passive status stays absent without a relevant inactive-body interaction', () => {
  assert.equal(formatPassiveInteractionStatus(snapshot()), undefined);
  assert.equal(
    formatPassiveInteractionStatus(
      snapshot({
        passiveInteractions: [{ slimeId: 'goop', label: 'pressure plate' }],
      }),
    ),
    undefined,
  );
  assert.equal(
    formatPassiveInteractionStatus(snapshot({ passiveInteractions: [] })),
    undefined,
  );
});

test('switch feedback only reports a successful player switch and clears on recovery or restart', () => {
  const model = new SlimeSwitchFeedbackModel();
  assert.equal(model.update(snapshot()), '');

  assert.equal(
    model.update(
      snapshot({
        playerSwitchFeedback: {
          sequence: 1,
          previousSlimeId: 'bob',
          activeSlimeId: 'goop',
        },
      }),
    ),
    'Switched to Goop. Bob is inactive.',
  );

  const recoveredRoster = roster.map((entry) => ({
    ...entry,
    active: entry.id === 'bob',
  }));
  assert.equal(
    model.update(
      snapshot({ roster: recoveredRoster, activeSlimeId: 'bob' }),
    ),
    '',
  );
  assert.equal(getSlimeRosterEntryView(recoveredRoster[0])?.state, 'active');

  model.update(
    snapshot({
      playerSwitchFeedback: {
        sequence: 2,
        previousSlimeId: 'bob',
        activeSlimeId: 'goop',
      },
    }),
  );
  model.clear();
  assert.equal(model.update(snapshot()), '');
});

test('same-active recovery clears stale switch feedback without changing the roster', () => {
  const model = new SlimeSwitchFeedbackModel();
  assert.equal(
    model.update(
      snapshot({
        playerSwitchFeedback: {
          sequence: 1,
          previousSlimeId: 'bob',
          activeSlimeId: 'goop',
        },
      }),
    ),
    'Switched to Goop. Bob is inactive.',
  );

  const recoveredSnapshot = snapshot({ resetSwitchFeedback: true });
  assert.equal(model.update(recoveredSnapshot), '');
  assert.equal(recoveredSnapshot.activeSlimeId, 'goop');
  assert.equal(
    getSlimeRosterEntryView(
      recoveredSnapshot.roster.find((entry) => entry.id === 'goop')!,
    )?.state,
    'active',
  );
});
