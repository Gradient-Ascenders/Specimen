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

  assert.equal(firstTextures.length, 10);
  assert.equal(first.diagnostics.estimatedTextureBytes, 2_768_896);
  firstTextures.forEach((texture, index) => {
    const counterpart = secondTextures[index];
    assert.deepEqual(
      [texture.image.width, texture.image.height],
      texture === first.textures.signageAtlas ? [512, 1280] : [64, 64],
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
      texture === first.textures.signageAtlas ||
        texture === first.textures.acidFoundationAlbedo
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace,
    );
    assert.equal(
      texture.wrapS,
      texture === first.textures.signageAtlas
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

test('Room 2 art is visual-only and preserves authored gameplay semantics', () => {
  const scene = new ContainmentLevelScene(() => {});
  const art = scene.teaching.roomTwoArt.root;
  const colliderSet = new Set(scene.collisionMeshes);
  const roomTwoColliders = scene.collisionMeshes.filter((mesh) =>
    mesh.name.startsWith('room-2-'),
  );

  assert.equal(art.name, 'room-2-production-art');
  assert.equal(roomTwoColliders.length, 20);
  for (const collider of roomTwoColliders) {
    assert.equal(collider.material.visible, false, collider.name);
    assert.equal(
      collider.material.name,
      'containment-room-2-production-collision-only',
      collider.name,
    );
  }
  assert.equal(
    roomTwoColliders.find((mesh) => mesh.name === 'room-2-sticky-catch-wall')
      ?.userData.surfaceTag,
    'sticky',
  );
  for (const collider of roomTwoColliders.filter((mesh) =>
    mesh.name.includes('platform') || mesh.name.includes('step'),
  )) {
    assert.equal(collider.userData.surfaceTag, 'default', collider.name);
  }

  const membrane = art.getObjectByName(
    'room-2-sticky-catch-wall-inset-organic-membrane',
  );
  assert.ok(membrane instanceof THREE.Mesh);
  assert.equal(membrane.material, scene.artResources.materials.stickyMembrane);
  assert.ok(art.getObjectByName('room-2-observation-reinforced-glass'));
  assert.ok(art.getObjectByName('room-2-upper-structural-cross-members'));
  assert.ok(art.getObjectByName('room-2-platform-a-height-lesson-durable-composite-tread'));
  assert.equal(art.getObjectByName('room-2-platform-a-bouncy-membrane'), undefined);

  art.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      assert.equal(object.userData.visualOnly, true, object.name);
      assert.equal(colliderSet.has(object), false, object.name);
    }
  });
  scene.dispose();
});

