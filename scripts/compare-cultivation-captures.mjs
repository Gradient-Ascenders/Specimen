import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const before = resolve(process.argv[2] ?? 'artifacts/perf-192/visual-baseline');
const after = resolve(process.argv[3] ?? 'artifacts/perf-192/visual-baked');
const output = resolve(process.argv[4] ?? 'artifacts/perf-192/visual-comparison');
const source = JSON.parse(await readFile(resolve(before, 'capture.json'), 'utf8'));
const baked = JSON.parse(await readFile(resolve(after, 'capture.json'), 'utf8'));
assert.deepEqual(baked.captures, source.captures);
assert.deepEqual(source.errors, []); assert.deepEqual(baked.errors, []);
const records = [], images = new Map();
for (const name of baked.captures) {
  const a = await readFile(resolve(before, name + '.png')), b = await readFile(resolve(after, name + '.png'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  records.push({ name, identical: a.equals(b), baseline: sha(a), baked: sha(b) });
  images.set(name, b.toString('base64'));
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'comparison.json'), JSON.stringify({ records, note: baked.note }, null, 2) + '\n');
const browser = await chromium.launch({ headless: true });
try {
  const groups = [
    ['rooms', baked.captures.filter(name => name.startsWith('initial-room-') && !name.includes('join'))],
    ['joins-and-passages', baked.captures.filter(name => name.startsWith('initial-') && /join|passage|duct/.test(name))],
    ['moving-parts', baked.captures.filter(name => name.startsWith('doors-open') || name.startsWith('lift-60') || name.startsWith('volt-rescued') || name === 'drops-0.45-room-2-platforms')],
  ];
  for (const [name, selected] of groups) {
    const page = await browser.newPage({ viewport: { width: 960, height: Math.ceil(selected.length / 2) * 294 } });
    await page.setContent('<html><body style="margin:0;background:#10151a;color:#eee;font:14px sans-serif;display:grid;grid-template-columns:480px 480px">' +
      selected.map(key => `<div><div style="height:24px;padding:0 8px;box-sizing:border-box">${key}</div><img style="display:block;width:480px;height:270px" src="data:image/png;base64,${images.get(key)}"></div>`).join('') + '</body></html>');
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
const different = records.filter(record => !record.identical);
console.log(`${records.length - different.length}/${records.length} matched PNGs are byte-identical.`);
assert.deepEqual(different.map(record => record.name), [], 'Visual differences require review.');
