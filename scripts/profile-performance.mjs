/** Production-build diagnostic. See docs/performance-overhaul.md for scope and limitations.
 * Browser instrumentation is never shipped in the game.
 * Do not run concurrent tests or GPU workloads during captures.
 */
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {analyzeRecording} from './lib/performance-qualification.mjs';
const root = path.resolve(process.env.PROFILE_ROOT ?? process.cwd());
const label = process.env.PROFILE_LABEL ?? "candidate";
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error("PROFILE_LABEL must be a simple directory name");
const width = Number(process.env.PROFILE_WIDTH ?? 1280);
const height = Number(process.env.PROFILE_HEIGHT ?? 720);
const deviceScaleFactor = Number(process.env.PROFILE_DPR ?? 1);
const flightRecorder = process.env.PROFILE_RECORDER === "1";
const runs = Number(process.env.PROFILE_RUNS ?? 2);
const keyMs = Number(process.env.PROFILE_KEY_MS ?? 900);
const betaScope = process.env.PROFILE_SCOPE === "beta";
const preset = process.env.PROFILE_PRESET;
const resolutionCap = process.env.PROFILE_RESOLUTION_CAP;
const transmissionScale = process.env.PROFILE_TRANSMISSION_SCALE;
const requestedAngle=process.env.PROFILE_ANGLE;
if (requestedAngle && !['d3d11','gl','vulkan','swiftshader'].includes(requestedAngle)) throw new Error('Unknown PROFILE_ANGLE');
if (requestedAngle==='d3d11' && process.platform!=='win32') throw new Error('D3D11 is Windows-only; omit PROFILE_ANGLE for the actual platform default.');
if (preset && !["normal", "performance"].includes(preset)) throw new Error("Unknown PROFILE_PRESET");
if (resolutionCap && !["0.75", "1", "1.5", "2"].includes(resolutionCap)) throw new Error("Unknown PROFILE_RESOLUTION_CAP");
if (preset === "performance" && Number(resolutionCap) > 1) throw new Error("Performance preset supports resolution caps up to 1");
if (transmissionScale && !["1", "0.75", "0.5"].includes(transmissionScale)) throw new Error("Unknown diagnostic PROFILE_TRANSMISSION_SCALE");
if (!Number.isInteger(runs) || runs < 1 || !Number.isFinite(keyMs) || keyMs <= 0) throw new Error("PROFILE_RUNS must be a positive integer and PROFILE_KEY_MS must be positive");
if (![width,height].every(v => Number.isInteger(v) && v > 0) || !Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) throw new Error("PROFILE_WIDTH/HEIGHT must be positive integers and PROFILE_DPR must be positive");
const out = path.resolve(root, "artifacts/performance-overhaul", label);
await mkdir(out, { recursive: true });
let occupied = false;
try {
	occupied = (await fetch("http://127.0.0.1:4190")).ok;
} catch {}
if (occupied) throw new Error("Profiling port 4190 is already in use");
const assets = path.join(root, process.env.PROFILE_DIST ?? "dist", "assets");
const assetHashes = {};
for (const name of await readdir(assets)) if (name.endsWith(".js")) assetHashes[name] = createHash("sha256").update(await readFile(path.join(assets, name))).digest("hex");
const buildManifest=JSON.parse(await readFile(path.join(root,process.env.PROFILE_DIST ?? 'dist','build-manifest.json'),'utf8'));
if (buildManifest.dirty || buildManifest.sha!==execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim())
  throw new Error('Build committed source at the current HEAD before collecting benchmark evidence.');
