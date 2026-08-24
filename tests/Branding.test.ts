import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BRAND_ASSETS,
  createBrandMarkMarkup,
  createBrandedLoaderMarkup,
} from '../src/ui/Branding.ts';

const repositoryRoot = new URL('../', import.meta.url);

test('canonical brand assets and external lockups are checked in', async () => {
  const canonicalFiles = [
    'public/brand/specimen-favicon.svg',
    'public/brand/specimen-mark.svg',
    'public/brand/specimen-mark-simple.svg',
    'public/brand/specimen-lockup-full.png',
    'public/brand/specimen-lockup-compact.png',
    'public/brand/specimen-containment-emblem.png',
    'public/brand/specimen-app-icon.png',
  ];

  await Promise.all(
    canonicalFiles.map((path) => access(new URL(path, repositoryRoot))),
  );
});

test('shared brand markup stays decorative and loaders reuse the simple mark', () => {
  const detailedMark = createBrandMarkMarkup('detailed', 'test-mark');
  const loader = createBrandedLoaderMarkup();

  assert.match(detailedMark, new RegExp(BRAND_ASSETS.detailedMark));
  assert.match(detailedMark, /alt=""/);
  assert.match(detailedMark, /aria-hidden="true"/);
  assert.match(loader, new RegExp(BRAND_ASSETS.simpleMark));
  assert.match(loader, /brand-loader-ring/);
  assert.match(loader, /brand-loader-ticks/);
  assert.doesNotMatch(loader, new RegExp(BRAND_ASSETS.detailedMark));
});

test('document metadata and README use deployment-safe brand paths', async () => {
  const [indexHtml, readme, favicon] = await Promise.all([
    readFile(new URL('index.html', repositoryRoot), 'utf8'),
    readFile(new URL('README.md', repositoryRoot), 'utf8'),
    readFile(
      new URL('public/brand/specimen-favicon.svg', repositoryRoot),
      'utf8',
    ),
  ]);

  assert.match(indexHtml, /href="\.\/brand\/specimen-favicon\.svg"/);
  assert.match(indexHtml, /href="\.\/brand\/specimen-app-icon\.png"/);
  assert.doesNotMatch(indexHtml, /data:image\/svg\+xml/);
  assert.match(readme, /src="public\/brand\/specimen-lockup-full\.png"/);
  assert.match(favicon, /viewBox="346 329 550 550"/);
  assert.match(favicon, /<rect[^>]+rx="119"[^>]+fill="#120b21"/);
  assert.match(favicon, /fill="#b99cf6"/);
});
