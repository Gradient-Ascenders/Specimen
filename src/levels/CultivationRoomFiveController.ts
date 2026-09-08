import { SecurityNetworkController } from '../puzzle/SecurityNetworkController.ts';

export type RoomFiveCheckpoint = 'split' | 'controls' | 'rescued';

/** Fixed-step puzzle state; checkpoint ownership is independent of active slime. */
export class CultivationRoomFiveController {
  readonly security = new SecurityNetworkController();
  checkpoint: RoomFiveCheckpoint = 'split';
  brokenDroneState: 'dormant' | 'rebooting' | 'active' | 'destroyed' = 'dormant';
  rebootElapsed = 0;
  brokenDroneHits = 0;
  leverProgress = 0;
  releaseElapsed = 0;
  exitPowered = false;
  complete = false;
  get releasing(): boolean { return this.security.shutdown && this.releaseElapsed < 4; }
  get rescued(): boolean { return this.security.shutdown && this.releaseElapsed >= 4; }
  get objective(): string {
    if (this.complete) return 'Cultivation complete — Volt is free!';
    if (this.exitPowered) return 'Bring all three slimes through the exit';
    if (this.rescued) return 'Reunite, then use Volt to power the exit';
    if (this.releasing) return 'Volt containment releasing';
    if (this.checkpoint === 'controls') return 'Use the security networks to reach Volt';
    return 'Find Volt and the sewer security controls';
  }
  update(dt: number, nearBrokenDrone: boolean, bobAtStart: boolean,
    goopAtControls: boolean, bobUsingLever: boolean): void {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Invalid Room 5 timestep');
    if (this.brokenDroneState === 'dormant' && nearBrokenDrone) this.brokenDroneState = 'rebooting';
    if (this.brokenDroneState === 'rebooting') {
      this.rebootElapsed += dt;
      if (this.rebootElapsed + 1e-9 >= 1.5) this.brokenDroneState = 'active';
    }
    if (this.checkpoint === 'split' && bobAtStart && goopAtControls && this.brokenDroneState === 'destroyed') {
      this.checkpoint = 'controls';
    }
    if (!this.security.shutdown) {
      this.leverProgress = this.checkpoint === 'controls' && bobUsingLever
        ? Math.min(1, this.leverProgress + dt / 1.5) : 0;
      if (this.leverProgress >= 1) this.security.release();
    } else {
      this.releaseElapsed = Math.min(4, this.releaseElapsed + dt);
      if (this.rescued) this.checkpoint = 'rescued';
    }
  }
  hitBrokenDrone(): void {
    if (this.brokenDroneState === 'destroyed') return;
    this.brokenDroneHits = Math.min(3, this.brokenDroneHits + 1);
    if (this.brokenDroneHits === 3) this.destroyBrokenDrone();
    else { this.brokenDroneState = 'active'; this.rebootElapsed = 1.5; }
  }
  destroyBrokenDrone(): void { this.brokenDroneState = 'destroyed'; this.brokenDroneHits = 3; }
  powerExit(): void { if (this.rescued) this.exitPowered = true; }
  finish(): void { if (this.exitPowered) this.complete = true; }
  reset(checkpoint: RoomFiveCheckpoint = 'split'): void {
    this.checkpoint = checkpoint;
    this.security.reset();
    this.brokenDroneState = checkpoint === 'split' ? 'dormant' : 'destroyed';
    this.brokenDroneHits = checkpoint === 'split' ? 0 : 3;
    this.rebootElapsed = 0; this.leverProgress = 0; this.releaseElapsed = 0;
    this.exitPowered = false; this.complete = false;
    if (checkpoint === 'rescued') { this.security.release(); this.releaseElapsed = 4; this.leverProgress = 1; }
  }
}
