import type { CultivationRoomFiveController } from '../levels/CultivationRoomFiveController.ts';

/** Persistent read-only network display; never owns switch or unlock state. */
export class SecurityNetworkView {
  readonly element = document.createElement('div');
  private lastState = '';
  constructor() {
    this.element.className = 'security-network-status';
    this.element.style.cssText = 'position:absolute;left:12px;top:100px;white-space:pre-line;padding:10px 12px;background:#101b22d9;color:#d3f5ff;border:1px solid #67858b;pointer-events:none;font:12px monospace;max-width:min(250px,calc(100vw - 48px));';
    this.element.hidden = true;
  }
  update(controller: CultivationRoomFiveController, visible: boolean): void {
    const show = visible && !controller.releasing;
    if (this.element.hidden === show) this.element.hidden = !show;
    if (!show) return;
    const state = controller.complete ? 'complete' : controller.rescued ? 'rescued' : controller.security.disabledNetwork ?? 'none';
    if (state === this.lastState) return;
    this.lastState = state;
    this.element.textContent = state === 'complete' ? 'CULTIVATION COMPLETE\nBob + Goop + Volt rescued'
      : state === 'rescued' ? 'SECURITY SHUT DOWN\nVolt available — switch with Tab'
      : `SECURITY NETWORKS\n△ RED    ${state === 'red' ? 'OFFLINE' : 'ONLINE'}\n○ BLUE   ${state === 'blue' ? 'OFFLINE' : 'ONLINE'}\n□ GREEN  ${state === 'green' ? 'OFFLINE' : 'ONLINE'}\nShoot the switch handle to toggle\nOne bypass available`;
  }
  dispose(): void { this.element.remove(); }
}
