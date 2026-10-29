import type { CompanionWaitReason, SlimeHUDSnapshot } from '../slimes/SlimeHUDState.ts';
import { HudPanelPresentation } from './HudPanelPresentation.ts';
import { SLIME_PORTRAITS } from './SlimePortraits.ts';
import { menuIconMarkup } from './MenuIcons.ts';

const COMPACT_LABELS: Record<CompanionWaitReason, string> = {
  door: 'Door closed', obstacle: 'Blocked', floor: 'No safe path', hazard: 'Hazards', route: 'No safe route',
  stalled: 'Needs you', switch: 'Holding switch', power: 'Powering', mounted: 'On drone', combat: 'Combat',
  manual: 'Needs you', platforms: 'Platforms',
};

/** Reveal the shared idle panel when the selected specimen or roster changes. */
export class SlimeRosterPresentation extends HudPanelPresentation {
  private readonly portrait: HTMLImageElement;
  private activityKey = '';
  private switchKeyLabel = 'Tab';
  private readonly companions: HTMLUListElement;
  private readonly announcement: HTMLElement;
  private readonly chips = new Map<string, HTMLElement>();

  constructor(root: HTMLElement, hostWindow: Window) {
    super(root, root.querySelector<HTMLElement>('.hud-roster-content')!,
      root.querySelector<HTMLElement>('.hud-roster-summary')!, hostWindow);
    this.portrait = root.querySelector<HTMLImageElement>('[data-roster-active-portrait]')!;
    this.companions = root.ownerDocument.createElement('ul');
    this.companions.className = 'hud-companion-statuses';
    this.companions.setAttribute('aria-label', 'Companion activity');
    this.companions.hidden = true;
    this.announcement = root.ownerDocument.createElement('span');
    this.announcement.className = 'companion-announcement';
    this.announcement.setAttribute('role', 'status');
    this.announcement.setAttribute('aria-live', 'polite');
    this.announcement.setAttribute('aria-atomic', 'true');
    root.append(this.companions, this.announcement);
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
    for (const chip of this.chips.values()) chip.hidden = true;
    let count = 0;
    for (const interaction of snapshot.passiveInteractions) {
      if (interaction.kind !== 'companion' || interaction.slimeId === snapshot.activeSlimeId) continue;
      const entry = snapshot.roster.find(candidate => candidate.id === interaction.slimeId);
      if (!entry?.registered || !entry.unlocked || !entry.betaPlayable) continue;
      let chip = this.chips.get(entry.id);
      if (!chip) {
        chip = this.companions.ownerDocument.createElement('li');
        chip.className = 'hud-companion-chip'; chip.dataset.slimeId = entry.id;
        chip.innerHTML = `<img class="hud-slime-portrait" alt="" width="20" height="20" draggable="false">
          <span class="companion-chip-copy"><span></span></span><span class="companion-chip-icon" aria-hidden="true"></span>`;
        chip.querySelector<HTMLImageElement>('img')!.src = SLIME_PORTRAITS[entry.id];
        this.companions.append(chip); this.chips.set(entry.id, chip);
      }
      const state = interaction.state ?? 'catching-up';
      if (chip.dataset.companionState !== state) {
        chip.dataset.companionState = state;
        chip.querySelector('.companion-chip-icon')!.innerHTML = state === 'catching-up' ? menuIconMarkup('ArrowRight') :
          state === 'arrived' ? menuIconMarkup('CircleCheck') : '';
      }
      const description = `${entry.displayName}: ${interaction.label}`;
      if (chip.getAttribute('aria-label') !== description) {
        chip.setAttribute('aria-label', description); chip.title = description;
      }
      const label = chip.querySelector('.companion-chip-copy > span')!;
      const text = interaction.reason ? COMPACT_LABELS[interaction.reason] : interaction.label;
      if (label.textContent !== text) label.textContent = text;
      chip.hidden = false; count++;
    }
    this.companions.hidden = count === 0;
    if (this.announcement.textContent !== (passiveStatus ?? '')) this.announcement.textContent = passiveStatus ?? '';
    const key = [snapshot.activeSlimeId, snapshot.activeFormLabel, passiveStatus,
      ...snapshot.roster.map(entry => `${entry.id}:${entry.unlocked}:${entry.registered}:${entry.betaPlayable}`)].join('|');
    if (key !== this.activityKey || snapshot.resetSwitchFeedback) {
      this.activityKey = key;
      this.reveal();
    }
  }

  override dispose(): void {
    super.dispose(); this.companions.remove(); this.announcement.remove(); this.chips.clear();
  }
}
