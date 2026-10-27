import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CULTIVATION_LEVEL_DEBUG_SUPPORT } from '../src/debug/CultivationLevelDebug.ts';
import type { Input } from '../src/core/Input.ts';
import { CultivationLevelRuntime } from '../src/levels/CultivationLevelRuntime.ts';
import { CultivationRoomFiveController } from '../src/levels/CultivationRoomFiveController.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';
import type {LoopStats} from '../src/core/Loop.ts';

test('normal render never overwrites borrowed finale actors with a second world transform',()=>{
  const writes=[0,0,0],presents=[0,0,0];let draws=0,movieFrames=0;
  const presentation=(index:number)=>({setPosition(){writes[index]++;},present(){presents[index]++;},setVisible(){},
    setOpacity(){},setReflectionIntensity(){},updateDetail(){}});
  const body=()=>({position:new THREE.Vector3(64,30,280),previousPosition:new THREE.Vector3(64,30,280)});
  const bob=body(),goop=body(),volt=body();
  const movie={active:true,present(){movieFrames++;}};
  const renderLayer={scene:new THREE.Scene(),cameraRig:{camera:new THREE.PerspectiveCamera(),aimPresentationWeight:0,
    setThirdPersonOverride(){},isFirstPersonForTarget(){return false;},setContextualCamera(){},update(){},queueLookInput(){}},
    renderer:{compile(){},shadowMap:{type:THREE.PCFShadowMap}},render(){draws++;}};
  const runtime=new CultivationLevelRuntime({authoredAssets:cultivationAssets,host:{dataset:{}} as unknown as HTMLElement,
    input:{enabled:true,endPointerUpdate(){}} as unknown as Input,renderLayer:renderLayer as unknown as RenderLayer,
    progression:{unlockedSlimeIds:['bob','goop'],activeSlimeId:'bob'},window:new EventTarget() as unknown as Window,debugAvailable:false});
  const internal=runtime as unknown as {resources:unknown};
  internal.resources={roomFiveFinale:movie,pair:{bobBody:bob,goopBody:goop,activeBody:bob},voltBody:volt,
    renderedBobPosition:new THREE.Vector3(),renderedGoopPosition:new THREE.Vector3(),renderedVoltPosition:new THREE.Vector3(),
    bobPresentation:presentation(0),goopPresentation:presentation(1),voltPresentation:presentation(2),
    controller:{readModel:{state:'playing'}},deathSequence:{isPlaying:true},manager:{activeSlimeId:'bob',isAvailable:()=>false},
    scene:{setDarkRoomLighting(){}},lightingPass:{setQuality(){},update(){}},goopAcidPresentation:{update(){}},pairPresentation:{update(){}}};
  const stats={frameDeltaSeconds:1/60,rawFrameDeltaSeconds:1/60} as LoopStats;
  runtime.render(.5,stats);
  assert.deepEqual(writes,[0,0,0]);assert.deepEqual(presents,[0,0,0]);
  assert.equal(movieFrames,1);assert.equal(draws,1);
  movie.active=false;runtime.render(.5,stats);
  assert.deepEqual(writes,[1,1,1]);assert.deepEqual(presents,[1,1,1],'normal placement/presentation resumes after hand-back');
});

