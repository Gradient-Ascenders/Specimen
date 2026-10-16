import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { acidSurfaceFragmentPars } from '../src/render/environment/containment/acidSurfaceShader.ts';
import { createAcidNoiseTexture } from '../src/render/environment/containment/AcidNoiseTexture.ts';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { captureContainmentCollisionFingerprint } from '../src/levels/ContainmentCollisionFingerprint.ts';
import {
  AcidSurfaceMaterial,
  DEFAULT_ACID_BUBBLE_SCALE,
  DEFAULT_ACID_BUBBLE_STRENGTH,
  DEFAULT_ACID_EMISSION_STRENGTH,
  DEFAULT_ACID_FLOW_SCALE,
  DEFAULT_ACID_FLOW_SPEED,
} from '../src/render/environment/containment/AcidSurfaceMaterial.ts';

test('acid material retains standard lighting and updates one stable uniform set', () => {
  const material = new AcidSurfaceMaterial();
  const materialReference = material;

  assert.ok(material instanceof THREE.MeshStandardMaterial);
  assert.equal(material.name, 'room-3-hazardous-chemical-liquid');
  assert.deepEqual(material.diagnostics, {
    timeSeconds: 0,
    flowSpeed: DEFAULT_ACID_FLOW_SPEED,
    flowScale: DEFAULT_ACID_FLOW_SCALE,
    bubbleScale: DEFAULT_ACID_BUBBLE_SCALE,
    bubbleStrength: DEFAULT_ACID_BUBBLE_STRENGTH,
    emissionStrength: DEFAULT_ACID_EMISSION_STRENGTH,
  });
  for (const value of Object.values(material.diagnostics)) {
    assert.equal(Number.isFinite(value), true);
  }

  material.update(0.25);
  material.update(0.5);
  assert.equal(material, materialReference);
  assert.equal(material.diagnostics.timeSeconds, 0.75);
  assert.throws(() => material.update(Number.NaN), /finite and non-negative/);
  assert.throws(() => material.update(-0.01), /finite and non-negative/);
  material.dispose();
});

test('baked flow uses one data lookup per FBM field and releases only its owned texture', () => {
  const first = createAcidNoiseTexture(), second = createAcidNoiseTexture();
  assert.notEqual(first, second); assert.equal(first.image.data, second.image.data);
  assert.equal(first.image.width, 256); assert.equal(first.image.data.length, 65536);
  assert.equal(first.format, THREE.RedFormat); assert.equal(first.colorSpace, THREE.NoColorSpace);
  assert.equal(first.wrapS, THREE.RepeatWrapping); assert.equal(first.wrapT, THREE.RepeatWrapping);
  assert.equal(first.minFilter, THREE.LinearFilter); assert.equal(first.magFilter, THREE.LinearFilter);
  assert.equal(first.generateMipmaps, false);
  const pixels = first.image.data;
  let seamDifference = 0;
  for (let i = 0; i < 256; i++) seamDifference = Math.max(seamDifference,
    Math.abs(pixels[i * 256]! - pixels[i * 256 + 255]!), Math.abs(pixels[i]! - pixels[255 * 256 + i]!));
  assert.ok(seamDifference < 26, 'repeated field edges must not introduce a discontinuity');
  const noise = acidSurfaceFragmentPars.split('float acidValueNoise')[1]!.split('float acidFbm')[0]!;
  const fbm = acidSurfaceFragmentPars.split('float acidFbm')[1]!.split('void evaluateAcidBubbles')[0]!;
  assert.equal((fbm.match(/texture2D\(/g) ?? []).length, 1);
  assert.doesNotMatch(fbm, /acidValueNoise|acidHash12/);
  assert.equal((noise.match(/acidHash12\(/g) ?? []).length, 4, 'counter-moving domain warps retain analytic noise');
  assert.match(noise, /local \* local \* \(3.0 - 2.0 \* local\)/);
  const borrowed = new THREE.Texture(), material = new AcidSurfaceMaterial({ foundationMap: borrowed });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never);
  const texture = (shader.uniforms as Record<string, THREE.IUniform>).uAcidNoise.value as THREE.DataTexture;
  let releases = 0, borrowedReleases = 0;
  texture.addEventListener('dispose', () => releases++); borrowed.addEventListener('dispose', () => borrowedReleases++);
  material.update(0.2); material.disturb(0, 0, 0, 1);
  assert.equal(material.interactionDiagnostics.active, 1);
  material.dispose(); material.dispose();
  assert.equal(releases, 1); assert.equal(borrowedReleases, 0);
  first.dispose(); second.dispose(); borrowed.dispose();
});

test('Room 3 owns one acid material while frozen collision remains unchanged', () => {
  const first = new ContainmentLevelScene(() => {});
  const material = first.roomThree.art.acidSurfaceMaterial;
  const surface = first.roomThree.art.acidSurface;
  const collider = first.collisionMeshes.find(
    (mesh) => mesh.name === 'room-3-acid-floor',
  );
  assert.ok(collider);
  const collisionBefore = captureContainmentCollisionFingerprint(
    first.collisionMeshes,
  );

  assert.equal(surface.material, material);
  assert.equal(surface.userData.authoritativeCollider, collider.name);
  assert.equal(surface.userData.materialRole, 'replaceable-acid-surface');
  assert.equal(first.collisionMeshes.includes(surface), false);
  assert.deepEqual(surface.scale.toArray(), [32.7, 0.05, 26.7]);
  assert.deepEqual(surface.position.toArray(), [0, 5.025, 63]);
  assert.equal(collider.userData.textureRole, 'acid-floor');
  assert.deepEqual(collider.userData.sizeMetres, [34, 0.4, 28]);
  assert.deepEqual(collider.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(collider.position.toArray(), [0, 4.8, 63]);

  first.update(0.4);
  first.roomThree.reset();
  first.update(0.6);
  assert.equal(first.roomThree.art.acidSurfaceMaterial, material);
  assert.equal(material.diagnostics.timeSeconds, 1);
  assert.deepEqual(
    captureContainmentCollisionFingerprint(first.collisionMeshes),
    collisionBefore,
  );

  let disposeEvents = 0;
  material.addEventListener('dispose', () => {
    disposeEvents += 1;
  });
  first.dispose();
  assert.equal(disposeEvents, 1);

  const recreated = new ContainmentLevelScene(() => {});
  assert.notEqual(recreated.roomThree.art.acidSurfaceMaterial, material);
  assert.equal(
    recreated.roomThree.art.acidSurfaceMaterial.diagnostics.timeSeconds,
    0,
  );
  recreated.dispose();
});
