import assert from 'node:assert/strict';
import test from 'node:test';

import type { LevelLifecycleState } from '../src/levels/LevelLifecycle.ts';
import {
  GameFlowLifecycleCoordinator,
  type GameFlowLevelRuntime,
} from '../src/ui/GameFlowLifecycleCoordinator.ts';

class FakeLevelRuntime implements GameFlowLevelRuntime {
  state: LevelLifecycleState = 'stopped';
  readonly calls: string[] = [];

  start(): void {
    this.calls.push('start');
    this.state = 'running';
  }

  stop(): void {
    this.calls.push('stop');
    this.state = 'stopped';
  }

  restartLevel(): void {
    this.calls.push('restartLevel');
  }
}

test('flow lifecycle coordination starts, pauses, and resumes through public operations', () => {
  const runtime = new FakeLevelRuntime();
  const coordinator = new GameFlowLifecycleCoordinator(runtime);

  coordinator.startGameplay();
  coordinator.stopGameplay();
  coordinator.startGameplay();

  assert.deepEqual(runtime.calls, ['start', 'stop', 'start']);
  assert.equal(runtime.state, 'running');
});

test('paused restart makes one authoritative request before gameplay resumes', () => {
  const runtime = new FakeLevelRuntime();
  const coordinator = new GameFlowLifecycleCoordinator(runtime);

  coordinator.restartLevel();
  coordinator.startGameplay();

  assert.deepEqual(runtime.calls, ['restartLevel', 'start']);
  assert.equal(runtime.state, 'running');
});
