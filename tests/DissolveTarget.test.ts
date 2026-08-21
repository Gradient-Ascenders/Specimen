import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  createAuthoredDissolveTarget,
  type DissolveTarget,
} from '../src/abilities/DissolveTarget.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { DissolveMaterial } from '../src/render/dissolve/DissolveMaterial.ts';

const EPSILON = 1e-10;

interface TargetFixture {
  readonly target: DissolveTarget;
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BoxGeometry;
  readonly sourceMaterials: readonly THREE.MeshStandardMaterial[];
  readonly world: CollisionWorld;
  readonly surfaces: SurfaceRegistry;
}

function createTargetFixture(
  id: string,
  x = 0,
  materialCount = 1,
): TargetFixture {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const geometry = new THREE.BoxGeometry(2, 2, 0.4);
  const sourceMaterials = Array.from(
    { length: materialCount },
    (_, index) =>
      new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xb66a36 : 0x70864b,
        emissive: 0x241006,
        emissiveIntensity: 0.25,
        roughness: 0.63,
        metalness: 0.27,
      }),
  );
  const mesh = new THREE.Mesh(
    geometry,
    materialCount === 1 ? sourceMaterials[0] : [...sourceMaterials],
  );
  mesh.name = id;
  mesh.position.x = x;
  mesh.userData.surfaceTag = 'default';
  mesh.userData.soluble = true;
  mesh.userData.solubleId = id;
  mesh.userData.dissolveDurationSeconds = 2;
  mesh.userData.dissolveCollisionDisableProgress = 0.7;

  world.register(mesh);
  surfaces.register(mesh);
  const target = createAuthoredDissolveTarget(mesh, world, surfaces);
  assert.ok(target);

  return { target, mesh, geometry, sourceMaterials, world, surfaces };
}

function disposeFixture(fixture: TargetFixture): void {
  fixture.target.dispose();
  fixture.geometry.dispose();
  for (const material of fixture.sourceMaterials) material.dispose();
  fixture.world.clear();
  fixture.surfaces.clear();
}

function compileShadowHook(material: THREE.Material): {
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly vertexShader: string;
  readonly fragmentShader: string;
} {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader:
      '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}',
  };
  material.onBeforeCompile(shader, null as never);
  return shader;
}

function compileSurfaceHook(material: THREE.Material): {
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly vertexShader: string;
  readonly fragmentShader: string;
} {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: `#include <common>
void main() {
  #include <clipping_planes_fragment>
  vec3 totalEmissiveRadiance = emissive;
  #include <emissivemap_fragment>
}`,
  };
  material.onBeforeCompile(shader, null as never);
  return shader;
}

test('gameplay progress drives visible, depth, and distance dissolve passes', () => {
  const fixture = createTargetFixture('render-sync');
  const { target, mesh } = fixture;

  try {
    assert.ok(mesh.material instanceof DissolveMaterial);
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
    assert.equal(mesh.material.transparent, false);
    assert.equal(mesh.material.depthWrite, true);
    assert.equal(mesh.material.roughness, 0.63);
    assert.equal(mesh.material.metalness, 0.27);
    assert.ok(mesh.material.color.equals(fixture.sourceMaterials[0]!.color));
    assert.ok(
      mesh.material.emissive.equals(fixture.sourceMaterials[0]!.emissive),
    );
    assert.equal(
      mesh.material.emissiveIntensity,
      fixture.sourceMaterials[0]!.emissiveIntensity,
    );
    assert.ok(mesh.customDepthMaterial instanceof THREE.MeshDepthMaterial);
    assert.ok(
      mesh.customDistanceMaterial instanceof THREE.MeshDistanceMaterial,
    );

    const surfaceShader = compileSurfaceHook(mesh.material);
    const depthShader = compileShadowHook(mesh.customDepthMaterial);
    const distanceShader = compileShadowHook(mesh.customDistanceMaterial);
    assert.match(surfaceShader.fragmentShader, /dissolveSurfaceMask/);
    assert.match(surfaceShader.fragmentShader, /discard/);
    assert.match(
      surfaceShader.fragmentShader,
      /uniform float uDissolveEdgeWidth;/,
    );
    assert.match(
      surfaceShader.fragmentShader,
      /uniform vec3 uDissolveEdgeColour;/,
    );
    assert.match(surfaceShader.fragmentShader, /totalEmissiveRadiance \+=/);
    assert.doesNotMatch(surfaceShader.fragmentShader, /uKeyLightDirection/);
    assert.match(depthShader.fragmentShader, /dissolveSurfaceMask/);
    assert.match(depthShader.fragmentShader, /discard/);
    assert.match(distanceShader.fragmentShader, /dissolveSurfaceMask/);
    assert.match(distanceShader.fragmentShader, /discard/);

    target.advance(0.4);
    assert.ok(Math.abs(target.progress - 0.2) < EPSILON);
    assert.equal(target.renderDiagnostics.dissolveAmount, target.progress);
    assert.equal(
      surfaceShader.uniforms.uDissolveAmount?.value,
      target.progress,
    );
    assert.equal(
      depthShader.uniforms.uDissolveAmount?.value,
      target.progress,
    );
    assert.equal(
      distanceShader.uniforms.uDissolveAmount?.value,
      target.progress,
    );
    assert.equal(mesh.visible, true);
    assert.equal(target.collisionEnabled, true);

    target.advance(0.98);
    assert.ok(Math.abs(target.progress - 0.69) < EPSILON);
    assert.equal(target.renderDiagnostics.dissolveAmount, target.progress);
    assert.equal(target.collisionEnabled, true);
    assert.equal(fixture.world.colliderCount, 1);

    target.advance(0.02);
    assert.ok(Math.abs(target.progress - 0.7) < EPSILON);
    assert.equal(target.renderDiagnostics.dissolveAmount, target.progress);
    assert.equal(target.collisionEnabled, false);
    assert.equal(fixture.world.colliderCount, 0);
  } finally {
    disposeFixture(fixture);
  }
});

