import { Loop } from '../../core/Loop.ts';
import { DeformableBody } from './DeformableBody.ts';
import { GroundSession } from './GroundSession.ts';
import { GroundView } from './GroundView.ts';
import type { BodyKind, GroundInput } from './GroundBody.ts';
import { AXIAL_DAMPING_RANGE, MATERIAL_CONTROLS, MATERIAL_PRESETS, PREFERRED_MATERIAL_CONFIG, matchingMaterialPreset } from './MaterialPresets.ts';
import './ground.css';

document.querySelector<HTMLElement>('#app')!.innerHTML=`
  <section id="room"><header><h1>Ground locomotion lab</h1>
    <p>WASD / arrows · release to brake · Shift to coast (cage)<br>R reset · P pause · 1 metre grid · <a href="/collision-lab.html">Collision lab →</a></p></header>
    <div id="legend"><span style="color:#69efb5">● grip</span><span style="color:#ffad53">● slide</span>
    <span>● catch</span><span style="color:#f27cb9">● release</span><br>
    Crosses: anchors · bars: contact force · white diamond: tracked material<br>
    Links: orange stretch / blue compression</div></section>
  <aside aria-label="Ground experiment controls">
    <label>Controller / body<select id="body"><option value="deformable">Experimental · 3D XPBD cage</option>
    <option value="kinematic">Baseline · KinematicBody</option></select></label>
    <div class="buttons"><button id="reset">Reset (R)</button><button id="pause">Pause (P)</button><button id="step">One tick</button></div>
    <label>Material preset<select id="preset">${MATERIAL_PRESETS.map(preset=>`<option value="${preset.id}">${preset.name}</option>`).join('')}
      <option value="custom" disabled>Diagnostic / historical replay</option></select></label>
    <p id="preset-description" class="hint"></p>
    <details open><summary>Accepted material · locked reference v1</summary>
      ${MATERIAL_CONTROLS.map(control=>`<label class="material-control">${control.label}
        <output id="${control.id}-value"></output><input id="${control.id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${PREFERRED_MATERIAL_CONFIG[control.key]/control.base}"></label>`).join('')}
      <p class="hint">Human accepted after comparison. Material and control response are locked while collision is evaluated.</p>
      <label>Axial damping <output id="damping-value">${PREFERRED_MATERIAL_CONFIG.bondDamping.toFixed(2)}</output><input id="damping" type="range" min="${AXIAL_DAMPING_RANGE.min}" max="${AXIAL_DAMPING_RANGE.max}" step="${AXIAL_DAMPING_RANGE.step}" value="${PREFERRED_MATERIAL_CONFIG.bondDamping}"></label>
      <p class="hint" id="volume-setting">Volume preservation stays strong and separate.</p>
      <button id="defaults">Restore accepted reference</button>
    </details>
    <label>View<select id="view"><option value="oblique">Oblique 3D</option><option value="side">Side · X travel</option><option value="top">Top · X/Z travel</option></select></label>
    <label>Friction <output id="friction-value">0.90</output><input id="friction" type="range" min="0" max="1.5" step=".05" value=".9"></label>
    <div class="buttons"><button id="zero">Zero friction + reset</button><button id="grip">Restore grip + reset</button></div>
    <p class="hint">Friction is an ablation diagnostic, not material retuning. Restore grip returns to the accepted reference.</p>
    <div class="buttons"><button id="reversal">Reversal tape · 10 s</button><button id="record">Record from reset</button>
    <button id="replay" disabled>Replay last tape</button><button id="export" disabled>Save tape</button></div>
    <p id="status" role="status">Live · ready for feel review</p>
    <p class="hint">Tape: settle 2 s → forward 4 s → reverse 2 s → coast 2 s. Recording stops at 30 s. Replays restore their body and tuning.</p>
    <details><summary>Debug observations</summary>
      <label><input id="contacts" type="checkbox" checked> Contact anchors and forces</label>
      <label><input id="internals" type="checkbox"> Internal constraints</label>
      <label>Track material node <input id="node" type="number" min="0" max="41" value="0"></label>
      <pre id="metrics"></pre><pre id="contact-state"></pre>
    </details>
    <details><summary>Accepted control response · 7.78 / 85</summary>
      <label>Angular speed · rad/s <output id="speed-value">7.78</output><input id="speed" type="range" min="1" max="12" step=".01" value="7.78"></label>
      <label>Angular acceleration limit <output id="motor-value">85</output><input id="motor" type="range" min="10" max="150" step="5" value="85"></label>
    </details>
    <p class="hint">42 physical nodes · 4 substeps × 8 passes · 60 Hz.<br>Flat-ground feel accepted. Original plane-contact solver retained for A/B.</p>
    <p id="error" role="alert"></p>
  </aside>`;

