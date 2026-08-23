import assert from 'node:assert/strict';
import test from 'node:test';

import { Input, type InputAction } from '../src/core/Input.ts';

function createInput(): {
  input: Input;
  hostWindow: EventTarget;
  hostDocument: EventTarget & { pointerLockElement: EventTarget | null };
  pointerLockElement: EventTarget;
} {
  const hostWindow = new EventTarget();
  const hostDocument = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null as EventTarget | null,
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

  return { input, hostWindow, hostDocument, pointerLockElement };
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

test('room debug teleports use top-row number keys without repeat retriggers', () => {
  for (const [code, action] of [
    ['Digit1', 'debugTeleportRoomOne'],
    ['Digit2', 'debugTeleportRoomTwo'],
    ['Digit3', 'debugTeleportRoomThree'],
    ['Digit4', 'debugTeleportRoomFour'],
    ['Digit5', 'debugTeleportRoomFive'],
  ] as const) {
    assertOrphanRepeatIsIgnored(code, action);
  }
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

test('mouse ability actions require pointer lock and preserve press/hold state', () => {
  const { input, hostWindow, hostDocument, pointerLockElement } = createInput();

  const unlockedAim = new Event('mousedown');
  Object.defineProperty(unlockedAim, 'button', { value: 2 });
  hostWindow.dispatchEvent(unlockedAim);
  assert.equal(input.isDown('aimAbility'), false);

  hostDocument.pointerLockElement = pointerLockElement;
  const aimDown = new Event('mousedown');
  Object.defineProperty(aimDown, 'button', { value: 2 });
  hostWindow.dispatchEvent(aimDown);
  assert.equal(input.isDown('aimAbility'), true);
  assert.equal(input.wasPressed('aimAbility'), true);

  const fireDown = new Event('mousedown');
  Object.defineProperty(fireDown, 'button', { value: 0 });
  hostWindow.dispatchEvent(fireDown);
  assert.equal(input.wasPressed('fireAbility'), true);

  input.endFixedUpdate();
  assert.equal(input.isDown('aimAbility'), true);
  assert.equal(input.wasPressed('aimAbility'), false);
  assert.equal(input.wasPressed('fireAbility'), false);

  const aimUp = new Event('mouseup');
  Object.defineProperty(aimUp, 'button', { value: 2 });
  hostWindow.dispatchEvent(aimUp);
  assert.equal(input.isDown('aimAbility'), false);
  assert.equal(input.wasReleased('aimAbility'), true);

  input.dispose();
});

test('context menu prevention is scoped to the game canvas boundary', () => {
  const { input, hostWindow, pointerLockElement } = createInput();
  const canvasContextMenu = new Event('contextmenu', { cancelable: true });
  const windowContextMenu = new Event('contextmenu', { cancelable: true });

  pointerLockElement.dispatchEvent(canvasContextMenu);
  hostWindow.dispatchEvent(windowContextMenu);

  assert.equal(canvasContextMenu.defaultPrevented, true);
  assert.equal(windowContextMenu.defaultPrevented, false);

  input.dispose();
  const afterDispose = new Event('contextmenu', { cancelable: true });
  pointerLockElement.dispatchEvent(afterDispose);
  assert.equal(afterDispose.defaultPrevented, false);
});
