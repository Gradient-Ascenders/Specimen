import { finishOpening } from '../helpers/OpeningHandoff.ts';
import { expect, test } from '@playwright/test';
import { SOUND_BANKS } from '../../src/audio/SoundCatalog.ts';

test('selected Bob and Goop clips decode beneath nested base and follow gameplay and recovery', async ({ page }) => {
  const errors: string[] = [], audioRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (request.url().endsWith('.ogg')) audioRequests.push(request.url()); });
  // Expose the existing runtime to observe actual Web Audio resources, without
  // replacing gameplay or audio code. Plain production smoke remains separate.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern,
      '{initialRuntime:globalThis.__audioRuntime=') });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="start"]').click();
  await finishOpening(page, false);
  // Audio/input checks advance gameplay manually. Stop costly software-rendered
  // frames before waiting on asynchronous decoding, not after that wait.
  await page.evaluate(() => (window as any).__audioRuntime.renderLayer.setAnimationLoop(null));
  await expect.poll(() => page.evaluate(() => {
    const { loaded, failed, pending } = (window as any).__audioRuntime.audio.diagnostics;
    return { loaded, failed, pending };
  }), { timeout: 60_000 }).toEqual({ loaded: SOUND_BANKS.containment.length, failed: [], pending: 0 });
  expect(new Set(audioRequests).size).toBe(SOUND_BANKS.containment.length);
  expect(audioRequests.some(url => url.includes('/volt/') || url.includes('/turrets/'))).toBe(false);
  expect(audioRequests.every(url => new URL(url).pathname.startsWith('/group-folder/assets/audio/'))).toBe(true);
  // Start unlocks audio; the post-cutscene canvas gesture acquires pointer lock.
  await page.locator('canvas').click();
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'));
  await page.waitForFunction(() => (window as any).__audioRuntime.audio.diagnostics.contextState === 'running');
  // Unlock must not silently expand the bank. Later factories warm their
  // cumulative banks before entry; verify actual browser OGG decoding too.
  expect(new Set(audioRequests).size).toBe(SOUND_BANKS.containment.length);
  await page.evaluate(async banks => {
    const audio = (window as any).__audioRuntime.audio;
    await audio.preload(banks.cultivation);
    if (audio.diagnostics.loaded !== banks.cultivation.length) throw new Error('Cultivation bank missing');
    await audio.preload(banks.blackout);
  }, SOUND_BANKS);
  expect(new Set(audioRequests).size).toBe(SOUND_BANKS.blackout.length);
  expect(new Set(audioRequests.filter(url => url.includes('/bob/'))).size).toBe(7);
  expect(new Set(audioRequests.filter(url => url.includes('/goop/'))).size).toBe(5);
  expect(new Set(audioRequests.filter(url => url.includes('/world/'))).size).toBe(6);
  await page.evaluate(() => {
    const runtime=(window as any).__audioRuntime;
    runtime.resources.body.teleport({x:3,y:0.46,z:0});
  });
  const step=async(count:number)=>page.evaluate(count=>{
    const runtime=(window as any).__audioRuntime;
    for(let i=0;i<count;i++) runtime.fixedUpdate(1/60);
    return { ...runtime.audio.diagnostics, keys:[...runtime.audio.loops.keys()] };
  },count);
  const stationary=await step(1);
  await page.keyboard.down('KeyW');
  const moving=await step(30);
  expect(moving.keys).not.toContain('character:movement');
  expect(moving.played).toBeGreaterThan(stationary.played);
  const bobVoices = await page.evaluate(() => [...(window as any).__audioRuntime.audio.voices]
    .map((voice: any) => ({sound:voice.sound,loop:voice.source.loop,channels:voice.source.buffer.numberOfChannels})));
  expect(bobVoices.some(voice => voice.sound === 'bob-contact-01')).toBe(true);
  expect(bobVoices.every(voice => !voice.loop && voice.channels === 1)).toBe(true);
  await page.keyboard.up('KeyW'); await step(40);
  const beforeCharge=await step(1);
  await page.keyboard.down('Space');
  const charging=await step(12);
  expect(charging.keys).not.toContain('character:charge');
  expect(charging.played).toBe(beforeCharge.played);
  expect(await page.evaluate(() => (window as any).__audioRuntime.resources.body.chargingJump)).toBe(true);
  await page.keyboard.up('Space');
  const jumped=await step(1);
  expect(jumped.keys).not.toContain('character:charge');
  expect(jumped.played).toBeGreaterThan(charging.played);
  await step(150);
  await page.keyboard.down('Space'); await step(8);
  // Goop is unavailable until rescue. A rejected switch leaves Bob charging,
  // even though the rejected charge sound is no longer part of his palette.
  expect(await page.evaluate(() =>
    (window as any).__audioRuntime.resources.slimeManager.isAvailable('goop'),
  )).toBe(false);
  await page.keyboard.press('Tab');
  const locked = await step(1);
  expect(locked.keys).not.toContain('character:charge');
  expect(await page.evaluate(() => (window as any).__audioRuntime.resources.body.chargingJump)).toBe(true);
  expect(await page.evaluate(() =>
    (window as any).__audioRuntime.resources.slimeManager.activeSlimeId,
  )).toBe('bob');
  expect(await page.evaluate(() =>
    (window as any).__audioRuntime.resources.slimeManager.unlock('goop'),
  )).toBe(true);
  await page.keyboard.press('Tab');
  const switched=await step(1);
  expect(await page.evaluate(() =>
    (window as any).__audioRuntime.resources.slimeManager.activeSlimeId,
  )).toBe('goop');
  expect(switched.keys).not.toContain('character:charge');
  await page.keyboard.up('Space');
  await page.evaluate(() => (window as any).__audioRuntime.resources.goopBody.teleport({x:3,y:0.46,z:0}));
  const goopRest=await step(1);
  await page.keyboard.down('KeyW'); const goopMoving=await step(30); await page.keyboard.up('KeyW');
  expect(goopMoving.played).toBeGreaterThan(goopRest.played);
  expect(goopMoving.keys).not.toContain('character:movement');
  await page.keyboard.down('Space'); await step(1); await page.keyboard.up('Space'); await step(1);
  expect(await page.evaluate(() => [...(window as any).__audioRuntime.audio.voices]
    .some((voice: any) => voice.sound === 'bob-jump-01'))).toBe(true);
  // Use the real Room 3 entry platform above the authored acid basin.
  await page.evaluate(() => (window as any).__audioRuntime.resources.goopBody.teleport({x:0,y:10.9,z:51.5}));
  const nearAcid=await step(1);
  expect(nearAcid.keys).toContain('environment:acid');
  expect(await page.evaluate(() => [...(window as any).__audioRuntime.audio.voices]
    .some((voice: any) => voice.sound === 'goop-acid-puddle-loop-01' && voice.source.loop && voice.source.buffer.numberOfChannels === 1))).toBe(true);
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.waitForFunction(() => (window as any).__audioRuntime.audio.diagnostics.contextState === 'suspended');
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
  await page.locator('[data-setting="volume"]').press('Home');
  await page.locator('[data-setting="effects-volume"]').press('Home');
  for (let i=0;i<7;i++) await page.locator('[data-setting="effects-volume"]').press('ArrowRight');
  const volume=await page.evaluate(()=>(window as any).__audioRuntime.audio.diagnostics);
  expect(volume.masterVolume).toBe(0); expect(volume.effectsVolume).toBe(0.35);
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
  await page.waitForFunction(() => (window as any).__audioRuntime.audio.diagnostics.contextState === 'running');
  const reset=await step(1);
  expect(reset.keys).not.toContain('character:charge');
  expect(reset.keys).not.toContain('environment:acid');
  expect(reset.keys.some(key=>key.startsWith('acid:') || key.startsWith('dissolve:'))).toBe(false);
  expect(await page.evaluate(() => (window as any).__audioRuntime.resources.containmentLevel.requestFailure('bob-audio-review'))).toBe(true);
  const dying=await step(1);
  expect(dying.played).toBeGreaterThan(reset.played);
  await step(90);
  await page.evaluate(() => (window as any).__audioRuntime.retryAfterDeath());
  await step(1);
  expect(await page.evaluate(() => [...(window as any).__audioRuntime.audio.voices]
    .some((voice: any) => voice.sound === 'bob-contact-01'))).toBe(true);
  await page.evaluate(()=>{
    const rt=(window as any).__audioRuntime;
    rt.audio.setVolumes(1,0.8); // Restore the mix after the earlier mute-control check.
    rt.resources.containmentLevel.teleportToRoomForDebug(3);
    rt.fixedUpdate(1/60);
  });
  // At the normal entry platform the first active red beam is about 3 m away.
  // Verify an actual audible-level source without changing authored visibility.
  await page.waitForFunction(()=>[...(window as any).__audioRuntime.audio.voices]
    .some((v:any)=>v.sound==='world-laser-loop-01' && v.gain.gain.value>0.3));
  const worldSounds=await page.evaluate(()=>{
    const rt=(window as any).__audioRuntime,r=rt.resources,room=r.testScene.roomThree;
    const humming=[...rt.audio.voices].filter((v:any)=>v.sound==='world-laser-loop-01').map((v:any)=>({channels:v.source.buffer.numberOfChannels,loop:v.source.loop}));
    for(const hazard of room.lasers.hazards)hazard.setCircuitGateEnabled(false);
    rt.gameplayAudio.update();
    const laserStopped=![...rt.audio.voices].some((v:any)=>v.sound==='world-laser-loop-01');
    const platform=r.testScene.roomFour.elevatorPlatform;
    r.containmentLevel.teleportToRoomForDebug(4);rt.fixedUpdate(1/60);
    r.body.teleport({x:platform.position.x,y:platform.position.y+1,z:platform.position.z});
    platform.setActive(true);platform.update(.1);rt.gameplayAudio.update();
    const moving=[...rt.audio.voices].some((v:any)=>v.sound==='world-machinery-loop-01');
    platform.hold();rt.gameplayAudio.update();
    const heldSilent=![...rt.audio.voices].some((v:any)=>v.sound==='world-machinery-loop-01');
    return {humming,laserStopped,moving,heldSilent};
  });
  expect(worldSounds).toEqual({humming:[{channels:1,loop:true}],laserStopped:true,moving:true,heldSilent:true});
  await page.evaluate(() => (window as any).__audioRuntime.unload());
  const unloaded=await page.evaluate(()=>(window as any).__audioRuntime.audio.diagnostics);
  expect(unloaded.loops).toBe(0); expect(unloaded.voices).toBe(0);
  expect(unloaded.failed).toEqual([]); expect(errors).toEqual([]);
});

