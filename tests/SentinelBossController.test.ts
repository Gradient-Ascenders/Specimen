import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { SentinelBossController } from '../src/boss/SentinelBossController.ts';
import type {
  SentinelAttackContext,
} from '../src/boss/SentinelBossTypes.ts';
import { TimedSentinelAttack } from '../src/boss/attacks/SentinelAttack.ts';

class TestAttack extends TimedSentinelAttack {
  constructor(id: string, activeSeconds = 0.1) {
    super(id, {
      telegraphSeconds: 0.1,
      activeSeconds,
      recoverySeconds: 0.1,
    });
  }

  protected onActiveUpdate(): void {}
}

const context: SentinelAttackContext = {
  specimen: {
    position: { x: 0, y: 0.675, z: 0 },
    previousPosition: { x: 0, y: 0.675, z: 0 },
    radiusMetres: 0.675,
  },
  requestFailure: () => true,
};

function impact(
  damageUnits: number,
  fullyCharged = false,
) {
  return {
    projectileId: 1,
    targetId: 'sentinel-weak-point',
    kind: 'direct' as const,
    chargeAmount: fullyCharged ? 1 : 0,
    fullyCharged,
    damageUnits,
    point: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
  };
}

function makeBoss() {
  const attacks = [
    new TestAttack('p1'),
    new TestAttack('p2'),
    new TestAttack('p3'),
  ];
  const anchor = new THREE.Object3D();
  const boss = new SentinelBossController({
    attacks,
    phaseScripts: {
      1: ['p1'],
      2: ['p2'],
      3: ['p3'],
    },
    weakPointAnchor: anchor,
    config: {
      introSeconds: 0.2,
      vulnerabilitySeconds: 0.4,
      finalVulnerabilitySeconds: 0.5,
      armourHealthPerLayer: 3,
    },
  });
  return { boss, attacks };
}

function updateUntilState(
  boss: SentinelBossController,
  state: SentinelBossController['readModel']['state'],
  maximumSteps = 200,
): void {
  for (let step = 0; step < maximumSteps; step += 1) {
    if (boss.readModel.state === state) return;
    boss.update(0.05, context);
  }
  assert.equal(boss.readModel.state, state);
}

test('Sentinel runs intro and deterministic phase scripts into vulnerability', () => {
  const { boss } = makeBoss();
  const states: string[] = [];
  boss.events.on('stateChanged', ({ state }) => states.push(state));

  try {
    assert.equal(boss.start(), true);
    assert.equal(boss.start(), false);
    assert.equal(boss.readModel.state, 'intro');

    boss.update(0.1, context);
    assert.equal(boss.readModel.state, 'intro');
    boss.update(0.1, context);
    assert.equal(boss.readModel.state, 'phase-1');

    updateUntilState(boss, 'vulnerable-1');
    assert.equal(boss.readModel.weakPointOpen, true);
    assert.ok(states.includes('phase-1'));
    assert.ok(states.includes('vulnerable-1'));
  } finally {
    boss.dispose();
  }
});

test('failed vulnerability repeats the same phase while preserving partial armour damage', () => {
  const { boss } = makeBoss();

  try {
    boss.start();
    updateUntilState(boss, 'vulnerable-1');

    assert.equal(boss.applyWeakPointImpact(impact(1)).accepted, true);
    assert.equal(boss.readModel.currentArmourHealth, 2);

    boss.update(0.4, context);
    assert.equal(boss.readModel.state, 'phase-1');
    assert.equal(boss.readModel.currentArmourHealth, 2);

    updateUntilState(boss, 'vulnerable-1');
    assert.equal(boss.readModel.currentArmourHealth, 2);
  } finally {
    boss.dispose();
  }
});

test('armour breaks once per layer and one hit never spills into the next layer', () => {
  const { boss } = makeBoss();
  const breaks: number[] = [];
  boss.events.on('armourLayerBroken', ({ phaseNumber }) => {
    breaks.push(phaseNumber);
  });

  try {
    boss.start();
    updateUntilState(boss, 'vulnerable-1');

    assert.equal(boss.applyWeakPointImpact(impact(9, true)).accepted, true);
    assert.equal(boss.readModel.weakPointOpen, false);
    assert.equal(boss.applyWeakPointImpact(impact(9, true)).accepted, false);

    boss.update(0.05, context);
    assert.equal(boss.readModel.state, 'phase-2');
    assert.equal(boss.readModel.currentArmourHealth, 3);
    assert.equal(boss.readModel.armourLayersRemaining, 2);
    assert.deepEqual(breaks, [1]);
  } finally {
    boss.dispose();
  }
});

test('final core requires a fully charged direct blast and defeat/cinematic emit once', () => {
  const { boss } = makeBoss();
  let defeated = 0;
  let cinematic = 0;
  boss.events.on('defeated', () => {
    defeated += 1;
  });
  boss.events.on('finalCinematicRequested', () => {
    cinematic += 1;
  });

  try {
    boss.start();

    for (const vulnerability of [
      'vulnerable-1',
      'vulnerable-2',
      'vulnerable-3',
    ] as const) {
      updateUntilState(boss, vulnerability);
      boss.applyWeakPointImpact(impact(3, true));
      boss.update(0.05, context);
    }

    assert.equal(boss.readModel.state, 'final-vulnerable');
    assert.equal(
      boss.applyWeakPointImpact(impact(1, false)).rejectionReason,
      'charge-required',
    );
    assert.equal(boss.readModel.coreHealth, 1);

    const result = boss.applyWeakPointImpact(impact(3, true));
    assert.equal(result.accepted, true);
    assert.equal(result.destroyed, true);
    boss.update(0.05, context);

    assert.equal(boss.readModel.state, 'defeated');
    assert.equal(boss.readModel.defeated, true);
    assert.equal(defeated, 1);
    assert.equal(cinematic, 1);
    assert.equal(boss.consumeDefeatRequest(), true);
    assert.equal(boss.consumeDefeatRequest(), false);

    for (let index = 0; index < 20; index += 1) {
      boss.update(0.05, context);
    }
    assert.equal(defeated, 1);
    assert.equal(cinematic, 1);
  } finally {
    boss.dispose();
  }
});

