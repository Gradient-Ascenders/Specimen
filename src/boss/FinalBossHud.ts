import { animate } from 'motion/mini';
import { menuIconMarkup as icon, type MenuIconName } from '../ui/MenuIcons.ts';
import { FINAL_BOSS_TUNING as T } from './FinalBossConfig.ts';
import type { FinalBossAttack, FinalBossReadModel } from './FinalBossController.ts';

const ATTACKS: Record<FinalBossAttack, { title: string; hint: string; icon: MenuIconName }> = {
  'gun-blast': { title: 'Gunfire', hint: 'Dodge or use cover', icon: 'Crosshair' },
  'laser-shots': { title: 'Laser orbs', hint: 'Dodge or shoot them', icon: 'Circle' },
  'laser-beam': { title: 'Laser sweep', hint: 'Jump or use cover', icon: 'Activity' },
  'summon-defend': { title: 'Shielded', hint: 'Destroy all drones', icon: 'Cpu' },
  ram: { title: 'Ram', hint: 'Dodge. Cover breaks.', icon: 'ArrowRight' },
};

/** Presentation only: health, attack timing and encounter state stay in the controller. */
export class FinalBossHud {
  readonly element: HTMLElement;
  private readonly danger: HTMLElement;
  private readonly status: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly bossHealth: HTMLProgressElement;
  private readonly healthEcho: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly reinforcements: HTMLElement;
  private readonly message: HTMLElement;
  private readonly attackIcon: HTMLElement;
  private readonly attackTitle: HTMLElement;
  private readonly attackHint: HTMLElement;
  private readonly attackDetail: HTMLElement;
  private readonly attackProgress: HTMLProgressElement;
  private readonly player: HTMLElement;
  private readonly playerHealth: HTMLProgressElement;
  private readonly playerValue: HTMLElement;
  private readonly playerStatus: HTMLElement;
  private readonly invincibleBadge: HTMLElement;
  private readonly cinematic: HTMLElement;
  private readonly cinematicTitle: HTMLElement;
  private readonly skip: HTMLButtonElement;
  private readonly devToggle?: HTMLButtonElement;
  private readonly announcement: HTMLElement;
  private readonly doc: Document;
  private readonly host?: HTMLElement;
  private controls?: HTMLElement;
  private controlsResize?: ResizeObserver;
  private controlsMutation?: MutationObserver;
  private readonly animations = new Map<HTMLElement, ReturnType<typeof animate>>();
  private cueKey = '';
  private cinematicKey = '';
  private disposed = false;

