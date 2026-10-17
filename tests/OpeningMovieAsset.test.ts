import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { OPENING_GAME_TIMING } from '../src/cinematics/OpeningGameTimeline.ts';

function boxes(bytes: Buffer, start = 0, end = bytes.length) {
  const result: { type: string; start: number; end: number }[] = [];
  while (start < end) {
    assert.ok(start + 8 <= end, 'Truncated MP4 box header.');
    const size = bytes.readUInt32BE(start);
    assert.ok(size >= 8 && start + size <= end, 'Invalid/truncated MP4 box.');
    result.push({ type: bytes.toString('ascii', start + 4, start + 8), start, end: start + size });
    start += size;
  }
  return result;
}

test('committed MP4 matches its export manifest and current authored duration, with fast-start H264 video', async () => {
  const base = new URL('../src/assets/cinematics/', import.meta.url);
  const [movie, manifest] = await Promise.all([
    readFile(new URL('opening.mp4', base)),
    readFile(new URL('opening.json', base), 'utf8').then(JSON.parse),
  ]);
  assert.equal(manifest.bytes, movie.length);
  assert.equal(manifest.sha256, createHash('sha256').update(movie).digest('hex'));
  assert.equal(manifest.width, 1920); assert.equal(manifest.height, 1080);
  assert.equal(manifest.fps, 30); assert.equal(manifest.codec, 'h264');
  assert.equal(manifest.pixelFormat, 'yuv420p'); assert.equal(manifest.audio, false);
  assert.equal(manifest.sourceStartSeconds, OPENING_GAME_TIMING.blackoutEnd);
  assert.equal(manifest.sourceEndSeconds, OPENING_GAME_TIMING.end);
  assert.equal(manifest.frames, Math.round((OPENING_GAME_TIMING.end - OPENING_GAME_TIMING.blackoutEnd) * manifest.fps) + 1);
  assert.equal(manifest.durationSeconds, manifest.frames / manifest.fps);
  const root = boxes(movie), moov = root.find(box => box.type === 'moov')!, mdat = root.find(box => box.type === 'mdat')!;
  assert.ok(root.some(box => box.type === 'ftyp')); assert.ok(moov && mdat);
  assert.ok(moov.start < mdat.start, 'Progressive playback requires metadata before the media bytes.');
  const children = boxes(movie, moov.start + 8, moov.end);
  const mvhd = children.find(box => box.type === 'mvhd')!;
  assert.equal(movie[mvhd.start + 8], 0);
  const timescale = movie.readUInt32BE(mvhd.start + 20), duration = movie.readUInt32BE(mvhd.start + 24);
  assert.ok(Math.abs(duration / timescale - manifest.durationSeconds) < .01);
  const tracks = children.filter(box => box.type === 'trak');
  assert.equal(tracks.length, 1, 'The current authored intro has only one silent video track.');
  const track = boxes(movie, tracks[0].start + 8, tracks[0].end);
  const header = track.find(box => box.type === 'tkhd')!;
  assert.equal(movie.readUInt32BE(header.end - 8) / 65536, manifest.width);
  assert.equal(movie.readUInt32BE(header.end - 4) / 65536, manifest.height);
  assert.ok(movie.subarray(moov.start, moov.end).includes(Buffer.from('avc1')), 'H.264 sample entry is missing.');
});
