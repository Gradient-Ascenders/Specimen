import { DIAGNOSTIC_OPTIONS, diagnosticOptions, launchDiagnosticBrowser } from '../lib/diagnostics.mjs';
/** #193 matched production-frame CPU attribution. Exposes the shipped session
 * for staging/measurement only. No diagnostic URL/content flags or fake renderer.
 * Use --cdp for the assessment browser; software rendering is correctness only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  ...DIAGNOSTIC_OPTIONS,
  label: { type: 'string', default: 'candidate' }, samples: { type: 'string', default: '60' },
  probe: { type: 'boolean', default: false },
} });
const diagnostic = diagnosticOptions(values, { output: `artifacts/scanner-beams/${values.label}` });
Object.assign(values, diagnostic);
assert.match(values.label, /^[\w-]+$/);
const samples = Number(values.samples); assert.ok(Number.isInteger(samples) && samples >= 12);
const output = diagnostic.output; await mkdir(output, { recursive: true });
const browser = await launchDiagnosticBrowser(diagnostic);
const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const report = { label: values.label, recordedAt: new Date().toISOString(), url: values.url,
  host: { cpu: cpus()[0].model, platform: platform(), kernel: release(), node: process.version }, assets: {}, errors: [],
  protocol: 'No-query production; minimum/normal defaults; 960x600 CSS; 1 and 6 fixed steps per draw; scripted real blocker movement and network toggles; fixed bodies at safe authored positions; staged CPU attribution, not FPS, GPU timing or native traversal.', cases: [] };
try {
  const page = await context.newPage(); page.setDefaultTimeout(240_000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('requestfailed', r => report.errors.push(`${r.failure()?.errorText}: ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`${r.status()}: ${r.url()}`); });
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    assert.match(source, pattern);
    report.assets[route.request().url()] = createHash('sha256').update(source).digest('hex');
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__scannerSession=new $2({initialRuntime:') });
  });
  await page.goto(values.url, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '');
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__scannerSession.runtime.input.enabled);
  await page.evaluate(() => globalThis.__scannerSession.runtime.resources.containmentLevel.completeForDebug());
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__scannerSession.runtime.resources?.roomFiveEncounter && globalThis.__scannerSession.runtime.input.enabled);
  await page.evaluate(() => {
    const rt = globalThis.__scannerSession.runtime;
    rt.stop(); rt.teleportToAuthoredPreviewRoom(5);
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
  });
  await page.waitForFunction(() => !globalThis.__scannerSession.runtime.preparationQueue.diagnostics.pending);
  report.environment = await page.evaluate(async () => {
    const rt = globalThis.__scannerSession.runtime, layer = rt.renderLayer, gl = layer.renderer.getContext();
    layer.setAnimationLoop(null);
    while (rt.preparationQueue.busy) await new Promise(resolve => setTimeout(resolve, 16));
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, gpu: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], graphics: layer.getGraphicsDiagnostics(),
      debug: rt.debugAvailable, colliders: rt.resources.collisionWorld.colliderCount,
      preparation: { ...rt.preparationQueue.diagnostics } };
  });
  console.log(values.label, report.environment.gpu);
  assert.equal(report.environment.debug, false);
  for (const steps of [1, 6]) {
    const result = await page.evaluate(async ({ samples, steps }) => {
      const rt = globalThis.__scannerSession.runtime, r = rt.resources;
      rt.teleportToAuthoredPreviewRoom(5); rt.start();
      const room = r.authoredPreview.roomFive, world = r.collisionWorld;
      const blocker = room.dynamicCollisionMeshes[0], startBlocker = blocker.position.clone();
      const bob = room.root.localToWorld(r.pair.bobBody.position.clone().set(-12, 10.66, 23));
      const goop = room.root.localToWorld(r.pair.goopBody.position.clone().set(44, -10.54, 122));
      const stats = { fixedDeltaSeconds: 1/60, rawFrameDeltaSeconds: steps/60, frameDeltaSeconds: steps/60,
        stepsThisFrame: steps, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60/steps };
      const updateMs = [], renderMs = [], frameMs = [], sweeps = [], fixedSweeps = [], clippingMs = [];
      let count = 0, clipMs = 0;
      const sweep = world.sweepSphere, clipper = r.roomFiveEncounter.scannerBeams?.occlusion ?? r.roomFiveEncounter.beamOcclusion;
      const clip = clipper.clipGeometry;
      world.sweepSphere = function(...args) { if (args[2] === .01) count++; return sweep.apply(this, args); };
      clipper.clipGeometry = function(...args) { const start = performance.now(); try { return clip.apply(this, args); } finally { clipMs += performance.now() - start; } };
      const prepBefore = { ...rt.preparationQueue.diagnostics };
      const gameplay = [];
      const frame = async (index, record) => {
        r.pair.bobBody.recoverAt(bob); r.pair.goopBody.recoverAt(goop);
        count = clipMs = 0;
        const begin = performance.now();
        for (let step = 0; step < steps; step++) {
          const tick = index * steps + step;
          blocker.position.x = startBlocker.x + Math.sin(tick / 60) * .5;
          if (tick === 30) room.controller.security.select('red');
          if (tick === 60) room.controller.security.toggle('red');
          rt.fixedUpdate(1/60);
        }
        const updated = performance.now(), inFixed = count;
        rt.render(1, stats);
        const end = performance.now();
        if (record) {
          updateMs.push(updated - begin); renderMs.push(end - updated); frameMs.push(end - begin);
          sweeps.push(count); fixedSweeps.push(inFixed); clippingMs.push(clipMs);
          gameplay.push(JSON.stringify({ patrols: r.roomFiveEncounter.patrols.map(p => p.elapsed),
            drones: r.roomFiveEncounter.drones.map(d => d.readModel), health: r.roomFiveEncounter.damage.health,
            projectiles: r.roomFiveEncounter.projectiles.states.filter(p => p.active), checkpoint: room.controller.checkpoint }));
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      };
      try {
        for (let i = 0; i < 12; i++) await frame(i, false);
        // Same reset boundary after driver/JIT warmup for each revision/case.
        rt.teleportToAuthoredPreviewRoom(5); rt.start();
        for (let i = 0; i < samples; i++) await frame(i, true);
        const summary = a => {
          const sorted = [...a].sort((x,y) => x-y);
          return { mean: a.reduce((x,y) => x+y, 0)/a.length, p50: sorted[Math.floor(a.length*.5)],
            p95: sorted[Math.floor(a.length*.95)], max: sorted.at(-1) };
        };
        const beams = [];
        room.root.traverse(o => { if (o.name.includes('-scanner-')) beams.push({ name: o.name, visible: o.visible }); });
        return { steps, samples, updateMs: summary(updateMs), renderMs: summary(renderMs), frameMs: summary(frameMs),
          clippingMs: summary(clippingMs), sweeps: summary(sweeps), fixedSweeps: summary(fixedSweeps), beams,
          state: rt.state, deathPlaying: r.deathSequence.isPlaying, prepBefore, prepAfter: { ...rt.preparationQueue.diagnostics },
          glError: rt.renderLayer.renderer.getContext().getError(), gameplay,
          raw: { updateMs, renderMs, frameMs, sweeps, fixedSweeps, clippingMs } };
      } finally {
        world.sweepSphere = sweep; clipper.clipGeometry = clip;
        blocker.position.copy(startBlocker); rt.stop();
      }
    }, { samples, steps });
    result.gameplayHash = createHash('sha256').update(result.gameplay.join('\n')).digest('hex');
    delete result.gameplay;
    report.cases.push(result);
    assert.equal(result.glError, 0);
    assert.equal(result.deathPlaying, true);
    if (values.label.startsWith('after')) {
      assert.equal(result.fixedSweeps.max, 0);
      assert.ok(result.sweeps.max <= 48);
    }
    await page.screenshot({ path: path.join(output, `room-five-${steps}-steps.png`) });
    console.log(values.label, steps, result.frameMs, result.sweeps);
  }
  // Separate cover view for visual review, after CPU sampling.
  report.visual = await page.evaluate(() => {
    const rt = globalThis.__scannerSession.runtime, r = rt.resources, layer = rt.renderLayer;
    rt.teleportToAuthoredPreviewRoom(5); rt.stop();
    const room = r.authoredPreview.roomFive, encounter = r.roomFiveEncounter;
    const target = room.root.localToWorld(r.pair.bobBody.position.clone().set(-12.5, 18.36, 54));
    r.pair.bobBody.recoverAt(target);
    encounter.update(1/60);
    r.bobPresentation.setPosition(target); r.bobPresentation.present(1);
    const camera = layer.cameraRig.camera;
    camera.position.copy(room.root.localToWorld(target.clone().set(-4.5, 22, 42)));
    camera.lookAt(target); camera.updateMatrixWorld(true);
    r.authoredPreview.updatePresentationVisibility(camera.position, target);
    for (let frame = 0; frame < 5; frame++) encounter.updatePresentation?.(.1, camera);
    rt.lightLayout.withLayout(layer.scene, camera, target, () => {
      layer.renderer.compile(rt.preparationLightState, camera, layer.scene);
      rt.cameraShadowCulling?.prepare(camera);
      try { layer.render(); } finally { rt.cameraShadowCulling?.restore(); }
    });
    const beams = [];
    room.root.traverse(o => { if (o.name.includes('-scanner-')) beams.push({ name: o.name, visible: o.visible, matrix: o.matrixWorld.toArray(), vertices: Array.from(o.geometry.attributes.position.array) }); });
    const flames = room.root.getObjectByName('room-5-platform-booster-flames');
    return { camera: { position: camera.position.toArray(), matrix: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray(), layers: camera.layers.mask }, flames: { visible: flames.visible, matrix: flames.matrixWorld.toArray(), count: flames.count }, eye: [-4.5, 22, 42], target: [-12.5, 18.36, 54], beams,
      glError: layer.renderer.getContext().getError() };
  });
  await page.screenshot({ path: path.join(output, 'scanner-cover.png') });
  assert.equal(report.visual.glError, 0);

  if (values.probe) {
    report.probe = await page.evaluate(() => {
      const rt = globalThis.__scannerSession.runtime, r = rt.resources, layer = rt.renderLayer;
      const encounter = r.roomFiveEncounter, room = r.authoredPreview.roomFive, camera = layer.cameraRig.camera;
      const clip = encounter.scannerBeams?.occlusion ?? encounter.beamOcclusion;
      room.root.traverse(o => {
        if (!o.name.includes('-scanner-')) return;
        o.updateWorldMatrix(true, false);
        const origin = o.position.clone().setFromMatrixPosition(o.matrixWorld);
        const drone = encounter.drones[encounter.beams.indexOf(o)];
        clip.clipGeometry(r.collisionWorld, origin, o.quaternion, o.geometry, drone.collider, o.matrixWorld);
        o.visible = true;
      });
      rt.lightLayout.withLayout(layer.scene, camera, r.pair.bobBody.position, () => {
        rt.cameraShadowCulling?.prepare(camera);
        try { layer.render(); } finally { rt.cameraShadowCulling?.restore(); }
      });
      return { glError: layer.renderer.getContext().getError() };
    });
    await page.screenshot({ path: path.join(output, 'scanner-cover-unculled-control.png') });
    assert.equal(report.probe.glError, 0);
  }

  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(path.join(output, 'frames.json'), JSON.stringify(report, null, 2) + '\n');
  await context.close(); await browser.close();
}
