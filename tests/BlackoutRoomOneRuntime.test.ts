import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';
import type { Input, InputAction } from '../src/core/Input.ts';
import { DEFAULT_USER_KEY_BINDINGS } from '../src/core/KeyBindings.ts';
import type { LoopStats } from '../src/core/Loop.ts';
import { BlackoutLevelRuntime } from '../src/levels/BlackoutLevelRuntime.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';
import { CameraRig } from '../src/render/CameraRig.ts';
import { BLACKOUT_TRANSIT_CHECKPOINTS } from '../src/levels/BlackoutTransitRoom.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import type { BlackoutMaintenanceBayController } from '../src/levels/BlackoutMaintenanceBayController.ts';
import type { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';
import type { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';
import { loadSpecimen } from './fixtures/SpecimenAssetFixture.ts';
import type { SpecimenCharacterPresentation } from '../src/render/specimen/SpecimenCharacterPresentation.ts';
import type { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import type {BobCharacterPresentation} from '../src/render/bob/BobCharacterPresentation.ts';
import type {GoopCharacterPresentation} from '../src/render/goop/GoopCharacterPresentation.ts';
import { DEFAULT_KINEMATIC_BODY_CONFIG } from '../src/physics/KinematicBody.ts';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { AcidSurfaceMaterial } from '../src/render/environment/containment/AcidSurfaceMaterial.ts';
import {GelReflectionLighting} from '../src/render/slime/GelReflectionLighting.ts';
import type { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import type { FinalBossEncounter } from '../src/boss/FinalBossEncounter.ts';
import type { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_ARENA_ORBIT, FINAL_MERGE_ANCHOR, FINAL_BOSS_TUNING, FINAL_SPECIMEN_RADIUS } from '../src/boss/FinalBossConfig.ts';
import type { BossDefeatFinale } from '../src/cinematics/BossDefeatFinale.ts';
import { ENDING_TIMING } from '../src/cinematics/BossDefeatTimeline.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';

class TestButton {
  private listeners = new Set<() => void>();
  addEventListener(_type: string, listener: () => void): void { this.listeners.add(listener); }
  removeEventListener(_type: string, listener: () => void): void { this.listeners.delete(listener); }
  focus(): void {}
  click(): void { for (const listener of this.listeners) listener(); }
}

class TestElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: TestElement[] = [];
  readonly retryButton = new TestButton();
  className = '';
  hidden = false;
  inert = false;
  innerHTML = '';
  textContent: string | null = '';
  offsetWidth = 1;
  isConnected = false;
  ownerDocument!: TestDocument;
  readonly classList = { add: (..._tokens: string[]) => {}, remove: (..._tokens: string[]) => {} };
  setAttribute(_name: string, _value: string): void {}
  querySelector(_selector: string): TestButton { return this.retryButton; }
  append(...children: TestElement[]): void {
    for (const child of children) { child.isConnected = true; this.children.push(child); }
  }
  remove(): void { this.isConnected = false; }
}

class TestDocument {
  readonly elements: TestElement[] = [];
  createElement(): TestElement {
    const element = new TestElement();
    element.ownerDocument = this;
    this.elements.push(element);
    return element;
  }
}

class TestInput {
  private readonly held = new Set<InputAction>();
  private readonly pressed = new Set<InputAction>();
  private readonly released = new Set<InputAction>();
  enabled = true;
  pointerLocked = true;
  pointerDeltaX = 0;
  pointerDeltaY = 0;
  wasClearedSinceFixedUpdate = false;
  isDown(action: InputAction): boolean { return this.held.has(action); }
  wasPressed(action: InputAction): boolean { return this.pressed.has(action); }
  wasReleased(action: InputAction): boolean { return this.released.has(action); }
  press(action: InputAction): void { this.held.add(action); this.pressed.add(action); }
  release(action: InputAction): void { if (this.held.delete(action)) this.released.add(action); }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.resetState(); }
  resetState(): void { this.held.clear(); this.pressed.clear(); this.released.clear(); }
  endFixedUpdate(): void { this.pressed.clear(); this.released.clear(); this.wasClearedSinceFixedUpdate = false; this.endPointerUpdate(); }
  endPointerUpdate(): void { this.pointerDeltaX = 0; this.pointerDeltaY = 0; }
  requestPointerLock(): void { this.pointerLocked = true; }
  releasePointerLock(): void { this.pointerLocked = false; }
}

class TestCameraRig {
  setThirdPersonOverride(): void {}
  isFirstPersonForTarget(): boolean { return false; }
  toggleViewMode(): void {}

  readonly camera = new THREE.PerspectiveCamera();
  readonly aimOrigin = new THREE.Vector3(0, 0.46, 2);
  readonly aimDirection = new THREE.Vector3(0, 0, 1);
  aimActive = false;
  groundYaw = 0;
  setFollowTarget(): void {}
  clearFollowTarget(): void {}
  reset(): void { this.groundYaw = 0; }
  setGroundOrbitYawRadians(yaw: number): void { this.groundYaw = yaw; }
  queueLookInput(): void {}
  applyQueuedLookInput(): void {}
  copyGroundMovementDirection(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target.set(x, 0, z).normalize();
  }
  copySurfaceMovementDirection(x: number, z: number, _up: unknown, target: THREE.Vector3): THREE.Vector3 {
    return target.set(x, 0, z).normalize();
  }
  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
    origin.copy(this.aimOrigin);
    direction.copy(this.aimDirection);
  }
  setAimPresentationActive(active: boolean): void { this.aimActive = active; }
  update(): void {}
}

function roomOneInternals(runtime: BlackoutLevelRuntime) {
  const internal = runtime as unknown as {
    resources?: {
      group: {
        bobBody: { readonly position: THREE.Vector3 };
        goopBody: { readonly position: THREE.Vector3 };
        voltBody: { readonly position: THREE.Vector3 };
      };
      maintenanceBay?: {
        readonly target: { setConnectionState(connected: boolean): void };
        readonly door: { readonly progress: number; readonly state: string };
      };
    };
  };
  const resources = internal.resources;
  if (!resources?.maintenanceBay) {
    throw new Error('Room 1 runtime resources are not loaded.');
  }
  return {
    bodies: {
      bob: resources.group.bobBody,
      goop: resources.group.goopBody,
      volt: resources.group.voltBody,
    },
    bay: resources.maintenanceBay,
  };
}

function mutableRoomOneBodies(runtime: BlackoutLevelRuntime): Readonly<Record<'bob' | 'goop' | 'volt', { readonly position: THREE.Vector3 }>> {
  return roomOneInternals(runtime).bodies;
}

function createFixture(debugAvailable = true,playArrival=false,cameraRig=new TestCameraRig()) {
  const document = new TestDocument();
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  const scene = new THREE.Scene();
  const input = new TestInput();
  const host = document.createElement();
  const runtime = new BlackoutLevelRuntime({
    host: host as unknown as HTMLElement,
    input: input as unknown as Input,
    renderLayer: { scene, canvas: document.createElement(), cameraRig, keyBindings: DEFAULT_USER_KEY_BINDINGS,
      renderer: { shadowMap: { type: THREE.PCFShadowMap } },
      requestShadowConfiguration: () => ({ dispose() {} }),
      graphicsConfiguration: GRAPHICS_PROFILES.standard.settings, render: () => {},
    } as unknown as RenderLayer,
    progression: { unlockedSlimeIds: ['bob', 'goop', 'volt'], activeSlimeId: 'volt' },
    authoredRoomOne: true,
    playArrival,
    debugAvailable,
    maintenanceMaps,
  });
  runtime.load();
  runtime.start();
  const tick = (count = 1) => { for (let i = 0; i < count; i += 1) runtime.fixedUpdate(1 / 60); };
  const switchSlime = () => { input.press('switchSlime'); tick(); input.release('switchSlime'); tick(); };
  return {
    runtime, input, document, scene, host, cameraRig, tick, switchSlime,
    render: () => runtime.render(0, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>),
    cleanup: () => {
      runtime.dispose();
      Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    },
  };
}

function finalBossInternals(runtime:BlackoutLevelRuntime) {
  return (runtime as unknown as {resources:{finalBoss:FinalBossEncounter;defeatFinale:BossDefeatFinale;specimenBody:KinematicBody;specimenCharacter:SpecimenCharacterPresentation;collisionWorld:CollisionWorld;combatTargets:{size:number};scene:{finalArena:ExterminationArena}}}).resources;
}

test('Bob blackout reflections follow his own local lights and disappear in darkness like Goop',context=>{
  const f=createFixture();
  try{
    const r=(f.runtime as unknown as {resources:{
      group:{bobBody:KinematicBody;goopBody:KinematicBody};
      bobPresentation:BobCharacterPresentation;goopPresentation:GoopCharacterPresentation;
      goopReflectionLighting:GelReflectionLighting;
    }}).resources;
    const lightingScene=new THREE.Group(),light=new THREE.PointLight(0xffffff,16,5);
    lightingScene.add(light);r.goopReflectionLighting=new GelReflectionLighting(lightingScene);
    const bob=context.mock.method(r.bobPresentation,'setReflectionIntensity');
    const goop=context.mock.method(r.goopPresentation,'setReflectionIntensity');
    r.group.bobBody.teleport(new THREE.Vector3(0,.46,10));
    r.group.goopBody.teleport(new THREE.Vector3(0,.46,2));
    f.render();
    assert.deepEqual(bob.mock.calls.at(-1)!.arguments,[0,0],'Bob cannot retain a fixed reflection fill outside the light');
    assert.ok(goop.mock.calls.at(-1)!.arguments[0]>0,'lighting another character does not light Bob');
    r.group.bobBody.teleport(new THREE.Vector3(0,.46,2));
    r.group.goopBody.teleport(new THREE.Vector3(0,.46,10));
    f.render();
    assert.ok(bob.mock.calls.at(-1)!.arguments[0]>0,'Bob recovers reflections when he enters the light');
    assert.deepEqual(goop.mock.calls.at(-1)!.arguments,[0,0]);
    light.intensity=0;f.render();
    assert.deepEqual(bob.mock.calls.at(-1)!.arguments,[0,0],'switching off the light restores the blackout');
  }finally{f.cleanup();}
});

test('debug room access cannot enable invincibility without the Vite development build flag',()=>{
  const f=createFixture(true);try {
    f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
    f.input.press('debugToggleInvincibility');f.tick();f.input.release('debugToggleInvincibility');
    const {finalBoss:boss}=finalBossInternals(f.runtime);
    assert.equal(boss.controller.devInvincible,false);
    assert.equal(f.document.elements.some(element=>element.className==='final-boss-dev-invincibility'),false);
    f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
    boss.controller.toggleDevInvincibility();assert.equal(boss.controller.damagePlayer(20,-1),true);
    assert.equal(f.runtime.requestFailure(),true);
  }finally{f.cleanup();}
});

test('continuous mouse turns keep every sample across render-only and catch-up frames through multiple full revolutions',()=>{
  const rig=new CameraRig(),f=createFixture(true,false,rig as unknown as TestCameraRig);
  try {
    f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
    f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
    const r=finalBossInternals(f.runtime);r.finalBoss.controller.damagePlayer=()=>false;
    for(let i=0;i<60;i++)f.render();
    const forward=new THREE.Vector3(),previous=rig.camera.quaternion.clone();
    rig.camera.getWorldDirection(forward);const start=Math.atan2(forward.x,forward.z);
    let radians=0,accumulator=0;
    for(let frame=0;frame<720;frame++) {
      const dt=frame%7===0?1/30:1/144,pixels=dt*800;
      f.input.pointerDeltaX+=pixels;radians-=pixels*.0022;accumulator+=dt;
      while(accumulator>=1/60){f.tick();accumulator-=1/60;}
      f.runtime.render(accumulator*60,{frameDeltaSeconds:dt} as Readonly<LoopStats>);
      rig.camera.getWorldDirection(forward);
      const yaw=Math.atan2(forward.x,forward.z),error=Math.atan2(Math.sin(yaw-start-radians),Math.cos(yaw-start-radians));
      assert.ok(Math.abs(error)<1e-7,`mouse displacement lost or duplicated at frame ${frame}: ${error}`);
      assert.ok(previous.angleTo(rig.camera.quaternion)<pixels*.0022+.00001,`rotation snapped at frame ${frame}`);
      previous.copy(rig.camera.quaternion);
    }
    assert.ok(Math.abs(radians)>Math.PI*4);
  }finally{f.cleanup();}
});

test('the merged boss body and all its parts respect first-person hiding, while boss cinematics restore third person without changing the preference',async()=>{
  // Most runtime tests use a deliberately inert camera; this handoff needs the
  // real rig and its camera-pass suppression state.
  const rig=new CameraRig(),f=createFixture(true,false,rig as unknown as TestCameraRig);try {
    await finalBossInternals(f.runtime).specimenCharacter.prepare(loadSpecimen);
    rig.setViewMode('first-person');
    f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');f.render();
    const {finalBoss:b,specimenBody:body}=finalBossInternals(f.runtime);
    assert.equal(b.cinematic,true);assert.equal(rig.isFirstPersonForTarget(body),false);assert.equal(rig.viewMode,'first-person');
    f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
    for(let i=0;i<20;i++)f.render();assert.equal(rig.isFirstPersonForTarget(body),true);
    const meshes:THREE.Mesh[]=[];b.presentation.specimen.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});assert.equal(meshes.length,6);
    for(const mesh of meshes) {
      const material=Array.isArray(mesh.material)?mesh.material[0]!:mesh.material,color=material.colorWrite,depth=material.depthWrite;
      assert.equal(mesh.visible,true);assert.equal(material.visible,true,'camera-pass suppression must not globally hide the shared actor material');
      mesh.onBeforeRender({} as THREE.WebGLRenderer,f.scene,f.cameraRig.camera,mesh.geometry,material,null);
      assert.equal(material.colorWrite,false);assert.equal(material.depthWrite,false);
      mesh.onAfterRender({} as THREE.WebGLRenderer,f.scene,f.cameraRig.camera,mesh.geometry,material,null);
      assert.equal(material.colorWrite,color);assert.equal(material.depthWrite,depth);
    }
    b.reset();b.start();f.render();assert.equal(rig.isFirstPersonForTarget(body),false);assert.equal(rig.viewMode,'first-person');
    b.controller.skipCinematic(body.position);for(let i=0;i<20;i++)f.render();assert.equal(rig.isFirstPersonForTarget(body),true);
  }finally{f.cleanup();}
});

