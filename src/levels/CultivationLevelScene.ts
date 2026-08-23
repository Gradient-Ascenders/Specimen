import * as THREE from 'three';

import type {
  CultivationFoundationManifest,
  CultivationStructuralAssemblyAuthoring,
} from './CultivationFoundationManifest.ts';

interface BoxAuthoring {
  readonly id: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly colour: number;
}

/** Minimal playable geometry used to exercise the Cultivation runtime contract. */
export class CultivationLevelScene {
  readonly root = new THREE.Group();
  readonly collisionMeshes: readonly THREE.Mesh[];
  readonly solubleSupportMeshes: readonly THREE.Mesh[];

  constructor(manifest: CultivationFoundationManifest) {
    this.root.name = 'cultivation-level-2-foundation';
    const collisionMeshes: THREE.Mesh[] = [];
    const solubleSupportMeshes: THREE.Mesh[] = [];
    const boxes: readonly BoxAuthoring[] = [
      { id: 'cultivation-foundation-floor', size: [16, 0.4, 42], position: [0, -0.2, 19], colour: 0x64716b },
      { id: 'cultivation-foundation-left-wall', size: [0.4, 5, 42], position: [-8, 2.5, 19], colour: 0x43514c },
      { id: 'cultivation-foundation-right-wall', size: [0.4, 5, 42], position: [8, 2.5, 19], colour: 0x43514c },
      { id: 'cultivation-foundation-entry-wall', size: [16, 5, 0.4], position: [0, 2.5, -2], colour: 0x43514c },
      { id: 'cultivation-room-3-upper-bob-platform', size: [5, 0.4, 5], position: [-2.5, 4, 34], colour: 0xd3b94f },
    ];
    validateStructuralAssemblyAuthoring(manifest.structuralAssemblies, boxes);
    for (const box of boxes) collisionMeshes.push(this.addCollisionBox(box));

    for (const assembly of manifest.structuralAssemblies) {
      const support = new THREE.Mesh(
        new THREE.BoxGeometry(
          assembly.supportSize.x,
          assembly.supportSize.y,
          assembly.supportSize.z,
        ),
        new THREE.MeshStandardMaterial({
          color: assembly.supportRole === 'soluble-rope' ? 0xb98a46 : 0x9c683e,
          emissive: 0x263614,
          emissiveIntensity: 0.18,
          roughness: 0.82,
        }),
      );
      support.name = assembly.supportTargetId;
      support.position.copy(assembly.supportPosition);
      support.userData.surfaceTag = 'default';
      support.userData.authoringRole = 'soluble-structural-support';
      support.userData.assemblyId = assembly.id;
      support.userData.supportRole = assembly.supportRole;
      support.userData.soluble = true;
      support.userData.solubleId = assembly.supportTargetId;
      support.userData.dissolveDurationSeconds = 0.55;
      support.userData.dissolveCollisionDisableProgress = 0.72;
      support.userData.dissolveActivationRangeMetres = 0.18;
      support.userData.sizeMetres = assembly.supportSize.toArray();
      this.root.add(support);
      collisionMeshes.push(support);
      solubleSupportMeshes.push(support);
    }

    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.3, 2),
      new THREE.MeshStandardMaterial({ color: 0x8b9d96, roughness: 0.8 }),
    );
    vent.name = 'cultivation-entrance-ceiling-vent';
    vent.position.set(0, 4.5, 1);
    vent.userData.authoringRole = 'entrance-ceiling-vent';
    this.root.add(vent);

    for (const hazard of manifest.radioactiveHazards) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x78ff45,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hazard.size.x, hazard.size.y, hazard.size.z),
        material,
      );
      mesh.name = `${hazard.id}-presentation`;
      mesh.position.copy(hazard.centre);
      mesh.userData.authoringRole = 'radioactive-hazard';
      mesh.userData.hazardId = hazard.id;
      mesh.userData.hazardType = 'radioactive';
      this.root.add(mesh);
    }

    this.collisionMeshes = collisionMeshes;
    this.solubleSupportMeshes = solubleSupportMeshes;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
  }

  private addCollisionBox(box: BoxAuthoring): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...box.size),
      new THREE.MeshStandardMaterial({ color: box.colour, roughness: 0.85 }),
    );
    mesh.name = box.id;
    mesh.position.set(...box.position);
    mesh.userData.surfaceTag = 'default';
    mesh.userData.authoringRole = 'cultivation-collision';
    mesh.userData.sizeMetres = [...box.size];
    this.root.add(mesh);
    return mesh;
  }
}