test('Volt uses selected electrical clips, one quiet power loop and clean disconnect and restart', async ({ page }) => {
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/assets/*.js',async route=>{
    const response=await route.fetch(); let source=await response.text();
    source=source.replace(/([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/,
      '(globalThis.__voltInitial=$1,$1.prepareLightingPrograms()).then(');
    source=source.replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/,
      'class AudioBlackout extends $1{constructor(...args){super(...args);globalThis.__voltAudio=this}}export{AudioBlackout as BlackoutLevelRuntime};');
    await route.fulfill({response,body:source});
  });
  await page.goto('./?debug=1',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-action="start"]')).toBeVisible({timeout:180_000});
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.evaluate(()=>(window as any).__voltInitial.renderLayer.setAnimationLoop(null));
  await page.locator('[data-action="start"]').click();
  await page.keyboard.press('Minus');
  await expect(page.locator('[data-action="enter-level"]')).toContainText('Enter Level 3',{timeout:180_000});
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(()=>(window as any).__voltAudio?.state==='running',null,{timeout:180_000});
  await page.evaluate(()=>(window as any).__voltAudio.renderLayer.setAnimationLoop(null));
  await page.waitForFunction(()=>{
    const audio=(window as any).__voltAudio.audio;
    return audio.diagnostics.contextState==='running' && audio.diagnostics.pending===0;
  });
  const connected=await page.evaluate(()=>{
    const rt=(window as any).__voltAudio, r=rt.resources;
    r.manager.activate('volt');
    r.group.voltBody.teleport({x:-9,y:0.46,z:48});
    r.maintenanceBay.receiver.position.x=-9; r.maintenanceBay.receiver.updateWorldMatrix(true,true);
    rt.renderLayer.cameraRig.copyAimRay=(origin:any,direction:any)=>{
      origin.copy(r.group.voltBody.position);
      r.maintenanceBay.target.copySocketWorldPosition(direction).sub(origin).normalize();
    };
    rt.gameplayAudio.update();
    const controls={aimHeld:true,fireHeld:false,firePressed:false,gameplayInputEnabled:true,pointerLocked:true};
    r.electricalSystem.update(1/60,controls);
    r.electricalSystem.update(1/60,{...controls,fireHeld:true,firePressed:true});
    return {target:r.electricalSystem.readModel.connectedTargetId,keys:[...rt.audio.loops.keys()],
      sounds:[...rt.audio.voices].map((v:any)=>v.sound)};
  });
  expect(connected.target).toBe('maintenance-bay-circuit');
  expect(connected.keys.filter(key=>key==='volt:circuit')).toHaveLength(1);
  expect(connected.keys.some(key=>key.startsWith('charge:'))).toBe(false);
  expect(connected.sounds).toContain('volt-shoot-01'); expect(connected.sounds).toContain('volt-circuit-connect-01');
  await page.waitForFunction(()=>{
    const rt=(window as any).__voltAudio;
    return [...rt.audio.voices].some((v:any)=>v.key==='volt:circuit' && v.gain.gain.value>0);
  });
  const powered=await page.evaluate(()=>{
    const rt=(window as any).__voltAudio,r=rt.resources;
    for(let i=0;i<60;i++)r.maintenanceBay.update(1/60,{bob:r.group.bobBody,goop:r.group.goopBody,volt:r.group.voltBody});
    r.group.bobBody.teleport({x:6,y:.46,z:52});r.manager.activate('bob');rt.gameplayAudio.update();
    const loop=[...rt.audio.voices].find((v:any)=>v.key==='volt:circuit') as any;
    return {sounds:[...rt.audio.voices].map((v:any)=>v.sound),gain:loop.gain.gain.value,
      channels:loop.source.buffer.numberOfChannels,loaded:rt.audio.diagnostics.loaded};
  });
  expect(powered.loaded).toBe(SOUND_BANKS.blackout.length);
  expect(powered.sounds.filter(sound=>sound==='volt-charge-ready-01')).toHaveLength(1);
  expect(powered.gain).toBeLessThan(0.1); expect(powered.channels).toBe(1);
  expect(powered.sounds).toContain('world-door-movement-loop-01');
  const arrived=await page.evaluate(()=>{
    const rt=(window as any).__voltAudio;
    rt.resources.maintenanceBay.door.update(1,[]);rt.gameplayAudio.update();
    return [...rt.audio.voices].map((v:any)=>v.sound);
  });
  expect(arrived).not.toContain('world-door-movement-loop-01');expect(arrived).toContain('world-door-stop-01');
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.waitForFunction(()=>(window as any).__voltAudio.audio.diagnostics.contextState==='suspended');
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
  await page.waitForFunction(()=>(window as any).__voltAudio.audio.diagnostics.contextState==='running');
  expect(await page.evaluate(()=>[...(window as any).__voltAudio.audio.voices].filter((v:any)=>v.key==='volt:circuit').length)).toBe(1);
  const disconnected=await page.evaluate(()=>{
    const rt=(window as any).__voltAudio;
    rt.resources.electricalSystem.disconnect('intentional');
    return {keys:[...rt.audio.loops.keys()],sounds:[...rt.audio.voices].map((v:any)=>v.sound)};
  });
  expect(disconnected.keys).not.toContain('volt:circuit'); expect(disconnected.sounds).toContain('volt-circuit-release-01');
  await page.keyboard.press('KeyP');
  await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
  expect(await page.evaluate(()=>(window as any).__voltAudio.audio.diagnostics.loops)).toBe(0);
  await page.evaluate(()=>(window as any).__voltAudio.unload());
  expect(await page.evaluate(()=>(window as any).__voltAudio.audio.diagnostics.voices)).toBe(0);
  expect(errors).toEqual([]);
});
