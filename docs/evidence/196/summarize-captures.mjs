// Recompute exact metrics from the retained, unmodified recorder exports.
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const manifest = JSON.parse(await readFile(new URL('./captures.json', import.meta.url), 'utf8'));
const distribution = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const quantile = p => sorted[Math.min(sorted.length-1, Math.floor(sorted.length*p))];
  return {n:sorted.length, mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,
    p50:quantile(.5),p95:quantile(.95),p99:quantile(.99)};
};
for (const capture of manifest.captures) {
  const flight = JSON.parse(gunzipSync(await readFile(new URL(capture.file, import.meta.url))));
  const c = Object.fromEntries(flight.frameColumns.map((key,index)=>[key,index]));
  const rows = [...new Map(flight.hitchWindows.flatMap(w=>w.frames).map(r=>[r[c.sequence],r])).values()]
    .sort((a,b)=>a[c.sequence]-b[c.sequence]);
  if (rows.length !== flight.summary.totalFrames) throw new Error(`Incomplete raw coverage: ${capture.file}`);
  // Both builds exclude the first interval, which may predate recorder start.
  const eligible = rows.slice(1).filter(r => c.simulationState === undefined || r[c.simulationState] === 'playing');
  const sum = (frames, key) => frames.reduce((s,r)=>s+r[c[key]],0);
  const elapsedMs = sum(eligible,'deltaMs'), droppedMs = sum(eligible,'droppedSimulationMs');
  console.log(JSON.stringify({label:capture.label, room:capture.room, frames:rows.length, eligibleFrames:eligible.length,
    eligibleElapsedMs:elapsedMs, droppedMs, lostPercent:elapsedMs ? 100*droppedMs/elapsedMs : null,
    fixedStepMs:eligible.reduce((s,r)=>s+r[c.fixedSteps]*(c.fixedDeltaMs === undefined ? 1000/60 : r[c.fixedDeltaMs]),0),
    frameMs:distribution(eligible.map(r=>r[c.deltaMs])),
    hitches:Object.fromEntries([50,100,150].map(ms=>[ms,eligible.filter(r=>r[c.deltaMs]>ms).length])),
    updateCpuMs:distribution(eligible.map(r=>r[c.updateCpuMs])),
    renderCpuMs:distribution(eligible.map(r=>r[c.renderCpuMs])),
    gpuMs:distribution(eligible.filter(r=>r[c.gpuStatus]==='valid').map(r=>r[c.gpuMs])),
    recorderOverheadMs:flight.summary.averageRecorderOverheadMs,
    sessionSimulationTime:flight.summary.simulationTime ?? null,
  }));
}
