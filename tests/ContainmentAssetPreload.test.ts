import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ContainmentAssetPreload } from '../src/levels/ContainmentAssetPreload.ts';
import { BOB_AUTHORED_ASSET_URL, GOOP_AUTHORED_ASSET_URL, GOOP_DETAIL_ASSET_URL } from '../src/render/slime/CharacterAssetUrls.ts';
import { disposeBobGateOneAsset } from '../src/render/bob/BobGateOneAsset.ts';
import { disposeGoopAsset, validateGoopAsset } from '../src/render/goop/GoopAsset.ts';

const urls = [BOB_AUTHORED_ASSET_URL, GOOP_AUTHORED_ASSET_URL, GOOP_DETAIL_ASSET_URL];

test('speculation downloads only the three bounded assets at low priority, with no decoding', async () => {
  const requests: { url: string; options?: RequestInit }[] = [];
  const preload = new ContainmentAssetPreload(async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response('not a valid model or LOD bank');
  });
  assert.equal(requests.length, 0, 'Creating the runtime must not preload behind the main menu.');
  const first = preload.preload();
  assert.equal(preload.preload(), first);
  await first;
  assert.deepEqual(requests.map(request => request.url), urls);
  assert.ok(requests.every(request => request.options?.priority === 'low'));
  // Invalid payloads are harmless during speculation: only the real phase
  // invokes parsers, builds mutable geometry, or validates a detail bank.
  await assert.rejects(preload.loaders.goop());
  await assert.rejects(preload.loaders.goopDetail());
  assert.equal(requests.length, 3, 'Demand consumes retained bytes without downloading again.');
  preload.clear(); preload.clear();
  assert.ok(requests.every(request => request.options?.signal?.aborted));
});

test('real prefetched bytes produce independent Bob/Goop scenes and detail arrays without duplicate transfers', async () => {
  const payloads = new Map([
    [BOB_AUTHORED_ASSET_URL, await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url))],
    [GOOP_AUTHORED_ASSET_URL, await readFile(new URL('../assets/characters/goop/goop.glb', import.meta.url))],
    [GOOP_DETAIL_ASSET_URL, await readFile(new URL('../src/assets/characters/goop-lod.bin', import.meta.url))],
  ]);
  let requests = 0;
  const preload = new ContainmentAssetPreload(async url => { requests++; return new Response(payloads.get(String(url))!); });
  await preload.preload();
  const [bobA, bobB, goopA, goopB, detailA, detailB] = await Promise.all([
    preload.loaders.bob(), preload.loaders.bob(), preload.loaders.goop(), preload.loaders.goop(),
    preload.loaders.goopDetail(), preload.loaders.goopDetail(),
  ]);
  try {
    assert.equal(requests, 3);
    assert.notEqual(bobA, bobB); assert.notEqual(goopA, goopB);
    const a = validateGoopAsset(goopA), b = validateGoopAsset(goopB);
    assert.notEqual(a.body.geometry, b.body.geometry); assert.notEqual(a.body.material, b.body.material);
    a.body.geometry.getAttribute('position').setX(0, 99);
    assert.notEqual(b.body.geometry.getAttribute('position').getX(0), 99);
    assert.equal(a.body.geometry.index!.count / 3, 26804, 'Stage loading never substitutes a lower-quality model.');
    assert.notEqual(bobA.getObjectByName('Bob-Body'), bobB.getObjectByName('Bob-Body'));
    assert.notEqual(detailA[0].indices, detailB[0].indices);
    assert.deepEqual(detailA[0].indices, detailB[0].indices);
    let otherDisposed = false;
    b.body.geometry.addEventListener('dispose', () => { otherDisposed = true; });
    disposeGoopAsset(goopA); assert.equal(otherDisposed, false);
  } finally { disposeBobGateOneAsset(bobA); disposeBobGateOneAsset(bobB); disposeGoopAsset(goopB); preload.clear(); }
});

test('failed speculation is retried at normal priority once for concurrent demand, not treated as level readiness', async () => {
  const goop = await readFile(new URL('../assets/characters/goop/goop.glb', import.meta.url));
  const attempts: { url: string; priority: RequestPriority | undefined }[] = [];
  const preload = new ContainmentAssetPreload(async (url, options) => {
    attempts.push({ url: String(url), priority: options?.priority });
    return String(url) === GOOP_AUTHORED_ASSET_URL && options?.priority !== 'low'
      ? new Response(goop) : new Response('unavailable', { status: 503 });
  });
  await preload.preload();
  const [a, b] = await Promise.all([preload.loaders.goop(), preload.loaders.goop()]);
  try {
    assert.equal(attempts.length, 4, 'Two slime instances share the one retried byte download.');
    assert.deepEqual(attempts.at(-1), { url: GOOP_AUTHORED_ASSET_URL, priority: undefined });
    assert.notEqual(a, b); validateGoopAsset(a); validateGoopAsset(b);
  } finally { disposeGoopAsset(a); disposeGoopAsset(b); preload.clear(); }
});

test('clearing an active bank aborts its network work without starting replacement downloads', async () => {
  let requests = 0;
  const preload = new ContainmentAssetPreload(async (_url, options) => {
    requests++;
    return new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
    });
  });
  const ready = preload.preload();
  const reading = assert.rejects(preload.loaders.bob(), { name: 'AbortError' });
  preload.clear(); await ready; await reading;
  assert.equal(requests, 3);
});

