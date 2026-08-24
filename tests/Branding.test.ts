import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';

import {
  BRAND_ASSETS,
  createBrandMarkMarkup,
  createBrandedScannerMarkup,
} from '../src/ui/Branding.ts';

const repositoryRoot = new URL('../', import.meta.url);

test('game-flow brand marks use checked-in deployment-safe assets', async () => {
  await Promise.all(
    Object.values(BRAND_ASSETS).map((asset) =>
      access(new URL(`public/${asset.slice(2)}`, repositoryRoot)),
    ),
  );

  assert.ok(Object.values(BRAND_ASSETS).every((asset) => asset.startsWith('./')));
});

test('game-flow brand marks remain decorative', () => {
  const detailed = createBrandMarkMarkup('detailed', 'title-brand-mark');
  const simple = createBrandMarkMarkup('simple', 'pause-brand-mark');

  assert.match(detailed, new RegExp(BRAND_ASSETS.detailedMark));
  assert.match(simple, new RegExp(BRAND_ASSETS.simpleMark));
  assert.match(detailed, /alt=""/);
  assert.match(detailed, /aria-hidden="true"/);
  assert.match(simple, /alt=""/);
  assert.match(simple, /aria-hidden="true"/);
});

test('the shared scanner animates orbital geometry around a still decorative mark', () => {
  const scanner = createBrandedScannerMarkup();

  assert.match(scanner, /brand-scanner-orbit--outer/);
  assert.match(scanner, /brand-scanner-orbit--inner/);
  assert.match(scanner, /brand-scanner-node/);
  assert.match(scanner, new RegExp(BRAND_ASSETS.simpleMark));
  assert.match(scanner, /aria-hidden="true"/);
});
