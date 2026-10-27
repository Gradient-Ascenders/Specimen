import { animate } from 'motion/mini';
import type { SlimeHealthReadModel } from '../systems/SlimeDamageSystem.ts';
import { menuIconMarkup as icon } from './MenuIcons.ts';

/** A view of active health; healing and damage remain owned by the level. */
export class PlayerHealthHud {
  readonly element: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly meter: HTMLProgressElement;
  private readonly value: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hostWindow: Window;
  private source?: SlimeHealthReadModel;
  private state: 'hidden' | 'visible' | 'leaving' = 'hidden';
  private fullSeconds = 0;
  private wasFull = true;
  private renderedFraction = 1;
  private fillWait = 0;
  private visibilityAnimation?: ReturnType<typeof animate>;
  private fillAnimation?: ReturnType<typeof animate>;
  private version = 0;
  private disposed = false;
  private reduceInterfaceMotion = false;

  constructor(doc: Document, hostWindow: Window) {
    this.hostWindow = hostWindow;
    this.element = doc.createElement('section');
    this.element.className = 'player-health-hud final-boss-player';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Player health');
    this.element.innerHTML = `<div class="final-boss-player-header">
      <span class="final-boss-player-icon" aria-hidden="true">${icon('Activity')}</span>
      <div class="final-boss-player-identity"><strong class="final-boss-player-name">Health</strong><span class="final-boss-player-status" hidden></span></div>
      <span class="final-boss-player-value"></span>
    </div><div class="player-health-track"><span class="player-health-fill" aria-hidden="true"></span></div>
    <progress class="player-health-meter" max="100" value="100" aria-label="Health"></progress>`;
    this.fill = this.element.querySelector<HTMLElement>('.player-health-fill')!;
    this.meter = this.element.querySelector<HTMLProgressElement>('progress')!;
    this.value = this.element.querySelector<HTMLElement>('.final-boss-player-value')!;
    this.status = this.element.querySelector<HTMLElement>('.final-boss-player-status')!;
  }

  update(health: SlimeHealthReadModel | undefined, deltaSeconds: number): void {
    if (this.disposed) return;
    if (!health || health.dead) { if (this.source || this.state !== 'hidden') this.reset(); return; }
    if (health !== this.source) {
      this.reset(); this.source = health;
      this.renderedFraction = health.normalizedHealth;
      this.fill.style.transform = `scaleX(${this.renderedFraction})`;
      this.element.dataset.slimeId = health.slimeId;
      this.meter.setAttribute('aria-label', `${health.slimeId} health`);
    }
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const full = health.health >= health.maximumHealth;
    if (full && this.state === 'hidden') { this.wasFull = true; return; }
    if (!full) { this.fullSeconds = 0; this.setVisible(true); }
    else if (this.state === 'visible') {
      this.fullSeconds = this.wasFull ? this.fullSeconds + dt : 0;
      if (this.fullSeconds >= 1) this.setVisible(false);
    }
    this.wasFull = full;
    const healing = String(health.regenerating), critical = String(health.normalizedHealth <= .3);
    if (this.element.dataset.healing !== healing) this.element.dataset.healing = healing;
    if (this.element.dataset.critical !== critical) this.element.dataset.critical = critical;
    const percentage = health.normalizedHealth * 100;
    if (this.meter.value !== percentage) this.meter.value = percentage;
    const value = `${Math.ceil(health.normalizedHealth * 100)}`;
    if (this.value.textContent !== value) this.value.textContent = value;
    const status = health.regenerating ? 'Healing' : full && this.state !== 'hidden' ? 'Full' : health.normalizedHealth <= .3 ? 'Low' : '';
    if (this.status.hidden !== !status) this.status.hidden = !status;
    if (this.status.textContent !== status) this.status.textContent = status;

    // Retarget a short linear fill at most ten times a second during regeneration.
    // Native progress and the number always report the current authoritative value.
    this.fillWait = Math.max(0, this.fillWait - dt);
    if (health.normalizedHealth === this.renderedFraction || (health.regenerating && !full && this.fillWait > 0)) return;
    this.renderedFraction = health.normalizedHealth;
    this.fillWait = .1;
    this.fillAnimation?.stop();
    if (this.reducedMotion || this.element.hidden) this.fill.style.transform = `scaleX(${this.renderedFraction})`;
    else this.fillAnimation = animate(this.fill, { transform: `scaleX(${this.renderedFraction})` }, {
      duration: health.regenerating || full ? .16 : .12, ease: health.regenerating || full ? 'linear' : 'easeOut',
    });
  }

  reset(): void {
    ++this.version;
    this.visibilityAnimation?.cancel(); this.fillAnimation?.cancel();
    this.visibilityAnimation = this.fillAnimation = undefined;
    this.source = undefined;
    this.state = 'hidden'; this.fullSeconds = 0; this.wasFull = true; this.fillWait = 0;
    this.element.hidden = true;
    this.element.dataset.state = 'hidden';
  }

  dispose(): void { this.reset(); this.disposed = true; this.element.remove(); }

  setReducedMotion(reduced: boolean): void {
    this.reduceInterfaceMotion = reduced;
    if (reduced) { this.visibilityAnimation?.complete(); this.fillAnimation?.complete(); }
  }

  private get reducedMotion(): boolean {
    return this.reduceInterfaceMotion || this.hostWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private setVisible(visible: boolean): void {
    if (visible ? this.state === 'visible' : this.state !== 'visible') return;
    const fresh = this.state === 'hidden';
    const version = ++this.version;
    this.visibilityAnimation?.stop();
    this.element.hidden = false;
    this.state = visible ? 'visible' : 'leaving';
    this.element.dataset.state = this.state;
    const resting = 'translateX(0px) scale(1)';
    const tucked = 'translateX(-24px) scale(0.96)';
    const finish = (): void => {
      if (this.disposed || version !== this.version || visible) return;
      this.state = 'hidden'; this.element.dataset.state = 'hidden'; this.element.hidden = true;
    };
    if (this.reducedMotion) {
      this.element.style.opacity = visible ? '1' : '0';
      this.element.style.transform = visible ? resting : tucked;
      finish(); return;
    }
    if (fresh) { this.element.style.opacity = '0'; this.element.style.transform = tucked; }
    this.visibilityAnimation = animate(this.element, { opacity: visible ? 1 : 0, transform: visible ? resting : tucked }, {
      duration: visible ? .24 : .3, ease: [.22, 1, .36, 1],
    });
    void this.visibilityAnimation.then(finish);
  }
}
