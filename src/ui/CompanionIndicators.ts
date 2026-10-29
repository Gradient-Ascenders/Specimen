import * as THREE from 'three';
import type { CompanionId } from '../slimes/CompanionRegroup.ts';
import type { SlimePassiveInteraction } from '../slimes/SlimeHUDState.ts';
import type { ReadonlyVector3State } from '../physics/KinematicBody.ts';
import { menuIconMarkup } from './MenuIcons.ts';

const IDS = ['bob', 'goop', 'volt'] as const;
const LETTERS = { bob: 'B', goop: 'G', volt: 'V' };

/** Three preallocated HTML markers. Projection adds no draw calls or scene raycasts. */
export class CompanionIndicators {
  readonly element: HTMLElement;
  private readonly markers: Record<CompanionId, HTMLElement>;
  private readonly view = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private source: readonly SlimePassiveInteraction[] | undefined;
  private width = 1;
  private height = 1;
  private readonly resize?: ResizeObserver;
  private readonly host: HTMLElement;
  private roster?: HTMLElement | null;
  private collapsed: string | undefined;
  private layoutWait = 0;
  private readonly hudRegions = new Float64Array(12);
  private hudRegionCount = 0;
  private placed = 0;
  private readonly placedX = new Float64Array(3);
  private readonly placedY = new Float64Array(3);

  constructor(host: HTMLElement) {
    this.host = host;
    const doc = host.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'companion-indicators'; this.element.hidden = true;
    // The roster owns names and status announcements; these are compact visual locators only.
    this.element.setAttribute('aria-hidden', 'true');
    const create = (id: CompanionId): HTMLElement => {
      const marker = doc.createElement('div');
      marker.className = 'companion-marker'; marker.dataset.slimeId = id; marker.hidden = true;
      marker.innerHTML = `<span class="companion-locator-ring">${LETTERS[id]}</span>
        <span class="companion-locator-state"></span>
        <span class="companion-locator-direction">${menuIconMarkup('ArrowRight')}</span>`;
      this.element.append(marker); return marker;
    };
    this.markers = { bob: create('bob'), goop: create('goop'), volt: create('volt') };
    const measure = (): void => { this.width = host.clientWidth; this.height = host.clientHeight; this.layoutWait = 0; };
    const Observer = doc.defaultView?.ResizeObserver;
    if (Observer) { this.resize = new Observer(measure); this.resize.observe(host); }
    measure(); host.append(this.element);
  }

  update(camera: THREE.PerspectiveCamera, interactions: readonly SlimePassiveInteraction[], enabled: boolean, deltaSeconds = 1 / 60): void {
    const changed = interactions !== this.source;
    if (changed) {
      this.source = interactions;
      for (const id of IDS) {
        const interaction = interactions.find(entry => entry.kind === 'companion' && entry.slimeId === id &&
          (entry.state === 'catching-up' || entry.state === 'waiting'));
        const marker = this.markers[id]; marker.hidden = !interaction;
        if (!interaction) continue;
        marker.dataset.companionState = interaction.state;
        marker.querySelector('.companion-locator-state')!.innerHTML = menuIconMarkup(interaction.state === 'waiting' ? 'Pause' : 'ArrowRight');
      }
    }
    this.placed = 0;
    this.element.hidden = !enabled || !IDS.some(id => !this.markers[id].hidden);
    if (this.element.hidden) return;
    camera.updateMatrixWorld();
    this.layoutWait -= Math.max(0, deltaSeconds);
    this.roster ??= this.host.querySelector<HTMLElement>('.hud-roster');
    if (changed || this.layoutWait <= 0 || this.collapsed !== this.roster?.dataset.collapsed) {
      // Read HUD layout only on transitions, resizing or at 4 Hz while markers are visible.
      this.layoutWait = .25; this.collapsed = this.roster?.dataset.collapsed;
      this.hudRegionCount = 0;
      const panel = this.roster?.querySelector<HTMLElement>(this.collapsed === 'true' ? '.hud-roster-summary' : '.hud-roster-content');
      const rect = panel?.getBoundingClientRect();
      let left = rect?.left ?? Infinity, top = rect?.top ?? 0, bottom = rect?.bottom ?? 0;
      if (this.collapsed === 'true') {
        const chips = this.roster?.querySelector<HTMLElement>('.hud-companion-statuses:not([hidden])')?.getBoundingClientRect();
        if (chips) { left = Math.min(left, chips.left); bottom = Math.max(bottom, chips.bottom); }
      }
      this.addRegion(left, top, bottom);
      const objective = this.host.querySelector('.hud-objective-module')?.getBoundingClientRect();
      if (objective) this.addRegion(objective.left, objective.top, objective.bottom);
      const controls = this.host.querySelector<HTMLElement>('.hud-controls');
      const controlPanel = controls?.querySelector<HTMLElement>(controls.dataset.collapsed === 'true' ? '.hud-controls-summary' : '.hud-hint')?.getBoundingClientRect();
      if (controlPanel) this.addRegion(controlPanel.left, controlPanel.top, controlPanel.bottom);
    }
  }