test('normal demand still works without speculation and after the bank is released', async () => {
  const goop = await readFile(new URL('../assets/characters/goop/goop.glb', import.meta.url));
  let requests = 0;
  const preload = new ContainmentAssetPreload(async (_url, options) => {
    requests++; assert.notEqual(options?.priority, 'low'); return new Response(goop);
  });
  preload.clear();
  const root = await preload.loaders.goop();
  try { assert.equal(requests, 1); validateGoopAsset(root); }
  finally { disposeGoopAsset(root); preload.clear(); }
});

test('an early Skip can start a high-priority bank without redownloading an existing speculative bank', async () => {
  const priorities: (RequestPriority | undefined)[] = [];
  const preload = new ContainmentAssetPreload(async (_url, options) => {
    priorities.push(options?.priority); return new Response('bytes only');
  });
  await preload.preload('high'); await preload.preload();
  assert.deepEqual(priorities, ['high', 'high', 'high']);
  preload.clear(); priorities.length = 0;
  await preload.preload(); await preload.preload('high');
  assert.deepEqual(priorities, ['low', 'low', 'low'], 'Do not abort or duplicate already-started transfers.');
  preload.clear();
});

function idleHarness() {
  let next = 0;
  const pending = new Map<number, IdleRequestCallback>();
  const host = {
    requestIdleCallback: (callback: IdleRequestCallback) => { pending.set(++next, callback); return next; },
    cancelIdleCallback: (handle: number) => { pending.delete(handle); },
  };
  return { host, pending, run(budget: number) {
    const [handle, callback] = pending.entries().next().value!;
    pending.delete(handle);
    callback({ didTimeout: false, timeRemaining: () => budget });
  } };
}

async function detailBytes(): Promise<ArrayBuffer> {
  const data = await readFile(new URL('../src/assets/characters/goop-lod.bin', import.meta.url));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

test('light preparation runs only tiny plain index data in browser idle time, never model decoding', async () => {
  const idle = idleHarness(), bytes = await detailBytes();
  let requests = 0;
  const preload = new ContainmentAssetPreload(async (url, options) => {
    requests++;
    assert.equal(options?.priority, 'low');
    // Retain the same buffer to demonstrate that later demand uses prepared
    // data, rather than parsing it again after the test corrupts the bytes.
    return { ok: true, arrayBuffer: async () => String(url) === GOOP_DETAIL_ASSET_URL
      ? bytes : new ArrayBuffer(0) } as Response;
  }, idle.host);
  const light = preload.prepareLight();
  assert.equal(preload.prepareLight(), light);
  await preload.preload();
  assert.equal(idle.pending.size, 1);
  idle.run(0);
  assert.equal(idle.pending.size, 1, 'No timeout/fallback may force work into a busy frame.');
  idle.run(4);
  await light;
  new Uint8Array(bytes).fill(0);
  const [a, b] = await Promise.all([preload.loaders.goopDetail(), preload.loaders.goopDetail()]);
  assert.ok(a[0].indices.length > 0);
  assert.notEqual(a[0].indices, b[0].indices);
  assert.deepEqual(a[0].indices, b[0].indices);
  a[0].indices.fill(65535);
  assert.notEqual(b[0].indices[0], 65535, 'Each character must retain independent index ownership.');
  assert.equal(requests, 3);
  await assert.rejects(preload.loaders.goop(), 'The deliberately invalid GLB was not decoded during the clip.');
  preload.clear();
});

test('Skip, demand and disposal cancel optional idle work without blocking level preparation', async () => {
  for (const action of ['skip', 'demand', 'clear'] as const) {
    const idle = idleHarness(), bytes = await detailBytes();
    const preload = new ContainmentAssetPreload(async () => new Response(bytes), idle.host);
    const light = preload.prepareLight();
    await preload.preload();
    assert.equal(idle.pending.size, 1);
    if (action === 'skip') await preload.preload('high');
    else if (action === 'demand') assert.ok((await preload.loaders.goopDetail()).length > 0);
    else preload.clear();
    await light;
    assert.equal(idle.pending.size, 0);
    preload.clear();
  }
});

test('light preparation skips unsupported idle callbacks, oversized data and failed optional downloads', async () => {
  for (const scenario of ['unsupported', 'oversized', 'failure', 'malformed'] as const) {
    const idle = idleHarness();
    const preload = new ContainmentAssetPreload(async () => scenario === 'failure'
      ? new Response('unavailable', { status: 503 })
      : new Response(scenario === 'oversized' ? new Uint8Array(65537) : 'invalid data'),
    scenario === 'unsupported' ? undefined : idle.host);
    const light = preload.prepareLight();
    await preload.preload();
    if (scenario === 'malformed') idle.run(10);
    await light;
    assert.equal(idle.pending.size, 0);
    await assert.rejects(preload.loaders.goopDetail());
    preload.clear();
  }
});

test('promoting or clearing light preparation before a late download completes cannot queue new idle work', async () => {
  for (const action of ['skip', 'clear'] as const) {
    const idle = idleHarness(), bytes = await detailBytes();
    let release!: (response: Response) => void;
    const preload = new ContainmentAssetPreload(async url => String(url) === GOOP_DETAIL_ASSET_URL
      ? new Promise<Response>(resolve => { release = resolve; }) : new Response('bytes'), idle.host);
    const light = preload.prepareLight();
    if (action === 'skip') void preload.preload('high');
    else preload.clear();
    release(new Response(bytes));
    await light;
    assert.equal(idle.pending.size, 0);
    preload.clear();
  }
});
