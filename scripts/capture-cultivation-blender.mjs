/** Matched art evidence from the actual production runtime and its light layout.
 * Debug staging below is explicitly not an intended-solution playthrough. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from '@playwright/test';

const output=resolve(process.argv[2]??'artifacts/evidence/cultivation-blender/baseline/game');
await mkdir(output,{recursive:true});
const server=await preview({configFile:false,preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage',
  '--renderer-process-limit=1','--num-raster-threads=1','--js-flags=--max-old-space-size=384']});
const page=await browser.newPage({viewport:{width:1120,height:700}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/assets/index-*.js',async route=>{
  const response=await route.fetch(),body=await response.text();
  const pattern=/return new ([\w$]+)\.CultivationLevelRuntime\(/;
  if(!pattern.test(body))throw Error('Production runtime construction not found');
  await route.fulfill({response,body:body.replace(pattern,'return globalThis.__cultivationArtRuntime=new $1.CultivationLevelRuntime(')});
});
try{
  const address=server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/?debug=1`,{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"]').getByRole('button',{name:'Select level'}).click({timeout:180000});
  await page.getByRole('button',{name:'Level 2 Cultivation',exact:true}).click();
  await page.getByRole('button',{name:'Enter Level 2',exact:true}).click({timeout:300000});
  await page.waitForFunction(()=>globalThis.__cultivationArtRuntime?.resources?.authoredPreview,{timeout:300000});
  console.log('Production Cultivation prepared');
  if(process.env.CULTIVATION_HIDE_HUD==='1')await page.addStyleTag({content:'.hud-roster,.hud-objective,.hud-controls,.hud-performance{display:none !important}'});
  await page.evaluate(()=>{const rt=globalThis.__cultivationArtRuntime;rt.renderLayer.setAnimationLoop(null);rt.stop();});
  const views=[
    ['room-1-entry',1,'roomOne',[-11,.66,5.5],[-11,3.2,5.5],[0,8,28]],
    ['room-1-arrival-opening',1,'roomOne',[-11,.66,5.5],[-1.5,16.4,10.5],[-10,20,4]],
    ['room-1-arrival-opening-reverse',1,'roomOne',[-11,.66,5.5],[-15.5,17,1],[-10,20.3,4]],
    ['room-1-arrival-opening-close',1,'roomOne',[-11,.66,5.5],[-7,18.2,8.8],[-10,20,4]],
    ['room-1-pool',1,'roomOne',[-11,.66,5.5],[-12,7,9],[1,9,35]],
    ['room-1-exit',1,'roomOne',[0,.86,46],[1,3,46],[0,3,56]],
    ['room-1-reverse',1,'roomOne',[0,.86,46],[8,5,45],[-9,10,9]],
    ['room-1-join-open',1,'roomOne',[0,.86,48],[.7,1.7,49],[0,2,56],'open-doors'],
    ['room-1-low-corner',1,'roomOne',[-11,.66,5.5],[-17.2,.7,7],[-17.6,.3,8.8]],
    ['room-1-landed',1,'roomOne',[-11,.66,5.5],[-9,3,8],[0,1,33],'released'],
    ['room-1-platform-close',1,'roomOne',[-3,1.06,15.5],[-3,4.3,12.1],[-3,.6,15.5],'released'],
    ['room-1-platform-suspended',1,'roomOne',[-11,.66,5.5],[-7,16.5,11],[-3,13.2,15.5]],
    ['room-1-support-close',1,'roomOne',[-11,.66,5.5],[-5,18.4,12.7],[-3,19.35,15.5]],
    ['room-1-support-burning',1,'roomOne',[-11,.66,5.5],[-5,18.4,12.7],[-3,17.5,15.5],'support-burning'],
    ['room-1-camera-close',1,'roomOne',[0,.86,46],[2.2,4.5,46.8],[3.25,4.1,49.1]],
    ['room-1-sign-close',1,'roomOne',[0,.86,46],[-2,7.5,42],[0,7.7,49.72]],
    ['room-1-wet-bay',1,'roomOne',[-11,.66,5.5],[-9,7.5,10],[-17.7,8,19]],
    ['room-1-service-detail',1,'roomOne',[0,.86,46],[15,7,35.3],[18.75,7.4,38.15]],
    ['room-1-floor-markings',1,'roomOne',[-11,.66,5.5],[-9,3.6,6],[0,.2,8.5]],
    ['room-1-floor-markings-exit',1,'roomOne',[0,.86,46],[0,3.8,46],[0,.2,43.5]],
    ['room-1-grime-detail',1,'roomOne',[-11,.66,5.5],[-15.8,10.5,20],[-19,10.6,21.7]],
    ['room-1-vine-root',1,'roomOne',[-11,.66,5.5],[-16.6,5,16.5],[-18.20,4.18,17.1]],
    ['room-1-harness-close',1,'roomOne',[-11,.66,5.5],[-7,11,11],[-3,12.5,15.5]],
    ['room-1-ceiling-rail',1,'roomOne',[-11,.66,5.5],[-9,18.8,23],[-9,21,26]],
    ['room-1-back-wall',1,'roomOne',[-9,.66,5.5],[0,6,18],[0,7.5,.2]],
    ['room-1-back-wall-close',1,'roomOne',[-9,.66,5.5],[0,7,6],[0,7.8,-.5]],
    ['room-1-door-closed',1,'roomOne',[0,.86,45],[1,3,42.5],[0,2.6,50.5]],
    ['room-1-door-partly-open',1,'roomOne',[0,.86,45],[1,3,42.5],[0,2.6,50.5],'door-partial'],
    ['room-1-door-open',1,'roomOne',[0,.86,48],[1,3,42.5],[0,2.6,53],'open-doors'],
    ['room-1-door-reverse',1,'roomOneToTwoPassage',[0,.86,5],[1,2.7,5],[0,2.5,-2],'open-doors'],
    ['room-1-door-reverse-closed',1,'roomOneToTwoPassage',[0,.86,5],[1,3,7],[0,2.6,.5]],
    ['room-1-exit-wall',1,'roomOne',[0,.86,44],[1,4.6,34],[0,4.6,50]],
    ['passage-1-2-forward',1,'roomOneToTwoPassage',[0,.86,5],[1,2.5,3],[-1,2.5,25]],
    ['passage-1-2-reverse',2,'roomOneToTwoPassage',[0,.86,23],[-1,2.5,25],[1,2.5,2]],
    ['passage-1-2-observation',1,'roomOneToTwoPassage',[0,.86,10],[-1.7,2.8,9],[4.8,3,12.5]],
    ['passage-1-2-service-detail',1,'roomOneToTwoPassage',[0,.86,18.8],[-.8,2.8,17.1],[-4.14,3.05,19.12]],
    ['passage-1-2-ivy-detail',1,'roomOneToTwoPassage',[0,.86,10],[2.9,2.8,9.75],[4.57,3,10.91]],
    ['passage-1-2-decon',1,'roomOneToTwoPassage',[0,.86,18],[.5,2.5,18],[0,3.6,25]],
    ['passage-1-2-floor-edge',1,'roomOneToTwoPassage',[0,.86,18],[-3.35,.7,18],[-3.8,.3,23.5]],
    ['passage-1-2-upper-return',1,'roomOneToTwoPassage',[0,.86,6],[3.3,5.6,6],[3.85,6.35,9.2]],
    ['passage-1-2-upper-seal',1,'roomOneToTwoPassage',[0,.86,7],[2.2,4.4,6],[3.85,5.5,7.5]],
    ['passage-1-2-exit-partial',1,'roomOneToTwoPassage',[0,.86,25],[.5,2.4,24.8],[0,2.8,28.4],'exit-door-partial'],
    ['passage-1-2-room-two-join',1,'roomOneToTwoPassage',[0,.86,25],[.6,1.7,26],[0,2,32],'open-doors'],
    ['passage-1-2-room-one-join',1,'roomOneToTwoPassage',[0,.86,3],[-.6,1.7,2],[0,2,-4],'open-doors'],
    ['room-2-entry',2,'roomTwo',[0,.66,3],[8,5,4],[-5,13,28]],
    ['room-2-adhesion',2,'roomTwo',[0,.66,3],[-10,9,8],[-18,13,25]],
    ['room-2-adhesive-close',2,'roomTwo',[0,.66,3],[-16.9,6.3,12.3],[-18.63,6.4,12.4]],
    ['room-2-adhesive-grazing',2,'roomTwo',[0,.66,3],[-18.1,7.2,14.4],[-18.63,6.3,10.8]],
    ['room-2-vent-adhesive',2,'roomTwo',[0,.66,3],[10.2,18,42.3],[8,17.4,44.72]],
    ['room-2-exit',2,'roomTwo',[0,.66,42],[10,9,39],[-4,12,18]],
    ['room-2-calibration',2,'roomTwo',[0,.66,3],[5,8,7],[19,7,24]],
    ['room-2-process-detail',2,'roomTwo',[0,.66,10],[16.3,5.3,10.5],[20,5.2,12]],
    ['room-2-platform-close',2,'roomTwo',[0,.66,3],[-15,16.5,26],[-11.5,12.8,30],'released'],
    ['room-2-load-assembly',2,'roomTwo',[0,.66,3],[-15,21.8,27],[-11.5,23.1,30]],
    ['room-2-beam-close',2,'roomTwo',[0,.66,3],[-13.2,20.9,28.4],[-11.5,21.4,30]],
    ['room-2-support-burning',2,'roomTwo',[0,.66,3],[-15,21.8,27],[-11.5,23.1,30],'support-burning'],
    ['room-2-beam-landed',2,'roomTwo',[0,.66,3],[-15,17,27],[-11.5,18,30],'released'],
    ['room-2-button-close',2,'roomTwo',[0,.66,3],[-14.5,14.6,26.2],[-18.5,14.2,28.5]],
    ['room-2-high-join',2,'roomTwo',[8,19.46,43],[8,20,43.2],[8,20,51]],
    ['room-2-low-grazing',2,'roomTwo',[0,.66,3],[18.2,.65,3],[18.7,.8,11]],
    ['room-2-camera-close',2,'roomTwo',[-16,14,32],[-15.6,16,32.6],[-18.3,15.5,33.6]],
    ['passage-2-3-forward',2,'roomTwoToThreeGoopPassage',[0,.86,5],[1,2.5,3],[-1,3,25]],
    ['passage-2-3-reverse',3,'roomTwoToThreeGoopPassage',[0,.86,23],[-1,2.5,25],[1,2.5,2]],
    ['passage-2-3-fan-detail',2,'roomTwoToThreeGoopPassage',[0,.86,3],[.8,3,9],[3.7,3.05,12]],
    ['passage-2-3-service-detail',2,'roomTwoToThreeGoopPassage',[0,.86,3],[.8,2.8,18.5],[-4,3,20]],
    ['passage-2-3-ivy-detail',2,'roomTwoToThreeGoopPassage',[0,.86,3],[.8,2.9,12.8],[3.7,3.1,13.75]],
    ['passage-2-3-floor-edge',2,'roomTwoToThreeGoopPassage',[0,.86,3],[-3,.45,6],[-3.4,.16,8]],
    ['passage-2-3-ceiling-return',2,'roomTwoToThreeGoopPassage',[0,.86,3],[3.1,5.9,18],[3.65,6.43,21]],
    ['passage-2-3-room-two-join',2,'roomTwoToThreeGoopPassage',[0,.86,4],[.5,1.7,2],[0,2,-4],'open-doors'],
    ['passage-2-3-room-three-join',2,'roomTwoToThreeGoopPassage',[0,.86,24],[.5,1.7,26],[0,2,32],'open-doors'],
    ['passage-2-3-entry-partial',2,'roomTwoToThreeGoopPassage',[0,.86,4],[.5,2.4,3],[0,2.8,.5],'connector-entry-partial'],
    ['passage-2-3-exit-partial',2,'roomTwoToThreeGoopPassage',[0,.86,24],[.5,2.4,25],[0,2.8,27.5],'connector-exit-partial'],
    ['bob-duct-forward',2,'roomTwoToThreeBobAirDuct',[0,.66,4],[0,1,3],[0,1,26]],
    ['bob-duct-reverse',3,'roomTwoToThreeBobAirDuct',[0,.66,24],[0,1,25],[0,1,1]],
    ['bob-duct-clear-forward',2,'roomTwoToThreeBobAirDuct',[0,.66,1],[0,1,3],[0,1,26]],
    ['bob-duct-grille-detail',2,'roomTwoToThreeBobAirDuct',[0,.66,3],[-.2,1.1,7.8],[1.4,1.1,9.5]],
    ['bob-duct-upper-corner',2,'roomTwoToThreeBobAirDuct',[0,.66,3],[.75,1.7,10],[1.15,2.2,12]],
    ['bob-duct-room-two-join',2,'roomTwoToThreeBobAirDuct',[0,.66,5],[0,1.1,3],[0,1.1,-5]],
    ['bob-duct-room-three-join',3,'roomTwoToThreeBobAirDuct',[0,.66,3],[0,1.1,26],[0,1.1,33]],
    ['bob-duct-entry-biofilm',2,'roomTwoToThreeBobAirDuct',[0,.66,4],[0,1.2,2.3],[0,0,.75]],
    ['bob-duct-entry-corner',2,'roomTwoToThreeBobAirDuct',[0,.66,5],[0,1.1,1],[.98,2.08,.2]],
    ['room-3-entry',3,'roomThree',[0,.66,3],[1,5,3],[0,13,46]],
    ['room-3-cover',3,'roomThree',[0,.66,3],[0,7,14],[5,3,31]],
    ['room-3-upper',3,'roomThree',[0,.66,3],[-12,24,18],[4,23,55]],
    ['room-3-lift-join',3,'roomThree',[0,.66,72],[1,3,71],[0,3,82]],
    ['room-3-hood',3,'roomThree',[0,.66,68],[-5,13,54],[0,19,72]],
    ['room-3-lift-join-open',3,'roomThree',[0,.66,73],[.7,2,74],[0,2,81],'open-doors'],
    ['room-3-low-grazing',3,'roomThree',[0,.66,68],[23.2,.8,67],[23.7,.5,71]],
    ['room-3-released',3,'roomThree',[0,.66,3],[0,7,14],[5,3,31],'released'],
    ['room-3-camera-close',3,'roomThree',[0,.66,68],[1.6,7.8,68.5],[0,7.4,71.2]],
    ['room-3-cover-decon',3,'roomThree',[0,.66,3],[6,4,2.6],[0,2.2,7]],
    ['room-3-cover-freezer',3,'roomThree',[0,.66,3],[-6,3,3.3],[-10,1.9,9]],
    ['room-3-cover-pressure',3,'roomThree',[0,.66,3],[14,3.3,8.2],[9,2.1,13.5]],
    ['room-3-cover-analysis',3,'roomThree',[0,.66,3],[-7.9,3.2,14.4],[-13,1.7,20]],
    ['room-3-cover-drawers',3,'roomThree',[0,.66,3],[9,3.2,19],[5,2.1,25]],
    ['room-3-cover-centrifuge',3,'roomThree',[0,.66,3],[11,3,24],[15,1.9,30.4]],
    ['room-3-cover-server',3,'roomThree',[0,.66,3],[-2,3.5,30.3],[-7,2.2,37]],
    ['room-3-cover-hatch',3,'roomThree',[0,.66,3],[15,3,37],[10,1.7,43]],
    ['room-3-entry-reverse',3,'roomThree',[0,.66,3],[.5,2,4],[0,2,-4],'open-doors'],
    ['room-3-vent-reverse',3,'roomThree',[8,19.46,1],[8,19.8,3],[8,19.8,-5]],
    ['room-3-exit-reverse',3,'roomThree',[0,.66,72],[.5,2,75],[0,3,64],'open-doors'],
    ['room-3-first-biofilm',3,'roomThree',[0,.66,3],[3,23,10],[1,22,18],'released'],
    ['room-3-central-biofilm',3,'roomThree',[0,.66,3],[-6,25,30],[-13,24,35.5],'released'],
    ['room-3-final-biofilm',3,'roomThree',[0,.66,3],[8,29,45],[3,25.7,51],'released'],
    ['room-3-first-metal-landing',3,'roomThree',[0,.66,3],[1,26,22],[1,23.95,18.7],'released'],
    ['room-3-final-metal-landing',3,'roomThree',[0,.66,3],[3,27.5,56],[3,25.75,51.7],'released'],
    ['room-3-support-close',3,'roomThree',[0,.66,3],[-2,27.7,20],[-8,29.8,24]],
    ['room-4-board',4,'roomFour',[0,.66,4],[0,4,2],[0,4,13]],
    ['room-4-reverse',4,'roomFour',[0,.66,9],[4,4,12],[0,5,-2]],
    ['room-4-mid-descent',4,'roomFour',[0,.66,9],[0,3,8],[4.8,5,12],'lift-mid'],
    ['room-4-arrival',4,'roomFour',[0,.66,10],[0,1.5,12],[0,1.4,20],'lift-arrived'],
    ['room-4-low-grazing',4,'roomFour',[0,.66,9],[4.2,.5,6.3],[4.9,.8,13]],
    ['room-5-entry-ducts',5,'roomFive',[-1,.86,9.1],[-2,2,4],[13,2,12]],
    ['room-5-chamber',5,'roomFive',[-12,10.66,23],[-12,13,20],[0,26,50]],
    ['room-5-reverse',5,'roomFive',[-12,10.66,23],[7,30,62],[-11,14,20]],
    ['room-5-pod',5,'roomFive',[0,29.66,30],[7,31,40],[0,25,49]],
    ['room-5-sewer',5,'roomFive',[40,-9,30],[40,-8,24],[40,-9,85]],
    ['room-5-controls',5,'roomFive',[40,-9,115],[44,-8,113],[40,-9,125]],
    ['room-5-shared-vent',5,'roomFive',[0,.66,4],[0,1.25,1],[0,1.25,8]],
    ['room-5-fork-bob',5,'roomFive',[-1,.66,9.1],[0,1.25,9.1],[-12,1.3,9.1]],
    ['room-5-fork-goop',5,'roomFive',[1,.66,9.1],[2,1.25,9.1],[40,1.3,9.1]],
    ['room-5-bob-shaft',5,'roomFive',[-12,.66,14],[-12,1.3,13],[-12,10.8,17.7]],
    ['room-5-bob-lip',5,'roomFive',[-12,10.46,19],[-12,10.9,18.7],[-12,11,24]],
    ['room-5-bob-lip-reverse',5,'roomFive',[-12,10.46,22],[-12,11.3,22],[-12,10.8,16]],
    ['room-5-goop-drop',5,'roomFive',[40,.66,18],[40,1.2,17.4],[40,-7,20]],
    ['room-5-vault-drop',5,'roomFive',[40,-11.5,24],[40,-6,25],[40,-1.7,20]],
    ['room-5-sewer-reverse',5,'roomFive',[44,-10.74,115],[44,-8,113],[40,-7,20]],
    ['room-5-sewer-grazing',5,'roomFive',[47,-10.74,49],[49,-10.3,48],[49.6,-8.2,56]],
    ['room-5-switch-close',5,'roomFive',[44,-10.74,122],[44,-9,122],[46.7,-9.5,122]],
    ['room-5-return-open',5,'roomFive',[35,-10.74,124],[34,-8.5,124],[26,-8.5,124],'rescued'],
    ['room-5-return-aperture',5,'roomFive',[35,-10.74,124],[33,-6.4,124],[26,-8.6,124],'rescued'],
    ['room-5-return-reverse',5,'roomFive',[28,-10.74,124],[28,-8.8,124],[37,-8.8,124],'rescued'],
    ['room-5-ramp',5,'roomFive',[25,-10.2,117],[25,-8.9,116],[25,-2,79],'rescued'],
    ['room-5-ramp-exit',5,'roomFive',[25,.66,63],[25,1.8,65],[25,-1.8,86],'rescued'],
    ['room-5-crown-grazing',5,'roomFive',[-12,10.66,23],[-19.4,30,30],[-19.9,37.8,39]],
    ['room-5-pressure-bulkhead',5,'roomFive',[-12,10.66,23],[7,29,69],[0,27,79.8]],
    ['room-5-escape-mouth',5,'roomFive',[17,29,61.5],[17.7,29.2,61.5],[26,29.2,61.5],'escape'],
    ['room-5-escape-airway',5,'roomFive',[24,29,61.5],[23,29.1,61.5],[43,29.1,61.5],'escape'],
    ['room-5-escape-reverse',5,'roomFive',[35,29,61.5],[35,29.1,61.5],[20,29.1,61.5],'escape'],
    ['room-5-escape-branch',5,'roomFive',[27,29,67],[27,29.1,69],[27,29.1,60],'escape'],
    ['room-5-escape-inspection',5,'roomFive',[48,29,61.5],[48,29.4,61.5],[48,30.5,53.1],'escape'],
    ['room-5-escape-drop',5,'roomFive',[42,25,61.5],[42,23,61.5],[42,-2,61.5],'escape'],
  ];
  const results=[];
  for(const [name,room,owner,body,eye,target,state]of views){
    if(process.env.CULTIVATION_VIEW_FILTER&&!process.env.CULTIVATION_VIEW_FILTER.split(',').some(filter=>name.includes(filter)))continue;
    const result=await page.evaluate(async({name,room,owner,body,eye,target,state})=>{
      const rt=globalThis.__cultivationArtRuntime,r=rt.resources,layer=rt.renderLayer,p=r.authoredPreview;
      rt.teleportToAuthoredPreviewRoom(room);
      if(state==='open-doors')for(const door of [...p.roomOneToTwoPassage.doors,...p.roomTwoToThreeGoopPassage.doors,p.roomFour.entrance]){
        door.setLocked(false);const centre=door.root.getWorldPosition(r.pair.bobBody.position.clone());centre.y+=1;
        door.update(2,[{id:'bob',position:centre,radiusMetres:.45}]);
      }
      if(state==='door-partial'||state==='exit-door-partial'){
        const door=state==='exit-door-partial'?p.roomOneToTwoPassage.exitDoor:p.roomOneToTwoPassage.entryDoor;door.setLocked(false);
        const centre=door.root.getWorldPosition(r.pair.bobBody.position.clone());centre.y+=1;
        door.update(.24,[{id:'bob',position:centre,radiusMetres:.45}]);
      }
      if(state==='connector-entry-partial'||state==='connector-exit-partial'){
        const door=state==='connector-entry-partial'?p.roomTwoToThreeGoopPassage.entryDoor:p.roomTwoToThreeGoopPassage.exitDoor;
        door.setLocked(false);const centre=door.root.getWorldPosition(r.pair.bobBody.position.clone());centre.y+=1;
        door.update(.24,[{id:'goop',position:centre,radiusMetres:.45}]);
      }
      if(state==='support-burning'){
        const target=r.previewDissolveTargets.find(target=>target.mesh.name===(room===2?
          'cultivation-room-2-block-1-soluble-wooden-brace':'cultivation-room-1-platform-1-soluble-rope'));
        target.advance(target.dissolveDurationSeconds*.45);
      }
      if(state==='released'){
        for(const target of r.previewDissolveTargets)if(target.mesh.userData.roomId===room)target.advance(target.dissolveDurationSeconds);
        if(room===1)p.roomOne.update(2);if(room===2)p.roomTwo.update(2,[]);if(room===3)p.roomThree.update(2,[]);
      }
      if(state==='lift-mid'||state==='lift-arrived'){
        const occupants=['bob','goop'].map((id,i)=>({id,radiusMetres:.45,
          position:p.roomFour.root.localToWorld(r.pair.bobBody.position.clone().set(i?2:-2,.66,9))}));
        p.roomFour.update(1.5,occupants);p.roomFour.update(state==='lift-mid'?25:60,occupants);
        if(state==='lift-arrived')p.roomFour.update(1.5,occupants);
      }
      if(state==='rescued')p.roomFive.restoreCheckpoint('rescued');
      if(state==='escape')p.voltFinaleSet.annex.visible=true;
      const root=p[owner].root;
      r.pair.bobBody.teleport(root.localToWorld(r.pair.bobBody.position.clone().set(...body)));
      p.root.updateWorldMatrix(true,true);
      const camera=layer.cameraRig.camera,update=layer.cameraRig.update;
      layer.cameraRig.update=function(){camera.position.copy(root.localToWorld(camera.position.clone().set(...eye)));
        camera.lookAt(root.localToWorld(camera.position.clone().set(...target)));camera.updateMatrixWorld(true);};
      const stats={fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
      try{
        rt.render(1,stats);
        await rt.preparationQueue.prepareCurrent(!!r.scene.root.userData.darkRoomLighting);
        rt.render(1,stats);
        return{name,state:state??'initial',calls:layer.renderer.info.render.calls,triangles:layer.renderer.info.render.triangles,
          memory:{...layer.renderer.info.memory},programs:layer.renderer.info.programs.length,
          lighting:{exposure:layer.renderer.toneMappingExposure,shadowType:layer.renderer.shadowMap.type,
            shadowEnabled:layer.renderer.shadowMap.enabled,dark:!!r.scene.root.userData.darkRoomLighting},
          camera:camera.position.toArray(),error:layer.renderer.getContext().getError()};
      }finally{layer.cameraRig.update=update;}
    },{name,room,owner,body,eye,target,state});
    await page.screenshot({path:resolve(output,name+'.png')});results.push(result);console.log('Captured',name,result.calls,result.triangles);
  }
  await writeFile(resolve(output,'captures.json'),JSON.stringify({kind:'Real production runtime; staged debug poses for visual inspection, not intended-route evidence',renderer:'Chromium SwiftShader; no hardware-performance claim',results,errors},null,2));
  if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();await server.httpServer.close();}
