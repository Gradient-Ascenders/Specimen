import { menuIconMarkup as icon } from './MenuIcons.ts';
import type { CultivationRoomFiveController } from '../levels/CultivationRoomFiveController.ts';

/** Persistent read-only network display; never owns switch or unlock state. */
export class SecurityNetworkView {
  readonly element = document.createElement('div');
  private lastState = '';
  constructor() {
    this.element.className = 'security-network-status';
    this.element.hidden = true;
  }
  update(controller: CultivationRoomFiveController, visible: boolean): void {
    const show = visible && !controller.releasing;
    if (this.element.hidden === show) this.element.hidden = !show;
    if (!show) return;
    const state = controller.complete ? 'complete' : controller.rescued ? 'rescued' : controller.security.disabledNetwork ?? 'none';
    if (state === this.lastState) return;
    this.lastState = state;
    this.element.dataset.state = state;
    if (state === 'complete' || state === 'rescued') {
      this.element.textContent = state === 'complete' ? 'Cultivation complete\nBob, Goop and Volt rescued' : 'Security disabled\nSwitch to Volt';
    } else {
      this.element.innerHTML = `<p class="encounter-heading">Security networks</p>
        ${(['red', 'blue', 'green'] as const).map((network, index) => `<div class="network-row" data-network="${network}">${icon(index === 0 ? 'Triangle' : index === 1 ? 'Circle' : 'Square')}<span>${network[0].toUpperCase()}${network.slice(1)}</span><span>${state === network ? 'Offline' : 'Online'}</span></div>`).join('')}
        <p class="encounter-note">Shoot a switch to bypass one network.</p>`;
    }
  }
  dispose(): void { this.element.remove(); }
}
