import assert from 'node:assert/strict';
import test from 'node:test';

import { Input } from '../src/core/Input.ts';
import {
  gameFlowCanPause,
  GameFlowStateModel,
  getGameFlowKeyboardAction,
  parseCreditsInlineParts,
} from '../src/ui/GameFlowUI.ts';
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

test('level transition owns a visible non-interactive state and resumes gameplay', () => {
  const model = new GameFlowStateModel();
  model.completeBoot();
  model.start();

  assert.equal(model.beginLevelTransition(), true);
  assert.equal(model.state, 'transitioning');
  assert.equal(model.pause(), false);
  assert.equal(model.finishLevelTransition(), true);
  assert.equal(model.state, 'playing');
});

test('failed level transition remains stopped instead of returning to gameplay', () => {
  const model = new GameFlowStateModel();
  model.completeBoot();
  model.start();
  model.beginLevelTransition();

  assert.equal(model.failLevelTransition(), true);
  assert.equal(model.state, 'transitionFailed');
  assert.equal(model.start(), false);
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

test('pause ownership defers to a death flow that disabled gameplay input', () => {
  assert.equal(gameFlowCanPause('playing', true), true);
  assert.equal(gameFlowCanPause('playing', false), false);
  assert.equal(gameFlowCanPause('paused', true), false);
});

test('pause uses a dedicated key while Escape remains a nested-menu cancel', () => {
  assert.equal(getGameFlowKeyboardAction('KeyP', 'playing'), 'pause');
  assert.equal(getGameFlowKeyboardAction('KeyP', 'paused'), 'resume');
  assert.equal(getGameFlowKeyboardAction('Escape', 'paused'), null);
  assert.equal(getGameFlowKeyboardAction('Escape', 'settings'), 'back');
  assert.equal(getGameFlowKeyboardAction('Escape', 'credits'), 'back');
  assert.equal(getGameFlowKeyboardAction('Escape', 'playing'), null);
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

test('credits preserve validated source links and inline code labels', () => {
  assert.deepEqual(
    parseCreditsInlineParts(
      'Use [npm package](https://www.npmjs.com/package/three/v/0.185.1) with `Three.js`.',
    ),
    [
      { text: 'Use ' },
      {
        text: 'npm package',
        href: 'https://www.npmjs.com/package/three/v/0.185.1',
      },
      { text: ' with ' },
      { text: 'Three.js' },
      { text: '.' },
    ],
  );
});

test('credits never activate unsafe link destinations', () => {
  assert.deepEqual(
    parseCreditsInlineParts('[source](javascript:alert)'),
    [{ text: 'source (javascript:alert)' }],
  );
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
  settings.setRenderPixelRatioCap(1.5);

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
    renderPixelRatioCap: 1.5,
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
  hostWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW', true));
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

test('a gameplay Space release cannot activate the focused pause control', () => {
  const hostWindow = new EventTarget();
  const input = new Input({
    window: hostWindow as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    pointerLockElement: new FakePointerElement() as unknown as HTMLElement,
  });

  hostWindow.dispatchEvent(keyboardEvent('keydown', 'Space'));
  assert.equal(input.isDown('jump'), true);
  input.setEnabled(false);

  const heldRelease = keyboardEvent('keyup', 'Space');
  hostWindow.dispatchEvent(heldRelease);
  assert.equal(heldRelease.defaultPrevented, true);

  const menuPress = keyboardEvent('keydown', 'Space');
  const menuRelease = keyboardEvent('keyup', 'Space');
  hostWindow.dispatchEvent(menuPress);
  hostWindow.dispatchEvent(menuRelease);
  assert.equal(menuPress.defaultPrevented, false);
  assert.equal(menuRelease.defaultPrevented, false);

  input.dispose();
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