test('closed weak point and splash are rejected deterministically', () => {
  const { boss } = makeBoss();

  try {
    boss.start();
    assert.equal(
      boss.applyWeakPointImpact(impact(3, true)).rejectionReason,
      'weak-point-closed',
    );

    updateUntilState(boss, 'vulnerable-1');
    const splash = {
      ...impact(3, true),
      kind: 'splash' as const,
    };
    assert.equal(
      boss.applyWeakPointImpact(splash).rejectionReason,
      'splash-not-allowed',
    );
    assert.equal(boss.readModel.currentArmourHealth, 3);
  } finally {
    boss.dispose();
  }
});

test('reset from every encounter state returns pristine idle boss and is idempotent', () => {
  const { boss } = makeBoss();

  try {
    boss.start();
    updateUntilState(boss, 'vulnerable-1');
    boss.applyWeakPointImpact(impact(1));
    boss.reset();

    assert.deepEqual(
      {
        state: boss.readModel.state,
        layers: boss.readModel.armourLayersRemaining,
        armour: boss.readModel.currentArmourHealth,
        core: boss.readModel.coreHealth,
        weakPointOpen: boss.readModel.weakPointOpen,
        attack: boss.readModel.currentAttackId,
        defeated: boss.readModel.defeated,
      },
      {
        state: 'idle',
        layers: 3,
        armour: 3,
        core: 1,
        weakPointOpen: false,
        attack: null,
        defeated: false,
      },
    );

    boss.reset();
    assert.equal(boss.readModel.state, 'idle');
    assert.equal(boss.readModel.armourLayersRemaining, 3);
  } finally {
    boss.dispose();
  }
});

test('checkpoint capture is allowed only at stable boundaries and restore removes live attack state', () => {
  const { boss } = makeBoss();

  try {
    const idle = boss.capture();
    boss.start();
    assert.throws(
      () => boss.capture(),
      /stable encounter boundaries/,
    );

    updateUntilState(boss, 'phase-1');
    // First fixed step in phase starts the first attack.
    boss.update(0.01, context);
    assert.throws(
      () => boss.capture(),
      /stable encounter boundaries/,
    );

    boss.restore(idle);
    assert.equal(boss.readModel.state, 'idle');
    assert.equal(boss.readModel.currentAttackId, null);
    assert.equal(boss.readModel.weakPointOpen, false);
  } finally {
    boss.dispose();
  }
});


test('synchronous death cancellation during an active attack does not advance or dereference stale ownership', () => {
  class FailureAttack extends TimedSentinelAttack {
    constructor() {
      super('failure-attack', {
        telegraphSeconds: 0.05,
        activeSeconds: 1,
        recoverySeconds: 0.05,
      });
    }

    protected onActiveUpdate(
      _deltaSeconds: number,
      activeContext: SentinelAttackContext,
    ): void {
      activeContext.requestFailure();
    }
  }

  const attack = new FailureAttack();
  const boss = new SentinelBossController({
    attacks: [attack],
    phaseScripts: {
      1: [attack.id],
      2: [attack.id],
      3: [attack.id],
    },
    weakPointAnchor: new THREE.Object3D(),
    config: {
      introSeconds: 0.05,
      vulnerabilitySeconds: 0.2,
      finalVulnerabilitySeconds: 0.2,
      armourHealthPerLayer: 3,
    },
  });
  let failures = 0;
  const failureContext: SentinelAttackContext = {
    specimen: context.specimen,
    requestFailure: () => {
      failures += 1;
      boss.cancelTransient('death');
      return true;
    },
  };

  try {
    boss.start();
    boss.update(0.05, failureContext);
    assert.equal(boss.readModel.state, 'phase-1');

    boss.update(0.05, failureContext);
    assert.equal(boss.readModel.currentAttackStage, 'active');

    assert.doesNotThrow(() => boss.update(0.05, failureContext));
    assert.equal(failures, 1);
    assert.equal(boss.readModel.currentAttackId, null);
    assert.equal(attack.readModel.stage, 'idle');
    assert.equal(boss.readModel.state, 'phase-1');
  } finally {
    boss.dispose();
  }
});


test('final vulnerability timeout repeats phase three and reopens the final core without an extra armour window', () => {
  const { boss } = makeBoss();

  try {
    boss.start();
    for (const vulnerability of [
      'vulnerable-1',
      'vulnerable-2',
      'vulnerable-3',
    ] as const) {
      updateUntilState(boss, vulnerability);
      boss.applyWeakPointImpact(impact(3, true));
      boss.update(0.05, context);
    }

    assert.equal(boss.readModel.state, 'final-vulnerable');
    assert.equal(boss.readModel.armourLayersRemaining, 0);

    boss.update(0.5, context);
    assert.equal(boss.readModel.state, 'phase-3');

    updateUntilState(boss, 'final-vulnerable');
    assert.equal(boss.readModel.state, 'final-vulnerable');
    assert.equal(boss.readModel.armourLayersRemaining, 0);
    assert.equal(boss.readModel.currentArmourHealth, 0);
  } finally {
    boss.dispose();
  }
});
