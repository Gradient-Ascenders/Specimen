/** Deterministic material/join/animation views. This is not a gameplay benchmark. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const baselineIndex = process.argv.indexOf('--baseline-root');
const baseline = baselineIndex >= 0;
const root = baseline ? resolve(process.argv[baselineIndex + 1]) : resolve('.');
const outputIndex = process.argv.indexOf('--output');
const output = resolve(outputIndex < 0 ? `artifacts/perf-192/visual-${baseline ? 'baseline' : 'baked'}` : process.argv[outputIndex + 1]);
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(resolve(root, 'artifacts/bake-review-'));
await writeFile(resolve(fixture, 'index.html'), `<!doctype html><html><body style="margin:0;background:#07110f"><script type="module">
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '/src/levels/LevelTwoPreviewScene.ts';
import { CultivationLevelScene } from '/src/levels/CultivationLevelScene.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from '/src/levels/CultivationFoundationManifest.ts';
import { visitLevelTwoSurfaceStates } from '/scripts/lib/level-two-surface-states.ts';
${baseline ? '' : "import { loadCultivationBakedAssets } from '/src/render/environment/cultivation/CultivationBakedAssets.ts';"}
const assets = ${baseline ? 'undefined' : "await loadCultivationBakedAssets(new URL('/src/assets/cultivation/authored-assets.bin', location.origin))"};
const preview = new LevelTwoPreviewScene(() => {}, assets);
const foundation = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
foundation.setDarkRoomLighting(false, 1, true);
for (const child of foundation.root.children) child.visible = child.name === 'cultivation-foundation-lighting';
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07110f); scene.add(preview.root, foundation.root);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(960, 540); renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(65, 960/540, .05, 200);
const views = [
  ['room-1-surfaces', 'roomOne', [-12,6,8], [0,8,25]],
  ['room-1-join', 'roomOne', [0,3,45], [0,3,57]],
  ['passage-1-2', 'roomOneToTwoPassage', [2,3,3], [-1,2,20]],
  ['room-2-membrane', 'roomTwo', [-12,7,5], [-17,9,25]],
  ['room-2-platforms', 'roomTwo', [11,11,8], [-4,14,30]],
  ['passage-2-3', 'roomTwoToThreeGoopPassage', [2,3,2], [-1,3,22]],
  ['air-duct', 'roomTwoToThreeBobAirDuct', [0,1,2], [0,1,22]],
  ['room-3-equipment', 'roomThree', [0,7,16], [6,3,27]],
  ['room-3-upper-route', 'roomThree', [-10,24,13], [5,24,40]],
  ['room-4-lift', 'roomFour', [0,3,3], [0,3,14]],
  ['room-5-surfaces', 'roomFive', [-8,18,25], [0,22,49]],
  ['room-5-pod', 'roomFive', [0,30,39], [0,25,49]],
  ['room-5-sewer', 'roomFive', [44,-8,50], [40,-9,75]],
  ['room-5-controls', 'roomFive', [44,-9,117], [40,-10,124]],
];
globalThis.capture = () => {
  const results = [];
  visitLevelTwoSurfaceStates(preview, state => {
    let selected = views;
    if (state.startsWith('drops-')) selected = views.filter(view => ['roomOne','roomTwo','roomThree'].includes(view[1]));
    else if (state === 'doors-open') selected = views.filter(view => view[1].includes('Passage'));
    else if (state.startsWith('lift-')) selected = views.filter(view => view[1] === 'roomFour');
    else if (state === 'volt-rescued') selected = views.filter(view => view[1] === 'roomFive');
    else if (state !== 'initial' && state !== 'reset') return;
    for (const [name, owner, at, target] of selected) {
      const visibility = preview.root.children.map(child => child.visible);
      for (const child of preview.root.children) child.visible = child === preview[owner].root ||
        (name === 'room-1-join' && child === preview.roomOneToTwoPassage.root);
      camera.position.copy(preview[owner].root.localToWorld(new THREE.Vector3(...at)));
      camera.lookAt(preview[owner].root.localToWorld(new THREE.Vector3(...target)));
      renderer.render(scene, camera);
      results.push({ name: state + '-' + name, png: renderer.domElement.toDataURL('image/png') });
      preview.root.children.forEach((child, index) => child.visible = visibility[index]);
    }
    console.log('bake-review:' + state);
  });
  return results;
};
globalThis.ready = true;
</script></body></html>`);
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.text().startsWith('bake-review:')) console.log(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/${fixture.slice(root.length + 1)}/index.html`);
  await page.waitForFunction(() => globalThis.ready, null, { timeout: 180_000 });
  const captures = await page.evaluate(() => globalThis.capture());
  for (const { name, png } of captures) await writeFile(resolve(output, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  await writeFile(resolve(output, 'capture.json'), JSON.stringify({ mode: baseline ? 'baseline' : 'baked', captures: captures.map(({name}) => name), errors,
    note: 'Isolated 960x540 SwiftShader views with authored materials and foundation lighting; shadows disabled. Includes every room, passages, UVs, doors, drops, lift travel, rescue and reset. Not target-hardware or full-game performance evidence.' }, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured ${captures.length} views to ${output}`);
} finally { await browser?.close(); await server.close(); }
