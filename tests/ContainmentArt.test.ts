import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { captureContainmentCollisionFingerprint } from '../src/levels/ContainmentCollisionFingerprint.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { createSignagePanel } from '../src/render/environment/containment/ContainmentModularComponents.ts';
import { DEFAULT_SLIME_BASE_COLOUR } from '../src/render/slime/SlimeMaterial.ts';

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
  const stickyWallCollider = colliders.get('room-1-vent-sticky-entry-wall');
  assert.equal(stickyWallCollider?.material.visible, false);
  assert.equal(
    stickyWallCollider?.material.name,
    'containment-room-1-sticky-wall-collision-only',
  );
  assert.equal(
    stickyWallCollider?.userData.surfaceTag,
    'sticky',
  );
  assert.equal(stickyWallCollider?.visible, true);
  assert.equal(
    colliders.get('duct-segment-a-sticky-vent-tile')?.material,
    materials.serviceMetal,
  );
  assert.equal(
    colliders.get('duct-segment-a-sticky-vent-tile')?.userData.surfaceTag,
    'sticky',
  );
  assert.equal(
    scene.teaching.roomOneArt.root.getObjectByName(
      'duct-segment-a-sticky-vent-inset-organic-membrane',
    ),
    undefined,
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

test('Room 1 sticky wall uses Bob-related restrained membrane art', () => {
  const scene = new ContainmentLevelScene(() => {});
  const art = scene.teaching.roomOneArt.root;
  const membrane = art.getObjectByName(
    'room-1-sticky-wall-inset-organic-membrane',
  );
  const bobColour = new THREE.Color(DEFAULT_SLIME_BASE_COLOUR);

  assert.ok(membrane instanceof THREE.Mesh);
  assert.equal(membrane.material, scene.artResources.materials.stickyMembrane);
  const membraneColour = scene.artResources.materials.stickyMembrane.color;
  assert.equal(membraneColour.getHex(), bobColour.getHex());
  assert.equal(
    art.getObjectByName('room-1-sticky-wall-organic-relief'),
    undefined,
  );
  assert.equal(
    art.children.some((child) =>
      child.name.startsWith('room-1-sticky-organic-ridge-'),
    ),
    false,
  );

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

test('Room 1 signs are upright and specimen controls do not intersect stacked housings', () => {
  const scene = new ContainmentLevelScene(() => {});
  const resources = scene.artResources;
  for (const label of ['bay', 'specimen', 'locked', 'vent'] as const) {
    const sign = createSignagePanel(resources, {
      name: `sign-orientation-probe-${label}`,
      label,
      size: [1, 1],
      position: [0, 0, 0],
    });
    const positions = sign.geometry.getAttribute('position');
    const uvs = sign.geometry.getAttribute('uv');
    const region = resources.textures.signRegions[label];
    for (let index = 0; index < positions.count; index += 1) {
      assert.equal(
        uvs.getY(index),
        positions.getY(index) > 0 ? region.vMin : region.vMax,
        `${label} atlas row must be upright`,
      );
    }
    sign.geometry.dispose();
  }

  const art = scene.teaching.roomOneArt.root;
  const lowerBase = art.getObjectByName('room-1-containment-lower-instrumentation-base');
  const pedestalGasket = art.getObjectByName('room-1-pedestal-upper-gasket-frame');
  const pedestalCollider = scene.collisionMeshes.find(
    (collider) => collider.name === 'room-1-containment-pedestal',
  );
  const pressureGauge = art.getObjectByName('room-1-containment-pressure-gauge');
  assert.ok(lowerBase);
  assert.ok(pedestalGasket instanceof THREE.InstancedMesh);
  assert.ok(pedestalCollider);
  assert.ok(pressureGauge);
  assert.equal(art.getObjectByName('room-1-pedestal-top-gasket'), undefined);
  assert.equal(
    new THREE.Box3().setFromObject(pedestalGasket).intersectsBox(
      new THREE.Box3().setFromObject(pedestalCollider),
    ),
    false,
  );
  const lowerBaseBounds = new THREE.Box3().setFromObject(lowerBase);
  const gasketInstanceMatrix = new THREE.Matrix4();
  const gasketInstanceBounds = new THREE.Box3();
  const sharedUnitBounds = new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(0.5, 0.5, 0.5),
  );
  pedestalGasket.updateWorldMatrix(true, false);
  for (let index = 0; index < pedestalGasket.count; index += 1) {
    pedestalGasket.getMatrixAt(index, gasketInstanceMatrix);
    gasketInstanceMatrix.premultiply(pedestalGasket.matrixWorld);
    gasketInstanceBounds.copy(sharedUnitBounds).applyMatrix4(gasketInstanceMatrix);
    assert.equal(gasketInstanceBounds.intersectsBox(lowerBaseBounds), false);
  }
  assert.equal(
    new THREE.Box3().setFromObject(pressureGauge).intersectsBox(
      new THREE.Box3().setFromObject(lowerBase),
    ),
    false,
  );
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
