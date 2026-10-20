// Pure reporting/evaluation shared by the maintained summarizer and intake CLI.
export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const tail = sorted.slice(-Math.max(1, Math.ceil(sorted.length * .01)));
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {n: sorted.length, mean, p50: at(.5), p95: at(.95), p99: at(.99),
    max: sorted.at(-1), fps: mean > 0 ? 1000 / mean : null,
    onePercentLow: tail[0] > 0 ? 1000 / (tail.reduce((a,b) => a+b,0)/tail.length) : null};
}

export const SCENARIOS = {
  'l1-traversal':{level:'containment-teaching-level-1',forms:['bob']},
  'l2-switching':{level:'cultivation-level-2',forms:['bob','goop']},
  'l2-room5-bob':{level:'cultivation-level-2',room:5,forms:['bob']},
  'l2-room5-goop':{level:'cultivation-level-2',room:5,forms:['goop']},
  'l3-electrical':{level:'blackout-level-3',room:'room-1',forms:['volt']},
  'l3-platform':{level:'blackout-level-3',room:'room-2'},
  'l3-combat':{level:'blackout-level-3',room:'room-2'},
};

export function analyzeRecording(flight) {
  const reasons = [];
  const reject = message => { if (!reasons.includes(message)) reasons.push(message); };
  if (flight?.schema !== 'specimen-performance-flight-recorder' || flight.schemaVersion < 4)
    reject('Qualification requires recorder schema 4 or newer; legacy metrics are not qualification evidence.');
  const c = Object.fromEntries((flight?.frameColumns ?? []).map((key,index) => [key,index]));
  const required = ['sequence','level','room','deltaMs','fixedSteps','fixedDeltaMs','droppedSimulationMs',
    'simulationState','gameplayState','cutsceneState','activeSlime','activeX','activeY','activeZ',
    'cameraX','cameraY','cameraZ','inputEnabled','pointerLocked','inputActive','focused','visible','drawn',
    'updateCpuMs','renderCpuMs','gpuMs','gpuStatus','drawCalls','triangles','programs','geometries','textures',
    'graphicsProfile','graphicsPreset','renderScale','effectiveDpr','drawingBufferWidth','drawingBufferHeight',
    'viewportWidth','viewportHeight','devicePixelRatio'];
  if (required.some(key => c[key] === undefined)) reject('Missing required frame columns.');
  const bySequence = new Map();
  const source = flight?.retainedFrames ?? (flight?.hitchWindows ?? []).flatMap(w => w.frames);
  for (const row of source) {
    if (!Array.isArray(row) || row.length !== flight.frameColumns.length || !Number.isInteger(row[c.sequence])) {
      reject('Malformed frame row.'); continue;
    }
    const prior = bySequence.get(row[c.sequence]);
    if (!prior || row[c.gpuStatus] === 'valid') bySequence.set(row[c.sequence], row);
  }
  const rows = [...bySequence.values()].sort((a,b) => a[c.sequence]-b[c.sequence]);
  if (!rows.length || rows.length !== flight?.summary?.totalFrames ||
    rows.some((row,i) => row[c.sequence] !== i+1)) reject('Incomplete raw-frame coverage.');
  const active = rows.slice(1); // first interval may predate recording
  const numeric = ['deltaMs','fixedSteps','fixedDeltaMs','droppedSimulationMs','activeX','activeY','activeZ',
    'cameraX','cameraY','cameraZ','updateCpuMs','renderCpuMs','drawCalls','triangles','programs','geometries','textures',
    'renderScale','effectiveDpr','drawingBufferWidth','drawingBufferHeight','viewportWidth','viewportHeight','devicePixelRatio'];
  if (!active.length) reject('No eligible frame intervals.');
  if (active.some(r => numeric.some(key => !Number.isFinite(r[c[key]])))) reject('Missing/non-finite metrics.');
  if (active.some(r => r[c.deltaMs] <= 0 || r[c.fixedDeltaMs] <= 0 || r[c.droppedSimulationMs] < 0 ||
    r[c.droppedSimulationMs] > r[c.deltaMs] + .02 || r[c.updateCpuMs] < 0 || r[c.renderCpuMs] < 0))
    reject('Invalid timing values.');
  if (rows.some(r => r[c.simulationState] !== 'playing' && r !== rows[0]) ||
    rows.some(r => !['playing','three-slime','specimen','boss','escape'].includes(r[c.gameplayState]) ||
      !['none','room-three-complete'].includes(r[c.cutsceneState]))) reject('Non-playing/death/cutscene/transition contamination.');
  if (rows.some(r => ['inputEnabled','pointerLocked','focused','visible','drawn'].some(key => r[c[key]] !== true)))
    reject('Input disabled, pointer unlocked, hidden/unfocused or missing draw.');
  if (!active.some(r => r[c.inputActive] === true)) reject('No recorded gameplay input.');
  if (active.some(r => r[c.drawCalls] <= 0)) reject('No submitted gameplay draw calls.');
  if (!Number.isFinite(flight?.summary?.simulationTime?.unobservedGapMs) ||
    flight.summary.simulationTime.unobservedGapMs > .01) reject('Unobserved clock-reset/focus gap or missing gap accounting.');
  const motion = (subset, prefix) => ['X','Y','Z'].some(axis => {
    const values = subset.map(r => r[c[prefix+axis]]);
    return values.length > 1 && Math.max(...values)-Math.min(...values) >= .05;
  });
  // Check movement within each controlled identity; switching alone cannot fake movement.
  const identities = [...new Set(active.map(r => r[c.activeSlime]))];
  if (!identities.some(id => motion(active.filter(r => r[c.activeSlime] === id), 'active')))
    reject('Stationary actor.');
  if (!motion(active,'camera')) reject('Stationary camera.');
  for (const key of ['graphicsProfile','graphicsPreset','renderScale','effectiveDpr','drawingBufferWidth','drawingBufferHeight',
    'viewportWidth','viewportHeight','devicePixelRatio']) {
    if (new Set(rows.map(r => r[c[key]])).size !== 1) reject('Graphics/viewport changed during capture.');
    if (rows.length && (typeof rows[0][c[key]]==='number'
      ? !Number.isFinite(flight?.viewport?.[key]) || Math.abs(rows[0][c[key]]-flight.viewport[key])>.0001
      : rows[0][c[key]]!==flight?.viewport?.[key])) reject('Export graphics differ from recorded graphics.');
  }
  if (rows.some(r=>!['minimum','standard','custom'].includes(r[c.graphicsProfile]) ||
    !['normal','performance'].includes(r[c.graphicsPreset]) || r[c.effectiveDpr]<=0 ||
    r[c.drawingBufferWidth]<=0 || r[c.drawingBufferHeight]<=0)) reject('Missing/invalid applied graphics configuration.');
  const validGpu = active.filter(r => r[c.gpuStatus] === 'valid');
  if (active.some(r => r[c.gpuStatus] === 'valid' && (!Number.isFinite(r[c.gpuMs]) || r[c.gpuMs] < 0)) ||
    active.some(r => r[c.gpuStatus] !== 'valid' && r[c.gpuMs] !== null)) reject('Invalid/unsupported GPU result presented as a measurement.');
  if (flight?.webgl?.gpuTimerQuerySupported === true && validGpu.length / Math.max(1,active.length) < .8)
    reject('Insufficient valid GPU query coverage (<80%).');
  if (flight?.webgl?.gpuTimerQuerySupported !== true && validGpu.length) reject('GPU support metadata conflicts with results.');
  if (typeof flight?.webgl?.gpuTimerQuerySupported!=='boolean' || active.some(r=>
    !['unsupported','valid','pending','query-capacity'].includes(r[c.gpuStatus]))) reject('Missing/error GPU query scope.');
  if (flight?.webgl?.gpuDisjointCount > 0) reject('Disjoint GPU query scope.');
  const d = flight?.qualification;
  if (!d || d.observation !== 'window-errors+resource-status+export-gl' || !Array.isArray(d.errors) ||
    d.errors.length || d.glError !== 0 || d.contextLost !== false) reject('Missing/error browser/WebGL diagnostics.');
  if (!/^[a-f0-9]{40}$/.test(flight?.build?.sha ?? '') || flight.build.dirty !== false || !flight.build.builtAt)
    reject('Missing clean-build provenance.');
  if (flight?.session?.recordingActive !== false) reject('Stop recording before export.');
  if (!Number.isFinite(Date.parse(flight?.session?.startedAt))) reject('Missing recording start identity.');
  const elapsedMs = active.reduce((s,r)=>s+(r[c.deltaMs] ?? 0),0);
  if (!Number.isFinite(flight?.session?.durationMs) || flight.session.durationMs < elapsedMs-1)
    reject('Session duration cannot contain the raw gameplay intervals.');
  const droppedMs = active.reduce((s,r)=>s+(r[c.droppedSimulationMs] ?? 0),0);
  const fixedStepMs=active.reduce((s,r)=>s+(r[c.fixedSteps] ?? 0)*(r[c.fixedDeltaMs] ?? 0),0);
  const remainderTolerance=2*Math.max(0,...active.map(r=>r[c.fixedDeltaMs] ?? 0))+active.length*.002;
  if (Math.abs(elapsedMs-droppedMs-fixedStepMs)>remainderTolerance) reject('Simulation/wall-clock accounting is inconsistent.');
  const resources = {};
  for (const key of ['drawCalls','triangles','programs','geometries','textures'])
    resources[key] = distribution(active.map(r=>r[c[key]]));
  return {valid: reasons.length === 0, reasons, rawFrames: rows.length, eligibleFrames: active.length,
    levels:[...new Set(active.map(r=>r[c.level]))],rooms:[...new Set(active.map(r=>r[c.room]))],
    identities,movingIdentities:identities.filter(id=>motion(active.filter(r=>r[c.activeSlime]===id),'active')),
    elapsedMs, sessionDurationMs: flight?.session?.durationMs ?? null,
    simulation: {droppedMs, lostPercent: elapsedMs > 0 ? 100*droppedMs/elapsedMs : null,
      fixedStepMs,
      session: flight?.summary?.simulationTime ?? null},
    frame: distribution(active.map(r=>r[c.deltaMs])),
    hitches: Object.fromEntries([50,100,150].map(ms=>[ms,active.filter(r=>r[c.deltaMs]>ms).length])),
    updateCpu: distribution(active.map(r=>r[c.updateCpuMs])),
    renderCpu: distribution(active.map(r=>r[c.renderCpuMs])),
    gpu: distribution(validGpu.map(r=>r[c.gpuMs])),
    gpuStatus: flight?.webgl?.gpuTimerQuerySupported === true ? 'supported' : 'unavailable',
    resources, memory: distribution((flight?.memorySamples ?? []).map(s=>s.usedJsHeapBytes)),
    graphics: flight?.viewport ?? null, build: flight?.build ?? null};
}

