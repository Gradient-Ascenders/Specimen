import type { CultivationRoomFourController } from '../levels/CultivationRoomFourController.ts';

/** Persistent read-only scanner/progress display. Writes only when its displayed value changes. */
export class ElevatorEncounterView {
  readonly element = document.createElement('div');
  private lastText = '';
  constructor() {
    this.element.className = 'elevator-encounter-status';
    this.element.hidden = true;
  }
  update(controller: CultivationRoomFourController, visible: boolean): void {
    this.element.hidden = !visible;
    if (!visible) return;
    const m = controller.readModel;
    const text = m.elapsed === 0
      ? `Board together\nBob: ${m.bobPresent ? 'ready' : 'waiting'} · Goop: ${m.goopPresent ? 'ready' : 'waiting'}\n${controller.boardingConfirmed ? 'Ready to descend' : 'Both specimens required'}`
      : m.state === 'complete' ? 'Lift arrived\nEnter Room 5'
      : `Descending · ${Math.floor(controller.progress * 100)}%\n${m.state === 'arrival' ? 'Securing arrival' : m.elapsed < 4 ? 'Going to the lower sector' : m.elapsed >= 15 && m.elapsed < 20 ? 'Shoot the drones with Goop' : ''}`;
    if (text !== this.lastText) { this.lastText = text; this.element.textContent = text; }
  }
  dispose(): void { this.element.remove(); }
}