test('Room 3 art contains the acid and instruments the frozen route without owning gameplay', () => {
  const scene = new ContainmentLevelScene(() => {});
  const art = scene.roomThree.art;
  const colliderSet = new Set(scene.collisionMeshes);
  const roomThreeColliders = scene.collisionMeshes.filter((mesh) =>
    mesh.name.startsWith('room-3-'),
  );
  const laserState = scene.roomThree.lasers.hazards.map((hazard) => ({
    id: hazard.id,
    start: [hazard.start.x, hazard.start.y, hazard.start.z],
    end: [hazard.end.x, hazard.end.y, hazard.end.z],
    enabled: hazard.enabled,
    sequenceState: hazard.sequenceState,
  }));

  assert.equal(art.root.name, 'room-3-production-art');
  assert.equal(roomThreeColliders.length, 26);
  for (const collider of roomThreeColliders) {
    assert.equal(collider.material.visible, false, collider.name);
  }
  assert.equal(
    art.acidSurface.userData.authoritativeCollider,
    'room-3-acid-floor',
  );
  assert.equal(art.acidSurface.userData.materialRole, 'replaceable-acid-surface');
  assert.equal(art.acidSurface.material, art.acidSurfaceMaterial);
  assert.ok(art.root.getObjectByName('room-3-basin-substantial-perimeter-curbs'));
  assert.ok(art.root.getObjectByName('room-3-entry-platform-actuator-column'));
  assert.ok(art.root.getObjectByName('room-3-first-static-laser-start-instrument-housing'));
  assert.equal(art.root.getObjectByName('room-3-upper-sweep-gantry-rail'), undefined);
  assert.equal(art.root.getObjectByName('room-3-platform-c-overhead-hanger-1'), undefined);
  assert.equal(art.root.getObjectByName('room-3-first-static-laser-instrument-pedestal-1'), undefined);
  assert.ok(art.root.getObjectByName('room-3-platform-c-underside-actuator-socket'));
  assert.ok(art.root.getObjectByName('room-3-to-4-duct-floor-clean-liner'));
  assert.ok(art.root.getObjectByName('room-3-to-4-duct-service-side-liners'));
  assert.ok(art.root.getObjectByName('room-3-to-4-duct-side-transition-seams'));
  assert.ok(art.root.getObjectByName('room-3-to-4-shaft-end-service-portal'));
  const cleanDuctSides = art.root.getObjectByName(
    'room-3-to-4-duct-clean-side-liners',
  );
  const serviceDuctSides = art.root.getObjectByName(
    'room-3-to-4-duct-service-side-liners',
  );
  assert.ok(cleanDuctSides instanceof THREE.InstancedMesh);
  assert.ok(serviceDuctSides instanceof THREE.InstancedMesh);
  const cleanDuctSideBounds = new THREE.Box3().setFromObject(cleanDuctSides);
  const serviceDuctSideBounds = new THREE.Box3().setFromObject(serviceDuctSides);
  assert.ok(
    cleanDuctSideBounds.max.z < serviceDuctSideBounds.min.z,
    'clean and service duct skins must not have coplanar overlap',
  );
  const roomThreeSign = art.root.getObjectByName('room-3-entry-sector-sign');
  assert.ok(roomThreeSign instanceof THREE.Mesh);
  assert.equal(roomThreeSign.position.z, 49.24);
  const entryPanel = art.root.getObjectByName('room-3-entry-panel-east');
  assert.ok(entryPanel instanceof THREE.Mesh);
  assert.ok(
    roomThreeSign.position.z > entryPanel.position.z + 0.06,
    'C-03 signage must remain physically separated from the entry panel face',
  );
  const mainMembrane = art.root.getObjectByName(
    'room-3-main-adhesion-replaceable-membrane',
  );
  assert.ok(mainMembrane instanceof THREE.Mesh);
  assert.equal(mainMembrane.material, scene.artResources.materials.stickyMembrane);

  scene.root.updateMatrixWorld(true);
  for (const [artName, colliderName] of [
    ['room-3-panel-west-south-lower', 'room-3-west-wall'],
    ['room-3-panel-east-entry-quiet', 'room-3-east-wall'],
    ['room-3-entry-panel-east', 'room-3-entry-wall-east'],
    ['room-3-main-adhesion-replaceable-membrane', 'room-3-sticky-wall-main'],
    ['room-3-final-adhesion-replaceable-membrane', 'room-3-final-sticky-strip'],
    ['room-3-entry-graphite-jambs', 'room-3-entry-wall-east'],
    ['room-3-ceiling-major-service-trusses', 'room-3-ceiling'],
    ['room-3-exit-duct-graphite-collar-left', 'room-3-rear-wall-west'],
    ['room-3-to-4-duct-floor-clean-liner', 'room-3-to-4-duct-floor'],
    ['room-3-to-4-duct-clean-side-liners', 'room-3-to-4-duct-west-wall'],
    ['room-3-to-4-duct-ceiling-backing', 'room-3-to-4-duct-roof'],
    ['room-3-to-4-shaft-end-service-portal-left', 'room-3-to-4-duct-west-wall'],
  ] as const) {
    const artObject = art.root.getObjectByName(artName);
    const collider = roomThreeColliders.find((mesh) => mesh.name === colliderName);
    assert.ok(artObject, artName);
    assert.ok(collider, colliderName);
    assert.ok(
      new THREE.Box3().setFromObject(artObject).intersectsBox(
        new THREE.Box3().setFromObject(collider),
      ),
      `${artName} must occupy its authoritative ${colliderName} volume`,
    );
  }

  art.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      assert.equal(object.userData.visualOnly, true, object.name);
      assert.equal(colliderSet.has(object), false, object.name);
    }
  });
  assert.deepEqual(
    scene.roomThree.lasers.hazards.map((hazard) => ({
      id: hazard.id,
      start: [hazard.start.x, hazard.start.y, hazard.start.z],
      end: [hazard.end.x, hazard.end.y, hazard.end.z],
      enabled: hazard.enabled,
      sequenceState: hazard.sequenceState,
    })),
    laserState,
  );
  scene.dispose();
});