test('Room 3 cinematics freeze on pause/preparation and take authority ahead of ordinary input or combat',()=>{
  let steps=0,clears=0,ended=0;
  const host={dataset:{}} as unknown as HTMLElement;
  const input={enabled:true,wasPressed:()=>false,resetState(){clears++;},endFixedUpdate(){ended++;}} as unknown as Input;
  const runtime=new CultivationLevelRuntime({authoredAssets:cultivationAssets,host,input,
    renderLayer:{cameraRig:{camera:new THREE.PerspectiveCamera()}} as unknown as RenderLayer,
    progression:{unlockedSlimeIds:['bob','goop'],activeSlimeId:'bob'},window:new EventTarget() as unknown as Window,debugAvailable:false});
  const movie={active:false,tryBegin(){if(this.active)return false;this.active=true;return true;},update(){steps++;return false;}};
  const internal=runtime as unknown as {resources:unknown;lifecycle:{state:string};preparationQueue:unknown};
  internal.resources={roomThreeClearance:movie,controller:{readModel:{state:'playing'}},deathSequence:{isPlaying:true},acidProjectileSystem:{reset(){clears++;}},
    pair:{bobBody:{position:new THREE.Vector3()}},authoredPreview:{roomThreeObservation:{updateCamera(){}}}};
  internal.lifecycle={state:'stopped'};runtime.fixedUpdate(.1);assert.equal(steps,0);
  internal.lifecycle.state='running';internal.preparationQueue={diagnostics:{pending:true}};runtime.fixedUpdate(.1);assert.equal(steps,0);
  internal.preparationQueue=undefined;runtime.fixedUpdate(.1);runtime.fixedUpdate(.1);
  assert.equal(steps,2);assert.equal(clears,2,'Aim/projectiles and input clear once, at the trigger.');
  assert.equal(input.enabled,true,'Native pause/pointer controls remain available; movement and fire are gated by cinematic authority.');
  assert.equal(ended,3);
  assert.equal(host.dataset.cinematic,'cultivation-clearance');
  movie.update=()=>{movie.active=false;return true;};runtime.fixedUpdate(.1);
  assert.equal(host.dataset.cinematic,undefined,'The letterbox/HUD boundary is cleared at hand-back.');
});

test('the entrance preserves native pointer capture while blocking movement/jumping/switching/shooting, and freezes through pause/preparation',()=>{
  const input={enabled:true,resetState(){},setEnabled(enabled:boolean){this.enabled=enabled;},endFixedUpdate(){},
    wasPressed:(action:string)=>['switchSlime','jump','fireAbility'].includes(action),wasReleased:()=>false,
    isDown:(action:string)=>['moveForward','jump','aimAbility'].includes(action)} as unknown as Input;
  const cameraRig={reset(){},setFollowTarget(){}};
  const runtime=new CultivationLevelRuntime({authoredAssets:cultivationAssets,
    host:{dataset:{}} as unknown as HTMLElement,input,renderLayer:{cameraRig} as unknown as RenderLayer,
    progression:{unlockedSlimeIds:['bob','goop'],activeSlimeId:'goop'},window:new EventTarget() as unknown as Window,debugAvailable:false});
  const moves:number[][]=[],shots:boolean[]=[];
  const makeBody=()=>({position:new THREE.Vector3(),grounded:false,teleport(p:THREE.Vector3){this.position.copy(p);},applyKnockback(){},
    update(_dt:number,movement:THREE.Vector3,jump?:{pressed:boolean;held:boolean}){moves.push(movement.toArray());assert.ok(!jump?.pressed&&!jump?.held);}});
  const bob=makeBody(),goop=makeBody(),poses:THREE.Vector3[]=[];
  const room=new THREE.Group();room.position.x=64;
  const resources={authoredPreview:{roomOne:{root:room}},pair:{bobBody:bob,goopBody:goop},
    bobPresentation:{setPosition(p:THREE.Vector3){poses.push(p.clone());}},goopPresentation:{setPosition(p:THREE.Vector3){poses.push(p.clone());}},
    goopAcidPresentation:{resume(){},suspend(){}},acidProjectileSystem:{cancelAim(){}},
    controller:{readModel:{state:'playing'}},deathSequence:{isPlaying:true}};
  const internal=runtime as unknown as {resources:typeof resources;lifecycle:{state:string};preparationQueue:unknown;
    ventArrival:{active:boolean;seconds:number;update(dt:number,b:typeof bob,g:typeof goop):boolean};
    beginVentArrival(r:typeof resources):void;startResources():void;stopResources():void};
  internal.resources=resources;internal.lifecycle={state:'running'};
  internal.beginVentArrival(resources);assert.equal(input.enabled,false);assert.equal(internal.ventArrival.active,true);
  assert.deepEqual(poses.map(p=>p.toArray()),[[53,24,4],[55,21.5,4]]);
  internal.startResources();assert.equal(input.enabled,true,'Native input stays enabled so the Enter Level gesture can capture the pointer.');
  internal.stopResources();const frozen=internal.ventArrival.seconds;internal.lifecycle.state='stopped';runtime.fixedUpdate(1);
  assert.equal(internal.ventArrival.seconds,frozen);internal.startResources();assert.equal(input.enabled,true);
  internal.lifecycle.state='running';internal.preparationQueue={diagnostics:{pending:true}};runtime.fixedUpdate(1);
  assert.equal(internal.ventArrival.seconds,frozen,'Preparation time is not movie time.');
  internal.preparationQueue=undefined;
  // The UI also owns native input enablement. Gameplay gating must therefore
  // be authoritative in fixedUpdate, not depend on Input.enabled staying false.
  Object.assign(resources,{authoredPreview:undefined,pair:{bobBody:bob,goopBody:goop,activeBody:goop},
    manager:{isAvailable:()=>false},movement:new THREE.Vector3(3,0,3),noMovement:new THREE.Vector3(),jumpInputState:{},
    radiation:{update(){}},radiationTargets:[],buttonDoorCoordinator:{update(){}},dissolveSystem:{update(){}}});
  Object.assign(resources.controller,{update(){}});
  Object.assign(resources.acidProjectileSystem,{update(_dt:number,options:{gameplayInputEnabled:boolean}){shots.push(options.gameplayInputEnabled);}});
  Object.assign(internal,{updateStructuralAssemblies(){},updateBobPresentation(){}});
  runtime.fixedUpdate(1/60);assert.deepEqual(moves,[[0,0,0],[0,0,0]]);assert.deepEqual(shots,[false]);
  bob.grounded=goop.grounded=true;
  internal.ventArrival.update(2.2,bob,goop);assert.equal(internal.ventArrival.update(.66,bob,goop),true);
  internal.startResources();assert.equal(input.enabled,true,'Normal lifecycle resumes controls after the entrance.');
});

