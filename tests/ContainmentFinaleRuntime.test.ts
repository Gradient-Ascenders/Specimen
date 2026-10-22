import assert from 'node:assert/strict';
import test from 'node:test';
import { GreyboxLevelRuntime } from '../src/levels/GreyboxLevelRuntime.ts';
import type { GreyboxLevelRuntimeOptions } from '../src/levels/GreyboxLevelRuntime.ts';

test('cinematic audio stays separate from gameplay listeners and pauses/resumes with the runtime', () => {
  const calls: string[] = [];
  const runtime = new GreyboxLevelRuntime({
    debugAvailable: false, host: {}, window: {}, renderLayer: {},
    input: { setEnabled() {}, resetState() {} },
    audio: { setPaused(paused: boolean) { calls.push(`paused:${paused}`); } },
  } as unknown as GreyboxLevelRuntimeOptions);
  // Exercise the actual lifecycle hooks without constructing another world.
  const internals = runtime as unknown as {
    finale: { active: boolean }; finalePreparation: object;
    gameplayAudio: { setEnabled(value: boolean): void };
    resources: object; startResources(): void; stopResources(): void;
  };
  internals.finale = { active: true }; internals.finalePreparation = {};
  internals.gameplayAudio = { setEnabled(value) { calls.push(`gameplay:${value}`); } };
  internals.resources = { goopAcidPresentation: { resume() {}, suspend() {} },
    acidProjectileSystem: { cancelAim() {} }, deathSequence: { isPlaying: true }, containmentLevel: { state: 'completing' } };
  internals.startResources(); internals.stopResources(); internals.startResources();
  assert.deepEqual(calls, ['gameplay:false', 'paused:false', 'gameplay:false', 'paused:true', 'gameplay:false', 'paused:false']);
});

test('a preparation hold cannot consume the ending clock, and pause cannot run fixed cinematic work', () => {
  let elapsed = 0, endedInput = 0;
  const runtime = new GreyboxLevelRuntime({ debugAvailable: false, host: { dataset: {} }, window: {}, renderLayer: {},
    input: { setEnabled() {}, releasePointerLock() {}, endFixedUpdate() { endedInput++; } },
  } as unknown as GreyboxLevelRuntimeOptions);
  const internals = runtime as unknown as { lifecycle: { state: string }; finale: { active: boolean };
    finalePreparation: { ready: boolean }; resources: object };
  internals.lifecycle = { state: 'running' }; internals.finale = { active: false }; internals.finalePreparation = { ready: false };
  internals.resources = { deathSequence: { isPlaying: true }, containmentLevel: { state: 'completing', update() { elapsed++; } } };
  for (let i = 0; i < 300; i++) runtime.fixedUpdate(1 / 60);
  assert.equal(elapsed, 0); assert.equal(endedInput, 300);
  internals.lifecycle.state = 'stopped'; internals.finale.active = true; internals.finalePreparation.ready = true;
  runtime.fixedUpdate(1 / 60); assert.equal(elapsed, 0);
  let prevented = false;
  (runtime as unknown as { onSkipFinale(event: KeyboardEvent): void }).onSkipFinale({ code: 'Enter', repeat: false,
    preventDefault() { prevented = true; } } as KeyboardEvent);
  assert.equal(prevented, false, 'Enter still activates pause/settings controls instead of being consumed by skip.');
});

test('skipping the Containment finale stops its alarm before the transition hold',()=>{
  const stopped:string[]=[];
  const runtime=new GreyboxLevelRuntime({debugAvailable:false,host:{},window:{},renderLayer:{},
    input:{},audio:{stopLoop(key:string){stopped.push(key);}}} as unknown as GreyboxLevelRuntimeOptions);
  const state=runtime as any;let skipped=0;
  state.lifecycle={state:'running'};state.resources={containmentLevel:{state:'completing',skipEnding(){skipped++;}}};
  state.skipFinale();assert.deepEqual(stopped,['containment-finale-alarm','containment-finale-flight','containment-finale-door']);assert.equal(skipped,1);
});

