import type {
  GameSettings,
  GameSettingsSnapshot,
} from './GameSettings.ts';
import {
  MAX_FOLLOW_DISTANCE_METRES,
  MIN_FOLLOW_DISTANCE_METRES,
} from '../render/CameraRig.ts';

export type GameFlowState =
  | 'loading'
  | 'title'
  | 'playing'
  | 'paused'
  | 'settings'
  | 'credits'
  | 'restarting';

type MenuReturnState = 'title' | 'paused';
export type GameFlowStateListener = (state: GameFlowState) => void;

/** Pure transition model: exactly one full-screen surface can own the UI. */
export class GameFlowStateModel {
  private currentState: GameFlowState = 'loading';
  private menuReturnState: MenuReturnState = 'title';
  private readonly stateListeners = new Set<GameFlowStateListener>();
  private readonly restartAvailable: boolean;

  constructor(restartAvailable = true) {
    this.restartAvailable = restartAvailable;
  }

  get state(): GameFlowState {
    return this.currentState;
  }

  subscribe(listener: GameFlowStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => this.stateListeners.delete(listener);
  }

  dispose(): void {
    this.stateListeners.clear();
  }

  completeBoot(): boolean {
    return this.transitionFrom('loading', 'title');
  }

  start(): boolean {
    return this.transitionFrom('title', 'playing');
  }

  pause(): boolean {
    return this.transitionFrom('playing', 'paused');
  }

  resume(): boolean {
    return this.transitionFrom('paused', 'playing');
  }

  openSettings(): boolean {
    return this.openSubmenu('settings');
  }

  openCredits(): boolean {
    return this.openSubmenu('credits');
  }

  back(): boolean {
    if (this.currentState !== 'settings' && this.currentState !== 'credits') {
      return false;
    }
    this.setState(this.menuReturnState);
    return true;
  }

  beginRestart(): boolean {
    if (!this.restartAvailable) return false;
    return this.transitionFrom('paused', 'restarting');
  }

  finishRestart(): boolean {
    return this.transitionFrom('restarting', 'paused');
  }

  private openSubmenu(state: 'settings' | 'credits'): boolean {
    if (this.currentState !== 'title' && this.currentState !== 'paused') {
      return false;
    }
    this.menuReturnState = this.currentState;
    this.setState(state);
    return true;
  }

  private transitionFrom(
    expected: GameFlowState,
    next: GameFlowState,
  ): boolean {
    if (this.currentState !== expected) return false;
    this.setState(next);
    return true;
  }

  private setState(next: GameFlowState): void {
    this.currentState = next;
    for (const listener of this.stateListeners) listener(next);
  }
}

export interface GameFlowActions {
  readonly restartAvailable: boolean;
  setGameplayInputEnabled(enabled: boolean): void;
  requestPointerLock(): void;
  releasePointerLock(): void;
  isPointerLocked(): boolean;
  restartLevel(): void | Promise<void>;
  applySettings(settings: Readonly<GameSettingsSnapshot>): void;
}

export interface GameFlowUIOptions {
  actions: GameFlowActions;
  settings: GameSettings;
  creditsMarkdown: string;
  document?: Document;
  window?: Window;
}

const FULL_SCREEN_STATES = new Set<GameFlowState>([
  'loading',
  'title',
  'paused',
  'settings',
  'credits',
  'restarting',
]);

export class GameFlowUI {
  readonly element: HTMLElement;

  private readonly model: GameFlowStateModel;
  private readonly actions: GameFlowActions;
  private readonly settings: GameSettings;
  private readonly hostDocument: Document;
  private readonly hostWindow: Window;
  private readonly listeners = new AbortController();
  private readonly panels = new Map<GameFlowState, HTMLElement>();
  private readonly focusTargets = new Map<GameFlowState, HTMLElement>();
  private readonly restartStatus: HTMLElement;
  private readonly sensitivityInput: HTMLInputElement;
  private readonly sensitivityOutput: HTMLOutputElement;
  private readonly invertVerticalInput: HTMLInputElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly volumeOutput: HTMLOutputElement;
  private readonly cameraDistanceInput: HTMLInputElement;
  private readonly cameraDistanceOutput: HTMLOutputElement;
  private readonly unsubscribeSettings: () => void;
  private restartPending = false;
  private disposed = false;

