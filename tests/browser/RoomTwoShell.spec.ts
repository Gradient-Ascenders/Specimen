import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from './fixtures.ts';
import {finishOpening} from '../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

test('the authored Room 2 prepares before play and reuses its shared resources after restart',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(settings=>localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})),GRAPHICS_PROFILES.standard.settings);
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    expect(body).toMatch(/\{initialRuntime:([\w$]+)/);
    await route.fulfill({response,body:body.replace(/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__roomTwoRuntime=$1')});
  });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const diagnostics=await page.evaluate(()=>{
    const runtime=(window as any).__roomTwoRuntime,resources=runtime.resources,layer=runtime.renderLayer;
    layer.setAnimationLoop(null);resources.containmentLevel.teleportToRoomForDebug(2);
    runtime.retargetCameraToActiveSlime(resources);layer.render();
    return {...resources.testScene.teaching.roomTwoArt.shell.diagnostics,
      prime:resources.testScene.measuredFirstUseGeometryPrimeDiagnostics,
      programs:layer.renderer.info.programs.length,glError:layer.renderer.getContext().getError()};
  });
  expect(diagnostics.ready).toBe(true);expect(diagnostics.meshes).toBe(15);
  expect(diagnostics.cameras).toBe(2);expect(diagnostics.textureCount).toBe(0);expect(diagnostics.glError).toBe(0);
  expect(diagnostics.prime.resourcesPrimed).toBe(true);expect(diagnostics.prime.resourceCount).toBe(33);
  const evidence='artifacts/evidence/room-two-shell';await mkdir(evidence,{recursive:true});
  for(const [name,position,target,fov] of [
    ['entry',[-8.4,11.7,29.4],[3,6.5,39.8],78],
    ['landing',[-11,2.5,31],[0,6,38],75],
    ['adhesion',[3,5.8,30],[14.5,8.2,42],70],
    ['observation',[-10.4,9,37.1],[-16.55,7.6,38.7],58],
    ['drone-workbench',[-14.1,8.1,37],[-16.6,7.6,36],60],
    ['pressure-bank',[5,4,33],[2.3,3.8,27.2],65],
    ['upper-route',[0,12.8,46],[8,7,36],76],
    ['platform-close',[6.2,4.9,35.6],[8.5,5.2,38.5],64],
    ['thruster-harness',[7.1,4.8,36.6],[8.5,4.6,38.5],60],
    ['wall-grazing',[14.2,5,30],[14.7,6,46],68],
    ['exit-seam',[2,13,45],[0,10.9,49],68],
  ] as const){
    const png=await page.evaluate(({position,target,fov})=>{
      const layer=(window as any).__roomTwoRuntime.renderLayer,camera=layer.cameraRig.camera;
      camera.position.set(...position);camera.lookAt(...target);camera.fov=fov;
      camera.updateProjectionMatrix();camera.updateMatrixWorld(true);layer.render();
      return layer.canvas.toDataURL('image/png').split(',')[1];
    },{position,target,fov});
    await writeFile(`${evidence}/${name}.png`,Buffer.from(png,'base64'));
  }
  const lifecycle=await page.evaluate(()=>{
    const runtime=(window as any).__roomTwoRuntime,layer=runtime.renderLayer,shell=runtime.resources.testScene.teaching.roomTwoArt.shell;
    const root=shell.root.children[0];
    // Warm the same camera/room before comparing restart resource counts.
    runtime.restartLevel();runtime.resources.containmentLevel.teleportToRoomForDebug(2);layer.render();
    const memory={...layer.renderer.info.memory};
    runtime.restartLevel();runtime.resources.containmentLevel.teleportToRoomForDebug(2);layer.render();
    return {same:root===shell.root.children[0],ready:shell.diagnostics.ready,before:memory,
      after:{...layer.renderer.info.memory},programs:layer.renderer.info.programs.length,glError:layer.renderer.getContext().getError()};
  });
  expect(lifecycle.same).toBe(true);expect(lifecycle.ready).toBe(true);expect(lifecycle.glError).toBe(0);
  expect(lifecycle.after).toEqual(lifecycle.before);expect(errors).toEqual([]);
  expect(lifecycle.programs).toBe(diagnostics.programs);
  await writeFile(`${evidence}/observations.json`,JSON.stringify({diagnostics,lifecycle,errors},null,2));
});
