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
				staged: x.staged,
				cadence: stats(x.frames.filter((f) => f.drawn !== false).map((f) => f.cadence)),
				fixed: stats(x.frames.map((f) => f.fixed)),
				render: stats(x.frames.map((f) => f.render)),
				gpu: stats(x.frames.map((f) => f.gpu)),
				diagnostics: x.diagnostics,
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
