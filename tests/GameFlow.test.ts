import assert from 'node:assert/strict';
import test from 'node:test';

import { Input } from '../src/core/Input.ts';
import { GameFlowStateModel } from '../src/ui/GameFlowUI.ts';
import { GameSettings } from '../src/ui/GameSettings.ts';

test('game flow permits only explicit menu transitions', () => {
  const flow = new GameFlowStateModel();

  assert.equal(flow.state, 'loading');
  assert.equal(flow.pause(), false);
  assert.equal(flow.completeBoot(), true);
  assert.equal(flow.state, 'title');
  assert.equal(flow.openSettings(), true);
  assert.equal(flow.state, 'settings');
  assert.equal(flow.back(), true);
  assert.equal(flow.state, 'title');
  assert.equal(flow.start(), true);
  assert.equal(flow.state, 'playing');
  assert.equal(flow.openCredits(), false);
  assert.equal(flow.pause(), true);
  assert.equal(flow.openCredits(), true);
  assert.equal(flow.back(), true);
  assert.equal(flow.state, 'paused');
  assert.equal(flow.resume(), true);
  assert.equal(flow.state, 'playing');
});

test('restart is single-entry and returns directly to gameplay', () => {
  const flow = new GameFlowStateModel();
  flow.completeBoot();
  flow.start();
  flow.pause();

  assert.equal(flow.beginRestart(), true);
  assert.equal(flow.beginRestart(), false);
  assert.equal(flow.state, 'restarting');
  assert.equal(flow.finishRestart(), true);
  assert.equal(flow.state, 'playing');
  assert.equal(flow.finishRestart(), false);
});

test('failed restart returns to the paused boundary', () => {
  const flow = new GameFlowStateModel();
  flow.completeBoot();
  flow.start();
  flow.pause();

  assert.equal(flow.beginRestart(), true);
  assert.equal(flow.cancelRestart(), true);
  assert.equal(flow.state, 'paused');
});

test('flow state subscriptions emit immediately and clean up explicitly', () => {
  const flow = new GameFlowStateModel();
  const states: string[] = [];
  const unsubscribe = flow.subscribe((state) => states.push(state));

  flow.completeBoot();
  flow.start();
  unsubscribe();
  flow.pause();

  assert.deepEqual(states, ['loading', 'title', 'playing']);
});

test('settings retain session values across flow transitions', () => {
  const settings = new GameSettings();
  const snapshots: number[] = [];
  const unsubscribe = settings.subscribe((value) => {
    snapshots.push(value.mouseSensitivity);
  });

  settings.setMouseSensitivity(1.7);
  settings.setInvertVerticalLook(true);
  settings.setMasterVolume(0.35);
  settings.setCameraDistanceMetres(6.4);

  const flow = new GameFlowStateModel();
  flow.completeBoot();
  flow.start();
  flow.pause();
  flow.beginRestart();
  flow.finishRestart();

  assert.deepEqual(settings.value, {
    mouseSensitivity: 1.7,
    invertVerticalLook: true,
    masterVolume: 0.35,
    cameraDistanceMetres: 6.4,
  });
  assert.deepEqual(snapshots.slice(0, 2), [1, 1.7]);

  unsubscribe();
  settings.setMouseSensitivity(1.2);
  assert.equal(snapshots.at(-1), 1.7);
});

test('camera distance setting clamps to its supported session range', () => {
  const settings = new GameSettings();

  settings.setCameraDistanceMetres(2);
  assert.equal(settings.value.cameraDistanceMetres, 3.5);
  settings.setCameraDistanceMetres(8);
  assert.equal(settings.value.cameraDistanceMetres, 7);
});

class FakeDocument extends EventTarget {
  hidden = false;
  pointerLockElement: Element | null = null;

  exitPointerLock(): void {
    this.pointerLockElement = null;
  }
}

class FakePointerElement extends EventTarget {
  requestCount = 0;

  requestPointerLock(): void {
    this.requestCount += 1;
  }
}

const keyboardEvent = (
  type: 'keydown' | 'keyup',
  code: string,
  repeat = false,
): Event => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  Object.defineProperty(event, 'repeat', { value: repeat });
  return event;
};

test('input suspension clears state and ignores gameplay activation', () => {
  const hostWindow = new EventTarget();
  const hostDocument = new FakeDocument();
  const pointerElement = new FakePointerElement();
  const input = new Input({
    window: hostWindow as unknown as Window,
    document: hostDocument as unknown as Document,
    pointerLockElement: pointerElement as unknown as HTMLElement,
  });

  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  assert.equal(input.isDown('moveForward'), true);

  input.setEnabled(false);
  assert.equal(input.isDown('moveForward'), false);
  const disabledKey = keyboardEvent('keydown', 'KeyW');
  hostWindow.dispatchEvent(disabledKey);
  pointerElement.dispatchEvent(new Event('click'));
  assert.equal(input.isDown('moveForward'), false);
  assert.equal(disabledKey.defaultPrevented, false);
  assert.equal(pointerElement.requestCount, 0);

  input.setEnabled(true);
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  assert.equal(input.isDown('moveForward'), false);
  hostWindow.dispatchEvent(keyboardEvent('keyup', 'KeyW'));
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  pointerElement.dispatchEvent(new Event('click'));
  assert.equal(input.isDown('moveForward'), true);
  assert.equal(pointerElement.requestCount, 1);

  input.dispose();
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  pointerElement.dispatchEvent(new Event('click'));
  assert.equal(input.isDown('moveForward'), false);
  assert.equal(pointerElement.requestCount, 1);
});

test('orphan key repeats after focus loss cannot reactivate movement', () => {
  const hostWindow = new EventTarget();
  const hostDocument = new FakeDocument();
  const pointerElement = new FakePointerElement();
  const input = new Input({
    window: hostWindow as unknown as Window,
    document: hostDocument as unknown as Document,
    pointerLockElement: pointerElement as unknown as HTMLElement,
  });

  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  assert.equal(input.isDown('moveForward'), true);
  hostWindow.dispatchEvent(new Event('blur'));
  assert.equal(input.isDown('moveForward'), false);

  input.setEnabled(false);
  input.setEnabled(true);
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW', true));
  assert.equal(input.isDown('moveForward'), false);

  hostWindow.dispatchEvent(keyboardEvent('keyup', 'KeyW'));
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  assert.equal(input.isDown('moveForward'), true);
  input.dispose();
});

test('orphan key repeats after visibility loss cannot reactivate movement', () => {
  const hostWindow = new EventTarget();
  const hostDocument = new FakeDocument();
  const pointerElement = new FakePointerElement();
  const input = new Input({
    window: hostWindow as unknown as Window,
    document: hostDocument as unknown as Document,
    pointerLockElement: pointerElement as unknown as HTMLElement,
  });

  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  hostDocument.hidden = true;
  hostDocument.dispatchEvent(new Event('visibilitychange'));
  assert.equal(input.isDown('moveForward'), false);

  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW', true));
  assert.equal(input.isDown('moveForward'), false);
  hostWindow.dispatchEvent(keyboardEvent('keyup', 'KeyW'));
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW'));
  assert.equal(input.isDown('moveForward'), true);
  input.dispose();
});
