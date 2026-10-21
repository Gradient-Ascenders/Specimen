import { KEY_BINDING_ACTIONS, keyLabel, type RebindableAction } from '../core/KeyBindings.ts';
import { GameSettings, type GameSettingsSnapshot, type HUDVisibility, type FrameRateLimit, type CameraShake } from './GameSettings.ts';

type Control = HTMLInputElement | HTMLSelectElement;

/** Display/audio/accessibility preferences and user-gesture browser controls. */
export class AdditionalSettingsControls {
  private readonly events = new AbortController();
  private readonly originalFontSize: string;
  private capturing: RebindableAction | undefined;
  private disposed = false;
  private fullscreenPending = false;

  constructor(root: HTMLElement, settings: GameSettings, hostWindow: Window, dismissHelp: () => void) {
    this.root = root;
    this.settings = settings;
    this.dismissHelp = dismissHelp;
    this.originalFontSize = this.root.ownerDocument.documentElement.style.fontSize;
    const { signal } = this.events;
    const bind = (key: string, apply: (control: Control) => void): void => {
      const control = this.control(key);
      control.addEventListener(control.type === 'range' ? 'input' : 'change', () => apply(control), { signal });
    };
    bind('music-volume', c => settings.setMusicVolume(Number(c.value) / 100));
    bind('brightness', c => settings.setBrightness(Number(c.value) / 100));
    bind('field-of-view', c => settings.setFieldOfViewDegrees(Number(c.value)));
    bind('interface-scale', c => settings.setInterfaceScale(Number(c.value) / 100));
    bind('frame-rate-limit', c => settings.setFrameRateLimit(Number(c.value) as FrameRateLimit));
    bind('camera-shake', c => settings.setCameraShake(Number(c.value) as CameraShake));
    bind('hud-visibility', c => settings.setHUDVisibility(c.value as HUDVisibility));
    bind('pause-background', c => settings.setPauseInBackground((c as HTMLInputElement).checked));
    bind('mute-background', c => settings.setMuteInBackground((c as HTMLInputElement).checked));
    bind('fullscreen', () => { void this.toggleFullscreen(); });
    this.root.ownerDocument.addEventListener('fullscreenchange', () => this.syncFullscreen(), { signal });
    this.root.addEventListener('click', event => {
      const button = (event.target as Element | null)?.closest<HTMLElement>('[data-binding]');
      if (!button) return;
      this.dismiss();
      dismissHelp();
      this.capturing = button.dataset.binding as RebindableAction;
      button.textContent = 'Press a key…';
      button.classList.add('is-listening');
      this.feedback('Escape cancels.');
    }, { signal });
    hostWindow.addEventListener('keydown', this.captureKey, { signal, capture: true });
    hostWindow.addEventListener('pointerdown', event => {
      if (this.capturing && !(event.target as Element | null)?.closest('[data-binding]')) this.dismiss();
    }, { signal, capture: true });
    hostWindow.addEventListener('blur', () => this.dismiss(), { signal });
    this.syncFullscreen();
  }

  private readonly root: HTMLElement;
  private readonly settings: GameSettings;
  private readonly dismissHelp: () => void;

  sync(settings: Readonly<GameSettingsSnapshot>): void {
    const ranges = [
      ['music-volume', Math.round(settings.musicVolume * 100), '%'],
      ['brightness', Math.round(settings.brightness * 100), '%'],
      ['field-of-view', settings.fieldOfViewDegrees, '°'],
      ['interface-scale', Math.round(settings.interfaceScale * 100), '%'],
    ] as const;
    for (const [key, value, suffix] of ranges) {
      const control = this.control(key) as HTMLInputElement;
      control.value = String(value);
      control.style.setProperty('--range-progress', `${(value - Number(control.min)) / (Number(control.max) - Number(control.min)) * 100}%`);
      this.output(key).value = `${value}${suffix}`;
    }
    for (const [key, value] of [
      ['frame-rate-limit', settings.frameRateLimit], ['hud-visibility', settings.hudVisibility], ['camera-shake', settings.cameraShake],
    ] as const) {
      const control = this.control(key) as HTMLSelectElement;
      control.value = String(value);
      this.output(key).value = control.selectedOptions[0]?.textContent ?? '';
    }
    for (const [key, checked] of [['pause-background', settings.pauseInBackground], ['mute-background', settings.muteInBackground]] as const) {
      (this.control(key) as HTMLInputElement).checked = checked;
      this.output(key).value = checked ? 'On' : 'Off';
    }
    this.root.ownerDocument.documentElement.style.fontSize = `${16 * settings.interfaceScale}px`;
    this.root.style.setProperty('--calibration-brightness', String(settings.brightness));
    for (const [action, label] of KEY_BINDING_ACTIONS) {
      const button = this.bindingButton(action);
      if (action !== this.capturing) button.textContent = keyLabel(settings.keyBindings[action]);
      button.setAttribute('aria-label', `${label}: ${keyLabel(settings.keyBindings[action])}. Change key.`);
    }
  }

  dismiss(): void {
    if (!this.capturing) return;
    const button = this.bindingButton(this.capturing);
    button.textContent = keyLabel(this.settings.value.keyBindings[this.capturing]);
    button.classList.remove('is-listening');
    this.capturing = undefined;
    this.feedback('');
  }

  dispose(): void {
    this.disposed = true;
    this.dismiss();
    this.events.abort();
    this.root.ownerDocument.documentElement.style.fontSize = this.originalFontSize;
  }

  private control(key: string): Control { return this.root.querySelector<Control>(`[data-setting="${key}"]`)!; }
  private output(key: string): HTMLOutputElement { return this.root.querySelector<HTMLOutputElement>(`[data-setting-output="${key}"]`)!; }
  private bindingButton(action: RebindableAction): HTMLButtonElement { return this.root.querySelector<HTMLButtonElement>(`[data-binding="${action}"]`)!; }
  private feedback(message: string): void { this.root.querySelector<HTMLElement>('[data-binding-feedback]')!.textContent = message; }

  private readonly captureKey = (event: KeyboardEvent): void => {
    if (!this.capturing) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.code === 'Escape') { this.dismiss(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey) { this.feedback('Choose a key without Ctrl, Alt or Meta.'); return; }
    const conflict = KEY_BINDING_ACTIONS.find(([id]) => id !== this.capturing && this.settings.value.keyBindings[id] === event.code);
    if (!this.settings.setKeyBinding(this.capturing, event.code)) {
      this.feedback(conflict ? `Already assigned to ${conflict[1].toLowerCase()}.` : 'That key is reserved. Choose another.');
      return;
    }
    this.dismiss();
  };

  private syncFullscreen(): void {
    const doc = this.root.ownerDocument, control = this.control('fullscreen') as HTMLInputElement;
    control.checked = doc.fullscreenElement !== null;
    control.disabled = this.fullscreenPending || !doc.fullscreenEnabled;
    this.output('fullscreen').value = control.checked ? 'On' : 'Off';
  }

  private async toggleFullscreen(): Promise<void> {
    if (this.fullscreenPending || this.disposed) return;
    const doc = this.root.ownerDocument;
    this.fullscreenPending = true;
    this.syncFullscreen();
    this.dismissHelp();
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else await doc.documentElement.requestFullscreen();
    } catch {
      if (!this.disposed) this.root.querySelector<HTMLElement>('[data-settings-feedback]')!.textContent = 'Fullscreen is unavailable.';
    } finally {
      this.fullscreenPending = false;
      if (!this.disposed) this.syncFullscreen();
    }
  }
}
