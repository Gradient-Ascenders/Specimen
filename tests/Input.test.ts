import assert from 'node:assert/strict';
import test from 'node:test';

import { Input, type InputAction } from '../src/core/Input.ts';

interface InputHarness {
  readonly input: Input;
  readonly hostWindow: EventTarget;
}

function createInputHarness(): InputHarness {
  const hostWindow = new EventTarget();
  const hostDocument = new EventTarget() as EventTarget & {
    hidden: boolean;
    pointerLockElement: Element | null;
    exitPointerLock(): void;
  };
  hostDocument.hidden = false;
  hostDocument.pointerLockElement = null;
  hostDocument.exitPointerLock = () => undefined;

  const pointerLockElement = new EventTarget() as EventTarget & {
    requestPointerLock(): void;
  };
  pointerLockElement.requestPointerLock = () => undefined;

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
  const { input, hostWindow } = createInputHarness();

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
