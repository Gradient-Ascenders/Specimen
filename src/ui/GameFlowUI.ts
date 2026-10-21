import { AdditionalSettingsControls } from './AdditionalSettingsControls.ts';
import { chooseTitleScreenLine } from './TitleScreenLines.ts';
import { keyLabel } from '../core/KeyBindings.ts';
import { SettingHelp } from './SettingHelp.ts';
import { isGelRenderingMode } from '../render/slime/GelRendering.ts';
import { GRAPHICS_PROFILES, graphicsProfileName, isGraphicsProfileId, GRAPHICS_PIXEL_BUDGETS, SHADOW_MAP_CAPS, EFFECTS_DENSITIES } from '../render/GraphicsProfiles.ts';
import type { GraphicsDiagnostics } from '../render/RenderLayer.ts';
import type {
  GameSettings,
  GameSettingsSnapshot,
} from './GameSettings.ts';
import { createSettingsPanelMarkup } from './SettingsPanelMarkup.ts';
import { menuIconMarkup as icon } from './MenuIcons.ts';
import { SLIME_PORTRAITS } from './SlimePortraits.ts';
import { SlimeRosterPresentation } from './SlimeRosterPresentation.ts';
import { HudPanelPresentation } from './HudPanelPresentation.ts';
import { FrameRateCounter } from './FrameRateCounter.ts';
import { MenuGamepadNavigation, nextMenuFocusIndex, type MenuAction } from './MenuNavigation.ts';
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

export type GameFlowState =
  | 'loading'
  | 'title'
  | 'opening'
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
  cinematicPlaying = false,
): boolean => state === 'playing' && (gameplayInputEnabled || cinematicPlaying);

/** Story sequences may lock character controls without giving up native pause. */
export const gameFlowCinematicCanPause = (
  cinematic: string | undefined,
  gameState: string | undefined,
): boolean => cinematic === 'cultivation-finale' || cinematic === 'cultivation-clearance' ||
  cinematic === 'blackout-arrival' || cinematic === 'containment-finale' && gameState === 'level-completing';

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
  pauseCode = 'KeyP',
): GameFlowKeyboardAction | null => {
  const hasModifier = modifiers.altKey || modifiers.ctrlKey ||
    modifiers.metaKey || (modifiers.shiftKey && code !== 'ShiftLeft' && code !== 'ShiftRight');
  if (!hasModifier && code === pauseCode && state === 'playing') return 'pause';
  if (!hasModifier && code === pauseCode && state === 'paused') return 'resume';
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
  const start = creditsMarkdown.indexOf('## ');
  const sections = start < 0 ? '' : creditsMarkdown.slice(start).split('## Maintaining this ledger')[0];
  const lines = sections.trim().split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line || line === '# Credits') continue;

    if (line.startsWith('## ')) {
      const heading = ledger.ownerDocument.createElement('h2');
      const label = line.slice(3);
      const symbols = { 'Game developers': 'Code', Music: 'Music2', 'Sound effects': 'Volume2', Tools: 'Cpu', Fonts: 'Type', Code: 'Code' } as const;
      const symbol = symbols[label as keyof typeof symbols];
      if (symbol) heading.innerHTML = icon(symbol);
      heading.append(ledger.ownerDocument.createTextNode(label));
      ledger.append(heading);
      continue;
    }

    if (line.startsWith('- ')) {
      const list = ledger.ownerDocument.createElement('ul');
      list.className = 'credits-entries credits-developers';
      while (index < lines.length && lines[index]?.trim().startsWith('- ')) {
        const item = ledger.ownerDocument.createElement('li');
        item.className = 'credits-entry';
        appendCreditsInlineContent(item, lines[index]!.trim().slice(2));
        list.append(item);
        index += 1;
      }
      ledger.append(list);
      index -= 1;
      continue;
    }

    if (
      line.startsWith('|') &&
      /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[index + 1]?.trim() ?? '')
    ) {
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
        const source = parseCreditsInlineParts(values[2] ?? '').find(part => part.href);
        if (source?.href) {
          const link = ledger.ownerDocument.createElement('a');
          appendCreditsInlineContent(link, values[0] ?? '');
          link.href = source.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', `${link.textContent} (opens in a new tab)`);
          link.insertAdjacentHTML('beforeend', icon('ExternalLink'));
          title.append(link);
        } else {
          appendCreditsInlineContent(title, values[0] ?? '');
        }
        entry.append(title);

        const creator = ledger.ownerDocument.createElement('p');
        creator.className = 'credits-creator';
        appendCreditsInlineContent(creator, values[1] ?? '');
        const use = ledger.ownerDocument.createElement('p');
        use.className = 'credits-use';
        appendCreditsInlineContent(use, values[4] ?? '');
        const licence = ledger.ownerDocument.createElement('span');
        licence.className = 'credits-licence';
        appendCreditsInlineContent(licence, values[3] ?? '');
        entry.append(creator, use, licence);
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

  beginOpening(): boolean {
    return this.transitionFrom('title', 'opening');
  }

  finishOpening(): boolean {
    return this.transitionFrom('opening', 'playing');
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
  playOpening?(): void;
  enableMusic?(): void;
  skipOpening?(): void;
  retryOpening?(): void;
  startGameplay(): void;
  stopGameplay(): void;
  setGameplayInputEnabled(enabled: boolean): void;
  setDebugInteractionEnabled(enabled: boolean): void;
  requestPointerLock(): void;
  releasePointerLock(): void;
  isPointerLocked(): boolean;
  isGameplayInputEnabled(): boolean;
  isCinematicPlaying?(): boolean;
  restartLevel(): void;
  recalibrateGraphics?(): Promise<void>;
  applySettings(settings: Readonly<GameSettingsSnapshot>): void;
  getGraphicsDiagnostics?(): GraphicsDiagnostics;
  subscribeGraphicsDiagnostics?(listener: () => void): () => void;
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
  'opening',
  'paused',
  'settings',
  'credits',
  'restarting',
  'transitioning',
  'transitionFailed',
]);

