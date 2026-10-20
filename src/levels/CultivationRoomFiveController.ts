import { SecurityNetworkController } from '../puzzle/SecurityNetworkController.ts';

export type RoomFiveCheckpoint = 'split' | 'controls' | 'rescued';

/** Fixed-step puzzle state; checkpoint ownership is independent of active slime. */
export class CultivationRoomFiveController {
  readonly security = new SecurityNetworkController();
  checkpoint: RoomFiveCheckpoint = 'split';
  brokenDroneState: 'dormant' | 'rebooting' | 'active' | 'destroyed' = 'dormant';
  rebootElapsed = 0;
  brokenDroneHits = 0;
  buttonProgress = 0;
  private bobReachedRoute = false;
  private goopPassedDrone = false;
  releaseElapsed = 0;
  exitPowered = false;
  complete = false;
  get releasing(): boolean { return this.security.shutdown && this.releaseElapsed < 4; }
  get rescued(): boolean { return this.security.shutdown && this.releaseElapsed >= 4; }
  get objective(): string {
    if (this.complete) return 'Cultivation complete — Volt is free!';
    if (this.rescued) return 'Volt is free — entering Blackout';
    if (this.releasing) return 'Volt containment releasing';
    if (this.checkpoint === 'controls') return 'Use the security networks to reach Volt';
    return 'Find Volt and the sewer security controls';
  }
  update(dt: number, nearBrokenDrone: boolean, bobOnRoute: boolean,
    goopPastDrone: boolean, bobUsingButton: boolean): void {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Invalid Room 5 timestep');
    if (this.brokenDroneState === 'dormant' && nearBrokenDrone) this.brokenDroneState = 'rebooting';
    if (this.brokenDroneState === 'rebooting') {
      this.rebootElapsed += dt;
      if (this.rebootElapsed + 1e-9 >= 1.5) this.brokenDroneState = 'active';
    }
    // Either slime can get here first. Moving Bob away from the first safe
    // station must not erase Goop's progress through the sewer (or vice versa).
    this.bobReachedRoute ||= bobOnRoute;
    this.goopPassedDrone ||= goopPastDrone && this.brokenDroneState === 'destroyed';
    if (this.checkpoint === 'split' && this.bobReachedRoute && this.goopPassedDrone) {
      this.checkpoint = 'controls';
    }
    if (!this.security.shutdown) {
      this.buttonProgress = this.checkpoint === 'controls' && bobUsingButton
        ? Math.min(1, this.buttonProgress + dt / 1.5) : 0;
      if (this.buttonProgress >= 1) this.security.release();
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
  finish(): void { if (this.rescued) this.complete = true; }
  reset(checkpoint: RoomFiveCheckpoint = 'split'): void {
    this.checkpoint = checkpoint;
    this.security.reset();
    this.brokenDroneState = checkpoint === 'split' ? 'dormant' : 'destroyed';
    this.brokenDroneHits = checkpoint === 'split' ? 0 : 3;
    this.bobReachedRoute = this.goopPassedDrone = checkpoint !== 'split';
    this.rebootElapsed = 0; this.buttonProgress = 0; this.releaseElapsed = 0;
    this.exitPowered = false; this.complete = false;
    if (checkpoint === 'rescued') { this.security.release(); this.releaseElapsed = 4; this.buttonProgress = 1; }
  }
}
