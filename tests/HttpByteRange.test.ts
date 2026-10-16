import assert from 'node:assert/strict';
import test from 'node:test';
import { parseByteRange } from '../scripts/lib/http-byte-range.mjs';

test('production video requests support explicit, open-ended and suffix byte ranges', () => {
  assert.equal(parseByteRange(undefined, 100), undefined);
  assert.deepEqual(parseByteRange('bytes=0-1', 100), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=90-200', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-200', 100), { start: 0, end: 99 });
  for (const header of ['bytes=100-', 'bytes=40-20', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6', 'items=0-1', 'bytes=99999999999999999999-']) {
    assert.equal(parseByteRange(header, 100), null, header);
  }
  assert.equal(parseByteRange('bytes=0-1', 0), null);
});