const MENU_NAVIGATION_STATES = new Set<GameFlowState>(['title', 'opening', 'paused', 'settings', 'credits']);

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
  private readonly pixelBudgetInput: HTMLSelectElement;
  private readonly shadowQualityInput: HTMLSelectElement;
  private readonly effectsDensityInput: HTMLSelectElement;
  private readonly graphicsDiagnostics: HTMLElement;
  private readonly showFPSInput: HTMLInputElement;
  private readonly reduceMenuMotionInput: HTMLInputElement;
  private readonly settingsFeedback: HTMLElement;
  private readonly settingHelp: SettingHelp;
  private readonly additionalControls: AdditionalSettingsControls;
  private readonly fpsOutput: HTMLElement;
  private readonly frameRate = new FrameRateCounter();
  private readonly gamepadNavigation = new MenuGamepadNavigation();
  private hasGamepad = false;
  private readonly slimeRoster: HTMLElement;
  private readonly rosterPresentation: SlimeRosterPresentation;
  private readonly controlHints: HudPanelPresentation;
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
  private disposed = false;

  constructor(options: GameFlowUIOptions) {
    this.actions = options.actions;
    this.model = new GameFlowStateModel();
    this.settings = options.settings;
    this.hostDocument = options.document ?? document;
    this.hostWindow = options.window ?? window;
    this.element = this.createElement(options.creditsMarkdown);

    this.requireElement('.title-description').textContent = chooseTitleScreenLine(this.hostWindow);
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
    this.pixelBudgetInput = this.requireElement<HTMLSelectElement>('[data-setting="pixel-budget"]');
    this.shadowQualityInput = this.requireElement<HTMLSelectElement>('[data-setting="shadow-quality"]');
    this.effectsDensityInput = this.requireElement<HTMLSelectElement>('[data-setting="effects-density"]');
    this.graphicsDiagnostics = this.requireElement('[data-graphics-diagnostics]');
    this.showFPSInput = this.requireElement<HTMLInputElement>('[data-setting="show-fps"]');
    this.reduceMenuMotionInput = this.requireElement<HTMLInputElement>('[data-setting="reduce-menu-motion"]');
    this.settingsFeedback = this.requireElement('[data-settings-feedback]');
    this.fpsOutput = this.requireElement('[data-fps-counter]');
    this.renderResolutionInput = this.requireElement<HTMLSelectElement>(
      '[data-setting="render-resolution"]',
    );
    this.graphicsPresetInput = this.requireElement<HTMLSelectElement>(
      '[data-setting="graphics-preset"]',
    );
    this.slimeRoster = this.requireElement('[data-slime-roster]');
    this.passiveStatus = this.requireElement('[data-passive-status]');
    this.switchFeedback = this.requireElement('[data-switch-feedback]');
    this.rosterPresentation = new SlimeRosterPresentation(this.requireElement('.hud-roster'), this.hostWindow);
    this.controlHints = new HudPanelPresentation(this.requireElement('.hud-controls'),
      this.requireElement('.hud-hint'), this.requireElement('.hud-controls-summary'), this.hostWindow, 'Y');
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

    this.settingHelp = new SettingHelp(this.requireElement('[data-flow-panel="settings"]'), this.hostWindow);
    this.additionalControls = new AdditionalSettingsControls(this.requireElement('[data-flow-panel="settings"]'),
      this.settings, this.hostWindow, () => this.settingHelp.dismiss());
    this.bindActions();
    this.hasGamepad = this.readGamepads().some(pad => pad?.connected && pad.mapping === 'standard');
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

  /** Reuse the existing application loop; FPS DOM writes are limited to twice/second. */
  updateFrame(deltaSeconds: number): void {
    if (this.disposed) return;
    if (this.hasGamepad && this.menuNavigable) {
      const pad = this.readGamepads().find(candidate => candidate?.connected && candidate.mapping === 'standard');
      const action = this.gamepadNavigation.sample(pad ?? undefined, deltaSeconds);
      if (action) this.navigateMenu(action);
    }
    if (this.model.state === 'playing' && this.actions.isGameplayInputEnabled()) {
      this.rosterPresentation.update(deltaSeconds);
      this.controlHints.update(deltaSeconds);
    }
    if (this.model.state !== 'playing' || !this.settings.value.showFPS) return;
    const fps = this.frameRate.sample(deltaSeconds);
    if (fps !== undefined) {
      const text = `${fps} FPS`;
      if (this.fpsOutput.textContent !== text) this.fpsOutput.textContent = text;
    }
  }

  completeBoot(): void {
    if (!this.model.completeBoot()) return;
    this.syncState();
  }

  /** Show a small opt-in button only when the browser denies audible autoplay. */
  setMusicUnlockRequired(required: boolean): void {
    if (this.disposed) return;
    this.requireElement<HTMLElement>('[data-title-music-prompt]').hidden = !required;
  }

  finishOpening(userGesture = false): void {
    if (this.model.state !== 'opening') return;
    this.actions.startGameplay();
    if (!this.model.finishOpening()) return;
    this.syncState();
    // Automatic playback cannot claim a fresh browser user activation.
    if (userGesture) this.actions.requestPointerLock();
  }

  setOpeningStatus(message: string, failed: boolean): void {
    const status = this.requireElement('[data-opening-status]');
    if (status.textContent !== message) status.textContent = message;
    this.requireElement<HTMLButtonElement>('[data-action="retry-opening"]').hidden = !failed;
  }

  setOpeningFade(opacity: number): void {
    this.element.style.setProperty('--opening-fade', String(opacity));
  }

  subscribe(listener: GameFlowStateListener): () => void {
    return this.model.subscribe(listener);
  }

  setObjective(objective: string): void {
    const nextObjective = objective.trim();
    if (!nextObjective) throw new Error('Gameplay objectives cannot be empty.');
    this.objective.textContent = nextObjective;
  }

  beginLevelTransition(
    message: string,
    levelId: 'level-2' | 'level-3' = 'level-2',
  ): void {
    if (!this.model.beginLevelTransition()) return;
    const levelTwo = levelId === 'level-2';
    this.transitionRuntimeLabel.textContent = levelTwo
      ? 'Cultivation'
      : 'Blackout';
    this.transitionMessage.textContent = message;
    this.transitionCopy.textContent = 'Preparing the next level.';
    this.transitionContinueButton.hidden = true;
    this.switchFeedbackModel.clear();
    this.switchFeedback.textContent = '';
    this.syncState();
  }

  finishLevelTransition(levelId: 'level-2' | 'level-3' = 'level-2'): void {
    if (this.model.state !== 'transitioning') return;
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
    this.rosterPresentation.dispose();
    this.controlHints.dispose();
    this.additionalControls.dispose();
    this.settingHelp.dispose();
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
          <h1 id="loading-title">Preparing game</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" role="status" aria-live="polite">Loading Containment.</p>
        </div>
      </section>

      <section class="flow-screen title-screen" data-flow-panel="title" aria-labelledby="title-heading" hidden>
        <div class="title-composition">
          <header class="title-branding">
            <div class="title-signature">
              ${createBrandMarkMarkup('detailed', 'title-brand-mark')}
              <p class="title-tagline">Explore <span aria-hidden="true">·</span> Adapt <span aria-hidden="true">·</span> Transcend</p>
            </div>
            <h1 id="title-heading">Specimen</h1>
          </header>
          <div class="title-divider" aria-hidden="true"></div>
          <p class="title-description"></p>
          <nav class="flow-actions game-menu title-actions" aria-label="Main menu">
            <button class="primary-action menu-action" data-action="start" data-autofocus>
              ${icon('Play')}<span>Start trial</span>
            </button>
            <button class="menu-action" data-action="settings">
              ${icon('Settings')}<span>Settings</span>
            </button>
            <button class="menu-action" data-action="credits">
              ${icon('Info')}<span>Credits</span>
            </button>
          </nav>
          <p class="title-music-prompt" data-title-music-prompt hidden>
            <button type="button" class="system-action" data-action="enable-music">${icon('Volume2')}<span>Enable music</span></button>
          </p>
        </div>
      </section>

      <section class="flow-screen opening-screen" data-flow-panel="opening" aria-label="Bob's awakening" hidden>
        <div class="opening-fade" aria-hidden="true"></div>
        <div class="opening-letterbox opening-letterbox-top" aria-hidden="true"></div>
        <div class="opening-letterbox opening-letterbox-bottom" aria-hidden="true"></div>
        <div class="opening-controls">
          <p class="system-status" data-opening-status role="status" aria-live="polite"></p>
          <button type="button" class="system-action" data-action="retry-opening" hidden>${icon('RotateCcw')}<span>Retry</span></button>
          <button type="button" class="system-action" data-action="skip-opening" data-autofocus>${icon('SkipForward')}<span>Skip intro</span><kbd>Esc</kbd></button>
        </div>
      </section>

      <output class="game-fps" data-fps-counter aria-label="Frames per second" aria-live="off" hidden>— FPS</output>
      <aside class="game-hud" data-flow-panel="playing" aria-label="Gameplay guidance" hidden>
        <section class="hud-objective-module" aria-labelledby="hud-objective-heading">
          <p class="system-label" id="hud-objective-heading">Objective</p>
          <div class="hud-objective-line">
            ${icon('Flag')}
            <p class="hud-objective" data-current-objective role="status" aria-live="polite">Climb through the vent</p>
          </div>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
        </section>
        <section class="hud-roster" data-collapsed="false" aria-labelledby="hud-roster-heading">
          <div class="hud-roster-summary" role="note" aria-label="Press Tab to view specimens" aria-hidden="true">
            <img class="hud-slime-portrait" data-roster-active-portrait alt="" width="44" height="44" draggable="false" hidden>
            <kbd data-control-hint="switchSlime">Tab</kbd>
          </div>
          <div class="hud-roster-content">
          <header class="hud-roster-header">
            <p class="system-label" id="hud-roster-heading">Specimens</p>
          </header>
          <ul class="hud-roster-list" data-slime-roster aria-label="Unlocked playable slimes"></ul>
          <p class="system-status hud-passive-status" data-passive-status role="status" aria-live="polite" hidden></p>
          <p class="system-status hud-switch-feedback" data-switch-feedback role="status" aria-live="polite"></p>
          </div>
        </section>
        <div class="hud-controls" data-collapsed="false">
          <p class="hud-hint"><span><kbd data-control-hint="movement">WASD</kbd> Move</span><span><kbd data-control-hint="jump">Space</kbd> Jump</span><span><kbd data-control-hint="switchSlime">Tab</kbd> Switch</span><span><kbd data-control-hint="pause">P</kbd> Pause</span></p>
          <div class="hud-controls-summary" role="note" aria-label="Press H to show controls" aria-hidden="true">${icon('Keyboard')}<span>Controls</span><kbd>H</kbd></div>
        </div>
      </aside>

      <section class="flow-screen pause-screen" data-flow-panel="paused" aria-labelledby="pause-heading" hidden>
        <div class="pause-rail">
          <header class="pause-heading">
            ${createBrandMarkMarkup('simple', 'pause-brand-mark')}
            <div>
              <h1 id="pause-heading">Paused</h1>
            </div>
          </header>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <div class="flow-actions game-menu pause-actions">
            <button class="primary-action menu-action" data-action="resume" data-autofocus>
              ${icon('Play')}<span>Resume</span>
            </button>
            <button class="menu-action pause-restart" data-action="restart">
              ${icon('RotateCcw')}<span>Restart trial</span>
            </button>
            <button class="menu-action" data-action="settings">
              ${icon('Settings')}<span>Settings</span>
            </button>
            <button class="menu-action" data-action="credits">
              ${icon('Info')}<span>Credits</span>
            </button>
          </div>
          <p class="system-status" data-restart-status role="status" aria-live="polite"></p>
        </div>
      </section>

      ${createSettingsPanelMarkup()}

      <section class="flow-screen submenu-screen credits-screen" data-flow-panel="credits" aria-labelledby="credits-heading" hidden>
        <div class="system-panel lab-menu-panel credits-panel">
          <header class="system-panel-header credits-header">
            <span class="signal-bar" aria-hidden="true"></span>
            <h1 id="credits-heading">Credits</h1>
          </header>
          <div class="credits-ledger" role="region" aria-label="Credits" tabindex="-1"></div>
          <footer class="credits-footer">
            <button type="button" class="system-action" data-action="back" data-autofocus>
              ${icon('ArrowLeft')}<span>Back</span>
            </button>
          </footer>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="restarting" aria-labelledby="restarting-heading" hidden>
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <h1 id="restarting-heading">Restarting</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" role="status" aria-live="polite">Restoring the level.</p>
        </div>
      </section>

      <section class="flow-screen" data-flow-panel="transitioning" aria-labelledby="transition-heading" hidden>
        <div class="system-state">
          ${createBrandedScannerMarkup()}
          <p class="system-label" data-transition-runtime-label>Cultivation</p>
          <h1 id="transition-heading" data-transition-message>Entering Level 2…</h1>
          <div class="signal-rule" aria-hidden="true"><span></span></div>
          <p class="system-copy" data-transition-copy role="status" aria-live="polite">Preparing the next level.</p>
          <button class="system-action primary-action transition-action" type="button" data-action="enter-level" hidden>
            ${icon('ArrowRight')}<span>Enter Level 2</span>
          </button>
        </div>
      </section>

      <section class="flow-screen transition-failed-screen" data-flow-panel="transitionFailed" aria-labelledby="transition-failed-heading" hidden>
        <div class="system-state system-state--failure">
          ${createBrandMarkMarkup('simple', 'failure-brand-mark')}
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
      if (profile === 'custom' || isGraphicsProfileId(profile)) this.settings.setGraphicsProfile(profile);
    }, { signal });
    this.renderScaleInput.addEventListener('change', () => {
      const scale = Number(this.renderScaleInput.value);
      if (isRenderScale(scale)) this.settings.setRenderScale(scale);
    }, { signal });
    this.pixelBudgetInput.addEventListener('change', () => {
      const budget = GRAPHICS_PIXEL_BUDGETS.find(value => value === Number(this.pixelBudgetInput.value));
      if (budget !== undefined) this.settings.setPixelBudget(budget);
    }, { signal });
    this.shadowQualityInput.addEventListener('change', () => {
      const cap = SHADOW_MAP_CAPS.find(value => value === Number(this.shadowQualityInput.value));
      if (cap !== undefined) this.settings.setShadowMapSizeCap(cap);
    }, { signal });
    this.effectsDensityInput.addEventListener('change', () => {
      const density = EFFECTS_DENSITIES.find(value => value === Number(this.effectsDensityInput.value));
      if (density !== undefined) this.settings.setEffectsDensity(density);
    }, { signal });
    this.renderResolutionInput.addEventListener(
      'change',
      this.onRenderResolutionChange,
      { signal },
    );
    this.graphicsPresetInput.addEventListener('change', this.onGraphicsPresetChange, { signal });
    this.showFPSInput.addEventListener('change', () => this.settings.setShowFPS(this.showFPSInput.checked), { signal });
    this.reduceMenuMotionInput.addEventListener('change', () => this.settings.setReduceMenuMotion(this.reduceMenuMotionInput.checked), { signal });
    this.hostWindow.addEventListener('gamepadconnected', this.onGamepadChanged, { signal });
    this.hostWindow.addEventListener('gamepaddisconnected', this.onGamepadChanged, { signal });
    this.hostWindow.addEventListener('keydown', this.onKeyDown, { signal });
    this.hostWindow.addEventListener('blur', this.onWindowBlur, { signal });
    this.hostDocument.addEventListener('visibilitychange', () => {
      if (this.hostDocument.hidden) this.onWindowBlur();
    }, { signal });
    this.hostWindow.addEventListener('resize', this.syncGraphicsDiagnostics, { signal });
    this.hostDocument.addEventListener(
      'pointerlockchange',
      this.onPointerLockChange,
      { signal },
    );
  }

  private syncState(): void {
    this.settingHelp.dismiss();
    this.additionalControls.dismiss();
    this.syncGraphicsDiagnostics();
    const state = this.model.state;
    this.element.dataset.state = state;
    this.element.dataset.menuOrigin = this.model.menuOrigin;
    this.gamepadNavigation.reset();
    this.syncFPSVisibility();
    for (const [panelState, panel] of this.panels) {
      panel.hidden = panelState !== state;
    }

    const gameplayActive = state === 'playing';
    if (gameplayActive) {
      this.rosterPresentation.reset();
      this.controlHints.reset();
    }
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
        this.actions.isCinematicPlaying?.(),
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
      case 'enable-music':
        if (this.model.state === 'title') this.actions.enableMusic?.();
        break;
      case 'start':
        if (this.actions.playOpening && this.model.beginOpening()) {
          this.syncState();
          this.actions.playOpening();
          break;
        }
        if (this.model.state === 'title') {
          this.actions.startGameplay();
        }
        if (this.model.start()) {
          this.syncState();
          this.actions.requestPointerLock();
        }
        break;
      case 'skip-opening':
        if (this.model.state === 'opening') this.actions.skipOpening?.();
        break;
      case 'retry-opening':
        if (this.model.state === 'opening') this.actions.retryOpening?.();
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        this.restart();
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
        this.focusTargets.set(this.model.state, target);
        this.settingsFeedback.textContent = '';
        this.selectSettingsSection(this.requireElement<HTMLButtonElement>('#settings-tab-graphics'));
        if (this.model.openSettings()) this.syncState();
        break;
      case 'credits':
        this.focusTargets.set(this.model.state, target);
        if (this.model.openCredits()) this.syncState();
        break;
      case 'settings-section': {
        if (this.model.state !== 'settings') break;
        this.selectSettingsSection(target);
        break;
      }
      case 'calibrate-graphics':
        if (!this.actions.recalibrateGraphics || target.disabled) break;
        target.disabled = true;
        this.settingHelp.dismiss();
        this.settingsFeedback.textContent = 'Checking graphics…';
        void this.actions.recalibrateGraphics().then(() => {
          if (!this.disposed) this.settingsFeedback.textContent = 'Graphics adjusted.';
        }, () => {
          if (!this.disposed) this.settingsFeedback.textContent = 'Could not check graphics. Your settings are kept.';
        }).finally(() => { if (!this.disposed) target.disabled = false; });
        break;
      case 'reset-settings':
        if (this.model.state !== 'settings') break;
        this.settings.resetToDefaults();
        this.settingsFeedback.textContent = 'Default settings restored.';
        break;
      case 'back':
        if (this.model.back()) this.syncState();
        break;
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.model.state === 'playing' && event.code === 'KeyH' && !event.repeat &&
      !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && this.actions.isGameplayInputEnabled()) {
      const target = event.target as HTMLElement | null;
      if (!target?.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) {
        event.preventDefault();
        this.controlHints.toggle();
        return;
      }
    }
    if (this.model.state === 'playing' && event.code === this.settings.value.keyBindings.switchSlime && !event.repeat &&
      !event.altKey && !event.ctrlKey && !event.metaKey && this.actions.isGameplayInputEnabled()) {
      this.rosterPresentation.reveal();
    }
    if (this.model.state === 'opening' && event.code === 'Escape' &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) this.actions.skipOpening?.();
      return;
    }
    const action = getGameFlowKeyboardAction(
      event.code,
      this.model.state,
      event,
      this.settings.value.keyBindings.pause,
    );

    if (action === null && this.onMenuKeyDown(event)) return;
    if (event.repeat) return;

    if (action === 'pause') {
      if (!gameFlowCanPause(this.model.state, this.actions.isGameplayInputEnabled(), this.actions.isCinematicPlaying?.())) return;
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
    if (this.settings.value.pauseInBackground) this.pause();
  };

  private readonly onPointerLockChange = (): void => {
    if (!this.settings.value.pauseInBackground && (this.hostDocument.hidden || !this.hostDocument.hasFocus())) return;
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
    this.pixelBudgetInput.value = String(settings.pixelBudget);
    this.shadowQualityInput.value = String(settings.shadowMapSizeCap);
    this.effectsDensityInput.value = String(settings.effectsDensity);
    this.showFPSInput.checked = settings.showFPS;
    this.reduceMenuMotionInput.checked = settings.reduceMenuMotion;
    const outputValues: Record<string, string> = {
      'graphics-profile': graphicsProfileName(settings) === 'custom' ? 'Custom' : GRAPHICS_PROFILES[settings.graphicsProfile].label,
      'pixel-budget': this.pixelBudgetInput.selectedOptions[0]?.textContent ?? '',
      'shadow-quality': this.shadowQualityInput.selectedOptions[0]?.textContent ?? '',
      'effects-density': `${Math.round(settings.effectsDensity * 100)}%`,
      'graphics-preset': performance ? 'On' : 'Off',
      'render-resolution': `${Number(this.renderResolutionInput.value).toFixed(2)}×`,
      'render-scale': `${Math.round(settings.renderScale * 100)}%`,
      'gel-rendering': settings.gelRenderingMode === 'minimum' ? 'Glossy' : settings.gelRenderingMode === 'physical' ? 'High' : 'Balanced',
      'show-fps': settings.showFPS ? 'On' : 'Off',
      'reduce-menu-motion': settings.reduceMenuMotion ? 'On' : 'Off',
    };
    for (const [key, value] of Object.entries(outputValues)) {
      this.requireElement<HTMLOutputElement>(`[data-setting-output="${key}"]`).value = value;
    }
    this.additionalControls.sync(settings);
    this.rosterPresentation.setVisibilityMode(settings.hudVisibility);
    this.controlHints.setVisibilityMode(settings.hudVisibility);
    this.rosterPresentation.setSwitchKeyLabel(keyLabel(settings.keyBindings.switchSlime));
    for (const hint of this.element.querySelectorAll<HTMLElement>('[data-control-hint]')) {
      const action = hint.dataset.controlHint!;
      hint.textContent = action === 'movement'
        ? ['moveForward', 'moveLeft', 'moveBackward', 'moveRight'].map(id => keyLabel(settings.keyBindings[id as keyof typeof settings.keyBindings])).join(' ')
        : keyLabel(settings.keyBindings[action as keyof typeof settings.keyBindings]);
    }
    for (const item of this.slimeRoster.querySelectorAll<HTMLElement>('[data-state="switchable"]')) {
      const label = keyLabel(settings.keyBindings.switchSlime);
      item.querySelector<HTMLElement>('.hud-slime-control')!.textContent = `${label} to switch`;
      item.setAttribute('aria-label', `${item.querySelector('.hud-slime-identity')!.textContent}: inactive, available with ${label}`);
    }
    this.syncFPSVisibility();
    this.actions.applySettings(settings);
    this.syncGraphicsDiagnostics();
  };

  private readonly syncGraphicsDiagnostics = (): void => {
    const diagnostics = this.actions.getGraphicsDiagnostics?.();
    this.graphicsDiagnostics.textContent = diagnostics
      ? `${diagnostics.drawingBufferWidth} × ${diagnostics.drawingBufferHeight} px` : '';
  };

  private syncFPSVisibility(): void {
    this.fpsOutput.hidden = this.model.state !== 'playing' || !this.settings.value.showFPS;
    this.frameRate.reset();
    this.fpsOutput.textContent = '— FPS';
  }

  private get menuNavigable(): boolean {
    return MENU_NAVIGATION_STATES.has(this.model.state);
  }

  private readGamepads(): (Gamepad | null)[] {
    try { return this.hostWindow.navigator.getGamepads?.() ?? []; }
    catch { return []; }
  }

  private readonly onGamepadChanged = (): void => {
    this.hasGamepad = this.readGamepads().some(pad => pad?.connected && pad.mapping === 'standard');
    this.gamepadNavigation.reset();
  };

  private menuControls(): HTMLElement[] {
    const panel = this.panels.get(this.model.state);
    return Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') ?? [])
      .filter(control => !control.closest('[hidden]') &&
        (control.getAttribute('role') !== 'tab' || control.getAttribute('aria-selected') === 'true'));
  }

  private selectSettingsSection(target: HTMLButtonElement): void {
    this.settingHelp.dismiss();
    this.additionalControls.dismiss();
    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('[data-action="settings-section"]')) {
      const selected = tab === target;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      this.requireElement<HTMLElement>(`#settings-${tab.dataset.section}`).hidden = !selected;
    }
    this.focusTargets.set('settings', target);
    this.requireElement<HTMLElement>('.settings-sections').scrollTop = 0;
  }

  private focusMenuControl(control: HTMLElement | undefined): void {
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private navigateMenu(action: MenuAction): void {
    if (!this.menuNavigable) return;
    if (action === 'back') {
      if (this.model.state === 'opening') this.actions.skipOpening?.();
      else if (this.model.state === 'paused') this.resume();
      else if (this.model.back()) this.syncState();
      return;
    }
    const controls = this.menuControls();
    const current = controls.indexOf(this.hostDocument.activeElement as HTMLElement);
    if (action === 'previous' || action === 'next') {
      this.focusMenuControl(controls[nextMenuFocusIndex(current, controls.length, action === 'next' ? 1 : -1)]);
      return;
    }
    const control = controls[current] ?? controls[0];
    if (!control) return;
    if (action === 'activate') {
      if (control.tagName !== 'SELECT' && !(control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'range')) control.click();
      return;
    }
    const direction = action === 'increase' ? 1 : -1;
    if (control.getAttribute('role') === 'tab') {
      const tabs = Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-action="settings-section"]'));
      const next = tabs[nextMenuFocusIndex(tabs.indexOf(control as HTMLButtonElement), tabs.length, direction)];
      this.selectSettingsSection(next);
      this.focusMenuControl(next);
    } else if (control.tagName === 'SELECT') {
      const select = control as HTMLSelectElement;
      const options = Array.from(select.options).filter(option => !option.disabled);
      const index = options.indexOf(select.selectedOptions[0]);
      const option = options[Math.min(options.length - 1, Math.max(0, index + direction))];
      if (option && select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'range') {
      const range = control as HTMLInputElement;
      const value = Math.min(Number(range.max), Math.max(Number(range.min), range.valueAsNumber + direction * Number(range.step || 1)));
      if (value !== range.valueAsNumber) {
        range.valueAsNumber = value;
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  private onMenuKeyDown(event: KeyboardEvent): boolean {
    if (!this.menuNavigable || event.altKey || event.ctrlKey || event.metaKey) return false;
    const controls = this.menuControls(), active = this.hostDocument.activeElement as HTMLElement | null;
    const current = controls.indexOf(active!);
    if (active?.getAttribute('role') === 'tab') {
      const tabs = Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-action="settings-section"]'));
      const index = tabs.indexOf(active as HTMLButtonElement);
      const next = event.code === 'ArrowRight' ? (index + 1) % tabs.length
        : event.code === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.code === 'Home' ? 0 : event.code === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) {
        event.preventDefault();
        this.selectSettingsSection(tabs[next]);
        this.focusMenuControl(tabs[next]);
        return true;
      }
    }
    if (event.code === 'Tab') {
      if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === controls.length - 1)) {
        event.preventDefault();
        this.focusMenuControl(controls[event.shiftKey ? controls.length - 1 : 0]);
        return true;
      }
    } else if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && active?.tagName !== 'SELECT') {
      event.preventDefault();
      this.navigateMenu(event.code === 'ArrowDown' ? 'next' : 'previous');
      return true;
    } else if ((event.code === 'Home' || event.code === 'End') && (active?.tagName === 'BUTTON' || active?.tagName === 'A')) {
      event.preventDefault();
      this.focusMenuControl(controls[event.code === 'Home' ? 0 : controls.length - 1]);
      return true;
    } else if (event.code === 'Enter' && active?.tagName === 'INPUT' && (active as HTMLInputElement).type === 'checkbox') {
      event.preventDefault();
      if (!event.repeat) active.click();
      return true;
    }
    return false;
  }

  private readonly onSlimeHUDChanged = (snapshot: SlimeHUDSnapshot): void => {
    this.switchFeedback.textContent = this.switchFeedbackModel.update(snapshot);

    const entries = snapshot.roster.flatMap((entry) => {
      const view = getSlimeRosterEntryView(entry, keyLabel(this.settings.value.keyBindings.switchSlime));
      if (!view) return [];

      const item = this.hostDocument.createElement('li');
      item.className = 'hud-slime-entry';
      item.dataset.slimeId = entry.id;
      item.dataset.state = view.state;
      item.setAttribute('aria-label', view.ariaLabel);

      const badge = this.hostDocument.createElement('span');
      badge.className = 'hud-slime-badge';
      badge.setAttribute('aria-hidden', 'true');
      const portrait = this.hostDocument.createElement('img');
      portrait.className = 'hud-slime-portrait';
      portrait.src = SLIME_PORTRAITS[entry.id];
      portrait.alt = '';
      portrait.width = 44;
      portrait.height = 44;
      portrait.draggable = false;
      portrait.decoding = 'async';
      badge.append(portrait);

      const identity = this.hostDocument.createElement('span');
      identity.className = 'hud-slime-identity';
      identity.textContent = entry.displayName;

      const state = this.hostDocument.createElement('span');
      state.className = 'hud-slime-state';
      state.textContent = view.stateLabel;

      const control = this.hostDocument.createElement('span');
      control.className = 'hud-slime-control';
      control.textContent = view.controlLabel;
      control.hidden = !view.controlLabel;

      item.append(badge, identity, state, control);
      return [item];
    });
    this.slimeRoster.replaceChildren(...entries);
    const passiveStatus = formatPassiveInteractionStatus(snapshot);
    this.passiveStatus.textContent = passiveStatus ?? '';
    this.passiveStatus.hidden = passiveStatus === undefined;
    this.rosterPresentation.observe(snapshot, passiveStatus);
  };
}
