import { gameplayAudioEvents } from './GameplayAudioEvents.ts';
import { SOUND_BANKS, type SoundId } from './SoundCatalog.ts';
import { VOLT_FINALE as T } from '../cinematics/CultivationFinaleTimeline.ts';

export const VOLT_RESCUE_AUDIO_CUES: readonly (readonly [number, SoundId])[] = [
  [T.button,'world-button-press-01'],[T.open,'cultivation-volt-cell-open-01'],
  [T.scanVolt,'escape-drone-scan-01'],[T.critical,'escape-scan-result-01'],[T.terminateVolt,'escape-termination-warning-01'],
  [T.coverJump,'bob-jump-01'],[T.coverLand,'bob-land-soft-01'],
  [T.coverHit,'bob-contact-01'],[T.coverHit+.2,'cultivation-cover-break-free-01'],
  [T.coverImpact,'cultivation-cover-drone-impact-01'],[T.acidHit,'cultivation-sentry-acid-splash-01'],
  [T.scanBob,'escape-drone-scan-01'],[T.catastrophic,'escape-scan-result-01'],[T.terminateBob,'escape-termination-warning-01'],
  [T.voltJump,'bob-charged-jump-01'],[T.hijack,'cultivation-volt-drone-hijack-01'],
  [T.bobJump,'bob-jump-01'],[T.boarded,'bob-land-soft-01'],
  [T.bobVentJump,'bob-jump-01'],[T.bobVentLand,'bob-land-soft-01'],
  [T.voltVentJump,'bob-jump-01'],[T.ductLand,'bob-land-soft-01'],
  [T.powerOff,'escape-power-down-01'],[T.rideAcidHit,'cultivation-sentry-acid-splash-01'],
  [T.ductShake,'world-platform-land-01'],[T.grateWarning,'cultivation-duct-floor-strain-01'],
  [T.grateBreak,'world-vent-break-01'],[T.drop,'escape-shaft-fall-01'],
];

export const VOLT_RESCUE_DISSOLVE_KEYS = ['cultivation-rescue-dissolve-0', 'cultivation-rescue-dissolve-1'] as const;

/** Release owned recordings on skip, completion and reset, without stopping unrelated world audio. */
export function stopVoltRescueAudio(): void {
  for (const key of ['cultivation-finale-alarm', ...VOLT_RESCUE_DISSOLVE_KEYS]) gameplayAudioEvents.emit('stop', { key });
  const sounds = new Set<SoundId>([
    ...SOUND_BANKS.cultivation.filter(id => id.startsWith('cultivation-') && !id.startsWith('cultivation-sentry-')),
    'cultivation-sentry-acid-splash-01', ...SOUND_BANKS.escape,
  ]);
  for (const sound of sounds) gameplayAudioEvents.emit('stopSound', { sound });
}