  constructor(doc: Document, options: { host?: HTMLElement; onSkip: () => void; onToggleInvincibility?: () => void }) {
    this.doc = doc;
    this.host = options.host;
    const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
      const element = doc.createElement(tag);
      element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    this.element = node('section', 'final-boss-hud');
    this.element.setAttribute('aria-label', 'Final encounter');
    this.element.hidden = true;
    this.danger = node('div', 'final-boss-danger');
    this.danger.setAttribute('aria-hidden', 'true');
    this.danger.hidden = true;
    const top = node('div', 'final-boss-top');
    this.status = node('div', 'final-boss-status');
    const header = node('div', 'final-boss-header');
    this.phase = node('span', 'final-boss-phase');
    header.append(node('h2', 'final-boss-heading', 'Exterminator'), this.phase);
    const healthRow = node('div', 'final-boss-health-row');
    this.healthValue = node('span', 'final-boss-health-value');
    const track = node('div', 'final-boss-health-track');
    this.healthEcho = node('span', 'final-boss-health-echo');
    this.healthEcho.setAttribute('aria-hidden', 'true');
    this.bossHealth = node('progress', 'final-boss-health');
    this.bossHealth.setAttribute('aria-label', 'Exterminator health');
    const midpoint = node('span', 'final-boss-health-midpoint');
    midpoint.setAttribute('aria-hidden', 'true');
    track.append(this.healthEcho, this.bossHealth, midpoint);
    healthRow.append(track, this.healthValue);
    this.reinforcements = node('span', 'final-boss-reinforcements');
    this.status.append(header, healthRow, this.reinforcements);

    this.message = node('div', 'final-boss-message');
    this.attackIcon = node('span', 'final-boss-attack-icon');
    const attackCopy = node('div', 'final-boss-attack-copy');
    const attackHeader = node('div', 'final-boss-attack-header');
    this.attackDetail = node('span', 'final-boss-attack-detail');
    this.attackTitle = node('strong', 'final-boss-attack-title');
    attackHeader.append(this.attackTitle, this.attackDetail);
    this.attackHint = node('span', 'final-boss-attack-hint');
    attackCopy.append(attackHeader, this.attackHint);
    this.attackProgress = node('progress', 'final-boss-attack-progress');
    this.attackProgress.max = 1;
    this.attackProgress.setAttribute('aria-label', 'Attack stage progress');
    this.message.append(this.attackIcon, attackCopy, this.attackProgress);
    top.append(this.status, this.message);

    this.player = node('div', 'final-boss-player');
    const playerHeader = node('div', 'final-boss-player-header');
    const badge = node('span', 'final-boss-player-icon');
    badge.innerHTML = icon('Activity');
    const playerIdentity = node('div', 'final-boss-player-identity');
    this.playerStatus = node('span', 'final-boss-player-status');
    playerIdentity.append(node('strong', 'final-boss-player-name', 'Health'), this.playerStatus);
    this.playerValue = node('span', 'final-boss-player-value');
    playerHeader.append(badge, playerIdentity, this.playerValue);
    this.playerHealth = node('progress', 'final-boss-integrity');
    this.playerHealth.setAttribute('aria-label', 'Specimen integrity');
    this.invincibleBadge = node('span', 'final-boss-invincible', 'Invincible');
    this.invincibleBadge.hidden = true;
    this.invincibleBadge.setAttribute('role', 'status');
    this.player.append(playerHeader, this.playerHealth, this.invincibleBadge);

    this.cinematic = node('div', 'final-boss-cinematic');
    this.cinematicTitle = node('h2', 'final-boss-cinematic-title');
    this.cinematic.append(this.cinematicTitle);
    this.skip = node('button', 'final-boss-skip');
    this.skip.type = 'button';
    this.skip.innerHTML = `${icon('SkipForward')}<span>Skip</span><kbd>Enter</kbd>`;
    this.skip.setAttribute('aria-label', 'Skip cinematic');
    this.skip.onclick = options.onSkip;
    this.announcement = node('div', 'final-boss-announcement');
    this.announcement.setAttribute('role', 'status');
    this.announcement.setAttribute('aria-live', 'polite');
    this.announcement.setAttribute('aria-atomic', 'true');
    this.element.append(this.danger, top, this.player, this.cinematic, this.skip, this.announcement);
    if (options.onToggleInvincibility) {
      this.devToggle = node('button', 'final-boss-dev-invincibility');
      this.devToggle.type = 'button';
      this.devToggle.hidden = true;
      this.devToggle.innerHTML = '<kbd>I</kbd><span>Invincible</span>';
      this.devToggle.setAttribute('aria-label', 'Dev invincibility');
      this.devToggle.setAttribute('title', 'Development only');
      this.devToggle.onmousedown = event => { event.stopPropagation(); };
      this.devToggle.onclick = () => { options.onToggleInvincibility?.(); this.devToggle?.blur(); };
    }
    this.connectControls();
  }

