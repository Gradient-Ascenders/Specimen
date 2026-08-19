import assert from 'node:assert/strict';
import test from 'node:test';

import { Input } from '../src/core/Input.ts';

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
