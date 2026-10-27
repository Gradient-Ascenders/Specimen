import { animate } from 'motion/mini';
import { menuIconMarkup as icon } from './MenuIcons.ts';

/** Brief feedback for real progression events, advanced by active gameplay time. */
export class ProgressFeedback {
  readonly element: HTMLElement;
  private readonly label: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly hostWindow: Window;
  private reducedMotion = false;
  private remaining = 0;
  private leaving = false;
  private version = 0;
  private noticeAnimation?: ReturnType<typeof animate>;
  private objectiveAnimation?: ReturnType<typeof animate>;

  constructor(objective: HTMLElement, hostWindow: Window) {
    this.objective = objective;
    this.hostWindow = hostWindow;
    this.element = objective.ownerDocument.createElement('div');
    this.element.className = 'checkpoint-notice';
    this.element.hidden = true;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'true');
    this.element.innerHTML = `${icon('CircleCheck')}<span><strong>Checkpoint reached</strong><span data-checkpoint-label></span></span>`;
    this.label = this.element.querySelector<HTMLElement>('[data-checkpoint-label]')!;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.noticeAnimation?.complete();
      this.objectiveAnimation?.complete();
    }
  }

  setObjective(text: string, animateChange: boolean): void {
    if (this.objective.textContent === text) return;
    this.objectiveAnimation?.stop();
    this.objective.textContent = text;
    this.objective.style.opacity = '1';
    this.objective.style.transform = 'none';
    if (!animateChange || this.reducedMotion) return;
    this.objective.style.opacity = '.55';
    this.objective.style.transform = 'translateY(4px)';
    this.objectiveAnimation = animate(this.objective, { opacity: 1, transform: 'none' }, {
      duration: .22, ease: [.2, .78, .2, 1],
    });
  }

  showCheckpoint(label: string): void {
    ++this.version;
    const fresh = this.element.hidden;
    this.noticeAnimation?.stop();
    this.label.textContent = label;
    this.remaining = 3.2;
    this.leaving = false;
    this.element.hidden = false;
    if (this.reducedMotion) {
      this.element.style.opacity = '1'; this.element.style.transform = 'none';
      return;
    }
    if (fresh) { this.element.style.opacity = '0'; this.element.style.transform = 'translateY(-8px)'; }
    this.noticeAnimation = animate(this.element, { opacity: 1, transform: 'none' }, {
      duration: .22, ease: [.2, .78, .2, 1],
    });
  }

  update(deltaSeconds: number): void {
    if (this.element.hidden || this.leaving || this.hostWindow.document.hidden ||
      !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 1) return;
    this.remaining -= deltaSeconds;
    if (this.remaining > 0) return;
    this.leaving = true;
    const version = ++this.version;
    const finish = (): void => { if (version === this.version) this.element.hidden = true; };
    this.noticeAnimation?.stop();
    if (this.reducedMotion) { finish(); return; }
    this.noticeAnimation = animate(this.element, { opacity: 0, transform: 'translateY(-6px)' }, {
      duration: .14, ease: 'easeOut',
    });
    void this.noticeAnimation.then(finish);
  }

  reset(): void {
    ++this.version;
    this.noticeAnimation?.stop(); this.objectiveAnimation?.stop();
    this.noticeAnimation = this.objectiveAnimation = undefined;
    this.element.hidden = true; this.remaining = 0; this.leaving = false;
    this.objective.style.opacity = '1'; this.objective.style.transform = 'none';
  }

  dispose(): void { this.reset(); this.element.remove(); }
}
