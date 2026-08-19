export type InputAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'debugReset'
  | 'debugTestRecovery';

export type InputBinding =
  | { readonly kind: 'key'; readonly code: string }
  | { readonly kind: 'mouseButton'; readonly button: number };

export type ActionBindings = Readonly<
  Partial<Record<InputAction, readonly InputBinding[]>>
>;

export const DEFAULT_ACTION_BINDINGS = {
  moveForward: [{ kind: 'key', code: 'KeyW' }],
  moveBackward: [{ kind: 'key', code: 'KeyS' }],
  moveLeft: [{ kind: 'key', code: 'KeyA' }],
  moveRight: [{ kind: 'key', code: 'KeyD' }],
  jump: [{ kind: 'key', code: 'Space' }],
  debugReset: [{ kind: 'key', code: 'KeyR' }],
  debugTestRecovery: [{ kind: 'key', code: 'KeyF' }],
} as const satisfies ActionBindings;

export interface InputOptions {
  pointerLockElement: HTMLElement;
  bindings?: ActionBindings;
  document?: Document;
  window?: Window;
}

/**
 * Browser input boundary for gameplay code.
 *
 * Consumers query named actions and never depend on raw KeyboardEvent codes.
 * Transient pressed/released state is valid until `endFixedUpdate()`.
 */
export class Input {
  private readonly pointerLockElement: HTMLElement;
  private readonly hostDocument: Document;
  private readonly hostWindow: Window;

  private readonly keyBindings = new Map<string, InputAction[]>();
  private readonly mouseBindings = new Map<number, InputAction[]>();

  private readonly activeKeys = new Set<string>();
  private readonly activeMouseButtons = new Set<number>();
  private readonly holdCounts = new Map<InputAction, number>();
  private readonly heldActions = new Set<InputAction>();
  private readonly pressedActions = new Set<InputAction>();
  private readonly releasedActions = new Set<InputAction>();

  private pointerMovementX = 0;
  private pointerMovementY = 0;
  private stateClearedSinceFixedUpdate = false;
  private enabledValue = true;
  private disposed = false;

  constructor(options: InputOptions) {
    this.pointerLockElement = options.pointerLockElement;
    this.hostDocument = options.document ?? document;
    this.hostWindow = options.window ?? window;

    this.buildBindingLookup(options.bindings ?? DEFAULT_ACTION_BINDINGS);

    this.hostWindow.addEventListener('keydown', this.onKeyDown);
    this.hostWindow.addEventListener('keyup', this.onKeyUp);
    this.hostWindow.addEventListener('mousedown', this.onMouseDown);
    this.hostWindow.addEventListener('mouseup', this.onMouseUp);
    this.hostWindow.addEventListener('mousemove', this.onMouseMove);
    this.hostWindow.addEventListener('blur', this.onBlur);
    this.hostDocument.addEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    this.pointerLockElement.addEventListener(
      'click',
      this.onPointerLockRequest,
    );
  }

