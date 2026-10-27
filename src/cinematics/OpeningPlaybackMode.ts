export type OpeningPlaybackMode = 'live' | 'mp4';

/** Requests the video only by explicit opt-in. The caller uses live playback
 * when the build omits the backup; live preparation failures never select it. */
export function getOpeningPlaybackMode(search: string): OpeningPlaybackMode {
  return new URLSearchParams(search).get('opening') === 'mp4' ? 'mp4' : 'live';
}
