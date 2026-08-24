import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BRAND_ASSETS,
  createBrandMarkMarkup,
  createBrandedScannerMarkup,
} from '../src/ui/Branding.ts';

const repositoryRoot = new URL('../', import.meta.url);

test('canonical brand assets and external lockups are checked in', async () => {
  const canonicalFiles = [
    ...Object.values(BRAND_ASSETS).map((asset) => `public/${asset.slice(2)}`),
    'public/brand/specimen-lockup-full.png',
    'public/brand/specimen-lockup-compact.png',
    'public/brand/specimen-containment-emblem.png',
    'public/brand/specimen-app-icon.png',
    'public/brand/specimen-favicon.svg',
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

test('the shared scanner animates orbital geometry around a still decorative mark', () => {
  const scanner = createBrandedScannerMarkup();

  assert.match(scanner, /brand-scanner-orbit--outer/);
  assert.match(scanner, /brand-scanner-orbit--inner/);
  assert.match(scanner, /brand-scanner-node/);
  assert.match(scanner, new RegExp(BRAND_ASSETS.simpleMark));
  assert.match(scanner, /aria-hidden="true"/);
});

test('every live game-flow loader uses the shared branded scanner', async () => {
  const gameFlowUi = await readFile(
    new URL('src/ui/GameFlowUI.ts', repositoryRoot),
    'utf8',
  );

  assert.doesNotMatch(gameFlowUi, /class="[^"]*\bloading-mark\b[^"]*"/);
  for (const panel of ['loading', 'restarting', 'transitioning']) {
    assert.match(
      gameFlowUi,
      new RegExp(
        `data-flow-panel="${panel}"[\\s\\S]*?\\$\\{createBrandedScannerMarkup\\(\\)\\}`,
      ),
    );
  }
});

test('document metadata and README use deployment-safe brand paths', async () => {
  const [indexHtml, readme, favicon] = await Promise.all([
    readFile(new URL('index.html', repositoryRoot), 'utf8'),
    readFile(new URL('README.md', repositoryRoot), 'utf8'),
    readFile(new URL('public/brand/specimen-favicon.svg', repositoryRoot), 'utf8'),
  ]);

  assert.match(indexHtml, /href="\.\/brand\/specimen-favicon\.svg"/);
  assert.match(indexHtml, /href="\.\/brand\/specimen-app-icon\.png"/);
  assert.doesNotMatch(indexHtml, /data:image\/svg\+xml/);
  assert.match(readme, /src="public\/brand\/specimen-lockup-full\.png"/);
  assert.match(favicon, /viewBox="346 329 550 550"/);
  assert.match(favicon, /<rect[^>]+rx="119"[^>]+fill="#120b21"/);
  assert.match(favicon, /fill="#b99cf6"/);
});
