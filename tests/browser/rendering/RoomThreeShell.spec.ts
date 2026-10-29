import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from '../../helpers/BrowserFixtures.ts';
import {finishOpening} from '../../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../../src/render/GraphicsProfiles.ts';

test('the chemical hall renders its route and optical heads, prewarms doorway views and reuses resources on restart',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:960,height:640});
  const errors = watchBrowserErrors(page, { webgl: true });


  await page.addInitScript(settings=>{
    localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
    (window as any).__roomThreePrograms=0;
    const create=WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram=function(){(window as any).__roomThreePrograms++;return create.call(this);};
  },GRAPHICS_PROFILES.standard.settings);
  await exposeGame(page, { runtime: '__roomThreeRuntime' });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const initial=await page.evaluate(()=>{
    const runtime=(window as any).__roomThreeRuntime,layer=runtime.renderLayer,resources=runtime.resources;
    layer.setAnimationLoop(null);
    (window as any).__roomThreePrepared=new Set(layer.renderer.info.programs);
    return {shell:resources.testScene.roomThree.art.shell.diagnostics,
      prime:resources.testScene.measuredFirstUseGeometryPrimeDiagnostics,
      created:(window as any).__roomThreePrograms,retained:layer.renderer.info.programs.length,
      memory:{...layer.renderer.info.memory}};
  });
  expect(initial.shell.ready).toBe(true);expect(initial.shell.meshes).toBe(14);
  expect(initial.shell.textureCount).toBe(0);expect(initial.shell.lasersAttached).toBe(true);
  expect(initial.prime.resourceCount).toBe(137);expect(initial.prime.resourcesPrimed).toBe(true);
  const evidence='artifacts/evidence/room-three-shell';await mkdir(evidence,{recursive:true});
  const observations=[];
  for(const [name,room,body,eye,target,fov,time] of [
    ['room-2-doorway',2,[0,11.36,46.5],[1,12.8,44.5],[0,13,58],68,0],
    ['entry',3,[0,11.36,51.4],[0,13.3,51],[-1.5,17,75.5],78,0],
    ['dividing-wall-rim',3,[0,11.36,51.4],[11,8.2,51.4],[11.8,5.4,49.2],55,0],
    ['dividing-wall-grazing',3,[0,11.36,51.4],[12,6.3,49.42],[10,5.35,49.2],68,0],
    ['basin',3,[2.7885,11.61,57.6261],[-3,14,54.5],[-1,5.05,64],72,0],
    ['filtration-plant',3,[2.7885,11.61,57.6261],[-8.5,14,61],[-18.1,12.5,58.5],65,0],
    ['rear-extraction',3,[-.4591,24.88,68.5505],[3,22,65.5],[-9.5,20.5,77],65,0],
    ['main-climb',3,[16.17,18,63],[9,17,58],[16.64,17.5,63],68,1.3],
    ['laser-head',3,[0,11.36,51.4],[-1.5,12.4,56],[-3.2,11.3706,54.5525],52,0],
    ['harness',3,[2.7885,11.61,57.6261],[.2,9.9,55.7],[2.7885,10.2,57.6261],60,0],
    ['sweep-off',3,[5,24.41,62.839],[2,26.7,65.2],[7,24.2747,62.0384],68,.3],
    ['sweep-on',3,[5,24.41,62.839],[2,26.7,65.2],[7,24.2747,62.0384],68,1.3],
    ['high-exit',3,[5.7,25.7853,73.5],[3,29,71.5],[9,31.4,76.8],65,3.1],
    ['room-4-handoff',4,[9,31.635,80],[9,32.4,79.5],[9,35,85.5],72,0],
  ] as const){
    const sample=await page.evaluate(({name,room,body,eye,target,fov,time})=>{
      const host=window as any,runtime=host.__roomThreeRuntime,r=runtime.resources,layer=runtime.renderLayer;
      r.containmentLevel.teleportToRoomForDebug(room);
      r.body.teleport({x:body[0],y:body[1],z:body[2]});
      r.testScene.lighting.setActiveRoom(room);r.testScene.update(0,r.body.position,r.body.position);
      const hall=r.testScene.roomThree;hall.reset();
      if(time)hall.updateActive(time,{id:'capture',position:{x:0,y:11.36,z:51.4},radiusMetres:.01});
      r.testScene.surveillanceCameras.reset(r.body.position);
      runtime.retargetCameraToActiveSlime(r);
      const rig=layer.cameraRig,camera=rig.camera,update=rig.update;
      rig.update=function(...args:any[]){
        update.apply(this,args);camera.position.set(...eye);camera.lookAt(...target);
        camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
      };
      const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:1/60,frameDeltaSeconds:0,stepsThisFrame:0,
        interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
      try{runtime.render(1,stats);}finally{rig.update=update;}
      return {name,created:host.__roomThreePrograms,retained:layer.renderer.info.programs.length,
        newPrograms:layer.renderer.info.programs.filter((program:any)=>!host.__roomThreePrepared.has(program))
          .map((program:any)=>({name:program.name,cacheKey:program.cacheKey})),
        calls:layer.renderer.info.render.calls,triangles:layer.renderer.info.render.triangles,
        glError:layer.renderer.getContext().getError(),png:layer.canvas.toDataURL('image/png').split(',')[1]};
    },{name,room,body,eye,target,fov,time});
    await writeFile(`${evidence}/${name}.png`,Buffer.from(sample.png,'base64'));
    observations.push({...sample,png:undefined});
  }
  const lifecycle=await page.evaluate(()=>{
    const runtime=(window as any).__roomThreeRuntime,layer=runtime.renderLayer,shell=runtime.resources.testScene.roomThree.art.shell;
    const source=shell.root.children[0];
    runtime.restartLevel();runtime.resources.containmentLevel.teleportToRoomForDebug(3);layer.render();
    const before={...layer.renderer.info.memory};
    runtime.restartLevel();runtime.resources.containmentLevel.teleportToRoomForDebug(3);layer.render();
    return {same:source===shell.root.children[0],before,after:{...layer.renderer.info.memory},glError:layer.renderer.getContext().getError()};
  });
  await writeFile(`${evidence}/observations.json`,JSON.stringify({initial,observations,lifecycle,errors},null,2));
  for(const sample of observations){
    expect(sample.created,`${sample.name}: shaders must prepare before play`).toBe(initial.created);
    expect(sample.retained,`${sample.name}: retained shaders grew`).toBe(initial.retained);
    expect(sample.glError).toBe(0);
  }
  expect(lifecycle.same).toBe(true);expect(lifecycle.after).toEqual(lifecycle.before);
  expect(lifecycle.glError).toBe(0);expect(errors).toEqual([]);
});