test('ordinary production requires the baked authored assets before construction', () => {
  assert.throws(() => new CultivationLevelRuntime({
    host: { dataset: {} } as unknown as HTMLElement,
    input: {} as Input,
    renderLayer: {} as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop'], activeSlimeId: 'bob' },
    window: new EventTarget() as unknown as Window,
    debugAvailable: false,
    authoredAssets: undefined!,
  }), /authored assets must be loaded/);
});

test('failed Cultivation construction rolls back attached resources', () => {
  const scene = new THREE.Scene();
  const addToScene = scene.add.bind(scene);
  let sceneAdditions = 0;
  scene.add = ((...objects: THREE.Object3D[]) => {
    addToScene(...objects);
    sceneAdditions += 1;
    if (sceneAdditions === 2) throw new Error('injected scene failure');
    return scene;
  }) as typeof scene.add;

  let cameraClearCount = 0;
  const renderLayer = {
    scene,
    cameraRig: {
      clearFollowTarget: () => {
        cameraClearCount += 1;
      },
    },
  } as unknown as RenderLayer;
  const inputStates: boolean[] = [];
  let pointerReleaseCount = 0;
  const input = {
    setEnabled: (enabled: boolean) => inputStates.push(enabled),
    releasePointerLock: () => {
      pointerReleaseCount += 1;
    },
  } as unknown as Input;
  const host = { dataset: {} } as unknown as HTMLElement;
  const runtime = new CultivationLevelRuntime({
    authoredAssets: cultivationAssets,
    host,
    input,
    renderLayer,
    progression: {
      unlockedSlimeIds: ['bob', 'goop'],
      activeSlimeId: 'bob',
    },
    window: new EventTarget() as unknown as Window,
    debugAvailable: false,
  });

  assert.throws(() => runtime.load(), /injected scene failure/);
  assert.equal(runtime.state, 'unloaded');
  assert.equal(scene.children.length, 0);
  assert.equal(cameraClearCount, 1);
  assert.deepEqual(inputStates, [false]);
  assert.equal(pointerReleaseCount, 1);

  runtime.dispose();
  assert.equal(runtime.state, 'disposed');
  assert.equal(scene.children.length, 0);
});

