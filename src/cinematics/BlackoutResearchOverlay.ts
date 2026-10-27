import { RESEARCH_DIALOGUE, RESEARCH_TIMING as T, researchShot } from './BlackoutResearchTimeline.ts';

export class BlackoutResearchOverlay {
  readonly element?: HTMLDivElement;
  private readonly subtitle?: HTMLDivElement;
  private readonly flash?: HTMLDivElement;
  constructor(host: HTMLElement, skip: () => void) {
    const doc = host.ownerDocument; if (!doc) return;
    const root = doc.createElement('div'); root.className = 'containment-finale blackout-research'; root.hidden = true;
    root.dataset.cleanGameplayEssential = 'true'; this.element = root;
    for (const side of ['top', 'bottom']) { const bar = doc.createElement('div'); bar.className = `finale-bar ${side}`; root.append(bar); }
    this.flash = doc.createElement('div'); this.flash.className = 'research-cinematic-flash'; root.append(this.flash);
    this.subtitle = doc.createElement('div'); this.subtitle.className = 'finale-subtitle'; root.append(this.subtitle);
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'finale-skip'; button.textContent = 'Skip cutscene · Enter'; button.onclick = skip;
    root.append(button); host.append(root);
  }
  present(t: number): void {
    if (!this.element) return;
    this.element.hidden = false; this.element.dataset.shot = researchShot(t);
    const line = RESEARCH_DIALOGUE.find(l => t >= l.start && t < l.end && l.speaker !== 'green' && l.speaker !== 'red');
    this.subtitle!.hidden = !line;
    if (line) { this.subtitle!.dataset.speaker = line.speaker; this.subtitle!.textContent = line.text.slice(0, Math.floor((t - line.start) * 22)); }
    const age = t - (T.fusion - .05);
    const fusion = age >= 0 && age < .9 ? Math.exp(-age * 7) * .9 : 0;
    const blackout = t >= T.blackout - .12 && t < T.search + .3
      ? t < T.blackout ? (t - T.blackout + .12) / .12 : t < T.search ? 1 : 1 - (t - T.search) / .3 : 0;
    this.flash!.style.backgroundColor = blackout ? '#000' : '#e5fff0';
    this.flash!.style.opacity = String(Math.max(fusion, blackout));
  }
  hide(): void { if (this.element) this.element.hidden = true; }
  dispose(): void { this.element?.remove(); }
}
