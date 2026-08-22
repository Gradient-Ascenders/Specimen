import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { DEFAULT_SLIME_BASE_COLOUR } from '../../slime/SlimeMaterial.ts';
import {
  createContainmentProceduralTextures,
  type ContainmentProceduralTextures,
} from './ContainmentProceduralTextures.ts';

export interface ContainmentArtMaterials {
  readonly mainCeramic: THREE.MeshStandardMaterial;
  readonly secondaryCeramic: THREE.MeshStandardMaterial;
  readonly clinicalFloor: THREE.MeshStandardMaterial;
  readonly graphite: THREE.MeshStandardMaterial;
  readonly serviceMetal: THREE.MeshStandardMaterial;
  readonly mechanicalBacking: THREE.MeshStandardMaterial;
  readonly gasket: THREE.MeshStandardMaterial;
  readonly neutralFixture: THREE.MeshStandardMaterial;
  readonly containmentGlass: THREE.MeshStandardMaterial;
  readonly staticCyanEmissive: THREE.MeshStandardMaterial;
  readonly warningStatus: THREE.MeshStandardMaterial;
  readonly lockedStatus: THREE.MeshStandardMaterial;
  readonly stickyMembrane: THREE.MeshStandardMaterial;
  readonly stickyVentMembrane: THREE.MeshStandardMaterial;
  readonly stickyDetail: THREE.MeshStandardMaterial;
  readonly solubleComposite: THREE.MeshStandardMaterial;
  readonly specimenShell: THREE.MeshStandardMaterial;
  readonly specimenShellInterior: THREE.MeshStandardMaterial;
  readonly crack: THREE.MeshStandardMaterial;
  readonly signage: THREE.MeshStandardMaterial;
}

export interface ContainmentArtGeometries {
  readonly unitBox: THREE.BoxGeometry;
  readonly unitCylinder: THREE.CylinderGeometry;
  readonly unitSphere: THREE.SphereGeometry;
  readonly glassShard: THREE.TetrahedronGeometry;
}

export interface ContainmentArtResourceDiagnostics {
  readonly textureCount: number;
  readonly materialCount: number;
  readonly geometryCount: number;
  readonly estimatedTextureBytes: number;
  readonly disposed: boolean;
}

/** One explicit GPU-resource owner shared by every Containment art group. */
export class ContainmentArtResources {
  readonly textures: ContainmentProceduralTextures;
  readonly materials: ContainmentArtMaterials;
  readonly geometries: ContainmentArtGeometries;

  private readonly chamferedGeometryCache = new Map<string, RoundedBoxGeometry>();
  private disposed = false;

