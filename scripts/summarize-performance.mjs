import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
const labels = process.argv.slice(2);
if (!labels.length || labels.some((l) => !/^[a-zA-Z0-9_-]+$/.test(l))) throw new Error("Supply profiling directory labels");
const root = path.resolve(process.env.PROFILE_ROOT ?? process.cwd(), "artifacts/performance-overhaul");
const stats = (values) => {
	const a = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (!a.length) return null;
	const mean = a.reduce((a, b) => a + b, 0) / a.length;
	const tail = a.slice(-Math.max(1, Math.ceil(a.length * .01)));
	return {
		n: a.length,
		p50: a[Math.floor(a.length * .5)],
		p95: a[Math.min(a.length - 1, Math.floor(a.length * .95))],
		p99: a[Math.min(a.length - 1, Math.floor(a.length * .99))],
		max: a.at(-1),
		mean,
		fps: 1e3 / mean,
		onePercentLow: 1e3 / (tail.reduce((a, b) => a + b, 0) / tail.length)
	};
};
const all = [];
for (const label of labels) {
	const r = JSON.parse(await readFile(path.join(root, label, "raw.json"), "utf8"));
    const flightRecordings = new Map();
    for (const run of r.runs) for (const room of run.rooms.filter(x => x.frames)) {
        let flight;
        try {
            flight = JSON.parse(await readFile(path.join(root, label, `run${run.run}-${room.name}-${room.room}${room.variant ? "-"+room.variant : ""}-flight.json`), "utf8"));
        } catch (error) {
            if (error.code === "ENOENT") continue;
            throw error;
        }
        const columns = Object.fromEntries(flight.frameColumns.map((name,index) => [name,index]));
        const rows = new Map();
        for (const window of flight.hitchWindows) for (const frame of window.frames) {
            if (!rows.has(frame[columns.sequence]) || frame[columns.gpuStatus] === "valid") rows.set(frame[columns.sequence], frame);
        }
        flightRecordings.set(`${run.run}:${room.name}:${room.room}:${room.variant ?? ""}`, {
            summary: flight.summary,
            viewport: flight.viewport,
            webgl: flight.webgl,
            rawFrameCoverage: rows.size,
            totalFrames: flight.summary.totalFrames,
            simulationTime: flight.summary.simulationTime ?? {
                source: 'legacy raw rows; no lifecycle eligibility or custom fixed delta available',
                elapsedMs: [...rows.values()].reduce((sum, row) => sum + row[columns.deltaMs], 0),
                droppedMs: [...rows.values()].reduce((sum, row) => sum + row[columns.droppedSimulationMs], 0),
                fixedStepMs: [...rows.values()].reduce((sum, row) => sum + row[columns.fixedSteps] * 1000 / 60, 0),
            },
            cadence: stats([...rows.values()].map(row => row[columns.deltaMs])),
            updateCpu: stats([...rows.values()].map(row => row[columns.updateCpuMs])),
            renderCpu: stats([...rows.values()].map(row => row[columns.renderCpuMs])),
            hitches: Object.fromEntries([50,100,150].map(ms => [ms,[...rows.values()].filter(row => row[columns.deltaMs] > ms).length])),
            gpu: stats([...rows.values()].filter(row => row[columns.gpuStatus] === "valid").map(row => row[columns.gpuMs])),
        });
    }
	all.push({
		label,
		errors: r.errors,
		failure: r.failure,
		assetHashes: r.assetHashes,
		runs: r.runs.map((d) => ({
			run: d.run,
			environment: d.environment,
			bootMs: d.bootMs,
			readyMs: d.readyMs,
			playToControlMs: d.playToControlMs,
			twoTransitionMs: d.twoTransitionMs,
			threeTransitionMs: d.threeTransitionMs,
			oneWarmup: d.oneWarmup,
			rooms: d.rooms.filter((x) => x.frames).map((x) => ({
				level: x.name,
				room: x.room,
                variant: x.variant,
                captureValidation: x.captureValidation,
				staged: x.staged,
				cadence: stats(x.frames.filter((f) => f.drawn !== false).map((f) => f.cadence)),
				fixed: stats(x.frames.map((f) => f.fixed)),
				render: stats(x.frames.map((f) => f.render)),
				gpu: stats(x.frames.map((f) => f.gpu)),
                flightRecorder: flightRecordings.get(`${d.run}:${x.name}:${x.room}:${x.variant ?? ""}`),
                shadowCpu: stats(x.frames.map(f => f.shadowCpu)),
                pacingTrusted: x.frames.every(f => f.visibility === "visible" && f.focused),
                hitches: Object.fromEntries([50,100,150].map(ms => [ms,x.frames.filter(f => f.drawn !== false && f.cadence > ms).length])),
				diagnostics: x.diagnostics,
				transmissionResolutionScale: x.transmissionResolutionScale,
				glError: x.glError,
				preparation: x.preparation && {
					...x.preparation,
					slowSteps: undefined
				},
				liveNewPrograms: x.frames.reduce((a, b) => a + (b.liveNewPrograms ?? 0), 0),
				heap: stats(x.frames.map((f) => f.heapBytes))
			})),
			entries: d.rooms.filter((x) => x.entryMs),
			profiles: d.profiles?.map((p) => ({
				name: p.name,
				phases: p.phases,
				compileMs: p.compiles.reduce((a, b) => a + b.ms, 0),
				compileSubmissionMs: p.compiles.reduce((a, b) => a + b.sync, 0),
				compileBatches: p.compiles.length,
				worstDraws: p.slowDraws?.slice().sort((a, b) => b.ms - a.ms).slice(0, 8).map((x) => ({
					ms: x.ms,
					newPrograms: x.newPrograms,
					scene: x.scene
				})),
				originalInstanceAllocations: p.bufferAllocations?.filter((x) => x.instance).reduce((a, b) => {
					const key = b.phase ?? "construction";
					a[key] ??= {
						count: 0,
						bytes: 0
					};
					a[key].count++;
					a[key].bytes += b.bytes;
					return a;
				}, {})
			}))
		}))
	});
}
await writeFile(path.join(root, "summary.json"), JSON.stringify(all, null, 2));
for (const r of all) for (const d of r.runs) {
	console.log(r.label, d.run, JSON.stringify({
		boot: d.bootMs,
		l2: d.twoTransitionMs,
		l3: d.threeTransitionMs
	}));
	for (const p of d.rooms) console.log(p.level, p.room, JSON.stringify({
		frame: p.cadence,
		fixed: p.fixed?.p50,
		render: p.render?.p50,
		programs: p.diagnostics.programs,
		newLive: p.liveNewPrograms
	}));
}
