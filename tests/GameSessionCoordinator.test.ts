import assert from 'node:assert/strict';
import test from 'node:test';

import { EventBus } from '../src/core/EventBus.ts';
import { GameSessionCoordinator } from '../src/levels/GameSessionCoordinator.ts';
import type { GameLevelRuntime, GameLevelRuntimeEvents } from '../src/levels/GameLevelRuntime.ts';
import type { LevelLifecycleState } from '../src/levels/LevelLifecycle.ts';
import type { LevelProgressionSnapshot } from '../src/levels/LevelProgression.ts';
import { EMPTY_SLIME_HUD_SNAPSHOT } from '../src/slimes/SlimeHUDState.ts';

class MockRuntime implements GameLevelRuntime {
  readonly events = new EventBus<GameLevelRuntimeEvents>();
  state: LevelLifecycleState = 'unloaded';
  readonly calls: string[] = [];
  readonly id: string;
  private readonly progression: LevelProgressionSnapshot;
  private readonly failLoad: boolean;

  constructor(
    id: string,
    progression: LevelProgressionSnapshot,
    failLoad = false,
  ) {
    this.id = id;
    this.progression = progression;
    this.failLoad = failLoad;
  }

  load(): void { this.calls.push('load'); if (this.failLoad) throw new Error('load failed'); this.state = 'stopped'; }
  start(): void { this.calls.push('start'); this.state = 'running'; }
  stop(): void { this.calls.push('stop'); this.state = 'stopped'; }
  restartLevel(): void { this.calls.push('restart'); }
  unload(): void { this.calls.push('unload'); this.state = 'unloaded'; }
  dispose(): void { this.calls.push('dispose'); this.state = 'disposed'; }
  fixedUpdate(): void {}
  render(): void {}
  setDebugInteractionEnabled(): void {}
  subscribeSlimeHUD(listener: (snapshot: typeof EMPTY_SLIME_HUD_SNAPSHOT) => void): () => void {
    listener(EMPTY_SLIME_HUD_SNAPSHOT);
    return () => {};
  }
  getSlimeHUDSnapshot() { return EMPTY_SLIME_HUD_SNAPSHOT; }
  captureProgressionSnapshot(): LevelProgressionSnapshot { return this.progression; }
}

const progression: LevelProgressionSnapshot = {
  unlockedSlimeIds: ['bob', 'goop'],
  activeSlimeId: 'goop',
};

test('Level 1 completion replaces it with exactly one Level 2 runtime', () => {
  const levelOne = new MockRuntime('level-1', progression);
  let created = 0;
  let received: LevelProgressionSnapshot | undefined;
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: (snapshot) => {
      created += 1;
      received = snapshot;
      return new MockRuntime('level-2', snapshot);
    },
    scheduleTransition: (transition) => transition(),
  });
  session.load();
  session.start();

  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });

  assert.equal(created, 1);
  assert.deepEqual(received, progression);
  assert.deepEqual(levelOne.calls, ['load', 'start', 'stop', 'unload', 'dispose']);
  assert.equal(session.state, 'stopped');
  session.start();
  assert.equal(session.state, 'running');
  session.dispose();
});

test('a Level 2 load failure leaves a diagnosable non-running session', () => {
  const levelOne = new MockRuntime('level-1', progression);
  const failures: string[] = [];
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: (snapshot) => new MockRuntime('level-2', snapshot, true),
    scheduleTransition: (transition) => transition(),
  });
  session.events.on('transitionFailed', ({ message }) => failures.push(message));
  session.load();
  session.start();
  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });

  assert.equal(session.state, 'stopped');
  assert.match(failures[0], /load failed/);
  assert.throws(() => session.restartLevel(), /failed level transition/);
  session.dispose();
});
