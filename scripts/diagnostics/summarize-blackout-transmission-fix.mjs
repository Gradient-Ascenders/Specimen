import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=resolve(process.argv[2]??'artifacts/blackout-transmission-fix'),output=process.argv[3];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async file=>{const bytes=await readFile(file);return {file,sha256:sha(bytes),data:JSON.parse(bytes)};};
const summarizeSample=s=>{
  const live=new Set(s.live),allocations=s.allocations.filter(a=>live.has(a.id));
  const transmission=allocations.filter(a=>a.kind==='texture'&&a.type===1016&&s.targets[a.target]?.samples>=4);
  return {memory:s.memory,camera:s.camera,drawingBuffer:s.drawingBuffer,transmissionScale:s.transmissionScale,
    native:Object.fromEntries(['texture','renderbuffer'].map(kind=>[kind,{created:s.allocations.filter(a=>a.kind===kind).length,
      deleted:s.allocations.filter(a=>a.kind===kind&&a.deleted!==undefined).length,live:allocations.filter(a=>a.kind===kind).length}])),
    transmission:transmission.map(a=>({id:a.id,target:a.target,width:a.width,height:a.height,phase:a.phase,owner:s.targets[a.target]})),
    transmissionRenderbuffers:allocations.filter(a=>a.kind==='renderbuffer'&&transmission.some(t=>t.target===a.context.at(-1)?.target)).length};
};
const evidence={schema:1,note:'Native object counts are not VRAM bytes. Three target.dispose events also occur on resize. GPU captures ran sequentially.',cycles:[],views:[],visual:undefined};
evidence.source={main:execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim(),
  mainRuntimeSha256:sha(execFileSync('git',['show','origin/main:src/levels/BlackoutLevelRuntime.ts'])),
  fixed:await Promise.all(['src/levels/BlackoutLevelRuntime.ts','src/render/RetainedCameraView.ts'].map(async file=>({file,sha256:sha(await readFile(file))})))};