test('phase two automatically saves CP9 on normal and skipped transitions; repeated deaths/pit falls retry cleanly without replaying phase one',()=>{
  for(const skip of [false,true]) {
    const f=createFixture();try {
      assert.throws(()=>f.runtime.activateCheckpoint('cp9'),/after reaching phase two/);
      f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
      f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
      assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp8');assert.throws(()=>f.runtime.activateCheckpoint('cp9'),/after reaching phase two/);
      const {finalBoss:b,specimenBody:body,scene:{finalArena:arena}}=finalBossInternals(f.runtime);
      const targets=finalBossInternals(f.runtime).combatTargets as unknown as CombatTargetRegistry,size=targets.size;
      const hit={projectileId:1,targetId:'core',kind:'direct' as const,chargeAmount:0,fullyCharged:false,damageUnits:999,point:body.position,direction:body.position};
      for(let wave=0;wave<3;wave++) {
        b.controller.applyImpact(hit);f.tick(82);
        for(const root of b.squad.root.children)if(root.visible)targets.getRegistrationForMesh(root.children[0] as THREE.Mesh)!.target.applyImpact(hit);
      }
      assert.equal(b.controller.damagePlayer(40,-1234),true);b.controller.applyImpact(hit);f.tick();
      assert.equal(b.controller.readModel.state,'transition');assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp8');
      f.runtime.stop();f.tick(360);assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp8');f.runtime.start();
      if(skip){f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');}else f.tick(301);
      assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp9');assert.equal(f.runtime.activeCheckpoint?.room.local.bossPhase,2);
      assert.equal(b.controller.readModel.playerHealth,60,'saving a checkpoint must not heal the live attempt');
      assert.equal(b.controller.readModel.phase,2);assert.equal(f.runtime.roomState.local.bossPhase,2);
      const snapshot=JSON.stringify(f.runtime.activeCheckpoint);
      for(let retry=0;retry<3;retry++) {
        b.controller.applyImpact(hit);f.tick();assert.equal(b.reinforcements.activeCount,8);
        b.healthPacks.drop(body.position.clone().add(new THREE.Vector3(5,2,0)));
        b.projectiles.fireOrb(new THREE.Vector3(0,20,FINAL_ARENA.centreZ),body.position);
        const cover=arena.cover[0]!;arena.breakCoverAlong(cover.position,cover.position,1);assert.equal(cover.visible,false);
        f.input.press('fireAbility');f.tick();assert.equal(f.runtime.specimenAttackReadModel?.charging,true);
        if(retry===1) {
          const damage=b.controller.damagePlayer;b.controller.damagePlayer=()=>false;
          body.recoverAt(new THREE.Vector3(0,2.07,FINAL_ARENA.centreZ));
          for(let i=0;i<350&&b.controller.readModel.state!=='suspended';i++)f.tick();
          b.controller.damagePlayer=damage;assert.equal(b.controller.readModel.state,'suspended');
        } else assert.equal(f.runtime.requestFailure(),true);
        assert.equal(f.runtime.requestFailure(),false);f.tick(80);
        const screen=f.document.elements.find(e=>e.className==='death-screen')!;assert.equal(screen.hidden,false);screen.retryButton.click();
        assert.equal(b.controller.readModel.phase,2);assert.equal(b.controller.readModel.state,'combat');assert.equal(b.controller.readModel.health,FINAL_BOSS_TUNING.phaseTwoHealth);
        assert.equal(b.controller.readModel.playerHealth,100);assert.equal(b.controller.readModel.defenseIndex,3);assert.equal(b.controller.readModel.reinforcementIndex,0);
        assert.equal(b.controller.readModel.shieldActive,false);assert.equal(b.cinematic,false);assert.equal(b.squad.activeCount,0);assert.equal(b.projectiles.liveCount,0);
        assert.equal(b.reinforcements.activeCount,0);assert.equal(b.reinforcements.liveProjectileCount,0);assert.equal(b.healthPacks.activeCount,0);
        assert.equal(b.presentation.evasionOffset.length(),0);assert.equal(b.presentation.rollRig.rotation.z,0);assert.equal(f.runtime.specimenAttackReadModel?.charging,false);
        assert.equal(f.runtime.specimenProjectileStates.some(s=>s.active),false);assert.ok(arena.cover.every(c=>c.visible));assert.ok(body.position.distanceTo(FINAL_MERGE_ANCHOR)<.05);
        assert.equal(f.runtime.specimenFormReadModel?.controlledForm,'specimen');assert.equal(f.input.enabled,true);assert.equal(f.input.pointerLocked,true);
        assert.equal(targets.size,size);f.tick();assert.equal(JSON.stringify(f.runtime.activeCheckpoint),snapshot,'recovery must not overwrite or downgrade CP9');
      }
      f.runtime.restartLevel();assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp1');assert.equal(b.controller.readModel.state,'idle');
      f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
      assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp8');assert.equal(b.controller.readModel.phase,1);assert.equal(b.controller.readModel.health,FINAL_BOSS_TUNING.health);
    }finally{f.cleanup();}
  }
});

test('natural lab entry plays the research escape, hands off directly to combat, and retries without replaying the film',()=>{
  const f=createFixture();try {
    f.runtime.activateCheckpoint('cp6');
    const bodies=electricalRoomInternals(f.runtime).group;
    for(const [i,id] of (['bob','goop','volt'] as const).entries())bodies[`${id}Body`].recoverAt(new THREE.Vector3((i-1)*2,.86,189.2));
    f.tick(); const movie = (f.runtime as any).resources.researchFinale;
    assert.equal(movie.active, true); assert.equal(f.runtime.roomState.phase, 'three-slime');
    assert.equal(f.runtime.requestFailure(), false, 'the research sequence owns damage and movement');
    f.tick(120); const time = movie.seconds; f.render(); f.render(); assert.equal(movie.seconds, time);
    f.runtime.stop(); f.tick(120); assert.equal(movie.seconds, time); f.runtime.start();
    f.input.press('skipCinematic'); f.tick(); f.input.release('skipCinematic');
    assert.equal(movie.complete, true); assert.equal(movie.active, false);
    assert.equal(f.runtime.roomState.phase,'boss');assert.equal(f.runtime.finalBossReadModel?.state,'combat');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp8');assert.equal(finalBossInternals(f.runtime).specimenBody.radiusMetres,FINAL_SPECIMEN_RADIUS);
    const targetCount=finalBossInternals(f.runtime).combatTargets.size;
    for(let retry=0;retry<3;retry++) {
      f.runtime.recoverActiveCheckpoint();assert.equal(f.runtime.finalBossReadModel!.health,FINAL_BOSS_TUNING.health);assert.equal(f.runtime.finalBossReadModel!.phase,1);
      assert.equal(finalBossInternals(f.runtime).finalBoss.squad.activeCount,0);
      assert.equal(finalBossInternals(f.runtime).combatTargets.size,targetCount);
      assert.equal(movie.active, false); assert.equal(movie.complete, true);
    }
    f.runtime.restartLevel();assert.equal(f.runtime.roomState.roomId,'room-1');assert.equal(f.runtime.finalBossReadModel!.state,'idle');
    assert.equal(bodies.bobBody.radiusMetres,.45);assert.equal(bodies.voltBody.radiusMetres,.45);
  }finally{f.cleanup();}
});

test('loading rehearses the actual research views without advancing physics, dialogue or cinematic ownership', async () => {
  const f = createFixture(); try {
    const r = (f.runtime as any).resources, movie = r.researchFinale;
    const bodies = [r.group.bobBody, r.group.goopBody, r.group.voltBody, r.specimenBody];
    const positions = bodies.map(b => b.position.toArray()), parents = [r.bobPresentation, r.goopPresentation, r.voltPresentation].map(p => p.root.parent);
    const hidden = movie.wing.root.visible, intensity = movie.wing.lightRoot.children.filter((o: THREE.Object3D) => o instanceof THREE.Light).map((o: THREE.Light) => o.intensity);
    let frames = 0;
    await movie.primePresentationFrames(f.scene, async (camera: THREE.PerspectiveCamera) => {
      frames++; assert.ok(camera.position.toArray().every(Number.isFinite));
      assert.deepEqual(bodies.map(b => b.position.toArray()), positions);
      assert.equal(movie.seconds, 0); assert.equal(movie.active, false); assert.equal(f.host.dataset.cinematic, undefined);
    });
    assert.ok(frames >= 20); assert.equal(movie.preparation.complete, true);
    assert.equal(movie.wing.root.visible, hidden); assert.equal(movie.diagnostics.effects.shots, 0);
    assert.deepEqual(movie.wing.lightRoot.children.filter((o: THREE.Object3D) => o instanceof THREE.Light).map((o: THREE.Light) => o.intensity), intensity);
    assert.deepEqual([r.bobPresentation, r.goopPresentation, r.voltPresentation].map(p => p.root.parent), parents);
    await assert.rejects(movie.primePresentationFrames(f.scene, async () => { throw new Error('driver lost'); }), /driver lost/);
    assert.deepEqual(bodies.map(b => b.position.toArray()), positions); assert.equal(movie.wing.root.visible, hidden);
    assert.equal(movie.active, false); assert.equal(movie.seconds, 0);
  } finally { f.cleanup(); }
});

test('research hides the overlapping arena shell until the viewing room without removing its light slots', () => {
  const f = createFixture(); try {
    const r = (f.runtime as any).resources, movie = r.researchFinale;
    const arena = r.scene.finalArena as ExterminationArena;
    const shell = arena.root.getObjectByName('continuous-lab-walkway')!;
    const hiddenFragment = arena.armourFragments[0]!;
    const lights = arena.root.children.filter(o => o instanceof THREE.Light);
    assert.equal(shell.visible, true); assert.equal(hiddenFragment.visible, false);
    assert.equal(f.runtime.previewResearchForDebug(), true);
    movie.update(215);
    assert.equal(shell.visible, false, 'the arena must not block the corridor reveal');
    assert.ok(lights.every(light => light.visible), 'keep the warmed light count stable');
    movie.update(22);
    assert.equal(shell.visible, true, 'the boss chamber must be visible through the viewing glass');
    assert.equal(hiddenFragment.visible, false);
    movie.reset();
    assert.equal(shell.visible, true); assert.equal(hiddenFragment.visible, false);
  } finally { f.cleanup(); }
});

test('research film reaches every major beat, keeps render-only samples non-authoritative, and restores ownership on recovery', () => {
  const f = createFixture(); try {
    const r = (f.runtime as any).resources;
    const beforePreparation = [r.group.bobBody, r.group.goopBody, r.group.voltBody, r.specimenBody].map(b => b.position.toArray());
    r.researchFinale.primeResources((roots: readonly THREE.Object3D[]) => {
      assert.equal(roots.length, 4); assert.equal(r.researchFinale.seconds, 0); assert.equal(r.researchFinale.active, false);
    });
    assert.deepEqual([r.group.bobBody, r.group.goopBody, r.group.voltBody, r.specimenBody].map(b => b.position.toArray()), beforePreparation);
    assert.equal(f.runtime.previewResearchForDebug(), true);
    const movie = r.researchFinale, parents = [r.bobPresentation.root.parent, r.goopPresentation.root.parent, r.voltPresentation.root.parent];
    for (const [seconds, shot] of [[22, 'bob-reaction'], [39, 'catastrophic-research'], [96, 'the-scientists'], [133, 'empty-search'],
      [155, 'hallway-chase'], [201, 'crossfire'], [215, 'specimen-reveal'], [237, 'arena-overlook'], [242.7, 'glass-ambush'], [245, 'arena-impact'], [258, 'pit-opening'], [265, 'exterminator-emergence']] as const) {
      while (movie.seconds < seconds) f.tick();
      assert.equal(movie.diagnostics.shot, shot);
      const time = movie.seconds; f.render(); f.render(); assert.equal(movie.seconds, time);
      assert.ok(r.bobPresentation.root.parent === parents[0] && r.goopPresentation.root.parent === parents[1] && r.voltPresentation.root.parent === parents[2]);
      if (seconds === 133) { assert.ok(movie.actors.every((a: any) => !a.pose.visible), 'searchlights must illuminate an empty room'); assert.equal(movie.wing.monitorDrone.visible, true); }
      if (seconds === 215) assert.equal(movie.diagnostics.visibleDrones, 8);
      if (seconds === 245) assert.equal(movie.diagnostics.glassIntact, false);
      if (seconds === 237) { assert.equal(movie.diagnostics.pitCoverVisible, true); assert.equal(r.scene.finalArena.entryDoor.position.y, 4.4); }
      if (seconds === 258) { assert.ok(movie.diagnostics.pitOpenProgress > 0); assert.equal(r.finalBoss.presentation.root.visible, false); }
      if (seconds === 265) {
        assert.ok(r.finalBoss.presentation.machine.position.y > 4, 'the boss must emerge through the open cover');
        assert.ok(Math.cos(r.specimenCharacter.diagnostics.yaw) < -.99, 'the Specimen must face the opening before the boss rises');
      }
    }
    while (movie.active) f.tick();
    assert.equal(f.runtime.phase, 'boss'); assert.equal(f.runtime.finalBossReadModel?.state, 'combat');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp8'); assert.equal(f.host.dataset.cinematic, undefined);
    assert.equal(movie.diagnostics.visibleDrones, 0);
    f.runtime.restartLevel(); assert.equal(movie.complete, false);
    assert.equal(f.runtime.previewResearchForDebug(), true); f.tick(60);
    f.runtime.activateCheckpoint('cp6'); f.runtime.recoverActiveCheckpoint();
    assert.equal(movie.active, false); assert.equal(f.host.dataset.cinematic, undefined);
    for (const p of [r.bobPresentation, r.goopPresentation, r.voltPresentation]) assert.equal(p.root.parent, f.scene);
  } finally { f.cleanup(); }
});

for (const [index, slimeId] of (['bob', 'goop', 'volt'] as const).entries()) test(`${slimeId} starts the elevator only with all three in its room and at least one standing on the deck`, () => {
  const f = createFixture(); try {
    f.runtime.activateCheckpoint('cp3'); f.runtime.recoverActiveCheckpoint();
    const r = (f.runtime as any).resources;
    while (r.group.activeSlimeId !== slimeId) f.switchSlime();
    assert.equal(r.transit.bridgeLocked, false);
    for (const [i, id] of (['bob', 'goop', 'volt'] as const).entries()) r.group[`${id}Body`].teleport(new THREE.Vector3((i - 1) * 1.5, .86, 175.2));
    f.tick();
    assert.equal(r.elevatorAscent.active, false, 'all three in the room alone must not start the movie');
    const missing = (['bob', 'goop', 'volt'] as const)[(index + 1) % 3]!;
    r.group[`${missing}Body`].teleport(new THREE.Vector3(0, .86, 173));
    r.group[`${slimeId}Body`].teleport(new THREE.Vector3(0, .86, 180.7));
    f.tick();
    assert.equal(r.elevatorAscent.active, false, `wait for ${missing}, even with someone already on the lift`);
    r.group[`${missing}Body`].teleport(new THREE.Vector3(1.5, .86, 175.2));
    f.tick();
    assert.equal(r.transit.complete, false, 'the old exit marker and bridge lock are not additional trigger requirements');
    assert.equal(r.elevatorAscent.active, true); assert.equal(r.transit.isActive, false);
    assert.equal(r.transit.bridgeLocked, false, 'boarding does not silently solve or depend on the bridge puzzle');
    assert.equal(f.runtime.requestFailure(), false); assert.equal(f.runtime.phase, 'three-slime');
    f.tick(100); const time = r.elevatorAscent.seconds, positions = f.runtime.getSlimePositions();
    f.render(); f.render(); assert.equal(r.elevatorAscent.seconds, time);
    f.runtime.stop(); f.tick(100); assert.equal(r.elevatorAscent.seconds, time); assert.deepEqual(f.runtime.getSlimePositions(), positions);
    f.runtime.start(); f.input.press('skipCinematic'); f.tick(); f.input.release('skipCinematic');
    assert.equal(r.elevatorAscent.complete, true); assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp6');
    assert.equal(f.runtime.roomState.local.elevatorComplete, true); assert.equal(r.group.activeSlimeId, slimeId);
    f.tick(3); assert.equal(f.runtime.phase, 'three-slime', 'arriving in the lab must not force an immediate boss merge');
    f.runtime.recoverActiveCheckpoint(); assert.equal(r.elevatorAscent.complete, true); assert.equal(r.elevatorAscent.active, false);
    assert.equal(r.scene.bossStaging.ascentLift.frontGate.position.y, 8.4); assert.equal(r.group.activeSlimeId, slimeId);
    f.runtime.restartLevel(); assert.equal(r.elevatorAscent.complete, false); assert.equal(r.scene.bossStaging.ascentLift.frontGate.position.y, 3.05);
  } finally { f.cleanup(); }
});

test('the developer elevator picker preview cancels the vent arrival and safely starts before level entry, but stays gated outside debug', () => {
  for (const available of [false, true]) {
    const f = createFixture(available, true); try {
      const r = (f.runtime as any).resources;
      assert.equal(f.runtime.previewElevatorForDebug(), available);
      if (!available) { assert.equal(r.ventArrival.active, true); continue; }
      assert.equal(r.ventArrival.active, false); assert.equal(r.elevatorAscent.active, true);
      assert.equal(f.runtime.beginMerge(), false); assert.equal(r.transit.isActive, false);
      f.runtime.stop(); assert.equal(f.runtime.previewElevatorForDebug(), true);
      const t = r.elevatorAscent.seconds; f.tick(120); assert.equal(r.elevatorAscent.seconds, t);
      f.runtime.start(); f.input.press('skipCinematic'); f.tick(); f.input.release('skipCinematic');
      assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp6');
      assert.equal(r.scene.bossStaging.ascentLift.labDoor.position.y, 3.55);
    } finally { f.cleanup(); }
  }
});

test('Room 4 debug shortcut is gated, ending uses the legal macro flow and completion fires once',()=>{
  for(const available of [false,true]) {
    const f=createFixture(available);try {
      let completions=0;f.runtime.events.on('completed',()=>completions++);
      f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
      if(!available){assert.equal(f.runtime.roomState.roomId,'room-1');continue;}
      const b=finalBossInternals(f.runtime).finalBoss;
      f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
      // Isolate legal lifecycle handoffs from combat balance; this is not a
      // simulated input-only victory of the hard encounter.
      b.controller.damagePlayer=()=>false;
      const expose=()=>assert.equal(b.controller.readModel.weakPointOpen,true);
      const hit={projectileId:1,targetId:'core',kind:'direct' as const,chargeAmount:1,fullyCharged:true,damageUnits:999,point:new THREE.Vector3(),direction:new THREE.Vector3()};
      for(let wave=0;wave<3;wave++) {
        b.controller.applyImpact(hit);for(let i=0;i<100&&b.squad.activeCount===0;i++)f.tick();
        const targets=finalBossInternals(f.runtime).combatTargets as unknown as CombatTargetRegistry;
        for(const root of b.squad.root.children)if(root.visible){const target=targets.getRegistrationForMesh(root.children[0] as THREE.Mesh)!.target;target.applyImpact({...hit,targetId:target.id});}
        f.tick();assert.equal(b.controller.readModel.shieldActive,false);
      }
      expose();b.controller.applyImpact(hit);f.tick();assert.equal(b.controller.readModel.state,'transition');
      f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');assert.equal(b.controller.readModel.phase,2);
      for(const hp of FINAL_BOSS_TUNING.reinforcementHealth){expose();b.controller.applyImpact(hit);f.tick();assert.equal(b.controller.readModel.health,hp);assert.equal(b.controller.readModel.shieldActive,false);}
      expose();b.controller.applyImpact(hit);f.tick();assert.equal(f.runtime.roomState.phase,'boss-defeated');
      assert.equal(b.squad.activeCount,0);assert.equal(b.squad.liveProjectileCount,0);
      assert.equal(b.reinforcements.activeCount,0);assert.equal(b.reinforcements.liveProjectileCount,0);assert.equal(b.healthPacks.activeCount,0);
      assert.equal(b.controller.readModel.state,'suspended');
      assert.equal(finalBossInternals(f.runtime).defeatFinale.active,true);
      f.tick(50);assert.equal(f.runtime.requestFailure(),false,'the ending must not accept gameplay damage');
      f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');assert.equal(f.runtime.roomState.phase,'complete');
      f.tick(100);assert.equal(completions,1);f.runtime.transitionPhase('complete');assert.equal(completions,1);
    }finally{f.cleanup();}
  }
});

test('the ending owns all actors, pauses, reaches natural credits once and restores them on recovery', () => {
  for (const recover of [true, false]) {
    const f = createFixture(); try {
      const originalParent = f.scene.getObjectByName('player-slime-volt-placement')!.parent;
      assert.equal(f.runtime.previewBossDefeatForDebug(), true);
      const { defeatFinale: movie, finalBoss: boss } = finalBossInternals(f.runtime);
      let completions = 0; f.runtime.events.on('completed', () => completions++);
      f.tick(180); const seconds = movie.seconds;
      f.runtime.stop(); f.tick(120); assert.equal(movie.seconds, seconds); f.runtime.start();
      assert.equal(boss.squad.activeCount, 0); f.switchSlime(); assert.equal(f.runtime.phase, 'boss-defeated');
      assert.equal(movie.begin(f.cameraRig.camera), false, 'an active ending cannot acquire the actors twice');
      if (recover) {
        f.runtime.recoverActiveCheckpoint(); assert.equal(movie.active, false); assert.equal(completions, 0);
        assert.equal(f.host.dataset.cinematic, undefined);
        assert.equal(f.scene.getObjectByName('player-slime-volt-placement')!.parent, originalParent);
        assert.equal(f.runtime.previewBossDefeatForDebug(), true);
      }
      for (let i = 0; i < ENDING_TIMING.duration * 15 + 10; i++) f.runtime.fixedUpdate(1 / 15);
      assert.equal(f.runtime.phase, 'complete'); assert.equal(completions, 1); assert.equal(movie.active, false); assert.equal(movie.complete, true);
      assert.equal(f.host.dataset.cinematic, undefined); assert.equal(movie.begin(f.cameraRig.camera), false);
      f.tick(20); assert.equal(completions, 1);
    } finally { f.cleanup(); }
  }
});

test('ending shader rehearsal is silent, hides its UI and restores state even after a render failure', async () => {
  const f = createFixture(); const sounds: unknown[] = [], off = gameplayAudioEvents.on('cue', event => sounds.push(event));
  try {
    const r = (f.runtime as any).resources, movie: BossDefeatFinale = r.defeatFinale;
    const bodies = [r.group.bobBody, r.group.goopBody, r.group.voltBody, r.specimenBody], positions = bodies.map(b => b.position.toArray());
    const parents = [r.bobPresentation, r.goopPresentation, r.voltPresentation].map(p => p.root.parent), background = f.scene.background;
    let frames = 0;
    await movie.primePresentationFrames(async camera => {
      frames++; assert.equal(movie.active, false); assert.equal(movie.seconds, 0); assert.equal(f.host.dataset.cinematic, undefined);
      assert.equal(movie.overlay.element!.hidden, true); assert.deepEqual(bodies.map(b => b.position.toArray()), positions);
      assert.ok(camera.position.toArray().every(Number.isFinite));
    }, () => true);
    assert.ok(frames >= 20); assert.equal(movie.preparation.complete, true); assert.equal(sounds.length, 0);
    await assert.rejects(movie.primePresentationFrames(async () => { throw new Error('ending render failed'); }, () => true), /ending render failed/);
    assert.equal(movie.preparation.complete, false); assert.equal(movie.active, false); assert.equal(movie.seconds, 0);
    assert.equal(f.scene.background, background); assert.equal(f.host.dataset.cinematic, undefined);
    assert.deepEqual([r.bobPresentation, r.goopPresentation, r.voltPresentation].map(p => p.root.parent), parents);
    assert.deepEqual(bodies.map(b => b.position.toArray()), positions); assert.equal(sounds.length, 0);
  } finally { off(); f.cleanup(); }
});

test('the ending keeps its combat audio without dissolving sound effects', () => {
  const f = createFixture(), sounds: string[] = [];
  const off = gameplayAudioEvents.on('cue', event => sounds.push(event.sound));
  try {
    assert.equal(f.runtime.previewBossDefeatForDebug(), true);
    const movie = finalBossInternals(f.runtime).defeatFinale;
    while (movie.seconds < ENDING_TIMING.black) f.runtime.fixedUpdate(.1);
    assert.ok(sounds.includes('volt-shoot-01'));
    assert.ok(sounds.includes('escape-drone-destruction-01'));
    assert.equal(sounds.some(sound => sound.includes('dissolve')), false);
  } finally { off(); f.cleanup(); }
});

test('skipping the ending credits requests a clean title return after completing progression', () => {
  const f = createFixture(); try {
    f.runtime.previewBossDefeatForDebug();
    const movie = finalBossInternals(f.runtime).defeatFinale;
    while (movie.seconds < ENDING_TIMING.credits + .5) f.runtime.fixedUpdate(.2);
    f.input.press('skipCinematic'); f.tick(); f.input.release('skipCinematic');
    assert.equal(movie.skippedCredits, true); assert.equal(f.runtime.phase, 'complete');
    assert.equal(f.host.dataset.endingCreditsSkipped, 'true');
  } finally { f.cleanup(); }
});

test('looking up close to a boss deck hides only the fused visual, then restores it with camera clearance',()=>{
  const f=createFixture();try {
    f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
    f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
    const body=finalBossInternals(f.runtime).specimenBody;
    const character=finalBossInternals(f.runtime).specimenCharacter;
    f.cameraRig.camera.position.copy(body.position);f.render();assert.equal(character.diagnostics.visible,false);
    assert.equal(character.diagnostics.opacity,0);assert.equal(body.radiusMetres,FINAL_SPECIMEN_RADIUS);
    f.cameraRig.camera.position.copy(body.position).add(new THREE.Vector3(0,3,-12));f.render();assert.equal(character.diagnostics.visible,true);
    assert.ok(character.diagnostics.opacity>0);assert.equal(f.runtime.finalBossReadModel?.playerHealth,100);
  } finally {f.cleanup();}
});

test('live threshold defense pauses healing and drones, breaks on actual target kills, and resets cleanly at CP8',()=>{
  const f=createFixture();try {
    f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
    f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
    const {finalBoss:b,specimenBody:body}=finalBossInternals(f.runtime);b.controller.damagePlayer=()=>false;
    const impact={projectileId:1,targetId:'core',kind:'direct' as const,chargeAmount:1,fullyCharged:true,damageUnits:999,point:body.position,direction:body.position};
    b.controller.applyImpact(impact);f.tick(90);assert.equal(b.squad.activeCount,11);assert.equal(b.presentation.shield.visible,true);
    const hp=b.controller.readModel.health,pose=b.squad.root.children[0]!.position.clone();
    f.runtime.stop();f.tick(120);f.render();assert.equal(b.controller.readModel.health,hp);assert.deepEqual(b.squad.root.children[0]!.position,pose);
    f.runtime.start();f.tick(60);assert.ok(b.controller.readModel.health>hp+2.4);
    const targets=finalBossInternals(f.runtime).combatTargets as unknown as CombatTargetRegistry,size=targets.size;
    for(const root of b.squad.root.children)if(root.visible){const target=targets.getRegistrationForMesh(root.children[0] as THREE.Mesh)!.target;target.applyImpact({...impact,targetId:target.id});}
    assert.equal(b.controller.readModel.shieldActive,false);f.tick();assert.equal(b.presentation.shield.visible,false);
    f.runtime.recoverActiveCheckpoint();assert.equal(b.controller.readModel.defenseIndex,0);assert.equal(b.controller.readModel.health,FINAL_BOSS_TUNING.health);
    assert.equal(b.squad.activeCount,0);assert.equal(b.projectiles.liveCount,0);assert.equal(targets.size,size);
  }finally{f.cleanup();}
});

test('pit falls retry on the main ring without bringing back the disabled floating platforms',()=>{
  const f=createFixture();try {
    const originalFar=f.cameraRig.camera.far;
    f.input.press('debugTeleportRoomFour');f.tick();f.input.release('debugTeleportRoomFour');
    f.input.press('skipCinematic');f.tick();f.input.release('skipCinematic');
    const {finalBoss:b,specimenBody:body}=finalBossInternals(f.runtime);b.controller.damagePlayer=()=>false;
    f.render();assert.equal(f.cameraRig.camera.far,FINAL_ARENA.cameraFar);
    assert.equal(f.scene.getObjectByName('orbit-platform-collider-0'),undefined);
    f.runtime.stop();f.tick(120);f.render();f.runtime.start();f.tick(60);
    body.recoverAt(new THREE.Vector3(0,2.07,FINAL_ARENA.centreZ));f.tick(90);
    assert.ok(body.position.y<-10);assert.notEqual(b.controller.readModel.state,'suspended','do not kill the pit fall after only five metres');
    for(let i=0;i<250&&b.controller.readModel.state!=='suspended';i++)f.tick();
    assert.equal(b.controller.readModel.state,'suspended');
    assert.equal(f.cameraRig.camera.far,originalFar);
    f.runtime.recoverActiveCheckpoint();assert.equal(b.controller.readModel.state,'combat');
    assert.ok(body.position.distanceTo(FINAL_MERGE_ANCHOR)<.05);
    assert.ok(Math.hypot(body.position.x,body.position.z-FINAL_ARENA.centreZ)>FINAL_ARENA_RING.innerRadius);
    assert.equal(f.scene.getObjectByName('orbit-platform-collider-0'),undefined);assert.equal(b.squad.activeCount,0);
    f.render();assert.equal(f.cameraRig.camera.far,FINAL_ARENA.cameraFar);
    f.runtime.restartLevel();assert.equal(f.cameraRig.camera.far,originalFar);
  }finally{f.cleanup();}
});

function electricalRoomInternals(runtime: BlackoutLevelRuntime) {
  return (runtime as unknown as { resources: {
    group: { bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody };
    voltPresentation: VoltCharacterPresentation;
    maintenanceBay: BlackoutMaintenanceBayController;
    transit: BlackoutTransitController;
    electricalSystem: VoltElectricalSystem<KinematicBody>;
    electricalTargets: ElectricalTargetRegistry;
  } }).resources;
}

test('authored Level 3 starts with the wall-vent arrival, pauses cleanly, then restores Volt control and CP1 recovery',()=>{
  const f=createFixture(true,true);try{
    const r=(f.runtime as unknown as {resources:{ventArrival:import('../src/cinematics/BlackoutVentArrival.ts').BlackoutVentArrival;scene:{maintenanceBay:{entryVentCollapse:{sealed:boolean}}};group:{activeSlimeId:string};voltPresentation:VoltCharacterPresentation}}).resources;
    assert.equal(r.ventArrival.active,true);assert.equal(f.input.enabled,false);assert.equal(r.group.activeSlimeId,'volt');
    assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,false);
    f.input.press('switchSlime');f.input.press('moveBackward');f.tick(60);
    assert.equal(r.group.activeSlimeId,'volt','switch/movement input cannot take over scripted slide poses');
    f.runtime.stop();const paused=r.ventArrival.seconds;f.tick(30);f.render();f.render();assert.equal(r.ventArrival.seconds,paused);
    f.runtime.setDebugInteractionEnabled(true);assert.equal(f.input.enabled,false);
    f.runtime.start();assert.equal(f.input.enabled,false,'resuming cannot enable movement before the arrival finishes');
    for(let frame=0;frame<420&&r.ventArrival.active;frame++)f.tick();
    assert.equal(r.ventArrival.active,false);assert.equal(f.input.enabled,true);assert.equal(r.group.activeSlimeId,'volt');
    assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,true);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId,'cp1');
    assert.deepEqual(Object.values(f.runtime.getSlimePositions()!).map(p=>p.toArray()),[[-2,.46,2],[0,.46,2],[2,.46,2]]);
    f.runtime.recoverActiveCheckpoint();assert.equal(r.ventArrival.active,false);
    assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,true,'death recovery keeps the return route blocked');
    f.runtime.stop();f.runtime.start();assert.equal(r.ventArrival.active,false,'ordinary resume/recovery does not repeat the arrival');
    f.runtime.restartLevel();assert.equal(r.scene.maintenanceBay.entryVentCollapse.sealed,true,'restart does not open the spent arrival');
  }finally{f.cleanup();}
});

