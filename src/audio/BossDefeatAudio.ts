import { Vector3 } from 'three';
import { CutsceneMovementAudio, CutsceneSoundTrack } from './BlackoutCutsceneAudio.ts';
import { gameplayAudioEvents } from './GameplayAudioEvents.ts';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';
import { ENDING_TIMING as T, endingProgress, endingDroneDeathTime, endingGoopHitTime,
  endingCollapseBlastTime, sampleEndingSlime, sampleEndingIncomingShot } from '../cinematics/BossDefeatTimeline.ts';

/** Presentation-only, driven by the same clock and poses as First sunlight. */
export class BossDefeatAudio extends CutsceneSoundTrack {
  private readonly movement = new CutsceneMovementAudio();
  private readonly actors = [new Vector3(), new Vector3(), new Vector3()];
  private readonly from = new Vector3();
  private readonly to = new Vector3();

  update(before: number, t: number): void {
    if (!this.frame(before, t)) return;
    before = this.frameBefore;
    // Stop tails as well as loops at the black frame. No exit-door sound is
    // allowed during the six seconds of silence, even though its pose starts early.
    if (t >= T.black && t < T.daylight || t >= T.credits) {
      this.silence();
      return;
    }
    const regular = t - before <= .25;
    if (!regular) this.silence(); // Keep the clock guard while discarding old one-shot tails.
    const duck = 1 - .75 * Math.min(endingProgress(t, T.goodbye - .6, T.goodbye),
      1 - endingProgress(t, T.goodbyeEnd, T.goodbyeEnd + .8));
    const collapse = (t < T.explosion ? .3 : t < T.destruction ? .9 : 1) * endingProgress(t, 0, 1.5)
      * (1 - endingProgress(t, T.black - 1, T.black)) * duck;

    // Screen-space mix: the gameplay listener stays at the arena checkpoint
    // while the movie's camera and borrowed actors travel all the way outside.
    this.loop('ending:damaged-boss', 'ending-boss-strain-loop-01', t < T.explosion, undefined,
      (.2 + .3 * endingProgress(t, 0, 1)) * (t < T.fire ? 1 : .4));
    this.loop('ending:boss-beam', 'boss-beam-sustain-loop-01', t >= T.fire && t < T.explosion, undefined, .45);
    this.loop('ending:specimen-beam', 'ending-specimen-beam-loop-01', t >= T.specimenFire && t < T.explosion, undefined, .7);
    this.loop('ending:collision', 'ending-beam-collision-loop-01', t >= T.impact && t < T.explosion, undefined,
      .3 + .3 * endingProgress(t, T.impact, T.explosion), .72);
    this.loop('ending:collapse', 'ending-structural-rumble-loop-01', t < T.black, undefined, collapse);
    this.loop('ending:drones', 'world-drone-flight-loop-01', t >= T.drones && t < T.hideGoop, undefined,
      .8 * endingProgress(t, T.drones, T.drones + 4) * (1 - endingProgress(t, T.hideGoop - 2, T.hideGoop)) * duck);
    this.loop('ending:launch-shutters', 'world-door-movement-loop-01', t >= T.drones - 1 && t < T.drones + 2.4, undefined, .2 * duck);
    this.loop('ending:isolation-door', 'world-door-movement-loop-01', t >= T.runAgain + 1 && t < T.runAgain + 4, undefined, .2);
    this.loop('ending:exit-door', 'world-door-movement-loop-01', t >= T.daylight && t < T.daylight + 1, undefined, .15);
    this.loop('ending:outside', 'ending-outdoor-ambience-loop-01', t >= T.daylight && t < T.credits, undefined,
      .8 * endingProgress(t, T.daylight, T.daylight + 3) * (1 - endingProgress(t, T.credits - 4, T.credits)));

    this.at(before, t, T.charge, 'ending-specimen-charge-01');
    if (regular && before < T.bossCharge && t >= T.bossCharge)
      this.cue('boss-beam-charge-01', undefined, .8);
    this.at(before, t, T.fire, 'boss-beam-ignite-01', undefined, .9);
    this.at(before, t, T.specimenFire, 'specimen-heavy-blast-01', undefined, .75);
    if (before < T.specimenFire && t >= T.specimenFire)
      gameplayAudioEvents.emit('stopSound', { sound: 'ending-specimen-charge-01' });
    this.at(before, t, T.impact, 'ending-beam-collision-impact-01');
    this.at(before, t, T.orbit, 'ending-energy-overload-rise-01');
    if (before < T.explosion && t >= T.explosion)
      gameplayAudioEvents.emit('stopSound', { sound: 'ending-energy-overload-rise-01' });
    this.at(before, t, T.explosion, 'boss-final-explosion-01');
    this.at(before, t, T.split, 'ending-slime-separate-01');
    this.at(before, t, T.explosion, 'ending-boss-wreck-fall-01', undefined, .8);
    this.at(before, t, T.landing, 'bob-land-hard-01', undefined, .85);
    this.at(before, t, T.lookBack, 'bob-contact-01', undefined, .6);
    this.at(before, t, T.drones + 2.4, 'world-door-stop-01', undefined, .2);
    this.at(before, t, T.runAgain + 4, 'world-door-stop-01', undefined, .3);
    this.at(before, t, T.daylight + 1, 'world-door-stop-01', undefined, .15);
    for (let i = 0; i < 6; i += 2)
      this.at(before, t, T.drones + i * 1.2, 'boss-drone-deploy-01', undefined, .45 * duck);

    for (const [i, id] of (['bob', 'goop', 'volt'] as const).entries()) {
      const pose = sampleEndingSlime(id, t, this.actors[i]!);
      const movingShot = t >= T.regroup && t < T.destruction || t >= T.daylight && t < T.sky;
      this.movement.update(id, t, this.actors[i]!, pose.airborne,
        regular && pose.visible && movingShot && (id !== 'goop' || t < T.together),
        (sound, _position, volume, vary) => this.cue(sound, undefined, (volume ?? 1) * duck, vary));
    }
    if (!regular) return;
    this.combat(before, t, duck);
    this.debris(before, t, duck);
  }