  place(id: CompanionId, position: ReadonlyVector3State, camera: THREE.PerspectiveCamera): void {
    const marker = this.markers[id];
    if (this.element.hidden || marker.hidden) return;
    this.view.copy(position); this.view.y += .95;
    this.view.applyMatrix4(camera.matrixWorldInverse);
    const behind = this.view.z >= -camera.near;
    this.projected.copy(this.view).applyMatrix4(camera.projectionMatrix);
    let x = this.projected.x * this.width / 2, y = -this.projected.y * this.height / 2;
    if (behind) { x = this.view.x; y = -this.view.y; if (Math.abs(x) + Math.abs(y) < .01) y = 1; }
    const halfWidth = Math.max(1, this.width / 2 - 40), halfHeight = Math.max(1, this.height / 2 - 52);
    let offscreen = behind || Math.abs(x) > halfWidth || Math.abs(y) > halfHeight;
    let heading = offscreen ? Math.atan2(y, x) : Math.PI / 2;
    if (offscreen) {
      const scale = Math.min(halfWidth / Math.max(.001, Math.abs(x)), halfHeight / Math.max(.001, Math.abs(y)));
      x *= scale; y *= scale;
    }
    x += this.width / 2; y += this.height / 2;
    for (let region = 0; region < this.hudRegionCount; region++) {
      const offset = region * 3, left = this.hudRegions[offset], top = this.hudRegions[offset + 1], bottom = this.hudRegions[offset + 2];
      if (x + 20 <= left || y + 20 <= top - 8 || y - 20 >= bottom + 8) continue;
      const previousX = x, previousY = y;
      if (left >= 64) x = left - 32;
      else y = THREE.MathUtils.clamp(top - 32, 52, this.height - 52);
      if (!offscreen) heading = Math.atan2(previousY - y, previousX - x);
      offscreen = true;
    }
    for (let i = 0; i < this.placed; i++) {
      if (Math.abs(x - this.placedX[i]) < 40 && Math.abs(y - this.placedY[i]) < 40) {
        y = THREE.MathUtils.clamp(y + (y < this.height / 2 ? 40 : -40), 52, this.height - 52);
      }
    }
    this.placedX[this.placed] = x; this.placedY[this.placed] = y; this.placed++;
    marker.dataset.offscreen = String(offscreen);
    marker.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    marker.style.setProperty('--companion-heading', `${heading}rad`);
  }

  hide(): void { this.element.hidden = true; }
  dispose(): void { this.resize?.disconnect(); this.element.remove(); }

  private addRegion(left: number, top: number, bottom: number): void {
    const index = this.hudRegionCount++ * 3;
    this.hudRegions[index] = left; this.hudRegions[index + 1] = top; this.hudRegions[index + 2] = bottom;
  }
}
