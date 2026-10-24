import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from './fixtures.ts';
import {finishOpening} from '../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

test('recorded duct, Room 2 and Room 3 entry views create no programs after preparation',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:800,height:500});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(settings=>{
    localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
    (window as any).__handoffPrograms=0;
    const create=WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram=function(){(window as any).__handoffPrograms++;return create.call(this);};
  },GRAPHICS_PROFILES.standard.settings);
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    expect(body).toMatch(/\{initialRuntime:([\w$]+)/);
    await route.fulfill({response,body:body.replace(/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__handoffRuntime=$1')});
  });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const result=await page.evaluate(()=>{
    const host=window as any,rt=host.__handoffRuntime,r=rt.resources,layer=rt.renderLayer;
    layer.setAnimationLoop(null);
    const rig=layer.cameraRig,camera=rig.camera,update=rig.update;
    const baseline=host.__handoffPrograms,retained=layer.renderer.info.programs.length;
    const prepared=new Set(layer.renderer.info.programs);
    const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:1/60,frameDeltaSeconds:1/60,
      stepsThisFrame:1,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    const samples=[];
    // Actor/camera positions from the reported hardware capture. Room 1 remains
    // the checkpoint during Room 2 traversal, just as in the original recording.
    const poses=[
      ['duct',1,[-8.797,10.945,25.98],[-8.289,11.671,24.008]],
      ['lower-route',1,[.256,3.26,35.572],[-3.143,5.197,39.649]],
      ['side-jump',1,[4.951,6.21,32.55],[5.439,5.384,27.847]],
      ['sticky-wall',1,[14.215,10.005,39.983],[14.293,4.6,39.287]],
      ['upper-route',1,[7.95,10.31,38.255],[12.774,12.511,38.799]],
      ['exit',2,[0,11.36,48.8],[0,12.5,44]],
      ['room-3-entry',3,[-.159,11.36,51.09],[.543,12.785,45.708]],
      ['reported-hitch',3,[-.243,11.36,51.734],[1.824,12.741,54.31]],
      ['look-back',3,[-.316,11.36,50.974],[.174,13.405,56.132]],
      ['backtrack',3,[0,11.36,47],[0,12.8,43]],
    ] as const;
    try{
      for(const [name,room,body,eye] of poses){
        r.body.teleport({x:body[0],y:body[1],z:body[2]});
        r.testScene.lighting.setActiveRoom(room);
        r.testScene.update(0,r.body.position,r.body.position);
        rig.update=function(...args:any[]){
          update.apply(this,args);camera.position.set(...eye);camera.lookAt(...body);camera.updateMatrixWorld(true);
        };
        for(let frame=0;frame<2;frame++)rt.render(1,stats);
        samples.push({name,created:host.__handoffPrograms,retained:layer.renderer.info.programs.length,
          newPrograms:layer.renderer.info.programs.filter((program:any)=>!prepared.has(program))
            .map((program:any)=>({name:program.name,cacheKey:program.cacheKey})),
          calls:layer.renderer.info.render.calls,triangles:layer.renderer.info.render.triangles,
          geometries:layer.renderer.info.memory.geometries,textures:layer.renderer.info.memory.textures});
      }
    }finally{rig.update=update;}
    return {baseline,retained,samples,glError:layer.renderer.getContext().getError()};
  });
  const evidence='artifacts/evidence/room-two-shader-handoff';await mkdir(evidence,{recursive:true});
  await writeFile(`${evidence}/replay.json`,JSON.stringify({result,errors},null,2));
  for(const sample of result.samples){
    expect(sample.created,`${sample.name}: new WebGL programs during traversal`).toBe(result.baseline);
    expect(sample.retained,`${sample.name}: retained program growth`).toBe(result.retained);
  }
  expect(result.glError).toBe(0);expect(errors).toEqual([]);
});
