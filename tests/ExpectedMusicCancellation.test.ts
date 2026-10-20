import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpectedMusicCancellation } from './helpers/ExpectedMusicCancellation.ts';

const base = 'http://127.0.0.1:4173/group-folder/';
const music = `${base}assets/audio/music/00-intro-osmotic-memory.ogg`;
const request = (url = music, error: string | null = 'net::ERR_ABORTED', type = 'media', method = 'GET') => ({
  url: () => url, failure: () => error === null ? null : { errorText: error },
  resourceType: () => type, method: () => method,
});

test('Chromium and Firefox may cancel or cache a same-deployment streamed music request', () => {
  for (const error of ['net::ERR_ABORTED', 'NS_BINDING_ABORTED', 'NS_ERROR_PARSED_DATA_CACHED']) {
    assert.equal(isExpectedMusicCancellation(request(music, error), base), true);
    assert.equal(isExpectedMusicCancellation(request(`${music}?cache=1`, error), base), true);
  }
});

test('unexpected failures and requests remain visible to browser checks', () => {
  for (const error of ['net::ERR_ABORTED', 'NS_BINDING_ABORTED', 'NS_ERROR_PARSED_DATA_CACHED']) {
    for (const url of [
      music.replace('127.0.0.1', 'localhost'), music.replace('/group-folder/', '/'),
      music.replace('/music/', '/bob/'), music.replace('.ogg', '.js'),
      music.replace('/music/', '/music/other/'), `${music}.glb`,
    ]) assert.equal(isExpectedMusicCancellation(request(url, error), base), false, url);
    for (const type of ['fetch', 'xhr', 'document', 'script'])
      assert.equal(isExpectedMusicCancellation(request(music, error, type), base), false);
    assert.equal(isExpectedMusicCancellation(request(music, error, 'media', 'POST'), base), false);
  }
  for (const error of ['net::ERR_FAILED', 'net::ERR_CONNECTION_RESET', 'NS_ERROR_NET_RESET', null])
    assert.equal(isExpectedMusicCancellation(request(music, error), base), false);
});
