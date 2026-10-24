import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from './fixtures.ts';
import {finishOpening} from '../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

test('the Blender Room 1 shell prepares in production, keeps its route and reuses resources after restart',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(settings=>localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})),GRAPHICS_PROFILES.standard.settings);
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    expect(body).toMatch(/\{initialRuntime:([\w$]+)/);
    await route.fulfill({response,body:body.replace(/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__roomOneRuntime=$1')});
  });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-action="start"]')).toBeVisible({timeout:120_000});
  await page.locator('[data-action="start"]').click();await finishOpening(page,false);
  await page.evaluate(()=>{(window as any).__roomOneRuntime.renderLayer.setAnimationLoop(null);});
  const evidence='artifacts/evidence/room-one-shell';await mkdir(evidence,{recursive:true});
  const diagnostics=await page.evaluate(()=>{
    const runtime=(window as any).__roomOneRuntime,resources=runtime.resources,layer=runtime.renderLayer;
    const shell=resources.testScene.teaching.roomOneArt.shell;
    layer.render();
    return {...shell.diagnostics,glError:layer.renderer.getContext().getError(),colliders:resources.testScene.collisionMeshes.length};
  });
  expect(diagnostics.ready).toBe(true);expect(diagnostics.meshes).toBe(9);expect(diagnostics.glError).toBe(0);
  for(const [name,position,target,fov] of [
    ['gameplay',null,null,65],
    ['observation',[-5.4,2.6,-4.4],[3.6,2.7,.7],67],
    ['escape',[4.6,2.2,-3],[-3.2,3.5,5.8],68],
    ['diagnostics-wall',[4.6,2.5,3.7],[-1.2,3,-5.8],72],
    ['rear-trim-close',[-3.1,3.6,-4.5],[-3.78,3.8,-5.82],60],
    ['rear-trim-grazing',[-6.2,3.8,-5.35],[3.8,3.8,-5.82],68],
    ['rear-instruments',[.7,4.45,-4.5],[0,4.55,-5.6],62],
    ['ceiling',[-4.8,2,-3.8],[0,7.6,-.5],78],
  ] as const){
    const png=await page.evaluate(({position,target,fov})=>{
      const layer=(window as any).__roomOneRuntime.renderLayer,camera=layer.cameraRig.camera;
      if(position&&target){camera.position.set(...position);camera.lookAt(...target);camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
      layer.render();return layer.canvas.toDataURL('image/png').split(',')[1];
    },{position,target,fov});
    await writeFile(`${evidence}/${name}.png`,Buffer.from(png,'base64'));
  }
  const lifecycle=await page.evaluate(()=>{
    const runtime=(window as any).__roomOneRuntime,layer=runtime.renderLayer,shell=runtime.resources.testScene.teaching.roomOneArt.shell;
    const root=shell.root.children[0],memory={...layer.renderer.info.memory};
    runtime.restartLevel();layer.render();
    return {same:root===shell.root.children[0],ready:shell.diagnostics.ready,before:memory,after:{...layer.renderer.info.memory},glError:layer.renderer.getContext().getError()};
  });
  expect(lifecycle.same).toBe(true);expect(lifecycle.ready).toBe(true);expect(lifecycle.glError).toBe(0);
  expect(lifecycle.after).toEqual(lifecycle.before);expect(errors).toEqual([]);
  await writeFile(`${evidence}/observations.json`,JSON.stringify({diagnostics,lifecycle,errors},null,2));
});