  constructor() {
    this.textures = createContainmentProceduralTextures();
    const {
      ceramicNormal,
      ceramicRoughness,
      graphiteNormal,
      graphiteRoughness,
      stickyNormal,
      stickyRoughness,
      stickyVentNormal,
      stickyVentRoughness,
      signageAtlas,
    } = this.textures;

    for (const texture of [
      ceramicNormal,
      ceramicRoughness,
      graphiteNormal,
      graphiteRoughness,
    ]) {
      texture.repeat.set(4, 4);
    }
    stickyNormal.repeat.set(1, 1);
    stickyRoughness.repeat.set(1, 1);
    stickyVentNormal.repeat.set(1, 1);
    stickyVentRoughness.repeat.set(1, 1);

    this.materials = {
      mainCeramic: new THREE.MeshStandardMaterial({
        name: 'containment-main-ceramic',
        color: 0xe9e7e1,
        roughness: 0.58,
        metalness: 0,
        normalMap: ceramicNormal,
        roughnessMap: ceramicRoughness,
        normalScale: new THREE.Vector2(0.012, 0.012),
      }),
      secondaryCeramic: new THREE.MeshStandardMaterial({
        name: 'containment-secondary-ceramic',
        color: 0xd2d6d4,
        roughness: 0.61,
        metalness: 0,
        normalMap: ceramicNormal,
        roughnessMap: ceramicRoughness,
        normalScale: new THREE.Vector2(0.01, 0.01),
      }),
      clinicalFloor: new THREE.MeshStandardMaterial({
        name: 'containment-clinical-floor',
        color: 0xc2c8c6,
        roughness: 0.66,
        metalness: 0,
        normalMap: ceramicNormal,
        roughnessMap: ceramicRoughness,
        normalScale: new THREE.Vector2(0.012, 0.012),
      }),
      graphite: new THREE.MeshStandardMaterial({
        name: 'containment-graphite-frame',
        color: 0x23292b,
        roughness: 0.5,
        metalness: 0.58,
        normalMap: graphiteNormal,
        roughnessMap: graphiteRoughness,
        normalScale: new THREE.Vector2(0.045, 0.045),
      }),
      serviceMetal: new THREE.MeshStandardMaterial({
        name: 'containment-service-metal',
        color: 0x626c70,
        roughness: 0.5,
        metalness: 0.62,
        normalMap: graphiteNormal,
        roughnessMap: graphiteRoughness,
        normalScale: new THREE.Vector2(0.05, 0.05),
      }),
      mechanicalBacking: new THREE.MeshStandardMaterial({
        name: 'containment-mechanical-backing',
        color: 0x232a2c,
        roughness: 0.64,
        metalness: 0.34,
        normalMap: graphiteNormal,
        roughnessMap: graphiteRoughness,
        normalScale: new THREE.Vector2(0.035, 0.035),
      }),
      gasket: new THREE.MeshStandardMaterial({
        name: 'containment-rubber-gasket',
        color: 0x101516,
        roughness: 0.82,
        metalness: 0.04,
      }),
      neutralFixture: new THREE.MeshStandardMaterial({
        name: 'containment-neutral-clinical-fixture',
        color: 0xf3f2e9,
        emissive: 0xf4f2e5,
        emissiveIntensity: 0.24,
        roughness: 0.38,
        metalness: 0,
      }),
      containmentGlass: new THREE.MeshStandardMaterial({
        name: 'containment-clean-glass',
        color: 0xa6c8ca,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.2,
        metalness: 0.04,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      staticCyanEmissive: new THREE.MeshStandardMaterial({
        name: 'containment-static-cyan-emissive',
        color: 0x5f9997,
        emissive: 0x70b8b4,
        emissiveIntensity: 0.2,
        roughness: 0.42,
        metalness: 0.08,
      }),
      warningStatus: new THREE.MeshStandardMaterial({
        name: 'containment-warning-status',
        color: 0xb87e1d,
        emissive: 0xe0a839,
        emissiveIntensity: 0.28,
        roughness: 0.5,
        metalness: 0.18,
      }),
      lockedStatus: new THREE.MeshStandardMaterial({
        name: 'containment-locked-status',
        color: 0x7c1824,
        emissive: 0xff3048,
        emissiveIntensity: 0.42,
        roughness: 0.45,
        metalness: 0.15,
      }),
      stickyMembrane: new THREE.MeshStandardMaterial({
        name: 'containment-sticky-membrane',
        color: DEFAULT_SLIME_BASE_COLOUR,
        emissive: 0x061714,
        emissiveIntensity: 0.05,
        roughness: 0.24,
        metalness: 0,
        normalMap: stickyNormal,
        roughnessMap: stickyRoughness,
        normalScale: new THREE.Vector2(0.17, 0.17),
      }),
      stickyVentMembrane: new THREE.MeshStandardMaterial({
        name: 'containment-sticky-vent-membrane',
        color: 0x5f742d,
        emissive: 0x080c00,
        emissiveIntensity: 0.06,
        roughness: 0.28,
        metalness: 0.04,
        normalMap: stickyVentNormal,
        roughnessMap: stickyVentRoughness,
        normalScale: new THREE.Vector2(0.24, 0.24),
      }),
      stickyDetail: new THREE.MeshStandardMaterial({
        name: 'containment-sticky-cell-detail',
        color: 0x536a28,
        roughness: 0.32,
        metalness: 0,
      }),
      solubleComposite: new THREE.MeshStandardMaterial({
        name: 'containment-soluble-composite',
        color: 0x755136,
        emissive: 0x1d0b03,
        emissiveIntensity: 0.16,
        roughness: 0.72,
        metalness: 0,
        normalMap: graphiteNormal,
        roughnessMap: graphiteRoughness,
        normalScale: new THREE.Vector2(0.18, 0.18),
      }),
      specimenShell: new THREE.MeshStandardMaterial({
        name: 'containment-specimen-shell',
        color: 0xc8e8e6,
        emissive: 0x163c3f,
        emissiveIntensity: 0.08,
        roughness: 0.32,
        metalness: 0.02,
        normalMap: ceramicNormal,
        roughnessMap: ceramicRoughness,
        normalScale: new THREE.Vector2(0.055, 0.055),
      }),
      specimenShellInterior: new THREE.MeshStandardMaterial({
        name: 'containment-specimen-shell-interior',
        color: 0x31484a,
        roughness: 0.78,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      crack: new THREE.MeshStandardMaterial({
        name: 'containment-specimen-crack',
        color: 0x142326,
        roughness: 0.72,
        metalness: 0,
      }),
      signage: new THREE.MeshStandardMaterial({
        name: 'containment-signage-atlas-material',
        color: 0xffffff,
        map: signageAtlas,
        emissive: 0xffffff,
        emissiveMap: signageAtlas,
        emissiveIntensity: 0.08,
        roughness: 0.5,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    };

    this.geometries = {
      unitBox: new THREE.BoxGeometry(1, 1, 1),
      unitCylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
      unitSphere: new THREE.SphereGeometry(0.5, 28, 20),
      glassShard: new THREE.TetrahedronGeometry(0.5, 0),
    };
    this.geometries.unitBox.name = 'containment-shared-unit-box';
    this.geometries.unitCylinder.name = 'containment-shared-unit-cylinder';
    this.geometries.unitSphere.name = 'containment-shared-unit-sphere';
    this.geometries.glassShard.name = 'containment-shared-glass-shard';
  }

  /** Borrow a physically-sized, subtly rounded box owned by this library. */
  borrowChamferedBoxGeometry(
    size: readonly [number, number, number],
    radius = 0.035,
  ): RoundedBoxGeometry {
    const safeRadius = Math.min(radius, ...size.map((value) => value * 0.24));
    const key = [...size, safeRadius].map((value) => value.toFixed(4)).join(':');
    const cached = this.chamferedGeometryCache.get(key);
    if (cached) return cached;
    const geometry = new RoundedBoxGeometry(...size, 1, safeRadius);
    geometry.name = `containment-chamfered-box-${key}`;
    this.chamferedGeometryCache.set(key, geometry);
    return geometry;
  }

  get diagnostics(): ContainmentArtResourceDiagnostics {
    const textures = this.textureList;
    return {
      textureCount: textures.length,
      materialCount: Object.keys(this.materials).length,
      geometryCount: Object.keys(this.geometries).length + this.chamferedGeometryCache.size,
      estimatedTextureBytes: textures.reduce((total, texture) => {
        const data = texture.image.data as ArrayBufferView;
        return total + data.byteLength;
      }, 0),
      disposed: this.disposed,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    for (const geometry of this.chamferedGeometryCache.values()) geometry.dispose();
    this.chamferedGeometryCache.clear();
    for (const material of Object.values(this.materials)) material.dispose();
    for (const texture of this.textureList) texture.dispose();
  }

  private get textureList(): readonly THREE.DataTexture[] {
    return [
      this.textures.ceramicNormal,
      this.textures.ceramicRoughness,
      this.textures.graphiteNormal,
      this.textures.graphiteRoughness,
      this.textures.stickyNormal,
      this.textures.stickyRoughness,
      this.textures.stickyVentNormal,
      this.textures.stickyVentRoughness,
      this.textures.signageAtlas,
    ];
  }
}
