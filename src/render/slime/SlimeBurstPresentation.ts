import * as THREE from 'three';

import { DEFAULT_DEATH_BURST_DURATION_SECONDS } from '../../systems/DeathSequence.ts';
import { DEFAULT_SLIME_BASE_COLOUR } from './SlimeMaterial.ts';
import type { Vector3State } from './SlimeVisual.ts';

const FRAGMENT_COUNT = 30;
const BURST_FADE_START_SECONDS = 0.56;
const GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5));
const LOCAL_UP = new THREE.Vector3(0, 1, 0);

interface Fragment {
  readonly direction: THREE.Vector3;
  readonly rotation: THREE.Quaternion;
  readonly speedMetresPerSecond: number;
  readonly radiusMetres: number;
  readonly elongation: number;
  readonly delaySeconds: number;
}

export interface SlimeBurstDiagnostics {
  readonly active: boolean;
  readonly elapsedSeconds: number;
  readonly origin: THREE.Vector3;
  readonly maximumFragmentDistanceMetres: number;
  readonly resourcesPrimed: boolean;
  readonly resourcePrimeCount: number;
}

/**
 * Visual-only, deterministic slime fragments. One instanced mesh keeps the
 * effect inexpensive and guarantees every restart reuses the same resources.
 */
export class SlimeBurstPresentation {
  readonly root = new THREE.Group();

  private readonly geometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly material: THREE.MeshPhysicalMaterial;
  private readonly fragments: readonly Fragment[];
  private readonly fragmentMesh: THREE.InstancedMesh;
  private readonly core: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private elapsedSeconds = 0;
  private active = false;
  private maximumFragmentDistanceMetres = 0;
  private resourcesPrimed = false;
  private resourcePrimeCount = 0;

  constructor(baseColour: THREE.ColorRepresentation = DEFAULT_SLIME_BASE_COLOUR) {
    this.root.name = 'player-slime-death-burst';
    this.root.visible = false;
    this.geometry.name = 'player-slime-death-droplet-sphere-geometry';

    this.material = new THREE.MeshPhysicalMaterial({
      name: 'wet-slime-death-fragment-material',
      color: 0xffffff,
      // The custom live-slime shader supplies its own clinical fill light.
      // A modest identity-coloured emission keeps detached droplets equally
      // readable when death happens below the authored lighting volume.
      emissive: new THREE.Color(baseColour).multiplyScalar(0.16),
      metalness: 0,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      vertexColors: true,
    });

    this.fragments = this.createFragments();
    this.fragmentMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      FRAGMENT_COUNT,
    );
    this.fragmentMesh.name = 'player-slime-death-droplets';
    this.fragmentMesh.frustumCulled = false;
    this.fragmentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const identityColour = new THREE.Color(baseColour);
    for (let index = 0; index < FRAGMENT_COUNT; index += 1) {
      const colourVariation = 0.88 + (index % 5) * 0.035;
      this.fragmentMesh.setColorAt(
        index,
        identityColour.clone().multiplyScalar(colourVariation),
      );
    }
    if (this.fragmentMesh.instanceColor) {
      this.fragmentMesh.instanceColor.name =
        'player-slime-death-droplet-instance-colours';
      this.fragmentMesh.instanceColor.needsUpdate = true;
    }
    this.fragmentMesh.instanceMatrix.name =
      'player-slime-death-droplet-instance-transforms';

