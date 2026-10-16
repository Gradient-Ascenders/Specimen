/** Exclusive wall-clock attribution. Async compiler intervals include scheduling;
 * they are not isolated GPU compiler time. Nested GL uploads remain submetrics. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const labels=process.argv.slice(2);
if(!labels.length)throw Error('Supply capture labels');
const sum=a=>a.reduce((s,v)=>s+v,0);
const partition=(capture,owner,start,end)=>{
  const intervals=[];
  const add=(kind,s,e,priority)=>{s=Math.max(start,s);e=Math.min(end,e);if(e>s)intervals.push({kind,s,e,priority});};
  for(const c of capture.compiles.filter(c=>c.owner===owner)){
    add('compileSubmissionMs',c.start,c.start+c.submitMs,4);
    if(Number.isFinite(c.elapsedMs))add('compileAsyncElapsedMs',c.start+c.submitMs,c.start+c.elapsedMs,1);
  }
  for(const d of capture.draws.filter(d=>d.owner===owner&&d.phase==='primer'))add('primerOtherMs',d.start,d.start+d.ms,2);
  for(const g of capture.gl.filter(g=>g.owner===owner&&/getProgramInfoLog|getShaderInfoLog/.test(g.method)))add('firstUseInspectionMs',g.start,g.start+g.ms,3);
  const points=[...new Set([start,end,...intervals.flatMap(i=>[i.s,i.e])])].sort((a,b)=>a-b);
  const totals={wallMs:end-start,compileSubmissionMs:0,compileAsyncElapsedMs:0,firstUseInspectionMs:0,primerOtherMs:0,otherMs:0};
  for(let n=1;n<points.length;n++){
    const s=points[n-1],e=points[n],m=(s+e)/2;
    const chosen=intervals.filter(i=>i.s<=m&&i.e>=m).sort((a,b)=>b.priority-a.priority)[0];
    totals[chosen?.kind??'otherMs']+=e-s;
  }
  const uploads=capture.gl.filter(g=>g.owner===owner&&g.start>=start&&g.start<end&&/buffer(?:Sub)?Data|tex(?:Sub)?Image|texStorage|renderbufferStorage/.test(g.method));
  return {...totals,uploadCpuNestedMs:sum(uploads.map(g=>g.ms)),uploadCalls:uploads.length,
    inspectionCalls:capture.gl.filter(g=>g.owner===owner&&g.start>=start&&g.start<end&&/getProgramInfoLog|getShaderInfoLog/.test(g.method)).length,
    compileCalls:capture.compiles.filter(g=>g.owner===owner&&g.start>=start&&g.start<end).length};
};
const output=[];
for(const label of labels){
  if(!/^[\w-]+$/.test(label))throw Error('Invalid label');
  const root=path.join('artifacts/shader-preparation',label);
  const raw=JSON.parse(await readFile(path.join(root,'raw.json'),'utf8'));
  const rows=raw.runs.map(r=>{
    const c=r.capture;if(!c)throw Error(`${label}: incomplete capture`);
    const settings=r.settingsRequestedAt??r.titleReadyAt;
    return {startupRoute:r.startupRoute??'pre-cinematic-v1',opening:r.opening,pair:r.pair,cache:r.cache,titleReadyAt:r.titleReadyAt,settingsRequestedAt:r.settingsRequestedAt,
      navigationToControlMs:r.navigationToControlMs,startToControlMs:r.startToControlMs,levelTwoLoadMs:r.levelTwoLoadMs,
      stagedRouteToGameplayMs:r.gameplayStartAt,roomRequestWaitMs:sum(r.rooms.map(room=>room.waitMs)),
      boot:partition(c,'one',0,r.titleReadyAt),
      titleSettings:partition(c,'one',settings,r.opening?.handoffAt?r.startAt:r.navigationToControlMs),
      openingWithLevelPreparation:r.opening?.handoffAt?partition(c,'one',r.startAt,r.navigationToControlMs):undefined,
      levelTwo:partition(c,'two',r.levelTwoTransitionAt,r.levelTwoReadyMs),
      phases:c.phases.map(p=>({...p,attribution:partition(c,p.owner,p.start,p.start+p.ms)})),
      levelOneProfile:r.levelOnePreparation?.profile,queue:c.queue,
      firstControlUploads:c.gl.filter(g=>g.owner==='one'&&g.phase==='gameplay-live'&&g.start>=r.startAt&&g.start<=r.navigationToControlMs&&/buffer(?:Sub)?Data|tex(?:Sub)?Image|texStorage|renderbufferStorage/.test(g.method)),
      laterOverlayMs:sum(c.waits.filter(w=>w.owner==='two'&&w.start>=r.levelTwoReadyMs).map(w=>w.ms)),
      errors:r.errors};
  });
  const result={label,method:'Exclusive wall attribution: compiler submission > inspection > primer CPU > pending async elapsed > other; upload CPU is nested, not additive. Async elapsed includes browser scheduling and other work.',runs:rows};
  await writeFile(path.join(root,'loading.json'),JSON.stringify(result,null,2));output.push(result);
}
console.log(JSON.stringify(output,null,2));