  private combat(before: number, t: number, duck: number): void {
    if (t >= T.hideGoop) return;
    // Targeted shots and repeating fire both follow the visible Goop bolts.
    for (let i = 0; i < 24; i++) {
      const death = endingDroneDeathTime(i), fired = death - 1;
      if (fired >= T.leave && fired < T.hideGoop)
        this.at(before, t, fired, 'goop-shoot-01', undefined, .65 * duck, true);
      if (death < T.hideGoop)
        this.at(before, t, death, 'goop-projectile-impact-01', undefined, .3 * duck, true);
    }
    const shot = Math.floor((t - T.leave) / .7);
    if (shot >= 0 && T.leave + shot * .7 < T.hideGoop)
      this.at(before, t, T.leave + shot * .7, 'goop-shoot-01', undefined, .5 * duck, true);
    // Sample four lanes of the 24-drone crossfire to keep the shared voice
    // budget bounded. Launches, flybys and floor impacts retain their flight delays.
    for (let i = 0; i < 24; i += 6) {
      const start = T.returnFire + i * .045, ordinal = Math.floor((t - start) / 1.3);
      for (let n = Math.max(0, ordinal - 1); n <= ordinal; n++) {
        const launch = start + n * 1.3;
        if (!sampleEndingIncomingShot(i, launch, this.from, this.to)) continue;
        this.at(before, t, launch, 'boss-drone-shot-01', undefined, .3 * duck, true);
        this.at(before, t, launch + .5, 'ending-projectile-flyby-01', undefined, .5 * duck, true);
        if (i === 12 && n % 2 === 0)
          this.at(before, t, launch + .65, 'escape-projectile-metal-impact-01', undefined, .18 * duck, true);
      }
    }
    for (let i = 0; i < 3; i++)
      this.at(before, t, endingGoopHitTime(i), 'ending-goop-hit-01', undefined, .9 * (.6 + .4 * duck), true);
  }

  private debris(before: number, t: number, duck: number): void {
    // Sparse contact accents; the continuous structural rumble carries the
    // collapse rather than repeating the same metal recording for every panel.
    for (const i of [1, 6]) {
      const size = .12 + i % 4 * .08;
      const fall = Math.sqrt((6 - FINAL_ARENA.floorY - size * .16) / 1.8);
      this.at(before, t, T.strain + i * .8 + fall, 'ending-debris-impact-01', undefined, .2 * duck, true);
    }
    for (const i of [32, 104]) {
      const size = 1 + i % 5 * .7;
      const fall = Math.sqrt((64 + i % 7 * 4 - FINAL_ARENA.floorY - size * .16) / 3.2);
      const first = T.explosion + (i - 32) * .34 + fall;
      if (first < T.destruction)
        this.at(before, t, first, 'ending-debris-impact-01', undefined, .28 * duck, true);
      const final = T.destruction + (i - 32) * .04 + fall;
      if (final < T.black) this.at(before, t, final, 'ending-debris-impact-01', undefined, .3, true);
    }
    for (const i of [0, 40])
      this.at(before, t, T.destruction + 3.2 + i * .11, 'ending-girder-crash-01', undefined, .5, true);
    for (let i = 0; i < 12; i++)
      this.at(before, t, endingCollapseBlastTime(i), 'ending-collapse-blast-01', undefined, .8, true);
  }

  private silence(): void { this.releaseSounds(); this.movement.reset(); }
  override stop(): void { super.stop(); this.movement.reset(); }
}