test('recovering or restarting during the arrival cancels camera/model ownership safely',()=>{
  for(const action of ['recoverActiveCheckpoint','restartLevel'] as const){
    const f=createFixture(true,true);try{
      f.tick(50);f.runtime[action]();
      const r=(f.runtime as unknown as {resources:{ventArrival:{active:boolean};bobPresentation:BobCharacterPresentation;goopPresentation:GoopCharacterPresentation;voltPresentation:VoltCharacterPresentation}}).resources;
      assert.equal(r.ventArrival.active,false);assert.equal(f.input.enabled,true);
      assert.ok([r.bobPresentation,r.goopPresentation,r.voltPresentation].every(p=>p.root.parent===f.scene));
      assert.equal(f.cameraRig.groundYaw,Math.PI);
      for(const p of [r.bobPresentation,r.goopPresentation,r.voltPresentation])
        assert.equal(p.diagnostics.facingYawRadians,Math.PI,'recovery faces the route after cancelling the arrival');
      assert.deepEqual(Object.values(f.runtime.getSlimePositions()!).map(p=>p.toArray()),[[-2,.46,2],[0,.46,2],[2,.46,2]]);
    }finally{f.cleanup();}
  }
});

function assertVoltBelowCeiling(body: THREE.Mesh, ceiling: THREE.Mesh): number {
  body.updateWorldMatrix(true, false); ceiling.updateWorldMatrix(true, false);
  const inverseCeiling = new THREE.Matrix4().copy(ceiling.matrixWorld).invert();
  const bounds = ceiling.geometry.boundingBox!, point = new THREE.Vector3(), local = new THREE.Vector3();
  let top = -Infinity;
  for (let i = 0; i < body.geometry.getAttribute('position').count; i++) {
    body.getVertexPosition(i, point); point.applyMatrix4(body.matrixWorld); top = Math.max(top, point.y);
    local.copy(point).applyMatrix4(inverseCeiling);
    if (local.x >= bounds.min.x && local.x <= bounds.max.x && local.z >= bounds.min.z && local.z <= bounds.max.z) {
      assert.ok(local.y <= bounds.min.y + 1e-5, `Volt vertex ${i} penetrates ${ceiling.name} by ${local.y - bounds.min.y} m`);
    }
  }
  return top;
}