test('Room 4 art houses the frozen elevator and laser sequence without owning gameplay', () => {
  const scene = new ContainmentLevelScene(() => {});
  const room = scene.roomFour;
  const art = room.art.root;
  const colliderSet = new Set(scene.collisionMeshes);
  const roomFourColliders = scene.collisionMeshes.filter((mesh) =>
    mesh.name.startsWith('room-4-'),
  );
  const collisionBefore = captureContainmentCollisionFingerprint(
    scene.collisionMeshes,
  );
  const elevatorBefore = {
    start: room.elevator.routeStart.toArray(),
    end: room.elevator.routeEnd.toArray(),
    duration: room.elevator.travelDurationSeconds,
    startDelay: room.elevator.startDelaySeconds,
    arrivalDelay: room.elevator.arrivalDelaySeconds,
    checkpointGroup: room.elevator.checkpointGroupId,
  };
  const lasersBefore = room.lasers.hazards.map((hazard) => ({
    id: hazard.id,
    start: hazard.start.toArray(),
    end: hazard.end.toArray(),
    enabled: hazard.enabled,
    sequenceState: hazard.sequenceState,
  }));

  assert.equal(art.name, 'room-4-production-art');
  assert.equal(roomFourColliders.length, 14);
  for (const collider of roomFourColliders) {
    assert.equal(collider.material.visible, false, collider.name);
  }
  assert.ok(art.getObjectByName('room-4-major-north-south-structural-ribs'));
  assert.ok(art.getObjectByName('room-4-elevator-continuous-guide-rails'));
  assert.ok(art.getObjectByName('room-4-main-vertical-power-trunk'));
  assert.ok(art.getObjectByName('room-4-south-recessed-maintenance-bay'));
  assert.ok(art.getObjectByName('room-4-laser-origin-precision-instrument-housings'));
  assert.ok(art.getObjectByName('room-4-lower-elevator-machinery-base'));
  assert.ok(art.getObjectByName('room-4-upper-receiving-portal-structural-frame'));
  assert.ok(art.getObjectByName('room-4-entry-core-sign'));
  assert.ok(
    art.getObjectByName('room-4-entry-core-sign-recessed-backing'),
  );
  assert.ok(
    art.getObjectByName('room-4-transfer-array-s02-sign-service-frame'),
  );
  for (const [name, position, rotationY] of [
    ['room-4-entry-core-sign', [9, 34.65, 79.965], 0],
    ['room-4-service-level-s01-sign', [5.15, 42.25, 91.075], Math.PI],
    ['room-4-transfer-array-s02-sign', [12.85, 58.65, 91.075], Math.PI],
    ['room-4-laser-core-sign', [5.15, 65, 79.965], 0],
    ['room-4-room-five-destination-sign', [9, 78.05, 90.945], Math.PI],
  ] as const) {
    const sign = art.getObjectByName(name);
    assert.ok(sign instanceof THREE.Mesh, name);
    assert.deepEqual(sign.position.toArray(), position, name);
    assert.equal(sign.rotation.y, rotationY, name);
    const backing = art.getObjectByName(`${name}-recessed-backing`);
    const frame = art.getObjectByName(`${name}-service-frame`);
    assert.ok(backing instanceof THREE.Mesh, `${name} backing`);
    assert.ok(frame instanceof THREE.Group, `${name} frame`);
    assert.ok(
      Math.abs(sign.position.z - backing.position.z) >= 0.08,
      `${name} must remain separated from its backing to avoid z-fighting`,
    );
  }
  const guideBracket = room.root.getObjectByName(
    'room-4-cargo-elevator-west-guide-underdeck-bracket',
  );
  const guideCoupling = room.root.getObjectByName(
    'room-4-cargo-elevator-west-guide-coupling-rod',
  );
  const guideHousing = room.root.getObjectByName(
    'room-4-cargo-elevator-guide-roller-housing',
  );
  assert.ok(guideBracket instanceof THREE.Mesh);
  assert.ok(guideCoupling instanceof THREE.Mesh);
  assert.ok(guideHousing instanceof THREE.Mesh);
  room.root.updateMatrixWorld(true);
  const platformBounds = new THREE.Box3().setFromObject(
    room.elevator.platform.collisionMesh,
  );
  const guideBracketBounds = new THREE.Box3().setFromObject(guideBracket);
  const guideCouplingBounds = new THREE.Box3().setFromObject(guideCoupling);
  const guideHousingBounds = new THREE.Box3().setFromObject(guideHousing);
  assert.ok(
    guideBracketBounds.min.x >= platformBounds.min.x &&
      guideBracketBounds.max.x <= platformBounds.max.x,
    `substantial guide bracket ${guideBracketBounds.min.x.toFixed(3)}..${guideBracketBounds.max.x.toFixed(3)} must stay inside moving collider ${platformBounds.min.x.toFixed(3)}..${platformBounds.max.x.toFixed(3)}`,
  );
  assert.ok(
    guideCouplingBounds.max.y <= platformBounds.min.y - 0.45,
    'non-colliding guide coupling must read as recessed underside machinery',
  );
  assert.ok(
    guideHousingBounds.max.y <= platformBounds.min.y - 0.25,
    'guide roller housing must remain below the reachable deck silhouette',
  );
  assert.equal(
    room.root.getObjectByName(
      'room-4-single-sweep-presentation-emitter-end',
    )?.visible,
    false,
  );

  art.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      assert.equal(object.userData.visualOnly, true, object.name);
      assert.equal(colliderSet.has(object), false, object.name);
    }
  });
  assert.deepEqual(
    captureContainmentCollisionFingerprint(scene.collisionMeshes),
    collisionBefore,
  );
  assert.deepEqual(
    {
      start: room.elevator.routeStart.toArray(),
      end: room.elevator.routeEnd.toArray(),
      duration: room.elevator.travelDurationSeconds,
      startDelay: room.elevator.startDelaySeconds,
      arrivalDelay: room.elevator.arrivalDelaySeconds,
      checkpointGroup: room.elevator.checkpointGroupId,
    },
    elevatorBefore,
  );
  assert.deepEqual(
    room.lasers.hazards.map((hazard) => ({
      id: hazard.id,
      start: hazard.start.toArray(),
      end: hazard.end.toArray(),
      enabled: hazard.enabled,
      sequenceState: hazard.sequenceState,
    })),
    lasersBefore,
  );
  scene.dispose();
});

