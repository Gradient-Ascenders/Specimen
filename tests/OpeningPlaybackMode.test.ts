import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpeningPlaybackMode } from '../src/cinematics/OpeningPlaybackMode.ts';

test('ordinary, debug, legacy live and unknown entry URLs always select the live opening', () => {
  for (const search of ['', '?debug=1', '?opening=live', '?opening=', '?opening=unknown', '?graphics=minimum']) {
    assert.equal(getOpeningPlaybackMode(search), 'live', search);
  }
});

test('requesting the optional MP4 player requires an explicit opt-in', () => {
  assert.equal(getOpeningPlaybackMode('?opening=mp4'), 'mp4');
  assert.equal(getOpeningPlaybackMode('?debug=1&opening=mp4'), 'mp4');
});
