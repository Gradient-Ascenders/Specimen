import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';

import {
  BRAND_ASSETS,
  createBrandMarkMarkup,
  createLiquidLoaderMarkup,
} from '../src/ui/Branding.ts';

const repositoryRoot = new URL('../', import.meta.url);

test('canonical brand assets and external lockups are checked in', async () => {
  const canonicalFiles = [
    ...Object.values(BRAND_ASSETS).map((asset) => `public/${asset.slice(2)}`),
    'public/brand/specimen-lockup-full.png',
    'public/brand/specimen-app-icon.png',
  ];

  await Promise.all(canonicalFiles.map((path) => access(new URL(path, repositoryRoot))));

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

test('the liquid loader reuses the decorative mark without claiming numeric progress', () => {
  const loader = createLiquidLoaderMarkup();

  assert.match(loader, new RegExp(BRAND_ASSETS.simpleMark));
  assert.match(loader, /alt=""/);
  assert.match(loader, /aria-hidden="true"/);
  assert.doesNotMatch(loader, /aria-valuenow|<canvas|<video/);
});

