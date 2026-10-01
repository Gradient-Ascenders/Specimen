/** Capture the current Bob Gate 3 review from the built Level 1 runtime. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'docs/evidence/issue-157');
const url = 'http://127.0.0.1:4176/?debug=1';
const poses = [
  'move-forward', 'move-reverse', 'squash', 'flatten',
  'launch', 'airborne', 'stress',
];
const expressions = ['blink', 'effort', 'surprise', 'stress-expression'];
const server = spawn(
  'npm',
  ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4176', '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);

let browser;
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* Preview is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 99) throw new Error('Preview server did not start');
  }

  browser = await chromium.launch({
    args: [
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  let exposedBundles = 0;
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    const match = body.match(pattern);
    if (!match?.[1]) throw new Error('Could not expose the production runtime');
    exposedBundles += 1;
    await route.fulfill({
      response,
      body: body.replace(
        pattern,
        `(globalThis.__bobGateThreeRuntime=${match[1]},${match[1]}.prepareLightingPrograms()).then(`,
      ),
    });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(
    () => Boolean(window.__bobGateThreeRuntime?.resources?.testScene?.bob?.ready),
    null,
    { timeout: 120_000 },
  );
  await mkdir(evidence, { recursive: true });

  const sample = () => page.evaluate(({ poseNames, expressionNames }) => {
    const runtime = window.__bobGateThreeRuntime;
    const resources = runtime.resources;
    const body = resources.body;
    const bob = resources.testScene.bob;
    const character = bob.root.getObjectByName('player-slime-bob-character');
    const bodyMesh = bob.root.getObjectByName('Bob-Body');
    const eyes = [
      bob.root.getObjectByName('Bob-Eye-Left'),
      bob.root.getObjectByName('Bob-Eye-Right'),
    ];
    const readWeight = (mesh, name) =>
      mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]];
    const bodyPoses = Object.fromEntries(
      poseNames.map((name) => [name, readWeight(bodyMesh, name)]),
    );
    const eyePoses = eyes.map((eye) => Object.fromEntries(
      poseNames.map((name) => [name, readWeight(eye, name)]),
    ));
    const eyeExpressions = eyes.map((eye) => Object.fromEntries(
      expressionNames.map((name) => [name, readWeight(eye, name)]),
    ));
    const maximumSeatWeightDelta = Math.max(
      ...eyePoses.flatMap((eye) => poseNames.map((name) =>
        Math.abs(eye[name] - bodyPoses[name]))),
    );
    const primaryWeightTotal = Object.values(bodyPoses)
      .reduce((sum, weight) => sum + weight, 0);
    return {
      recordingElapsedMilliseconds: window.__bobGateThreeRecording
        ? performance.now() - window.__bobGateThreeRecording.startedAt
        : 0,
      bodyPosition: body.position.toArray(),
      visualPosition: character.position.toArray(),
      velocity: body.velocity.toArray(),
      gameplayUp: body.gameplayUp.toArray(),
      grounded: body.grounded,
      attached: body.attached,
      chargingJump: body.chargingJump,
      chargeFraction: body.chargeFraction,
      supportNormal: body.groundNormal.toArray(),
      colliderRadiusMetres: body.radiusMetres,
      supportColliderName: body.supportColliderName,
      lastContactName: body.lastContactName,
      bodyPoses,
      eyePoses,
      eyeExpressions,
      maximumSeatWeightDelta,
      primaryWeightTotal,
      diagnostics: {
        ...bob.diagnostics,
        impactNormalLocal: bob.diagnostics.impactNormalLocal.toArray(),
        surfaceNormalLocal: bob.diagnostics.surfaceNormalLocal.toArray(),
        surfaceTangentLocal: bob.diagnostics.surfaceTangentLocal.toArray(),
        moveDirectionLocal: bob.diagnostics.moveDirectionLocal.toArray(),
        deathBurst: {
          ...bob.diagnostics.deathBurst,
          origin: bob.diagnostics.deathBurst.origin.toArray(),
        },
      },
      lifecycleState: runtime.state,
      restartCount: runtime.restartCount,
      gameState: document.querySelector('[data-game-root]')?.dataset.gameState,
    };
  }, { poseNames: poses, expressionNames: expressions });

  const observations = {};
  const capture = async (name) => {
    observations[name] = await sample();
    console.log(`sampled ${name}`);
  };
  const visitRoom = async (room) => {
    await page.evaluate((roomId) => {
      const runtime = window.__bobGateThreeRuntime;
      const resources = runtime.resources;
      resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
      resources.containmentLevel.teleportToRoomForDebug(roomId);
      resources.testScene.bob.reset();
      resources.testScene.bob.setPosition(resources.body.position);
      runtime.syncContextualCamera(resources);
    }, room);
    await page.waitForFunction(() => window.__bobGateThreeRuntime.resources.body.grounded);
  };
  const waitForPose = (name, minimum) => page.waitForFunction(
    ({ poseName, threshold }) => {
      const bob = window.__bobGateThreeRuntime.resources.testScene.bob;
      const mesh = bob.root.getObjectByName('Bob-Body');
      return mesh.morphTargetInfluences[mesh.morphTargetDictionary[poseName]] >= threshold;
    },
    { poseName: name, threshold: minimum },
    { timeout: 30_000 },
  );
  const startRecording = () => page.evaluate(() => {
    const stream = document.querySelector('canvas').captureStream(15);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    window.__bobGateThreeRecording = {
      stream,
      recorder,
      chunks,
      startedAt: performance.now(),
    };
    recorder.start(100);
  });
  const stopRecording = () => page.evaluate(async () => {
    const { stream, recorder, chunks } = window.__bobGateThreeRecording;
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const bytes = new Uint8Array(
      await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer(),
    );
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
  });

  await visitRoom(2);
  await startRecording();
  await capture('01-idle');

  await page.keyboard.down('a');
  await waitForPose('move-forward', 0.65);
  await capture('02-cruise');
  await page.keyboard.up('a');
  await page.waitForFunction(
    () => window.__bobGateThreeRuntime.resources.testScene.bob.diagnostics.speed === 0,
  );
  await capture('03-stop');

  await page.keyboard.down('d');
  await page.waitForFunction(
    () => window.__bobGateThreeRuntime.resources.testScene.bob.diagnostics.reversing,
  );
  await waitForPose('move-reverse', 0.25);
  await capture('04-reversal');
  await page.waitForFunction(
    () => !window.__bobGateThreeRuntime.resources.testScene.bob.diagnostics.reversing,
  );
  await page.keyboard.up('d');

  await page.keyboard.down('Space');
  await page.waitForFunction(
    () => window.__bobGateThreeRuntime.resources.body.chargeFraction >= 0.98,
  );
  await capture('05-full-charge');
  await page.keyboard.up('Space');
  await page.waitForFunction(
    () => !window.__bobGateThreeRuntime.resources.body.grounded,
  );
  await capture('06-launch');
  await waitForPose('airborne', 0.55);
  await capture('07-airborne');
  await page.waitForFunction(() => {
    const resources = window.__bobGateThreeRuntime.resources;
    const mesh = resources.testScene.bob.root.getObjectByName('Bob-Body');
    return resources.body.grounded &&
      mesh.morphTargetInfluences[mesh.morphTargetDictionary.flatten] >= 0.15;
  }, null, { timeout: 10_000 });
  await capture('08-landing');

  await page.waitForFunction(
    () => window.__bobGateThreeRuntime.resources.testScene.bob.diagnostics.locomotionStrength < 0.01,
  );
  for (const expression of expressions) {
    await page.evaluate((name) => {
      const bob = window.__bobGateThreeRuntime.resources.testScene.bob;
      for (const candidate of ['blink', 'effort', 'surprise', 'stress-expression']) {
        bob.setExpression(candidate, candidate === name ? 1 : 0);
      }
    }, expression);
    await page.waitForTimeout(300);
    await capture(`09-expression-${expression}`);
  }
  await page.evaluate(() => {
    const bob = window.__bobGateThreeRuntime.resources.testScene.bob;
    for (const name of ['blink', 'effort', 'surprise', 'stress-expression']) {
      bob.setExpression(name, 0);
    }
  });

  await visitRoom(1);
  await page.evaluate(() => {
    const runtime = window.__bobGateThreeRuntime;
    const resources = runtime.resources;
    resources.body.recoverAt(resources.body.position.clone().set(-4.8, 0.46, 5.1));
    resources.testScene.bob.reset();
    resources.testScene.bob.setPosition(resources.body.position);
    runtime.syncContextualCamera(resources);
  });
  let wallKey;
  for (const key of ['w', 's', 'a', 'd']) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(() => {
        const body = window.__bobGateThreeRuntime.resources.body;
        return body.attached && Math.abs(body.groundNormal.y) < 0.5 && body.position.y > 1;
      }, null, { timeout: 3_000 });
      wallKey = key;
      break;
    } catch {
      await page.keyboard.up(key);
      await page.evaluate(() => {
        const runtime = window.__bobGateThreeRuntime;
        const resources = runtime.resources;
        resources.body.recoverAt(resources.body.position.clone().set(-4.8, 0.46, 5.1));
        resources.testScene.bob.reset();
        resources.testScene.bob.setPosition(resources.body.position);
        runtime.syncContextualCamera(resources);
      });
    }
  }
  if (!wallKey) throw new Error('Could not reach the sticky wall through controls');
  await capture('10-wall-travel');
  await page.keyboard.up(wallKey);
  const oppositeKey = { w: 's', s: 'w', a: 'd', d: 'a' }[wallKey];
  await page.keyboard.down(oppositeKey);
  await page.waitForFunction(
    () => window.__bobGateThreeRuntime.resources.testScene.bob.diagnostics.reversing,
  );
  await capture('11-wall-reversal');
  await page.keyboard.up(oppositeKey);

  await page.evaluate(() => {
    const runtime = window.__bobGateThreeRuntime;
    const resources = runtime.resources;
    resources.body.recoverAt(resources.body.position.clone().set(-4.8, 0.46, 5.1));
    resources.testScene.bob.reset();
    resources.testScene.bob.setPosition(resources.body.position);
    runtime.syncContextualCamera(resources);
  });
  await page.keyboard.down(wallKey);
  await page.waitForFunction(() => {
    const body = window.__bobGateThreeRuntime.resources.body;
    return body.attached && Math.abs(body.groundNormal.y) < 0.5 && body.position.y > 1;
  }, null, { timeout: 5_000 });
  await page.keyboard.up(wallKey);

  await page.keyboard.down('Space');
  await page.waitForFunction(
    () => {
      const body = window.__bobGateThreeRuntime.resources.body;
      return body.attached && body.chargeFraction >= 0.98;
    },
  );
  await capture('12-wall-charge');
  await page.keyboard.up('Space');
  await page.waitForFunction(
    () => !window.__bobGateThreeRuntime.resources.body.attached,
  );
  await capture('13-wall-detach');

  await visitRoom(2);
  await page.evaluate(() => {
    const runtime = window.__bobGateThreeRuntime;
    const resources = runtime.resources;
    runtime.stop();
    resources.testScene.bob.onDamage(0.8);
    resources.testScene.bob.update(1 / 60, resources.slimeVisualState);
    resources.testScene.bob.present();
  });
  await capture('14-damage');
  await page.evaluate(() => window.__bobGateThreeRuntime.start());

  const deathAccepted = await page.evaluate(() => {
    const runtime = window.__bobGateThreeRuntime;
    const resources = runtime.resources;
    const accepted = resources.containmentLevel.requestHazardFailure({
      roomId: 'room-3',
      hazardId: 'issue-157-gate-three-review',
    });
    runtime.stop();
    return accepted;
  });
  if (!deathAccepted) throw new Error('Level 1 rejected the death review trigger');
  await capture('15-death-stress');
  await page.evaluate(() => window.__bobGateThreeRuntime.start());
  await page.locator('.death-retry').waitFor({ state: 'visible', timeout: 10_000 });
  await capture('16-game-over');
  await page.locator('.death-retry').click();
  await page.waitForFunction(
    () => window.__bobGateThreeRuntime.resources.testScene.bob.diagnostics.visible,
  );
  await capture('17-retry');

  const restartBefore = (await sample()).restartCount;
  await page.keyboard.press('r');
  await page.waitForFunction(
    (before) => window.__bobGateThreeRuntime.restartCount === before + 1,
    restartBefore,
  );
  await capture('18-restart');

  const clip = Buffer.from(await stopRecording(), 'base64');
  await writeFile(path.join(evidence, 'gate-three-gameplay.webm'), clip);

  const reviewFrameNames = [
    '01-idle', '04-reversal', '05-full-charge', '07-airborne',
    '08-landing', '09-expression-blink', '09-expression-effort',
    '09-expression-surprise', '09-expression-stress-expression',
    '10-wall-travel', '11-wall-reversal', '12-wall-charge',
    '13-wall-detach', '14-damage', '15-death-stress',
  ];
  const reviewFrames = await page.evaluate(async ({ base64, frames }) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
    video.src = objectUrl;
    video.muted = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Could not decode Gate 3 recording'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    const images = [];
    for (const frame of frames) {
      const seeked = new Promise((resolve) => { video.onseeked = resolve; });
      video.currentTime = Math.min(
        Math.max(0, frame.elapsedMilliseconds / 1000),
        Math.max(0, video.duration - 0.01),
      );
      await seeked;
      context.drawImage(video, 0, 0);
      images.push({ name: frame.name, dataUrl: canvas.toDataURL('image/png') });
    }
    URL.revokeObjectURL(objectUrl);
    return images;
  }, {
    base64: clip.toString('base64'),
    frames: reviewFrameNames.map((name) => ({
      name,
      elapsedMilliseconds: observations[name].recordingElapsedMilliseconds,
    })),
  });
  for (const frame of reviewFrames) {
    await writeFile(
      path.join(evidence, `${frame.name}.png`),
      Buffer.from(frame.dataUrl.slice(frame.dataUrl.indexOf(',') + 1), 'base64'),
    );
  }

  const beforeUnload = await sample();
  const unload = await page.evaluate(() => {
    const runtime = window.__bobGateThreeRuntime;
    const bob = runtime.resources.testScene.bob;
    runtime.unload();
    return {
      bobReady: bob.ready,
      bobRootChildren: bob.root.children.length,
      bobRootAttached: bob.root.parent !== null,
      runtimeState: runtime.state,
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });

  const maximumSeatWeightDelta = Math.max(
    ...Object.values(observations).map((entry) => entry.maximumSeatWeightDelta),
  );
  const maximumPrimaryWeightTotal = Math.max(
    ...Object.values(observations).map((entry) => entry.primaryWeightTotal),
  );
  const resetStates = ['17-retry', '18-restart'].map((name) => ({
    name,
    bodyPoses: observations[name].bodyPoses,
    eyeExpressions: observations[name].eyeExpressions,
    deathBurst: observations[name].diagnostics.deathBurst,
  }));
  const knownConsoleDiagnostics = consoleErrors.filter((message) =>
    message.startsWith('Cold shader program regression after Level 1 warm-up.'));
  const unexplainedConsoleErrors = consoleErrors.filter((message) =>
    !message.startsWith('Cold shader program regression after Level 1 warm-up.'));
  const report = {
    capturedAt: new Date().toISOString(),
    runtimeAsset: 'bob-authored.glb',
    productionBuild: true,
    developmentHelpersEnabled: true,
    temporaryMotionDriver: false,
    exposedBundles,
    wallTravelKey: wallKey,
    observations,
    authority: {
      colliderRadiusMetres: observations['01-idle'].colliderRadiusMetres,
      maximumSeatWeightDelta,
      maximumPrimaryWeightTotal,
      resetStates,
      beforeUnload,
      unload,
    },
    consoleErrors,
    knownConsoleDiagnostics,
    unexplainedConsoleErrors,
    failedRequests,
  };
  await writeFile(
    path.join(evidence, 'observations.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  if (exposedBundles !== 1 || unexplainedConsoleErrors.length || failedRequests.length) {
    throw new Error('Gate 3 capture had browser errors or failed requests');
  }
  if (maximumSeatWeightDelta > 1e-9) {
    throw new Error(`Eye-seat weights diverged by ${maximumSeatWeightDelta}`);
  }
  if (maximumPrimaryWeightTotal > 1.05) {
    throw new Error(`Primary silhouette weights accumulated to ${maximumPrimaryWeightTotal}`);
  }
  for (const reset of resetStates) {
    if (
      Object.values(reset.bodyPoses).some((weight) => weight !== 0) ||
      reset.eyeExpressions.some((eye) =>
        Object.values(eye).some((weight) => weight !== 0)) ||
      reset.deathBurst.active
    ) {
      throw new Error(`${reset.name} retained stale presentation state`);
    }
  }
  if (
    unload.bobReady || unload.bobRootChildren !== 0 ||
    unload.bobRootAttached || unload.runtimeState !== 'unloaded'
  ) {
    throw new Error('Unload retained Bob presentation state');
  }

  console.log(JSON.stringify({
    clipBytes: clip.length,
    captures: Object.keys(observations),
    maximumSeatWeightDelta,
    maximumPrimaryWeightTotal,
    unload,
    consoleErrors,
    unexplainedConsoleErrors,
    failedRequests,
  }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
