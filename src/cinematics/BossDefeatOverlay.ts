import { ENDING_DIALOGUE, ENDING_TIMING as T, endingProgress, endingShot } from './BossDefeatTimeline.ts';

export class BossDefeatOverlay {
  readonly element?: HTMLDivElement;
  private readonly subtitle?: HTMLDivElement;
  private readonly flash?: HTMLDivElement;
  private readonly roll?: HTMLDivElement;
  private readonly credits?: HTMLDivElement;
  private readonly skip?: HTMLButtonElement;
  constructor(host: HTMLElement, skip: () => void, credits = '') {
    const doc = host.ownerDocument; if (!doc) return;
    const root = doc.createElement('div'); root.className = 'containment-finale boss-defeat-finale'; root.hidden = true;
    root.dataset.cleanGameplayEssential = 'true'; this.element = root;
    for (const side of ['top', 'bottom']) { const bar = doc.createElement('div'); bar.className = `finale-bar ${side}`; root.append(bar); }
    this.flash = doc.createElement('div'); this.flash.className = 'ending-flash'; root.append(this.flash);
    this.subtitle = doc.createElement('div'); this.subtitle.className = 'finale-subtitle'; this.subtitle.setAttribute('aria-live', 'polite'); root.append(this.subtitle);
    this.credits = doc.createElement('div'); this.credits.className = 'ending-credits'; this.credits.hidden = true;
    this.roll = doc.createElement('div'); this.roll.className = 'ending-credits-roll';
    const title = doc.createElement('h1'); title.textContent = 'SPECIMEN'; this.roll.append(title);
    const dedication = doc.createElement('p'); dedication.className = 'ending-dedication'; dedication.textContent = 'For the one who stayed behind.'; this.roll.append(dedication);
    for (const section of credits.slice(credits.indexOf('## ')).split('## Maintaining this ledger')[0]!.split(/^## /m).filter(Boolean)) {
      const [heading, ...lines] = section.trim().split('\n');
      const h = doc.createElement('h2'); h.textContent = heading!; this.roll.append(h);
      for (const raw of lines) {
        if (!raw.startsWith('- ') && !(raw.startsWith('|') && !raw.startsWith('| ---') && !raw.startsWith('| Resource'))) continue;
        const p = doc.createElement('p');
        const text = raw.startsWith('- ') ? raw.slice(2) : raw.split('|').slice(1, 3).map(s => s.trim()).join(' — ');
        p.textContent = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); this.roll.append(p);
      }
    }
    const thanks = doc.createElement('p'); thanks.className = 'ending-thanks'; thanks.textContent = 'Thank you for playing'; this.roll.append(thanks);
    this.credits.append(this.roll); root.append(this.credits);
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'finale-skip'; button.textContent = 'Skip cutscene · Enter'; button.onclick = skip; this.skip = button; root.append(button); host.append(root);
  }
  present(t: number): void {
    if (!this.element) return;
    this.element.hidden = false; this.element.dataset.shot = endingShot(t);
    this.skip!.textContent = t >= T.credits ? 'Return to title · Enter' : 'Skip cutscene · Enter';
    const line = ENDING_DIALOGUE.find(l => t >= l.start && t < l.end);
    this.subtitle!.hidden = !line;
    if (line) { this.subtitle!.dataset.speaker = line.speaker; this.subtitle!.textContent = line.text.slice(0, Math.floor((t - line.start) * 25)); }
    const explosionAge = t - T.explosion;
    const flash = explosionAge >= 0 && explosionAge < 1.4 ? Math.min(1, Math.max(0, 1.5 - explosionAge)) : t < T.explosion && t > T.explosion - 1 ? (t - T.explosion + 1) * .65 : 0;
    const black = t >= T.black - 3 && t < T.daylight + 2 ? t < T.black ? endingProgress(t, T.black - 3, T.black) : t < T.daylight ? 1 : 1 - endingProgress(t, T.daylight, T.daylight + 2) : 0;
    this.flash!.style.background = black > 0 ? '#000' : '#f5fff6'; this.flash!.style.opacity = String(black || flash);
    this.credits!.hidden = t < T.credits;
    if (t >= T.credits) {
      const p = endingProgress(t, T.credits, T.duration - 3);
      this.credits!.style.opacity = String(Math.min(1, (t - T.credits) / 2, (T.duration - t) / 2));
      this.roll!.style.transform = `translateY(${this.credits!.clientHeight - p * (this.roll!.scrollHeight + this.credits!.clientHeight)}px)`;
    }
  }
  hide(): void { if (this.element) this.element.hidden = true; }
  dispose(): void { this.element?.remove(); }
}
