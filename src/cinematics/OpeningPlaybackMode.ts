export type OpeningPlaybackMode = 'live' | 'mp4';

/** Identical in development and production. The video is an explicit backup,
 * never a default or an automatic response to a live preparation failure. */
export function getOpeningPlaybackMode(search: string): OpeningPlaybackMode {
  return new URLSearchParams(search).get('opening') === 'mp4' ? 'mp4' : 'live';
}