const server = spawn(process.execPath, [
	path.join(root, "node_modules/vite/bin/vite.js"),
	"preview",
	"--host",
	"127.0.0.1",
	"--port",
	"4190",
	"--strictPort",
	...process.env.PROFILE_DIST ? ["--outDir", process.env.PROFILE_DIST] : []
], {
	cwd: root,
	stdio: "ignore",
	windowsHide: true
});
const report = {
	label,
	gitSha: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
	os: {platform: os.platform(), release: os.release(), version: os.version()},
    hardware:{cpu:os.cpus()[0]?.model ?? 'unavailable',logicalCpus:os.cpus().length,
      totalMemoryBytes:os.totalmem(),powerState:'not observed; record manually',driver:'record chrome://gpu separately'},
	cacheProtocol:'Instrumented module routing disables HTTP cache. Repeated runs share a browser/driver cache of uncontrolled temperature; these are NOT browser-cold/warm qualification pairs.',
	protocol: {width,height,deviceScaleFactor,flightRecorder,headless:process.env.PROFILE_HEADLESS !== "0",keyMs},
	requestedGraphics: {preset, resolutionCap, transmissionScale},
	recordedAt: new Date().toISOString(),
	assetHashes,
    buildManifest,
	runs: [],
	errors: []
};
let browser;
let activePage;
try {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch("http://127.0.0.1:4190")).ok) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 100));
	}
	browser = await chromium.launch({
		channel: process.env.PROFILE_BROWSER ?? (process.platform==='win32' ? 'msedge' : 'chrome'),
		headless: process.env.PROFILE_HEADLESS !== "0",
		args: [
			...(requestedAngle ? [`--use-angle=${requestedAngle}`] : []),
			...(process.platform==='win32' ? ["--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,msEfficiencyMode"] : []),
			"--disable-background-timer-throttling",
			"--disable-backgrounding-occluded-windows",
			"--disable-renderer-backgrounding"
		]
	});
	report.browserVersion = browser.version();
	for (let run = 0; run < runs; run++) {
		const context = await browser.newContext({
			viewport: {
				width,
				height
			},
			deviceScaleFactor
		});
		const page = await context.newPage();
		activePage = page;
		page.setDefaultTimeout(24e4);
		page.on("pageerror", (e) => report.errors.push(e.message));
		page.on("console", (m) => {
			if (m.type() === "error") report.errors.push(m.text());
		});
		page.on("response", (r) => {
			if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
		});
		await page.addInitScript((gpu) => {
			globalThis.__enableGpu = gpu;
			globalThis.__profiles = [];
			globalThis.__instanceArrays = new WeakMap();
			const upload = WebGL2RenderingContext.prototype.bufferData;
			WebGL2RenderingContext.prototype.bufferData = function(...args) {
				const p = globalThis.__profiles.at(-1), a = args[1];
				if (p) p.bufferAllocations.push({
					bytes: a?.byteLength ?? (typeof a === "number" ? a : 0),
					instance: globalThis.__instanceArrays.get(a),
					phase: globalThis.__uploadPhase
				});
				return upload.apply(this, args);
			};
			globalThis.__attach = (r, name) => {
				globalThis[name] = r;
				globalThis.__activeRuntime = r;
				const profile = {
					name,
					phases: [],
					compiles: [],
					frames: [],
					longTasks: [],
					slowDraws: [],
					bufferAllocations: []
				};
				globalThis.__profiles.push(profile);
				r.__profile = profile;
				for (const method of [
					"load",
					"unload",
					"prepareLightingPrograms",
					"preparePresentation"
				]) if (r[method]) {
					const old = r[method];
					r[method] = function(...args) {
						const t = performance.now();
						const finish = () => {
							profile.phases.push({
								method,
								ms: performance.now() - t
							});
							if (method === "load") r.renderLayer.scene.traverse((o) => {
								if (o.isInstancedMesh) {
									__instanceArrays.set(o.instanceMatrix.array, o.name + ":matrix");
									if (o.instanceColor) __instanceArrays.set(o.instanceColor.array, o.name + ":color");
								}
							});
						};
						const result = old.apply(this, args);
						if (result?.then) return result.then((v) => {
							finish();
							return v;
						});
						finish();
						return result;
					};
				}
				const renderer = r.renderLayer.renderer;
                if (!renderer.__shadowCpuProbe) {
                    renderer.__shadowCpuProbe = true;
                    const shadowRender = renderer.shadowMap.render;
                    renderer.shadowMap.render = function(...args) {
                        const start = performance.now();
                        try {return shadowRender.apply(this,args);}
                        finally {globalThis.__shadowCpuMs = (globalThis.__shadowCpuMs ?? 0) + performance.now()-start;}
                    };
                }
				if (!renderer.__profiled) {
					renderer.__profiled = true;
					const compileSync = renderer.compile;
					renderer.compile = function(...args) {
						const active = globalThis.__activeRuntime;
						const start = performance.now();
						try { return compileSync.apply(this, args); }
						finally {
							if (args[0] === active.preparationLightState) {
								active.__profile.lightStateRefreshes ??= [];
								active.__profile.lightStateRefreshes.push({start, ms:performance.now()-start});
							}
						}
					};
					const old = renderer.compileAsync;
					renderer.compileAsync = function(...args) {
						const active = globalThis.__profiles.at(-1), before = this.info.programs.length, t = performance.now();
						let sync;
						const result = old.apply(this, args);
						sync = performance.now() - t;
						return result.then((v) => {
							active.compiles.push({
								ms: performance.now() - t,
								sync,
								newPrograms: this.info.programs.length - before,
								objects: args[0].children.length,
								programNames: this.info.programs.slice(before).map((p) => p.name)
							});
							return v;
						});
					};
					const gpuDraw = renderer.render;
					renderer.render = function(...args) {
						const p = globalThis.__profiles.at(-1), n = this.info.programs.length, t = performance.now(), oldPhase = globalThis.__uploadPhase;
						globalThis.__uploadPhase = args[0] === __activeRuntime.renderLayer.scene && __activeRuntime.state === "running" ? "live" : "preparation";
						try {
							return gpuDraw.apply(this, args);
						} finally {
							globalThis.__uploadPhase = oldPhase;
							const ms = performance.now() - t;
							if (ms > 10) p.slowDraws.push({
								ms,
								newPrograms: this.info.programs.length - n,
								scene: args[0].name,
								programs: this.info.programs.slice(n).map((p) => ({
									name: p.name,
									key: p.cacheKey
								}))
							});
						}
					};
					const draw = r.renderLayer.render;
					r.renderLayer.render = function(...args) {
						const p = globalThis.__profiles.at(-1), n = this.renderer.info.programs.length;
						const result = draw.apply(this, args);
						p.lastDraw = performance.now();
						p.liveNewPrograms = this.renderer.info.programs.length - n;
						return result;
					};
				}
				let fixed = 0;
				const update = r.fixedUpdate;
				r.fixedUpdate = function(...args) {
					const t = performance.now();
					try {
						return update.apply(this, args);
					} finally {
						fixed += performance.now() - t;
					}
				};
				const render = r.render;
				r.render = function(...args) {
					const t = performance.now(), before = renderer.info.programs.length, beforeKeys = profile.liveKeyCalls ?? 0;
                    globalThis.__shadowCpuMs = 0;
					try {
						return render.apply(this, args);
					} finally {
						if (this.state === "running") profile.frames.push({
							start: t,
							cadence: args[1].rawFrameDeltaSeconds * 1e3,
							render: performance.now() - t,
                            shadowCpu: globalThis.__shadowCpuMs ?? 0,
							fixed,
							programs: renderer.info.programs.length,
							newPrograms: renderer.info.programs.length - before,
							calls: renderer.info.render.calls,
							triangles: renderer.info.render.triangles,
							geometries: renderer.info.memory.geometries,
							textures: renderer.info.memory.textures,
							room: this.roomState?.roomId ?? this.resources?.containmentLevel?.roomState?.roomId,
							visibility: document.visibilityState,
							focused: document.hasFocus(),
							drawn: profile.lastDraw >= t,
							liveNewPrograms: profile.lastDraw >= t ? profile.liveNewPrograms : 0,
							programKeyCalls: (profile.liveKeyCalls ?? 0) - beforeKeys,
                            steps: args[1].stepsThisFrame,
							heapBytes: performance.memory?.usedJSHeapSize,
							preparation: this.preparationQueue?.diagnostics.completed
						});
						fixed = 0;
					}
				};
				new PerformanceObserver((list) => {
					for (const e of list.getEntries()) profile.longTasks.push({
						start: e.startTime,
						ms: e.duration
					});
				}).observe({
					type: "longtask",
					buffered: true
				});
				return r;
			};
		}, process.env.PROFILE_GPU === "1" && !flightRecorder);
		await page.route("**/assets/*.js", async (route) => {
			const response = await route.fetch();
			let body = await response.text();
			// Expose the composition roots before load; preserve all production code.
			body = body.replace(/\{initialRuntime:([\w$]+)/, '{initialRuntime:globalThis.__attach($1,"__one")');
			body = body.replace(/return new ([\w$]+)\.CultivationLevelRuntime\((\{[^;]*?\})\)/, "return globalThis.__attach(new $1.CultivationLevelRuntime($2),\"__two\")");
			body = body.replace(/new ([\w$]+)\.BlackoutLevelRuntime\((\{[^;]*?\})\)/, "globalThis.__attach(new $1.BlackoutLevelRuntime($2),\"__three\")");
			await route.fulfill({
				response,
				body
			});
		});
		const data = {
			run,
			cache: run ? "same browser shader cache; fresh HTTP context" : "fresh browser profile; driver cache uncontrolled",
			rooms: []
		};
		report.runs.push(data);
		console.log(label, "run", run, "boot");
		const t = performance.now();
		await page.goto("http://127.0.0.1:4190/?debug=1&benchmark=1", { waitUntil: "domcontentloaded" });
		console.log("early GPU", await page.evaluate(() => {
			const gl = __one.renderLayer.renderer.getContext(), e = gl.getExtension("WEBGL_debug_renderer_info");
			return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
		}));
		await page.locator("[data-action=\"start\"]").waitFor({ state: "visible" });
		data.readyMs = performance.now() - t;
		if (preset || resolutionCap) {
			await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
			if (preset) await page.locator('[data-setting="graphics-preset"]').selectOption(preset);
			if (resolutionCap) await page.locator('[data-setting="render-resolution"]').selectOption(resolutionCap);
			await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
		}
		const clicked = performance.now();
		await page.locator("[data-action=\"start\"]").click();
		await page.waitForFunction(() => ['opening','playing'].includes(document.querySelector('.game-flow')?.dataset.state));
		if (await page.locator('.game-flow').getAttribute('data-state') === 'opening') {
			await page.locator('[data-action="skip-opening"]').click();
		}
		await page.waitForFunction(() => globalThis.__one?.state === "running");
		await page.waitForFunction(() => __one.input.enabled && __one.__profile.frames.some((f) => f.drawn));
		data.playToControlMs = performance.now() - clicked;
		data.bootMs = performance.now() - t;
		data.environment = await page.evaluate(() => {
			const gl = __one.renderLayer.renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
			return {
				visible:document.visibilityState, focused:document.hasFocus(),
                drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],effectiveDpr:__one.renderLayer.renderer.getPixelRatio(),
                gpu: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
				maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
				timer: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
				viewport: [innerWidth, innerHeight],
				dpr: devicePixelRatio
			};
		});
		console.log(data.environment, "boot", data.bootMs);
		const sample = async (name, room, variant = "") => {
            if (!/^[a-z0-9_-]*$/.test(variant)) throw new Error("Invalid capture variant");
            const captureId = `run${run}-${name}-${room}${variant ? "-"+variant : ""}`;
			await page.bringToFront();
			const entered = performance.now();
			const requested = await page.evaluate(({ name, room }) => {
				const r = globalThis[name], t = performance.now();
				if (name === "__one") r.resources.containmentLevel.teleportToRoomForDebug(room);
				else if (name === "__two") {
                    r.teleportToAuthoredPreviewRoom(room);
                    // Debug staging resets death state but does not resume disabled input.
                    // Use the normal lifecycle before the measured sequence.
                    r.stop(); r.start();
                }
				else if (room === 2) r.input;
				return t;
			}, {
				name,
				room
			});
			if (name === "__three" && room === 2) await page.keyboard.press("2");
			await page.waitForTimeout(100);
			if (name === "__two") await page.waitForFunction((t) => __two.preparationQueue?.diagnostics.pending === false && __two.__profile.lastDraw > t, requested);
			data.rooms.push({
				name,
				room,
				entryMs: performance.now() - entered
			});
			await page.waitForTimeout(1e3);
			await page.locator("canvas").click();
            await page.waitForFunction(name => globalThis[name].input.enabled && globalThis[name].input.pointerLocked, name, {timeout:10000});
            if (name === "__three") {
                // Keep the historical Bob/Goop staged route comparable. The native
                // seven-scenario lab protocol separately exercises recorded Volt motion.
                const target = room === 2 ? "goop" : "bob";
                for (let attempt = 0; attempt < 3; attempt++) {
                    const active = await page.evaluate(() => __three.resources.manager.activeSlimeId);
                    if (active === target) break;
                    await page.keyboard.press("Tab", {delay:150});
                    await page.waitForFunction(previous => __three.resources.manager.activeSlimeId !== previous, active, {timeout:10000});
                }
                if (await page.evaluate(() => __three.resources.manager.activeSlimeId) !== target) throw new Error("Could not select the recorded Level 3 body");
            }
            if (transmissionScale) {
                // Diagnostic public API override only; allow target allocation before capture.
                await page.evaluate(({name, scale}) => {
                    globalThis[name].renderLayer.renderer.transmissionResolutionScale = Number(scale);
                }, {name, scale:transmissionScale});
                await page.waitForTimeout(1000);
            }
            const staged = await page.evaluate((name) => {
				const r = globalThis[name], b = r.resources.body ?? r.resources.pair?.activeBody ?? r.resources.group?.activeBody;
				return {
					body: b ? {
						x: b.position.x,
						y: b.position.y,
						z: b.position.z
					} : null,
					camera: r.renderLayer.cameraRig.camera.position.toArray(),
					quaternion: r.renderLayer.cameraRig.camera.quaternion.toArray()
				};
			}, name);
			if (flightRecorder) {
                await page.keyboard.press("Shift+KeyP");
                // Coverage markers retain normal frames between automatic hitch windows.
                // They are instrumentation markers, not subjective reports of a hitch.
                await page.keyboard.press("Shift+KeyH");
                console.log(name,room,"recorder started");
            }
			const start = await page.evaluate((name) => {
				const r = globalThis[name], renderer = r.renderLayer.renderer, gl = renderer.getContext(), ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
				r.renderLayer.scene.traverse(object => {
                    if (!object.material) return;
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    for (const material of materials) {
                        if (material.__profiledProgramKey) continue;
                        material.__profiledProgramKey = true;
                        const key = material.customProgramCacheKey;
                        material.customProgramCacheKey = function() {
                            if (globalThis.__uploadPhase === 'live') {
                                const profile = globalThis.__profiles.at(-1);
                                profile.liveKeyCalls = (profile.liveKeyCalls ?? 0) + 1;
                            }
                            return key.call(this);
                        };
                    }
                });
                if (globalThis.__enableGpu && ext && !r.__gpuAttached) {
					r.__gpuAttached = true;
					const draw = r.render;
					const queries = [];
					r.render = function(...args) {
						for (let i = queries.length - 1; i >= 0; i--) {
							const [q, f] = queries[i];
							if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
								if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) f.gpu = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
								gl.deleteQuery(q);
								queries.splice(i, 1);
							}
						}
						const q = queries.length < 32 ? gl.createQuery() : null;
						if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
						try {
							return draw.apply(this, args);
						} finally {
							if (q) {
								gl.endQuery(ext.TIME_ELAPSED_EXT);
								queries.push([q, r.__profile.frames.at(-1)]);
							}
						}
					};
				}
				return r.__profile.frames.length;
			}, name);
			// Short opposing moves keep a normal room capture close to its safe spawn.
            for (let elapsed = 0; elapsed < keyMs; elapsed += 500) {
                const stepMs = Math.min(500, keyMs-elapsed);
                if (flightRecorder) await page.keyboard.press("Shift+KeyH");
                await page.mouse.move(width/2 + (elapsed % 1000 ? 5 : -5), height/2, {steps:4});
                if (elapsed === 0) await page.keyboard.press("Space", {delay:150});
                for (const key of ["w", "s", "d", "a"]) {
                    await page.keyboard.down(key);
                    await page.waitForTimeout(stepMs);
                    await page.keyboard.up(key);
                }
            }
			if (flightRecorder) {
                await page.keyboard.press("Shift+KeyH");
				await page.keyboard.press("Shift+KeyP");
				const downloaded = page.waitForEvent("download");
				await page.keyboard.press("Shift+KeyE");
				await (await downloaded).saveAs(path.join(out, `${captureId}-flight.json`));
			}
			let captureValidation;
            if (flightRecorder) {
                const recording = JSON.parse(await readFile(path.join(out, captureId+"-flight.json"),"utf8"));
                const columns = Object.fromEntries(recording.frameColumns.map((key,index)=>[key,index]));
                const frames = [...new Map((recording.retainedFrames ?? recording.hitchWindows.flatMap(window=>window.frames)).map(row=>[row[columns.sequence],row])).values()];
                const qualification=analyzeRecording(recording);
                if (!qualification.valid) throw new Error('Invalid qualification capture: '+qualification.reasons.join(' '));
                const range = key => {const values=frames.map(row=>row[columns[key]]);return Math.max(...values)-Math.min(...values);};
                const active = [...new Set(frames.map(row=>row[columns.activeSlime]))];
                const states = [...new Set(frames.map(row=>row[columns.gameplayState]))];
                const cutscenes = [...new Set(frames.map(row=>row[columns.cutsceneState]))];
                const body = active[0] === "goop" ? "goop" : "bob";
                captureValidation = {active,states,cutscenes,rawFrames:frames.length,totalFrames:recording.summary.totalFrames,
                    bodyRange:["X","Y","Z"].map(axis=>range(body+axis)),cameraRange:["X","Y","Z"].map(axis=>range("camera"+axis))};
                const expectedState = name === "__three" ? "three-slime" : "playing";
                if (active.length!==1 || !["bob","goop"].includes(active[0]) || states.some(state=>state!==expectedState) || cutscenes.some(state=>state!=="none") ||
                    frames.length!==recording.summary.totalFrames || Math.max(...captureValidation.bodyRange)<.05 || Math.max(...captureValidation.cameraRange)<.05) {
                    throw new Error("Invalid interactive capture: "+JSON.stringify(captureValidation));
                }
            }
            const result = await page.evaluate(({ name, start }) => {
				const r = globalThis[name];
				return {
					frames: r.__profile.frames.slice(start),
					diagnostics: r.renderLayer.getDiagnostics(),
					transmissionResolutionScale: r.renderLayer.renderer.transmissionResolutionScale,
					glError: r.renderLayer.renderer.getContext().getError(),
					preparation: r.preparationQueue?.diagnostics
				};
			}, {
				name,
				start
			});
            if (flightRecorder && result.frames.some(frame => !frame.drawn)) {
                throw new Error("Loading/non-rendered frames entered the capture");
            }
            if (result.glError) throw new Error(`WebGL error ${result.glError} in ${captureId}`);
			data.rooms.push({
				name,
				room,
				staged,
				variant, captureValidation, ...result
			});
			console.log(name, room, "frames", result.frames.length, "programs", result.diagnostics.programs);
			await page.locator("canvas").screenshot({ path: path.join(out, `${captureId}.png`) });
			await writeFile(path.join(out, "raw.json"), JSON.stringify(report));
		};
		if (process.env.PROFILE_MODE !== "startup") for (const room of betaScope ? [1] : [
			1,
			3,
			5
		]) await sample("__one", room);
		data.oneWarmup = await page.evaluate(() => __one.lightingPrewarmProfile);
		data.resources = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\.(?:js|glb|bin)(?:$|\?)/.test(e.name)).map((e) => ({
			name: e.name,
			start: e.startTime,
			duration: e.duration,
			transferSize: e.transferSize
		})));
		data.onePrograms = await page.evaluate(() => __one.renderLayer.renderer.info.programs.map((p) => ({
			name: p.name,
			key: p.cacheKey
		})));
		data.profiles = await page.evaluate(() => __profiles);
		await writeFile(path.join(out, "raw.json"), JSON.stringify(report));
		if (process.env.PROFILE_SCOPE === "one") {
			await context.close();
			continue;
		}
		// Use the controller boundary: the runtime's completion handler unlocks
		// Goop before the session captures progression for Level 2.
		await page.evaluate(() => __one.resources.containmentLevel.completeForDebug());
		const transition = performance.now();
		await page.waitForFunction(() => document.querySelector('.game-flow')?.dataset.state === 'transitionFailed' ||
			document.querySelector('[data-action="enter-level"]')?.hidden === false);
		if (await page.locator('.game-flow').getAttribute('data-state') === 'transitionFailed') {
			throw new Error(await page.locator('[data-transition-failure-message]').textContent());
		}
		await page.locator("[data-action=\"enter-level\"]").click();
		await page.waitForFunction(() => globalThis.__two?.state === "running");
		data.twoTransitionMs = performance.now() - transition;
		console.log("two transition", data.twoTransitionMs);
		data.twoConfigurations = await page.evaluate(() => __two.preparationQueue?.configurations);
		await writeFile(path.join(out, "raw.json"), JSON.stringify(report));
		if (process.env.PROFILE_MODE !== "startup") for (const room of betaScope ? [5] : [
			1,
			2,
			3,
			4,
			5
		]) await sample("__two", room);
		if (betaScope && process.env.PROFILE_MODE !== "startup") {
			await page.keyboard.press("Tab", {delay:150});
			await page.waitForFunction(() => __two.resources.manager.activeSlimeId === "goop");
			await sample("__two", 5, "goop");
		}
		if (betaScope && process.env.PROFILE_EXTRA_ROOM_ONE === "1" && process.env.PROFILE_MODE !== "startup") {
			await sample("__two", 1, "background-preparation");
		}
		await page.evaluate(() => {
			__two.resources.manager.unlock("volt");
			__two.events.emit("completed", {
				levelId: "level-2",
				nextLevelId: "level-3"
			});
		});
		const three = performance.now();
		await page.locator("[data-action=\"enter-level\"]").click();
		await page.waitForFunction(() => globalThis.__three?.state === "running");
		data.threeTransitionMs = performance.now() - three;
		if (process.env.PROFILE_MODE !== "startup") for (const room of betaScope ? [1] : [1, 2]) await sample("__three", room);
		data.profiles = await page.evaluate(() => __profiles);
		await writeFile(path.join(out, "raw.json"), JSON.stringify(report));
		await context.close();
	}
} catch (e) {
	report.failure = e.stack;
	try {
		report.failureContext = await activePage?.evaluate(() => ({
			flow: document.querySelector('.game-flow')?.dataset.state,
			transitionFailure: document.querySelector('[data-transition-failure-message]')?.textContent,
			focused: document.hasFocus(), visibility: document.visibilityState,
			runtimes: ['__one','__two','__three'].map(name => ({name,
				state: globalThis[name]?.state,
				preparation: globalThis[name]?.preparationQueue?.diagnostics})),
		}));
	} catch {}
	process.exitCode = 1;
	console.error(e);
} finally {
	await writeFile(path.join(out, "raw.json"), JSON.stringify(report));
	await browser?.close();
	server.kill();
}
