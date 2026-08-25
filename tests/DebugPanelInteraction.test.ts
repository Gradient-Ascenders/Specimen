import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginDebugPanelInspection,
  finishDebugPanelInspection,
  handleDebugPanelScrollKey,
} from '../src/debug/DebugPanelInteraction.ts';

function createInput(enabled = true, pointerLocked = true) {
  const calls: string[] = [];
  const input = {
    enabled,
    pointerLocked,
    setEnabled(value: boolean) {
      calls.push(`enabled:${value}`);
      this.enabled = value;
    },
    releasePointerLock() {
      calls.push('pointer:release');
      this.pointerLocked = false;
    },
    requestPointerLock() {
      calls.push('pointer:request');
      this.pointerLocked = true;
    },
  };
  return { input, calls };
}

test('debug inspection releases capture only after suspending gameplay input', () => {
  const { input, calls } = createInput();

  const state = beginDebugPanelInspection(input);

  assert.deepEqual(calls, ['enabled:false', 'pointer:release']);
  assert.deepEqual(state, {
    gameplayInputWasEnabled: true,
    pointerWasLocked: true,
  });
});

test('closing debug inspection restores the captured gameplay state', () => {
  const { input, calls } = createInput();
  const state = beginDebugPanelInspection(input);
  calls.length = 0;

  finishDebugPanelInspection(input, state, true);

  assert.deepEqual(calls, ['enabled:true', 'pointer:request']);
});

test('debug inspection does not restore input after another gameplay transition', () => {
  const { input, calls } = createInput();
  const state = beginDebugPanelInspection(input);
  calls.length = 0;

  finishDebugPanelInspection(input, state, false);

  assert.deepEqual(calls, []);
  assert.equal(input.enabled, false);
  assert.equal(input.pointerLocked, false);
});

test('arrow keys scroll an open debug panel and suppress page scrolling', () => {
  const scrollOffsets: number[] = [];
  const element = {
    scrollBy: ({ top }: ScrollToOptions) => scrollOffsets.push(top ?? 0),
  } as HTMLElement;
  const down = new Event('keydown', { cancelable: true });
  Object.defineProperty(down, 'code', { value: 'ArrowDown' });
  const up = new Event('keydown', { cancelable: true });
  Object.defineProperty(up, 'code', { value: 'ArrowUp' });

  assert.equal(
    handleDebugPanelScrollKey(down as KeyboardEvent, element),
    true,
  );
  assert.equal(
    handleDebugPanelScrollKey(up as KeyboardEvent, element),
    true,
  );
  assert.deepEqual(scrollOffsets, [80, -80]);
  assert.equal(down.defaultPrevented, true);
  assert.equal(up.defaultPrevented, true);
});
