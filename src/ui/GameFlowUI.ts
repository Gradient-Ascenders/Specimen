import type {
  GameSettings,
  GameSettingsSnapshot,
} from './GameSettings.ts';
import {
  MAX_FOLLOW_DISTANCE_METRES,
  MIN_FOLLOW_DISTANCE_METRES,
} from '../render/CameraRig.ts';
import type { SlimeHUDSnapshot } from '../slimes/SlimeHUDState.ts';
import {
  formatPassiveInteractionStatus,
  getSlimeRosterEntryView,
  SlimeSwitchFeedbackModel,
} from './SlimeRosterView.ts';
import {
  createBrandMarkMarkup,
  createBrandedScannerMarkup,
} from './Branding.ts';

export type GameFlowState =
  | 'loading'
  | 'title'
  | 'playing'
  | 'paused'
  | 'settings'
  | 'credits'
  | 'restarting'
  | 'transitioning'
  | 'transitionFailed';

type MenuReturnState = 'title' | 'paused';
export type GameFlowStateListener = (state: GameFlowState) => void;

export const gameFlowCanPause = (
  state: GameFlowState,
  gameplayInputEnabled: boolean,
): boolean => state === 'playing' && gameplayInputEnabled;

export type GameFlowKeyboardAction = 'pause' | 'resume' | 'back';

export const getGameFlowKeyboardAction = (
  code: string,
  state: GameFlowState,
): GameFlowKeyboardAction | null => {
  if (code === 'KeyP' && state === 'playing') return 'pause';
  if (code === 'KeyP' && state === 'paused') return 'resume';
  if (code === 'Escape' && (state === 'settings' || state === 'credits')) {
    return 'back';
  }
  return null;
};

const creditsInlineText = (value: string): string =>
  value
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

const appendCreditsLedger = (
  ledger: HTMLElement,
  creditsMarkdown: string,
): void => {
  const lines = creditsMarkdown.trim().split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line || line === '# Credits') continue;

    if (line.startsWith('## ')) {
      const heading = ledger.ownerDocument.createElement('h2');
      heading.textContent = line.slice(3);
      ledger.append(heading);
      continue;
    }

    if (
      line.startsWith('|') &&
      /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[index + 1]?.trim() ?? '')
    ) {
      const headers = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      index += 2;

      const entries = ledger.ownerDocument.createElement('div');
      entries.className = 'credits-entries';
      while (index < lines.length && lines[index]?.trim().startsWith('|')) {
        const values = (lines[index] ?? '')
          .trim()
          .slice(1, -1)
          .split('|')
          .map(creditsInlineText);
        const entry = ledger.ownerDocument.createElement('article');
        entry.className = 'credits-entry';

        const title = ledger.ownerDocument.createElement('h3');
        title.textContent = values[0] ?? '';
        entry.append(title);

        const details = ledger.ownerDocument.createElement('dl');
        for (let cellIndex = 1; cellIndex < headers.length; cellIndex += 1) {
          const detail = ledger.ownerDocument.createElement('div');
          const term = ledger.ownerDocument.createElement('dt');
          const description = ledger.ownerDocument.createElement('dd');
          term.textContent = headers[cellIndex] ?? '';
          description.textContent = values[cellIndex] ?? '';
          detail.append(term, description);
          details.append(detail);
        }
        entry.append(details);
        entries.append(entry);
        index += 1;
      }
      ledger.append(entries);
      index -= 1;
      continue;
    }

    const paragraphLines = [line];
    while (
      index + 1 < lines.length &&
      lines[index + 1]?.trim() &&
      !lines[index + 1]?.trim().startsWith('#') &&
      !lines[index + 1]?.trim().startsWith('|')
    ) {
      index += 1;
      paragraphLines.push(lines[index]?.trim() ?? '');
    }
    const paragraph = ledger.ownerDocument.createElement('p');
    paragraph.textContent = creditsInlineText(paragraphLines.join(' '));
    ledger.append(paragraph);
  }
};