const get=<T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const session=new GroundSession();
const view=new GroundView(get('room'));
const keys=new Set<string>();
let paused=false;
let alive=true;
let lastHudTick=-1;
let lastMode=session.mode;
const input=(): GroundInput => ({
  x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),
  z:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),
  coast:keys.has('ShiftLeft')||keys.has('ShiftRight'),
});
function refreshControls() {
  get<HTMLSelectElement>('body').value=session.kind;
  const preset=matchingMaterialPreset(session.config);
  get<HTMLSelectElement>('preset').value=preset?.id ?? 'custom';
  get<HTMLSelectElement>('preset').disabled=session.kind==='kinematic';
  get('preset-description').textContent=preset?.description ?? 'Diagnostic or historical replay configuration. Restore accepted reference to return to the baseline.';
  for (const control of MATERIAL_CONTROLS) {
    const multiplier=session.config[control.key]/control.base;
    get<HTMLInputElement>(control.id).value=String(multiplier);
    get(`${control.id}-value`).textContent=`${multiplier.toFixed(2)}× · ${session.config[control.key].toExponential(2)}`;
    get<HTMLInputElement>(control.id).disabled=true;
  }
  get('volume-setting').textContent=`Volume compliance: ${session.config.volumeCompliance.toExponential(2)} · fixed independently of material softness.`;
  for (const [id,value] of Object.entries({friction:session.config.friction,speed:session.config.angularSpeed,
    motor:session.config.maxAngularAcceleration,damping:session.config.bondDamping})) {
    get<HTMLInputElement>(id).value=String(value); get(`${id}-value`).textContent=value.toFixed(2);
    get<HTMLInputElement>(id).disabled=true;
  }
  for (const id of ['zero','grip','defaults']) get<HTMLButtonElement>(id).disabled=session.kind==='kinematic';
  get<HTMLButtonElement>('replay').disabled=!session.savedTape;
  get<HTMLButtonElement>('export').disabled=!session.savedTape;
  get('record').textContent=session.mode==='recording' ? 'Stop recording' : 'Record from reset';
  get('pause').textContent=paused ? 'Resume (P)' : 'Pause (P)';
  get<HTMLButtonElement>('pause').disabled=session.mode==='finished';
  get<HTMLButtonElement>('step').disabled=session.mode==='finished';
}
function resetPresentation() {
  keys.clear(); paused=false; view.resetTrail(); lastHudTick=-1; get('error').textContent=''; refreshControls();
}
function configure() {
  session.configure(get<HTMLSelectElement>('body').value as BodyKind,session.config);
  resetPresentation();
}
function reset() { session.reset(); resetPresentation(); }
function togglePause() { if (session.mode==='finished') return; paused=!paused; keys.clear(); refreshControls(); }
get('reset').onclick=reset;
get('body').onchange=configure;
get('preset').onchange=()=>{
  const preset=MATERIAL_PRESETS.find(preset=>preset.id===get<HTMLSelectElement>('preset').value);
  if (preset) { session.config={...preset.config}; configure(); }
};
get('pause').onclick=togglePause;
get('step').onclick=()=>{ paused=true; session.step(input()); refreshControls(); };
get('view').onchange=()=>{view.view=get<HTMLSelectElement>('view').value as GroundView['view'];};
get('contacts').onchange=()=>{view.showContacts=get<HTMLInputElement>('contacts').checked;};
get('internals').onchange=()=>{view.showInternals=get<HTMLInputElement>('internals').checked;};
get('node').onchange=()=>{
  const value=Number(get<HTMLInputElement>('node').value);
  view.trackedNode=Number.isFinite(value) ? Math.max(0,Math.min(41,Math.round(value))) : 0;
  get<HTMLInputElement>('node').value=String(view.trackedNode); view.resetTrail(); lastHudTick=-1;
};
for (const control of MATERIAL_CONTROLS) {
  get(control.id).oninput=()=>{
    const multiplier=Number(get<HTMLInputElement>(control.id).value);
    get(`${control.id}-value`).textContent=`${multiplier.toFixed(2)}× · ${(control.base*multiplier).toExponential(2)}`;
  };
  get(control.id).onchange=()=>{
    session.config[control.key]=control.base*Number(get<HTMLInputElement>(control.id).value);
    configure();
  };
}
for (const id of ['friction','speed','motor','damping']) {
  get(id).oninput=()=>{ get(`${id}-value`).textContent=Number(get<HTMLInputElement>(id).value).toFixed(2); };
  get(id).onchange=()=>{
    const value=Number(get<HTMLInputElement>(id).value);
    if (id==='friction') session.config.friction=value;
    if (id==='speed') session.config.angularSpeed=value;
    if (id==='motor') session.config.maxAngularAcceleration=value;
    if (id==='damping') session.config.bondDamping=value;
    configure();
  };
}
get('zero').onclick=()=>{session.config.friction=0; configure();};
get('grip').onclick=()=>{session.config.friction=PREFERRED_MATERIAL_CONFIG.friction; configure();};
get('defaults').onclick=()=>{session.config={...PREFERRED_MATERIAL_CONFIG}; configure();};
get('reversal').onclick=()=>{session.playReversal(); resetPresentation();};
get('record').onclick=()=>{
  if (session.mode==='recording') session.stopRecording(); else session.startRecording();
  resetPresentation();
};
get('replay').onclick=()=>{if(session.savedTape) session.play(session.savedTape); resetPresentation();};
get('export').onclick=()=>{
  if (!session.savedTape) return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(session.savedTape,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a'); anchor.href=url; anchor.download='specimen-ground-tape.json'; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const onKeyDown=(event: KeyboardEvent) => {
  if ((event.target as HTMLElement).matches('input,select,button,summary,a')) return;
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)) {
    event.preventDefault(); keys.add(event.code);
  }
  if (!event.repeat && event.code==='KeyR') reset();
  if (!event.repeat && event.code==='KeyP') togglePause();
};
const onKeyUp=(event: KeyboardEvent)=>{keys.delete(event.code);};
const clearInput=()=>{keys.clear();};
window.addEventListener('keydown',onKeyDown); window.addEventListener('keyup',onKeyUp);
window.addEventListener('blur',clearInput); document.addEventListener('visibilitychange',clearInput);
document.addEventListener('focusin',clearInput);
// Action buttons return movement focus; sliders/selects keep their native keyboard behavior.
for (const button of document.querySelectorAll('button')) button.addEventListener('click',()=>view.renderer.domElement.focus());