  update(model: Readonly<FinalBossReadModel>, advancedDrones = 0, devInvincible = false): void {
    if (this.disposed) return;
    if (['idle', 'suspended', 'complete'].includes(model.state)) { this.hide(); return; }
    const entering = this.element.hidden || this.element.dataset.state !== 'combat';
    this.element.hidden = false;
    this.element.dataset.state = model.state;
    this.element.dataset.phase = String(model.phase);
    this.element.dataset.shield = String(model.shieldActive);
    this.element.dataset.attack = model.attack;
    this.element.dataset.stage = model.stage;
    const combat = model.state === 'combat';
    this.danger.hidden = !combat;
    const healthFraction = model.playerHealth / model.maximumPlayerHealth;
    const critical = combat && healthFraction <= .3;
    this.danger.dataset.low = String(critical);
    this.setDangerStrength('--boss-danger-strength', critical ? .55 + .45 * (1 - Math.max(0, healthFraction) / .3) : 0);
    // Damage grace starts only on accepted hits. Use its age for a short flash
    // that fades before grace ends, without adding another presentation clock.
    const hitAge = T.playerDamageGraceSeconds - model.invulnerability;
    this.setDangerStrength('--boss-impact-strength', combat && model.invulnerability > 0
      ? Math.max(0, Math.min(1, 1 - hitAge / .32)) : 0);
    this.status.hidden = this.message.hidden = this.player.hidden = !combat;
    this.cinematic.hidden = this.skip.hidden = combat;
    this.invincibleBadge.hidden = !combat || !devInvincible;
    this.connectControls();
    if (this.devToggle) {
      this.devToggle.hidden = !combat;
      this.devToggle.setAttribute('aria-pressed', String(devInvincible));
    }
    if (entering) this.measureControls();
    if (!combat) { this.presentCinematic(model.state, model.progress); return; }
    this.cinematicKey = '';
    this.setText(this.phase, `Phase ${model.phase}`);
    this.setText(this.healthValue, `${Math.ceil(model.health)} / ${model.maximumHealth}`);
    this.bossHealth.max = model.maximumHealth;
    this.bossHealth.value = model.health;
    if (this.healthEcho.style) this.healthEcho.style.transform = `scaleX(${Math.max(0, model.health / model.maximumHealth)})`;
    this.reinforcements.hidden = advancedDrones === 0;
    this.setText(this.reinforcements, `${advancedDrones} drones`);
    this.playerHealth.max = model.maximumPlayerHealth;
    this.playerHealth.value = model.playerHealth;
    this.setText(this.playerValue, `${Math.ceil(model.playerHealth)}`);
    this.player.dataset.critical = String(critical);
    this.playerStatus.hidden = !critical;
    this.setText(this.playerStatus, critical ? 'Low' : '');
    const attack = ATTACKS[model.attack];
    const cueKey = `${model.attackSerial}:${model.stage}:${model.shieldActive}`;
    if (cueKey !== this.cueKey) {
      this.cueKey = cueKey;
      this.attackIcon.innerHTML = icon(attack.icon);
      this.setText(this.announcement, `${model.stage === 'telegraph' ? 'Incoming: ' : ''}${attack.title}. ${model.shieldActive ? attack.hint : model.stage === 'recovery' ? 'Shoot the eye.' : attack.hint}`);
      this.enter(this.message, 5);
    }
    this.setText(this.attackTitle, !model.shieldActive && model.stage === 'recovery'
      ? model.attack === 'summon-defend' ? 'Shield down' : 'Opening' : attack.title);
    this.setText(this.attackHint, !model.shieldActive && model.stage === 'recovery' ? 'Shoot the eye' : attack.hint);
    const beamSweeps = model.phase === 2 ? 1 + T.phaseTwoBeamHalves : T.beamCircles;
    this.setText(this.attackDetail, model.shieldActive
      ? `${model.defendersRemaining} left`
      : model.attack === 'laser-beam' && model.stage === 'active'
        ? `${model.beamTurning ? 'Turning' : model.beamDirection === -1 ? '↻' : '↺'} ${Math.min(model.beamLapsCompleted + 1, beamSweeps)}/${beamSweeps}`
        : '');
    this.attackDetail.hidden = !this.attackDetail.textContent;
    this.attackProgress.hidden = model.shieldActive && model.stage === 'active';
    this.attackProgress.value = Math.min(1, Math.max(0, model.progress));
    if (entering) { this.enter(this.status, -8); this.enter(this.player, 8); }
  }

