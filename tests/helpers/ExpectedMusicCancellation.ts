interface FailedRequest {
  url(): string;
  method(): string;
  resourceType(): string;
  failure(): { errorText: string } | null;
}

/** Browsers cancel streamed music when it is paused, replaced, or handed back
 * to Firefox's media cache. Do not hide failed SFX/assets, cross-origin
 * requests, fetches, or actual network errors. */
export function isExpectedMusicCancellation(request: FailedRequest, baseURL: string): boolean {
  const error = request.failure()?.errorText;
  if (error !== 'net::ERR_ABORTED' && error !== 'NS_BINDING_ABORTED' &&
    error !== 'NS_ERROR_PARSED_DATA_CACHED') return false;
  if (request.method() !== 'GET' || request.resourceType() !== 'media') return false;
  const url = new URL(request.url());
  const music = new URL('assets/audio/music/', baseURL);
  return url.origin === music.origin && url.pathname.startsWith(music.pathname) &&
    /^[^/]+\.ogg$/.test(url.pathname.slice(music.pathname.length));
}