  constructor(options: GameFlowUIOptions) {
    this.actions = options.actions;
    this.model = new GameFlowStateModel(options.actions.restartAvailable);
    this.settings = options.settings;
    this.hostDocument = options.document ?? document;
    this.hostWindow = options.window ?? window;
    this.element = this.createElement(
      options.creditsMarkdown,
      options.actions.restartAvailable,
    );

    this.restartStatus = this.requireElement('[data-restart-status]');
    this.sensitivityInput = this.requireElement<HTMLInputElement>(
      '[data-setting="sensitivity"]',
    );
    this.sensitivityOutput = this.requireElement<HTMLOutputElement>(
      '[data-setting-output="sensitivity"]',
    );
    this.invertVerticalInput = this.requireElement<HTMLInputElement>(
      '[data-setting="invert-vertical"]',
    );
    this.volumeInput = this.requireElement<HTMLInputElement>(
      '[data-setting="volume"]',
    );
    this.volumeOutput = this.requireElement<HTMLOutputElement>(
      '[data-setting-output="volume"]',
    );
    this.cameraDistanceInput = this.requireElement<HTMLInputElement>(
      '[data-setting="camera-distance"]',
    );
    this.cameraDistanceOutput = this.requireElement<HTMLOutputElement>(
      '[data-setting-output="camera-distance"]',
    );

    for (const panel of this.element.querySelectorAll<HTMLElement>(
      '[data-flow-panel]',
    )) {
      const state = panel.dataset.flowPanel as GameFlowState;
      this.panels.set(state, panel);
      const focusTarget = panel.querySelector<HTMLElement>('[data-autofocus]');
      if (focusTarget) this.focusTargets.set(state, focusTarget);
    }

    this.bindActions();
    this.unsubscribeSettings = this.settings.subscribe(
      this.onSettingsChanged,
    );
    this.syncState();
  }

  get state(): GameFlowState {
    return this.model.state;
  }

  get gameplayActive(): boolean {
    return this.model.state === 'playing';
  }

  completeBoot(): void {
    if (!this.model.completeBoot()) return;
    this.syncState();
  }

