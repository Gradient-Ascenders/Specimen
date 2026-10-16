/** Isolated deterministic visuals and software-renderer diagnostics, not a
 * substitute for minimum-spec gameplay/GPU qualification. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const rootIndex = process.argv.indexOf('--root');
const root = rootIndex < 0 ? resolve('.') : resolve(process.argv[rootIndex + 1]);
const outputIndex = process.argv.indexOf('--output');
const output = resolve(outputIndex < 0 ? 'artifacts/extra-optimisations' : process.argv[outputIndex + 1]);
const referenceIndex = process.argv.indexOf('--reference-root');
const referencePars = referenceIndex < 0 ? undefined :
  (await import(pathToFileURL(resolve(process.argv[referenceIndex + 1], 'src/render/environment/containment/acidSurfaceShader.ts')).href)).acidSurfaceFragmentPars;
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(resolve(root, 'artifacts/extra-perf-review-'));
await writeFile(resolve(fixture, 'index.html'), `<!doctype html><html><body style="margin:0"><script type="module">
import * as THREE from 'three';
import { AcidSurfaceMaterial } from '/src/render/environment/containment/AcidSurfaceMaterial.ts';
import { acidSurfaceFragmentPars } from '/src/render/environment/containment/acidSurfaceShader.ts';
import { GoopCharacterPresentation } from '/src/render/goop/GoopCharacterPresentation.ts';
import { VoltCharacterPresentation } from '/src/render/volt/VoltCharacterPresentation.ts';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(960, 540); renderer.toneMapping = THREE.NeutralToneMapping;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101819);
scene.add(new THREE.HemisphereLight(0xd4e2e5, 0x29331c, 2));
const key = new THREE.DirectionalLight(0xffedcc, 3); key.position.set(-3, 6, 4); scene.add(key);
const camera = new THREE.PerspectiveCamera(65, 16/9, 0.05, 200);
const acid = new AcidSurfaceMaterial();
const referencePars = ${JSON.stringify(referencePars) ?? 'undefined'};
const reference = referencePars ? new AcidSurfaceMaterial() : undefined;
if (reference) {
  const decorate = reference.onBeforeCompile;
  reference.onBeforeCompile = (shader, renderer) => { decorate(shader, renderer); shader.fragmentShader = shader.fragmentShader.replace(acidSurfaceFragmentPars, referencePars); };
  reference.customProgramCacheKey = () => 'extra-perf-analytic-reference';
  reference.update(3.7);
}
const plane = new THREE.Mesh(new THREE.PlaneGeometry(25, 25), acid); plane.rotation.x = -Math.PI / 2; scene.add(plane);
const goop = new GoopCharacterPresentation(), volt = new VoltCharacterPresentation();
await goop.prepare(); await volt.prepare(); scene.add(goop.root, volt.root);
const farCamera = new THREE.PerspectiveCamera(65, 16/9, .05, 200); farCamera.position.z = 80;
const nearCamera = new THREE.PerspectiveCamera(65, 16/9, .05, 200); nearCamera.position.z = 1;
let time = 0;
window.review = {
  acid(t, ripple) {
    goop.root.visible = volt.root.visible = false; plane.visible = true;
    acid.clearInteractions();
    if (ripple) acid.disturb(0, 0, 0, 1.4);
    acid.update(t - time); time = t;
    camera.position.set(0, 12, 13); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  },
  character(id, distance, distant, moving) {
    plane.visible = false; goop.root.visible = id === 'goop'; volt.root.visible = id === 'volt';
    const p = id === 'goop' ? goop : volt;
    p.reset();
    if (moving) { p.onLanding({x:0,y:1,z:0},9); p.update(1/60, {
      locomotionPositionWorld: {x:0,y:0,z:0}, velocityWorld: {x:0,y:0,z:0},
      maximumLocomotionSpeedMetresPerSecond: 5.5, movementIntentWorld: {x:0,y:0,z:-1}, grounded:true }); }
    camera.position.set(distance * .25, .4 + distance * .13, -distance); camera.lookAt(0, .35, 0);
    p.updateDetail?.(camera);
    const automaticDetail = p.detailDiagnostics;
    p.updateDetail?.(distant ? farCamera : nearCamera);
    renderer.render(scene, camera);
    return { detail: p.detailDiagnostics ?? {level:'full'}, automaticDetail, triangles: renderer.info.render.triangles,
      programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  },
  measure() {
    const gl = renderer.getContext();
    const samples = [], pixel = new Uint8Array(4);
    for (let batch = 0; batch < 5; batch++) {
      renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const start = performance.now();
      for(let i=0;i<5;i++) {
        renderer.render(scene, camera);
        // Readback forces command completion. gl.finish alone can measure only
        // browser submission rather than the software renderer's actual work.
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      samples.push((performance.now()-start)/5);
    }
    return samples;
  },
  compare() {
    if (!reference) return undefined;
    const gl = renderer.getContext(), pixel = new Uint8Array(4), results = { current: [], reference: [] };
    const frame = () => { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); };
    for (const material of [acid, reference]) { plane.material = material; for (let i=0;i<5;i++) frame(); }
    for (let round=0;round<8;round++) for (const name of round%2 ? ['reference','current'] : ['current','reference']) {
      plane.material = name === 'current' ? acid : reference;
      const start = performance.now(); for (let i=0;i<5;i++) frame(); results[name].push((performance.now()-start)/5);
    }
    plane.material = acid; return results;
  },
  dispose() {
    goop.dispose(); volt.dispose(); acid.dispose(); reference?.dispose(); plane.geometry.dispose();
    renderer.render(new THREE.Scene(), camera);
    return {...renderer.info.memory};
  },
};
</script></body></html>`);
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { include: ['three'] } });
let browser;
const errors = [], captures = [];
try {
  await server.listen();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-background-timer-throttling'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.setDefaultTimeout(120_000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${fixture.slice(root.length + 1)}/index.html`);
  await page.waitForFunction(() => window.review);
  for (const [time, ripple] of [[0, false], [1.2, false], [1.6, true], [3.7, false]]) {
    await page.evaluate(({time, ripple}) => window.review.acid(time, ripple), {time, ripple});
    const name = `acid-${time}`;
    await page.screenshot({ path: resolve(output, `${name}.png`) }); captures.push({name});
  }
  const acidFrameMs = await page.evaluate(() => window.review.measure());
  const acidComparison = await page.evaluate(() => window.review.compare());
  const characterFrameMs = {};
  for (const id of process.argv.includes('--acid-only') ? [] : ['goop', 'volt']) for (const distance of [4, 15, 30]) for (const distant of [false, true]) {
    const state = await page.evaluate(({id, distance, distant}) => window.review.character(id, distance, distant, true), {id, distance, distant});
    const name = `${id}-${distance}-${distant ? 'distant' : 'full'}`;
    await page.screenshot({ path: resolve(output, `${name}.png`) }); captures.push({name, ...state});
    if (distance === 30) characterFrameMs[name] = await page.evaluate(() => window.review.measure());
  }
  const cleanup = await page.evaluate(() => window.review.dispose());
  const device = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await writeFile(resolve(output, 'results.json'), JSON.stringify({device, acidFrameMs, acidComparison, characterFrameMs, captures, cleanup, errors,
    note: '960x540 isolated SwiftShader render plus synchronous pixel readback wall time; not hardware GPU timings or full-game FPS.'}, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured ${captures.length} views to ${output}; acid median ${[...acidFrameMs].sort((a,b)=>a-b)[2].toFixed(2)} ms/frame; cleanup ${JSON.stringify(cleanup)}.`);
} finally { await browser?.close(); await server.close(); }