test('real Volt GLB normal jump clears the actual maintenance-vent ceiling at every render alpha', async () => {
  const f = createFixture();
  try {
    const r = electricalRoomInternals(f.runtime), volt = r.group.voltBody;
    await r.voltPresentation.prepare(loadVolt);
    const mesh = r.voltPresentation.root.getObjectByName('Volt-Body') as THREE.Mesh;
    const ceiling = r.maintenanceBay.bay.collisionMeshes.find(m => m.name === 'vent-duct-ceiling')!;
    const ceilingBottom = new THREE.Box3().setFromObject(ceiling).min.y;
    assert.ok(Math.abs(ceilingBottom - 2.2) < 1e-6);
    volt.teleport(new THREE.Vector3(-6, 0.46, 57)); f.tick(10);
    assert.equal(volt.grounded, true); assert.equal(volt.radiusMetres, 0.45);
    assert.equal(r.voltPresentation.diagnostics.headroom.compression, 0, 'preserve the neutral crest with ample grounded headroom');
    f.input.press('jump');
    let peakColliderTop = 0, peakVisualTop = 0, uncompressedTop = 0, maximumCompression = 0;
    const point = new THREE.Vector3();
    for (let frame = 0; frame < 60; frame++) {
      f.tick(); if (frame === 0) f.input.release('jump');
      peakColliderTop = Math.max(peakColliderTop, volt.position.y + volt.radiusMetres);
      for (const alpha of [0, 0.5, 1]) {
        f.runtime.render(alpha, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>);
        peakVisualTop = Math.max(peakVisualTop, assertVoltBelowCeiling(mesh, ceiling));
      }
      maximumCompression = Math.max(maximumCompression, r.voltPresentation.diagnostics.headroom.compression);
      // Measure the complete jump; the apex frame changes with the authored
      // landing/launch animation and must not be guessed from a frame number.
      {
        const target = mesh.morphTargetDictionary!.Headroom, weight = mesh.morphTargetInfluences![target]!;
        mesh.morphTargetInfluences![target] = 0;
        for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
          mesh.getVertexPosition(i, point); point.applyMatrix4(mesh.matrixWorld); uncompressedTop = Math.max(uncompressedTop, point.y);
        }
        mesh.morphTargetInfluences![target] = weight;
      }
    }
    assert.equal(volt.lastJumpSpeedMetresPerSecond, DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond);
    assert.ok(peakColliderTop > 1.65 && peakColliderTop < 1.8, 'ordinary jump tuning and unobstructed collider apex');
    assert.ok(uncompressedTop > ceilingBottom - .025,
      'the current uncompressed crest reaches the protected ceiling margin');
    assert.ok(peakVisualTop <= ceilingBottom - 0.02); assert.ok(maximumCompression > 0 && maximumCompression < 1);
    volt.teleport(new THREE.Vector3(-6, 0.46, 49)); f.tick(90); f.render();
    assert.equal(r.voltPresentation.diagnostics.headroom.compression, 0, 'restore authored height after exiting the passage');
    f.runtime.restartLevel(); f.render(); assert.equal(r.voltPresentation.diagnostics.headroom.compression, 0);
  } finally { f.cleanup(); }
});

