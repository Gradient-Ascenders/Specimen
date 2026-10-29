import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { readGzipResponse } from '../../../src/render/environment/ReadGzipResponse.ts';

const raw = new TextEncoder().encode('A complete compressed asset must finish its HTTP request.');
const compressed = gzipSync(raw);

test('gzip decoding starts only after the entire HTTP body finishes, without cancelling it', async t => {
  let sent = false, closed = false, cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (!sent) { sent = true; controller.enqueue(compressed); }
      else { closed = true; controller.close(); }
    },
    cancel() { cancelled = true; },
  }));
  const NativeDecompressionStream = globalThis.DecompressionStream;
  t.mock.method(globalThis, 'DecompressionStream', function(format: CompressionFormat) {
    assert.equal(closed, true, 'do not hand the live network body to native gzip decoding');
    return new NativeDecompressionStream(format);
  });
  assert.deepEqual(new Uint8Array(await readGzipResponse(response)), raw);
  assert.equal(response.bodyUsed, true);
  assert.equal(cancelled, false);
});

test('a transport failure after the gzip payload still rejects before decoding', async t => {
  let sent = false, decoders = 0;
  const NativeDecompressionStream = globalThis.DecompressionStream;
  t.mock.method(globalThis, 'DecompressionStream', function(format: CompressionFormat) {
    decoders++;
    return new NativeDecompressionStream(format);
  });
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (!sent) { sent = true; controller.enqueue(compressed); }
      else controller.error(new Error('incomplete HTTP body'));
    },
  }));
  await assert.rejects(readGzipResponse(response), /incomplete HTTP body/);
  assert.equal(decoders, 0);
});

test('invalid gzip data is not accepted as a prepared asset', async () => {
  await assert.rejects(readGzipResponse(new Response(raw)));
  await assert.rejects(readGzipResponse(new Response(compressed.subarray(0, -1))));
});

for (const phase of ['before download', 'after download', 'during decode'] as const) {
  test('gzip preparation preserves abort reason ' + phase, async t => {
    const controller = new AbortController();
    const reason = new Error('transition cancelled ' + phase);
    let decoders = 0;
    const NativeDecompressionStream = globalThis.DecompressionStream;
    t.mock.method(globalThis, 'DecompressionStream', function(format: CompressionFormat) {
      decoders++;
      if (phase === 'during decode') controller.abort(reason);
      return new NativeDecompressionStream(format);
    });
    if (phase === 'before download') controller.abort(reason);
    const response = new Response(compressed);
    const read = response.arrayBuffer.bind(response);
    t.mock.method(response, 'arrayBuffer', async () => {
      const bytes = await read();
      if (phase === 'after download') controller.abort(reason);
      return bytes;
    });
    await assert.rejects(readGzipResponse(response, controller.signal), error => error === reason);
    assert.equal(decoders, phase === 'during decode' ? 1 : 0);
    if (phase === 'before download') assert.equal(response.bodyUsed, false);
  });
}
