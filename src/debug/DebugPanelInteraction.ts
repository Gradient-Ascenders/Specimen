import type { Input } from '../core/Input.ts';

type DebugPanelInput = Pick<
  Input,
  | 'enabled'
  | 'pointerLocked'
  | 'setEnabled'
  | 'requestPointerLock'
  | 'releasePointerLock'
>;

export interface DebugPanelInspectionState {
  readonly gameplayInputWasEnabled: boolean;
  readonly pointerWasLocked: boolean;
}

const ARROW_SCROLL_DISTANCE_PX = 80;

/** Suspend captured gameplay input before exposing an interactive debug panel. */
export function beginDebugPanelInspection(
  input: DebugPanelInput,
): DebugPanelInspectionState {
  const state = {
    gameplayInputWasEnabled: input.enabled,
    pointerWasLocked: input.pointerLocked,
  };
  input.setEnabled(false);
  input.releasePointerLock();
  return state;
}

/** Restore only the input state that the panel itself suspended. */
export function finishDebugPanelInspection(
  input: DebugPanelInput,
  state: DebugPanelInspectionState,
  restoreGameplayInput: boolean,
): void {
  if (!restoreGameplayInput || !state.gameplayInputWasEnabled) return;
  input.setEnabled(true);
  if (state.pointerWasLocked) input.requestPointerLock();
}

/** Give the open diagnostics panel predictable keyboard scrolling. */
export function handleDebugPanelScrollKey(
  event: KeyboardEvent,
  element: HTMLElement,
): boolean {
  if (event.code !== 'ArrowUp' && event.code !== 'ArrowDown') return false;
  event.preventDefault();
  element.scrollBy({
    top: event.code === 'ArrowDown'
      ? ARROW_SCROLL_DISTANCE_PX
      : -ARROW_SCROLL_DISTANCE_PX,
    behavior: 'auto',
  });
  return true;
}
