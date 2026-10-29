import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {GRAPHICS_PROFILES} from '../../../src/render/GraphicsProfiles.ts';

// Functional evidence, including on software WebGL. This is not an FPS
// benchmark; the lab benchmark must record the actual hardware renderer.
test('Medium 1080p Blackout prepares and switches Specimen detail without new GPU storage',async({page},info)=>{
  test.setTimeout(900_000);
  await page.setViewportSize({width:1920,height:1080});
  await page.addInitScript(settings=>localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})),GRAPHICS_PROFILES.standard.settings);
  await page.addInitScript(()=>{
    const probe: { rehearsals: { viewport: unknown; pixelRatio: number }[]; retainedTargets: unknown[][]; liveStorage: string[]; liveInspections: number } = (window as any).__mediumPreparation={rehearsals:[],retainedTargets:[],liveStorage:[],liveInspections:0};
    let runtime:any,renderCamera:any;
    for(const name of ['bufferData','texImage2D','texImage3D','texStorage2D','texStorage3D','renderbufferStorage','renderbufferStorageMultisample','getProgramInfoLog']){
      const original=(WebGL2RenderingContext.prototype as any)[name];
      (WebGL2RenderingContext.prototype as any)[name]=function(...args:any[]){
        if(runtime?.state==='running'){
          if(name==='getProgramInfoLog')probe.liveInspections++;
          else probe.liveStorage.push(name);
        }
        return original.apply(this,args);
      };
    }
    Object.defineProperty(window,'__mediumRuntime',{get:()=>runtime,set:r=>{
      runtime=r;
      const layer=r.renderLayer,renderer=layer.renderer,render=renderer.render,target=renderer.setRenderTarget;
      renderer.render=function(scene:any,camera:any){
        const previous=renderCamera;renderCamera=camera;
        if(layer.canvas.style.visibility==='hidden'&&!renderer.getScissorTest()&&scene===layer.scene&&camera!==layer.cameraRig.camera){
          const viewport=renderer.getViewport({copy:(v:any)=>[v.x,v.y,v.z,v.w]});
          probe.rehearsals.push({viewport,pixelRatio:renderer.getPixelRatio()});
        }
        try{return render.call(this,scene,camera);}finally{renderCamera=previous;}
      };
      renderer.setRenderTarget=function(value:any,...args:any[]){
        if(value?.samples>=4&&renderCamera===layer.cameraRig.camera)probe.retainedTargets.push([value.width,value.height]);
        return target.call(this,value,...args);
      };
    }});
  });
  const errors = watchBrowserErrors(page, { webgl: true });


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
      // Match the ordinary runtime draw: hidden collider materials must not
      // upload geometry just because this LOD probe renders the layer directly.
      try{runtime.hiddenMaterialCulling.render(()=>layer.render());}finally{r.lighting?.restoreCamera();}
      lod.push({...r.specimenCharacter.detailDiagnostics,error:gl.getError(),memory:{...renderer.info.memory}});
    }
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {lod,graphics:layer.graphicsConfiguration,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
      preparation:(window as any).__mediumPreparation,researchPreparation:r.researchFinale.preparation,
      viewport:renderer.getViewport({copy:(v:any)=>[v.x,v.y,v.z,v.w]}),scissor:renderer.getScissorTest(),
      transmissionScale:renderer.transmissionResolutionScale,canvasVisibility:layer.canvas.style.visibility,
      endingPreparation:r.defeatFinale.preparation,
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),error:gl.getError()};
  });
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/medium-1080-render-safety.json',JSON.stringify(result,null,2));
  await info.attach('medium-safety.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.buffer).toEqual([1920,1080]);expect(result.graphics).toMatchObject(GRAPHICS_PROFILES.standard.settings);
  expect(result.researchPreparation).toEqual({complete:true,frames:40});
  expect(result.endingPreparation).toEqual({complete:true,frames:30});
  expect(result.preparation.rehearsals).toHaveLength(70);
  for(const {viewport,pixelRatio} of result.preparation.rehearsals){
    expect(viewport[2]*pixelRatio).toBeLessThanOrEqual(320);
    expect(viewport[3]*pixelRatio).toBeLessThanOrEqual(180);
  }
  expect(result.preparation.retainedTargets).toContainEqual([960,540]);
  expect(result.preparation.liveStorage).toEqual([]);expect(result.preparation.liveInspections).toBe(0);
  expect(result.viewport).toEqual([0,0,1920,1080]);expect(result.scissor).toBe(false);
  expect(result.transmissionScale).toBe(.5);expect(result.canvasVisibility).not.toBe('hidden');
  expect(result.endingPreparation.complete).toBe(true);expect(result.endingPreparation.frames).toBeGreaterThanOrEqual(20);
  expect(result.lod.map((row:any)=>row.level)).toEqual(['full','distant','full']);
  expect(result.lod.map((row:any)=>row.triangles)).toEqual([81040,20232,81040]);
  expect(result.lod[2].memory).toEqual(result.lod[0].memory);
  expect(result.lod.map((row:any)=>row.error)).toEqual([0,0,0]);expect(result.error).toBe(0);expect(errors).toEqual([]);

  const scales=await page.evaluate(()=>{
    const runtime=(window as any).__mediumRuntime,layer=runtime.renderLayer,scales:number[]=[];
    // The level budget follows balanced gel through setting changes, survives
    // restart, and releases independently of the session's graphics settings.
    for(const mode of ['physical','reduced-transmission','minimum','reduced-transmission']){
      layer.gelRendering.setMode(mode);scales.push(layer.renderer.transmissionResolutionScale);
    }
    runtime.restartLevel();scales.push(layer.renderer.transmissionResolutionScale);
    runtime.unload();scales.push(layer.renderer.transmissionResolutionScale);
    runtime.unload();scales.push(layer.renderer.transmissionResolutionScale);
    return scales;
  });
  expect(scales).toEqual([1,.5,1,.5,.5,.75,.75]);
  expect(errors).toEqual([]);
});
