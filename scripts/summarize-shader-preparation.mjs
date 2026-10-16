/** Summarize unchanged schema-2 raw evidence; never repair rejected rows. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const labels=process.argv.slice(2);if(!labels.length) throw Error('Supply capture labels');
const stats=values=>{
  const a=values.filter(Number.isFinite).sort((a,b)=>a-b),n=a.length;
  if(!n)return {n:0};const q=p=>a[Math.min(n-1,Math.floor(n*p))];
  return {n,mean:a.reduce((s,v)=>s+v,0)/n,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1)};
};
const output=[];
for(const label of labels){
  if(!/^[\w-]+$/.test(label))throw Error('Invalid label');
  const root=path.resolve('artifacts/shader-preparation',label),report=JSON.parse(await readFile(path.join(root,'raw.json'),'utf8'));
  if(report.schema!==2)throw Error(`${label}: schema 2 required for gameplay validation`);
  const runs=report.runs.map(run=>{
    const c=run.capture;
    if(!c) return {pair:run.pair,cache:run.cache,rejected:'incomplete capture'};
    const frames=c.frames.filter(f=>f.owner==='two'&&f.start>=run.gameplayStartAt&&f.start<=run.gameplayEndAt);
    const invalid=frames.filter(f=>!f.drawn||f.state!=='running'||f.pending||!f.input||f.gameplay!=='playing'||!f.focused||f.visible!=='visible');
    const positions=frames.map(f=>f.position).filter(Boolean);
    const range=axis=>positions.length?Math.max(...positions.map(p=>p[axis]))-Math.min(...positions.map(p=>p[axis])):0;
    const motion={x:range('x'),y:range('y'),z:range('z')};
    const valid=frames.length>=30&&!invalid.length&&Math.max(...Object.values(motion))>.1&&!run.errors.length&&c.glError===0;
    const gpu=c.gpu.filter(g=>g.owner==='two'&&g.start>=run.gameplayStartAt&&g.start<=run.gameplayEndAt);
    const compile=c.compiles.filter(p=>p.owner==='two'),gl=c.gl.filter(p=>p.owner==='two');
    const completedCompiles=compile.filter(p=>Number.isFinite(p.elapsedMs));
    const prep=c.phases.find(p=>p.owner==='two'&&p.method==='preparePresentation');
    const startupFrames=c.frames.filter(f=>f.owner==='two'&&f.drawn&&f.start>=prep.start+prep.ms);
    const intervals=frames.map(f=>f.deltaMs),slow=[...intervals].sort((a,b)=>b-a).slice(0,Math.ceil(intervals.length*.01));
    const sources=c.sources.filter(s=>s.owner==='two');
    const duration=intervals.reduce((s,v)=>s+v,0);
    return {pair:run.pair,cache:run.cache,browser:run.browser,environment:run.environment,
      navigationToControlMs:run.navigationToControlMs,startToControlMs:run.startToControlMs,levelTwoLoadMs:run.levelTwoLoadMs,
      preparationMs:prep.ms,queueStartupMs:c.queue.startupMs,
      laterOverlayMs:c.waits.filter(w=>w.owner==='two'&&w.start>=run.levelTwoReadyMs).reduce((s,w)=>s+w.ms,0),roomRequests:run.rooms,
      startupPrograms:startupFrames[0]?.programs,finalPrograms:c.programs.length,uniqueProgramKeys:new Set(c.programs.map(p=>p.key)).size,
      sourceMaterials:c.materials.length,
      uniqueMaterialFeatures:new Set(c.materials.flatMap(m=>m.objects.map(o=>JSON.stringify([m.type,m.hookKey,m.transmission>0,m.transparent,m.side,m.maps,o.type,o.receiveShadow,o.attributes,o.morphs])))).size,
      transmissiveMaterialNames:c.materials.filter(m=>m.visible&&m.transmission>0).map(m=>m.name),
      submittedShaderSources:sources.length,uniqueShaderSources:new Set(sources.map(s=>s.sha256)).size,
      compileSubmissions:compile.length,zeroGrowthSubmissions:compile.filter(p=>p.before===p.after).length,
      submittedCompileObjects:compile.reduce((s,p)=>s+p.objects,0),
      zeroGrowthObjects:compile.filter(p=>p.before===p.after).reduce((s,p)=>s+p.objects,0),
      pendingCompileSubmissions:compile.length-completedCompiles.length,
      compileSubmissionCpuMs:compile.reduce((s,p)=>s+p.submitMs,0),compileElapsedMs:completedCompiles.reduce((s,p)=>s+p.elapsedMs,0),
      compileAsyncElapsedMs:completedCompiles.reduce((s,p)=>s+Math.max(0,p.elapsedMs-p.submitMs),0),
      primerCpuMs:c.draws.filter(d=>d.owner==='two'&&d.phase==='primer').reduce((s,d)=>s+d.ms,0),
      inspection:stats(gl.filter(g=>g.method==='getProgramInfoLog'||g.method==='getShaderInfoLog').map(g=>g.ms)),
      liveProgramInspections:gl.filter(g=>g.phase==='gameplay-live'&&g.method==='getProgramInfoLog').length,
      liveNewPrograms:c.gpu.filter(g=>g.owner==='two').reduce((s,g)=>s+(g.newPrograms??0),0),
      uploadCpuMs:gl.filter(g=>/buffer(?:Sub)?Data|tex(?:Sub)?Image|texStorage|renderbufferStorage/.test(g.method)).reduce((s,g)=>s+g.ms,0),
      queue:c.queue,resources:c.resources,
      gameplay:{valid,invalidFrames:invalid.length,frames:frames.length,durationMs:duration,motion,
        droppedSimulationMs:frames.reduce((s,f)=>s+(f.droppedSimulationTimeSeconds??0)*1000,0),
        ...(valid?{fps:1000*intervals.length/duration,onePercentLow:1000/(slow.reduce((s,v)=>s+v,0)/slow.length),
          frameMs:stats(intervals),cpuRenderMs:stats(frames.map(f=>f.ms)),cpuUpdateMs:stats(frames.map(f=>f.fixedMs)),
          gpuMs:stats(gpu.filter(g=>g.status==='valid').map(g=>g.ms)),gpuStatuses:gpu.reduce((a,g)=>(a[g.status]=(a[g.status]??0)+1,a),{}),
          hitches:Object.fromEntries([50,100,150].map(t=>[t,intervals.filter(v=>v>t).length]))}:{}),
      },errors:run.errors,glError:c.glError};
  });
  const summary={label,scope:report.protocol,runs};
  await writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2));output.push(summary);
}
console.log(JSON.stringify(output.map(s=>({label:s.label,runs:s.runs.map(r=>({cache:r.cache,levelTwoLoadMs:r.levelTwoLoadMs,
  laterOverlayMs:r.laterOverlayMs,startupPrograms:r.startupPrograms,finalPrograms:r.finalPrograms,compileSubmissions:r.compileSubmissions,
  gameplay:r.gameplay}))})),null,2));