  presentMerge(progress: number): void {
    if (this.disposed) return;
    this.element.hidden = false;
    this.element.dataset.state = 'merging';
    this.status.hidden = this.message.hidden = this.player.hidden = this.skip.hidden = true;
    if (this.devToggle) this.devToggle.hidden = true;
    this.invincibleBadge.hidden = true;
    this.danger.hidden = true;
    this.cinematic.hidden = false;
    this.presentCinematic('merging', progress);
  }

  hide(): void {
    this.element.hidden = true;
    this.danger.hidden = true;
    if (this.devToggle) this.devToggle.hidden = true;
    this.invincibleBadge.hidden = true;
    this.host?.style?.removeProperty?.('--boss-controls-height');
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear();
    this.cueKey = this.cinematicKey = '';
    this.setText(this.announcement, '');
  }

  dispose(): void {
    this.hide();
    this.disposed = true;
    this.controlsResize?.disconnect();
    this.controlsMutation?.disconnect();
    this.devToggle?.remove();
    this.element.remove();
  }

  private connectControls(): void {
    if (this.controls || !this.doc.defaultView) return;
    const controls = this.host?.querySelector?.<HTMLElement>('.hud-controls');
    if (!controls) return;
    this.controls = controls;
    const hint = controls.querySelector<HTMLElement>('.hud-hint');
    const compact = controls.querySelector<HTMLElement>('.hud-controls-summary');
    if (this.devToggle) hint?.append(this.devToggle);
    const view = this.doc.defaultView;
    if (view?.ResizeObserver) {
      this.controlsResize = new view.ResizeObserver(() => this.measureControls());
      if (hint) this.controlsResize.observe(hint);
      if (compact) this.controlsResize.observe(compact);
    }
    if (view?.MutationObserver) {
      this.controlsMutation = new view.MutationObserver(() => this.measureControls());
      this.controlsMutation.observe(controls, { attributes: true, attributeFilter: ['data-collapsed'] });
    }
  }

  private measureControls(): void {
    if (this.element.hidden || !this.controls) return;
    const panel = this.controls.querySelector<HTMLElement>(this.controls.dataset.collapsed === 'true'
      ? '.hud-controls-summary' : '.hud-hint');
    const height = `${panel?.offsetHeight || 44}px`;
    if (this.host?.style?.getPropertyValue('--boss-controls-height') !== height) {
      this.host?.style?.setProperty('--boss-controls-height', height);
    }
  }

  private presentCinematic(state: string, progress: number): void {
    const copy = state === 'merging'
      ? progress < .6 ? 'Bob. Goop. Volt.' : 'The Specimen'
      : state === 'intro'
        ? progress < .45 ? 'Containment failed' : 'Exterminator'
        : state === 'transition'
          ? 'Phase 2'
          : state === 'defeated'
            ? progress < .55 ? 'Core destroyed' : 'Exit open'
            : 'Together. Free.';
    if (copy === this.cinematicKey) return;
    this.cinematicKey = copy;
    this.setText(this.cinematicTitle, copy);
    this.setText(this.announcement, copy);
    this.enter(this.cinematic, 12);
  }

  private setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  private setDangerStrength(name: string, value: number): void {
    const next = value.toFixed(3);
    if (this.danger.style?.getPropertyValue?.(name) !== next) {
      this.danger.style?.setProperty?.(name, next);
    }
  }

  private enter(element: HTMLElement, offset: number): void {
    this.animations.get(element)?.cancel();
    const view = this.doc.defaultView;
    if (!view || typeof element.animate !== 'function' || view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = animate(element, { opacity: [.65, 1], transform: [`translateY(${offset}px)`, 'translateY(0px)'] }, {
      duration: element === this.cinematic ? .42 : .24, ease: [.22, 1, .36, 1],
    });
    this.animations.set(element, animation);
    void animation.then(() => { if (this.animations.get(element) === animation) this.animations.delete(element); });
  }
}
