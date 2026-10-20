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
});
