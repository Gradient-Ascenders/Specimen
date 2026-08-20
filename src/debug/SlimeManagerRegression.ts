import { SlimeManager } from '../slimes/SlimeManager.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Focused #27 regression; does not mutate the live level roster. */
export function runSlimeManagerRegression(): string {
  const manager = new SlimeManager<object>();
  const bobBody = {};
  const goopBody = {};
  let forbiddenInvocationCount = 0;
  let permittedInvocationCount = 0;

  try {
    manager.registerBody('bob', bobBody);
    assert(
      manager.activeSlimeId === 'bob',
      'Bob did not become the default active registered slime.',
    );
    assert(manager.canActiveUseAbility('adhesion'), 'Bob adhesion unavailable.');
    assert(manager.canActiveUseAbility('rebound'), 'Bob rebound unavailable.');

    const bobDissolveInvoked = manager.invokeActiveAbility('dissolve', () => {
      forbiddenInvocationCount += 1;
    });
    assert(
      !bobDissolveInvoked && forbiddenInvocationCount === 0,
      'Bob invoked unavailable dissolve behaviour.',
    );

    assert(manager.unlock('goop'), 'Goop could not be unlocked for Beta.');
    manager.registerBody('goop', goopBody);
    assert(manager.activate('goop'), 'Goop could not become active.');
    assert(!manager.canActiveUseAbility('adhesion'), 'Goop inherited adhesion.');
    assert(!manager.canActiveUseAbility('rebound'), 'Goop inherited rebound.');

    const goopDissolveInvoked = manager.invokeActiveAbility('dissolve', () => {
      permittedInvocationCount += 1;
    });
    assert(
      goopDissolveInvoked && permittedInvocationCount === 1,
      'Goop dissolve gate did not permit configured behaviour.',
    );

    assert(!manager.unlock('volt'), 'Volt incorrectly unlocked in Beta.');
    assert(!manager.activate('volt'), 'Volt incorrectly became active.');
    assert(
      manager.getDefinition('volt').abilities.electrical,
      'Volt future electrical configuration is missing.',
    );
    assert(
      !manager.canUseAbility('volt', 'electrical'),
      'Locked Volt electrical behaviour was invokable.',
    );

    manager.resetForLevelRestart();
    assert(manager.activeSlimeId === 'goop', 'Restart changed active slime.');
    assert(
      manager.isUnlocked('goop') && manager.isRegistered('goop'),
      'Restart lost Goop state.',
    );

    manager.clearLevelRegistrations();
    assert(
      manager.registeredCount === 0 && manager.activeSlimeId === undefined,
      'Unload left stale runtime registrations.',
    );
    assert(manager.isUnlocked('goop'), 'Unload erased Goop unlock state.');

    manager.dispose();
    return [
      'PASS',
      'Bob + Goop configs',
      'Volt locked',
      'ability gates enforced',
      'restart stable',
      'unload clear',
    ].join(' — ');
  } catch (error) {
    manager.dispose();
    const message = error instanceof Error ? error.message : String(error);
    return `FAIL — ${message}`;
  }
}
