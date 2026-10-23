import type { AudioPlayback } from './AudioManager.ts';
import type { SpecimenProjectileSystem } from '../combat/SpecimenProjectileSystem.ts';
import type { SpecimenDash } from '../combat/SpecimenDash.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';

/** Level-owned charge loop and one-shot accents, using the shared bounded audio mixer. */
export class SpecimenAbilityAudio {
  private readonly unsubscribe: (() => void)[];
  private chargedJump = false;
  private enabled = false;
  private readonly audio: AudioPlayback;
  private readonly body: KinematicBody;
  private readonly weapon: SpecimenProjectileSystem;
  constructor(audio: AudioPlayback, body: KinematicBody, weapon: SpecimenProjectileSystem, dash: SpecimenDash) {
    this.audio = audio; this.body = body; this.weapon = weapon;
    this.unsubscribe = [
      weapon.events.on('chargeCancelled', () => this.stopCharge()),
      weapon.events.on('projectileFired', event => {
        this.stopCharge();
        if (!this.enabled) return;
        audio.play('volt-shoot-01', body.position, true, event.fullyCharged || event.overcharged ? 1 : 0.6);
        if (event.overcharged) audio.play('world-release-01', body.position, false, 0.8);
      }),
      weapon.events.on('fullChargeReached', () => { if (this.enabled) audio.play('volt-charge-ready-01', body.position, false, 0.8); }),
      weapon.events.on('overchargeReady', () => { if (this.enabled) audio.play('volt-circuit-connect-01', body.position, false, 0.9); }),
      weapon.events.on('hitFeedback', event => {
        if (!this.enabled) return;
        audio.play(event.kind === 'hit' ? 'goop-projectile-impact-01' : 'volt-circuit-release-01',
          body.position, false, event.kind === 'hit' ? (event.fullyCharged ? 0.85 : 0.6) : 0.4);
      }),
      dash.events.on('started', () => { if (this.enabled) {
        audio.play('world-release-01', body.position, true, 0.8);
        audio.play('volt-circuit-release-01', body.position, true, 0.55);
      } }),
      dash.events.on('dodged', () => { if (this.enabled) audio.play('volt-circuit-connect-01', body.position, false, 0.85); }),
      body.events.on('jumped', event => { this.chargedJump = this.enabled && event.chargeFraction >= 0.85; }),
      body.events.on('landed', event => {
        if (this.enabled && this.chargedJump && event.impactSpeedMetresPerSecond >= 8) {
          audio.play('world-platform-land-01', body.position, true, 0.16);
          audio.play('volt-circuit-release-01', body.position, false, 0.6);
        }
        this.chargedJump = false;
      }),
    ];
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.chargedJump = false; this.stopCharge(); }
  }
  update(): void {
    const model = this.weapon.readModel;
    if (!this.enabled || !model.charging) { this.stopCharge(); return; }
    this.audio.startLoop('specimen-charge', 'specimen-charge-loop-01', this.body.position,
      0.4 + 0.6 * model.chargeAmount, 0.7 + 1.1 * model.chargeAmount);
  }
  private stopCharge(): void { this.audio.stopLoop('specimen-charge'); }
  dispose(): void { this.setEnabled(false); for (const off of this.unsubscribe) off(); }
}
