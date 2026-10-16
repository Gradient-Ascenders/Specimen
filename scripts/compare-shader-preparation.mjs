import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const groups=process.argv.slice(2);
if(groups.length!==2)throw Error('Supply comma-separated before labels and after labels');
const median=a=>{a=[...a].filter(Number.isFinite).sort((a,b)=>a-b);const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const range=a=>[Math.min(...a),Math.max(...a)];
const comparison={};
const environments=new Set();
for(const [index,group] of groups.entries()) {
  const rows=[];
  for(const label of group.split(',')) {
    if(!/^[\w-]+$/.test(label))throw Error('Invalid label');
    rows.push(...JSON.parse(await readFile(path.join('artifacts/shader-preparation',label,'summary.json'),'utf8')).runs);
  }
  const byCache={};
  for(const cache of ['fresh-browser','warm-browser']) {
    const runs=rows.filter(r=>r.cache===cache),valid=runs.filter(r=>r.gameplay?.valid);
    if(!runs.length||valid.length!==runs.length)throw Error(`${group}: ${cache} has missing or invalid gameplay rows; inspect raw evidence`);
    for(const run of runs){
      const e=run.environment,g=e?.graphics;
      if(!g||e.shaderErrors!==true)throw Error('Missing graphics environment or disabled shader checks');
      environments.add(JSON.stringify({browser:run.browser,gpu:e.gpu,viewport:e.viewport,dpr:Math.round(e.dpr*1e6)/1e6,
        buffer:[g.drawingBufferWidth,g.drawingBufferHeight],profile:g.graphicsProfileBase,preset:g.graphicsPreset,
        gel:g.gelRenderingMode,transmission:g.transmissionResolutionScale,pixelRatio:Math.round(g.pixelRatio*1e6)/1e6,
        extensions:[...e.extensions].sort()}));
    }
    if(runs.some(r=>!Number.isFinite(r.submittedCompileObjects)||!Number.isFinite(r.stagedRouteToGameplayMs)))throw Error('Regenerate summaries with the current summarizer');
    const m=fn=>median(runs.map(fn)), g=fn=>median(valid.map(fn));
    byCache[cache]={runs:runs.length,validGameplayRuns:valid.length,
      medianLevelTwoLoadMs:m(r=>r.levelTwoLoadMs),medianLaterOverlayMs:m(r=>r.laterOverlayMs),
      medianTotalLevelTwoWaitMs:m(r=>r.levelTwoLoadMs+r.laterOverlayMs),
      medianNavigationPlusLevelTwoWaitMs:m(r=>r.navigationToControlMs+r.levelTwoLoadMs+r.laterOverlayMs),
      medianStagedRouteToGameplayMs:m(r=>r.stagedRouteToGameplayMs),medianRoomRequestWaitMs:m(r=>r.roomRequestWaitMs),
      medianNavigationToControlMs:m(r=>r.navigationToControlMs),medianStartToControlMs:m(r=>r.startToControlMs),
      startupPrograms:range(runs.map(r=>r.startupPrograms)),finalPrograms:range(runs.map(r=>r.finalPrograms)),
      medianCompileSubmissions:m(r=>r.compileSubmissions),medianSubmissionCpuMs:m(r=>r.compileSubmissionCpuMs),
      medianSubmittedCompileObjects:m(r=>r.submittedCompileObjects),medianZeroGrowthObjects:m(r=>r.zeroGrowthObjects),
      medianCompletedAsyncElapsedMs:m(r=>r.compileAsyncElapsedMs),pendingCompileSubmissions:runs.map(r=>r.pendingCompileSubmissions),
      sourceMaterials:range(runs.map(r=>r.sourceMaterials)),uniqueMaterialFeatures:range(runs.map(r=>r.uniqueMaterialFeatures)),
      uniqueShaderSources:range(runs.map(r=>r.uniqueShaderSources)),submittedShaderSources:range(runs.map(r=>r.submittedShaderSources)),
      liveNewPrograms:runs.map(r=>r.liveNewPrograms),liveProgramInspections:runs.map(r=>r.liveProgramInspections),
      maxSynchronousQueueStepMs:range(runs.map(r=>r.queue.maxStepMs)),
      medianFrameP50:g(r=>r.gameplay.frameMs.p50),medianFrameP95:g(r=>r.gameplay.frameMs.p95),medianFrameP99:g(r=>r.gameplay.frameMs.p99),
      frameP99Range:range(valid.map(r=>r.gameplay.frameMs.p99)),maxFrameRange:range(valid.map(r=>r.gameplay.frameMs.max)),
      fpsRange:range(valid.map(r=>r.gameplay.fps)),onePercentLowRange:range(valid.map(r=>r.gameplay.onePercentLow)),
      medianCpuRenderP50:g(r=>r.gameplay.cpuRenderMs.p50),medianCpuRenderP95:g(r=>r.gameplay.cpuRenderMs.p95),medianCpuRenderP99:g(r=>r.gameplay.cpuRenderMs.p99),
      medianCpuUpdateP50:g(r=>r.gameplay.cpuUpdateMs.p50),medianCpuUpdateP95:g(r=>r.gameplay.cpuUpdateMs.p95),medianCpuUpdateP99:g(r=>r.gameplay.cpuUpdateMs.p99),
      medianGpuP50:g(r=>r.gameplay.gpuMs.p50),medianGpuP95:g(r=>r.gameplay.gpuMs.p95),medianGpuP99:g(r=>r.gameplay.gpuMs.p99),
      hitches:Object.fromEntries([50,100,150].map(t=>[t,valid.reduce((s,r)=>s+r.gameplay.hitches[t],0)])),
      droppedSimulationMs:valid.reduce((s,r)=>s+r.gameplay.droppedSimulationMs,0),
      resourceSamples:runs.map(r=>r.resources),errors:runs.flatMap(r=>r.errors),glErrors:runs.map(r=>r.glError),
    };
  }
  comparison[index?'after':'before']=byCache;
}
if(environments.size!==1)throw Error('Compared runs differ in browser, GPU/backend, buffer, settings or extensions');
comparison.matchedEnvironment=JSON.parse([...environments][0]);
await writeFile('artifacts/shader-preparation/comparison-'+groups[0].split(',')[0]+'.json',JSON.stringify(comparison,null,2));
console.log(JSON.stringify(comparison,null,2));
