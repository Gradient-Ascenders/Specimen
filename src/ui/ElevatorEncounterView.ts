import type { CultivationRoomFourController } from '../levels/CultivationRoomFourController.ts';

/** Persistent read-only scanner/progress display. Writes only when its displayed value changes. */
export class ElevatorEncounterView {
  readonly element = document.createElement('div');
  private lastText = '';
  constructor() {
    this.element.className = 'elevator-encounter-status';
    this.element.style.cssText = 'position:absolute;left:12px;top:100px;white-space:pre-line;text-align:center;padding:10px 12px;background:#101b22d9;color:#d3f5ff;border:1px solid #67858b;pointer-events:none;font:12px monospace;max-width:min(240px,calc(100vw - 48px));';
    this.element.hidden = true;
  }
  update(controller: CultivationRoomFourController, visible: boolean): void {
    this.element.hidden = !visible;
    if (!visible) return;
    const m = controller.readModel;
    const text = m.elapsed === 0
      ? `SPECIMEN COUNT\nBOB: ${m.bobPresent ? 'PRESENT' : 'REQUIRED'}  GOOP: ${m.goopPresent ? 'PRESENT' : 'REQUIRED'}\n${controller.boardingConfirmed ? 'DESCENT AUTHORIZED' : 'Board together'}`
      : m.state === 'complete' ? 'ACCESS GRANTED — ENTER ROOM 5'
      : `LOWER SECTOR  ${Math.floor(controller.progress * 100)}%\n${m.state === 'arrival' ? 'SECURING ARRIVAL' : m.elapsed < 4 ? 'DESCEND TO LOWER SECTOR' : m.elapsed >= 15 && m.elapsed < 20 ? 'DISSOLVE THE SUPPORT CABLES' : ' '}`;
    if (text !== this.lastText) { this.lastText = text; this.element.textContent = text; }
  }
  dispose(): void { this.element.remove(); }
}