const approved = value => value?.status === 'approved' && typeof value.by === 'string' && value.by.trim() &&
  typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date);
const present = value => typeof value === 'string' && value.trim().length > 0 && !/^(unknown|pending|todo|unavailable|n\/a)$/i.test(value);

/** Missing evidence always yields unqualified, even if every available number is fast. */
export function evaluateQualification(intake, budgets, captures) {
  const reasons = [], checks = [];
  const require = (ok,message) => { if (!ok) reasons.push(message); };
  require(intake?.schema==='specimen-assessment-intake' && intake.schemaVersion===1,'Unsupported intake schema.');
  require(budgets?.schemaVersion === 1 && approved(budgets.approval), 'Budgets are proposed/unapproved or invalid.');
  require(approved(intake?.targetReview), 'Assessment machine/evidence has not been reviewed.');
  require(intake?.machine?.purpose === 'assessment', 'Development/CI results cannot qualify the assessment target.');
  for (const key of ['os','cpu','gpu','driver','browser','ram','powerState','display'])
    require(present(intake?.machine?.[key]), `Missing hardware field: ${key}.`);
  require(present(intake?.cacheProtocol), 'Missing reproducible browser-cold/warm cache protocol.');
  require(approved(intake?.behaviourReview), 'Native interaction/lifecycle evidence requires independent review.');
  for (const key of ['switching','electrical','movingPlatform','combat','recovery','transitions','restart'])
    require(intake?.behaviour?.[key] === true, `Missing behaviour check: ${key}.`);
  require(Array.isArray(intake?.attachments) && intake.attachments.length > 0, 'Missing console/network/interaction evidence attachments.');
  require(intake?.browserReview?.consoleErrors === 0 && intake?.browserReview?.networkErrors === 0 &&
    intake?.browserReview?.webglErrors === 0, 'Missing/failed console, network or WebGL review.');
  const assets = intake?.buildManifest?.assetHashes;
  require(/^[a-f0-9]{40}$/.test(intake?.buildManifest?.sha ?? '') && intake?.buildManifest?.dirty === false &&
    assets && Object.keys(assets).length > 0 && Object.values(assets).every(v=>/^[a-f0-9]{64}$/.test(v)),
    'Missing clean build manifest/asset hashes.');
  require(Array.isArray(budgets?.requiredScenarios) && budgets.requiredScenarios.length > 0, 'Missing scenario requirements.');
  require(Object.keys(SCENARIOS).every(id=>budgets?.requiredScenarios?.includes(id)), 'Budgets must cover all seven shipped routes.');
  require(Number.isFinite(budgets?.minimumActiveSeconds) && budgets.minimumActiveSeconds>0,'Missing positive active-duration requirement.');
  require(Number.isInteger(budgets?.samplesPerScenario) && budgets.samplesPerScenario >= 1, 'Invalid repetition requirement.');
  require(Number.isInteger(budgets?.resources?.restartCycles) && budgets.resources.restartCycles>=3,'Require at least three stabilized restart cycles.');
  require(new Set(captures.map(x=>x.sha256)).size===captures.length &&
    captures.every(x=>/^[a-f0-9]{64}$/.test(x.sha256 ?? '')), 'Duplicate/missing raw capture hashes.');
  require(new Set(captures.map(x=>`${x.flight?.qualification?.pageId}:${x.flight?.session?.startedAt}`)).size===captures.length,
    'Multiple exports of the same recording cannot count as repetitions.');
  const threshold = (name,value,limit,direction='max') => {
    if (!Number.isFinite(value) || !Number.isFinite(limit) || limit < 0) { reasons.push(`Missing/invalid metric or budget: ${name}.`); return; }
    checks.push({name,value,limit,direction,passed:direction === 'max' ? value<=limit : value>=limit});
  };
  const analyzed = captures.map(({scenarioId,flight,cache,file,actionsVerified,evidenceFiles}) => {
    require(actionsVerified===true && Array.isArray(evidenceFiles) && evidenceFiles.length>0 &&
      evidenceFiles.every(name=>intake?.attachments?.includes(name)), `${file ?? scenarioId}: scenario actions/evidence not verified.`);
    require(['browser-cold','browser-warm'].includes(cache),`${file ?? scenarioId}: missing supported cache classification.`);
    const report = analyzeRecording(flight);
    require(report.valid, `${file ?? scenarioId}: ${report.reasons.join(' ')}`);
    require(flight?.build?.sha === intake?.buildManifest?.sha && flight?.build?.builtAt === intake?.buildManifest?.builtAt,
      `${file ?? scenarioId}: build differs from manifest.`);
    const renderer = flight?.webgl?.unmaskedRenderer;
    require(renderer===intake?.machine?.webglRenderer && flight?.session?.userAgent===intake?.machine?.userAgent,
      `${file ?? scenarioId}: renderer/browser differs from target record.`);
    require(present(renderer) && !/swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(renderer),
      `${file ?? scenarioId}: software/unknown renderer cannot qualify hardware.`);
    const prefix = `${scenarioId}/${file ?? 'capture'}`;
    require(budgets?.graphicsPolicy?.graphicsProfile===report.graphics?.graphicsProfile &&
      budgets?.graphicsPolicy?.graphicsPreset===report.graphics?.graphicsPreset,`${prefix}: graphics do not match the budget policy.`);
    const route=SCENARIOS[scenarioId];
    require(route && report.levels.length===1 && report.levels[0]===route.level &&
      (route.room===undefined || report.rooms.every(room=>room===route.room)) &&
      (!route.forms || route.forms.every(form=>report.movingIdentities.includes(form))),
      `${prefix}: scenario level/room/controlled movement does not match route.`);
    for (const key of ['graphicsProfile','graphicsPreset','renderScale','viewportWidth','viewportHeight',
      'drawingBufferWidth','drawingBufferHeight','devicePixelRatio','effectiveDpr']) {
      const value=report.graphics?.[key],expected=intake?.graphics?.[key];
      require(expected!==undefined && (typeof value==='number' && typeof expected==='number'
        ? Math.abs(value-expected)<.0001 : value===expected),`${prefix}: missing/mismatched graphics ${key}.`);
    }
    threshold(`${prefix}/durationSeconds`,report.elapsedMs/1000,budgets?.minimumActiveSeconds,'min');
    threshold(`${prefix}/p95Ms`,report.frame?.p95,budgets?.gameplay?.p95Ms);
    threshold(`${prefix}/p99Ms`,report.frame?.p99,budgets?.gameplay?.p99Ms);
    threshold(`${prefix}/averageFps`,report.frame?.fps,budgets?.gameplay?.minimumAverageFps,'min');
    threshold(`${prefix}/onePercentLowFps`,report.frame?.onePercentLow,budgets?.gameplay?.minimumOnePercentLowFps,'min');
    threshold(`${prefix}/severeHitchesPerMinute`,report.elapsedMs > 0 ? report.hitches[150]*60000/report.elapsedMs : null,
      budgets?.gameplay?.maximumSevereHitchesPerMinute);
    threshold(`${prefix}/lossPercent`,report.simulation.lostPercent,budgets?.gameplay?.maximumSimulationLossPercent);
    if (budgets?.requireGpuTiming === true) threshold(`${prefix}/gpuP95Ms`,report.gpu?.p95,budgets?.gameplay?.gpuP95Ms);
    return {scenarioId,cache,file,...report};
  });
  for (const id of budgets?.requiredScenarios ?? [])
    require(analyzed.filter(x=>x.scenarioId===id && x.valid).length >= budgets.samplesPerScenario, `Missing valid repetitions: ${id}.`);
  // One export per page suffices for shared page-level loading/lifecycle history.
  const pages = new Map();
  for (const capture of captures) if (capture.flight?.qualification?.pageId) {
    require(!pages.has(capture.flight.qualification.pageId) || pages.get(capture.flight.qualification.pageId).cache===capture.cache,
      'A single page cannot be both browser-cold and browser-warm.');
    pages.set(capture.flight.qualification.pageId,{cache:capture.cache, data:capture.flight.qualification});
  }
  const loading=[];
  for (const [pageId,page] of pages) {
    require(Number.isFinite(page.data.bootReadyMs) && page.data.bootReadyMs>=0,`${pageId}: missing navigation-to-title timing.`);
    for(const event of page.data.lifecycle ?? []) {
      if (event.kind!=='restart') loading.push({pageId,cache:page.cache,phase:event.phase,
        navigationToTitleReadyMs:page.data.bootReadyMs ?? null,
        requestToReadyMs:Number.isFinite(event.readyAtMs)?event.readyAtMs-event.requestedAtMs:null,
        readyToControlMs:Number.isFinite(event.controlAtMs)&&Number.isFinite(event.readyAtMs)?event.controlAtMs-event.readyAtMs:null,
        requestToControlMs:Number.isFinite(event.controlAtMs)?event.controlAtMs-event.requestedAtMs:null,
        navigationToControlMs:event.kind==='initial'?event.controlAtMs:null});
      const sample=event.resourceSample;
      if (sample) require(Number.isFinite(sample.stableForMs) && sample.stableForMs>=2000 &&
        Number.isFinite(sample.timestampMs) && Number.isFinite(event.controlAtMs) && sample.timestampMs-event.controlAtMs>=2000 &&
        ['programs','geometries','textures'].every(key=>Number.isInteger(sample[key])&&sample[key]>=0),
        `${pageId}/${event.level}: invalid resource stabilization evidence.`);
    }
  }
  for (const cache of ['browser-cold','browser-warm']) {
    const selected = [...pages.values()].filter(p=>p.cache===cache);
    require(selected.length > 0, `Missing ${cache} page evidence.`);
    for (const page of selected) for (const phase of ['initial','level-2','level-3']) {
      const events = (page.data.lifecycle ?? []).filter(e=>e.phase===phase && e.kind!=='restart');
      require(events.length > 0, `Missing ${cache}/${phase} loading evidence.`);
      for (const [index,event] of events.entries()) {
        require(Number.isFinite(event.readyAtMs) && event.readyAtMs>=event.requestedAtMs &&
          Number.isFinite(event.controlAtMs) && event.controlAtMs>=event.readyAtMs,
          `Incomplete ${cache}/${phase} control/ready timings.`);
        threshold(`${cache}/${phase}/${index}/controlMs`, event.controlAtMs-event.requestedAtMs,
          budgets?.loading?.[cache]?.[phase]);
      }
    }
  }
  for (const [pageId,page] of pages) for (const level of ['containment-teaching-level-1','cultivation-level-2','blackout-level-3']) {
    const events = (page.data.lifecycle ?? []).filter(e=>e.level===level && e.resourceSample);
    const restarts = events.filter(e=>e.kind==='restart');
    require(restarts.length >= budgets?.resources?.restartCycles, `Missing stabilized restart cycles: ${level}.`);
    // First post-warm restart is the baseline, not the cold allocation peak.
    if (restarts.length >= 2) for (const key of ['programs','geometries','textures']) {
      const baseline = restarts[0].resourceSample[key];
      threshold(`${pageId}/${level}/${key}Growth`,Math.max(0,...restarts.slice(1).map(e=>e.resourceSample[key]-baseline)),budgets?.resources?.maximumGrowth?.[key]);
    }
  }
  return {schema:'specimen-performance-qualification',schemaVersion:1,
    status:reasons.length ? 'unqualified' : checks.some(x=>!x.passed) ? 'fail' : 'pass',
    reasons:[...new Set(reasons)], checks, captures:analyzed, loading,
    lifecycle:[...pages].map(([pageId,page])=>({pageId,cache:page.cache,events:page.data.lifecycle})),
    budgetApproval:budgets?.approval ?? null, machine:intake?.machine ?? null};
}