test('real Volt GLB traverses and jumps through flat and rising ducts without ceiling clipping', async () => {
  const f = createFixture();
  try {
    const r = electricalRoomInternals(f.runtime), volt = r.group.voltBody;
    await r.voltPresentation.prepare(loadVolt);
    const mesh = r.voltPresentation.root.getObjectByName('Volt-Body') as THREE.Mesh;
    const flat = r.maintenanceBay.bay.collisionMeshes.find(m => m.name === 'vent-duct-ceiling')!;
    const rising = r.maintenanceBay.bay.collisionMeshes.find(m => m.name === 'volt-rising-duct-ceiling')!;
    volt.teleport(new THREE.Vector3(-6, 0.46, 53)); f.tick(10); f.input.press('moveBackward');
    for (let frame = 0; frame < 100; frame++) {
      if (frame === 30) f.input.press('jump');
      f.tick(); if (frame === 30) f.input.release('jump');
      if (frame % 5 === 0) for (const alpha of [0, 0.5, 1]) {
        f.runtime.render(alpha, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); assertVoltBelowCeiling(mesh, flat);
      }
    }
    f.input.release('moveBackward'); assert.ok(volt.position.z > 60, 'ordinary input traverses the straight duct');
    volt.teleport(new THREE.Vector3(-16, 1.6, 69)); f.tick(30); assert.equal(volt.grounded, true);
    const startZ = volt.position.z; f.input.press('moveBackward'); f.input.press('jump');
    for (let frame = 0; frame < 60; frame++) {
      f.tick(); if (frame === 0) f.input.release('jump');
      if (frame % 5 === 0) for (const alpha of [0, 0.5, 1]) {
        f.runtime.render(alpha, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>); assertVoltBelowCeiling(mesh, rising);
      }
    }
    f.input.release('moveBackward'); assert.ok(volt.position.z > startZ + 3, 'ordinary input climbs the authored sloping duct');
    assert.equal(volt.radiusMetres, 0.45);
  } finally { f.cleanup(); }
});

