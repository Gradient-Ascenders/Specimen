import assert from 'node:assert/strict';
import test from 'node:test';

import { Input, type InputAction } from '../src/core/Input.ts';

function createInput(): {
  input: Input;
  hostWindow: EventTarget;
} {
  const hostWindow = new EventTarget();
  const hostDocument = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null,
    exitPointerLock: () => undefined,
  });
  const pointerLockElement = Object.assign(new EventTarget(), {
    requestPointerLock: () => undefined,
  });

  const input = new Input({
    pointerLockElement: pointerLockElement as unknown as HTMLElement,
    document: hostDocument as unknown as Document,
    window: hostWindow as unknown as Window,
  });

  return { input, hostWindow };
}

function dispatchKey(
  target: EventTarget,
  type: 'keydown' | 'keyup',
  code: string,
  repeat = false,
): void {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: repeat },
  });
  target.dispatchEvent(event);
}

function assertOrphanRepeatIsIgnored(
  code: string,
  action: InputAction,
): void {
  const { input, hostWindow } = createInput();

  dispatchKey(hostWindow, 'keydown', code);
  assert.equal(input.isDown(action), true);
  assert.equal(input.wasPressed(action), true);

  input.resetState();
  dispatchKey(hostWindow, 'keydown', code, true);
  assert.equal(input.isDown(action), false);
  assert.equal(input.wasPressed(action), false);

  dispatchKey(hostWindow, 'keyup', code);
  dispatchKey(hostWindow, 'keydown', code);
  assert.equal(input.isDown(action), true);
  assert.equal(input.wasPressed(action), true);

  input.dispose();
}

test('restart-key orphan repeat cannot retrigger after input reset', () => {
  assertOrphanRepeatIsIgnored('KeyR', 'debugReset');
});

test('movement-key orphan repeat cannot reactivate after input reset', () => {
  assertOrphanRepeatIsIgnored('KeyW', 'moveForward');
});

test('pointer cleanup does not masquerade as an input-state cancellation', () => {
  const { input } = createInput();

  input.endPointerUpdate();
  assert.equal(input.wasClearedSinceFixedUpdate, false);

  input.dispose();
});

test('focus clearing remains visible until the next fixed update', () => {
  const { input, hostWindow } = createInput();

  hostWindow.dispatchEvent(new Event('blur'));
  assert.equal(input.wasClearedSinceFixedUpdate, true);

  input.endFixedUpdate();
  assert.equal(input.wasClearedSinceFixedUpdate, false);

  input.dispose();
});
