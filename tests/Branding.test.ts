import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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

test('game-flow and graphics preparation share the same loading treatment', async () => {
  const [gameFlowUi, graphicsPreparation] = await Promise.all([
    readFile(new URL('src/ui/GameFlowUI.ts', repositoryRoot), 'utf8'),
    readFile(new URL('src/ui/GraphicsPreparationOverlay.ts', repositoryRoot), 'utf8'),
  ]);

  for (const panel of ['loading', 'opening', 'restarting', 'transitioning']) {
    assert.match(
      gameFlowUi,
      new RegExp(
        `data-flow-panel="${panel}"[\\s\\S]*?\\$\\{createLiquidLoaderMarkup\\(\\)\\}`,
      ),
    );
  }
  assert.match(graphicsPreparation, /\$\{createLiquidLoaderMarkup\(\)\}/);
});

test('document metadata and README use deployment-safe brand paths', async () => {
  const [indexHtml, readme] = await Promise.all([
    readFile(new URL('index.html', repositoryRoot), 'utf8'),
    readFile(new URL('README.md', repositoryRoot), 'utf8'),
  ]);

  assert.match(indexHtml, /rel="icon" type="image\/png" href="\.\/brand\/specimen-app-icon\.png"/);
  assert.match(indexHtml, /href="\.\/brand\/specimen-app-icon\.png"/);
  assert.doesNotMatch(indexHtml, /data:image\/svg\+xml/);
  assert.match(readme, /src="public\/brand\/specimen-lockup-full\.png"/);
});
