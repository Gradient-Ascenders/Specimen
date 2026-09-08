import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BeamOcclusion } from '../src/render/hazards/BeamOcclusion.ts';
import { SlimeLightSampler } from '../src/render/slime/SlimeLightSampler.ts';
import { SlimeMaterial } from '../src/render/slime/SlimeMaterial.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

test('beam stops before a cover and recovers its length when the cover is removed', () => {
  const world = new CollisionWorld(), clip = new BeamOcclusion();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 8, .3)); wall.position.z = -5;
  world.register(wall); const origin = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1);
  const source = new THREE.Mesh();
  assert.ok(clip.length(world, origin, forward, 15, .4, source) < 4.85);
  world.unregister(wall);
  assert.equal(clip.length(world, origin, forward, 15, .4, source), 15);
  wall.geometry.dispose(); world.clear();
});

test('slime loses its fixed glow in darkness and receives only unblocked light', () => {
  const material = new SlimeMaterial(), world = new CollisionWorld(), sampler = new SlimeLightSampler();
  const body = new THREE.Vector3();
  sampler.apply(material, body, world);
  assert.equal(material.uniforms.uKeyLightRadiance.value.r, 0);
  assert.ok(material.uniforms.uRimStrength.value < .01);
  const light = new THREE.PointLight(0x79bdff, 30, 10); light.position.z = -4;
  sampler.sources.push({ light }); sampler.apply(material, body, world);
  assert.ok(material.uniforms.uKeyLightRadiance.value.b > .1);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 5, .3)); wall.position.z = -2; world.register(wall);
  sampler.apply(material, body, world); assert.equal(material.uniforms.uKeyLightRadiance.value.b, 0);
  material.restoreDefaultLighting(); assert.ok(material.uniforms.uKeyLightRadiance.value.r > 1);
  material.dispose(); wall.geometry.dispose(); world.clear();
});

test('partial cover clips only blocked cone edges, not the entire visible ray', () => {
  const world = new CollisionWorld(), clip = new BeamOcclusion();
  const geometry = new THREE.ConeGeometry(6, 15, 24, 1, true); geometry.translate(0, -7.5, 0);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, .2)); wall.position.set(10, -7, -5); world.register(wall);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const source = new THREE.Mesh();
  clip.clipGeometry(world, new THREE.Vector3(), rotation, geometry, source);
  const positions = geometry.getAttribute('position');
  let shortened = false, fullLength = false;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) < -1 && positions.getY(i) > -14) shortened = true;
    if (positions.getY(i) < -14.9) fullLength = true;
  }
  assert.ok(shortened && fullLength);
  world.unregister(wall); clip.clipGeometry(world, new THREE.Vector3(), rotation, geometry, source);
  assert.ok(Array.from({ length: positions.count }, (_, i) => positions.getY(i)).every(y => Math.abs(y) < .001 || Math.abs(y + 15) < .001));
  geometry.dispose(); wall.geometry.dispose(); world.clear();
});
