import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from './fixtures.ts';
import {finishOpening} from '../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

test('the atrium renders entry, thruster platforms, observation and Goop release with prepared resources',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:1100,height:740});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(settings=>{
    localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
    (window as any).__atriumPrograms=0;
    const create=WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram=function(){(window as any).__atriumPrograms++;return create.call(this);};
  },GRAPHICS_PROFILES.standard.settings);
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();expect(body).toMatch(/\{initialRuntime:([\w$]+)/);
    await route.fulfill({response,body:body.replace(/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__atriumRuntime=$1')});
  });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const initial=await page.evaluate(()=>{
    const host=window as any,runtime=host.__atriumRuntime,layer=runtime.renderLayer;
    layer.setAnimationLoop(null);host.__atriumPrepared=new Set(layer.renderer.info.programs);
    return {shell:runtime.resources.testScene.roomFive.art.shell.diagnostics,
      prime:runtime.resources.testScene.measuredFirstUseGeometryPrimeDiagnostics,
      programs:host.__atriumPrograms,retained:layer.renderer.info.programs.length};
  });
  expect(initial.shell.ready).toBe(true);expect(initial.shell.textureCount).toBe(0);
  expect(initial.prime.uniqueGeometryCount).toBe(137);expect(initial.prime.resourcesPrimed).toBe(true);
  const evidence='artifacts/evidence/room-five-atrium';await mkdir(evidence,{recursive:true});
  const samples=[];
  const poses:[string,number[],number,number][]=[
    ['entry-reveal',[9,75.21,94],Math.PI,0],
    ['entrance-wall',[9,75.21,98],0,0],
    ['cell',[3.9,75.21,101.5],Math.PI-.4,0],
    ['lockdown-hatch',[.084,77.397,102.793],Math.PI,0],
    ['moving-platform',[10.082,83.0955,100.384],Math.PI,1.6],
    ['upper-maintenance',[15.436,93.91,120],-Math.PI/2,0],
    ['observation',[-10,97.96,129.6],Math.PI,0],
    ['on-operator-desk',[-12.8,98.90,128.3],Math.PI/2,0],
    ['escape-hatch',[2.5,75.21,122],Math.PI-.49,0],
  ];
  for(const [name,position,yaw,travel] of poses){
    const sample=await page.evaluate(({name,position,yaw,travel})=>{
      const host=window as any,runtime=host.__atriumRuntime,r=runtime.resources,layer=runtime.renderLayer;
      r.containmentLevel.teleportToRoomForDebug(5);
      const lift=r.testScene.roomFour;lift.elevator.begin();
      lift.updateActive(50,{position:{x:1000,y:1000,z:1000},radiusMetres:.45},[]);
      const room=r.testScene.roomFive;room.reset();
      if(travel)room.updateTraversal(travel,{position:{x:1000,y:1000,z:1000},radiusMetres:.45},[]);
      r.body.teleport({x:position[0],y:position[1],z:position[2]});
      r.testScene.lighting.setActiveRoom(5);r.testScene.update(0,r.body.position,r.body.position);
      runtime.retargetCameraToActiveSlime(r);layer.cameraRig.reset();layer.cameraRig.setGroundOrbitYawRadians(yaw);
      runtime.syncContextualCamera(r);
      const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:.08,frameDeltaSeconds:.08,stepsThisFrame:0,
        interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
      for(let frame=0;frame<12;frame++)runtime.render(1,stats);
      return {name,shell:room.art.shell.diagnostics,programs:host.__atriumPrograms,retained:layer.renderer.info.programs.length,
        newPrograms:layer.renderer.info.programs.filter((p:any)=>!host.__atriumPrepared.has(p)).map((p:any)=>({name:p.name,cacheKey:p.cacheKey})),
        camera:layer.cameraRig.camera.position.toArray(),calls:layer.renderer.info.render.calls,triangles:layer.renderer.info.render.triangles,
        glError:layer.renderer.getContext().getError(),png:layer.canvas.toDataURL('image/png').split(',')[1]};
    },{name,position,yaw,travel});
    await writeFile(`${evidence}/${name}.png`,Buffer.from(sample.png,'base64'));samples.push({...sample,png:undefined});
  }
  await writeFile(`${evidence}/gameplay-observations.json`,JSON.stringify({initial,samples,errors},null,2));
  for(const sample of samples){expect(sample.programs,`${sample.name}: cold shader`).toBe(initial.programs);expect(sample.glError).toBe(0);}
  const restart=await page.evaluate(()=>{
    const runtime=(window as any).__atriumRuntime,shell=runtime.resources.testScene.roomFive.art.shell;
    const source=shell.root.children[0];runtime.restartLevel();
    return {same:source===shell.root.children[0],ready:shell.ready,glError:runtime.renderLayer.renderer.getContext().getError()};
  });
  await page.evaluate(()=>{(window as any).__atriumRuntime.resources.containmentLevel.beginEndingForDebug();});
  await expect.poll(async()=>page.evaluate(()=>{
    const runtime=(window as any).__atriumRuntime;
    runtime.render(1,{fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:.08,frameDeltaSeconds:.08,stepsThisFrame:0,
      interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60});
    return runtime.finalePreparation?.ready===true;
  }),{timeout:120_000,intervals:[100],message:'Finish the real gated cinematic preparation before taking the release view.'}).toBe(true);
  const release=await page.evaluate(()=>{
    const host=window as any,runtime=host.__atriumRuntime,r=runtime.resources,layer=runtime.renderLayer;
    const preparedPrograms=host.__atriumPrograms;
    r.testScene.roomFive.updateEnding(9);
    const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:.08,frameDeltaSeconds:.08,stepsThisFrame:0,
      interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    for(let frame=0;frame<12;frame++)runtime.render(1,stats);
    const result={shell:r.testScene.roomFive.art.shell.diagnostics,programs:host.__atriumPrograms,preparedPrograms,
      glError:layer.renderer.getContext().getError(),png:layer.canvas.toDataURL('image/png').split(',')[1]};
    return result;
  });
  await writeFile(`${evidence}/release.png`,Buffer.from(release.png,'base64'));
  await writeFile(`${evidence}/observations.json`,JSON.stringify({initial,samples,release:{...release,png:undefined},restart,errors},null,2));
  for(const sample of samples){expect(sample.programs,`${sample.name}: cold shader`).toBe(initial.programs);expect(sample.glError).toBe(0);}
  expect(release.programs).toBe(release.preparedPrograms);expect(release.glError).toBe(0);
  expect(restart.same).toBe(true);expect(restart.ready).toBe(true);expect(restart.glError).toBe(0);expect(errors).toEqual([]);
  const skipped=await page.evaluate(()=>{const controller=(window as any).__atriumRuntime.resources.containmentLevel;controller.skipEnding();return controller.state;});
  expect(skipped).toBe('complete');
});
