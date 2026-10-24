import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { FinalBossController } from '../src/boss/FinalBossController.ts';

// Compile the real authority through Vite so the tests cover both build gates.
// Direct Node imports have no import.meta.env and cover the disabled fallback.
async function controllerForBuild(dev:boolean):Promise<typeof FinalBossController> {
  const result=await build({
    root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,logLevel:'silent',
    define:{'import.meta.env.DEV':String(dev)},
    build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('../src/boss/FinalBossController.ts',import.meta.url)),formats:['es']}},
  });
  const bundle=Array.isArray(result)?result[0]:result;
  if(!bundle||!('output' in bundle))throw new Error('Missing boss authority bundle.');
  const script=bundle.output.find(item=>item.type==='chunk'&&item.isEntry);
  if(!script||script.type!=='chunk')throw new Error('Missing boss authority entry.');
  return (await import(`data:text/javascript;base64,${Buffer.from(script.code).toString('base64')}`)).FinalBossController;
}

const target={x:0,y:2,z:200};

test('dev invincibility blocks damage without consuming hit grace, and disabling it restores the same attack hit',async()=>{
  const Controller=await controllerForBuild(true),boss=new Controller({random:()=>0});
  try {
    boss.toggleDevInvincibility();assert.equal(boss.devInvincible,false,'idle rooms cannot enable it');
    boss.start();boss.toggleDevInvincibility();assert.equal(boss.devInvincible,true);
    boss.skipCinematic(target);
    for(const [damage,serial] of [[7,-1],[20,-2],[40,42],[45,43],[999,-3]]) {
      assert.equal(boss.damagePlayer(damage,serial),false);
      boss.update(1,target);
    }
    assert.equal(boss.readModel.playerHealth,100);assert.equal(boss.readModel.invulnerability,0);
    assert.ok(boss.time>=5,'attacks continue while invincible');
    boss.toggleDevInvincibility();assert.equal(boss.devInvincible,false);
    assert.equal(boss.damagePlayer(40,42),true,'blocked beam hits must not consume their attack serial');
    assert.equal(boss.readModel.playerHealth,60);
    boss.toggleDevInvincibility();boss.update(1,target);
    assert.equal(boss.damagePlayer(999,-4),false);assert.equal(boss.readModel.playerHealth,60,'enabling does not heal');
    boss.reset();assert.equal(boss.devInvincible,false);
    boss.startPhaseTwo(target);assert.equal(boss.damagePlayer(7,-5),true);
  }finally{boss.dispose();}
});

test('dev invincibility survives the phase transition and resets for a new attempt',async()=>{
  const Controller=await controllerForBuild(true),boss=new Controller({random:()=>0});
  const hit={projectileId:1,targetId:'core',kind:'direct' as const,fullyCharged:true,chargeAmount:1,damageUnits:999,point:target,direction:target};
  try {
    boss.start(true);boss.toggleDevInvincibility();
    for(let wave=0;wave<3;wave++) {
      boss.applyImpact(hit);boss.update(1.35,target);
      for(let i=0,n=boss.readModel.defendersRemaining;i<n;i++)boss.droneDestroyed();
      boss.update(1.21,target);
    }
    boss.applyImpact(hit);boss.update(1/60,target);assert.equal(boss.readModel.state,'transition');
    boss.skipCinematic(target);assert.equal(boss.readModel.phase,2);assert.equal(boss.devInvincible,true);
    assert.equal(boss.damagePlayer(999,-1),false);
    boss.reset();boss.startPhaseTwo(target);assert.equal(boss.devInvincible,false);
    assert.equal(boss.damagePlayer(999,-1),true);assert.equal(boss.readModel.playerHealth,0);
  }finally{boss.dispose();}
});

test('production authority cannot enable invincibility in either phase',async()=>{
  const Controller=await controllerForBuild(false),boss=new Controller({random:()=>0});
  try {
    boss.start();boss.toggleDevInvincibility();boss.skipCinematic(target);
    assert.equal(boss.devInvincible,false);assert.equal(boss.damagePlayer(20,-1),true);
    boss.reset();boss.startPhaseTwo(target);boss.toggleDevInvincibility();
    assert.equal(boss.devInvincible,false);assert.equal(boss.damagePlayer(999,-2),true);
  }finally{boss.dispose();}
});
