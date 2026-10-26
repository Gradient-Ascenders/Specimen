import type { FinalBossReadModel, FinalBossState } from '../boss/FinalBossController.ts';
import type { AudioPlayback } from './AudioManager.ts';
import type { AudioPosition } from './GameplayAudioEvents.ts';
import { BOSS_SOUND_IDS, type SoundId } from './SoundCatalog.ts';

const WARNINGS: readonly SoundId[] = ['boss-cannon-spin-up-01', 'boss-orb-charge-01', 'boss-beam-charge-01', 'boss-ram-windup-01'];
const CINEMATIC: readonly SoundId[] = ['boss-emergence-01', 'boss-phase-two-overload-01', 'boss-reactor-failure-01', 'boss-final-explosion-01'];

/** Reads the authoritative fight; never advances an attack or a cinematic. */
export class FinalBossAudio {
  private readonly audio: AudioPlayback | undefined;
  private state: FinalBossState = 'idle';
  private stage = '';
  private shield = false;
  private beam = false;
  private exploded = false;
  constructor(audio?: AudioPlayback) { this.audio = audio; }

  update(model: Readonly<FinalBossReadModel>, machine: AudioPosition, eye: AudioPosition): void {
    const audio = this.audio;
    if (!audio) return;
    const combat = model.state === 'combat';
    if (model.state !== this.state) {
      this.stopAttack();
      if (this.state === 'intro') audio.stopSound?.('boss-emergence-01');
      if (this.state === 'transition') audio.stopSound?.('boss-phase-two-overload-01');
      if (this.state === 'defeated') audio.stopSound?.('boss-reactor-failure-01');
      if (model.state === 'intro') audio.play('boss-emergence-01', machine);
      if (model.state === 'transition') audio.play('boss-phase-two-overload-01', machine);
      if (model.state === 'defeated') { this.exploded = false; audio.play('boss-reactor-failure-01', machine); }
      this.state = model.state;
    }
    if (['intro', 'combat', 'transition'].includes(model.state))
      audio.startLoop('final-boss-engine', 'boss-hover-loop-01', machine, combat ? .8 : .6, model.phase === 2 ? 1.15 : 1);
    else audio.stopLoop('final-boss-engine');

    if (model.state === 'defeated' && model.progress >= .55 && !this.exploded) {
      this.exploded = true;
      audio.stopSound?.('boss-reactor-failure-01');
      audio.play('boss-final-explosion-01', eye);
    }
    const shield = combat && model.shieldActive;
    if (shield && !this.shield) audio.play('boss-shield-activate-01', machine);
    if (!shield && this.shield && combat) audio.play('boss-shield-collapse-01', machine);
    this.shield = shield;
    if (shield) audio.startLoop('final-boss-shield', 'boss-shield-regeneration-loop-01', machine, model.regenerating ? 1 : .55);
    else audio.stopLoop('final-boss-shield');

    const stage = combat ? `${model.attackSerial}:${model.stage}` : '';
    if (stage !== this.stage) {
      for (const sound of WARNINGS) audio.stopSound?.(sound);
      audio.stopSound?.('boss-ram-rush-01');
      if (combat && model.stage === 'telegraph') {
        switch (model.attack) {
          case 'gun-blast': audio.play('boss-cannon-spin-up-01', machine); break;
          case 'laser-shots': audio.play('boss-orb-charge-01', eye, false, 1, model.phase === 2 ? 1.35 / .8 : 1); break;
          case 'laser-beam': audio.play('boss-beam-charge-01', eye, false, 1, model.phase === 2 ? 2.6 / 1.6 : 1); break;
          case 'ram': audio.play('boss-ram-windup-01', machine); break;
        }
      }
      if (combat && model.attack === 'ram' && model.stage === 'active') audio.play('boss-ram-rush-01', machine);
      this.stage = stage;
    }
    if (model.stunRemaining > 0) {
      for (const sound of WARNINGS) audio.stopSound?.(sound);
      audio.stopSound?.('boss-ram-rush-01');
    }
    const beam = combat && model.attack === 'laser-beam' && model.stage === 'active' && model.stunRemaining <= 0;
    if (beam && !this.beam) { audio.stopSound?.('boss-beam-shutdown-01'); audio.play('boss-beam-ignite-01', eye); }
    if (!beam && this.beam && combat) {
      audio.stopSound?.('boss-beam-ignite-01');
      audio.play('boss-beam-shutdown-01', eye);
    }
    if (beam) audio.startLoop('final-boss-beam', 'boss-beam-sustain-loop-01', eye);
    else audio.stopLoop('final-boss-beam');
    this.beam = beam;
  }

  /** Skipping discards the current recording; it never plays skipped beats. */
  skipCinematic(): void { for (const sound of CINEMATIC) this.audio?.stopSound?.(sound); }
  stopAttack(): void {
    this.audio?.stopLoop('final-boss-beam');
    this.audio?.stopLoop('final-boss-shield');
    for (const sound of [...WARNINGS, 'boss-ram-rush-01', 'boss-beam-ignite-01'] as const) this.audio?.stopSound?.(sound);
    this.stage = ''; this.beam = false; this.shield = false;
  }
  reset(): void {
    this.stopAttack(); this.audio?.stopLoop('final-boss-engine');
    for (const sound of BOSS_SOUND_IDS) this.audio?.stopSound?.(sound);
    this.state = 'idle'; this.exploded = false;
  }
}
