export type MenuAction = 'previous' | 'next' | 'decrease' | 'increase' | 'activate' | 'back';

export interface MenuGamepad {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export function nextMenuFocusIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return direction > 0 ? 0 : count - 1;
  return (current + direction + count) % count;
}

function gamepadAction(pad: MenuGamepad): MenuAction | undefined {
  const pressed = (index: number) => pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) > 0.6;
  if (pressed(1)) return 'back';
  if (pressed(0)) return 'activate';
  if (pressed(12)) return 'previous';
  if (pressed(13)) return 'next';
  if (pressed(14)) return 'decrease';
  if (pressed(15)) return 'increase';
  const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.6) return undefined;
  return Math.abs(y) >= Math.abs(x) ? y < 0 ? 'previous' : 'next' : x < 0 ? 'decrease' : 'increase';
}

/** Standard-pad menus: dead zone, bounded repeat, and release-to-arm after a menu change. */
export class MenuGamepadNavigation {
  private armed = false;
  private previous: MenuAction | undefined;
  private heldSeconds = 0;
  private nextRepeat = 0.35;

  sample(pad: MenuGamepad | undefined, deltaSeconds: number): MenuAction | undefined {
    if (!pad) { this.reset(); return undefined; }
    const action = gamepadAction(pad);
    if (!this.armed) {
      if (!action) this.armed = true;
      return undefined;
    }
    if (!action) {
      this.previous = undefined;
      this.heldSeconds = 0;
      this.nextRepeat = 0.35;
      return undefined;
    }
    if (action !== this.previous) {
      this.previous = action;
      this.heldSeconds = 0;
      this.nextRepeat = 0.35;
      return action;
    }
    if (action === 'activate' || action === 'back') return undefined;
    this.heldSeconds += Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
    if (this.heldSeconds + 1e-9 < this.nextRepeat) return undefined;
    this.nextRepeat += 0.12;
    return action;
  }

  reset(): void {
    this.armed = false;
    this.previous = undefined;
    this.heldSeconds = 0;
    this.nextRepeat = 0.35;
  }
}
