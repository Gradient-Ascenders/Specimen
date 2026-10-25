import type { HUDVisibility } from './GameSettings.ts';
import { animate } from 'motion/mini';

const IDLE_SECONDS = 5;

/** An idle timer on the existing game loop; Motion owns short native animations. */
export class HudPanelPresentation {
  private readonly panel: HTMLElement;
  protected readonly compact: HTMLElement;
  private idleSeconds = 0;
  private visibilityMode: HUDVisibility = 'automatic';
  private collapsed = false;
  private animations: ReturnType<typeof animate>[] = [];
  private animationVersion = 0;
  private disposed = false;
  private reducedMotion = false;
  private readonly root: HTMLElement;
  private readonly hostWindow: Window;
  private readonly axis: 'X' | 'Y';

  constructor(root: HTMLElement, panel: HTMLElement, compact: HTMLElement, hostWindow: Window, axis: 'X' | 'Y' = 'X') {
    this.root = root;
    this.panel = panel;
    this.compact = compact;
    this.hostWindow = hostWindow;
    this.axis = axis;
  }

  update(deltaSeconds: number): void {
    if (this.visibilityMode === 'always' || this.disposed || this.collapsed || !Number.isFinite(deltaSeconds) ||
      deltaSeconds <= 0 || deltaSeconds > 1 || this.root.ownerDocument.hidden) return;
    this.idleSeconds += deltaSeconds;
    if (this.idleSeconds >= IDLE_SECONDS) this.setCollapsed(true);
  }

  setVisibilityMode(mode: HUDVisibility): void {
    if (this.visibilityMode === mode) return;
    this.visibilityMode = mode;
    this.reset();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) for (const animation of this.animations) animation.complete();
  }

  reset(): void {
    this.idleSeconds = 0;
    this.setCollapsed(this.visibilityMode === 'minimal');
  }

  reveal(): void {
    if (this.disposed) return;
    this.idleSeconds = 0;
    this.setCollapsed(false);
  }

  toggle(): void {
    if (this.disposed) return;
    this.idleSeconds = 0;
    this.setCollapsed(this.visibilityMode === 'always' ? false : !this.collapsed);
  }

  dispose(): void {
    this.disposed = true;
    this.animationVersion++;
    for (const animation of this.animations) animation.stop();
    this.animations = [];
  }

  private setCollapsed(collapsed: boolean): void {
    if (this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    const version = ++this.animationVersion;
    // Stop commits the current frame, so reversing a transition never jumps.
    for (const animation of this.animations) animation.stop();
    this.animations = [];
    this.root.dataset.collapsed = String(collapsed);
    this.panel.setAttribute('aria-hidden', String(collapsed));
    this.compact.setAttribute('aria-hidden', String(!collapsed));
    this.panel.style.visibility = 'visible';
    this.compact.style.visibility = 'visible';
    const resting = `translate${this.axis}(0px) scale(1)`;
    const panel = { transform: collapsed ? `translate${this.axis}(16px) scale(0.985)` : resting, opacity: collapsed ? 0 : 1 };
    const compact = { transform: collapsed ? resting : `translate${this.axis}(8px) scale(0.985)`, opacity: collapsed ? 1 : 0 };
    const finish = (): void => {
      if (this.disposed || version !== this.animationVersion) return;
      (collapsed ? this.panel : this.compact).style.visibility = 'hidden';
      this.animations = [];
    };
    if (this.reducedMotion || this.hostWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(this.panel.style, panel);
      Object.assign(this.compact.style, compact);
      finish();
      return;
    }
    this.animations = [
      animate(this.panel, panel, {
        delay: collapsed ? 0 : 0.08,
        duration: collapsed ? 0.14 : 0.22,
        ease: [0.22, 1, 0.36, 1],
      }),
      animate(this.compact, compact, {
        delay: collapsed ? 0.14 : 0,
        duration: collapsed ? 0.12 : 0.08,
        ease: 'easeOut',
      }),
    ];
    void Promise.all(this.animations).then(finish);
  }
}