for(const name of ['before-cycles','after-cycles','after-high-cycles']){
  const raw=await read(resolve(root,name,'results.json')),r=raw.data;assert(!r.failure);assert.deepEqual(r.errors,[]);
  const cycles=r.cycles.map(c=>({cycle:c.cycle,prepared:c.prepared&&summarizeSample(c.prepared),gameplay:summarizeSample(c.gameplay),menu:summarizeSample(c.menu)}));
  if(name.startsWith('after')){
    assert.equal(cycles.length,name==='after-cycles'?10:2);
    for(const c of cycles){assert.equal(c.gameplay.memory.textures,94);assert.equal(c.menu.memory.textures,10);
      assert.equal(c.menu.native.texture.live,14);assert.equal(c.menu.native.renderbuffer.live,4);
      assert.equal(c.menu.transmission.length,1);
      assert.equal(c.prepared.transmission.length,1);assert.deepEqual(c.gameplay.transmission.map(t=>t.id),c.prepared.transmission.map(t=>t.id));
      const target=c.prepared.transmission[0],scale=c.prepared.transmissionScale;
      assert.deepEqual([target.width,target.height],c.prepared.drawingBuffer.map(n=>n*scale));
    }
  }
  evidence.cycles.push({file:raw.file,sha256:raw.sha256,build:r.build,browser:r.browser,gpu:r.gpu,protocol:r.protocol,profile:r.profile,cycles,errors:r.errors});
}
for(const name of ['before-medium','before-high','after-medium','after-high']){
  const raw=await read(resolve(root,name,'results.json')),r=raw.data;assert(!r.failure);assert.deepEqual(r.errors,[]);
  evidence.views.push({file:raw.file,sha256:raw.sha256,build:r.build,profile:r.profile,gpu:r.gpu,errors:r.errors,
    frames:r.frames.map(f=>({name:f.name,camera:f.camera,phase:f.phase,researchSeconds:f.research.seconds,endingSeconds:f.ending.seconds,
      researchPreparation:f.research.preparation,endingPreparation:f.ending.preparation,programs:f.programs.length,
      fingerprintsSha256:sha(JSON.stringify(f.programs)),memory:f.memory,glError:f.glError}))});
}
const visual=await read(resolve(root,'visual-comparison.json'));
for(const rows of Object.values(visual.data))for(const row of rows){assert.equal(row.missingPrograms,0);assert.equal(row.extraPrograms,0);assert(row.cameraMaxDelta<1e-6);}
evidence.visual={file:visual.file,sha256:visual.sha256,profiles:visual.data};
// Optional completion evidence, added after the native browser/controlled runs.
try{
  const controlled=await read(resolve(root,'controlled-high-comparison.json'));
  const runs=[];for(const name of ['main-high-controlled','fixed-high-controlled']){const raw=await read(resolve(root,name,'results.json'));assert(!raw.data.failure);assert.deepEqual(raw.data.errors,[]);assert(raw.data.deterministicBoss);runs.push({file:raw.file,sha256:raw.sha256,build:raw.data.build,frames:raw.data.frames});}
  for(let i=0;i<runs[0].frames.length;i++){
    const fingerprints=frame=>JSON.stringify(frame.programs.map(p=>JSON.stringify(p)).sort());
    assert.equal(fingerprints(runs[0].frames[i]),fingerprints(runs[1].frames[i]));
  }
  const handoff=controlled.data.find(f=>f.name==='research-boss-handoff');assert.deepEqual(handoff.baselineBoss,handoff.fixedBoss);assert.equal(handoff.meanAbsoluteChannelDelta,0);
  evidence.controlledHigh={file:controlled.file,sha256:controlled.sha256,runs:runs.map(run=>({...run,frames:run.frames.map(frame=>({name:frame.name,boss:frame.boss,camera:frame.camera,programs:frame.programs.length,glError:frame.glError}))})),frames:controlled.data};
}catch(error){if(error.code!=='ENOENT')throw error;}
evidence.browser=[];
for(const name of ['before-regression','after-browser','main-browser','final-browser']){
  try{const file=resolve(root,name+'.log'),bytes=await readFile(file);
    const rows=[];for(const directory of await readdir(resolve(root,name),{withFileTypes:true}))if(directory.isDirectory()){
      for(const reportName of ['transmission-recovery.json','transmission-cancellation.json','transmission-lifecycle.json']){
        try{const raw=await read(resolve(root,name,directory.name,reportName));rows.push({file:raw.file,sha256:raw.sha256,...raw.data});}
        catch(error){if(error.code!=='ENOENT')throw error;}
      }
    }
    if(name==='final-browser'){
      assert.equal(rows.filter(r=>r.result).length,2);
      for(const row of rows.filter(r=>r.result)){assert.deepEqual(row.errors,[]);assert(Object.values(row.result.glErrors).every(code=>code===0));assert(row.result.restoredCamera&&row.result.cancellationCameraRestored);assert.equal(row.result.callbacks,1);}
    }
    evidence.browser.push({file,sha256:sha(bytes),outcome:bytes.toString().split(/\r?\n/).filter(line=>/\d+ (passed|failed)(\s|$)/.test(line)),reports:rows});
  }catch(error){if(error.code!=='ENOENT')throw error;}
}
try{const raw=await read(resolve(root,'fixed-context-probe/results.json'));
  evidence.forcedContextDiagnostic={file:raw.file,sha256:raw.sha256,build:raw.data.build,
    runs:raw.data.runs.map(row=>({...row,warnings:undefined,warningCounts:Object.fromEntries([...new Set(row.warnings??[])].map(warning=>[warning,row.warnings.filter(w=>w===warning).length]))}))};
}catch(error){if(error.code!=='ENOENT')throw error;}
if(output)await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
console.log('Verified ten fixed Medium cycles, two High cycles, stable native resources/target extents and matching coverage in 30 before/after frame pairs.');