test('Level 2 zero shortcut is debug-only and one-shot', () => {
  const inputStates: boolean[] = [];
  const input = {
    enabled: true,
    setEnabled: (enabled: boolean) => inputStates.push(enabled),
    releasePointerLock: () => undefined,
  } as unknown as Input;
  const runtime = new CultivationLevelRuntime({
    authoredAssets: cultivationAssets,
    host: { dataset: {} } as unknown as HTMLElement,
    input,
    renderLayer: { scene: new THREE.Scene() } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop'], activeSlimeId: 'bob' },
    window: new EventTarget() as unknown as Window,
    debugAvailable: true,
    debugSupport: CULTIVATION_LEVEL_DEBUG_SUPPORT,
  });
  let unlocked = false;
  let emitted: unknown;
  const internals = runtime as unknown as {
    lifecycle: { state: string };
    resources: Record<string, any>;
    onSkipToLevelThree: (event: KeyboardEvent) => void;
  };
  internals.lifecycle = { state: 'running' };
  internals.resources = {
    deathSequence: { isPlaying: true },
    controller: { readModel: { state: 'playing' } },
    manager: {
      isRegistered: () => false,
      registerBody() {},
      unlock(id: string) { unlocked = id === 'volt'; },
      getRosterState: () => [],
      activeSlimeId: 'bob',
    },
    pair: { bobBody: { position: new THREE.Vector3(1, 2, 3) } },
    voltBody: { recoverAt(position: THREE.Vector3) { assert.deepEqual(position.toArray(), [1, 2, 3]); } },
    voltPresentation: { reset() {}, setPosition() {}, setVisible() {} },
  };
  runtime.events.on('completed', (event) => { emitted = event; });
  let prevented = false;
  const keyEvent = {
    code: 'Numpad0', repeat: false, target: null,
    preventDefault: () => { prevented = true; },
  } as unknown as KeyboardEvent;
  (runtime as unknown as { debugAvailable: boolean }).debugAvailable = false;
  internals.onSkipToLevelThree(keyEvent);
  assert.equal(unlocked, false);
  assert.equal(prevented, false);
  assert.deepEqual(inputStates, []);
  (runtime as unknown as { debugAvailable: boolean }).debugAvailable = true;
  internals.onSkipToLevelThree(keyEvent);
  internals.onSkipToLevelThree(keyEvent);

  assert.equal(prevented, true);
  assert.equal(unlocked, true);
  assert.deepEqual(inputStates, [false]);
  assert.deepEqual(emitted, { levelId: 'level-2', nextLevelId: 'level-3' });
});

test('Volt finale takes authority at the button, freezes on pause/preparation and delays unlock/handoff until completion', () => {
  let enabled=true,unlocked=false,registered=false,transitions=0,clears=0;
  const host={dataset:{}} as unknown as HTMLElement;
  const input={enabled:true,setEnabled(value:boolean){enabled=value;this.enabled=value;},releasePointerLock(){},
    resetState(){},endFixedUpdate(){},wasPressed:()=>false} as unknown as Input;
  const camera=new THREE.PerspectiveCamera();
  const runtime=new CultivationLevelRuntime({authoredAssets:cultivationAssets,host,input,
    renderLayer:{scene:new THREE.Scene(),cameraRig:{camera}} as unknown as RenderLayer,
    progression:{unlockedSlimeIds:['bob','goop'],activeSlimeId:'bob'},window:new EventTarget() as unknown as Window,debugAvailable:false});
  const c=new CultivationRoomFiveController();c.reset('controls');c.update(1.5,false,false,false,true);
  const pod=new THREE.Group();pod.position.set(0,25,49);
  const movie={active:false,complete:false,elapsed:0,finish:false,
    begin(eye:THREE.PerspectiveCamera){assert.equal(eye,camera);this.active=true;return true;},
    update(dt:number){this.elapsed+=dt;if(this.finish){this.active=false;this.complete=true;return true;}return false;}};
  const resources={roomFiveFinale:movie,
    authoredPreview:{workload:{simulated:new Set([5])},roomFive:{controller:c,pod},roomFour:{controller:{readModel:{state:'complete'}}}},
    controller:{readModel:{state:'playing'}},deathSequence:{isPlaying:true},acidProjectileSystem:{reset(){clears++;}},
    manager:{isAvailable:()=>unlocked,isRegistered:()=>registered,registerBody(){registered=true;},unlock(){unlocked=true;},getRosterState:()=>[],activeSlimeId:'bob'},
    voltBody:{recoverAt(p:THREE.Vector3){assert.deepEqual(p.toArray(),[0,25,49]);}},voltPresentation:{reset(){},setPosition(){},setVisible(){}},
  };
  const internal=runtime as unknown as {resources:typeof resources;authoredPreviewProgression:unknown;roomFiveCheckpoint:string;
    lifecycle:{state:string};preparationQueue:unknown;updateRoomFive(dt:number,r:typeof resources):void};
  internal.resources=resources;internal.authoredPreviewProgression={roomId:5};internal.roomFiveCheckpoint='controls';internal.lifecycle={state:'running'};
  runtime.events.on('completed',()=>transitions++);
  internal.updateRoomFive(1/60,resources);
  assert.equal(movie.active,true);assert.equal(host.dataset.cinematic,'cultivation-finale');assert.equal(clears,1);
  assert.equal(transitions,0);assert.equal(unlocked,false,'the old four-second release cannot skip the movie');
  runtime.fixedUpdate(.1);assert.equal(movie.elapsed,.1);
  internal.lifecycle.state='stopped';runtime.fixedUpdate(1);assert.equal(movie.elapsed,.1);
  internal.lifecycle.state='running';internal.preparationQueue={diagnostics:{pending:true}};runtime.fixedUpdate(1);assert.equal(movie.elapsed,.1);
  internal.preparationQueue=undefined;movie.finish=true;runtime.fixedUpdate(.1);
  assert.equal(transitions,1);assert.equal(unlocked,true);assert.equal(registered,true);assert.equal(c.complete,true);assert.equal(enabled,false);
  runtime.fixedUpdate(.1);assert.equal(transitions,1);
});

