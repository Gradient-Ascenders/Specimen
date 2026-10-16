import { isGelRenderingMode } from '../render/slime/GelRendering.ts';
import { GRAPHICS_PROFILES, graphicsProfileName, isGraphicsProfileId } from '../render/GraphicsProfiles.ts';
import type { GraphicsDiagnostics } from '../render/RenderLayer.ts';
import type {
  GameSettings,
  GameSettingsSnapshot,
} from './GameSettings.ts';
import {
  MAX_FOLLOW_DISTANCE_METRES,
  MIN_FOLLOW_DISTANCE_METRES,
} from '../render/CameraRig.ts';
import {
  isRenderPixelRatioCap,
  isRenderScale,
} from '../render/RenderResolution.ts';
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
import { isTitleSpecimenId, TITLE_SPECIMEN_ORDER, TITLE_SPECIMEN_VIEWS,
  type TitleSpecimenId, type TitleSpecimenRegion } from './TitleSpecimenView.ts';

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

export interface GameFlowKeyboardModifiers {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

export const getGameFlowKeyboardAction = (
  code: string,
  state: GameFlowState,
  modifiers: GameFlowKeyboardModifiers = {},
): GameFlowKeyboardAction | null => {
  const hasModifier = modifiers.altKey || modifiers.ctrlKey ||
    modifiers.metaKey || modifiers.shiftKey;
  if (!hasModifier && code === 'KeyP' && state === 'playing') return 'pause';
  if (!hasModifier && code === 'KeyP' && state === 'paused') return 'resume';
  if (code === 'Escape' && (state === 'settings' || state === 'credits')) {
    return 'back';
  }
  return null;
};

export interface CreditsInlinePart {
  readonly text: string;
  readonly href?: string;
}

const safeCreditsUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

export const parseCreditsInlineParts = (value: string): CreditsInlinePart[] => {
  const source = value.trim();
  const parts: CreditsInlinePart[] = [];
  const markdownToken = /\[([^\]]+)]\(([^)]+)\)|`([^`]+)`/g;
  let cursor = 0;

  for (const match of source.matchAll(markdownToken)) {
    const matchIndex = match.index;
    if (matchIndex > cursor) {
      parts.push({ text: source.slice(cursor, matchIndex) });
    }

    const linkLabel = match[1];
    const linkDestination = match[2]?.trim();
    if (linkLabel !== undefined && linkDestination !== undefined) {
      const href = safeCreditsUrl(linkDestination);
      parts.push(
        href
          ? { text: linkLabel, href }
          : { text: `${linkLabel} (${linkDestination})` },
      );
    } else {
      parts.push({ text: match[3] ?? '' });
    }
    cursor = matchIndex + match[0].length;
  }

  if (cursor < source.length) parts.push({ text: source.slice(cursor) });
  return parts;
};

const appendCreditsInlineContent = (
  element: HTMLElement,
  value: string,
): void => {
  for (const part of parseCreditsInlineParts(value)) {
    if (!part.href) {
      element.append(element.ownerDocument.createTextNode(part.text));
      continue;
    }

    const link = element.ownerDocument.createElement('a');
    link.textContent = part.text;
    link.href = part.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    element.append(link);
  }
};

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
          .map((cell) => cell.trim());
        const entry = ledger.ownerDocument.createElement('article');
        entry.className = 'credits-entry';

        const title = ledger.ownerDocument.createElement('h3');
        appendCreditsInlineContent(title, values[0] ?? '');
        entry.append(title);

        const details = ledger.ownerDocument.createElement('dl');
        for (let cellIndex = 1; cellIndex < headers.length; cellIndex += 1) {
          const detail = ledger.ownerDocument.createElement('div');
          const term = ledger.ownerDocument.createElement('dt');
          const description = ledger.ownerDocument.createElement('dd');
          term.textContent = headers[cellIndex] ?? '';
          appendCreditsInlineContent(description, values[cellIndex] ?? '');
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
    appendCreditsInlineContent(paragraph, paragraphLines.join(' '));
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
  getGraphicsDiagnostics?(): GraphicsDiagnostics;
  subscribeGraphicsDiagnostics?(listener: () => void): () => void;
  playMenuSound?(cue: 'navigate' | 'confirm' | 'back'): void;
  previewTitleSpecimen?(id: TitleSpecimenId | null, replay?: boolean): void;
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
  private readonly effectsInput: HTMLInputElement;
  private readonly effectsOutput: HTMLOutputElement;
  private readonly cameraDistanceInput: HTMLInputElement;
  private readonly cameraDistanceOutput: HTMLOutputElement;
  private readonly renderResolutionInput: HTMLSelectElement;
  private readonly graphicsPresetInput: HTMLSelectElement;
  private readonly gelRenderingInput: HTMLSelectElement;
  private readonly graphicsProfileInput: HTMLSelectElement;
  private readonly renderScaleInput: HTMLSelectElement;
  private readonly graphicsDiagnostics: HTMLElement;
  private readonly slimeRoster: HTMLElement;
  private readonly passiveStatus: HTMLElement;
  private readonly switchFeedback: HTMLElement;
  private readonly transitionRuntimeLabel: HTMLElement;
  private readonly transitionMessage: HTMLElement;
  private readonly transitionCopy: HTMLElement;
  private readonly transitionFailureMessage: HTMLElement;
  private readonly transitionContinueButton: HTMLButtonElement;
  private readonly unsubscribeSettings: () => void;
  private readonly unsubscribeGraphicsDiagnostics: () => void;
  private readonly unsubscribeSlimeHUD: () => void;
  private readonly switchFeedbackModel = new SlimeSwitchFeedbackModel();
  private restartPending = false;
  private restartConfirmationOpen = false;
  private activeSettingsTab = 'controls';
  private levelLabel = 'Containment · 01';
  private returnFocus: HTMLElement | undefined;
  private pointerSpecimen: TitleSpecimenId | null = null;
  private focusedSpecimen: TitleSpecimenId | null = null;
  private previewedSpecimen: TitleSpecimenId | null = null;
  private readonly specimenRegionStyles = new Map<TitleSpecimenId, string>();
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
    this.effectsInput = this.requireElement<HTMLInputElement>('[data-setting="effects-volume"]');
    this.effectsOutput = this.requireElement<HTMLOutputElement>('[data-setting-output="effects-volume"]');
    this.cameraDistanceInput = this.requireElement<HTMLInputElement>(
      '[data-setting="camera-distance"]',
    );
    this.cameraDistanceOutput = this.requireElement<HTMLOutputElement>(
      '[data-setting-output="camera-distance"]',
    );
    this.gelRenderingInput = this.requireElement<HTMLSelectElement>('[data-setting="gel-rendering"]');
    this.graphicsProfileInput = this.requireElement<HTMLSelectElement>('[data-setting="graphics-profile"]');
    this.renderScaleInput = this.requireElement<HTMLSelectElement>('[data-setting="render-scale"]');
    this.graphicsDiagnostics = this.requireElement('[data-graphics-diagnostics]');
    this.renderResolutionInput = this.requireElement<HTMLSelectElement>(
      '[data-setting="render-resolution"]',
    );
    this.graphicsPresetInput = this.requireElement<HTMLSelectElement>(
      '[data-setting="graphics-preset"]',
    );
    this.slimeRoster = this.requireElement('[data-slime-roster]');
    this.passiveStatus = this.requireElement('[data-passive-status]');
    this.switchFeedback = this.requireElement('[data-switch-feedback]');
    this.transitionRuntimeLabel = this.requireElement('[data-transition-runtime-label]');
    this.transitionMessage = this.requireElement('[data-transition-message]');
    this.transitionCopy = this.requireElement('[data-transition-copy]');
    this.transitionFailureMessage = this.requireElement(
      '[data-transition-failure-message]',
    );
    this.transitionContinueButton = this.requireElement<HTMLButtonElement>(
      '[data-action="enter-level"]',
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
    this.unsubscribeGraphicsDiagnostics = this.actions.subscribeGraphicsDiagnostics?.(this.syncGraphicsDiagnostics) ?? (() => {});
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

  get titleBackdropVisible(): boolean {
    return this.state === 'title' ||
      ((this.state === 'settings' || this.state === 'credits') && this.model.menuOrigin === 'title');
  }

  setTitleSpecimenRegions(regions: readonly TitleSpecimenRegion[]): void {
    for (const region of regions) {
      const style = `left:${region.left * 100}%;top:${region.top * 100}%;width:${region.width * 100}%;height:${region.height * 100}%;`;
      if (this.specimenRegionStyles.get(region.id) === style) continue;
      this.specimenRegionStyles.set(region.id, style);
      const button = this.requireElement<HTMLButtonElement>(`[data-title-specimen="${region.id}"]`);
      button.style.cssText = style;
      button.hidden = region.width <= 0 || region.height <= 0;
    }
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
    this.requireElement('[data-pause-objective]').textContent = nextObjective;
  }

  beginLevelTransition(
    message: string,
    levelId: 'level-2' | 'level-3' = 'level-2',
  ): void {
    if (!this.model.beginLevelTransition()) return;
    const levelTwo = levelId === 'level-2';
    this.transitionRuntimeLabel.textContent = levelTwo
      ? 'Cultivation runtime · 02'
      : 'Blackout runtime · 03';
    this.transitionMessage.textContent = message;
    this.transitionCopy.textContent = levelTwo
      ? 'Transferring the specimen pair.'
      : 'Transferring the three-specimen roster.';
    this.transitionContinueButton.hidden = true;
    this.switchFeedbackModel.clear();
    this.switchFeedback.textContent = '';
    this.syncState();
  }

  finishLevelTransition(levelId: 'level-2' | 'level-3' = 'level-2'): void {
    if (this.model.state !== 'transitioning') return;
    this.levelLabel = levelId === 'level-2' ? 'Cultivation · 02' : 'Blackout · 03';
    this.requireElement('[data-pause-level]').textContent = this.levelLabel;
    const levelName = levelId === 'level-2' ? 'Level 2' : 'Level 3';
    this.transitionMessage.textContent = `${levelName} ready`;
    const label = this.transitionContinueButton.querySelector('span');
    if (label) label.textContent = `Enter ${levelName}`;
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
    this.unsubscribeGraphicsDiagnostics();
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
        <div class="title-specimen-hotspots" role="group" aria-label="Preview specimen abilities">
          ${TITLE_SPECIMEN_ORDER.map(id => `<button class="title-specimen-hotspot" type="button" data-title-specimen="${id}" aria-label="${id === 'bob' ? 'Bob' : id === 'goop' ? 'Goop' : 'Volt'}: preview ${TITLE_SPECIMEN_VIEWS[id].ability.toLowerCase()}" hidden></button>`).join('')}
        </div>
        <div class="title-composition">
          <header class="title-branding">
            ${createBrandMarkMarkup('detailed', 'title-brand-mark')}
            <div>
              <p class="flow-eyebrow">Containment · Trial 01</p>
              <h1 id="title-heading">Specimen</h1>
            </div>
          </header>
          <p class="title-tagline">Explore <span>·</span> Adapt <span>·</span> Transcend</p>
          <p class="title-description">Three specimens. One way out.<br>Discover what you can become.</p>
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
          <p class="title-footer"><span class="status-light" aria-hidden="true"></span> Single-player puzzle platformer</p>
        </div>
        <div class="title-specimen-caption" role="status" aria-live="polite" aria-atomic="true"><span class="system-label" data-title-specimen-label>Specimen array / 03</span><span data-title-specimen-name>Goop · Bob · Volt</span><span class="specimen-caption-status" data-title-specimen-ability>● &nbsp; Hover a specimen to preview</span></div>
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
          <div class="pause-session">
            <p class="system-label" data-pause-level>Containment · 01</p>
            <p class="pause-objective" data-pause-objective>Climb through the vent</p>
          </div>
          <div class="flow-actions game-menu pause-actions">
            <button class="primary-action menu-action" data-action="resume" data-autofocus>
              <span>Resume</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action" data-action="settings">
              <span>Settings</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action" data-action="credits">
              <span>Credits</span>
              <span class="menu-arrow" aria-hidden="true">→</span>
            </button>
            <button class="menu-action pause-restart" data-action="restart">
              <span>Restart trial</span>
              <span class="menu-arrow" aria-hidden="true">↻</span>
            </button>
          </div>
          <p class="system-status" data-restart-status role="status" aria-live="polite"></p>
          <p class="pause-hint" aria-hidden="true"><kbd>P</kbd> Resume</p>
        </div>
        <div class="restart-confirmation" data-restart-confirmation role="alertdialog" aria-modal="true" aria-labelledby="restart-confirm-heading" aria-describedby="restart-confirm-copy" hidden>
          <div class="system-panel restart-confirm-card">
            <p class="system-label">Reset current trial</p>
            <h2 id="restart-confirm-heading">Start this level over?</h2>
            <p class="system-copy" id="restart-confirm-copy">Your progress in this level will be lost. Your settings will be kept.</p>
            <div class="confirmation-actions">
              <button class="system-action primary-action" data-action="cancel-restart">Cancel</button>
              <button class="system-action danger-action" data-action="confirm-restart">Restart level <span aria-hidden="true">↻</span></button>
            </div>
          </div>
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
          <div class="settings-tabs" role="tablist" aria-label="Settings categories">
            <button id="settings-tab-controls" role="tab" aria-selected="true" aria-controls="settings-controls" data-settings-tab="controls" data-autofocus>Controls</button>
            <button id="settings-tab-audio" role="tab" aria-selected="false" aria-controls="settings-audio" data-settings-tab="audio" tabindex="-1">Audio</button>
            <button id="settings-tab-graphics" role="tab" aria-selected="false" aria-controls="settings-graphics" data-settings-tab="graphics" tabindex="-1">Graphics</button>
          </div>
          <div class="settings-content">
          <section id="settings-controls" class="settings-category" role="tabpanel" aria-labelledby="settings-tab-controls" data-settings-category="controls">
          <p class="category-intro">Make yourself at home.</p>
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
          </section>
          <section id="settings-audio" class="settings-category" role="tabpanel" aria-labelledby="settings-tab-audio" data-settings-category="audio" hidden>
          <p class="category-intro">Find your balance.</p>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="master-volume">Master volume</label>
              <output for="master-volume" data-setting-output="volume"></output>
            </div>
            <input id="master-volume" data-setting="volume" type="range" min="0" max="100" step="5">
            <p class="setting-note">Controls all game and menu audio.</p>
          </div>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="effects-volume">Sound effects volume</label>
              <output for="effects-volume" data-setting-output="effects-volume"></output>
            </div>
            <input id="effects-volume" data-setting="effects-volume" type="range" min="0" max="100" step="5">
          </div>
          </section>
          <section id="settings-graphics" class="settings-category" role="tabpanel" aria-labelledby="settings-tab-graphics" data-settings-category="graphics" hidden>
          <p class="category-intro">A clear view of the unknown.</p>
          <div class="setting-row">
            <div class="setting-heading"><label for="graphics-profile">Graphics profile</label></div>
            <select id="graphics-profile" data-setting="graphics-profile" aria-describedby="graphics-profile-note">
              <option value="minimum">Minimum · faster</option>
              <option value="standard">Standard · sharper</option>
              <option value="custom" disabled>Custom</option>
            </select>
            <p class="setting-note" id="graphics-profile-note">Minimum is recommended for slower devices. Standard adds sharper detail and light refraction.</p>
          </div>
          <details class="settings-advanced">
          <summary>Advanced graphics</summary>
          <p class="setting-note">Fine-tune image quality and performance.</p>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="graphics-preset">Performance cap</label>
            </div>
            <select id="graphics-preset" data-setting="graphics-preset">
              <option value="normal">Off</option>
              <option value="performance">On</option>
            </select>
            <p class="setting-note">Limits pixel density and refraction quality for smoother play.</p>
          </div>
          <div class="setting-row">
            <div class="setting-heading">
              <label for="render-resolution">Pixel density</label>
            </div>
            <select id="render-resolution" data-setting="render-resolution">
              <option value="0.75">0.75×</option>
              <option value="1">1×</option>
              <option value="1.5">1.5×</option>
              <option value="2">2×</option>
            </select>
            <p class="setting-note">Higher values sharpen the image and use more graphics power.</p>
          </div>
          <div class="setting-row">
            <div class="setting-heading"><label for="render-scale">3D render scale</label></div>
            <select id="render-scale" data-setting="render-scale">
              <option value="0.5">50% · faster</option>
              <option value="0.75">75% · balanced</option>
              <option value="1">100% · sharper</option>
            </select>
            <p class="setting-note">Reduce for smoother play. Menu text stays sharp.</p>
          </div>
          <div class="setting-row">
            <div class="setting-heading"><label for="gel-rendering">Character gel</label></div>
            <select id="gel-rendering" data-setting="gel-rendering">
              <option value="minimum">Glossy</option>
              <option value="reduced-transmission">Soft refraction</option>
              <option value="physical">Full refraction</option>
            </select>
            <p class="setting-note">Glossy gel keeps reflections and character glow. Refraction adds background distortion at a higher graphics cost.</p>
          </div>
          <details class="graphics-diagnostics"><summary>Rendering details</summary><p class="setting-note" data-graphics-diagnostics></p></details>
          </details>
          </section>
          </div>
          <footer class="system-panel-footer">
          <button class="system-action system-back" data-action="back">
            <span aria-hidden="true">←</span><span>Back</span>
          </button>
          <p class="setting-note">Applied instantly · This session</p>
          </footer>
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
          <footer class="system-panel-footer">
          <button class="system-action system-back" data-action="back" data-autofocus>
            <span aria-hidden="true">←</span><span>Back</span>
          </button>
          </footer>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="restarting" aria-labelledby="restarting-heading" hidden>
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <p class="system-label" data-restart-level>Containment · 01</p>
          <h1 id="restarting-heading">Reconstituting specimen</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" role="status" aria-live="polite">Restoring the trial state.</p>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="transitioning" aria-labelledby="transition-heading" hidden>
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <p class="system-label" data-transition-runtime-label>Cultivation runtime · 02</p>
          <h1 id="transition-heading" data-transition-message>Entering Level 2…</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" data-transition-copy role="status" aria-live="polite">Transferring the specimen pair.</p>
          <button class="system-action primary-action transition-action" type="button" data-action="enter-level" hidden>
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
    // Parse only the ledger's deliberately small Markdown subset. Text is
    // assigned through DOM text nodes and links are restricted to HTTP(S), so
    // no source text is interpreted as arbitrary HTML.
    appendCreditsLedger(ledger, creditsMarkdown);
    return root;
  }

  private bindActions(): void {
    const signal = this.listeners.signal;
    this.element.addEventListener('click', this.onClick, { signal });
    this.element.addEventListener('pointerover', this.onMenuHover, { signal });
    this.element.addEventListener('focusin', this.onMenuFocus, { signal });
    this.element.addEventListener('pointerover', this.onSpecimenPointerOver, { signal });
    this.element.addEventListener('pointerout', this.onSpecimenPointerOut, { signal });
    this.element.addEventListener('focusin', this.onSpecimenFocus, { signal });
    this.element.addEventListener('focusout', this.onSpecimenBlur, { signal });
    this.sensitivityInput.addEventListener('input', this.onSensitivityInput, {
      signal,
    });
    this.invertVerticalInput.addEventListener(
      'change',
      this.onInvertVerticalChange,
      { signal },
    );
    this.volumeInput.addEventListener('input', this.onVolumeInput, { signal });
    this.effectsInput.addEventListener('input', this.onEffectsInput, { signal });
    this.cameraDistanceInput.addEventListener(
      'input',
      this.onCameraDistanceInput,
      { signal },
    );
    this.gelRenderingInput.addEventListener('change', () => {
      const mode = this.gelRenderingInput.value;
      if (isGelRenderingMode(mode)) this.settings.setGelRenderingMode(mode);
    }, { signal });
    this.graphicsProfileInput.addEventListener('change', () => {
      const profile = this.graphicsProfileInput.value;
      if (isGraphicsProfileId(profile)) this.settings.setGraphicsProfile(profile);
    }, { signal });
    this.renderScaleInput.addEventListener('change', () => {
      const scale = Number(this.renderScaleInput.value);
      if (isRenderScale(scale)) this.settings.setRenderScale(scale);
    }, { signal });
    this.renderResolutionInput.addEventListener(
      'change',
      this.onRenderResolutionChange,
      { signal },
    );
    this.graphicsPresetInput.addEventListener('change', this.onGraphicsPresetChange, { signal });
    this.hostWindow.addEventListener('keydown', this.onKeyDown, { signal });
    this.hostWindow.addEventListener('blur', this.onWindowBlur, { signal });
    this.hostWindow.addEventListener('resize', this.syncGraphicsDiagnostics, { signal });
    this.hostDocument.addEventListener(
      'pointerlockchange',
      this.onPointerLockChange,
      { signal },
    );
  }

  private syncState(): void {
    this.syncGraphicsDiagnostics();
    const state = this.model.state;
    this.element.dataset.state = state;
    this.element.dataset.menuOrigin = this.model.menuOrigin;
    if (state !== 'title') {
      this.pointerSpecimen = this.focusedSpecimen = null;
      this.previewTitleSpecimen(null);
    }
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
    const restoreFocus = this.returnFocus;
    this.returnFocus = undefined;
    if (focusTarget) {
      queueMicrotask(() => {
        if (!this.disposed && this.model.state === state) {
          const settingsTab = state === 'settings'
            ? this.requireElement(`[data-settings-tab="${this.activeSettingsTab}"]`) : undefined;
          (restoreFocus ?? settingsTab ?? focusTarget).focus({ preventScroll: true });
        }
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
    this.requireElement('[data-restart-level]').textContent = this.levelLabel;
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

  private selectSettingsTab(id: string, focus = false): void {
    const tab = this.element.querySelector<HTMLElement>(`[data-settings-tab="${id}"]`);
    if (!tab) return;
    this.activeSettingsTab = id;
    for (const item of this.element.querySelectorAll<HTMLElement>('[data-settings-tab]')) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    }
    for (const panel of this.element.querySelectorAll<HTMLElement>('[data-settings-category]')) {
      panel.hidden = panel.dataset.settingsCategory !== id;
    }
    this.requireElement('.settings-content').scrollTop = 0;
    if (focus) tab.focus({ preventScroll: true });
  }

  private showRestartConfirmation(open: boolean): void {
    this.restartConfirmationOpen = open;
    this.requireElement('[data-restart-confirmation]').hidden = !open;
    this.requireElement('.pause-rail').inert = open;
    this.requireElement(`[data-action="${open ? 'cancel-restart' : 'restart'}"]`).focus({ preventScroll: true });
  }

  private readonly onMenuHover = (event: PointerEvent): void => {
    const button = (event.target as Element | null)?.closest('button, summary');
    if (!button || button.contains(event.relatedTarget as Node | null)) return;
    if (button instanceof HTMLButtonElement && button.disabled) return;
    this.actions.playMenuSound?.('navigate');
  };

  private readonly onMenuFocus = (event: FocusEvent): void => {
    if ((event.target as Element | null)?.matches('button, summary')) {
      this.actions.playMenuSound?.('navigate');
    }
  };

  private specimenFromTarget(target: EventTarget | null): TitleSpecimenId | null {
    const id = (target as Element | null)?.closest?.<HTMLElement>('[data-title-specimen]')?.dataset.titleSpecimen;
    return isTitleSpecimenId(id) ? id : null;
  }

  private previewTitleSpecimen(id: TitleSpecimenId | null, replay = false): void {
    if (id === this.previewedSpecimen && !replay) return;
    this.previewedSpecimen = id;
    this.element.classList.toggle('is-title-blackout', id === 'volt');
    const caption = this.requireElement('.title-specimen-caption');
    const view = id ? TITLE_SPECIMEN_VIEWS[id] : null;
    if (id) caption.dataset.specimen = id;
    else delete caption.dataset.specimen;
    caption.style.setProperty('--specimen-accent', view?.color ?? '#83dfd0');
    this.requireElement('[data-title-specimen-label]').textContent = view?.label ?? 'Specimen array / 03';
    this.requireElement('[data-title-specimen-name]').textContent = view?.name ?? 'Goop · Bob · Volt';
    this.requireElement('[data-title-specimen-ability]').textContent = `●  ${view?.ability ?? 'Hover a specimen to preview'}`;
    this.actions.previewTitleSpecimen?.(id, replay);
  }

  private readonly onSpecimenPointerOver = (event: PointerEvent): void => {
    if (this.state !== 'title') return;
    const id = this.specimenFromTarget(event.target);
    if (!id) return;
    this.pointerSpecimen = id;
    this.previewTitleSpecimen(id);
  };

  private readonly onSpecimenPointerOut = (event: PointerEvent): void => {
    if (!this.specimenFromTarget(event.target)) return;
    this.pointerSpecimen = this.specimenFromTarget(event.relatedTarget);
    this.previewTitleSpecimen(this.pointerSpecimen ?? this.focusedSpecimen);
  };

  private readonly onSpecimenFocus = (event: FocusEvent): void => {
    if (this.state !== 'title') return;
    this.focusedSpecimen = this.specimenFromTarget(event.target);
    this.previewTitleSpecimen(this.pointerSpecimen ?? this.focusedSpecimen);
  };

  private readonly onSpecimenBlur = (event: FocusEvent): void => {
    this.focusedSpecimen = this.specimenFromTarget(event.relatedTarget);
    this.previewTitleSpecimen(this.pointerSpecimen ?? this.focusedSpecimen);
  };

  private readonly onClick = (event: MouseEvent): void => {
    const specimen = this.specimenFromTarget(event.target);
    if (specimen && this.state === 'title') {
      this.previewTitleSpecimen(specimen, true);
      return;
    }
    const tab = (event.target as Element | null)?.closest<HTMLElement>('[data-settings-tab]');
    if (tab && this.state === 'settings') {
      this.actions.playMenuSound?.('confirm');
      this.selectSettingsTab(tab.dataset.settingsTab!);
      return;
    }
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!target) return;
    this.actions.playMenuSound?.(target.dataset.action === 'back' || target.dataset.action === 'cancel-restart' ? 'back' : 'confirm');

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
        if (this.state === 'paused') this.showRestartConfirmation(true);
        break;
      case 'cancel-restart':
        this.showRestartConfirmation(false);
        break;
      case 'confirm-restart':
        if (this.restartConfirmationOpen && this.state === 'paused') {
          this.showRestartConfirmation(false);
          this.restart();
        }
        break;
      case 'enter-level':
        if (this.model.state !== 'transitioning' || target.hidden) break;
        this.actions.startGameplay();
        if (this.model.finishLevelTransition()) {
          this.syncState();
          this.actions.requestPointerLock();
        }
        break;
      case 'settings':
        if (this.model.openSettings()) {
          this.returnFocus = undefined;
          this.syncState();
        }
        break;
      case 'credits':
        if (this.model.openCredits()) this.syncState();
        break;
      case 'back':
        this.returnFocus = this.panels.get(this.model.menuOrigin)?.querySelector<HTMLElement>(`[data-action="${this.state}"]`) ?? undefined;
        if (this.model.back()) this.syncState();
        break;
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.restartConfirmationOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.actions.playMenuSound?.('back');
        this.showRestartConfirmation(false);
      } else if (event.code === 'Tab') {
        this.trapFocus(event, this.requireElement('[data-restart-confirmation]'));
      } else if (event.code === 'KeyP') event.preventDefault();
      return;
    }
    if (event.code === 'Tab' && FULL_SCREEN_STATES.has(this.state)) {
      const panel = this.panels.get(this.state);
      if (panel) this.trapFocus(event, panel);
      return;
    }
    const tab = (event.target as Element | null)?.closest<HTMLElement>('[data-settings-tab]');
    if (tab && this.state === 'settings' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
      event.preventDefault();
      const ids = ['controls', 'audio', 'graphics'];
      const current = ids.indexOf(this.activeSettingsTab);
      const next = event.code === 'Home' ? 0 : event.code === 'End' ? 2
        : (current + (event.code === 'ArrowRight' ? 1 : 2)) % 3;
      this.selectSettingsTab(ids[next]!, true);
      return;
    }
    if (event.repeat) return;
    const action = getGameFlowKeyboardAction(
      event.code,
      this.model.state,
      event,
    );

    if (action === 'pause') {
      if (!this.actions.isGameplayInputEnabled()) return;
      event.preventDefault();
      this.actions.playMenuSound?.('confirm');
      this.pause();
      return;
    }

    if (action === 'resume') {
      event.preventDefault();
      this.actions.playMenuSound?.('confirm');
      this.resume();
      return;
    }

    // Escape is reserved for backing out of nested UI. During gameplay the
    // browser owns Escape's pointer-lock release, which is already observed by
    // onPointerLockChange and resolves to the same authoritative pause state.
    if (action === 'back') {
      event.preventDefault();
      this.actions.playMenuSound?.('back');
      this.returnFocus = this.panels.get(this.model.menuOrigin)?.querySelector<HTMLElement>(`[data-action="${this.state}"]`) ?? undefined;
      if (this.model.back()) this.syncState();
    }
  };

  private trapFocus(event: KeyboardEvent, panel: HTMLElement): void {
    const items = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]')]
      .filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0 && !item.closest('[inert]'));
    const first = items[0], last = items.at(-1);
    if (!first || !last) return;
    const active = this.hostDocument.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault(); first.focus();
    }
  }

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

  private readonly onEffectsInput = (): void => {
    this.settings.setSoundEffectsVolume(this.effectsInput.valueAsNumber / 100);
  };

  private readonly onVolumeInput = (): void => {
    this.settings.setMasterVolume(this.volumeInput.valueAsNumber / 100);
  };

  private readonly onCameraDistanceInput = (): void => {
    this.settings.setCameraDistanceMetres(
      this.cameraDistanceInput.valueAsNumber,
    );
  };

  private readonly onRenderResolutionChange = (): void => {
    const pixelRatioCap = Number(this.renderResolutionInput.value);
    if (isRenderPixelRatioCap(pixelRatioCap)) {
      this.settings.setRenderPixelRatioCap(pixelRatioCap);
    }
  };

  private readonly onGraphicsPresetChange = (): void => {
    const value = this.graphicsPresetInput.value;
    if (value === 'normal' || value === 'performance') this.settings.setGraphicsPreset(value);
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
    this.effectsInput.value = String(Math.round(settings.soundEffectsVolume * 100));
    this.effectsInput.style.setProperty('--range-progress', `${settings.soundEffectsVolume * 100}%`);
    this.effectsOutput.value = `${Math.round(settings.soundEffectsVolume * 100)}%`;
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
    const performance = settings.graphicsPreset === 'performance';
    this.graphicsPresetInput.value = settings.graphicsPreset;
    this.renderResolutionInput.value = String(performance ? Math.min(1, settings.renderPixelRatioCap) : settings.renderPixelRatioCap);
    for (const option of this.renderResolutionInput.options) {
      option.disabled = performance && Number(option.value) > 1;
    }
    this.gelRenderingInput.value = settings.gelRenderingMode;
    this.graphicsProfileInput.value = graphicsProfileName(settings);
    this.renderScaleInput.value = String(settings.renderScale);
    this.actions.applySettings(settings);
    this.syncGraphicsDiagnostics();
  };

  private readonly syncGraphicsDiagnostics = (): void => {
    const settings = this.settings.value, profile = GRAPHICS_PROFILES[settings.graphicsProfile];
    const diagnostics = this.actions.getGraphicsDiagnostics?.();
    this.graphicsDiagnostics.textContent = [
      `${graphicsProfileName(settings) === 'custom' ? 'Custom, based on ' : ''}${profile.label}`,
      diagnostics ? `${diagnostics.presentationActive ? 'Title display: ' : ''}${diagnostics.drawingBufferWidth} × ${diagnostics.drawingBufferHeight} px` : '',
      `gameplay ≤ ${(profile.pixelBudget / 1_000_000).toFixed(2)} million pixels`,
      diagnostics ? `display DPR ${diagnostics.devicePixelRatio.toFixed(2)}, effective ${diagnostics.pixelRatio.toFixed(2)}×` : '',
      `${Math.round(settings.renderScale * 100)}% scale`,
      `extra performance cap: ${settings.graphicsPreset === 'performance' ? 'on' : 'off'}`,
      `gel: ${settings.gelRenderingMode}`,
      `shadows ≤ ${profile.shadowMapSizeCap}px/face`,
      `decorative particles ${profile.effectsDensity * 100}%`,
      'room-scoped lighting; canvas MSAA off',
    ].filter(Boolean).join(' · ');
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