/** Pure transition model: exactly one full-screen surface can own the UI. */
export class GameFlowStateModel {
  private currentState: GameFlowState = 'loading';
  private menuReturnState: MenuReturnState = 'title';
  private readonly stateListeners = new Set<GameFlowStateListener>();

  get state(): GameFlowState {
    return this.currentState;
  }

  get menuOrigin(): MenuReturnState {
    return this.menuReturnState;
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
    return this.transitionFrom('paused', 'restarting');
  }

  finishRestart(): boolean {
    return this.transitionFrom('restarting', 'playing');
  }

  beginLevelTransition(): boolean {
    return this.transitionFrom('playing', 'transitioning');
  }

  finishLevelTransition(): boolean {
    return this.transitionFrom('transitioning', 'playing');
  }

  failLevelTransition(): boolean {
    return this.transitionFrom('transitioning', 'transitionFailed');
  }

  cancelRestart(): boolean {
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
  startGameplay(): void;
  stopGameplay(): void;
  setGameplayInputEnabled(enabled: boolean): void;
  setDebugInteractionEnabled(enabled: boolean): void;
  requestPointerLock(): void;
  releasePointerLock(): void;
  isPointerLocked(): boolean;
  isGameplayInputEnabled(): boolean;
  restartLevel(): void;
  applySettings(settings: Readonly<GameSettingsSnapshot>): void;
}

export interface SlimeHUDSource {
  subscribeSlimeHUD(listener: (snapshot: SlimeHUDSnapshot) => void): () => void;
}

export interface GameFlowUIOptions {
  actions: GameFlowActions;
  settings: GameSettings;
  creditsMarkdown: string;
  slimeHUD?: SlimeHUDSource;
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
  'transitioning',
  'transitionFailed',
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
  private readonly objective: HTMLElement;
  private readonly sensitivityInput: HTMLInputElement;
  private readonly sensitivityOutput: HTMLOutputElement;
  private readonly invertVerticalInput: HTMLInputElement;
  private readonly invertVerticalOutput: HTMLOutputElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly volumeOutput: HTMLOutputElement;
  private readonly cameraDistanceInput: HTMLInputElement;
  private readonly cameraDistanceOutput: HTMLOutputElement;
  private readonly slimeRoster: HTMLElement;
  private readonly passiveStatus: HTMLElement;
  private readonly switchFeedback: HTMLElement;
  private readonly transitionMessage: HTMLElement;
  private readonly transitionFailureMessage: HTMLElement;
  private readonly transitionContinueButton: HTMLButtonElement;
  private readonly unsubscribeSettings: () => void;
  private readonly unsubscribeSlimeHUD: () => void;
  private readonly switchFeedbackModel = new SlimeSwitchFeedbackModel();
  private restartPending = false;
  private disposed = false;

