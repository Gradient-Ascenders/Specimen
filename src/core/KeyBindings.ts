import { DEFAULT_ACTION_BINDINGS, type ActionBindings, type InputAction } from './Input.ts';

export const KEY_BINDING_ACTIONS = [
  ['moveForward', 'Move forward'], ['moveBackward', 'Move backward'],
  ['moveLeft', 'Move left'], ['moveRight', 'Move right'], ['jump', 'Jump'],
  ['switchSlime', 'Switch specimen'], ['mountDrone', 'Mount drone'],
  ['droneDescend', 'Descend'], ['pause', 'Pause'],
] as const;
export type RebindableAction = (typeof KEY_BINDING_ACTIONS)[number][0];
export type UserKeyBindings = Readonly<Record<RebindableAction, string>>;
export const DEFAULT_USER_KEY_BINDINGS: UserKeyBindings = {
  moveForward: 'KeyW', moveBackward: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD',
  jump: 'Space', switchSlime: 'Tab', mountDrone: 'KeyM', droneDescend: 'ShiftLeft', pause: 'KeyP',
};

export function isBindableKey(code: string): boolean {
  return code !== 'KeyH' && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Enter|Backspace|ShiftLeft|ShiftRight|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Minus|Equal)$/.test(code);
}

export function isUserKeyBindings(value: unknown): value is UserKeyBindings {
  if (!value || typeof value !== 'object') return false;
  const keys = KEY_BINDING_ACTIONS.map(([id]) => (value as Record<string, unknown>)[id]);
  return keys.every(key => typeof key === 'string' && isBindableKey(key)) && new Set(keys).size === keys.length;
}

export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return ({ ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ArrowUp: 'Up', ArrowDown: 'Down',
    ArrowLeft: 'Left', ArrowRight: 'Right', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=' } as Record<string, string>)[code] ?? code;
}

/** Preserve alternate default keys, and keep debug shortcuts off rebound keys. */
export function gameplayBindings(keys: UserKeyBindings): ActionBindings {
  const bindings: Partial<Record<InputAction, readonly import('./Input.ts').InputBinding[]>> = { ...DEFAULT_ACTION_BINDINGS };
  const claimed = new Set(Object.values(keys));
  for (const action of Object.keys(bindings) as InputAction[]) {
    if (action.startsWith('debug')) bindings[action] = bindings[action]?.filter(binding => binding.kind !== 'key' || !claimed.has(binding.code));
  }
  for (const [action] of KEY_BINDING_ACTIONS) {
    if (action === 'pause') continue;
    bindings[action] = keys[action] === DEFAULT_USER_KEY_BINDINGS[action]
      ? DEFAULT_ACTION_BINDINGS[action] : [{ kind: 'key', code: keys[action] }];
  }
  // Shift's alternate side must not also trigger a separately rebound action.
  if (keys.droneDescend === 'ShiftLeft' && claimed.has('ShiftRight')) bindings.droneDescend = [{ kind: 'key', code: 'ShiftLeft' }];
  return bindings;
}
