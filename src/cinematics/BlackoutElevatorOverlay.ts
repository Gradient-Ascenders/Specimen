import { ELEVATOR_DIALOGUE, elevatorShot } from './BlackoutElevatorTimeline.ts';

export class BlackoutElevatorOverlay {
  readonly element?: HTMLDivElement;
  private readonly subtitle?: HTMLDivElement;

  constructor(host: HTMLElement, onSkip: () => void) {
    const doc = host.ownerDocument; if (!doc) return;
    const root = doc.createElement('div'); root.className = 'containment-finale blackout-elevator'; root.hidden = true;
    root.dataset.cleanGameplayEssential = 'true'; this.element = root;
    for (const side of ['top', 'bottom']) { const bar = doc.createElement('div'); bar.className = `finale-bar ${side}`; root.append(bar); }
    this.subtitle = doc.createElement('div'); this.subtitle.className = 'finale-subtitle'; root.append(this.subtitle);
    const skip = doc.createElement('button'); skip.type = 'button'; skip.className = 'finale-skip'; skip.textContent = 'Skip cutscene · Enter';
    skip.onclick = onSkip; root.append(skip); host.append(root);
  }
  present(t: number): void {
    if (!this.element) return;
    this.element.hidden = false; this.element.dataset.shot = elevatorShot(t);
    const line = ELEVATOR_DIALOGUE.find(line => t >= line.start && t < line.end);
    this.subtitle!.hidden = !line;
    if (line) { this.subtitle!.dataset.speaker = line.speaker; this.subtitle!.textContent = line.text.slice(0, Math.floor((t - line.start) * 24)); }
  }
  hide(): void { if (this.element) this.element.hidden = true; }
  dispose(): void { this.element?.remove(); }
}