  constructor(options: GameFlowUIOptions) {
    this.actions = options.actions;
    this.model = new GameFlowStateModel();
    this.settings = options.settings;
    this.hostDocument = options.document ?? document;
    this.hostWindow = options.window ?? window;
    this.element = this.createElement(options.creditsMarkdown);

    this.restartStatus = this.requireElement('[data-restart-status]');
    this.objective = this.requireElement('[data-current-objective]');
    this.sensitivityInput = this.requireElement<HTMLInputElement>(
      '[data-setting="sensitivity"]',
    );
    this.sensitivityOutput = this.requireElement<HTMLOutputElement>(
      '[data-setting-output="sensitivity"]',
    );
    this.invertVerticalInput = this.requireElement<HTMLInputElement>(
      '[data-setting="invert-vertical"]',
    );
    this.invertVerticalOutput = this.requireElement<HTMLOutputElement>(
      '[data-setting-output="invert-vertical"]',
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
    this.slimeRoster = this.requireElement('[data-slime-roster]');
    this.passiveStatus = this.requireElement('[data-passive-status]');
    this.switchFeedback = this.requireElement('[data-switch-feedback]');
    this.transitionMessage = this.requireElement('[data-transition-message]');
    this.transitionFailureMessage = this.requireElement(
      '[data-transition-failure-message]',
    );
    this.transitionContinueButton = this.requireElement<HTMLButtonElement>(
      '[data-action="enter-level-two"]',
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
    this.unsubscribeSlimeHUD =
      options.slimeHUD?.subscribeSlimeHUD(this.onSlimeHUDChanged) ?? (() => {});
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

  setObjective(objective: string): void {
    const nextObjective = objective.trim();
    if (!nextObjective) throw new Error('Gameplay objectives cannot be empty.');
    this.objective.textContent = nextObjective;
  }

  beginLevelTransition(message: string): void {
    if (!this.model.beginLevelTransition()) return;
    this.transitionMessage.textContent = message;
    this.transitionContinueButton.hidden = true;
    this.switchFeedbackModel.clear();
    this.switchFeedback.textContent = '';
    this.syncState();
  }

  finishLevelTransition(): void {
    if (this.model.state !== 'transitioning') return;
    this.transitionMessage.textContent = 'Level 2 ready';
    this.transitionContinueButton.hidden = false;
    this.transitionContinueButton.focus();
  }

  failLevelTransition(message: string): void {
    if (!this.model.failLevelTransition()) return;
    this.transitionFailureMessage.textContent = message;
    this.syncState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.unsubscribeSettings();
    this.unsubscribeSlimeHUD();
    this.model.dispose();
    if (this.gameplayActive) this.actions.stopGameplay();
    this.actions.setGameplayInputEnabled(false);
    this.actions.setDebugInteractionEnabled(false);
    this.actions.releasePointerLock();
    this.element.remove();
  }

  private createElement(creditsMarkdown: string): HTMLElement {
    const root = this.hostDocument.createElement('div');
    root.className = 'game-flow';
    root.innerHTML = `
      <section class="flow-screen loading-screen" data-flow-panel="loading" aria-labelledby="loading-title">
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <p class="system-label">Containment runtime · 01</p>
          <h1 id="loading-title">Calibrating specimen</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" role="status" aria-live="polite">Preparing the containment environment.</p>
        </div>
      </section>

      <section class="flow-screen title-screen" data-flow-panel="title" aria-labelledby="title-heading" hidden>
        <div class="title-composition">
          <header class="title-branding">
            ${createBrandMarkMarkup('detailed', 'title-brand-mark')}
            <div>
              <p class="flow-eyebrow">Containment · Trial 01</p>
              <h1 id="title-heading">Specimen</h1>
            </div>
          </header>
          <p class="title-tagline">Explore <span>·</span> Adapt <span>·</span> Transcend</p>
          <div class="flow-actions game-menu title-actions">
            <button class="primary-action menu-action" data-action="start" data-autofocus>
              <span class="menu-index" aria-hidden="true">01</span>
              <span>Start trial</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action" data-action="settings">
              <span class="menu-index" aria-hidden="true">02</span>
              <span>Settings</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action" data-action="credits">
              <span class="menu-index" aria-hidden="true">03</span>
              <span>Credits</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
          </div>
          <div class="signal-rule title-signal" aria-hidden="true"><span></span></div>
        </div>
      </section>

      <aside class="game-hud" data-flow-panel="playing" aria-label="Gameplay guidance" hidden>
        <section class="hud-objective-module" aria-labelledby="hud-objective-heading">
          <p class="system-label" id="hud-objective-heading">Current objective</p>
          <div class="hud-objective-line">
            <span aria-hidden="true">01</span>
            <p class="hud-objective" data-current-objective role="status" aria-live="polite">Climb through the vent</p>
          </div>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
        </section>
        <section class="hud-roster" aria-labelledby="hud-roster-heading">
          <header class="hud-roster-header">
            <p class="system-label" id="hud-roster-heading">Specimen array</p>
            <span aria-hidden="true">LINK / STABLE</span>
          </header>
          <ul class="hud-roster-list" data-slime-roster aria-label="Unlocked playable slimes"></ul>
          <p class="system-status hud-passive-status" data-passive-status role="status" aria-live="polite" hidden></p>
          <p class="system-status hud-switch-feedback" data-switch-feedback role="status" aria-live="polite"></p>
        </section>
        <p class="hud-hint"><span><kbd>WASD</kbd> Move</span><span><kbd>Space</kbd> Jump</span><span><kbd>Tab</kbd> Switch</span><span><kbd>P</kbd> Pause</span></p>
      </aside>

      <section class="flow-screen pause-screen" data-flow-panel="paused" aria-labelledby="pause-heading" hidden>
        <div class="pause-rail">
          <header class="pause-heading">
            ${createBrandMarkMarkup('simple', 'pause-brand-mark')}
            <div>
              <p class="flow-eyebrow">Trial suspended</p>
              <h1 id="pause-heading">Paused</h1>
            </div>
          </header>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <div class="flow-actions game-menu pause-actions">
            <button class="primary-action menu-action" data-action="resume" data-autofocus>
              <span>Resume</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action pause-restart" data-action="restart">
              <span>Restart trial</span>
              <span class="menu-arrow" aria-hidden="true">↻</span>
            </button>
            <button class="menu-action" data-action="settings">
              <span>Settings</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action" data-action="credits">
              <span>Credits</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
          </div>
          <p class="system-status" data-restart-status role="status" aria-live="polite"></p>
          <p class="pause-hint" aria-hidden="true"><kbd>P</kbd> Resume</p>
        </div>
      </section>

      <section class="flow-screen submenu-screen settings-screen" data-flow-panel="settings" aria-labelledby="settings-heading" hidden>
        <div class="system-panel settings-panel">
          <header class="system-panel-header">
            <span class="signal-bar" aria-hidden="true"></span>
            <div>
              <p class="system-label">Session configuration</p>
              <h1 id="settings-heading">Settings</h1>
            </div>
          </header>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="mouse-sensitivity">Mouse sensitivity</label>
              <output for="mouse-sensitivity" data-setting-output="sensitivity"></output>
            </div>
            <input id="mouse-sensitivity" data-setting="sensitivity" type="range" min="0.5" max="2" step="0.1">
          </div>
          <label class="setting-row setting-toggle-row" for="invert-vertical">
            <span class="setting-heading">
              <span>Invert vertical look</span>
              <output data-setting-output="invert-vertical"></output>
            </span>
            <input id="invert-vertical" data-setting="invert-vertical" type="checkbox">
          </label>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="camera-distance">Camera distance</label>
              <output for="camera-distance" data-setting-output="camera-distance"></output>
            </div>
            <input id="camera-distance" data-setting="camera-distance" type="range" min="${MIN_FOLLOW_DISTANCE_METRES}" max="${MAX_FOLLOW_DISTANCE_METRES}" step="0.1">
          </div>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="master-volume">Master volume</label>
              <output for="master-volume" data-setting-output="volume"></output>
            </div>
            <input id="master-volume" data-setting="volume" type="range" min="0" max="100" step="5">
            <p class="setting-note">Stored for this session. Audio output is not yet connected.</p>
          </div>
          <button class="system-action system-back" data-action="back" data-autofocus>
            <span aria-hidden="true">←</span><span>Back</span>
          </button>
        </div>
      </section>

      <section class="flow-screen submenu-screen credits-screen" data-flow-panel="credits" aria-labelledby="credits-heading" hidden>
        <div class="system-panel credits-panel">
          <header class="system-panel-header credits-header">
            ${createBrandMarkMarkup('detailed', 'credits-brand-mark')}
            <div>
              <p class="system-label">Project ledger</p>
              <h1 id="credits-heading">Credits</h1>
              <p class="system-copy">Specimen / Development record</p>
            </div>
          </header>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <div class="credits-ledger" aria-label="Credits ledger"></div>
          <button class="system-action system-back" data-action="back" data-autofocus>
            <span aria-hidden="true">←</span><span>Back</span>
          </button>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="restarting" aria-labelledby="restarting-heading" hidden>
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <p class="system-label">Containment runtime · 01</p>
          <h1 id="restarting-heading">Reconstituting specimen</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" role="status" aria-live="polite">Restoring the trial state.</p>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="transitioning" aria-labelledby="transition-heading" hidden>
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <p class="system-label">Cultivation runtime · 02</p>
          <h1 id="transition-heading" data-transition-message>Entering Level 2…</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" role="status" aria-live="polite">Transferring the specimen pair.</p>
          <button class="system-action primary-action transition-action" type="button" data-action="enter-level-two" hidden>
            <span>Enter Level 2</span><span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section class="flow-screen transition-failed-screen" data-flow-panel="transitionFailed" aria-labelledby="transition-failed-heading" hidden>
        <div class="system-state system-state--failure">
          ${createBrandMarkMarkup('simple', 'failure-brand-mark')}
          <p class="system-label">Runtime signal interrupted</p>
          <h1 id="transition-failed-heading">Transition failed</h1>
          <div class="signal-rule signal-rule--warning" aria-hidden="true"><span></span></div>
          <p class="system-status" data-transition-failure-message role="alert">The next containment sector could not be initialized.</p>
          <p class="system-copy">Reload to retry the transfer.</p>
        </div>
      </section>
    `;

    const ledger = root.querySelector<HTMLElement>('.credits-ledger');
    if (!ledger) throw new Error('Missing credits ledger element.');
    // Parse only the ledger's deliberately small Markdown subset and assign all
    // player-facing values through textContent. CREDITS.md remains canonical;
    // no source text is interpreted as arbitrary HTML.
    appendCreditsLedger(ledger, creditsMarkdown);
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
    this.element.dataset.menuOrigin = this.model.menuOrigin;
    for (const [panelState, panel] of this.panels) {
      panel.hidden = panelState !== state;
    }

    const gameplayActive = state === 'playing';
    // Menus may always suspend input. Re-enabling belongs to runtime.start(),
    // which can intentionally keep input disabled during the death sequence.
    if (!gameplayActive) this.actions.setGameplayInputEnabled(false);
    this.actions.setDebugInteractionEnabled(gameplayActive);
    if (FULL_SCREEN_STATES.has(state)) this.actions.releasePointerLock();

    const focusTarget = this.focusTargets.get(state);
    if (focusTarget) {
      queueMicrotask(() => {
        if (!this.disposed && this.model.state === state) focusTarget.focus();
      });
    }
  }

  private pause(): void {
    if (
      !gameFlowCanPause(
        this.model.state,
        this.actions.isGameplayInputEnabled(),
      )
    ) {
      return;
    }
    this.actions.stopGameplay();
    if (!this.model.pause()) return;
    this.syncState();
  }

  private resume(): void {
    if (this.model.state !== 'paused') return;
    this.actions.startGameplay();
    if (!this.model.resume()) return;
    this.syncState();
    this.actions.requestPointerLock();
  }

  private restart(): void {
    if (this.restartPending || !this.model.beginRestart()) return;
    this.restartPending = true;
    this.restartStatus.textContent = '';
    this.switchFeedbackModel.clear();
    this.switchFeedback.textContent = '';
    this.syncState();

    try {
      this.actions.restartLevel();
      this.switchFeedback.textContent = '';
      this.actions.startGameplay();
      this.restartStatus.textContent = 'Trial restored.';
      this.model.finishRestart();
      this.syncState();
      this.actions.requestPointerLock();
    } catch {
      this.restartStatus.textContent = 'The trial could not be restarted.';
      this.model.cancelRestart();
      this.syncState();
    }

    this.restartPending = false;
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
        if (this.model.state === 'title') {
          this.actions.startGameplay();
        }
        if (this.model.start()) {
          this.syncState();
          this.actions.requestPointerLock();
        }
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        this.restart();
        break;
      case 'enter-level-two':
        if (this.model.state !== 'transitioning' || target.hidden) break;
        this.actions.startGameplay();
        if (this.model.finishLevelTransition()) {
          this.syncState();
          this.actions.requestPointerLock();
        }
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
    if (event.repeat) return;
    const action = getGameFlowKeyboardAction(event.code, this.model.state);

    if (action === 'pause') {
      if (!this.actions.isGameplayInputEnabled()) return;
      event.preventDefault();
      this.pause();
      return;
    }

    if (action === 'resume') {
      event.preventDefault();
      this.resume();
      return;
    }

    // Escape is reserved for backing out of nested UI. During gameplay the
    // browser owns Escape's pointer-lock release, which is already observed by
    // onPointerLockChange and resolves to the same authoritative pause state.
    if (action === 'back') {
      event.preventDefault();
      if (this.model.back()) this.syncState();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.pause();
  };

  private readonly onPointerLockChange = (): void => {
    if (
      this.model.state === 'playing' &&
      this.actions.isGameplayInputEnabled() &&
      !this.actions.isPointerLocked()
    ) {
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
    this.sensitivityInput.style.setProperty(
      '--range-progress',
      `${((settings.mouseSensitivity - 0.5) / 1.5) * 100}%`,
    );
    this.sensitivityOutput.value = `${settings.mouseSensitivity.toFixed(1)}×`;
    this.invertVerticalInput.checked = settings.invertVerticalLook;
    this.invertVerticalOutput.value = settings.invertVerticalLook ? 'On' : 'Off';
    this.volumeInput.value = String(Math.round(settings.masterVolume * 100));
    this.volumeInput.style.setProperty(
      '--range-progress',
      `${settings.masterVolume * 100}%`,
    );
    this.volumeOutput.value = `${Math.round(settings.masterVolume * 100)}%`;
    this.cameraDistanceInput.value = settings.cameraDistanceMetres.toFixed(1);
    this.cameraDistanceInput.style.setProperty(
      '--range-progress',
      `${
        ((settings.cameraDistanceMetres - MIN_FOLLOW_DISTANCE_METRES) /
          (MAX_FOLLOW_DISTANCE_METRES - MIN_FOLLOW_DISTANCE_METRES)) *
        100
      }%`,
    );
    this.cameraDistanceOutput.value =
      `${settings.cameraDistanceMetres.toFixed(1)} m`;
    this.actions.applySettings(settings);
  };

  private readonly onSlimeHUDChanged = (snapshot: SlimeHUDSnapshot): void => {
    this.switchFeedback.textContent = this.switchFeedbackModel.update(snapshot);

    let visibleIndex = 0;
    const entries = snapshot.roster.flatMap((entry) => {
      const view = getSlimeRosterEntryView(entry);
      if (!view) return [];
      visibleIndex += 1;

      const item = this.hostDocument.createElement('li');
      item.className = 'hud-slime-entry';
      item.dataset.slimeId = entry.id;
      item.dataset.state = view.state;
      item.setAttribute('aria-label', view.ariaLabel);

      const badge = this.hostDocument.createElement('span');
      badge.className = 'hud-slime-badge';
      badge.setAttribute('aria-hidden', 'true');
      const badgeGlyph = this.hostDocument.createElement('span');
      badgeGlyph.textContent = entry.displayName.slice(0, 1);
      const badgeIndex = this.hostDocument.createElement('small');
      badgeIndex.textContent = String(visibleIndex).padStart(2, '0');
      badge.append(badgeGlyph, badgeIndex);

      const identity = this.hostDocument.createElement('span');
      identity.className = 'hud-slime-identity';
      identity.textContent = entry.displayName;

      const state = this.hostDocument.createElement('span');
      state.className = 'hud-slime-state';
      state.textContent = view.stateLabel;

      const control = this.hostDocument.createElement('span');
      control.className = 'hud-slime-control';
      control.textContent = view.controlLabel;

      item.append(badge, identity, state, control);
      return [item];
    });
    this.slimeRoster.replaceChildren(...entries);
    const passiveStatus = formatPassiveInteractionStatus(snapshot);
    this.passiveStatus.textContent = passiveStatus ?? '';
    this.passiveStatus.hidden = passiveStatus === undefined;
  };
}