test('9 is dev-only, Level-1-running-only, and previews the real ending rather than skipping to another level', () => {
  let begins=0, releases=0, cancelled=0, prevented=0;
  const input={enabled:true,setEnabled(value:boolean){this.enabled=value;},releasePointerLock(){releases++;}};
  const runtime=new GreyboxLevelRuntime({debugAvailable:true,host:{dataset:{}},window:{},renderLayer:{},input} as unknown as GreyboxLevelRuntimeOptions);
  const internals=runtime as unknown as {finaleShortcutAvailable:boolean;debugAvailable:boolean;debugInteractionEnabled:boolean;
    lifecycle:{state:string};resources:any;onPreviewFinale(event:KeyboardEvent):void};
  internals.lifecycle={state:'running'};
  const controller={state:'playing',beginEndingForDebug(){begins++;this.state='completing';return true;}};
  internals.resources={containmentLevel:controller,deathSequence:{isPlaying:true},acidProjectileSystem:{cancelAim(){cancelled++;}}};
  const key={code:'Digit9',repeat:false,target:null,preventDefault(){prevented++;}} as KeyboardEvent;
  internals.onPreviewFinale(key);assert.equal(begins,0,'Production ignores 9, even with diagnostics enabled.');
  internals.finaleShortcutAvailable=true;
  for(const state of ['stopped','unloaded','disposed']){internals.lifecycle.state=state;internals.onPreviewFinale(key);}
  internals.lifecycle.state='running';
  internals.resources.deathSequence.isPlaying=false;internals.onPreviewFinale(key);internals.resources.deathSequence.isPlaying=true;
  internals.debugInteractionEnabled=false;internals.onPreviewFinale(key);internals.debugInteractionEnabled=true;
  internals.debugAvailable=false;internals.onPreviewFinale(key);internals.debugAvailable=true;
  for(const change of [{repeat:true},{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{code:'Digit8'}]) internals.onPreviewFinale({...key,...change});
  assert.equal(begins,0);assert.equal(prevented,0);
  let completions=0;runtime.events.on('completed',()=>completions++);
  internals.onPreviewFinale(key);internals.onPreviewFinale(key);
  assert.equal(begins,1);assert.equal(completions,0,'Playback must finish before the normal Level 2 handoff.');
  assert.equal(cancelled,1);assert.equal(releases,1);assert.equal(prevented,1);assert.equal(input.enabled,false);
  controller.state='playing';input.enabled=true;
  assert.equal(runtime.previewEscapeForDebug(),true,'the developer menu can start the same real finale without a keyboard event');
  assert.equal(begins,2);assert.equal(completions,0);
});

test('only programs introduced by explicit finale compiler and primer jobs are planned', async () => {
  const THREE = await import('three');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
  const existing = {}, compiled = {}, primed = {}, unexpected = {};
  const programs = [existing];
  const viewport = new THREE.Vector4(0, 0, 640, 360);
  const renderer = {
    info: {programs, render: {calls: 0, triangles: 0, points: 0, lines: 0}},
    shadowMap: {enabled: false},
    compile() { programs.push(compiled); },
    render() { programs.push(primed); },
    getContext: () => ({getExtension: () => null}),
    getPixelRatio: () => 1,
    getRenderTarget: () => null, setRenderTarget() {},
    getViewport: (out: InstanceType<typeof THREE.Vector4>) => out.copy(viewport), setViewport() {},
    getScissor: (out: InstanceType<typeof THREE.Vector4>) => out.copy(viewport), setScissor() {},
    getScissorTest: () => false, setScissorTest() {},
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
  };
  const runtime = new GreyboxLevelRuntime({debugAvailable: false, host: {dataset: {}}, window: {}, input: {},
    renderLayer: {scene, renderer, cameraRig: {camera}, withShadowPreparation: (_: boolean, action: () => unknown) => action()},
  } as unknown as GreyboxLevelRuntimeOptions);
  const resources = {};
  const probe = runtime as unknown as {
    resources: object; finaleGeneration: number; finaleAbort: AbortController;
    finale: object;
    finalePreparationJobs(resources: object, generation: number): Generator<{label: string; run(): unknown}>;
  };
  probe.resources = resources; probe.finaleGeneration = 1; probe.finaleAbort = new AbortController();
  // Supply an already-constructed fixture; the skipped module job owns the real
  // asset construction, which is covered by the cinematic integration tests.
  probe.finale = {preparationJobs: function* () {}, visuals: {root: mesh}};
  const jobs = probe.finalePreparationJobs(resources, 1);
  assert.equal(jobs.next().value!.label, 'finale module');
  await jobs.next().value!.run();
  assert.equal(runtime.isPlannedShaderProgram(compiled), true);
  assert.equal(runtime.isPlannedShaderProgram(existing), false);
  jobs.next().value!.run();
  assert.equal(runtime.isPlannedShaderProgram(primed), true, 'the real primer may create a framebuffer variant');
  programs.push(unexpected);
  assert.equal(runtime.isPlannedShaderProgram(unexpected), false, 'subsequent live additions remain checked');
  assert.equal(mesh.parent, scene); assert.equal(jobs.next().done, true);
  geometry.dispose(); material.dispose();
});
