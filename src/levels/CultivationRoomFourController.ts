export type RoomFourState = 'waitingForSlimes' | 'preparingDescent' | 'descendingIntro' |
  'waveOne' | 'waveTwo' | 'waveThree' | 'arrival' | 'complete';

export const ROOM_FOUR_WAVES = [
  { start: 15, spacing: 2, descentSpeed: 7, anchors: [1, 6] },
  { start: 30, spacing: 2, descentSpeed: 9, anchors: [0, 2, 4, 5] },
  { start: 45, spacing: 1.5, descentSpeed: 14, anchors: [3, 2, 5, 4, 0, 7] },
] as const;
export const ROOM_FOUR_SPAWNS = ROOM_FOUR_WAVES.flatMap(wave =>
  wave.anchors.map((anchor, index) => ({ time: wave.start + index * wave.spacing,
    anchor, descentSpeed: wave.descentSpeed })));

/** Fixed-step authority. Rendering and doors consume this state, never drive its clock. */
export class CultivationRoomFourController {
  private model = { state: 'waitingForSlimes' as RoomFourState, elapsed: 0,
    confirmation: 0, arrivalElapsed: 0, bobPresent: false, goopPresent: false };
  get readModel(): Readonly<typeof this.model> { return this.model; }
  get running(): boolean {
    return this.model.state !== 'waitingForSlimes' && this.model.state !== 'preparingDescent' &&
      this.model.state !== 'arrival' && this.model.state !== 'complete';
  }
  get boardingConfirmed(): boolean { return this.model.confirmation >= 1.5; }
  get progress(): number {
    const t = this.model.elapsed;
    // Integral of a 2s acceleration, 55s cruise and 3s braking ramp.
    const distance = t < 2 ? t * t / 4 : t < 57 ? t - 1 : 56 + (t - 57) - (t - 57) ** 2 / 6;
    return distance / 57.5;
  }
  get objective(): string {
    if (this.model.state === 'complete') return 'Enter Room 5';
    if (this.model.state === 'arrival') return 'Lower sector reached';
    if (this.model.elapsed >= 15) return 'Dissolve the support cables';
    return this.running ? 'Descend to the lower sector' : 'Get Bob and Goop onto the elevator';
  }
  update(dt: number, bobPresent: boolean, goopPresent: boolean): void {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid elevator timestep');
    const m = this.model;
    m.bobPresent = bobPresent; m.goopPresent = goopPresent;
    if (m.state === 'complete') return;
    if (m.state === 'arrival') {
      m.arrivalElapsed += dt;
      if (m.arrivalElapsed + 1e-9 >= 1.5) m.state = 'complete';
      return;
    }
    if (m.state === 'waitingForSlimes' || m.state === 'preparingDescent') {
      if (!bobPresent || !goopPresent) {
        m.state = 'waitingForSlimes'; m.confirmation = 0; return;
      }
      m.state = 'preparingDescent';
      m.confirmation = Math.min(1.5, m.confirmation + dt);
      if (m.confirmation >= 1.5) m.state = 'descendingIntro';
      return;
    }
    m.elapsed = Math.min(60, m.elapsed + dt);
    if (m.elapsed >= 60 - 1e-9) { m.elapsed = 60; m.state = 'arrival'; }
    else if (m.elapsed >= ROOM_FOUR_WAVES[2].start) m.state = 'waveThree';
    else if (m.elapsed >= ROOM_FOUR_WAVES[1].start) m.state = 'waveTwo';
    else if (m.elapsed >= 15) m.state = 'waveOne';
  }
  reset(): void {
    Object.assign(this.model, { state: 'waitingForSlimes', elapsed: 0, confirmation: 0,
      arrivalElapsed: 0, bobPresent: false, goopPresent: false });
  }
  restoreArrival(): void {
    Object.assign(this.model, { state: 'complete', elapsed: 60, confirmation: 1.5, arrivalElapsed: 1.5 });
  }
}
