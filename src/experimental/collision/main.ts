import * as THREE from 'three';
import { Loop } from '../../core/Loop.ts';
import { GroundView } from '../ground/GroundView.ts';
import { DeformableBody } from '../ground/DeformableBody.ts';
import { CageWorldContacts } from './CageWorldContacts.ts';
import { COLLISION_SCENARIOS } from './CollisionLabScenes.ts';
import { CollisionLabSession, type CollisionMode } from './CollisionLabSession.ts';
import '../ground/ground.css';

document.querySelector('#app')!.innerHTML=`
  <section id="room"><header><h1>Collision / bounded deformation</h1>
    <p>WASD / arrows · release to brake · Shift coast<br>R reset · P pause · no jump or adhesion</p></header>
    <div id="legend">Cage nodes and links are the physical body.<br>Orange marks: measured world contacts · white: tracked material</div></section>
  <aside aria-label="Collision lab controls">
    <p><a href="./ground-lab.html">Open accepted ground lab / A–B reference</a></p>
    <label>Test environment<select id="scenario">${COLLISION_SCENARIOS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
    <p id="description" class="hint"></p>
    <label>Controller / body<select id="controller"><option value="finite-cage">Deformable cage · finite collision</option>
      <option value="plane-reference">Accepted cage · original plane contact</option><option value="kinematic">Original KinematicBody · finite boxes</option></select></label>
    <div class="buttons"><button id="reset">Reset (R)</button><button id="pause">Pause (P)</button><button id="step">One tick</button></div>
    <label>View<select id="view"><option value="oblique">Oblique 3D</option><option value="side">Side · X travel</option><option value="top">Top · X/Z travel</option></select></label>
    <label>Camera distance<select id="distance"><option value="1">Close material inspection</option><option value="1.7" selected>Course context</option><option value="2.5">Wide overview</option></select></label>
    <p>Accepted ground material · v1</p><p class="hint">Stretch 13× · bend 25.25× · diameter 16×<br>Damping 13 · friction .90<br>Angular speed 7.78 · acceleration 85<br>Volume compliance 2e-6 · material locked</p>
    <label><input id="ice" type="checkbox"> Zero-friction diagnostic (resets)</label>
    <label><input id="internals" type="checkbox"> Internal constraints</label>
    <label><input id="contacts" type="checkbox" checked> World contact points</label>
    <div class="buttons"><button id="demo">Reversal tape · 10 s</button><button id="record">Record from reset</button><button id="replay" disabled>Replay last tape</button></div>
    <p id="status" role="status"></p><pre id="metrics"></pre><pre id="collision-metrics"></pre>
    <p class="hint">High-speed and compressed-start scenarios are diagnostic initial states, not player abilities. The original KinematicBody comparator does not receive those cage-only initial states.</p>
    <p id="error" role="alert"></p>
  </aside>`;
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const session=new CollisionLabSession(), view=new GroundView(get('room'));
view.followHeight=true;view.showContacts=false;view.showFloorGrid=false;
view.cameraDistance=1.7;
view.scene.add(session.scene.root);
const contactGeometry=new THREE.BufferGeometry();
const contactPositions=new THREE.Float32BufferAttribute(new Float32Array(512*3),3).setUsage(THREE.DynamicDrawUsage);
contactGeometry.setAttribute('position',contactPositions);contactGeometry.setDrawRange(0,0);
const contactPoints=new THREE.Points(contactGeometry,new THREE.PointsMaterial({color:0xffb067,size:.045,depthTest:false}));
contactPoints.frustumCulled=false;contactPoints.renderOrder=3;view.scene.add(contactPoints);
const keys=new Set<string>();let paused=false,alive=true;
const clearInput=()=>keys.clear();
const sample=()=>({x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),
  z:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),coast:keys.has('ShiftLeft')||keys.has('ShiftRight')});
