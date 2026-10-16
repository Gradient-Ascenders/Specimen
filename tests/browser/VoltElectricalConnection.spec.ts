import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from './fixtures.ts';

test.use({ launchOptions: {
  executablePath: process.env.SPECIMEN_PROFILE_BROWSER,
  // Keep the CI software renderer, while allowing explicit native-channel QA.
  args: process.env.SPECIMEN_BROWSER_CHANNEL ? [] :
    ['--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
} });

for (const profile of ['minimum','standard'] as const) {
test(`Volt connection VFX stay bounded through power, instability, disconnect and recovery (${profile})`, async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(180_000);
  const backend = process.env.SPECIMEN_BROWSER_CHANNEL ? 'native-channel' : 'swiftshader';
  const directory = `artifacts/evidence/issue-131/${backend}/${profile}`;
  await mkdir(directory, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Response-only exposure follows the existing Blackout presentation tests.
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/,
      'class ElectricalBlackout extends $1{constructor(...args){super(...args);globalThis.__electricalRuntime=this}}export{ElectricalBlackout as BlackoutLevelRuntime};');
    await route.fulfill({ response, body });
  });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await page.locator('[data-setting="graphics-profile"]').selectOption(profile);
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await page.keyboard.press('Minus');
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => (window as any).__electricalRuntime?.state === 'running', null, { timeout: 180_000 });
  await page.addStyleTag({ content: '.game-hud, .performance-recorder, .security-network-status, .volt-electrical-overlay { visibility: hidden !important; }' });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.evaluate(() => {
    const rt = (window as any).__electricalRuntime, r = rt.resources;
    rt.stop(); rt.renderLayer.setAnimationLoop(null);
    const layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
    const draw=layer.render,inspect=gl.getProgramInfoLog;
    rt.__electricalCold=[];rt.__electricalInspections=0;
    let live=false;
    gl.getProgramInfoLog=function(...args:any[]){if(live)rt.__electricalInspections++;return inspect.apply(this,args);};
    layer.render=function(...args:any[]){
      const before=renderer.info.programs.length;live=true;
      try{return draw.apply(this,args);}
      finally{live=false;if(renderer.info.programs.length!==before)rt.__electricalCold.push({before,after:renderer.info.programs.length});}
    };
    r.manager.activate('volt');
    r.group.voltBody.teleport({x: -9, y: 0.46, z: 48});
    rt.syncVisuals(r);
    const camera = rt.renderLayer.cameraRig.camera;
    camera.position.set(-3, 4.5, 48); camera.lookAt(-9, 2, 51); camera.updateMatrixWorld();
    // Real selection, range/LOS checks and socket origins still run in the
    // gameplay system; only the camera's test ray is controlled.
    rt.renderLayer.cameraRig.copyAimRay = (origin: any, direction: any) => {
      origin.copy(r.group.voltBody.position);
      r.maintenanceBay.target.copySocketWorldPosition(direction).sub(origin).normalize();
    };
  });
  const sample = async (state: 'idle' | 'connected' | 'unstable' | 'disconnected') => page.evaluate(state => {
    const rt = (window as any).__electricalRuntime, r = rt.resources;
    const model = r.electricalSystem.readModel;
    if (state === 'connected') {
      r.maintenanceBay.receiver.position.x = -9;
      r.maintenanceBay.receiver.updateWorldMatrix(true, true);
      const camera = rt.renderLayer.cameraRig.camera;
      camera.position.set(-3, 4.5, 48); camera.lookAt(-9, 2, 51); camera.updateMatrixWorld();
      r.electricalSystem.update(1 / 60, {aimHeld: true, fireHeld: false, firePressed: false, gameplayInputEnabled: true, pointerLocked: true});
      r.electricalSystem.update(1 / 60, {aimHeld: true, fireHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true});
      r.electricalSystem.cancelAim();
    } else if (state === 'unstable') {
      // Authored moving targets can stretch a retained tether. Move this real
      // socket to 12–13 m, inside Room 1's warning/break interval.
      r.maintenanceBay.receiver.position.x = 1.5;
      r.maintenanceBay.receiver.updateWorldMatrix(true, true);
      r.electricalSystem.revalidateConnection();
      const camera = rt.renderLayer.cameraRig.camera;
      camera.position.set(-3, 6, 42); camera.lookAt(-4, 2, 51); camera.updateMatrixWorld();
    } else if (state === 'disconnected') {
      r.electricalSystem.disconnect('intentional');
    }
    const effects = r.electricalPresentation.root.getObjectByName('volt-electrical-effects');
    for (let frame = 0; frame < 20; frame++) r.electricalPresentation.update(model, 1 / 60, false);
    rt.renderLayer.render();
    const renderer = rt.renderLayer.renderer, gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const contacts = effects.getObjectByName('volt-electrical-contact-coronas');
    const impacts = effects.getObjectByName('volt-electrical-impact-sparks');
    const beam = effects.getObjectByName('volt-electrical-arc-core');
    const lights: any[] = [];
    rt.renderLayer.scene.traverse((object: any) => { if (object.isLight) lights.push([object.uuid, object.visible, object.intensity]); });
    return {
      state, beamMode: model.beamMode, unstable: model.connectionUnstable, connected: model.connectedTargetId,
      visible: effects.visible, impactVisible: impacts.visible,
      particles: Math.min(impacts.geometry.drawRange.count, impacts.geometry.attributes.position.count),
      particlePool: impacts.geometry.attributes.position.count,
      contact: Array.from(contacts.geometry.attributes.position.array).slice(3), end: {...model.beamEnd},
      tint: beam.material.uniforms.tint.value.getHex(), forceSinglePass: beam.material.forceSinglePass,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      programs: renderer.info.programs.length, calls: renderer.info.render.calls, lights,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), glError: gl.getError(),
    };
  }, state);
  const idle = await sample('idle');
  const connected = await sample('connected');
  expect(connected.beamMode).toBe('connected');
  expect(connected.connected).toBe('maintenance-bay-circuit');
  expect(connected.visible).toBe(true);
  expect(connected.forceSinglePass).toBe(true);
  expect(connected.particles).toBe(profile === 'minimum' ? 12 : 24);
  expect(connected.particlePool).toBe(24);
  expect(connected.contact).toEqual([connected.end.x, connected.end.y, connected.end.z].map(Math.fround));
  expect(connected.calls - idle.calls).toBe(5);
  await page.screenshot({ path: `${directory}/connected-performance.png` });
  const unstable = await sample('unstable');
  expect(unstable.unstable).toBe(true);
  expect(unstable.tint).toBe(0xff9e25);
  await page.screenshot({ path: `${directory}/unstable-performance.png` });
  const disconnected = await sample('disconnected');
  expect(disconnected.visible).toBe(false);
  expect(disconnected.impactVisible).toBe(false);
  expect(disconnected.connected).toBeUndefined();
  const samples = [idle, connected, unstable, disconnected];
  for (let cycle = 0; cycle < 3; cycle++) {
    samples.push(await sample('connected'), await sample('unstable'), await sample('disconnected'));
  }
  for (const value of samples.slice(1)) {
    expect([value.geometries, value.textures, value.programs]).toEqual([connected.geometries, connected.textures, connected.programs]);
    expect(value.lights).toEqual(idle.lights);
    expect(value.glError).toBe(0);
  }
  await page.evaluate(() => {
    const rt = (window as any).__electricalRuntime;
    rt.recoverActiveCheckpoint();
    rt.resources.electricalPresentation.update(rt.resources.electricalSystem.readModel);
    rt.renderLayer.render();
  });
  const recovered = await sample('idle');
  expect(recovered.visible).toBe(false);
  expect(recovered.impactVisible).toBe(false);
  expect(recovered.connected).toBeUndefined();
  const firstUse=await page.evaluate(()=>{
    const rt=(window as any).__electricalRuntime;return {cold:rt.__electricalCold,inspections:rt.__electricalInspections};
  });
  expect(firstUse).toEqual({cold:[],inspections:0});
  await writeFile(`${directory}/samples.json`, JSON.stringify({ samples, recovered, firstUse, errors }, null, 2));
  expect(errors).toEqual([]);
});
}
