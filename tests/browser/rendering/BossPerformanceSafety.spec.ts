import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { expect, test } from '@playwright/test';
import { GRAPHICS_PROFILES } from '../../../src/render/GraphicsProfiles.ts';

test('boss budgets preserve occluded views, open doors, quality switches and restart ownership', async ({page}, info) => {
  test.setTimeout(900_000);
  await page.setViewportSize({width:1280,height:720});
  await page.addInitScript(settings => localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})), GRAPHICS_PROFILES.standard.settings);
  const errors = watchBrowserErrors(page, { webgl: true });


  await page.route('**/assets/BlackoutLevelRuntime-*.js',async route=>{
    const response=await route.fetch(),body=await response.text(),pattern=/export\{([\w$]+) as BlackoutLevelRuntime\};/;
    expect(body).toMatch(pattern);
    await route.fulfill({response,body:body.replace(pattern,'class __BossBudgetTestRuntime extends $1{constructor(...a){super(...a);window.__bossBudgetRuntime=this}}export{__BossBudgetTestRuntime as BlackoutLevelRuntime};')});
  });
  await page.goto('./?debug=1',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="level-select"]').click();
  await page.getByRole('button',{name:'Level 3 Blackout',exact:true}).click();
  await page.getByRole('button',{name:'Enter Level 3',exact:true}).click({timeout:600_000});
  const result=await page.evaluate(()=>{
    const rt=(window as any).__bossBudgetRuntime,r=rt.resources,layer=rt.renderLayer,renderer=layer.renderer;
    layer.setAnimationLoop(null);for(let i=0;i<900&&r.ventArrival?.active;i++)rt.fixedUpdate(1/60);
    const startupScale=renderer.transmissionResolutionScale;
    rt.finishResearchFinale(r);rt.input.setEnabled(true);
    const camera=layer.cameraRig.camera,gl=renderer.getContext(),occlusion=rt.arenaOcclusion,shutter=rt.shutterOcclusion,draw=renderer.renderBufferDirect;
    const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:75};
    const canvas=document.createElement('canvas');canvas.width=gl.drawingBufferWidth;canvas.height=gl.drawingBufferHeight;
    const ctx=canvas.getContext('2d')!;
    const pixels=()=>{ctx.drawImage(renderer.domElement,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const views=[];
    for(const view of [
      {name:'west-close',eye:[-86.947,4.041,338.388],target:[-84.298,2.06,336.788],open:false,near:.1},
      {name:'west-follow',eye:[-87.154,3.508,320.936],target:[-76.409,2.06,315.615],open:false,near:.1},
      {name:'open-entrance',eye:[0,5,210],target:[0,2.06,175],open:true,near:.1},
      {name:'closed-entrance',eye:[0,5,210],target:[0,2.06,175],open:false,near:.1},
      {name:'gallery-window',eye:[0,31,210],target:[0,29,170],open:false,near:.1},
      {name:'near-clipped-walls',eye:[-87.154,3.508,320.936],target:[-76.409,2.06,315.615],open:false,near:75},
    ]) {
      r.scene.finalArena.setDoors(!view.open);
      r.specimenBody.teleport(r.specimenBody.position.clone().set(...view.target));r.finalBoss.sync();
      layer.cameraRig.update=()=>{camera.near=view.near;camera.updateProjectionMatrix();camera.position.set(...view.eye);camera.lookAt(view.target[0],view.target[1]+1.5,view.target[2]);camera.updateMatrixWorld(true);};
      rt.arenaOcclusion=undefined;rt.shutterOcclusion=undefined;
      for(let i=0;i<3;i++)rt.render(1,stats);
      const before=pixels(),programs=renderer.info.programs.length,memory={...renderer.info.memory},calls=renderer.info.render.calls;
      rt.arenaOcclusion=occlusion;rt.shutterOcclusion=shutter;rt.render(1,stats);
      const after=pixels();let different=0;for(let i=0;i<before.length;i++)if(before[i]!==after[i])different++;
      views.push({name:view.name,different,callsBefore:calls,callsAfter:renderer.info.render.calls,culled:occlusion.culledDraws,
        programsBefore:programs,programsAfter:renderer.info.programs.length,memoryBefore:memory,memoryAfter:{...renderer.info.memory},
        detail:r.specimenCharacter.detailDiagnostics,error:gl.getError()});
    }
    const bossScale=renderer.transmissionResolutionScale,shaft=r.scene.finalArena.lighting.moonlight.shaft.visible;
    const scales=[];
    for(const mode of ['physical','reduced-transmission','minimum','reduced-transmission']){layer.gelRendering.setMode(mode);scales.push(renderer.transmissionResolutionScale);}
    r.finalBoss.reset();r.finalBoss.startPhaseTwo();rt.render(1,stats);
    const phaseTwoScale=renderer.transmissionResolutionScale;
    rt.restartLevel();const restartScale=renderer.transmissionResolutionScale;
    rt.unload();const unloadedScale=renderer.transmissionResolutionScale;rt.unload();
    return {startupScale,bossScale,phaseTwoScale,shaft,scales,restartScale,unloadedScale,views,methodRestored:renderer.renderBufferDirect===draw};
  });
  await info.attach('boss-render-safety.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.startupScale).toBe(.5);expect(result.bossScale).toBe(.25);expect(result.phaseTwoScale).toBe(.25);
  expect(result.shaft).toBe(false);expect(result.scales).toEqual([1,.25,1,.25]);
  expect(result.restartScale).toBe(.5);expect(result.unloadedScale).toBe(.75);expect(result.methodRestored).toBe(true);
  for(const view of result.views){expect(view.different,view.name).toBe(0);expect(view.error).toBe(0);expect(view.programsAfter).toBe(view.programsBefore);expect(view.memoryAfter).toEqual(view.memoryBefore);}
  for(const view of result.views.slice(0,2)){
    expect(view.culled).toBeGreaterThan(0);expect(view.callsAfter).toBeLessThan(view.callsBefore);
  }
  expect(result.views[0]!.detail.level).toBe('full');expect(result.views[1]!.detail.level).toBe('distant');
  expect(errors).toEqual([]);
});
