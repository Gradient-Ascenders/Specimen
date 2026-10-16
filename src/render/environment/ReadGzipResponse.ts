/** Finish the HTTP body before native gzip decoding. Piping a live fetch body
 * into DecompressionStream intermittently reports net::ERR_ABORTED in Chromium
 * even when the decoded payload is complete. Keep transport and decode lifetimes
 * separate, without copying the compressed buffer into a second Blob. */
export async function readGzipResponse(response: Response, signal?: AbortSignal): Promise<ArrayBuffer> {
  signal?.throwIfAborted();
  const compressed = new Uint8Array(await response.arrayBuffer());
  signal?.throwIfAborted();
  const source = new ReadableStream<BufferSource>({
    start(controller) { controller.enqueue(compressed); controller.close(); },
  });
  const stream = source.pipeThrough(new DecompressionStream('gzip'), { signal });
  const buffer = await new Response(stream).arrayBuffer();
  signal?.throwIfAborted();
  return buffer;
}