test('authored Room 1 Volt keeps identity events, light, interpolated placement and death/recovery ownership', async () => {
  const f = createFixture();
  try {
    const r = (f.runtime as unknown as { resources: {
      group: { voltBody: KinematicBody };
      voltPresentation: VoltCharacterPresentation;
      voltLight: THREE.PointLight;
      voltMovementEvents: { emit(name: string, event: unknown): void };
      bobPresentation: { diagnostics: { stretch: number; squash: number } };
      goopPresentation: { diagnostics: { stretch: number; squash: number } };
    } }).resources;
    await r.voltPresentation.prepare(loadVolt);
    assert.deepEqual(r.voltPresentation.diagnostics.asset, { triangles: 38208, drawCalls: 3, geometries: 3, materials: 2 });
    assert.equal(r.voltLight.parent, r.voltPresentation.placement);
    assert.equal(r.voltLight.intensity, 18); assert.equal(r.voltLight.distance, 8); assert.equal(r.voltLight.decay, 2);
    assert.equal(r.voltLight.color.getHex(), 0xffedb2); assert.equal(r.voltLight.castShadow, false);
    const body = r.group.voltBody;
    body.teleport(new THREE.Vector3(0, 3, 3));
    r.voltMovementEvents.emit('jumped', { directionWorld: new THREE.Vector3(0, 1, 0), speedMetresPerSecond: 6, chargeFraction: 0 });
    f.tick(); assert.ok(r.voltPresentation.diagnostics.weights.Stretch > 0);
    assert.equal(r.bobPresentation.diagnostics.stretch, 0); assert.equal(r.goopPresentation.diagnostics.stretch, 0);
    f.runtime.render(0.5, { frameDeltaSeconds: 1 / 60 } as Readonly<LoopStats>);
    const expected = new THREE.Vector3().lerpVectors(body.previousPosition, body.position, 0.5);
    assert.ok(r.voltPresentation.placement.position.distanceTo(expected) < 1e-8);
    assert.ok(r.voltLight.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-8);
    r.voltPresentation.setOpacity(0); assert.equal(r.voltLight.visible, true);
    r.voltPresentation.setOpacity(1);
    assert.equal(f.runtime.requestFailure(), true); assert.equal(f.runtime.requestFailure(), false);
    f.tick(8); f.render(); assert.equal(r.voltPresentation.diagnostics.visible, false);
    // Keep the warmed point-light slot to avoid compiling a new shader when Volt dies.
    assert.equal(r.voltLight.visible, true); assert.equal(r.voltLight.intensity, 0);
    assert.equal(r.voltPresentation.diagnostics.deathActive, true);
    f.runtime.restartLevel(); f.render(); assert.equal(r.voltPresentation.diagnostics.deathActive, false);
    assert.equal(r.voltPresentation.diagnostics.opacity, 1); assert.equal(r.voltLight.visible, true);
    assert.equal(r.voltLight.intensity, 18);
    assert.ok(Object.values(r.voltPresentation.diagnostics.weights).every(weight => weight === 0));
  } finally { f.cleanup(); }
});

test('Room 1 CP1 and CP2 cannot acquire the distant maintenance circuit, but approaching it still works', () => {
  const f = createFixture();
  try {
    const resources = electricalRoomInternals(f.runtime);
    const socket = new THREE.Vector3();
    resources.maintenanceBay.target.copySocketWorldPosition(socket);
    for (const checkpoint of ['cp1', 'cp2'] as const) {
      f.runtime.activateCheckpoint(checkpoint);
      f.runtime.recoverActiveCheckpoint();
      f.tick();
      const volt = resources.group.voltBody;
      assert.ok(volt.position.distanceTo(socket) > 40, 'test uses the actual starting-side body position');
      f.cameraRig.aimOrigin.copy(volt.position);
      f.cameraRig.aimDirection.subVectors(socket, volt.position).normalize();
      f.input.press('aimAbility');
      f.input.press('fireAbility');
      f.tick();
      const readModel = resources.electricalSystem.readModel;
      assert.equal(readModel.acquisitionRangeMetres, 11);
      assert.equal(readModel.instabilityWarningRangeMetres, 12);
      assert.equal(readModel.tetherBreakRangeMetres, 13);
      assert.equal(readModel.connectedTargetId, undefined, `${checkpoint} must not bypass the drone/proximity tutorial`);
      assert.equal(resources.maintenanceBay.powered, false);
      f.input.release('fireAbility');
      f.input.release('aimAbility');
      f.tick();
    }

    const volt = resources.group.voltBody;
    volt.teleport(socket.clone().add(new THREE.Vector3(0, 0, -5)));
    f.cameraRig.aimOrigin.copy(volt.position);
    f.cameraRig.aimDirection.subVectors(socket, volt.position).normalize();
    f.input.press('aimAbility');
    f.input.press('fireAbility');
    f.tick();
    assert.equal(resources.electricalSystem.readModel.connectedTargetId, 'maintenance-bay-circuit');
    assert.equal(resources.maintenanceBay.powered, true, 'the original near-range circuit remains usable');
  } finally { f.cleanup(); }
});

test('the complete runtime grants long range only inside Room 2, including early arrivals and recovery', () => {
  const f = createFixture();
  try {
    const resources = electricalRoomInternals(f.runtime);
    for (const enemy of resources.transit.emergingDrones) enemy.state.destroy();
    const targets = [
      ...resources.transit.lights.map(receiver => receiver.target),
      ...resources.transit.lifts.map(lift => {
        const contact = lift.root.getObjectByName(`${lift.id}-conducting-contact`) as THREE.Mesh;
        assert.ok(contact);
        return resources.electricalTargets.getRegistrationForMesh(contact)!.target;
      }),
    ];
    const socket = new THREE.Vector3();
    for (const target of targets) {
      resources.electricalSystem.reset('reset');
      target.copySocketWorldPosition(socket);
      resources.group.voltBody.teleport(new THREE.Vector3(-16, 2.96, socket.z - 2));
      f.tick();
      assert.equal(f.runtime.roomState.roomId, 'room-1', 'the global group handoff has not occurred yet');
      if (target.id !== 'transit-light-c') assert.ok(resources.group.voltBody.position.distanceTo(socket) > 20);
      f.cameraRig.aimOrigin.copy(resources.group.voltBody.position);
      f.cameraRig.aimDirection.subVectors(socket, resources.group.voltBody.position).normalize();
      f.input.press('aimAbility');
      f.input.press('fireAbility');
      f.tick();
      assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 100);
      assert.equal(resources.electricalSystem.readModel.connectedTargetId, target.id, `actual runtime must reach ${target.id} across the chamber`);
      f.input.release('fireAbility');
      f.input.release('aimAbility');
      f.tick();
    }
    f.runtime.activateCheckpoint('cp2');
    f.runtime.recoverActiveCheckpoint();
    f.tick();
    assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 11, 'Room 1 retry cannot retain Room 2 ranges');
    f.input.press('debugTeleportRoomTwo');
    f.tick();
    f.input.release('debugTeleportRoomTwo');
    f.tick();
    assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 100);
    f.input.press('debugTeleportRoomOne');
    f.tick();
    f.input.release('debugTeleportRoomOne');
    f.tick();
    assert.equal(resources.electricalSystem.readModel.acquisitionRangeMetres, 11, 'Room 1 shortcut restores near ranges');
  } finally { f.cleanup(); }
});

test('conducting outlines appear only for actively aiming Volt, including render-only input release', () => {
  const f = createFixture();
  try {
    const highlights = f.scene.getObjectByName('volt-conducting-target-highlights')!;
    const assertHidden = () => {
      assert.equal(highlights.visible, false);
      assert.ok(highlights.children.every(child => !child.visible));
    };
    f.render(); assertHidden();
    f.input.press('aimAbility'); f.tick(); f.render();
    assert.equal(highlights.visible, true);
    assert.ok(highlights.children.every(child => !child.visible), 'CP1 does not reveal the distant circuit');
    const resources = electricalRoomInternals(f.runtime);
    resources.group.voltBody.teleport(new THREE.Vector3(-9, 0.46, 51.5));
    f.tick(); f.render();
    assert.ok(highlights.children.some(child => child.visible));
    f.input.release('aimAbility'); f.render(); assertHidden();
    f.input.press('aimAbility'); f.tick(); f.render();
    assert.equal(highlights.visible, true);
    f.switchSlime(); f.input.press('aimAbility'); f.tick(); f.render(); assertHidden(); // Bob
    f.switchSlime(); f.input.press('aimAbility'); f.tick(); f.render(); assertHidden(); // Goop aiming acid
    f.switchSlime(); f.input.press('aimAbility'); f.tick(); f.render();
    assert.equal(highlights.visible, true);
    f.input.pointerLocked = false; f.render(); assertHidden();
  } finally { f.cleanup(); }
});

test('authored Room 1 lets Goop aim, fire, and render acid projectiles', () => {
  const f = createFixture();
  try {
    f.switchSlime(); // Volt -> Bob
    f.switchSlime(); // Bob -> Goop
    f.input.press('aimAbility');
    f.tick();
    assert.equal(f.runtime.goopAimReadModel?.active, true);
    f.render();
    assert.equal(f.cameraRig.aimActive, true);

    f.input.press('fireAbility');
    f.tick();
    assert.equal(f.runtime.goopProjectileStates.some((projectile) => projectile.active), true);
    f.render();
    assert.equal(f.cameraRig.aimActive, true);
  } finally {
    f.cleanup();
  }
});

test('Room 1 retry restores Bob, Goop, and Volt to their shared checkpoint positions', () => {
  const f = createFixture();
  try {
    const start = f.runtime.getSlimePositions()!;
    f.input.press('moveRight');
    f.tick(20); // move Volt
    f.input.release('moveRight');
    f.switchSlime(); // Bob
    f.input.press('moveRight');
    f.tick(14);
    f.input.release('moveRight');
    f.switchSlime(); // Goop
    f.input.press('moveBackward');
    f.tick(12);
    f.input.release('moveBackward');
    f.tick();
    const displaced = f.runtime.getSlimePositions()!;
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(displaced[id].distanceTo(start[id]) > 0.2, `${id} should have moved before failure`);
    }

    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    const retryScreen = f.document.elements.find((element) => element.className === 'death-screen');
    assert.ok(retryScreen, 'death screen should be presented');
    retryScreen!.retryButton.click();

    const recovered = f.runtime.getSlimePositions()!;
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(recovered[id].distanceTo(start[id]) < 1e-6, `${id} should return to the checkpoint`);
    }
  } finally {
    f.cleanup();
  }
});


