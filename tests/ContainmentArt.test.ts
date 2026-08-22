import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { captureContainmentCollisionFingerprint } from '../src/levels/ContainmentCollisionFingerprint.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';

test('Containment procedural textures are compact, deterministic and correctly configured', () => {
  const first = new ContainmentArtResources();
  const second = new ContainmentArtResources();
  const firstTextures = textureList(first);
  const secondTextures = textureList(second);

  assert.equal(firstTextures.length, 9);
  assert.equal(first.diagnostics.estimatedTextureBytes, 655_360);
  firstTextures.forEach((texture, index) => {
    const counterpart = secondTextures[index];
    assert.deepEqual(
      [texture.image.width, texture.image.height],
      index === firstTextures.length - 1 ? [512, 256] : [64, 64],
    );
    assert.equal(
      Buffer.from(texture.image.data.buffer).equals(
        Buffer.from(counterpart.image.data.buffer),
      ),
      true,
    );
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(
      texture.colorSpace,
      index === firstTextures.length - 1
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace,
    );
    assert.equal(
      texture.wrapS,
      index === firstTextures.length - 1
        ? THREE.ClampToEdgeWrapping
        : THREE.RepeatWrapping,
    );
    assert.equal(texture.wrapT, texture.wrapS);
  });

  first.dispose();
  second.dispose();
});

test('Room 1 uses shared tagged materials without introducing fake surface semantics', () => {
  const scene = new ContainmentLevelScene(() => {});
  const { materials } = scene.artResources;
  const colliders = new Map(
    scene.collisionMeshes.map((mesh) => [mesh.name, mesh]),
  );

  assert.equal(colliders.get('room-1-floor')?.material, materials.clinicalFloor);
  assert.equal(
    colliders.get('room-1-rear-wall')?.material,
    materials.mechanicalBacking,
  );
  assert.equal(
    colliders.get('room-1-vent-sticky-entry-wall')?.material,
    materials.stickyMembrane,
  );
  assert.equal(
    colliders.get('duct-segment-a-sticky-vent-tile')?.material,
    materials.stickyVentMembrane,
  );

  const materialNames = Object.values(materials).map((material) =>
    material.name.toLowerCase(),
  );
  assert.equal(materialNames.some((name) => name.includes('bouncy')), false);
  assert.equal(materialNames.some((name) => name.includes('non-stick')), false);

  for (const collider of scene.collisionMeshes.filter((mesh) =>
    mesh.name.startsWith('room-2-platform'),
  )) {
    assert.equal(collider.userData.surfaceTag, 'default');
    assert.equal(collider.material.name.includes('bouncy'), false);
  }
  scene.dispose();
});

test('Room 1 hero states are deterministic and independent from gameplay collision', () => {
  const scene = new ContainmentLevelScene(() => {});
  const art = scene.teaching.roomOneArt;
  const before = captureContainmentCollisionFingerprint(scene.collisionMeshes);

  assert.deepEqual(art.eggStateNames, [
    'intact',
    'crack-stage-1',
    'crack-stage-2',
    'crack-stage-3',
    'half-broken',
  ]);
  assert.equal(Object.values(art.eggStates).filter((state) => state.visible).length, 1);
  assert.equal(art.eggStates.intact.visible, true);
  assert.equal(art.intactFrameAndPanes.visible, true);
  assert.equal(art.shatteredFrameAndDebris.visible, false);

  art.setEggState('crack-stage-3');
  art.setContainmentBoxState('shattered');
  art.containmentBoxRoot.position.addScalar(3);
  art.containmentBoxRoot.rotation.set(0.2, -0.4, 0.3);
  assert.deepEqual(
    captureContainmentCollisionFingerprint(scene.collisionMeshes),
    before,
  );

  art.reset();
  assert.equal(art.eggStates.intact.visible, true);
  assert.equal(Object.values(art.eggStates).filter((state) => state.visible).length, 1);
  assert.equal(art.intactFrameAndPanes.visible, true);
  assert.equal(art.shatteredFrameAndDebris.visible, false);
  assert.ok(art.containmentBoxRoot.position.equals(new THREE.Vector3(0, 1.1, -0.5)));
  assert.ok(art.containmentBoxRoot.rotation.equals(new THREE.Euler(0, 0, 0)));

  const colliderSet = new Set(scene.collisionMeshes);
  art.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      assert.equal(object.userData.visualOnly, true, object.name);
      assert.equal(colliderSet.has(object), false, object.name);
    }
  });
  scene.dispose();
});

test('Containment art ownership disposes once and recreates without count growth', () => {
  const resources = new ContainmentArtResources();
  const representative = [
    resources.textures.ceramicNormal,
    resources.materials.mainCeramic,
    resources.geometries.unitBox,
    resources.borrowChamferedBoxGeometry([2, 1, 0.1], 0.03),
  ];
  let disposeEvents = 0;
  for (const resource of representative) {
    resource.addEventListener('dispose', () => {
      disposeEvents += 1;
    });
  }
  const initial = resources.diagnostics;
  resources.dispose();
  resources.dispose();
  assert.equal(disposeEvents, representative.length);
  assert.equal(resources.diagnostics.disposed, true);

  const recreated = new ContainmentArtResources();
  recreated.borrowChamferedBoxGeometry([2, 1, 0.1], 0.03);
  assert.deepEqual(
    {
      textures: recreated.diagnostics.textureCount,
      materials: recreated.diagnostics.materialCount,
      geometries: recreated.diagnostics.geometryCount,
      bytes: recreated.diagnostics.estimatedTextureBytes,
    },
    {
      textures: initial.textureCount,
      materials: initial.materialCount,
      geometries: initial.geometryCount,
      bytes: initial.estimatedTextureBytes,
    },
  );
  recreated.dispose();
});

test('Containment scene resets and recreates without duplicating Room 1 art resources', () => {
  const first = new ContainmentLevelScene(() => {});
  const initialDiagnostics = first.artResources.diagnostics;
  let initialObjects = 0;
  first.teaching.roomOneArt.root.traverse(() => {
    initialObjects += 1;
  });

  first.resetProbe();
  first.resetProbe();
  let objectsAfterResets = 0;
  first.teaching.roomOneArt.root.traverse(() => {
    objectsAfterResets += 1;
  });
  assert.equal(objectsAfterResets, initialObjects);
  assert.deepEqual(first.artResources.diagnostics, initialDiagnostics);
  first.dispose();

  const second = new ContainmentLevelScene(() => {});
  let recreatedObjects = 0;
  second.teaching.roomOneArt.root.traverse(() => {
    recreatedObjects += 1;
  });
  assert.equal(recreatedObjects, initialObjects);
  assert.deepEqual(second.artResources.diagnostics, initialDiagnostics);
  second.dispose();
});

test('production scene contains no legacy collider outline objects', () => {
  const scene = new ContainmentLevelScene(() => {});
  const legacyOutlines: THREE.Object3D[] = [];
  scene.root.traverse((object) => {
    if (object.name.endsWith('-outline')) legacyOutlines.push(object);
  });
  assert.deepEqual(legacyOutlines, []);
  scene.dispose();
});

function textureList(resources: ContainmentArtResources): readonly THREE.DataTexture[] {
  return [
    resources.textures.ceramicNormal,
    resources.textures.ceramicRoughness,
    resources.textures.graphiteNormal,
    resources.textures.graphiteRoughness,
    resources.textures.stickyNormal,
    resources.textures.stickyRoughness,
    resources.textures.stickyVentNormal,
    resources.textures.stickyVentRoughness,
    resources.textures.signageAtlas,
  ];
}