test('Room 5 art builds a reset-safe hero chamber around frozen gameplay', () => {
  const scene = new ContainmentLevelScene(() => {});
  const room = scene.roomFive;
  const art = room.art;
  const collisionBefore = captureContainmentCollisionFingerprint(
    scene.collisionMeshes,
  );
  const colliderSet = new Set(scene.collisionMeshes);
  const roomFiveColliders = scene.collisionMeshes.filter((mesh) =>
    mesh.name.startsWith('room-5-'),
  );

  assert.equal(roomFiveColliders.length, 35);
  assert.equal(art.root.name, 'room-5-production-art');
  assert.equal(art.containmentAssembly.name, 'room-5-containment-assembly');
  assert.equal(
    art.containmentPanelRoot.name,
    'room-5-containment-panel-root',
  );
  assert.ok(art.root.getObjectByName('room-5-containment-base'));
  assert.ok(art.root.getObjectByName('room-5-lower-containment-ring'));
  assert.ok(art.root.getObjectByName('room-5-upper-containment-ring'));
  assert.ok(art.root.getObjectByName('room-5-structural-clamps'));
  assert.ok(art.root.getObjectByName('room-5-upper-service-manifold'));
  assert.ok(art.root.getObjectByName('room-5-major-overhead-compound-feed'));
  assert.ok(art.root.getObjectByName('room-5-observation-control-room'));
  assert.ok(art.root.getObjectByName('room-5-observation-angled-control-console'));
  assert.ok(art.root.getObjectByName('room-5-observation-connection'));
  assert.ok(art.root.getObjectByName('room-5-soluble-composite-door-structural-frame'));

  const specimenSign = art.root.getObjectByName(
    'room-5-contained-specimen-identification',
  );
  const specimenSignBacking = art.root.getObjectByName(
    'room-5-contained-specimen-identification-recessed-backing',
  );
  const specimenSignAssembly = art.root.getObjectByName(
    'room-5-contained-specimen-identification-mounted-assembly',
  );
  const frontClamp = art.root.getObjectByName(
    'room-5-containment-front-restraint-clamp',
  );
  assert.ok(specimenSign);
  assert.ok(specimenSignBacking);
  assert.ok(specimenSignAssembly);
  assert.ok(frontClamp);
  assert.ok(Math.abs(specimenSign.rotation.y - Math.PI) < 1e-8);
  scene.root.updateMatrixWorld(true);
  const specimenSignBounds = new THREE.Box3().setFromObject(specimenSign);
  const specimenSignBackingBounds = new THREE.Box3().setFromObject(
    specimenSignBacking,
  );
  const specimenSignAssemblyBounds = new THREE.Box3().setFromObject(
    specimenSignAssembly,
  );
  const frontClampBounds = new THREE.Box3().setFromObject(frontClamp);
  assert.ok(
    specimenSignBounds.max.z < specimenSignBackingBounds.min.z - 0.15,
    'the front-facing specimen sign must sit clearly ahead of its opaque backing',
  );
  assert.ok(
    specimenSignAssemblyBounds.max.x < frontClampBounds.min.x - 0.04,
    'the specimen sign assembly must remain clear of the front restraint clamp',
  );

  assert.deepEqual(
    Object.values(art.panelPivots).map((pivot) => pivot.name),
    [
      'room-5-containment-panel-front-pivot',
      'room-5-containment-panel-rear-pivot',
      'room-5-containment-panel-left-pivot',
      'room-5-containment-panel-right-pivot',
    ],
  );
  for (const [panel, pivot] of Object.entries(art.panelPivots)) {
    assert.equal(pivot.userData.panel, panel);
    assert.equal(pivot.userData.initialState, 'closed');
    assert.equal(pivot.userData.cutsceneReady, true);
    assert.ok(pivot.rotation.equals(new THREE.Euler(0, 0, 0)));
    assert.ok(
      pivot.getObjectByName(`room-5-containment-panel-${panel}-reinforced-pane`),
    );
  }

  art.setPanelPreview('front', 0.5);
  art.setPanelPreview('left', -0.35);
  assert.equal(art.panelPivots.front.rotation.y, 0.5);
  assert.equal(art.panelPivots.left.rotation.y, -0.35);
  assert.equal(art.panelPivots.rear.rotation.y, 0);
  assert.equal(art.panelPivots.right.rotation.y, 0);
  assert.deepEqual(
    captureContainmentCollisionFingerprint(scene.collisionMeshes),
    collisionBefore,
  );
  room.reset();
  for (const pivot of Object.values(art.panelPivots)) {
    assert.ok(pivot.rotation.equals(new THREE.Euler(0, 0, 0)));
  }

  const glassCollider = roomFiveColliders.find(
    (mesh) => mesh.name === 'room-5-containment-glass',
  );
  const roofPane = art.root.getObjectByName(
    'room-5-containment-traversable-roof-pane',
  );
  assert.ok(glassCollider);
  assert.ok(roofPane);
  scene.root.updateMatrixWorld(true);
  const glassBounds = new THREE.Box3().setFromObject(glassCollider);
  const roofBounds = new THREE.Box3().setFromObject(roofPane);
  assert.ok(Math.abs(roofBounds.max.y - glassBounds.max.y) < 0.01);
  assert.ok(roofBounds.min.x >= glassBounds.min.x);
  assert.ok(roofBounds.max.x <= glassBounds.max.x);
  assert.ok(roofBounds.min.z >= glassBounds.min.z);
  assert.ok(roofBounds.max.z <= glassBounds.max.z);

  for (const platform of [room.movingPlatformOne, room.movingPlatformTwo]) {
    assert.equal(platform.collisionMesh.material.visible, false);
    const dressing = platform.root.children.find((child) =>
      child.name.endsWith('-production-dressing'),
    );
    assert.ok(dressing);
    const colliderBounds = new THREE.Box3().setFromObject(
      platform.collisionMesh,
    );
    const tread = dressing.getObjectByName(
      `${dressing.name}-durable-clean-tread`,
    );
    assert.ok(tread);
    const treadBounds = new THREE.Box3().setFromObject(tread);
    assert.ok(Math.abs(treadBounds.max.y - colliderBounds.max.y) < 0.01);
    dressing.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        assert.equal(object.userData.visualOnly, true, object.name);
        assert.equal(colliderSet.has(object), false, object.name);
      }
    });
  }

  assert.equal(glassCollider.material.visible, false);
  assert.equal(room.goopWoodenDoor.material.visible, true);
  assert.notEqual(
    room.goopWoodenDoor.material,
    scene.artResources.materials.solubleComposite,
  );
  assert.equal(
    (room.goopWoodenDoor.material as THREE.MeshStandardMaterial).normalMap,
    scene.artResources.materials.solubleComposite.normalMap,
  );
  assert.equal(room.goopWoodenDoor.userData.soluble, true);
  assert.equal(room.goopWoodenDoor.userData.textureRole, 'wooden-door');

  art.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      assert.equal(object.userData.visualOnly, true, object.name);
      assert.equal(colliderSet.has(object), false, object.name);
    }
  });
  assert.deepEqual(
    captureContainmentCollisionFingerprint(scene.collisionMeshes),
    collisionBefore,
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
  for (const label of [
    'bay',
    'specimen',
    'locked',
    'vent',
    'chamber',
    'ascent',
    'roomThree',
    'chemical',
    'laserArray',
    'adhesionTest',
    'roomFour',
    'serviceOne',
    'transferTwo',
    'laserCore',
    'roomFiveExit',
    'roomFive',
    'primaryContainment',
    'pressureArray',
    'observationControl',
    'compositeAccess',
  ] as const) {
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
      assert.ok(
        Math.abs(
          uvs.getY(index) -
            (positions.getY(index) > 0 ? region.vMin : region.vMax),
        ) < 1e-7,
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

test('Containment scene resets and recreates without duplicating Room 1 or Room 2 art resources', () => {
  const first = new ContainmentLevelScene(() => {});
  const initialDiagnostics = first.artResources.diagnostics;
  let initialObjects = 0;
  first.teaching.root.traverse(() => {
    initialObjects += 1;
  });

  first.resetProbe();
  first.resetProbe();
  let objectsAfterResets = 0;
  first.teaching.root.traverse(() => {
    objectsAfterResets += 1;
  });
  assert.equal(objectsAfterResets, initialObjects);
  assert.deepEqual(first.artResources.diagnostics, initialDiagnostics);
  first.dispose();

  const second = new ContainmentLevelScene(() => {});
  let recreatedObjects = 0;
  second.teaching.root.traverse(() => {
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
    resources.textures.acidFoundationAlbedo,
    resources.textures.signageAtlas,
  ];
}