  get pointerLocked(): boolean {
    return this.hostDocument.pointerLockElement === this.pointerLockElement;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get pointerDeltaX(): number {
    return this.pointerMovementX;
  }

  get pointerDeltaY(): number {
    return this.pointerMovementY;
  }

  get held(): ReadonlySet<InputAction> {
    return this.heldActions;
  }

  get wasClearedSinceFixedUpdate(): boolean {
    return this.stateClearedSinceFixedUpdate;
  }

  isDown(action: InputAction): boolean {
    return this.heldActions.has(action);
  }

  wasPressed(action: InputAction): boolean {
    return this.pressedActions.has(action);
  }

  wasReleased(action: InputAction): boolean {
    return this.releasedActions.has(action);
  }

  endFixedUpdate(): void {
    this.pressedActions.clear();
    this.releasedActions.clear();
    this.stateClearedSinceFixedUpdate = false;
    this.endPointerUpdate();
  }

  /** Clear pointer displacement after either simulation or render consumes it. */
  endPointerUpdate(): void {
    this.pointerMovementX = 0;
    this.pointerMovementY = 0;
  }

  requestPointerLock(): void {
    if (!this.enabledValue || this.pointerLocked) return;

    try {
      const request = this.pointerLockElement.requestPointerLock() as
        | void
        | Promise<void>;
      void Promise.resolve(request).catch(() => undefined);
    } catch {
      // Browsers can reject pointer lock when no valid user activation exists.
    }
  }

  releasePointerLock(): void {
    if (!this.pointerLocked) return;

    try {
      const exit = this.hostDocument.exitPointerLock() as void | Promise<void>;
      void Promise.resolve(exit).catch(() => undefined);
    } catch {
      // Pointer lock may already have been released by the browser.
    }
  }

  /** Clear held and transient gameplay input during lifecycle transitions. */
  resetState(): void {
    if (this.disposed) return;
    this.clearState();
  }

  /** Suspend gameplay actions while leaving native focused UI controls usable. */
  setEnabled(enabled: boolean): void {
    if (this.enabledValue === enabled) return;
    this.enabledValue = enabled;
    this.clearState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.hostWindow.removeEventListener('keydown', this.onKeyDown);
    this.hostWindow.removeEventListener('keyup', this.onKeyUp);
    this.hostWindow.removeEventListener('mousedown', this.onMouseDown);
    this.hostWindow.removeEventListener('mouseup', this.onMouseUp);
    this.hostWindow.removeEventListener('mousemove', this.onMouseMove);
    this.hostWindow.removeEventListener('blur', this.onBlur);
    this.hostDocument.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    this.pointerLockElement.removeEventListener(
      'click',
      this.onPointerLockRequest,
    );

    this.clearState();
  }

  private buildBindingLookup(bindings: ActionBindings): void {
    for (const action of Object.keys(bindings) as InputAction[]) {
      for (const binding of bindings[action] ?? []) {
        if (binding.kind === 'key') {
          this.addBinding(this.keyBindings, binding.code, action);
        } else {
          this.addBinding(this.mouseBindings, binding.button, action);
        }
      }
    }
  }

  private addBinding<Key extends string | number>(
    map: Map<Key, InputAction[]>,
    key: Key,
    action: InputAction,
  ): void {
    const actions = map.get(key);
    if (actions) {
      actions.push(action);
    } else {
      map.set(key, [action]);
    }
  }

  private activate(actions: readonly InputAction[]): void {
    for (const action of actions) {
      const previousCount = this.holdCounts.get(action) ?? 0;
      this.holdCounts.set(action, previousCount + 1);

      if (previousCount === 0) {
        this.heldActions.add(action);
        this.pressedActions.add(action);
        this.releasedActions.delete(action);
      }
    }
  }

  private deactivate(actions: readonly InputAction[]): void {
    for (const action of actions) {
      const previousCount = this.holdCounts.get(action) ?? 0;

      if (previousCount <= 1) {
        this.holdCounts.delete(action);

        if (this.heldActions.delete(action)) {
          this.releasedActions.add(action);
        }
      } else {
        this.holdCounts.set(action, previousCount - 1);
      }
    }
  }

  private clearState(): void {
    this.activeKeys.clear();
    this.activeMouseButtons.clear();
    this.holdCounts.clear();
    this.heldActions.clear();
    this.pressedActions.clear();
    this.releasedActions.clear();
    this.pointerMovementX = 0;
    this.pointerMovementY = 0;
    this.stateClearedSinceFixedUpdate = true;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabledValue) return;
    const actions = this.keyBindings.get(event.code);
    if (!actions) return;

    // Mapped game controls belong to the game, not browser UI. In particular,
    // this prevents Space from activating whichever debug button last held
    // focus while the player is trying to charge a jump.
    event.preventDefault();

    // A repeat can arrive after lifecycle/focus cleanup removed the matching
    // initial keydown. Never let that orphan repeat re-establish held input.
    if (event.repeat || this.activeKeys.has(event.code)) return;

    this.activeKeys.add(event.code);
    this.activate(actions);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!this.enabledValue) return;
    const actions = this.keyBindings.get(event.code);
    if (!actions) return;

    event.preventDefault();

    if (!this.activeKeys.delete(event.code)) return;

    this.deactivate(actions);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.enabledValue) return;
    const actions = this.mouseBindings.get(event.button);
    if (!actions || this.activeMouseButtons.has(event.button)) return;

    this.activeMouseButtons.add(event.button);
    this.activate(actions);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (!this.enabledValue) return;
    const actions = this.mouseBindings.get(event.button);
    if (!actions || !this.activeMouseButtons.delete(event.button)) return;

    this.deactivate(actions);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.enabledValue || !this.pointerLocked) return;
    this.pointerMovementX += event.movementX;
    this.pointerMovementY += event.movementY;
  };

  private readonly onBlur = (): void => {
    this.clearState();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.hostDocument.hidden) this.clearState();
  };

  private readonly onPointerLockRequest = (): void => {
    if (!this.enabledValue) return;
    this.requestPointerLock();
  };
}