function validateStructuralAssemblyAuthoring(
  assemblies: readonly CultivationStructuralAssemblyAuthoring[],
  staticBoxes: readonly BoxAuthoring[],
): void {
  const assemblyIds = new Set<string>();
  const supportTargetIds = new Set<string>();

  for (const assembly of assemblies) {
    if (!assembly.id || assemblyIds.has(assembly.id)) {
      throw new Error('Cultivation structural assembly IDs must be unique and non-empty.');
    }
    if (!assembly.supportTargetId || supportTargetIds.has(assembly.supportTargetId)) {
      throw new Error('Cultivation soluble support IDs must be unique and non-empty.');
    }
    if (!assembly.puzzleGroupId) {
      throw new Error(`Cultivation assembly "${assembly.id}" requires a puzzle group.`);
    }
    if (
      (assembly.mode === 'drop-to-acid' && assembly.supportRole !== 'soluble-rope') ||
      (assembly.mode === 'rope-catch' && assembly.supportRole !== 'soluble-brace')
    ) {
      throw new Error(
        `Cultivation assembly "${assembly.id}" has an invalid support role for mode "${assembly.mode}".`,
      );
    }

    validateFiniteVector(assembly.id, 'support position', assembly.supportPosition);
    validatePositiveVector(assembly.id, 'support size', assembly.supportSize);
    validateFiniteVector(assembly.id, 'initial position', assembly.initialPosition);
    validateFiniteVector(assembly.id, 'final position', assembly.finalPosition);
    validatePositiveVector(assembly.id, 'moving size', assembly.movingSize);
    validateNonNegativeFinite(
      assembly.id,
      'release delay',
      assembly.releaseDelaySeconds,
    );
    validatePositiveFinite(
      assembly.id,
      'travel duration',
      assembly.travelDurationSeconds,
    );
    if (assembly.settlingDurationSeconds !== undefined) {
      validatePositiveFinite(
        assembly.id,
        'settling duration',
        assembly.settlingDurationSeconds,
      );
    }
    if (assembly.settlingSwingRadians !== undefined) {
      validateNonNegativeFinite(
        assembly.id,
        'settling swing',
        assembly.settlingSwingRadians,
      );
    }

    assertPoseClearOfStaticGeometry(
      assembly.id,
      'support',
      assembly.supportPosition,
      assembly.supportSize,
      staticBoxes,
    );
    assertPoseClearOfStaticGeometry(
      assembly.id,
      'initial',
      assembly.initialPosition,
      assembly.movingSize,
      staticBoxes,
    );
    assertPoseClearOfStaticGeometry(
      assembly.id,
      'final',
      assembly.finalPosition,
      assembly.movingSize,
      staticBoxes,
    );

    assemblyIds.add(assembly.id);
    supportTargetIds.add(assembly.supportTargetId);
  }
}

function validateFiniteVector(
  assemblyId: string,
  label: string,
  vector: THREE.Vector3,
): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`Cultivation assembly "${assemblyId}" ${label} must be finite.`);
  }
}

function validatePositiveVector(
  assemblyId: string,
  label: string,
  vector: THREE.Vector3,
): void {
  validateFiniteVector(assemblyId, label, vector);
  if (vector.x <= 0 || vector.y <= 0 || vector.z <= 0) {
    throw new Error(`Cultivation assembly "${assemblyId}" ${label} must be positive.`);
  }
}

function validatePositiveFinite(
  assemblyId: string,
  label: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Cultivation assembly "${assemblyId}" ${label} must be positive and finite.`);
  }
}

function validateNonNegativeFinite(
  assemblyId: string,
  label: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Cultivation assembly "${assemblyId}" ${label} must be non-negative and finite.`,
    );
  }
}

function assertPoseClearOfStaticGeometry(
  assemblyId: string,
  poseLabel: string,
  position: THREE.Vector3,
  size: THREE.Vector3,
  staticBoxes: readonly BoxAuthoring[],
): void {
  for (const box of staticBoxes) {
    if (!boxesOverlap(position, size, box.position, box.size)) continue;
    throw new Error(
      `Cultivation assembly "${assemblyId}" ${poseLabel} collider overlaps static collider "${box.id}".`,
    );
  }
}

function boxesOverlap(
  firstPosition: THREE.Vector3,
  firstSize: THREE.Vector3,
  secondPosition: readonly [number, number, number],
  secondSize: readonly [number, number, number],
): boolean {
  return (
    Math.abs(firstPosition.x - secondPosition[0]) < (firstSize.x + secondSize[0]) / 2 &&
    Math.abs(firstPosition.y - secondPosition[1]) < (firstSize.y + secondSize[1]) / 2 &&
    Math.abs(firstPosition.z - secondPosition[2]) < (firstSize.z + secondSize[2]) / 2
  );
}
