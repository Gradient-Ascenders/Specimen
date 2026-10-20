import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { clonePrewarmDrawable } from '../src/render/ShadowPrewarmMaterial.ts';
import { CULTIVATION_PLATFORM_SPLASH_SECONDS as LIFETIME, CULTIVATION_PLATFORM_SPLASH_INSTANCES as PER_DROP } from '../src/render/environment/cultivation/CultivationPlatformSplashes.ts';

test('real dissolved platforms splash only at acid contact, displacing perimeter ripples and fixed ballistic particles once',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces));scene.bindDissolveTargets(targets);
  const effects=scene.platformSplashes,pool=effects.mesh,geometry=pool.geometry,material=pool.material;
  const cues:{sound:string;position:THREE.Vector3}[]=[];
  const off=gameplayAudioEvents.on('cue',cue=>{if(cue.position)cues.push({sound:cue.sound,position:new THREE.Vector3().copy(cue.position)});});
  try{
    assert.equal(pool.count,0);scene.updatePresentationVisibility({z:15},{z:15});
    const dormant=pool.instanceMatrix.version;scene.update(60,1,[]);assert.equal(pool.instanceMatrix.version,dormant,'Dormant pools never upload instance buffers.');
    const target=targets.find(target=>target.id===scene.roomOne.platformDrops[0].solubleTargetId)!;
    target.advance(target.dissolveDurationSeconds);
    scene.update(.1,1,[]);assert.equal(scene.roomOne.platformDrops[0].state,'falling');assert.equal(effects.impactCount,0);
    const ripples=scene.labArt.acid.interactionDiagnostics.emitted;
    scene.update(3,1,[]);assert.equal(effects.impactCount,1);assert.ok(pool.count>0&&pool.count<=PER_DROP);
    assert.equal(scene.labArt.acid.interactionDiagnostics.emitted,ripples+4);
    const splashes=cues.filter(cue=>cue.sound==='goop-projectile-impact-01');assert.equal(splashes.length,1);
    assert.ok(splashes[0].position.distanceTo(new THREE.Vector3(61,0,15.5))<1e-6,'Splash audio is at the platform’s actual world-space impact.');
    scene.update(.18,1,[]);assert.ok(pool.count+effects.crowns.count>24);assert.equal(effects.crowns.count,12);
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
    let height=0;
    for(let i=0;i<pool.count;i++){
      pool.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);height=Math.max(height,position.y+scale.y);
      assert.ok(Math.abs(position.x+3)>2.5||Math.abs(position.z-15.5)>2.5,'Liquid splashes outside the solid landing platform.');
    }
    assert.ok(height>.75,'The impact produces visible 3D spray, not just a flat decal.');
    assert.ok(effects.crowns.geometry.getAttribute('position').count<100,'Curved crown geometry is prebuilt and deliberately small.');
    for(let t=0;t<LIFETIME+.2;t+=.05){scene.update(.05,1,[]);assert.equal(pool.geometry,geometry);assert.equal(pool.material,material);}
    assert.equal(pool.count,0);assert.equal(effects.crowns.count,0);assert.equal(effects.impactCount,1);
    scene.reset();assert.equal(effects.impactCount,0);assert.equal(pool.count,0);
    assert.equal(cues.filter(cue=>cue.sound==='goop-projectile-impact-01').length,1,'Resets never splash.');
  }finally{off();targets.forEach(t=>t.dispose());world.clear();surfaces.clear();scene.dispose();}
});

test('simultaneous impacts remain bounded, culled effects age silently, and dormant instance buffers are prepared without spawning',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces));scene.bindDissolveTargets(targets);
  try{
    const pool=scene.platformSplashes.mesh,disposers:(()=>void)[]=[];
    assert.equal(pool.count,0);const proxy=clonePrewarmDrawable(pool,disposers);
    assert.equal(pool.count,0);assert.equal(proxy.count,1);assert.equal(proxy.instanceMatrix,pool.instanceMatrix);
    disposers.forEach(dispose=>dispose());assert.equal(pool.count,0);
    for(const drop of scene.roomOne.platformDrops){const target=targets.find(t=>t.id===drop.solubleTargetId)!;target.advance(target.dissolveDurationSeconds);}
    scene.updatePresentationVisibility({z:15},{z:15});scene.update(3,1,[]);scene.update(.2,1,[]);
    assert.equal(scene.platformSplashes.impactCount,3);assert.ok(pool.count>PER_DROP&&pool.count+scene.platformSplashes.crowns.count<=3*PER_DROP);
    const version=pool.instanceMatrix.version;scene.updatePresentationVisibility({z:200},{z:200});scene.update(.2,3,[]);
    assert.equal(pool.count,0);assert.equal(pool.instanceMatrix.version,version,'Hidden splash buffers are not re-uploaded.');
    scene.update(2,3,[]);scene.updatePresentationVisibility({z:15},{z:15});scene.update(.01,1,[]);
    assert.equal(pool.count,0,'Old impacts cannot replay when revisiting the room.');
    let disposed=0;for(const resource of [pool,pool.geometry,pool.material as THREE.Material,scene.platformSplashes.crowns,
      scene.platformSplashes.crowns.geometry,scene.platformSplashes.crowns.material as THREE.Material])resource.addEventListener('dispose',()=>disposed++);
    scene.platformSplashes.dispose();scene.platformSplashes.dispose();assert.equal(disposed,6);
  }finally{targets.forEach(t=>t.dispose());world.clear();surfaces.clear();scene.dispose();}
});
