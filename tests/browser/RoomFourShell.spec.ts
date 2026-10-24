import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from './fixtures.ts';
import {finishOpening} from '../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

test('the freight lift renders departure, climb and arrival with prepared resources and a clear gameplay camera',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(settings=>{
    localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
    (window as any).__liftPrograms=0;
    const create=WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram=function(){(window as any).__liftPrograms++;return create.call(this);};
  },GRAPHICS_PROFILES.standard.settings);
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    expect(body).toMatch(/\{initialRuntime:([\w$]+)/);
    await route.fulfill({response,body:body.replace(/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__liftRuntime=$1')});
  });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const initial=await page.evaluate(()=>{
    const host=window as any,runtime=host.__liftRuntime,layer=runtime.renderLayer;
    layer.setAnimationLoop(null);host.__liftPrepared=new Set(layer.renderer.info.programs);
    return {shell:runtime.resources.testScene.roomFour.art.shell.diagnostics,
      prime:runtime.resources.testScene.measuredFirstUseGeometryPrimeDiagnostics,
      programs:host.__liftPrograms,retained:layer.renderer.info.programs.length};
  });
  expect(initial.shell.ready).toBe(true);expect(initial.shell.textureCount).toBe(0);
  expect(initial.prime.resourceCount).toBe(137);expect(initial.prime.resourcesPrimed).toBe(true);
  const evidence='artifacts/evidence/room-four-lift';await mkdir(evidence,{recursive:true});
  const samples=[];
  const poses:readonly [string,number,boolean,number?,number?,number?][]=[
    ['departure',0,false],['first-charge',7.2,false],['middle-climb',25,false],
    ['upper-climb',40,false],['docking',49,false],['arrival',50,false],['exit',50,true],
    ['edge-south-east',25,false,12.8,81.7,Math.PI],
    ['edge-north-west',25,false,5.2,89.3,0],
    ['edge-arrival',49,false,12.8,81.7,Math.PI],
  ];
  for(const [name,total,exit,x=9,z=exit?90.5:85.5,yaw=0] of poses){
    const sample=await page.evaluate(({name,total,x,z,yaw})=>{
      const host=window as any,runtime=host.__liftRuntime,r=runtime.resources,layer=runtime.renderLayer;
      r.containmentLevel.teleportToRoomForDebug(4);
      const room=r.testScene.roomFour;room.reset();room.elevator.begin();
      if(total)room.elevator.update(total,[]);
      if(total>3)room.lasers.update(Math.min(45,total-3),{id:'capture',position:{x:1000,y:1000,z:1000},radiusMetres:.1});
      room.syncPresentation();
      r.body.teleport({x,y:room.elevatorPlatform.position.y+.71,z});
      r.testScene.lighting.setActiveRoom(4);r.testScene.update(0,r.body.position,r.body.position);
      runtime.retargetCameraToActiveSlime(r);layer.cameraRig.reset();layer.cameraRig.setGroundOrbitYawRadians(yaw);
      runtime.syncContextualCamera(r);
      const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:.08,frameDeltaSeconds:.08,stepsThisFrame:0,
        interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
      for(let frame=0;frame<12;frame++)runtime.render(1,stats);
      return {name,programs:host.__liftPrograms,retained:layer.renderer.info.programs.length,
        newPrograms:layer.renderer.info.programs.filter((program:any)=>!host.__liftPrepared.has(program))
          .map((program:any)=>({name:program.name,cacheKey:program.cacheKey})),
        shell:room.art.shell.diagnostics,camera:layer.cameraRig.camera.position.toArray(),
        playerInView:r.body.position.clone().project(layer.cameraRig.camera).toArray(),
        memory:{...layer.renderer.info.memory},calls:layer.renderer.info.render.calls,
        triangles:layer.renderer.info.render.triangles,glError:layer.renderer.getContext().getError(),
        png:layer.canvas.toDataURL('image/png').split(',')[1]};
    },{name,total,x,z,yaw});
    await writeFile(`${evidence}/${name}.png`,Buffer.from(sample.png,'base64'));samples.push({...sample,png:undefined});
  }
  const restart=await page.evaluate(()=>{
    const runtime=(window as any).__liftRuntime,layer=runtime.renderLayer,shell=runtime.resources.testScene.roomFour.art.shell;
    const source=shell.root.children[0];runtime.restartLevel();
    runtime.resources.containmentLevel.teleportToRoomForDebug(4);layer.render();const before={...layer.renderer.info.memory};
    runtime.restartLevel();runtime.resources.containmentLevel.teleportToRoomForDebug(4);layer.render();
    return {same:source===shell.root.children[0],before,after:{...layer.renderer.info.memory},glError:layer.renderer.getContext().getError()};
  });
  await writeFile(`${evidence}/observations.json`,JSON.stringify({initial,samples,restart,errors},null,2));
  for(const sample of samples){
    expect(sample.programs,`${sample.name}: cold shader during lift travel`).toBe(initial.programs);
    expect(sample.retained).toBe(initial.retained);expect(sample.glError).toBe(0);
    if(sample.name.startsWith('edge-')){
      expect(sample.camera[0]).toBeGreaterThan(2.7);expect(sample.camera[0]).toBeLessThan(15.3);
      expect(sample.camera[2]).toBeGreaterThan(79.7);expect(sample.camera[2]).toBeLessThan(91.3);
      expect(Math.abs(sample.playerInView[0])).toBeLessThan(.98);
      expect(Math.abs(sample.playerInView[1])).toBeLessThan(.98);
      expect(sample.playerInView[2]).toBeLessThan(1);
    }
  }
  expect(restart.same).toBe(true);expect(restart.after).toEqual(restart.before);
  expect(restart.glError).toBe(0);expect(errors).toEqual([]);
});
