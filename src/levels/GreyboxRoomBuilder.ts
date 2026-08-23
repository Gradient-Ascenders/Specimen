import * as THREE from 'three';

import type { SurfaceTag } from '../physics/SurfaceRegistry.ts';

export interface GreyboxBoxOptions {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly material: THREE.Material;
  readonly surfaceTag?: SurfaceTag;
  /** Restrict a thin vertical panel to its two broad climbable/blocking faces. */
  readonly movementFaceMode?: 'all' | 'vertical-sides';
  readonly interactionRole?: 'goop-dissolvable';
  readonly textureRole?:
    | 'sticky-wall-tile'
    | 'sticky-vent-tile'
    | 'acid-floor'
    | 'wooden-door';
  readonly rotation?: readonly [number, number, number];
}

export interface CameraObstructionBoxOptions {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface ContainmentGreyboxMaterials {
  readonly floor: THREE.MeshStandardMaterial;
  readonly acid: THREE.MeshStandardMaterial;
  readonly wall: THREE.MeshStandardMaterial;
  readonly support: THREE.MeshStandardMaterial;
  readonly platform: THREE.MeshStandardMaterial;
  readonly sticky: THREE.MeshStandardMaterial;
  readonly duct: THREE.MeshStandardMaterial;
  readonly exit: THREE.MeshStandardMaterial;
  readonly containment: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly etch: THREE.MeshStandardMaterial;
  readonly wood: THREE.MeshStandardMaterial;
}

export const createContainmentGreyboxMaterials = (): ContainmentGreyboxMaterials => ({
  floor: material(0xaeb6ba),
  acid: new THREE.MeshStandardMaterial({
    color: 0x92bd24,
    emissive: 0x385600,
    emissiveIntensity: 0.55,
    roughness: 0.38,
    metalness: 0,
  }),
  wall: material(0xdadfe1),
  support: material(0x424a50),
  platform: material(0xd6a928, 0x443300),
  sticky: material(0x9fae38, 0x263100),
  duct: material(0x444a4d),
  exit: material(0x62bf83, 0x0a3018),
  containment: material(0x6c7780, 0x11181d),
  glass: new THREE.MeshStandardMaterial({
    color: 0x9ee7e4,
    emissive: 0x163d42,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.25,
    roughness: 0.18,
    metalness: 0.15,
  }),
  etch: material(0xb4e13e, 0x4b720d),
  wood: material(0x744522, 0x211006),
});

/** Shared primitive authoring helper for the later Containment rooms. */
export class GreyboxRoomBuilder {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];
  readonly cameraObstructionMeshes: THREE.Mesh[] = [];
  readonly materials: ContainmentGreyboxMaterials;

  private readonly cameraObstructionMaterial = new THREE.MeshBasicMaterial({
    visible: false,
  });

  constructor(
    name: string,
    materials = createContainmentGreyboxMaterials(),
  ) {
    this.materials = materials;
    this.root.name = name;
  }

  addCollider(options: GreyboxBoxOptions): THREE.Mesh {
    const mesh = this.createBox(options);
    mesh.userData.surfaceTag = options.surfaceTag ?? 'default';
    mesh.userData.movementFaceMode = options.movementFaceMode ?? 'all';
    if (options.interactionRole) {
      mesh.userData.interactionRole = options.interactionRole;
    }
    if (options.textureRole) mesh.userData.textureRole = options.textureRole;
    mesh.userData.sizeMetres = [...options.size];
    this.collisionMeshes.push(mesh);
    this.addOutline(mesh);
    return mesh;
  }

  addVisualBox(options: GreyboxBoxOptions): THREE.Mesh {
    return this.createBox(options);
  }

  /**
   * Author an invisible volume used only by camera-obstruction queries.
   *
   * The mesh itself stays visible to the scene graph and custom collision
   * world; Material.visible suppresses renderer submission without making the
   * query volume disappear from CollisionWorld.
   */
  addCameraObstruction(
    options: CameraObstructionBoxOptions,
  ): THREE.Mesh {
    const mesh = this.createBox({
      ...options,
      material: this.cameraObstructionMaterial,
    });
    mesh.userData.queryRole = 'camera-obstruction';
    mesh.userData.sizeMetres = [...options.size];
    this.cameraObstructionMeshes.push(mesh);
    return mesh;
  }

  addLight(
    name: string,
    position: readonly [number, number, number],
    colour = 0xe7fff1,
    intensity = 10,
    distance = 18,
  ): THREE.PointLight {
    const light = new THREE.PointLight(colour, intensity, distance);
    light.name = name;
    light.position.set(...position);
    this.root.add(light);
    return light;
  }

  dispose(): void {
    const ownedMaterials = new Set<THREE.Material>();
    for (const material of Object.values(this.materials)) {
      ownedMaterials.add(material);
    }
    ownedMaterials.add(this.cameraObstructionMaterial);
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
        return;
      }
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const ownedMaterial of materials) ownedMaterials.add(ownedMaterial);
    });
    for (const ownedMaterial of ownedMaterials) ownedMaterial.dispose();
    this.collisionMeshes.length = 0;
    this.cameraObstructionMeshes.length = 0;
    this.root.clear();
  }

  private createBox(options: GreyboxBoxOptions): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...options.size),
      options.material,
    );
    mesh.name = options.name;
    mesh.position.set(...options.position);
    if (options.rotation) mesh.rotation.set(...options.rotation);
    this.root.add(mesh);
    return mesh;
  }

  private addOutline(mesh: THREE.Mesh): void {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x24302f }),
    );
    outline.name = `${mesh.name}-outline`;
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    this.root.add(outline);
  }
}

function material(
  colour: number,
  emissive = 0x000000,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colour,
    emissive,
    emissiveIntensity: emissive === 0 ? 0 : 0.28,
    roughness: 0.7,
    metalness: 0.05,
  });
}