    const coreGeometry = new THREE.IcosahedronGeometry(0.42, 2);
    coreGeometry.name = 'player-slime-death-rupture-core-geometry';
    this.core = new THREE.Mesh(coreGeometry, this.material);
    this.core.name = 'player-slime-death-rupture-core';
    this.root.add(this.core, this.fragmentMesh);
    this.writeHiddenInstances();
  }

  get diagnostics(): SlimeBurstDiagnostics {
    return {
      active: this.active,
      elapsedSeconds: this.elapsedSeconds,
      origin: this.origin.clone(),
      maximumFragmentDistanceMetres: this.maximumFragmentDistanceMetres,
      resourcesPrimed: this.resourcesPrimed,
      resourcePrimeCount: this.resourcePrimeCount,
    };
  }

  /**
   * Present only the existing burst resources to the loading renderer. The
   * callback owns the hidden draw; gameplay state and presentation are restored
   * even if that draw fails.
   */
  primeResources(
    position: Vector3State,
    render: (root: THREE.Object3D) => void,
  ): boolean {
    if (this.resourcesPrimed) return false;
    if (this.active) {
      throw new Error('Cannot prime slime burst resources during an active burst.');
    }

    const previousRootVisible = this.root.visible;
    const previousRootPosition = this.root.position.clone();
    const previousCoreVisible = this.core.visible;
    const previousCoreScale = this.core.scale.clone();
    const previousCoreFrustumCulled = this.core.frustumCulled;
    const previousFragmentVisible = this.fragmentMesh.visible;
    const previousOpacity = this.material.opacity;
    const previousMaximumDistance = this.maximumFragmentDistanceMetres;
    let completed = false;

    try {
      this.root.position.set(position.x, position.y, position.z);
      this.root.visible = true;
      this.core.visible = true;
      this.core.scale.setScalar(1);
      this.core.frustumCulled = false;
      this.fragmentMesh.visible = true;
      this.material.opacity = 1;
      this.updateInstances(0.1);
      render(this.root);
      completed = true;
      this.resourcesPrimed = true;
      this.resourcePrimeCount += 1;
      return true;
    } finally {
      this.root.visible = previousRootVisible;
      this.root.position.copy(previousRootPosition);
      this.core.visible = previousCoreVisible;
      this.core.scale.copy(previousCoreScale);
      this.core.frustumCulled = previousCoreFrustumCulled;
      this.fragmentMesh.visible = previousFragmentVisible;
      this.material.opacity = previousOpacity;
      this.maximumFragmentDistanceMetres = previousMaximumDistance;
      this.writeHiddenInstances();
      if (!completed) this.resourcesPrimed = false;
    }
  }

  start(position: Vector3State): boolean {
    if (this.active) return false;

    this.origin.set(position.x, position.y, position.z);
    this.root.position.copy(this.origin);
    this.root.visible = true;
    this.core.visible = true;
    this.core.scale.setScalar(0.92);
    this.material.opacity = 1;
    this.elapsedSeconds = 0;
    this.maximumFragmentDistanceMetres = 0;
    this.active = true;
    this.updateInstances(0);
    return true;
  }

  update(deltaSeconds: number): void {
    if (!this.active) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Slime burst deltaSeconds must be positive and finite.');
    }

    this.elapsedSeconds = Math.min(
      DEFAULT_DEATH_BURST_DURATION_SECONDS,
      this.elapsedSeconds + deltaSeconds,
    );

    const coreProgress = THREE.MathUtils.clamp(
      this.elapsedSeconds / 0.18,
      0,
      1,
    );
    const corePulse = coreProgress < 0.28
      ? THREE.MathUtils.lerp(0.92, 1.16, coreProgress / 0.28)
      : THREE.MathUtils.lerp(1.16, 0, (coreProgress - 0.28) / 0.72);
    this.core.scale.setScalar(Math.max(0, corePulse));
    this.core.rotation.x += deltaSeconds * 3.8;
    this.core.rotation.y += deltaSeconds * 5.2;
    this.core.visible = coreProgress < 1;

    this.material.opacity = 1 - THREE.MathUtils.smoothstep(
      this.elapsedSeconds,
      BURST_FADE_START_SECONDS,
      DEFAULT_DEATH_BURST_DURATION_SECONDS,
    );
    this.updateInstances(this.elapsedSeconds);

    if (this.elapsedSeconds >= DEFAULT_DEATH_BURST_DURATION_SECONDS) {
      this.active = false;
      this.root.visible = false;
    }
  }

  reset(): void {
    this.active = false;
    this.elapsedSeconds = 0;
    this.maximumFragmentDistanceMetres = 0;
    this.root.visible = false;
    this.core.visible = false;
    this.material.opacity = 1;
    this.writeHiddenInstances();
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    this.geometry.dispose();
    this.core.geometry.dispose();
    this.material.dispose();
  }

  private createFragments(): readonly Fragment[] {
    const fragments: Fragment[] = [];
    for (let index = 0; index < FRAGMENT_COUNT; index += 1) {
      const unitY = 1 - ((index + 0.5) / FRAGMENT_COUNT) * 2;
      const radial = Math.sqrt(Math.max(0, 1 - unitY * unitY));
      const angle = index * GOLDEN_ANGLE_RADIANS;
      const direction = new THREE.Vector3(
        Math.cos(angle) * radial,
        unitY + 0.24,
        Math.sin(angle) * radial,
      ).normalize();
      const speed = 1.65 + ((index * 37) % 17) / 16 * 2.35;
      const radius = 0.052 + ((index * 11) % 9) / 8 * 0.095;
      const elongation = 1.18 + ((index * 7) % 8) / 7 * 0.9;

      fragments.push({
        direction,
        rotation: new THREE.Quaternion().setFromUnitVectors(
          LOCAL_UP,
          direction,
        ),
        speedMetresPerSecond: speed,
        radiusMetres: radius,
        elongation,
        delaySeconds: (index % 5) * 0.007,
      });
    }
    return fragments;
  }

  private updateInstances(elapsedSeconds: number): void {
    this.maximumFragmentDistanceMetres = 0;

    for (let index = 0; index < this.fragments.length; index += 1) {
      const fragment = this.fragments[index];
      const time = Math.max(0, elapsedSeconds - fragment.delaySeconds);
      const travel = fragment.speedMetresPerSecond *
        (1 - Math.exp(-1.45 * time)) / 1.45;

      this.position.copy(fragment.direction).multiplyScalar(0.045 + travel);
      this.position.y -= 1.45 * time * time;
      this.maximumFragmentDistanceMetres = Math.max(
        this.maximumFragmentDistanceMetres,
        this.position.length(),
      );

      const grow = THREE.MathUtils.smoothstep(time, 0, 0.095);
      const shrink = 1 - THREE.MathUtils.smoothstep(
        time,
        0.54 + (index % 4) * 0.035,
        DEFAULT_DEATH_BURST_DURATION_SECONDS,
      );
      const radius = fragment.radiusMetres * grow * shrink;
      this.scale.set(radius, radius * fragment.elongation, radius);
      this.matrix.compose(this.position, fragment.rotation, this.scale);
      this.fragmentMesh.setMatrixAt(index, this.matrix);
    }

    this.fragmentMesh.instanceMatrix.needsUpdate = true;
  }

  private writeHiddenInstances(): void {
    this.scale.setScalar(0);
    this.matrix.compose(this.position.set(0, 0, 0), new THREE.Quaternion(), this.scale);
    for (let index = 0; index < FRAGMENT_COUNT; index += 1) {
      this.fragmentMesh.setMatrixAt(index, this.matrix);
    }
    this.fragmentMesh.instanceMatrix.needsUpdate = true;
  }
}
