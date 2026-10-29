import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {BossDefeatEffects} from '../../../src/cinematics/BossDefeatEffects.ts';

test('ending density preserves beams and reduces cosmetics; uploads cover only active instances',()=>{
  const effects=new BossDefeatEffects(),a=new THREE.Vector3(),b=new THREE.Vector3(0,0,20);
  effects.present(18,a,b,a);const full=effects.diagnostics;
  effects.setDensity(.5);effects.present(18,a,b,a);const low=effects.diagnostics;
  assert.equal(low.beamsLaunched,full.beamsLaunched);assert.equal(low.directHits,full.directHits);assert.ok(low.sparks<full.sparks);
  assert.deepEqual(effects.sparks.instanceMatrix.updateRanges,[{start:0,count:effects.sparks.count*16}]);
  effects.dispose();
});
