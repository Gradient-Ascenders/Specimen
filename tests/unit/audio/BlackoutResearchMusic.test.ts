import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { RESEARCH_TIMING as T } from '../../../src/cinematics/BlackoutResearchTimeline.ts';

// These beats are embedded in the supplied score; changing them requires re-editing it.
test('research score stays synchronized to its authored cinematic beats', () => {
  assert.deepEqual([T.alarm, T.blackout, T.chase, T.crossfire, T.fusion, T.blast,
    T.escape, T.overlook, T.boss, T.duration], [66, 123.5, 134, 195, 208, 222, 230, 236, 262, 277]);
});

function readOggDuration(fileName: string): number {
  const data = readFileSync(new URL(`../../../public/assets/audio/music/${fileName}`, import.meta.url));
  assert.equal(data.toString('ascii', 0, 4), 'OggS');
  assert.equal(data.toString('ascii', 29, 35), 'vorbis');
  const sampleRate = data.readUInt32LE(40);
  assert.equal(sampleRate, 44_100);
  const last = data.lastIndexOf('OggS');
  assert.ok(last >= 0);
  assert.ok(data[last + 5]! & 4, 'final page carries the end-of-stream flag');
  return Number(data.readBigUInt64LE(last + 6)) / sampleRate;
}

test('supplied cinematic OGG streams cover the ascent and the complete 277-second research film', () => {
  assert.ok(Math.abs(readOggDuration('blackout-elevator-quiet-ascent.ogg') - 85.068) < .01);
  assert.equal(readOggDuration('blackout-research-the-specimen.ogg'), T.duration);
});