function controls(){
  get<HTMLSelectElement>('scenario').value=session.scene.definition.id;
  get<HTMLSelectElement>('controller').value=session.mode;
  get<HTMLOptionElement>('controller').querySelector<HTMLOptionElement>('[value="plane-reference"]')!.disabled=session.scene.definition.id!=='flat';
  get('description').textContent=session.scene.definition.description;
  get<HTMLInputElement>('ice').checked=session.friction===0;
  get<HTMLInputElement>('ice').disabled=session.mode==='kinematic';
  get('pause').textContent=paused?'Resume (P)':'Pause (P)';
  get<HTMLButtonElement>('pause').disabled=get<HTMLButtonElement>('step').disabled=session.state==='finished';
  get('record').textContent=session.state==='recording'?'Stop recording':'Record from reset';
  get<HTMLButtonElement>('replay').disabled=!session.saved;
}
function resetView(){clearInput();paused=false;view.resetTrail();view.scene.add(session.scene.root);get('error').textContent='';controls();}
function configure(){session.configure(get<HTMLSelectElement>('scenario').value,get<HTMLSelectElement>('controller').value as CollisionMode,get<HTMLInputElement>('ice').checked?0:.9);resetView();}
function reset(){session.reset();resetView();}
function togglePause(){if(session.state==='finished')return;paused=!paused;clearInput();controls();}
get('scenario').onchange=configure;get('controller').onchange=configure;get('ice').onchange=configure;
get('reset').onclick=reset;get('pause').onclick=togglePause;
get('step').onclick=()=>{paused=true;session.step(sample());controls();};
get('view').onchange=()=>{view.view=get<HTMLSelectElement>('view').value as GroundView['view'];};
get('distance').onchange=()=>{view.cameraDistance=Number(get<HTMLSelectElement>('distance').value);};
get('internals').onchange=()=>{view.showInternals=get<HTMLInputElement>('internals').checked;};
get('contacts').onchange=()=>{contactPoints.visible=get<HTMLInputElement>('contacts').checked;};
get('demo').onclick=()=>{session.demo();resetView();};
get('record').onclick=()=>{if(session.state==='recording')session.stop();else session.record();resetView();};
get('replay').onclick=()=>{if(session.saved){session.play(session.saved);resetView();}};
const onDown=(e:KeyboardEvent)=>{
  if((e.target as HTMLElement).matches('input,select,button,summary,a'))return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}
  if(!e.repeat&&e.code==='KeyR')reset();if(!e.repeat&&e.code==='KeyP')togglePause();
};
const onUp=(e:KeyboardEvent)=>keys.delete(e.code);
window.addEventListener('keydown',onDown);window.addEventListener('keyup',onUp);
window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);document.addEventListener('focusin',clearInput);
for(const button of document.querySelectorAll('button'))button.addEventListener('click',()=>view.renderer.domElement.focus());
function diagnostics(){
  const body=session.body,m=body.metrics();
  const fmt=(v:readonly number[])=>v.map(x=>x.toFixed(3)).join(' / ');
  get('status').textContent=session.result?`${session.result} · R returns to play`:`${paused?'Paused':session.state} · ${(session.tick/60).toFixed(1)} s`;
  get('metrics').textContent=`centre ${fmt(m.centre)}\nvelocity ${fmt(m.velocity)} m/s\nvolume ${(m.volumeRatio*100).toFixed(2)}%\nsurface strain ${(m.maxStrain*100).toFixed(1)}%\nheight ${m.height.toFixed(3)} m\npenetration ${(m.penetration*1000).toFixed(5)} mm`;
  const collision=body instanceof DeformableBody&&body.collision instanceof CageWorldContacts?body.collision:undefined;
  let count=0;
  if(collision){
    const d=collision.diagnostics;
    get('collision-metrics').textContent=`candidates ${d.candidates} · batches ${d.candidateBatches}\nnode / face contacts ${d.nodeContacts} / ${d.faceContacts}\nswept-face hits ${d.sweptFaceHits}\nconstraint correction hits ${d.correctionHits}\nlocal patch limits ${d.patchLimits}\nlimited whole updates ${d.limitedUpdates}\nsmallest accepted step ${d.minAcceptedFraction.toFixed(4)}\nlocal volume floor ${(d.minLocalVolumeRatio*100).toFixed(1)}% of rest\ninitial recovery ${d.recoveryDistance.toFixed(4)} m\nlast limit: ${d.reason}`;
    for(const c of collision.contacts.values()){
      if(c.normalLambda<1e-9||count>=512)continue;
      let x=0,y=0,z=0;for(let i=0;i<c.nodes.length;i++){const j=c.nodes[i]*3,w=c.weights[i];x+=(body as DeformableBody).positions[j]*w;y+=(body as DeformableBody).positions[j+1]*w;z+=(body as DeformableBody).positions[j+2]*w;}
      contactPositions.setXYZ(count++,x,y,z);
    }
  }else get('collision-metrics').textContent=session.mode==='plane-reference'?'Accepted material, original plane solver.':'Original sphere controller comparator.';
  contactGeometry.setDrawRange(0,count);contactPositions.needsUpdate=true;controls();
}
const loop=new Loop({fixedUpdate:()=>{
  if(paused)return;
  try{session.step(sample());if(session.body.metrics().centre[1]<-20){paused=true;get('error').textContent='Below the finite course. Press R to reset.';}}
  catch(error){paused=true;get('error').textContent=String(error);}
},render:alpha=>{diagnostics();view.render(session.body,paused||session.state==='finished'?1:alpha);}});
function frame(t:number){if(!alive)return;loop.tick(t);requestAnimationFrame(frame);}
controls();view.renderer.domElement.focus();requestAnimationFrame(frame);
Object.assign(window,{collisionLab:{session,view}});
if(import.meta.hot)import.meta.hot.dispose(()=>{
  alive=false;loop.dispose();session.dispose();view.dispose();contactGeometry.dispose();contactPoints.material.dispose();
  window.removeEventListener('keydown',onDown);window.removeEventListener('keyup',onUp);window.removeEventListener('blur',clearInput);
  document.removeEventListener('visibilitychange',clearInput);document.removeEventListener('focusin',clearInput);Reflect.deleteProperty(window,'collisionLab');
});
