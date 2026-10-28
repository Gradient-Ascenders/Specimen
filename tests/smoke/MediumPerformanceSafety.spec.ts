import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

// Functional evidence, including on software WebGL. This is not an FPS
// benchmark; the lab benchmark must record the actual hardware renderer.
test('Medium 1080p Blackout prepares and switches Specimen detail without new GPU storage',async({page},info)=>{
  test.setTimeout(900_000);
  await page.setViewportSize({width:1920,height:1080});
  await page.addInitScript(settings=>localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})),GRAPHICS_PROFILES.standard.settings);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()}: ${response.url()}`);});
  await page.route('**/assets/BlackoutLevelRuntime-*.js',async route=>{
    const response=await route.fetch(),body=await response.text(),pattern=/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/;
    expect(body).toMatch(pattern);
    await route.fulfill({response,body:body.replace(pattern,
      'class __MediumRuntime extends $1{constructor(...args){super(...args);globalThis.__mediumRuntime=this}}export{__MediumRuntime as BlackoutLevelRuntime};')});
  });
  await page.goto('./?debug=1',{waitUntil:'domcontentloaded'});
  const title=page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({timeout:120_000});
  await title.getByRole('button',{name:'Select level',exact:true}).click();
  await page.getByRole('button',{name:'Level 3 Blackout',exact:true}).click();
  await page.getByRole('button',{name:'Enter Level 3',exact:true}).click({timeout:600_000});
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing');
  const result=await page.evaluate(()=>{
    const runtime=(window as any).__mediumRuntime,r=runtime.resources,layer=runtime.renderLayer;
    layer.setAnimationLoop(null);
    for(let i=0;i<900&&r.ventArrival?.active;i++)runtime.fixedUpdate(1/60);
    const renderer=layer.renderer,gl=renderer.getContext(),camera=layer.cameraRig.camera;
    r.specimenCharacter.setVisible(true);
    camera.position.set(0,6,220);camera.lookAt(0,6,230);camera.updateMatrixWorld(true);
    const lod=[];
    for(const distance of [2,100,2]){
      r.specimenCharacter.setPosition({x:0,y:6,z:220+distance});r.specimenCharacter.root.updateMatrixWorld(true);
      r.specimenCharacter.updateDetail(camera);
      r.lighting?.prepareCamera(camera,camera.position);
      try{layer.render();}finally{r.lighting?.restoreCamera();}
      lod.push({...r.specimenCharacter.detailDiagnostics,error:gl.getError(),memory:{...renderer.info.memory}});
    }
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {lod,graphics:layer.graphicsConfiguration,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
      endingPreparation:r.defeatFinale.preparation,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),error:gl.getError()};
  });
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/medium-1080-render-safety.json',JSON.stringify(result,null,2));
  await info.attach('medium-safety.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.buffer).toEqual([1920,1080]);expect(result.graphics).toMatchObject(GRAPHICS_PROFILES.standard.settings);
  expect(result.endingPreparation.complete).toBe(true);expect(result.endingPreparation.frames).toBeGreaterThanOrEqual(20);
  expect(result.lod.map((row:any)=>row.level)).toEqual(['full','distant','full']);
  expect(result.lod.map((row:any)=>row.triangles)).toEqual([81040,20232,81040]);
  expect(result.lod[2].memory).toEqual(result.lod[0].memory);
  expect(result.lod.map((row:any)=>row.error)).toEqual([0,0,0]);expect(result.error).toBe(0);expect(errors).toEqual([]);
});
