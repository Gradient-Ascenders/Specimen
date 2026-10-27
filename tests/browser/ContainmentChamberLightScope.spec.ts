import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test} from './fixtures.ts';
import {finishOpening} from '../helpers/OpeningHandoff.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

test('Room 1 keeps prepared chamber and vent lighting through looking, climbing, retreat and restart',async({page})=>{
  test.setTimeout(300_000);await page.setViewportSize({width:960,height:600});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(settings=>{
    localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
    (window as any).__chamberPrograms=0;
    const create=WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram=function(){(window as any).__chamberPrograms++;return create.call(this);};
  },GRAPHICS_PROFILES.standard.settings);
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();expect(body).toMatch(/\{initialRuntime:([\w$]+)/);
    await route.fulfill({response,body:body.replace(/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__chamberRuntime=$1')});
  });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  const result=await page.evaluate(()=>{
    const host=window as any,rt=host.__chamberRuntime,r=rt.resources,scene=r.testScene,layer=rt.renderLayer;
    layer.setAnimationLoop(null);
    const camera=layer.cameraRig.camera,update=layer.cameraRig.update,draw=layer.render;
    const baseline=host.__chamberPrograms,layout=rt.lightLayout,scope=layout.withRoomOneView;
    const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:1/60,frameDeltaSeconds:1/60,
      stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
    const lights:any[]=[];scene.lighting.root.traverse((o:any)=>{if(o.isSpotLight&&o.name.startsWith('room-1-'))lights.push(o);});
    const maps=lights.map(light=>light.shadow.map?.texture.uuid);
    let selected={spots:0,key:''};
    layer.render=function(){
      let spots=0;this.scene.traverseVisible((o:any)=>{if(o.isSpotLight)spots++;});
      selected={spots,key:layout.cameraCullKey};return draw.call(this);
    };
    const poses=[
      ['chamber',[1.8,.46,-3.3],[2.375,1.565,-5.55],[1.8,.8,-3.3],3],
      ['look into vent',[0,.46,-2.6],[0,1.7,-4],[-4.8,5.9,5.9],10],
      ['climb approach',[-4.8,4.6,5],[-4.8,4.2,2.7],[-4.8,5.9,6],10],
      ['vent entry',[-4.8,5.7,6.5],[-4.8,6.2,3.6],[-4.8,6,7],10],
      ['low duct',[-4.8,5.7,10.5],[-4.8,6.25,7],[-4.8,5.9,11.5],10],
      ['retreat trailing camera',[-4.8,4.4,5.1],[-4.8,6,6.5],[-4.8,4.4,5.1],10],
      ['turn away',[0,.46,-2.6],[0,1.7,-4],[1,.8,0],3],
    ] as const;
    const samples=[];
    try{
      layer.cameraRig.update=()=>{};
      for(const[name,body,eye,target,expected]of poses){
        r.body.teleport({x:body[0],y:body[1],z:body[2]});scene.lighting.setActiveRoom(1);scene.update(0,r.body.position,r.body.position);
        camera.position.set(...eye);camera.lookAt(...target);camera.updateMatrixWorld(true);
        rt.render(1,stats);rt.render(1,stats);
        samples.push({name,expected,...selected,programs:host.__chamberPrograms,error:layer.renderer.getContext().getError()});
      }
      // The chosen chamber scope must preserve the original full-rig image.
      r.body.teleport({x:1.8,y:.46,z:-3.3});scene.update(0,r.body.position,r.body.position);
      camera.position.set(2.375,1.565,-5.55);camera.lookAt(1.8,.8,-3.3);camera.updateMatrixWorld(true);
      const gl=layer.renderer.getContext();
      const read=()=>{rt.render(1,stats);const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
      const scoped=read();layout.withRoomOneView=(_p:any,_c:any,render:()=>unknown)=>render();
      const full=read();let maxDifference=0,changed=0;
      for(let i=0;i<full.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(full[i+c]-scoped[i+c]));
        maxDifference=Math.max(maxDifference,d);if(d>1)changed++;}
      layout.withRoomOneView=scope;
      layer.cameraRig.update=update;
      rt.restartLevel();rt.render(1,stats);rt.render(1,stats);
      return {baseline,samples,pixels:{maxDifference,changed},maps,restartMaps:lights.map(light=>light.shadow.map?.texture.uuid),
        restart:{...selected,programs:host.__chamberPrograms,error:gl.getError()},preparation:rt.levelOnePrewarmVerification};
    }finally{layout.withRoomOneView=scope;layer.cameraRig.update=update;layer.render=draw;}
  });
  const directory='artifacts/evidence/room-one-light-scope';await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/observations.json`,JSON.stringify({result,errors},null,2));
  expect(result.preparation.roomOneChamberPrepared).toBe(true);
  for(const sample of result.samples){expect(sample.spots,sample.name).toBe(sample.expected);expect(sample.programs,sample.name).toBe(result.baseline);expect(sample.error,sample.name).toBe(0);}
  expect(result.pixels.maxDifference).toBeLessThanOrEqual(1);expect(result.pixels.changed).toBe(0);
  expect(result.maps).toHaveLength(7);expect(result.maps.every(Boolean)).toBe(true);expect(result.restartMaps).toEqual(result.maps);
  expect(result.restart.spots).toBe(3);expect(result.restart.programs).toBe(result.baseline);expect(result.restart.error).toBe(0);expect(errors).toEqual([]);
});
