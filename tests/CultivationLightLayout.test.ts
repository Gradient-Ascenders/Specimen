import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationLightLayout } from '../src/render/CultivationLightLayout.ts';

test('compatible light layouts preserve authored illumination and add no shadow passes', () => {
  const scene = new THREE.Scene();
  const authored = Array.from({length:17}, (_, i) => new THREE.PointLight(0x74abcd, 10 + i, 8)); scene.add(...authored);
  const spot = new THREE.SpotLight(0xff7733, 50); spot.castShadow = true; spot.visible = false; scene.add(spot);
  const layout = new CultivationLightLayout(scene);
  const snapshot = authored.map(l => [l.color.getHex(), l.intensity, l.distance, l.castShadow]);
  const count = () => { let n=0; scene.traverseVisible(o => {if(o instanceof THREE.PointLight)n++;}); return n; };
  for (const [visible, expected] of [[2,2],[5,8],[8,8],[9,17],[17,17]]) {
    authored.forEach((l,i) => l.visible = i < visible); layout.sync(scene); assert.equal(count(),expected);
  }
  spot.visible = true;
  for (const visible of [7, 9, 11, 13, 15, 17, 15]) {
    authored.forEach((l,i) => l.visible = i < visible); layout.sync(scene); assert.equal(count(),17);
  }
  layout.root.traverse(o => {if(o instanceof THREE.Light){assert.equal(o.intensity,0);assert.equal(o.color.getHex(),0);assert.equal(o.castShadow,false);}});
  assert.deepEqual(authored.map(l => [l.color.getHex(),l.intensity,l.distance,l.castShadow]),snapshot);
  assert.equal(spot.intensity,50); assert.equal(spot.castShadow,true);
  layout.dispose(); assert.equal(scene.children.includes(layout.root),false);
});
