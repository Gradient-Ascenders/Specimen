import type { GameFlowState, GameFlowStateListener } from './GameFlowUI.ts';

interface GameplayFlow {
  readonly state: GameFlowState;
  subscribe(listener: GameFlowStateListener): () => void;
}

export interface CleanGameplayModeOptions {
  readonly host: HTMLElement;
  readonly flow: GameplayFlow;
  readonly window?: Window;
  /** Release only input capture owned by an open diagnostics panel. */
  readonly prepareGameplay: () => void;
  readonly present: (clean: boolean) => void;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest?.(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      ),
  );
}

/** Session preference; presentation is suspended for menus, never gameplay. */
export class CleanGameplayMode {
  private readonly options: CleanGameplayModeOptions;
  private readonly hostWindow: Window;
  private readonly unsubscribe: () => void;
  private enabled = false;
  private disposed = false;

  constructor(options: CleanGameplayModeOptions) {
    this.options = options;
    this.hostWindow = options.window ?? window;
    this.unsubscribe = options.flow.subscribe(this.sync);
    this.hostWindow.addEventListener('keydown', this.onKeyDown);
  }

  private readonly sync = (): void => {
    const active = this.enabled && this.options.flow.state === 'playing';
    if (active) this.options.host.dataset.cleanGameplay = 'true';
    else delete this.options.host.dataset.cleanGameplay;
    this.options.present(active);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code !== 'F1' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      isEditableTarget(event.target) ||
      isEditableTarget(this.options.host.ownerDocument.activeElement)
    )
      return;
    // Reserve help even in menus; the guards below control only the toggle.
    event.preventDefault();
    if (
      event.repeat ||
      this.options.flow.state !== 'playing' ||
      this.options.host.dataset.gameState !== 'playing' ||
      this.options.host.querySelector(
        '[data-clean-gameplay-essential]:not([hidden])',
      )
    )
      return;
    this.enabled = !this.enabled;
    if (this.enabled) this.options.prepareGameplay();
    this.sync();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hostWindow.removeEventListener('keydown', this.onKeyDown);
    this.unsubscribe();
    delete this.options.host.dataset.cleanGameplay;
    this.options.present(false);
  }
}