test('Room 1 activates CP2 once after the displayed Volt tutorial and restores a canonical drone state', () => {
  const f = createFixture();
  try {
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');

    f.input.press('mountDrone');
    f.tick();
    f.input.release('mountDrone');
    f.tick(340);

    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, true);
    assert.equal(f.runtime.maintenanceDroneReadModel?.mounted, true);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp2');
    assert.equal(f.runtime.roomState.local.tutorialComplete, true);
    assert.deepEqual(
      f.runtime.activeCheckpoint?.participantState['maintenance-drone'],
      {
        position: [3.5, 0.26, 2],
        stableState: 'grounded-idle',
        startupCompleted: true,
        tutorialCompleted: true,
        voltMounted: false,
      },
    );

    f.tick(30);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp2');

    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    const retryScreen = f.document.elements.find(
      (element) => element.className === 'death-screen',
    );
    assert.ok(retryScreen);
    retryScreen!.retryButton.click();

    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp2');
    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, true);
    assert.equal(f.runtime.maintenanceDroneReadModel?.mounted, false);
    assert.equal(f.runtime.maintenanceDroneReadModel?.state, 'grounded-idle');
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), [-2, 0.46, 2]);
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), [0, 0.46, 2]);
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), [2, 0.46, 2]);
  } finally {
    f.cleanup();
  }
});

test('Room 1 completion initializes Room 2 exactly once and CP3 owns later recovery', () => {
  const f = createFixture();
  try {
    const bodies = mutableRoomOneBodies(f.runtime);
    const entry = BLACKOUT_TRANSIT_CHECKPOINTS[0]!;
    let roomTwoObjectives = 0;
    const unsubscribe = f.runtime.events.on('objectiveChanged', ({ roomId, objective }) => {
      // The authored Room 2 has its own progress objectives; count only the
      // one-shot Room 1 handoff announcement.
      if (roomId === 'room-2' && objective === 'Restore the transit lights and clear the sewer drones for Bob') roomTwoObjectives += 1;
    });

    bodies.bob.position.set(6, 0.86, 83);
    bodies.goop.position.set(8, 0.86, 83);

    // Establish a bay-side previous sample, cross the entrance, traverse the
    // duct forward, then cross its outlet before entering the side catwalk.
    bodies.volt.position.set(-6, 0.46, 53);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 54);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 59.8);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 60.5);
    f.tick();
    bodies.volt.position.set(-16, 2.96, 83);
    f.tick();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.roomState.local.maintenanceBayComplete, true);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(roomTwoObjectives, 1);
    assert.equal(f.runtime.voltElectricalReadModel?.connectedTargetId, undefined);

    f.tick(20);
    assert.equal(roomTwoObjectives, 1);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');

    bodies.bob.position.set(6, 0.46, 57);
    bodies.goop.position.set(7, 0.46, 57);
    bodies.volt.position.set(8, 0.46, 57);
    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    const retryScreen = f.document.elements.find(
      (element) => element.className === 'death-screen',
    );
    assert.ok(retryScreen);
    retryScreen!.retryButton.click();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), entry.bodyPositions.bob.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), entry.bodyPositions.goop.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), entry.bodyPositions.volt.toArray());

    f.runtime.restartLevel();
    assert.equal(f.runtime.roomState.roomId, 'room-1');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
    assert.equal(f.runtime.maintenanceDroneReadModel?.tutorialCompleted, false);
    unsubscribe();
  } finally {
    f.cleanup();
  }
});


test('Room 1 stays authoritative after the CP3 handoff while players can return from Room 2', () => {
  const f = createFixture();
  try {
    const { bodies, bay } = roomOneInternals(f.runtime);
    const entry = BLACKOUT_TRANSIT_CHECKPOINTS[0]!;

    // Put the powered door well into its opening animation, then remove power
    // before completing the room. The handoff must not freeze the still-reachable
    // door at this partial pose.
    bay.target.setConnectionState(true);
    f.tick(82);
    assert.ok(
      bay.door.progress > 0.5 && bay.door.progress < 1,
      `door should be partly open before completion, got ${bay.door.progress}`,
    );
    bay.target.setConnectionState(false);

    bodies.bob.position.set(6, 0.86, 83);
    bodies.goop.position.set(8, 0.86, 83);
    bodies.volt.position.set(-6, 0.46, 53);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 54);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 59.8);
    f.tick();
    bodies.volt.position.set(-6, 0.46, 60.5);
    f.tick();
    bodies.volt.position.set(-16, 2.96, 83);
    f.tick();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.ok(
      bay.door.progress > 0,
      'completion should occur before the already-open door finishes closing',
    );

    f.tick(30);
    assert.equal(bay.door.state, 'closed');
    assert.equal(bay.door.progress, 0);

    // Room 1 remains physically reachable from the authored Room 2. Returning
    // Bob to the acid must still use the normal death path even after CP3.
    bodies.bob.position.set(8, -0.49, 18);
    f.tick();
    f.tick(70);
    const retryScreen = f.document.elements.find(
      (element) => element.className === 'death-screen',
    );
    assert.ok(
      retryScreen,
      'post-handoff Room 1 acid must remain lethal instead of being disabled',
    );
    retryScreen!.retryButton.click();

    assert.equal(f.runtime.roomState.roomId, 'room-2');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.deepEqual(f.runtime.getSlimePositions()?.bob.toArray(), entry.bodyPositions.bob.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.goop.toArray(), entry.bodyPositions.goop.toArray());
    assert.deepEqual(f.runtime.getSlimePositions()?.volt.toArray(), entry.bodyPositions.volt.toArray());
  } finally {
    f.cleanup();
  }
});

test('authored Room 2 checkpoint uses split routes and recovers all three bodies in the transit room', () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp3');
    f.runtime.recoverActiveCheckpoint();
    const entry = BLACKOUT_TRANSIT_CHECKPOINTS[0]!;
    const positions = f.runtime.getSlimePositions()!;
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(positions[id].distanceTo(entry.bodyPositions[id]) < 1e-6);
    }
    assert.ok(positions.bob.distanceTo(positions.volt) > 12, 'Volt starts on the separated service route');
    assert.equal(f.cameraRig.groundYaw, Math.PI, 'Room 2 recovery should face into the route');
    f.tick(3);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
    const recovered = f.runtime.getSlimePositions()!;
    assert.equal(f.cameraRig.groundYaw, Math.PI, 'death/retry must preserve the forward entry orientation');
    for (const id of ['bob', 'goop', 'volt'] as const) {
      assert.ok(recovered[id].distanceTo(entry.bodyPositions[id]) < 1e-6, `${id} recovers in Room 2, not Room 1`);
    }
  } finally { f.cleanup(); }
});

test('Room 1 separate entrances enter Room 2 without snapping bodies back to spawn', () => {
  const f = createFixture();
  try {
    const {group} = (f.runtime as unknown as {resources: {group: {
      bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody;
    }}}).resources;
    group.bobBody.teleport(new THREE.Vector3(5,.86,83));
    group.goopBody.teleport(new THREE.Vector3(7,.86,83));
    // Ordered fixed-step samples through the real Room 1 traversal controller.
    for (let z = 53; z <= 61; z += .5) {
      group.voltBody.teleport(new THREE.Vector3(-6,.46,z));
      f.tick();
    }
    group.voltBody.teleport(new THREE.Vector3(-16,2.96,83));
    f.tick();
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(f.runtime.activeCheckpoint?.room.roomId, 'room-2');
    assert.ok(f.runtime.getSlimePositions()!.volt.x < -14);
    assert.equal(f.runtime.getSlimePositions()!.bob.x, 5, 'physical entry must not teleport Bob to the checkpoint marker');
    f.tick(10);
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
  } finally { f.cleanup(); }
});

test('Goop can catch up toward Bob while the player returns to Volt at the bay entrance', () => {
  const f = createFixture();
  try {
    const r = (f.runtime as any).resources;
    r.group.bobBody.teleport(new THREE.Vector3(6, .46, 56));
    r.group.goopBody.teleport(new THREE.Vector3(6, .46, 50));
    const volt = r.group.voltBody.position.clone();
    f.tick(180);
    assert.equal(r.manager.activeSlimeId, 'volt');
    assert.ok(r.group.goopBody.position.z > 51.5, 'Bob already reached the exit, so Goop remains eligible while Volt is controlled');
    assert.ok(r.group.goopBody.position.z < 54, 'the unpowered door still blocks the companion');
    assert.ok(r.group.voltBody.position.distanceTo(volt) < .01, 'the player-controlled character receives no companion input');
    assert.equal(r.deathSequence.isPlaying, true);
  } finally { f.cleanup(); }
});

test('Level 3 number keys 1–3 teleport all bodies to clean room checkpoints', () => {
  const f = createFixture();
  try {
    const pressRoom = (key:InputAction) => { f.input.press(key); f.tick(); f.input.release(key); f.tick(); };
    pressRoom('debugTeleportRoomTwo');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.equal(f.runtime.activeCheckpoint?.room.roomId, 'room-2');
    const positions = f.runtime.getSlimePositions()!;
    assert.equal(positions.bob.x, 6);
    assert.equal(positions.goop.x, 8);
    assert.equal(positions.volt.x, -16);

    pressRoom('debugTeleportRoomThree');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp6');
    assert.equal(f.runtime.activeCheckpoint?.room.roomId, 'room-3');
    assert.equal(f.runtime.activeCheckpoint?.room.local.bossStaging, true);
    for (const body of Object.values(f.runtime.getSlimePositions()!)) assert.ok(body.z > 158 && body.y > .8);
    assert.equal(f.runtime.requestFailure(), true);
    f.tick(70);
    f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp6', 'Room 3 retry stays at its safe staging point');

    pressRoom('debugTeleportRoomOne');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
    for (const body of Object.values(f.runtime.getSlimePositions()!)) assert.ok(body.z < 5);
    pressRoom('debugTeleportRoomTwo');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3', 'room shortcuts remain repeatable after retry');
  } finally { f.cleanup(); }
});

test('Room 2 hazards stay authoritative when one body arrives before the others', () => {
  const f = createFixture();
  try {
    const {group} = (f.runtime as unknown as {resources:{group:{bobBody:KinematicBody}}}).resources;
    group.bobBody.teleport(new THREE.Vector3(10,-.545,94));
    f.tick();
    assert.equal(f.input.enabled, false, 'Bob cannot bypass the acid while the other slimes remain in Room 1');
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp1');
  } finally { f.cleanup(); }
});

