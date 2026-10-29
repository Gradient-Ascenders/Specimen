import * as THREE from 'three';
import { GAMEPLAY_UI_LAYER } from '../render/GameplayUiLayer.ts';

import {
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { SlimeId } from './SlimeRoster.ts';
import type { SlimePassiveInteraction } from './SlimeHUDState.ts';

const NO_INTERACTIONS: readonly SlimePassiveInteraction[] = [];

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

/** Inactive-body locators only; level character presentations own visibility. */
export class SlimePairPresentation {
  readonly root = new THREE.Group();

  private readonly bobLocator: SlimeLocator;
  private readonly goopLocator: SlimeLocator;
  private readonly locatorHit = new CollisionHit();
  private readonly locatorDisplacement = new THREE.Vector3();
  private readonly locatorTarget = new THREE.Vector3();
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
    _firstPersonAimActive = false,
    cinematic = false,
    companionInteractions: readonly SlimePassiveInteraction[] = NO_INTERACTIONS,
  ): void {
    // A live assistance badge takes over this same locator; never stack both on one character.
    let assistedBob = false, assistedGoop = false;
    for (const interaction of companionInteractions) {
      if (interaction.kind !== 'companion' || (interaction.state !== 'catching-up' && interaction.state !== 'waiting')) continue;
      if (interaction.slimeId === 'bob') assistedBob = true;
      if (interaction.slimeId === 'goop') assistedGoop = true;
    }
    this.updateLocator(
      this.bobLocator,
      bobPosition,
      !cinematic && !assistedBob && activeSlimeId !== 'bob',
      camera,
      collisionWorld,
      'bob',
    );
    this.updateLocator(
      this.goopLocator,
      goopPosition,
      !cinematic && !assistedGoop && activeSlimeId !== 'goop',
      camera,
      collisionWorld,
      'goop',
    );
  }

  dispose(): void {
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
    sprite.layers.set(GAMEPLAY_UI_LAYER);
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
    const opacity = (occluded ? 0.92 : 0.55) * distanceFade;
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
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Character locators require a 2D canvas context.');
  context.beginPath();
  if (shape === 'circle') context.arc(64, 64, 51, 0, Math.PI * 2);
  else { context.moveTo(64, 8); context.lineTo(120, 64); context.lineTo(64, 120); context.lineTo(8, 64); context.closePath(); }
  context.fillStyle = 'rgba(7, 15, 20, .82)'; context.fill();
  context.strokeStyle = '#ffffff'; context.lineWidth = 4; context.stroke();
  context.fillStyle = '#ffffff'; context.font = '700 64px sans-serif';
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(letter, 64, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