test('interruption, resume, completion, and repeated reset clear render state', () => {
  const fixture = createTargetFixture('reset-cycle');

  try {
    fixture.target.advance(0.5);
    assert.equal(fixture.target.progress, 0.25);
    assert.equal(fixture.target.renderDiagnostics.dissolveAmount, 0.25);

    // Interruption means gameplay deliberately does not call advance. The
    // existing value and every render pass must retain the same partial state.
    assert.equal(fixture.target.progress, 0.25);
    assert.equal(fixture.target.renderDiagnostics.dissolveAmount, 0.25);

    fixture.target.advance(1.5);
    assert.equal(fixture.target.completed, true);
    assert.equal(fixture.target.progress, 1);
    assert.equal(fixture.target.renderDiagnostics.dissolveAmount, 1);
    assert.equal(fixture.mesh.visible, false);
    assert.equal(fixture.target.collisionEnabled, false);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      fixture.target.reset();
      assert.equal(fixture.target.progress, 0);
      assert.equal(fixture.target.renderDiagnostics.dissolveAmount, 0);
      assert.equal(fixture.mesh.visible, true);
      assert.equal(fixture.target.collisionEnabled, true);
      assert.equal(fixture.world.colliderCount, 1);

      fixture.target.advance(2);
      assert.equal(fixture.target.completed, true);
      assert.equal(fixture.target.renderDiagnostics.dissolveAmount, 1);
    }
  } finally {
    disposeFixture(fixture);
  }
});

test('multiple targets retain independent material state and deterministic seeds', () => {
  const first = createTargetFixture('independent-a', 0, 2);
  const second = createTargetFixture('independent-b', 8, 2);
  const firstRepeat = createTargetFixture('independent-a', 16, 2);

  try {
    first.target.advance(0.4);
    second.target.advance(1.2);

    assert.equal(first.target.renderDiagnostics.materialCount, 2);
    assert.equal(second.target.renderDiagnostics.materialCount, 2);
    assert.equal(first.target.renderDiagnostics.dissolveAmount, 0.2);
    assert.equal(second.target.renderDiagnostics.dissolveAmount, 0.6);
    assert.notDeepEqual(
      first.target.renderDiagnostics.noiseOffset,
      second.target.renderDiagnostics.noiseOffset,
    );
    assert.deepEqual(
      first.target.renderDiagnostics.noiseOffset,
      firstRepeat.target.renderDiagnostics.noiseOffset,
    );

    const firstMaterials = first.mesh.material as DissolveMaterial[];
    assert.equal(firstMaterials.length, 2);
    assert.equal(
      firstMaterials[0]?.dissolveAmountUniform,
      firstMaterials[1]?.dissolveAmountUniform,
    );

    first.target.reset();
    assert.equal(first.target.renderDiagnostics.dissolveAmount, 0);
    assert.equal(second.target.renderDiagnostics.dissolveAmount, 0.6);
  } finally {
    disposeFixture(first);
    disposeFixture(second);
    disposeFixture(firstRepeat);
  }
});

test('dispose releases owned shader passes and restores authored materials', () => {
  const authoredDepth = new THREE.MeshDepthMaterial();
  const authoredDistance = new THREE.MeshDistanceMaterial();

  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const authoredSurface = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, authoredSurface);
  mesh.name = 'dispose-contract-custom';
  mesh.userData.soluble = true;
  mesh.userData.surfaceTag = 'default';
  mesh.customDepthMaterial = authoredDepth;
  mesh.customDistanceMaterial = authoredDistance;
  const target = createAuthoredDissolveTarget(mesh, world, surfaces);
  assert.ok(target);

  const ownedSurface = mesh.material as THREE.Material;
  const ownedDepth = mesh.customDepthMaterial;
  const ownedDistance = mesh.customDistanceMaterial;
  let disposedCount = 0;
  for (const material of [ownedSurface, ownedDepth, ownedDistance]) {
    material?.addEventListener('dispose', () => {
      disposedCount += 1;
    });
  }

  target.dispose();
  target.dispose();
  assert.equal(disposedCount, 3);
  assert.equal(mesh.material, authoredSurface);
  assert.equal(mesh.customDepthMaterial, authoredDepth);
  assert.equal(mesh.customDistanceMaterial, authoredDistance);

  geometry.dispose();
  authoredSurface.dispose();
  authoredDepth.dispose();
  authoredDistance.dispose();
});