function hud() {
  if (lastMode!==session.mode) { lastMode=session.mode; refreshControls(); }
  const m=session.body.metrics();
  get('status').textContent=session.replayResult ? `${session.replayResult} · R to play again`
    : `${paused ? 'Paused' : session.mode} · ${(session.tick/60).toFixed(1)} s · tick ${session.tick}`;
  if (lastHudTick===session.tick) return;
  lastHudTick=session.tick;
  const vector=(v: readonly number[])=>v.map(n=>n.toFixed(3)).join(' / ');
  get('metrics').textContent=`centre   ${vector(m.centre)}\nvelocity ${vector(m.velocity)} m/s\nloaded contacts ${m.contacts}\ncatch / release ${m.acquired} / ${m.released}\nvolume ${(m.volumeRatio*100).toFixed(2)}% · strain ${(m.maxStrain*100).toFixed(1)}%\nheight ${m.height.toFixed(3)} m\npenetration ${(m.penetration*1000).toFixed(4)} mm`;
  const cage=session.body instanceof DeformableBody ? session.body : undefined;
  if (cage) {
    const c=cage.contacts[view.trackedNode], h=1/60/cage.config.substeps;
    get('contact-state').textContent=`node ${view.trackedNode}: ${!c.active ? 'released / free' : c.normalLambda<1e-9 ? 'near floor' : c.sliding ? 'sliding' : 'gripping'}\nload ${(c.normalLambda/(h*h)).toFixed(2)} N · age ${c.age.toFixed(2)} s\ncatches ${c.acquisitions}\nmotor net |J| ${Math.hypot(...cage.motorLinearImpulse).toExponential(1)}\nfloor Jx ${cage.groundImpulse[0].toFixed(4)} kg m/s`;
  } else get('contact-state').textContent='Baseline: original target-velocity\nsphere controller; no material contacts.\nShift coast is cage-only.';
}
const loop=new Loop({
  fixedUpdate:()=>{
    if (paused) return;
    try { session.step(input()); } catch (error) { paused=true; keys.clear(); get('error').textContent=String(error); }
  },
  render:(alpha)=>{view.render(session.body,paused||session.mode==='finished' ? 1 : alpha); hud();},
});
function animate(timestamp: number) { if (!alive) return; loop.tick(timestamp); requestAnimationFrame(animate); }
requestAnimationFrame(animate);
refreshControls();
view.renderer.domElement.focus();
// Lab-only read access for browser evidence; no production runtime debug hooks.
Object.assign(window,{groundLab:{session,view}});
if (import.meta.hot) import.meta.hot.dispose(()=>{
  alive=false; loop.dispose(); view.dispose(); session.body.dispose();
  window.removeEventListener('keydown',onKeyDown); window.removeEventListener('keyup',onKeyUp);
  window.removeEventListener('blur',clearInput); document.removeEventListener('visibilitychange',clearInput);
  document.removeEventListener('focusin',clearInput);
  Reflect.deleteProperty(window,'groundLab');
});
