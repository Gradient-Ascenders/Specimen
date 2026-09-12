import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFourGreybox } from '../../../levels/LevelTwoRoomFourGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import type { CultivationChamberMaterials } from './CultivationChamberMaterials.ts';
import { mapCultivationPlatformWear } from './CultivationPlatformWear.ts';

type Size = readonly [number, number, number];

/** Presentation attached to the authored lift and scrolling modules; no simulation writes. */
export class CultivationElevatorArt {
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private disposed = false;

  constructor(room: LevelTwoRoomFourGreybox, lab: CultivationLabMaterials, chamber: CultivationChamberMaterials) {
    const variant = (source: THREE.MeshStandardMaterial, name: string, colour: number, roughness: number) => {
      const material = source.clone();
      material.name = `cultivation-elevator-${name}`;
      material.color.setHex(colour); material.roughness = roughness;
      this.materials.push(material);
      return material;
    };
    const deck = variant(lab.floor, 'reinforced-deck', 0x7e8b87, 0.94);
    deck.map = lab.platform.map;
    deck.roughnessMap = lab.platform.roughnessMap;
    deck.bumpMap = null;
    deck.normalMap = lab.platform.normalMap;
    deck.normalScale.copy(lab.platform.normalScale);
    const shaft = variant(lab.metal, 'shaft-backing', 0x303d40, 0.85);
    const panel = variant(lab.wall, 'service-panels', 0xbfc9c4, 0.86);
    // Existing local lift lighting does not reach the distant shaft modules.
    // A restrained finish lift keeps their silhouettes readable without new lights.
    panel.emissive.setHex(0x8a9b94); panel.emissiveIntensity = 0.12;
    const teal = variant(lab.metal, 'service-teal', 0x39776f, 0.76);
    const lamp = variant(lab.fixture, 'shaft-marker', 0xb7d8cd, 0.45);
    lamp.emissive.setHex(0x9dcec1); lamp.emissiveIntensity = 0.65;
    const overrides = new Map<string, THREE.MeshStandardMaterial>();
    room.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.material === room.builder.materials.duct) overrides.set(object.name, shaft);
      if (object.material === room.builder.materials.platform) overrides.set(object.name, chamber.warning);
      if (object.userData.textureRole === 'soluble-cable') overrides.set(object.name, chamber.cable);
      if (object.name.startsWith('room-4-shaft-beam-')) overrides.set(object.name, lab.metal);
      if (object.name.startsWith('room-4-rail-')) overrides.set(object.name, lab.metal);
      if (object.name === 'room-4-boarding-floor') overrides.set(object.name, lab.floor);
      if (object.name === 'room-4-lift-tread') overrides.set(object.name, deck);
      if (object.name.includes('carriage') || object.name.includes('motor')) overrides.set(object.name, teal);
      if (object.name.endsWith('-shutter-panel')) overrides.set(object.name, lab.duct);
    });
    lab.dress(room.builder, [], overrides);
    const tread = room.root.getObjectByName('room-4-lift-tread') as THREE.Mesh;
    mapCultivationPlatformWear(tread.geometry, tread.name, 12);

    // Group boxes by finish once. Each scrolling module reuses the same merged geometry.
    type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
    const box = (parts: Parts, material: THREE.Material, size: Size, position: Size) => {
      const geometry = new THREE.BoxGeometry(...size);
      const vertices = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
        const nx = normals.getX(i), ny = normals.getY(i);
        // Metre-based UVs keep long shaft panels and small hatches at the same density.
        uv.setXY(i, (Math.abs(nx) > .5 ? z : x) / 2, (Math.abs(ny) > .5 ? z : y) / 2);
      }
      geometry.translate(...position);
      const list = parts.get(material) ?? [];
      list.push(geometry); parts.set(material, list);
    };
    const merge = (parts: Parts) => [...parts].map(([material, pieces]) => {
      const geometry = mergeGeometries(pieces, false)!;
      for (const piece of pieces) piece.dispose();
      this.geometries.add(geometry);
      return { material, geometry };
    });
    const attach = (parent: THREE.Object3D, batches: ReturnType<typeof merge>, name: string) => {
      batches.forEach(({ material, geometry }, i) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${name}-${i}`; mesh.userData.presentationOnly = true;
        parent.add(mesh); this.meshes.push(mesh);
      });
    };
    const module: Parts = new Map();
    for (const side of [-1, 1]) {
      const x = side * 4.985;
      for (const z of [7.5, 11.5]) {
        box(module, panel, [.025, 6.8, 3.5], [x, 3.9, z]);
        box(module, lab.metal, [.055, .12, 3.5], [x - side * .025, .55, z]);
        box(module, teal, [.055, .2, 3.5], [x - side * .025, 6.8, z]);
        // Recess-like service hatch with six dark louvres, contained against the wall.
        box(module, lab.metal, [.06, 1.3, 1.3], [x - side * .025, 3.8, z]);
        for (let row = 0; row < 6; row++) {
          box(module, panel, [.075, .07, 1.12], [x - side * .035, 3.28 + row * .2, z]);
        }
        box(module, lamp, [.075, .09, 1.25], [x - side * .04, 6.35, z]);
      }
    }
    // The forward wall is the usual gameplay view. Leave the central arrival vent clear.
    for (const x of [-3.05, 3.05]) {
      box(module, panel, [3.4, 6.8, .025], [x, 3.9, 14.775]);
      box(module, lab.metal, [3.4, .12, .055], [x, .55, 14.75]);
      box(module, teal, [3.4, .2, .055], [x, 6.8, 14.75]);
      box(module, lab.metal, [1.3, 1.3, .06], [x, 3.8, 14.74]);
      for (let row = 0; row < 6; row++) {
        box(module, panel, [1.12, .07, .075], [x, 3.28 + row * .2, 14.725]);
      }
      box(module, lamp, [1.25, .09, .075], [x, 6.35, 14.72]);
    }
    const moduleBatches = merge(module);
    for (let i = 0; i < 8; i++) {
      const parent = room.root.getObjectByName(`room-4-shaft-module-${i}`)!;
      attach(parent, moduleBatches, `room-4-art-shaft-${i}`);
    }
    const deckParts: Parts = new Map();
    // Low-profile tread ribs and perimeter fasteners stay within the existing deck.
    for (const x of [-3.4, -1.7, 0, 1.7, 3.4]) for (const z of [6.5, 8.2, 9.9, 11.6, 13.3]) {
      for (let rib = 0; rib < 4; rib++) {
        box(deckParts, lab.metal, [.9, .008, .025], [x, .245, z + rib * .12]);
      }
    }
    for (const x of [-4.6, 4.6]) for (const z of [6, 8, 10, 12, 14]) {
      box(deckParts, lab.metal, [.08, .015, .08], [x, .27, z]);
    }
    attach(room.root, merge(deckParts), 'room-4-art-tread');
    // Attach finish plates to moving hardware, so their original motion/reset owns them.
    const guard: Parts = new Map();
    for (const x of [-3.3, 0, 3.3]) {
      box(guard, panel, [3.1, 3.4, .035], [x, 0, .13]);
      box(guard, chamber.warning, [3.1, .16, .045], [x, 1.85, .13]);
    }
    attach(room.boardingGuard, merge(guard), 'room-4-art-guard');
    for (const material of [...this.materials, chamber.warning, chamber.cable, lab.metal, lab.wall]) {
      room.builder.borrowedMaterials.add(material);
    }
  }

  get diagnostics() {
    return { addedDrawCalls: this.meshes.length, geometryCount: this.geometries.size,
      materialVariants: this.materials.length, newTextures: 0,
      renderedTriangles: this.meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? 0) / 3, 0) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) mesh.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.meshes.length = 0; this.geometries.clear();
  }
}
