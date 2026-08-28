import * as THREE from 'three';

import {
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { SlimeId } from './SlimeRoster.ts';

export interface SlimePairPresentationPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SlimeLocatorDiagnostics {
  readonly bobVisible: boolean;
  readonly goopVisible: boolean;
  readonly bobOccluded: boolean;
  readonly goopOccluded: boolean;
}

type MutableSlimeLocatorDiagnostics = {
  -readonly [Key in keyof SlimeLocatorDiagnostics]: SlimeLocatorDiagnostics[Key];
};

interface SlimeLocator {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
}

const LOCATOR_COLLISION_RADIUS_METRES = 0.04;
const LOCATOR_MIN_SIZE_METRES = 0.45;
const LOCATOR_MAX_SIZE_METRES = 1.2;
const LOCATOR_HEIGHT_MULTIPLIER = 1.7;
const RING_LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Development-readable Goop proxy and active-control indication for #28. */
export class SlimePairPresentation {
  readonly root = new THREE.Group();

  private readonly goopMesh: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly activeRing: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly bobLocator: SlimeLocator;
  private readonly goopLocator: SlimeLocator;
  private readonly locatorHit = new CollisionHit();
  private readonly locatorDisplacement = new THREE.Vector3();
  private readonly locatorTarget = new THREE.Vector3();
  private readonly activeGameplayUp = new THREE.Vector3();
  private readonly locatorDiagnosticsValue: MutableSlimeLocatorDiagnostics = {
    bobVisible: false,
    goopVisible: false,
    bobOccluded: false,
    goopOccluded: false,
  };
  private readonly locatorHeightMetres: number;

  constructor(radiusMetres: number) {
    this.root.name = 'persistent-two-body-presentation';
    this.locatorHeightMetres = radiusMetres * LOCATOR_HEIGHT_MULTIPLIER;

    this.goopMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radiusMetres, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0x91cf4b,
        emissive: 0x18380a,
        emissiveIntensity: 0.28,
        roughness: 0.42,
      }),
    );
    this.goopMesh.name = 'goop-development-body';
    this.root.add(this.goopMesh);

    this.activeRing = new THREE.Mesh(
      new THREE.TorusGeometry(radiusMetres * 1.35, 0.045, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe889,
        toneMapped: false,
      }),
    );
    this.activeRing.name = 'active-slime-control-indicator';
    this.root.add(this.activeRing);

    this.bobLocator = this.createLocator('bob', 'B', 'diamond', 0x9be7ff);
    this.goopLocator = this.createLocator('goop', 'G', 'circle', 0xc9ff8a);
  }

  get locatorDiagnostics(): SlimeLocatorDiagnostics {
    return this.locatorDiagnosticsValue;
  }

  update(
    bobPosition: SlimePairPresentationPosition,
    goopPosition: SlimePairPresentationPosition,
    activeSlimeId: SlimeId,
    camera: THREE.Camera,
    collisionWorld: CollisionWorld,
    firstPersonAimActive = false,
    bobGameplayUp: SlimePairPresentationPosition = WORLD_UP,
    goopGameplayUp: SlimePairPresentationPosition = WORLD_UP,
  ): void {
    this.goopMesh.position.set(
      goopPosition.x,
      goopPosition.y,
      goopPosition.z,
    );

    const activePosition =
      activeSlimeId === 'goop' ? goopPosition : bobPosition;
    const activeUp = activeSlimeId === 'goop' ? goopGameplayUp : bobGameplayUp;
    this.activeGameplayUp.set(activeUp.x, activeUp.y, activeUp.z);
    if (this.activeGameplayUp.lengthSq() <= 1e-10) {
      this.activeGameplayUp.copy(WORLD_UP);
    } else {
      this.activeGameplayUp.normalize();
    }
    this.activeRing.position
      .set(activePosition.x, activePosition.y, activePosition.z)
      .addScaledVector(this.activeGameplayUp, -0.43);
    this.activeRing.quaternion.setFromUnitVectors(
      RING_LOCAL_NORMAL,
      this.activeGameplayUp,
    );
    this.goopMesh.visible = !(
      firstPersonAimActive && activeSlimeId === 'goop'
    );
    this.activeRing.visible = !firstPersonAimActive;

    this.updateLocator(
      this.bobLocator,
      bobPosition,
      activeSlimeId !== 'bob',
      camera,
      collisionWorld,
      'bob',
    );
    this.updateLocator(
      this.goopLocator,
      goopPosition,
      activeSlimeId !== 'goop',
      camera,
      collisionWorld,
      'goop',
    );
  }

  dispose(): void {
    this.goopMesh.geometry.dispose();
    this.goopMesh.material.dispose();
    this.activeRing.geometry.dispose();
    this.activeRing.material.dispose();
    this.disposeLocator(this.bobLocator);
    this.disposeLocator(this.goopLocator);
    this.root.removeFromParent();
    this.root.clear();
  }

  private createLocator(
    slimeId: 'bob' | 'goop',
    letter: 'B' | 'G',
    shape: 'diamond' | 'circle',
    color: number,
  ): SlimeLocator {
    const material = new THREE.SpriteMaterial({
      map: createLocatorTexture(letter, shape),
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = `${slimeId}-inactive-body-locator`;
    sprite.renderOrder = 100;
    this.root.add(sprite);
    return { sprite, material };
  }

  private updateLocator(
    locator: SlimeLocator,
    bodyPosition: SlimePairPresentationPosition,
    shouldShow: boolean,
    camera: THREE.Camera,
    collisionWorld: CollisionWorld,
    slimeId: 'bob' | 'goop',
  ): void {
    const { sprite, material } = locator;
    if (!shouldShow) {
      if (sprite.visible) sprite.visible = false;
      if (material.opacity !== 0) material.opacity = 0;
      this.setLocatorDiagnostics(slimeId, false, false);
      return;
    }

    sprite.position.set(
      bodyPosition.x,
      bodyPosition.y + this.locatorHeightMetres,
      bodyPosition.z,
    );

    this.locatorTarget.copy(sprite.position);
    this.locatorDisplacement.subVectors(this.locatorTarget, camera.position);
    const distanceMetres = this.locatorDisplacement.length();
    const occluded =
      distanceMetres > LOCATOR_COLLISION_RADIUS_METRES &&
      collisionWorld.sweepSphere(
        camera.position,
        this.locatorDisplacement,
        LOCATOR_COLLISION_RADIUS_METRES,
        this.locatorHit,
        CollisionLayer.CameraObstruction,
      ) &&
      this.locatorHit.distance < distanceMetres - 0.08;
    const distanceFade = THREE.MathUtils.clamp(
      1 - (distanceMetres - 30) / 30,
      0.2,
      1,
    );
    const opacity = (occluded ? 0.88 : 0.16) * distanceFade;
    const size = THREE.MathUtils.clamp(
      distanceMetres * 0.055,
      LOCATOR_MIN_SIZE_METRES,
      LOCATOR_MAX_SIZE_METRES,
    );

    sprite.scale.set(size, size, 1);
    material.opacity = opacity;
    sprite.visible = opacity > 0.01;
    this.setLocatorDiagnostics(slimeId, sprite.visible, occluded);
  }

  private setLocatorDiagnostics(
    slimeId: 'bob' | 'goop',
    visible: boolean,
    occluded: boolean,
  ): void {
    if (slimeId === 'bob') {
      this.locatorDiagnosticsValue.bobVisible = visible;
      this.locatorDiagnosticsValue.bobOccluded = occluded;
    } else {
      this.locatorDiagnosticsValue.goopVisible = visible;
      this.locatorDiagnosticsValue.goopOccluded = occluded;
    }
  }

  private disposeLocator(locator: SlimeLocator): void {
    locator.material.map?.dispose();
    locator.material.dispose();
    locator.sprite.removeFromParent();
  }
}

function createLocatorTexture(
  letter: 'B' | 'G',
  shape: 'diamond' | 'circle',
): THREE.DataTexture {
  const size = 32;
  const centre = (size - 1) / 2;
  const data = new Uint8Array(size * size * 4);
  const glyph = letter === 'B'
    ? ['11110', '10001', '11110', '10001', '10001', '10001', '11110']
    : ['01110', '10001', '10000', '10111', '10001', '10001', '01110'];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - centre;
      const dy = y - centre;
      const distance = shape === 'diamond'
        ? Math.abs(dx) + Math.abs(dy)
        : Math.hypot(dx, dy);
      const border = distance >= 11 && distance <= 14;
      const glyphX = Math.floor((x - 8) / 3);
      const glyphY = Math.floor((y - 6) / 3);
      const glyphPixel =
        glyphY >= 0 && glyphY < glyph.length &&
        glyphX >= 0 && glyphX < glyph[glyphY].length &&
        glyph[glyphY][glyphX] === '1';
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = border || glyphPixel ? 255 : 0;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
