import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { EventBus } from '../src/core/EventBus.ts';
import type { PerformanceGameplaySnapshot } from '../src/core/PerformanceSnapshot.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from '../src/levels/CultivationFoundationManifest.ts';
import { CultivationLevelScene } from '../src/levels/CultivationLevelScene.ts';
import { GameSessionCoordinator } from '../src/levels/GameSessionCoordinator.ts';
import type { GameLevelRuntime, GameLevelRuntimeEvents } from '../src/levels/GameLevelRuntime.ts';
import type { LevelLifecycleState } from '../src/levels/LevelLifecycle.ts';
import type { LevelProgressionSnapshot } from '../src/levels/LevelProgression.ts';
import { EMPTY_SLIME_HUD_SNAPSHOT } from '../src/slimes/SlimeHUDState.ts';

class MockRuntime implements GameLevelRuntime {
  readonly events = new EventBus<GameLevelRuntimeEvents>();
  state: LevelLifecycleState = 'unloaded';
  readonly calls: string[] = [];
  readonly debugInteractionCalls: boolean[] = [];
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
  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionCalls.push(enabled);
  }
  subscribeSlimeHUD(listener: (snapshot: typeof EMPTY_SLIME_HUD_SNAPSHOT) => void): () => void {
    listener(EMPTY_SLIME_HUD_SNAPSHOT);
    return () => {};
  }
  getSlimeHUDSnapshot() { return EMPTY_SLIME_HUD_SNAPSHOT; }
  captureProgressionSnapshot(): LevelProgressionSnapshot { return this.progression; }
  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void {
    target.level = this.id;
  }
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

test('Level 2 retains effective level-owned lighting after the Level 1 handoff', () => {
  const renderedScene = new THREE.Scene();
  const levelOneRoot = new THREE.Group();
  levelOneRoot.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1));
  renderedScene.add(levelOneRoot);
  const levelOne = new MockRuntime('level-1', progression);
  const levelOneUnload = levelOne.unload.bind(levelOne);
  levelOne.unload = () => {
    levelOneUnload();
    levelOneRoot.removeFromParent();
  };
  let levelTwoScene: CultivationLevelScene | undefined;

  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: (snapshot) => {
      levelTwoScene = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
      const levelTwo = new MockRuntime('level-2', snapshot);
      const levelTwoLoad = levelTwo.load.bind(levelTwo);
      levelTwo.load = () => {
        levelTwoLoad();
        renderedScene.add(levelTwoScene!.root);
      };
      const levelTwoDispose = levelTwo.dispose.bind(levelTwo);
      levelTwo.dispose = () => {
        levelTwoDispose();
        levelTwoScene?.dispose();
      };
      return levelTwo;
    },
    scheduleTransition: (transition) => transition(),
  });
  session.load();
  session.start();
  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });

  const effectiveLights: THREE.Light[] = [];
  renderedScene.traverseVisible((object) => {
    if (object instanceof THREE.Light && object.intensity > 0) effectiveLights.push(object);
  });
  assert.equal(levelOneRoot.parent, null);
  assert.ok(levelTwoScene);
  assert.ok(effectiveLights.some((light) => light instanceof THREE.HemisphereLight));
  assert.ok(effectiveLights.some((light) => light instanceof THREE.DirectionalLight));

  session.dispose();
  assert.equal(renderedScene.children.length, 0);
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

test('an asynchronously loaded Level 2 completes through the existing transition', async () => {
  const levelOne = new MockRuntime('level-1', progression);
  let resolveLevelTwo!: (runtime: GameLevelRuntime) => void;
  const levelTwoPromise = new Promise<GameLevelRuntime>((resolve) => {
    resolveLevelTwo = resolve;
  });
  const completed: string[] = [];
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: () => levelTwoPromise,
    scheduleTransition: (transition) => transition(),
  });
  session.events.on('transitionCompleted', ({ levelId }) => completed.push(levelId));
  session.load();
  session.start();

  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  assert.deepEqual(levelOne.calls, ['load', 'start', 'stop', 'unload', 'dispose']);
  assert.deepEqual(completed, []);

  const levelTwo = new MockRuntime('level-2', progression);
  resolveLevelTwo(levelTwo);
  await Promise.resolve();

  assert.deepEqual(levelTwo.calls, ['load']);
  assert.deepEqual(levelTwo.debugInteractionCalls, [false]);
  assert.deepEqual(completed, ['level-2']);
  assert.equal(session.state, 'stopped');
  session.dispose();
});

test('a rejected deferred Level 2 import uses transition failure handling', async () => {
  const levelOne = new MockRuntime('level-1', progression);
  const failures: string[] = [];
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: () => Promise.reject(new Error('chunk unavailable')),
    scheduleTransition: (transition) => transition(),
  });
  session.events.on('transitionFailed', ({ message }) => failures.push(message));
  session.load();
  session.start();

  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  await Promise.resolve();

  assert.equal(session.state, 'stopped');
  assert.match(failures[0], /chunk unavailable/);
  assert.throws(() => session.restartLevel(), /failed level transition/);
  session.dispose();
});

test('a deferred Level 2 runtime is disposed if the session ends while loading', async () => {
  const levelOne = new MockRuntime('level-1', progression);
  let resolveLevelTwo!: (runtime: GameLevelRuntime) => void;
  const levelTwoPromise = new Promise<GameLevelRuntime>((resolve) => {
    resolveLevelTwo = resolve;
  });
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: () => levelTwoPromise,
    scheduleTransition: (transition) => transition(),
  });
  session.load();
  session.start();
  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  session.dispose();

  const levelTwo = new MockRuntime('level-2', progression);
  resolveLevelTwo(levelTwo);
  await Promise.resolve();

  assert.deepEqual(levelTwo.calls, ['dispose']);
});

test('unload invalidates a pending handoff even if another transition starts', () => {
  const levelOne = new MockRuntime('level-1', progression);
  const scheduled: Array<() => void> = [];
  let created = 0;
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: (snapshot) => {
      created += 1;
      return new MockRuntime('level-2', snapshot);
    },
    scheduleTransition: (transition) => scheduled.push(transition),
  });
  session.load();
  session.start();

  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  session.unload();
  assert.equal(session.state, 'unloaded');

  session.load();
  session.start();
  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  assert.equal(scheduled.length, 2);
  scheduled[0]();
  assert.equal(created, 0);
  scheduled[1]();
  assert.equal(created, 1);
  session.dispose();
});

test('replacement runtime inherits disabled debug interaction during transition', () => {
  const levelOne = new MockRuntime('level-1', progression);
  let levelTwo: MockRuntime | undefined;
  const session = new GameSessionCoordinator({
    initialRuntime: levelOne,
    createLevelTwo: (snapshot) => {
      levelTwo = new MockRuntime('level-2', snapshot);
      return levelTwo;
    },
    scheduleTransition: (transition) => transition(),
  });
  session.load();
  session.start();
  session.events.on('transitionStarted', () =>
    session.setDebugInteractionEnabled(false));

  levelOne.events.emit('completed', { levelId: 'containment', nextLevelId: 'level-2' });
  assert.ok(levelTwo);
  assert.deepEqual(levelTwo.debugInteractionCalls, [false]);

  session.start();
  session.setDebugInteractionEnabled(true);
  assert.deepEqual(levelTwo.debugInteractionCalls, [false, true]);
  session.dispose();
});