  subscribe(listener: GameFlowStateListener): () => void {
    return this.model.subscribe(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.unsubscribeSettings();
    this.model.dispose();
    this.actions.setGameplayInputEnabled(false);
    this.actions.releasePointerLock();
    this.element.remove();
  }

  private createElement(
    creditsMarkdown: string,
    restartAvailable: boolean,
  ): HTMLElement {
    const root = this.hostDocument.createElement('div');
    root.className = 'game-flow';
    root.innerHTML = `
      <section class="flow-screen loading-screen" data-flow-panel="loading" aria-labelledby="loading-title">
        <div class="loading-mark" aria-hidden="true"></div>
        <p class="flow-eyebrow">Containment runtime</p>
        <h1 id="loading-title">Preparing containment…</h1>
        <p role="status" aria-live="polite">Calibrating the specimen environment.</p>
      </section>

      <section class="flow-screen" data-flow-panel="title" aria-labelledby="title-heading" hidden>
        <div class="flow-card title-card">
          <p class="flow-eyebrow">Containment trial 01</p>
          <h1 id="title-heading">Specimen</h1>
          <p class="flow-lede">Adapt. Traverse. Escape the grey-box containment route.</p>
          <div class="flow-actions">
            <button class="primary-action" data-action="start" data-autofocus>Start trial</button>
            <button data-action="settings">Settings</button>
            <button data-action="credits">Credits</button>
          </div>
        </div>
      </section>

      <aside class="game-hud" data-flow-panel="playing" aria-label="Gameplay guidance" hidden>
        <div>
          <p class="flow-eyebrow">Current objective</p>
          <p class="hud-objective">Reach the elevated containment route.</p>
        </div>
        <p class="hud-hint"><kbd>WASD</kbd> Move <span>·</span> <kbd>Space</kbd> Charge jump <span>·</span> <kbd>Esc</kbd> Pause</p>
      </aside>

      <section class="flow-screen" data-flow-panel="paused" aria-labelledby="pause-heading" hidden>
        <div class="flow-card">
          <p class="flow-eyebrow">Trial suspended</p>
          <h1 id="pause-heading">Paused</h1>
          <div class="flow-actions">
            <button class="primary-action" data-action="resume" data-autofocus>Resume</button>
            <button data-action="restart" ${restartAvailable ? '' : 'disabled'}>Restart trial</button>
            <button data-action="settings">Settings</button>
            <button data-action="credits">Credits</button>
          </div>
          <p class="flow-status" data-restart-status role="status" aria-live="polite">${restartAvailable ? '' : 'Restart is not available in this build yet.'}</p>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="settings" aria-labelledby="settings-heading" hidden>
        <div class="flow-card settings-card">
          <p class="flow-eyebrow">Session configuration</p>
          <h1 id="settings-heading">Settings</h1>
          <div class="setting-row">
            <label for="mouse-sensitivity">Mouse sensitivity</label>
            <div class="range-control">
              <input id="mouse-sensitivity" data-setting="sensitivity" type="range" min="0.5" max="2" step="0.1">
              <output for="mouse-sensitivity" data-setting-output="sensitivity"></output>
            </div>
          </div>
          <label class="setting-row checkbox-row" for="invert-vertical">
            <span>Invert vertical look</span>
            <input id="invert-vertical" data-setting="invert-vertical" type="checkbox">
          </label>
          <div class="setting-row">
            <label for="camera-distance">Camera distance</label>
            <div class="range-control">
              <input id="camera-distance" data-setting="camera-distance" type="range" min="${MIN_FOLLOW_DISTANCE_METRES}" max="${MAX_FOLLOW_DISTANCE_METRES}" step="0.1">
              <output for="camera-distance" data-setting-output="camera-distance"></output>
            </div>
          </div>
          <div class="setting-row">
            <label for="master-volume">Master volume</label>
            <div class="range-control">
              <input id="master-volume" data-setting="volume" type="range" min="0" max="100" step="5">
              <output for="master-volume" data-setting-output="volume"></output>
            </div>
            <p class="setting-note">Stored for this session. Audio playback is not yet connected.</p>
          </div>
          <button data-action="back" data-autofocus>Back</button>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="credits" aria-labelledby="credits-heading" hidden>
        <div class="flow-card credits-card">
          <p class="flow-eyebrow">Canonical project ledger</p>
          <h1 id="credits-heading">Credits</h1>
          <p class="flow-lede">This view is sourced directly from <code>CREDITS.md</code> at build time.</p>
          <pre class="credits-ledger"></pre>
          <button data-action="back" data-autofocus>Back</button>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="restarting" aria-labelledby="restarting-heading" hidden>
        <div class="flow-card restart-card">
          <div class="loading-mark" aria-hidden="true"></div>
          <p class="flow-eyebrow">Containment runtime</p>
          <h1 id="restarting-heading">Restarting trial…</h1>
          <p role="status" aria-live="polite">Restoring the authored level state.</p>
        </div>
      </section>
    `;

    const ledger = root.querySelector<HTMLElement>('.credits-ledger');
    if (!ledger) throw new Error('Missing credits ledger element.');
    ledger.textContent = creditsMarkdown.trim();
    return root;
  }

  private bindActions(): void {
    const signal = this.listeners.signal;
    this.element.addEventListener('click', this.onClick, { signal });
    this.sensitivityInput.addEventListener('input', this.onSensitivityInput, {
      signal,
    });
    this.invertVerticalInput.addEventListener(
      'change',
      this.onInvertVerticalChange,
      { signal },
    );
    this.volumeInput.addEventListener('input', this.onVolumeInput, { signal });
    this.cameraDistanceInput.addEventListener(
      'input',
      this.onCameraDistanceInput,
      { signal },
    );
    this.hostWindow.addEventListener('keydown', this.onKeyDown, { signal });
    this.hostWindow.addEventListener('blur', this.onWindowBlur, { signal });
    this.hostDocument.addEventListener(
      'pointerlockchange',
      this.onPointerLockChange,
      { signal },
    );
  }

  private syncState(): void {
    const state = this.model.state;
    this.element.dataset.state = state;
    for (const [panelState, panel] of this.panels) {
      panel.hidden = panelState !== state;
    }

    const gameplayActive = state === 'playing';
    this.actions.setGameplayInputEnabled(gameplayActive);
    if (FULL_SCREEN_STATES.has(state)) this.actions.releasePointerLock();

    const focusTarget = this.focusTargets.get(state);
    if (focusTarget) queueMicrotask(() => focusTarget.focus());
  }

  private pause(): void {
    if (!this.model.pause()) return;
    this.syncState();
  }

  private resume(): void {
    if (!this.model.resume()) return;
    this.syncState();
    this.actions.requestPointerLock();
  }

  private async restart(): Promise<void> {
    if (this.restartPending || !this.model.beginRestart()) return;
    this.restartPending = true;
    this.restartStatus.textContent = '';
    this.syncState();

    let statusText: string;
    try {
      await this.actions.restartLevel();
      statusText = 'Trial restored. Choose Resume to return to gameplay.';
    } catch {
      statusText = 'The trial could not be restarted.';
    }

    this.restartPending = false;
    if (this.disposed) return;

    this.restartStatus.textContent = statusText;
    this.model.finishRestart();
    this.syncState();
  }

  private requireElement<ElementType extends HTMLElement = HTMLElement>(
    selector: string,
  ): ElementType {
    const element = this.element.querySelector<ElementType>(selector);
    if (!element) throw new Error(`Missing GameFlowUI element: ${selector}`);
    return element;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!target) return;

    switch (target.dataset.action) {
      case 'start':
        if (this.model.start()) {
          this.syncState();
          this.actions.requestPointerLock();
        }
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        void this.restart();
        break;
      case 'settings':
        if (this.model.openSettings()) this.syncState();
        break;
      case 'credits':
        if (this.model.openCredits()) this.syncState();
        break;
      case 'back':
        if (this.model.back()) this.syncState();
        break;
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' || event.repeat) return;
    if (this.model.state === 'playing') {
      event.preventDefault();
      this.pause();
    } else if (this.model.state === 'paused') {
      event.preventDefault();
      this.resume();
    } else if (
      this.model.state === 'settings' ||
      this.model.state === 'credits'
    ) {
      event.preventDefault();
      if (this.model.back()) this.syncState();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.pause();
  };

  private readonly onPointerLockChange = (): void => {
    if (this.model.state === 'playing' && !this.actions.isPointerLocked()) {
      this.pause();
    }
  };

  private readonly onSensitivityInput = (): void => {
    this.settings.setMouseSensitivity(this.sensitivityInput.valueAsNumber);
  };

  private readonly onInvertVerticalChange = (): void => {
    this.settings.setInvertVerticalLook(this.invertVerticalInput.checked);
  };

  private readonly onVolumeInput = (): void => {
    this.settings.setMasterVolume(this.volumeInput.valueAsNumber / 100);
  };

  private readonly onCameraDistanceInput = (): void => {
    this.settings.setCameraDistanceMetres(
      this.cameraDistanceInput.valueAsNumber,
    );
  };

  private readonly onSettingsChanged = (
    settings: Readonly<GameSettingsSnapshot>,
  ): void => {
    this.sensitivityInput.value = settings.mouseSensitivity.toFixed(1);
    this.sensitivityOutput.value = `${settings.mouseSensitivity.toFixed(1)}×`;
    this.invertVerticalInput.checked = settings.invertVerticalLook;
    this.volumeInput.value = String(Math.round(settings.masterVolume * 100));
    this.volumeOutput.value = `${Math.round(settings.masterVolume * 100)}%`;
    this.cameraDistanceInput.value = settings.cameraDistanceMetres.toFixed(1);
    this.cameraDistanceOutput.value =
      `${settings.cameraDistanceMetres.toFixed(1)} m`;
    this.actions.applySettings(settings);
  };
}