test('8 shortcut belongs only to a loaded running Level 2 dev runtime; editable targets, pause and repeats cannot trigger it',()=>{
  const input={enabled:true} as unknown as Input;
  const runtime=new CultivationLevelRuntime({authoredAssets:cultivationAssets,host:{dataset:{}} as unknown as HTMLElement,input,
    renderLayer:{} as RenderLayer,progression:{unlockedSlimeIds:['bob','goop'],activeSlimeId:'bob'},window:new EventTarget() as unknown as Window,debugAvailable:false});
  let teleports=0,starts=0,skips=0,prevented=0;
  const movie={active:false,complete:false,requestSkip(){skips++;}};
  const resources={roomFiveFinale:movie,authoredPreview:{},deathSequence:{isPlaying:true},controller:{readModel:{state:'playing'}},manager:{activate(id:string){assert.equal(id,'bob');}}};
  const internal=runtime as unknown as {resources:typeof resources|undefined;lifecycle:{state:string};debugAvailable:boolean;
    teleportToAuthoredPreviewRoom(id:number):boolean;beginVoltFinale(r:typeof resources,force:boolean):boolean;onVoltFinaleKeyDown(e:KeyboardEvent):void;};
  internal.resources=resources;internal.lifecycle={state:'running'};
  internal.teleportToAuthoredPreviewRoom=id=>{assert.equal(id,5);teleports++;return true;};
  internal.beginVoltFinale=(_r,force)=>{assert.equal(force,true);starts++;return true;};
  const key=(code='Digit8',repeat=false)=>({code,repeat,target:null,preventDefault(){prevented++;}} as unknown as KeyboardEvent);
  internal.onVoltFinaleKeyDown(key());assert.equal(starts,0,'release builds reject developer shortcuts');
  internal.debugAvailable=true;internal.onVoltFinaleKeyDown(key());assert.equal(starts,1);assert.equal(teleports,1);
  internal.onVoltFinaleKeyDown(key('Numpad8'));assert.equal(starts,2);
  internal.onVoltFinaleKeyDown(key('Digit8',true));internal.lifecycle.state='stopped';internal.onVoltFinaleKeyDown(key());
  internal.lifecycle.state='running';internal.resources=undefined;internal.onVoltFinaleKeyDown(key());assert.equal(starts,2,'unloaded/non-Level-2 resources cannot run it');
  internal.resources=resources;movie.active=true;internal.onVoltFinaleKeyDown(key());assert.equal(starts,2);
  internal.onVoltFinaleKeyDown(key('Enter'));assert.equal(skips,1);assert.equal(prevented,3);
});