test('Bob can walk onto the final bridge button in the complete runtime after Goop clears the guards', () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp5');
    f.runtime.recoverActiveCheckpoint();
    const { group, transit } = (f.runtime as unknown as { resources: {
      group: { bobBody: KinematicBody; activeSlimeId: string };
      transit: BlackoutTransitController;
    } }).resources;
    for (const enemy of transit.emergingDrones) enemy.state.destroy();
    while (group.activeSlimeId !== 'bob') f.switchSlime();
    f.input.press('moveLeft');
    f.tick(90);
    f.input.release('moveLeft');
    f.tick(90);
    assert.equal(group.bobBody.attached, true, `Bob stopped at ${group.bobBody.position.toArray()}`);
    assert.equal(group.bobBody.attachmentSurfaceName, 'bob-bridge-switch-sticky-wall');
    assert.equal(transit.bridgeDeployed, true);
  } finally { f.cleanup(); }
});

for (const slimeId of ['bob', 'volt'] as const) test(`a real Room 2 drone hit kills ${slimeId} and retries through the existing death flow`, () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp3'); f.runtime.recoverActiveCheckpoint();
    const { group, transit } = (f.runtime as any).resources;
    while (group.activeSlimeId !== slimeId) f.switchSlime();
    group[`${slimeId}Body`].teleport(slimeId === 'bob' ? new THREE.Vector3(10.5, 1.66, 102) : new THREE.Vector3(-16, 2.96, 132));
    const impacts: number[] = [];
    transit.projectiles.events.on('slimeImpact', (event: any) => { if (event.slimeId === slimeId) impacts.push(event.damage); });
    for (let i = 0; i < 600 && f.input.enabled; i++) f.tick();
    assert.deepEqual(impacts, [100]); assert.equal(f.input.enabled, false);
    f.tick(70);
    f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
    assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3');
    assert.ok(transit.damage.health.every((h: any) => h.health === 100));
    assert.ok(transit.emergingDrones.every((d: any) => d.state.state === 'dormant'));
    assert.ok(transit.lifts.every((l: any) => !l.core.readModel.available)); assert.equal(transit.bridgeDeployed, false);
  } finally { f.cleanup(); }
});

test('dying late in Room 2 resets every body and all puzzle state to the room entrance', () => {
  const f = createFixture();
  try {
    f.runtime.activateCheckpoint('cp3');
    f.runtime.recoverActiveCheckpoint();
    const { group, transit } = (f.runtime as unknown as { resources: {
      group: { bobBody: KinematicBody; goopBody: KinematicBody; voltBody: KinematicBody };
      transit: BlackoutTransitController;
    } }).resources;
    for (const stage of [1, 2]) {
      for (let index = 0; index < stage; index++) transit.emergingDrones[index]!.state.destroy();
      const enemy = transit.emergingDrones[stage - 1]!;
      enemy.state.destroy();
      transit.lights[stage - 1]!.target.setConnectionState(true);
      f.tick(120);
      transit.lights[stage - 1]!.target.setConnectionState(false);
      assert.equal(enemy.state.state, 'destroyed');
      assert.equal(transit.lights[stage - 1]!.latched, true);
      const checkpoint = BLACKOUT_TRANSIT_CHECKPOINTS[stage]!;
      group.bobBody.teleport(checkpoint.bodyPositions.bob);
      f.tick(3);
      assert.equal(f.runtime.activeCheckpoint?.checkpointId, checkpoint.id);
      group.goopBody.teleport(new THREE.Vector3(17,-.52,140));
      group.voltBody.teleport(new THREE.Vector3(-16,2.96,132));
      assert.equal(f.runtime.requestFailure(), true);
      f.tick(70);
      f.document.elements.find(element => element.className === 'death-screen')!.retryButton.click();
      const restored = f.runtime.getSlimePositions()!;
      for (const id of ['bob', 'goop', 'volt'] as const) {
        assert.ok(restored[id].distanceTo(BLACKOUT_TRANSIT_CHECKPOINTS[0]!.bodyPositions[id]) < 1e-6,
          `${id} should return to Room 2 entry even if parked far from the active slime`);
      }
      assert.ok(transit.emergingDrones.every(enemy => enemy.state.state === 'dormant' && enemy.state.hits === 0));
      assert.ok(transit.lights.every(light => !light.latched && light.charge === 0));
      assert.equal(transit.bridgeLocked,false);
      assert.equal(transit.bridgeDeployed,false);
      f.tick(3);
      assert.equal(f.runtime.activeCheckpoint?.checkpointId, 'cp3', 'death retry is a full room restart');
    }
  } finally { f.cleanup(); }
});

 test('preloaded CPU maps survive reload while each bay owns fresh textures and dispose releases runtime data', () => {
  const f=createFixture();
  const resources=()=> (f.runtime as unknown as {resources:{scene:{maintenanceBay:{surfaceMaterials:{get(family:string):THREE.MeshStandardMaterial}}}}}).resources;
  const first=resources().scene.maintenanceBay.surfaceMaterials.get('wallPanel').map as THREE.DataTexture;
  let disposed=0;first.addEventListener('dispose',()=>disposed++);
  try {
    f.runtime.unload();f.runtime.unload();assert.equal(disposed,1);
    f.runtime.load();
    const second=resources().scene.maintenanceBay.surfaceMaterials.get('wallPanel').map as THREE.DataTexture;
    assert.notEqual(second,first);assert.equal(second.image.data,first.image.data);
    f.runtime.start();f.runtime.restartLevel();assert.equal(resources().scene.maintenanceBay.surfaceMaterials.get('wallPanel').map,second);
    f.runtime.dispose();assert.equal((f.runtime as unknown as {maintenanceMaps:unknown}).maintenanceMaps,undefined);
  } finally {f.cleanup();}
});


test('ordinary production ignores authored room teleport keys', () => {
  const f = createFixture(false);
  try {
    assert.equal(f.runtime.roomState.roomId, 'room-1');
    for (const action of ['debugTeleportRoomTwo', 'debugTeleportRoomThree'] as const) {
      f.input.press(action); f.tick(); f.input.release(action); f.tick();
      assert.equal(f.runtime.roomState.roomId, 'room-1');
    }
  } finally { f.cleanup(); }
});

for (const room of [1, 2] as const) for (const slime of ['bob', 'volt'] as const) {
  test(`Room ${room} emits one ${slime} acid impact before death, animates it, and clears it on recovery`, () => {
    const f = createFixture();
    try {
      if (room === 2) { f.input.press('debugTeleportRoomTwo'); f.tick(); f.input.release('debugTeleportRoomTwo'); }
      const r = electricalRoomInternals(f.runtime);
      const owner = room === 1 ? r.maintenanceBay.bay : r.transit.room;
      const mesh = owner.root.getObjectByName(room === 1 ? 'animated-acid-surface' : 'transit-acid-surface') as THREE.Mesh;
      const material = mesh.material as AcidSurfaceMaterial;
      const victim = slime === 'bob' ? r.group.bobBody : r.group.voltBody;
      const surfaceY = new THREE.Box3().setFromObject(mesh).max.y;
      const shader = {uniforms: {}, vertexShader: '', fragmentShader: ''};
      material.onBeforeCompile(shader as never, {} as never);
      const uniforms = shader.uniforms as Record<string, {value: any}>;
      // Sample in open basin space, away from platforms, lasers and drones.
      victim.teleport(new THREE.Vector3(room === 1 ? -10 : 18, room === 1 ? -.351 : -.201, room === 1 ? 20 : 95));
      f.tick();
      assert.equal(f.input.enabled, false, 'the existing acid failure path stops gameplay');
      assert.equal(material.interactionDiagnostics.emitted, 1);
      const impact = uniforms.uRipples.value[0] as THREE.Vector4;
      assert.ok(Math.abs(impact.x - victim.position.x) < 1e-6);
      assert.ok(Math.abs(impact.y - victim.position.z) < 1e-6);
      assert.ok(Math.abs(uniforms.uRippleSurfaceY.value[0] - surfaceY) < 1e-6);
      const time = material.diagnostics.timeSeconds;
      f.tick(30);
      assert.ok(material.diagnostics.timeSeconds > time, 'the death impact continues expanding');
      assert.equal(material.interactionDiagnostics.emitted, 1, 'death steps cannot resample or repeat the splash');
      f.runtime.stop(); const pausedTime = material.diagnostics.timeSeconds; f.tick(10);
      assert.equal(material.diagnostics.timeSeconds, pausedTime);
      f.runtime.start(); f.runtime.recoverActiveCheckpoint();
      assert.equal(material.interactionDiagnostics.active, 0);
      owner.acidInteractions.fallPulse(victim);
      f.runtime.restartLevel();
      assert.equal(material.interactionDiagnostics.active, 0);
    } finally { f.cleanup(); }
  });
}

test('Goop remains immune while a real persistent body wakes each basin; generic failures do not project acid impacts', () => {
  const f = createFixture();
  try {
    const r = electricalRoomInternals(f.runtime);
    f.switchSlime(); f.switchSlime(); // Volt -> Bob -> Goop.
    for (const [owner, x, z, name] of [
      [r.maintenanceBay.bay, -10, 20, 'animated-acid-surface'],
      [r.transit.room, 18, 95, 'transit-acid-surface'],
    ] as const) {
      if (owner === r.transit.room) {
        f.input.press('debugTeleportRoomTwo'); f.tick(); f.input.release('debugTeleportRoomTwo');
        f.switchSlime(); // CP3 selects Bob; take control of Goop.
      }
      const material = (owner.root.getObjectByName(name) as THREE.Mesh).material as AcidSurfaceMaterial;
      r.group.goopBody.teleport(new THREE.Vector3(x, 1.5, z));
      f.tick(50);
      assert.equal(f.input.enabled, true, 'Goop never requests an acid death');
      const emitted = material.interactionDiagnostics.emitted;
      assert.ok(emitted >= 1, `${name} emits an initial contact`);
      f.input.press('moveRight');
      f.tick(12);
      f.input.release('moveRight');
      assert.ok(material.interactionDiagnostics.emitted > emitted);
      owner.acidInteractions.reset();
    }
    r.group.goopBody.teleport(new THREE.Vector3(8, .86, 84));
    f.runtime.requestFailure();
    for (const [owner, name] of [[r.maintenanceBay.bay, 'animated-acid-surface'], [r.transit.room, 'transit-acid-surface']] as const) {
      const material = (owner.root.getObjectByName(name) as THREE.Mesh).material as AcidSurfaceMaterial;
      assert.equal(material.interactionDiagnostics.active, 0, 'non-acid deaths do not project a ripple');
    }
  } finally { f.cleanup(); }
});
