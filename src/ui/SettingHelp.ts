import { animate } from 'motion/mini';

const HELP: Readonly<Record<string, string>> = {
  fullscreen: 'Fills the screen. Escape returns to windowed mode.',
  'frame-rate-limit': 'Caps rendering to reduce GPU load. Simulation speed stays the same.',
  brightness: 'Adjusts scene exposure for your display, keeping the authored lighting intact.',
  'field-of-view': 'Vertical viewing angle during gameplay. Wider angles show more of the surroundings.',
  'hud-visibility': 'Controls visible HUD panels. Automatic minimises them after five seconds; F1 hides the HUD completely.',
  'music-volume': 'Adjusts background music without changing sound effects.',
  'pause-background': 'Pauses gameplay when you switch tabs or windows. Resume manually when you return.',
  'mute-background': 'Silences music and sound effects while another tab or window has focus.',
  'camera-shake': 'Reduces or removes authored impact and tremor camera shake.',
  'interface-scale': 'Resizes menus and HUD text without changing the 3D rendering resolution.',
  'graphics-profile': 'Applies a complete graphics setup. Custom keeps your individual choices.',
  'render-scale': 'Lower values render fewer pixels for better performance. Menus and text stay sharp.',
  'render-resolution': 'Limits rendering density on high-resolution displays. Higher values give a sharper image.',
  'pixel-budget': 'Limits the total rendered pixels, preserving your screen’s aspect ratio.',
  'graphics-preset': 'Limits pixel density to 1× and renders refraction at half resolution.',
  'gel-rendering': 'Adds background distortion through specimens. Full refraction uses more GPU time.',
  'shadow-quality': 'Higher limits give sharper shadows where the scene supports them.',
  'effects-density': 'Changes decorative particle counts. Hazards and gameplay cues stay fully visible.',
  'show-fps': 'Shows a small frame-rate counter during play.',
  volume: 'Adjusts the overall volume of music and sound effects.',
  'effects-volume': 'Adjusts sound effects without changing the music volume.',
  sensitivity: 'Changes how quickly the camera turns when you move the mouse.',
  'camera-distance': 'Sets the camera’s follow distance. It moves closer automatically near walls.',
  'invert-vertical': 'Reverses the camera’s up and down mouse movement.',
  'reduce-menu-motion': 'Keeps the title scene still. Saved on this device.',
};

const helpText = (key: string): string | undefined => HELP[key] ?? (key.startsWith('binding-') ? 'Select to assign a key. Escape cancels; each action needs a different key.' : undefined);

/** One reusable tooltip, outside the scroll area and above the menu's backdrop. */
export class SettingHelp {
  private readonly popup: HTMLElement;
  private readonly title: HTMLElement;
  private readonly copy: HTMLElement;
  private readonly events = new AbortController();
  private readonly hostWindow: Window;
  private timer: number | undefined;
  private animation: ReturnType<typeof animate> | undefined;
  private active: HTMLElement | undefined;
  private version = 0;
  private lastPointerDown = 0;
  private pointerFocus: EventTarget | null = null;

