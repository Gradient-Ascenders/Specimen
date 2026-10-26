/** Matched running-game frames of Goop's escape; explicit seeks are visual evidence. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {finaleTime} from '../src/cinematics/ContainmentFinaleTiming.ts';
const output=resolve(process.argv[2]??'artifacts/evidence/escape-drone/after');
await mkdir(output,{recursive:true});
const server=await preview({configFile:false,preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader',
 '--disable-dev-shm-usage','--renderer-process-limit=1','--num-raster-threads=1','--js-flags=--max-old-space-size=384']});
const page=await browser.newPage({viewport:{width:1120,height:700}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/assets/index-*.js',async route=>{
 const response=await route.fetch(),body=await response.text(),pattern=/=>new ([\w$]+)\(\{host:/;
 if(!pattern.test(body))throw Error('Production Containment runtime factory not found');
 await route.fulfill({response,body:body.replace(pattern,'=>globalThis.__escapeDroneRuntime=new $1({host:')});
});
try{
 const address=server.httpServer.address();
 await page.goto(`http://127.0.0.1:${address.port}/?debug=1`,{waitUntil:'domcontentloaded'});
 console.log('Production menu loaded');
 await page.locator('[data-flow-panel="title"]').getByRole('button',{name:'Select level'}).click({timeout:180000});
 await page.getByRole('button',{name:'Level 1 Containment',exact:true}).click();
 console.log('Containment selected');
 await page.locator('[data-action="skip-opening"]').click({timeout:180000});
 await page.waitForFunction(()=>globalThis.__escapeDroneRuntime?.state==='running'&&globalThis.__escapeDroneRuntime?.resources?.containmentLevel,undefined,{timeout:180000});
 console.log('Containment runtime running');
 await page.evaluate(()=>{
  const r=globalThis.__escapeDroneRuntime;
  if(!r.resources.containmentLevel.beginEndingForDebug())throw Error('Could not stage the original escape controller');
  r.lightLayout.sync();r.input.setEnabled(false);r.host.dataset.gameState='level-completing';
 });
 await page.waitForFunction(()=>globalThis.__escapeDroneRuntime?.finale?.active,undefined,{timeout:180000});
 await page.evaluate(()=>{const r=globalThis.__escapeDroneRuntime;r.renderLayer.setAnimationLoop(null);r.stop();});
 console.log('Running-game Containment finale prepared');
 const results=[];
 for(const [name,time,inspection] of [['reveal',17],['hardware',17,'front'],['rear',17,'rear'],
  ['platform',35],['mounted',50],['acid-hit',59],['wreck',63],['reinforcements',69],['pursuit',76]]){
  const result=await page.evaluate(async({time,inspection})=>{
   const r=globalThis.__escapeDroneRuntime,world=r.resources.testScene,layer=r.renderLayer;
   const seconds=time;
   r.finale.render(seconds);
   if(inspection){
    const p=r.finale.visuals.drones[0].root.position,c=layer.cameraRig.camera;
    c.position.copy(p).add({x:inspection==='front'?-1.6:2,y:1.2,z:inspection==='front'?-3.4:3.2});
    c.lookAt(p);c.fov=48;c.updateProjectionMatrix();c.updateMatrixWorld(true);
   }
   world.withRoomFiveCinematicScope(()=>layer.render());
   const camera=layer.cameraRig.camera,renderer=layer.renderer,lights=[];
   layer.scene.updateWorldMatrix(true,true);
   layer.scene.traverse(o=>{if(o.isLight)lights.push({name:o.name,type:o.type,at:o.matrixWorld.toArray(),
    colour:o.color.toArray(),intensity:o.intensity,visible:o.visible,castShadow:o.castShadow,
    shadow:o.shadow?{size:o.shadow.mapSize.toArray(),bias:o.shadow.bias,normalBias:o.shadow.normalBias}:null});});
   const colliders=world.collisionMeshes.map(o=>({name:o.name,at:o.matrixWorld.toArray(),metadata:o.userData}));
   return {seconds,inspection:inspection??'authored cinematic camera',lights,colliders,
    camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,near:camera.near,far:camera.far},
    rendering:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,
     geometries:renderer.info.memory.geometries,exposure:renderer.toneMappingExposure,shadowType:renderer.shadowMap.type,
     shadowEnabled:renderer.shadowMap.enabled},error:renderer.getContext().getError()};
  },{time:finaleTime(time),inspection});
  await page.screenshot({path:resolve(output,name+'.png')});
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  results.push({name,...result,lightHash:hash(result.lights),colliderHash:hash(result.colliders)});
  console.log('Captured',name,result.rendering.calls,result.rendering.triangles);
 }
 await writeFile(resolve(output,'captures.json'),JSON.stringify({kind:'Running game, staged cinematic seeks; no hardware performance claim',results,errors},null,2));
 if(errors.length)throw Error('Capture browser errors: '+errors.join('; '));
}catch(error){await page.screenshot({path:resolve(output,'failure.png')});throw error;}
finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
