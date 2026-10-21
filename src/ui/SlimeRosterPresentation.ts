import type { SlimeHUDSnapshot } from '../slimes/SlimeHUDState.ts';
import { HudPanelPresentation } from './HudPanelPresentation.ts';
import { SLIME_PORTRAITS } from './SlimePortraits.ts';

/** Reveal the shared idle panel when the selected specimen or roster changes. */
export class SlimeRosterPresentation extends HudPanelPresentation {
  private readonly portrait: HTMLImageElement;
  private activityKey = '';
  private switchKeyLabel = 'Tab';

  constructor(root: HTMLElement, hostWindow: Window) {
    super(root, root.querySelector<HTMLElement>('.hud-roster-content')!,
      root.querySelector<HTMLElement>('.hud-roster-summary')!, hostWindow);
    this.portrait = root.querySelector<HTMLImageElement>('[data-roster-active-portrait]')!;
  }

  setSwitchKeyLabel(label: string): void {
    this.switchKeyLabel = label;
    this.compact.setAttribute('aria-label', `Press ${label} to view specimens.`);
  }

  observe(snapshot: SlimeHUDSnapshot, passiveStatus: string | undefined): void {
    const active = snapshot.roster.find(entry => entry.id === snapshot.activeSlimeId);
    if (active && this.portrait.dataset.slimeId !== active.id) {
      this.portrait.src = SLIME_PORTRAITS[active.id];
      this.portrait.dataset.slimeId = active.id;
      this.compact.setAttribute('aria-label', `${active.displayName} selected. Press ${this.switchKeyLabel} to view specimens.`);
    }
    this.portrait.hidden = !active;
    const key = [snapshot.activeSlimeId, snapshot.activeFormLabel, passiveStatus,
      ...snapshot.roster.map(entry => `${entry.id}:${entry.unlocked}:${entry.registered}:${entry.betaPlayable}`)].join('|');
    if (key !== this.activityKey || snapshot.resetSwitchFeedback) {
      this.activityKey = key;
      this.reveal();
    }
  }
}