  constructor(root: HTMLElement, hostWindow: Window) {
    this.hostWindow = hostWindow;
    const doc = root.ownerDocument;
    this.popup = doc.createElement('div');
    this.popup.id = 'setting-help';
    this.popup.className = 'setting-help';
    this.popup.setAttribute('role', 'tooltip');
    this.popup.setAttribute('popover', 'manual');
    this.popup.hidden = true;
    this.title = doc.createElement('strong');
    this.copy = doc.createElement('p');
    this.popup.append(this.title, this.copy);
    doc.body.append(this.popup);
    const { signal } = this.events;
    for (const control of root.querySelectorAll<HTMLElement>('[data-setting]')) {
      const row = control.closest<HTMLElement>('.setting-row');
      if (!row || !helpText(control.dataset.setting!)) continue;
      row.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') this.schedule(control, 400);
      }, { signal });
      row.addEventListener('pointerleave', () => {
        this.cancelTimer();
        if (doc.activeElement !== control) this.scheduleHide();
      }, { signal });
      control.addEventListener('focus', () => {
        if (this.pointerFocus !== control || Date.now() - this.lastPointerDown > 100) this.schedule(control, 150);
      }, { signal });
      control.addEventListener('blur', () => { this.cancelTimer(); this.scheduleHide(); }, { signal });
    }
    this.popup.addEventListener('pointerenter', () => this.cancelTimer(), { signal });
    this.popup.addEventListener('pointerleave', () => {
      if (doc.activeElement !== this.active) this.scheduleHide();
    }, { signal });
    root.addEventListener('pointerdown', event => {
      this.pointerFocus = event.target;
      this.lastPointerDown = Date.now();
      this.dismiss();
    }, { signal });
    root.addEventListener('scroll', () => {
      this.dismiss();
      const control = root.querySelector<HTMLElement>('.setting-row:hover [data-setting], [data-setting]:focus');
      if (control) this.schedule(control, 250);
    }, { signal, capture: true });
    hostWindow.addEventListener('resize', () => this.dismiss(), { signal });
    hostWindow.addEventListener('blur', () => this.dismiss(), { signal });
    hostWindow.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || this.popup.hidden) return;
      event.preventDefault(); event.stopPropagation(); this.dismiss();
    }, { signal, capture: true });
  }

  dismiss(): void {
    this.cancelTimer();
    this.hide(true);
  }

  dispose(): void {
    this.dismiss();
    this.events.abort();
    this.popup.remove();
  }

  private cancelTimer(): void {
    this.hostWindow.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(control: HTMLElement, delay: number): void {
    this.cancelTimer();
    if (control === this.active && !this.popup.hidden) return;
    if (this.active) this.hide();
    this.timer = this.hostWindow.setTimeout(() => this.show(control), delay);
  }

  private scheduleHide(): void {
    this.cancelTimer();
    this.timer = this.hostWindow.setTimeout(() => this.hide(), 100);
  }

  private show(control: HTMLElement): void {
    if (control.closest('[hidden]') || !control.isConnected) return;
    this.hide(true);
    const anchor = control.getBoundingClientRect();
    const scrollArea = control.closest('.settings-sections')?.getBoundingClientRect();
    if (scrollArea && (anchor.bottom <= scrollArea.top || anchor.top >= scrollArea.bottom)) return;
    const row = control.closest<HTMLElement>('.setting-row')!;
    this.title.textContent = row.querySelector('label, .setting-heading > span')?.textContent ?? '';
    this.copy.textContent = helpText(control.dataset.setting!) ?? '';
    this.active = control;
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), this.popup.id].filter(Boolean).join(' '));
    this.popup.hidden = false;
    this.popup.style.opacity = '0';
    this.popup.style.transform = 'translateY(4px)';
    this.popup.showPopover?.();
    const bounds = this.popup.getBoundingClientRect();
    const gap = 10, edge = 12;
    const left = anchor.right + gap + bounds.width <= this.hostWindow.innerWidth - edge
      ? anchor.right + gap : Math.max(edge, Math.min(anchor.left, this.hostWindow.innerWidth - bounds.width - edge));
    const top = left >= anchor.right
      ? anchor.top + (anchor.height - bounds.height) / 2
      : anchor.bottom + gap + bounds.height <= this.hostWindow.innerHeight - edge ? anchor.bottom + gap : anchor.top - bounds.height - gap;
    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${Math.max(edge, Math.min(top, this.hostWindow.innerHeight - bounds.height - edge))}px`;
    this.transition(true);
  }

  private hide(immediate = false): void {
    if (this.active) {
      const remaining = this.active.getAttribute('aria-describedby')?.split(/\s+/).filter(id => id !== this.popup.id).join(' ');
      if (remaining) this.active.setAttribute('aria-describedby', remaining);
      else this.active.removeAttribute('aria-describedby');
      this.active = undefined;
    }
    if (!this.popup.hidden) this.transition(false, immediate);
  }

  private transition(show: boolean, immediate = false): void {
    const version = ++this.version;
    this.animation?.stop();
    this.animation?.cancel();
    this.animation = undefined;
    const finish = (): void => {
      if (version !== this.version || show) return;
      this.popup.hidePopover?.();
      this.popup.hidden = true;
    };
    const target = { opacity: show ? 1 : 0, transform: show ? 'translateY(0px)' : 'translateY(4px)' };
    if (immediate || this.hostWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(this.popup.style, target);
      finish();
      return;
    }
    this.animation = animate(this.popup, target, { duration: show ? 0.18 : 0.12, ease: [0.22, 1, 0.36, 1] });
    void this.animation.then(finish);
  }
}