test('Volt rescue menu preview is development-only and launches the real Room 5 finale from stopped preparation', () => {
  const runtime=Object.create(CultivationLevelRuntime.prototype) as CultivationLevelRuntime;
  const internal=runtime as any;
  let teleports=0,starts=0,activated='';
  Object.assign(internal,{
    voltRescuePreviewAvailable:false,debugAvailable:true,lifecycle:{state:'stopped'},
    resources:{authoredPreview:{},roomFiveFinale:{},manager:{activate(id:string){activated=id;}}},
    input:{releasePointerLock(){}},
    teleportToAuthoredPreviewRoom(room:number){assert.equal(room,5);teleports++;return true;},
    beginVoltFinale(_resources:unknown,force:boolean){assert.equal(force,true);assert.equal(activated,'bob');starts++;return true;},
  });
  assert.equal(runtime.previewVoltRescueForDebug(),false,'Production ?debug=1 does not enable this entry.');
  internal.voltRescuePreviewAvailable=true;
  assert.equal(runtime.previewVoltRescueForDebug(),true);
  assert.equal(teleports,1);assert.equal(starts,1);
  internal.lifecycle.state='unloaded';assert.equal(runtime.previewVoltRescueForDebug(),false);
  internal.lifecycle.state='stopped';internal.resources=undefined;assert.equal(runtime.previewVoltRescueForDebug(),false);
});

test('resource-free release fallback registers Volt without requiring the retired exit bay', () => {
  let enabled = true, unlocked = false, registered = false, transitions = 0;
  const input = { setEnabled(value: boolean) { enabled = value; }, releasePointerLock() {} } as unknown as Input;
  const runtime = new CultivationLevelRuntime({
    authoredAssets: cultivationAssets,
    host: { dataset: {} } as unknown as HTMLElement, input,
    renderLayer: { scene: new THREE.Scene() } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop'], activeSlimeId: 'bob' },
    window: new EventTarget() as unknown as Window, debugAvailable: false,
  });
  const controller = new CultivationRoomFiveController();
  controller.reset('controls');
  controller.update(1.5, false, false, false, true);
  const pod = new THREE.Group(); pod.position.set(0, 2.65, 64);
  const resources = {
    authoredPreview: { workload: { simulated: new Set([5]) }, roomFive: { controller, pod }, roomFour: { controller: { readModel: { state: 'complete' } } } },
    deathSequence: { isPlaying: true },
    manager: {
      isAvailable: () => unlocked,
      isRegistered: () => registered,
      registerBody() { registered = true; },
      unlock() { unlocked = true; },
      getRosterState: () => [], activeSlimeId: 'bob',
    },
    voltBody: { recoverAt(position: THREE.Vector3) { assert.deepEqual(position.toArray(), [0, 2.65, 64]); } },
    voltPresentation: { reset() {}, setPosition() {}, setVisible() {} },
  };
  const internals = runtime as unknown as {
    resources: typeof resources; authoredPreviewProgression: { roomId: number };
    roomFiveCheckpoint: string; captureAuthoredPreviewCheckpoint(): void;
    updateRoomFive(dt: number, resources: typeof resources): void;
  };
  internals.resources = resources;
  internals.authoredPreviewProgression = { roomId: 5 };
  internals.roomFiveCheckpoint = 'controls';
  internals.captureAuthoredPreviewCheckpoint = () => {};
  runtime.events.on('completed', event => {
    assert.equal(unlocked, true, 'session progression already includes Volt');
    assert.equal(registered, true);
    assert.deepEqual(event, { levelId: 'level-2', nextLevelId: 'level-3' });
    transitions++;
  });
  internals.updateRoomFive(1 / 60, resources);
  assert.equal(transitions, 0, 'let the rescue animation finish');
  assert.equal(enabled, true);
  controller.update(4, false, false, false, false);
  internals.updateRoomFive(1 / 60, resources);
  assert.equal(controller.complete, true);
  assert.equal(enabled, false);
  assert.equal(transitions, 1);
  assert.equal(controller.exitPowered, false, 'no obsolete terminal or reunion requirement');
  internals.updateRoomFive(1 / 60, resources);
  assert.equal(transitions, 1, 'handoff is one-shot');
});
