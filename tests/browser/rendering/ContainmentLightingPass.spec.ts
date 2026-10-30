import { exposeGame } from '../../helpers/GameRuntime.ts';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from '../../helpers/BrowserFixtures.ts';
import {finishOpening} from '../../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../../src/render/GraphicsProfiles.ts';

test('all five authored rooms render prepared lighting through travel and restart',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize(process.env.CONTAINMENT_LIGHTING_1080==='1'?{width:1920,height:1080}:process.env.CONTAINMENT_LIGHTING_PROFILE==='ultra'?{width:640,height:400}:{width:960,height:600});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  await page.addInitScript(settings=>{
    localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
    (window as any).__lightingPrograms=0;
    const create=WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram=function(){(window as any).__lightingPrograms++;return create.call(this);};
  },GRAPHICS_PROFILES[process.env.CONTAINMENT_LIGHTING_PROFILE==='ultra'?'ultra':process.env.CONTAINMENT_LIGHTING_PROFILE==='high'?'high':'standard'].settings);
  await exposeGame(page, { runtime: '__lightingRuntime' });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const initial=await page.evaluate(()=>{
    const runtime=(window as any).__lightingRuntime,layer=runtime.renderLayer;
    layer.setAnimationLoop(null);
    (window as any).__preparedLightingPrograms=new Set(layer.renderer.info.programs);
    return {programs:(window as any).__lightingPrograms,retained:layer.renderer.info.programs.length,
      preparation:runtime.lightingPrewarmProfile,prime:runtime.resources.testScene.measuredFirstUseGeometryPrimeDiagnostics,
      lightingArt:runtime.resources.testScene.lightingArt?.diagnostics,
      radiance:runtime.resources.testScene.radiance?.diagnostics,
      shafts:runtime.resources.testScene.lighting.shafts?.diagnostics,
      shadowType:layer.renderer.shadowMap.type};
  });
  const samples=[];
  let poses:[string,number,number[],number][]=[
    ['room-1-chamber',1,[1.8,.46,-3.3],Math.PI-.25],
    ['room-1-workstations',1,[4.2,.46,-.5],-Math.PI/2],
    ['room-2-route',2,[-8,3.26,34],Math.PI-.3],
    ['room-3-basin',3,[2.7885,11.6132,57.6261],Math.PI-.3],
    ['room-3-high-route',3,[5,24.41,62.839],Math.PI],
    ['room-4-ascent',4,[9,53,85.5],Math.PI/2],
    ['room-5-cell',5,[3.9,75.21,101.5],Math.PI-.4],
    ['room-5-lockdown',5,[.084,77.397,102.793],Math.PI],
    ['room-5-observation',5,[-10,97.96,129.6],Math.PI],
  ];
  if(process.env.CONTAINMENT_LIGHTING_PROFILE==='ultra')poses=poses.filter(p=>!['room-1-workstations','room-3-high-route','room-5-lockdown','room-5-observation'].includes(p[0]));
  poses.push(['room-2-3-handoff',2,[0,12,49],Math.PI]);
  if(process.env.CONTAINMENT_LIGHTING_QUALITY_ONLY==='1')poses=poses.filter(p=>p[0]==='room-5-cell');
  const evidence=`artifacts/evidence/containment-lighting/${process.env.LIGHTING_CAPTURE_PHASE??'after'}`;
  await mkdir(evidence,{recursive:true});
  for(const [name,roomId,position,yaw] of poses){
    const sample=await page.evaluate(({name,roomId,position,yaw})=>{
      const host=window as any,runtime=host.__lightingRuntime,r=runtime.resources,scene=r.testScene,layer=runtime.renderLayer;
      r.containmentLevel.teleportToRoomForDebug(roomId);
      if(roomId>=4){scene.roomFour.elevator.begin();scene.roomFour.updateActive(roomId===4?27:50,{position:{x:1000,y:1000,z:1000},radiusMetres:.45},[]);}
      if(roomId===4)position[1]=scene.roomFour.elevatorPlatform.position.y+scene.roomFour.elevatorPlatform.size.y/2+.46;
      r.body.teleport({x:position[0],y:position[1],z:position[2]});scene.lighting.setActiveRoom(roomId);
      scene.update(0,r.body.position,r.body.position);runtime.retargetCameraToActiveSlime(r);
      layer.cameraRig.reset();layer.cameraRig.setGroundOrbitYawRadians(yaw);runtime.syncContextualCamera(r);
      const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:.08,frameDeltaSeconds:.08,stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
      for(let frame=0;frame<5;frame++)runtime.render(1,stats);
      const renderer=layer.renderer;
      let cullingChangedChannels:number|undefined;
      if(roomId===5){
        const gl=renderer.getContext(),branches=scene.lowerFloorOccludedBranches;
        const pixels=()=>{
          scene.withEnclosedRoomOcclusion(r.body.position,layer.cameraRig.camera.position,()=>layer.render());
          const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;
        };
        try{
          // Compare the new atrium scope to its previous behaviour while
          // keeping the pre-existing completed-pod mask and frame state.
          scene.lowerFloorOccludedBranches=[];pixels();const full=pixels();
          scene.lowerFloorOccludedBranches=branches;const scoped=pixels();
          cullingChangedChannels=full.reduce((count,value,i)=>count+Number(value!==scoped[i]),0);
        }finally{scene.lowerFloorOccludedBranches=branches;}
      }
      return {name,programs:host.__lightingPrograms,cold:renderer.info.programs.filter((p:any)=>!host.__preparedLightingPrograms.has(p)).map((p:any)=>({name:p.name,key:p.cacheKey})),
        cullingChangedChannels,
        lighting:scene.lightingDiagnostics,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,glError:renderer.getContext().getError(),
        camera:layer.cameraRig.camera.position.toArray(),png:layer.canvas.toDataURL('image/png').split(',')[1]};
    },{name,roomId,position,yaw});
    await writeFile(`${evidence}/${name}.png`,Buffer.from(sample.png,'base64'));samples.push({...sample,png:undefined});
  }
  const qualitySwitches=[];
  if(process.env.CONTAINMENT_LIGHTING_QUALITY_ONLY==='1'){
    for(const profile of ['minimum','high','ultra','high'] as const){
      const switched=await page.evaluate(settings=>{
        const runtime=(window as any).__lightingRuntime,layer=runtime.renderLayer,r=runtime.resources;
        layer.setGraphicsSettings(settings);
        // Exercise the resource transition directly. Startup already covers
        // the full hidden prewarm; these draws must allocate valid sampler
        // types for formerly dormant maps and restore Ultra's cached programs.
        r.containmentLevel.teleportToRoomForDebug(5);r.body.teleport({x:3.9,y:75.21,z:101.5});
        r.testScene.update(0,r.body.position,r.body.position);runtime.retargetCameraToActiveSlime(r);
        const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:.08,frameDeltaSeconds:.08,stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
        runtime.render(1,stats);runtime.render(1,stats);
        return {profile:settings.graphicsProfile,type:layer.renderer.shadowMap.type,error:layer.renderer.getContext().getError()};
      },GRAPHICS_PROFILES[profile].settings);
      qualitySwitches.push(switched);expect(switched.error).toBe(0);expect(switched.type).toBe(profile==='ultra'?0:1);
    }
  }
  const restart=await page.evaluate(()=>{const r=(window as any).__lightingRuntime;r.restartLevel();return {ready:r.resources.testScene.roomFive.art.shell.ready,error:r.renderLayer.renderer.getContext().getError()};});
  await writeFile(`${evidence}/observations.json`,JSON.stringify({initial,samples,qualitySwitches,restart,errors},null,2));
  expect(initial.prime.resourcesPrimed).toBe(true);
  if(process.env.LIGHTING_CAPTURE_PHASE!=='before'){
    expect(initial.lightingArt.ready).toBe(true);expect(initial.lightingArt.textureCount).toBe(0);
    expect(initial.lightingArt.shadowTriangles).toBeLessThanOrEqual(6000);
  }
  expect(initial.radiance.ready).toBe(true);expect(initial.radiance.probes).toBe(2251);
  expect(initial.radiance.textureCount).toBe(2);expect(initial.radiance.runtimeCaptures).toBe(0);
  expect(initial.radiance.textureBytes).toBeLessThan(4_000_000);
  expect(initial.shafts.extraShadowMaps).toBe(0);expect(initial.shafts.fullScreenPasses).toBe(0);
  expect(initial.shadowType).toBe(process.env.CONTAINMENT_LIGHTING_PROFILE==='ultra'?0:1);
  for(const sample of samples){expect(sample.glError,sample.name).toBe(0);expect(sample.programs,`${sample.name}: cold program`).toBe(initial.programs);
    if(sample.cullingChangedChannels!==undefined)expect(sample.cullingChangedChannels,`${sample.name}: atrium culling pixels`).toBe(0);}
  expect(restart.ready).toBe(true);expect(restart.error).toBe(0);expect(errors).toEqual([]);
});
