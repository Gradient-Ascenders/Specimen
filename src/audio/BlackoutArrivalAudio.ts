import type { AudioManager } from './AudioManager.ts';

/** The first-frame one-shot must be decoded before the arrival can start.
 * Audio remains optional: unsupported/failed/stalled loading cannot block a level indefinitely. */
export async function prepareBlackoutArrivalAudio(
  audio: Pick<AudioManager, 'preload'>,
  maxWaitMs = 5000,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      audio.preload(['blackout-vent-slime-slide-01']),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, maxWaitMs); }),
    ]);
  } catch {
    // An optional sound failure must not prevent the normal level entry.
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
