import {SCENARIOS} from '../../scripts/lib/performance-qualification.mjs';

export const fixture = () => {
  const approval={status:'approved',by:'fixture reviewer',date:'2026-10-20'};
  const build={sha:'a'.repeat(40),dirty:false,builtAt:'2026-10-20T10:00:00Z'};
  const graphics={graphicsProfile:'minimum',graphicsPreset:'normal',renderScale:.75,viewportWidth:1280,
    viewportHeight:720,drawingBufferWidth:960,drawingBufferHeight:540,devicePixelRatio:1,effectiveDpr:.75};
  const machine={purpose:'assessment',os:'fixture OS',cpu:'fixture CPU',gpu:'fixture GPU',driver:'fixture driver',
    browser:'fixture browser',ram:'16 GiB',powerState:'AC, balanced',display:'60 Hz, 100% zoom',
    webglRenderer:'fixture hardware GPU',userAgent:'fixture UA'};
  const intake={schema:'specimen-assessment-intake',schemaVersion:1,machine,graphics,cacheProtocol:'fixture fresh profile then same-profile reload',
    targetReview:{...approval},behaviourReview:{...approval},attachments:['review.txt'],
    browserReview:{consoleErrors:0,networkErrors:0,webglErrors:0},
    behaviour:{switching:true,electrical:true,movingPlatform:true,combat:true,recovery:true,transitions:true,restart:true},
    buildManifest:{...build,assetHashes:{'assets/game.js':'b'.repeat(64)}}};
  const budgets={schemaVersion:1,approval:{...approval},requiredScenarios:Object.keys(SCENARIOS),samplesPerScenario:3,
    minimumActiveSeconds:1,requireGpuTiming:false,
    graphicsPolicy:{graphicsProfile:'minimum',graphicsPreset:'normal'},
    gameplay:{p95Ms:33.34,p99Ms:50,minimumAverageFps:30,minimumOnePercentLowFps:20,
      maximumSevereHitchesPerMinute:0,maximumSimulationLossPercent:.1,gpuP95Ms:33.34},
    loading:{'browser-cold':{initial:1000,'level-2':1000,'level-3':1000},
      'browser-warm':{initial:1000,'level-2':1000,'level-3':1000}},
    resources:{restartCycles:3,maximumGrowth:{programs:0,geometries:2,textures:2}}};
  const lifecycle=[];
  const levels=['containment-teaching-level-1','cultivation-level-2','blackout-level-3'];
  for (const [index,level] of levels.entries()) for (let cycle=0;cycle<4;cycle++) lifecycle.push({
    kind:cycle?'restart':index?'transition':'initial',phase:cycle?'restart':['initial','level-2','level-3'][index],
    level,requestedAtMs:(index*4+cycle)*3000+100,
    readyAtMs:(index*4+cycle)*3000+110,controlAtMs:(index*4+cycle)*3000+120,
    resourceSample:{programs:1,geometries:2,textures:3,usedJsHeapBytes:null,
      timestampMs:(index*4+cycle)*3000+2200,stableForMs:2000},
  });
  const captures=['browser-cold','browser-warm','browser-warm'].flatMap((cache,pass)=>
    Object.entries(SCENARIOS).map(([scenarioId,route],scenarioIndex)=>{
    const index=pass*Object.keys(SCENARIOS).length+scenarioIndex;
    const levelIndex=levels.indexOf(route.level);
    const startedAt=Date.UTC(2026,9,20,10,pass*5)+(levelIndex+1)*12000+scenarioIndex*3000;
    const frames=Array.from({length:101},(_,i)=>({
      sequence:i+1,level:route.level,room:route.room ?? 1,deltaMs:1000/60,fixedSteps:1,fixedDeltaMs:1000/60,
      droppedSimulationMs:0,simulationState:i?'playing':'boundary',gameplayState:'playing',cutsceneState:'none',
      activeSlime:route.forms?.[Math.floor(i/10)%route.forms.length] ?? 'bob',
      activeX:i/10,activeY:1,activeZ:0,cameraX:i/20,cameraY:3,cameraZ:0,
      inputEnabled:true,pointerLocked:true,inputActive:true,focused:true,visible:true,drawn:true,
      updateCpuMs:.2,renderCpuMs:1,gpuMs:null,gpuStatus:'unsupported',drawCalls:20,triangles:500,
      programs:1,geometries:2,textures:3,...graphics,
    }));
    const frameColumns=Object.keys(frames[0]);
    const flight={schema:'specimen-performance-flight-recorder',schemaVersion:4,build:{...build},
      session:{startedAt:new Date(startedAt).toISOString(),exportedAt:new Date(startedAt+2000).toISOString(),
        durationMs:2000,recordingActive:false,userAgent:'fixture UA'},viewport:{...graphics},
      webgl:{unmaskedRenderer:'fixture hardware GPU',gpuTimerQuerySupported:false,gpuDisjointCount:0},
      summary:{totalFrames:frames.length,simulationTime:{unobservedGapMs:0}},
      qualification:{observation:'window-errors+resource-status+export-gl',errors:[],glError:0,contextLost:false,
        pageId:`pass-${pass+1}`,bootReadyMs:50,lifecycle:structuredClone(lifecycle.slice(0,(levelIndex+1)*4))},
      frameColumns,retainedFrames:frames.map(f=>frameColumns.map(k=>f[k]))};
    return {scenarioId,cache,file:`pass-${pass+1}-${scenarioId}.json`,actionsVerified:true,evidenceFiles:['review.txt'],
      // Deliberately oppose export chronology: hashes/filenames cannot identify latest history.
      sha256:(100-index).toString(16).padStart(64,'0'),flight};
  }));
  return {intake,budgets,captures};
};
