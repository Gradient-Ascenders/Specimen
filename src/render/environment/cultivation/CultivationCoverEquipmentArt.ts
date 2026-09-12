import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GreyboxRoomBuilder } from '../../../levels/GreyboxRoomBuilder.ts';
import { createCultivationEquipmentWear } from './CultivationEquipmentWear.ts';

export const COVER_EQUIPMENT = [
  { name: 'cultivation-room-3-goop-checkpoint-shield', identity: 'Decontamination unit', label: 'DECON', yawDegrees: 0, size: [8, 4.5, 1] },
  { name: 'cultivation-room-3-goop-cover-1', identity: 'Sample freezer', label: 'FREEZER', yawDegrees: 180, size: [5, 3.5, 3] },
  { name: 'cultivation-room-3-goop-cover-2', identity: 'Chemical storage cabinet', label: 'CHEMICAL', yawDegrees: 90, size: [4.5, 4, 3] },
  { name: 'cultivation-room-3-goop-cover-3', identity: 'Analysis machine', label: 'ANALYSIS', yawDegrees: 0, size: [5.5, 3.2, 3] },
  { name: 'cultivation-room-3-goop-cover-4', identity: 'Specimen drawer cabinet', label: 'SPECIMEN', yawDegrees: 180, size: [5, 4.4, 3.2] },
  { name: 'cultivation-room-3-goop-cover-5', identity: 'Centrifuge processing unit', label: 'PROCESS', yawDegrees: -12, size: [5, 3.6, 3] },
  { name: 'cultivation-room-3-goop-cover-6', identity: 'Laboratory data cabinet', label: 'DATA', yawDegrees: 0, size: [5.5, 4.2, 3.2] },
  { name: 'cultivation-room-3-goop-cover-7', identity: 'Sealed biohazard unit', label: 'BIOHAZARD', yawDegrees: -90, size: [4.5, 3.4, 3] },
] as const;

type Finish = 'shell' | 'metal' | 'dark' | 'teal' | 'yellow' | 'display';
type Triple = [number, number, number];

/** Static laboratory props; original cover boxes remain the only gameplay geometry. */
export class CultivationCoverEquipmentArt {
  readonly material = new THREE.MeshStandardMaterial({ name: 'cover-collider-hidden', visible: false });
  private readonly wear = createCultivationEquipmentWear();
  private readonly droneWear = createCultivationEquipmentWear(true);
  readonly textures: readonly THREE.Texture[] = [...Object.values(this.wear), ...Object.values(this.droneWear)];
  readonly droneSurfaceMaps = { scuffMap: this.droneWear.albedo,
    bumpMap: this.droneWear.roughness, roughnessMap: this.droneWear.roughness };
  readonly root = new THREE.Group();
  readonly propBounds = new Map<string, THREE.Box3>();
  private readonly finishes: Record<Finish, THREE.MeshStandardMaterial>;
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();
  private disposed = false;
  private triangleCount = 0;

  constructor(surface?: THREE.MeshStandardMaterial) {
    const finish = (name: string, colour: number, roughness: number, metalness: number) => new THREE.MeshStandardMaterial({
      name: `cover-prop-${name}`, color: colour, roughness, metalness,
      normalMap: surface?.normalMap ?? null, roughnessMap: surface?.roughnessMap ?? null,
      normalScale: new THREE.Vector2(0.012, 0.012),
    });
    this.finishes = {
      shell: finish('clinical-shell', 0xd2d6d4, 0.61, 0),
      metal: finish('service-metal', 0x626c70, 0.5, 0.62),
      dark: finish('graphite', 0x23292b, 0.5, 0.58),
      teal: finish('decontamination-teal', 0x3b817b, 0.6, 0.18),
      yellow: finish('safety-yellow', 0xc69b32, 0.65, 0.12),
      display: finish('instrument-display', 0x102b31, 0.22, 0.15),
    };
    this.finishes.display.emissive.setHex(0x153a40);
    this.finishes.display.emissiveIntensity = 0.15;
    for (const role of ['shell', 'metal', 'dark', 'teal', 'yellow'] as const) {
      this.finishes[role].map = this.wear.albedo;
      this.finishes[role].roughnessMap = this.wear.roughness;
      this.finishes[role].roughness = role === 'shell' ? .88 : .78;
    }
    this.root.name = 'cultivation-room-3-laboratory-cover-props';
    this.root.userData.presentationOnly = true;
  }

  overrides(): ReadonlyMap<string, THREE.MeshStandardMaterial> {
    return new Map(COVER_EQUIPMENT.map(item => [item.name, this.material]));
  }

  build(builder: GreyboxRoomBuilder): void {
    builder.root.updateWorldMatrix(true, true);
    const inverse = builder.root.matrixWorld.clone().invert();
    for (const [index, item] of COVER_EQUIPMENT.entries()) {
      const collider = builder.root.getObjectByName(item.name) as THREE.Mesh;
      if (!collider) throw new Error(`Missing authored cover: ${item.name}`);
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, collider.matrixWorld);
      const bounds = new THREE.Box3();
      // A quarter turn exchanges the authored width/depth used to model the
      // cabinet, keeping its world footprint aligned with the unchanged cover.
      const sideways = Math.abs(item.yawDegrees) === 90;
      const [w, h, d] = sideways
        ? [item.size[2], item.size[1], item.size[0]] : item.size;
      const orientation = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(item.yawDegrees));
      const bottom = -h / 2;
      let panelIndex = 0;
      const add = (role: Finish, geometry: THREE.BufferGeometry, position: Triple, rotation?: Triple) => {
        let g = geometry;
        if (g.index) { g = geometry.toNonIndexed(); geometry.dispose(); }
        if (role !== 'display') {
          const variant = (index * 3 + panelIndex++ + Math.round((position[0] / w + .5) * 3)) % 4;
          const uv = g.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) uv.setXY(i,
            (THREE.MathUtils.clamp(uv.getX(i), 0, 1) * .984 + .008 + variant % 2) / 2,
            (THREE.MathUtils.clamp(uv.getY(i), 0, 1) * .984 + .008 + Math.floor(variant / 2)) / 2);
        }
        if (rotation) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
        g.translate(...position);
        g.applyMatrix4(orientation);
        g.computeBoundingBox(); bounds.union(g.boundingBox!);
        g.applyMatrix4(transform);
        const bucket = this.parts.get(role) ?? [];
        bucket.push(g); this.parts.set(role, bucket);
      };
      const box = (role: Finish, size: Triple, position: Triple, radius = 0.055, rotation?: Triple) => {
        const geometry = radius > 0 ? new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(v => v / 3))) : new THREE.BoxGeometry(...size);
        add(role, geometry, position, rotation);
      };
      const drum = (role: Finish, radius: number, length: number, position: Triple, front = false) => {
        add(role, new THREE.CylinderGeometry(radius, radius, length, 16), position, front ? [Math.PI / 2, 0, 0] : undefined);
      };
      const handle = (x: number, y: number, z: number, length = 0.55) => {
        box('dark', [0.12, length + 0.12, 0.06], [x, y, z], 0.02);
        box('metal', [0.085, length, 0.14], [x, y, z - 0.065], 0.025);
      };
      const grille = (x: number, y: number, z: number, width: number, rows: number) => {
        box('dark', [width + 0.1, rows * 0.13 + 0.08, 0.06], [x, y, z], 0.025);
        for (let row = 0; row < rows; row++) box('metal', [width, 0.045, 0.08], [x, y + (row - (rows - 1) / 2) * 0.13, z - 0.045], 0);
      };
      const screen = (x: number, y: number, z: number, width: number, height: number) => {
        box('dark', [width + 0.1, height + 0.1, 0.12], [x, y, z], 0.05);
        box('display', [width, height, 0.045], [x, y, z - 0.08], 0.015);
        for (let row = 0; row < 3; row++) box('teal', [width * (0.7 - row * 0.12), 0.035, 0.018], [x - width * row * 0.06, y + height * 0.25 - row * 0.12, z - 0.11], 0);
      };
      const door = (role: Finish, x: number, y: number, width: number, height: number, z = -d / 2) => {
        box('dark', [width, height, 0.09], [x, y, z - 0.025]);
        box(role, [width - 0.09, height - 0.09, 0.12], [x, y, z - 0.085], 0.065);
      };

      // Closed machinery cores preserve the visual blocking mass. Rounded edges,
      // shallow seams and top modules vary the outline without suggesting passages.
      const coreRole: Finish = index === 0 ? 'teal' : index === 6 ? 'dark' : index === 2 || index === 7 ? 'metal' : 'shell';
      box(coreRole, [w - 0.06, h * 0.92, d - 0.06], [0, bottom + h * 0.46 + 0.08, 0], index === 5 ? 0.22 : 0.1);
      box('dark', [w + 0.04, 0.26, d + 0.04], [0, bottom + 0.13, 0], 0.045);
      const front = -d / 2 - 0.04;

      switch (index) {
        case 0: // Broad three-chamber sanitation bank, piped teal crown.
          for (const offset of [-0.32, 0, 0.32]) {
            const x = w * offset;
            door('shell', x, 0, w * 0.29, h * 0.78);
            drum('metal', 0.48, 0.13, [x, h * 0.17, front - 0.15], true);
            drum('display', 0.37, 0.15, [x, h * 0.17, front - 0.18], true);
            handle(x + w * 0.09, -h * 0.17, front - 0.13, 0.65);
            box('teal', [w * 0.24, 0.32, d * 0.8], [x, h / 2 + 0.06, 0]);
          }
          box('metal', [w * 0.92, 0.12, 0.2], [0, h / 2 + 0.27, 0]);
          break;
        case 1: // Wide insulated freezer, twin doors and offset compressor roof.
          for (const side of [-1, 1]) {
            door('shell', side * w * 0.24, -0.02, w * 0.46, h * 0.83);
            handle(side * 0.18, 0, front - 0.13, h * 0.5);
            box('teal', [w * 0.42, 0.14, 0.06], [side * w * 0.24, h * 0.31, front - 0.16]);
          }
          box('metal', [w * 0.4, 0.38, d * 0.65], [w * 0.25, h / 2 + 0.06, d * 0.05]);
          grille(w * 0.25, h / 2 + 0.08, -d * 0.29, w * 0.32, 2);
          break;
        case 2: // Chemical cabinet with yellow raised vent crown and spill plinth.
          box('yellow', [w + 0.1, 0.34, d + 0.1], [0, bottom + 0.2, 0]);
          for (const side of [-1, 1]) {
            door('metal', side * w * 0.235, 0.03, w * 0.45, h * 0.76);
            handle(side * 0.15, -0.1, front - 0.13);
            box('yellow', [0.42, 0.42, 0.035], [side * w * 0.24, h * 0.2, front - 0.18], 0.015, [0, 0, Math.PI / 4]);
            box('dark', [0.055, 0.2, 0.04], [side * w * 0.24, h * 0.2, front - 0.21], 0);
          }
          box('yellow', [w * 0.84, 0.35, d * 0.7], [0, h / 2 + 0.04, 0]);
          grille(0, h / 2 + 0.05, -d * 0.36, w * 0.73, 2);
          break;
        case 3: // Stepped analytical console with tilted screen and tall side module.
          box('dark', [w * 0.58, h * 0.52, 0.38], [-w * 0.18, h * 0.1, front + 0.06], 0.09);
          screen(-w * 0.18, h * 0.14, front - 0.15, w * 0.46, h * 0.3);
          box('metal', [w * 0.57, 0.15, 0.36], [-w * 0.18, -h * 0.15, front - 0.14], 0.04, [-0.18, 0, 0]);
          box('dark', [w * 0.31, h + 0.26, d * 0.82], [w * 0.32, 0.1, 0], 0.12);
          drum('metal', 0.46, 0.14, [w * 0.32, h * 0.16, front - 0.06], true);
          drum('display', 0.34, 0.17, [w * 0.32, h * 0.16, front - 0.1], true);
          grille(w * 0.32, -h * 0.2, front - 0.03, w * 0.21, 4);
          break;
        case 4: // Drawer archive with a teal spine and offset top extraction module.
          for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
            const x = side * w * 0.235, y = bottom + 0.65 + row * h * 0.205;
            door('shell', x, y, w * 0.44, h * 0.18);
            box('metal', [w * 0.19, 0.08, 0.15], [x, y, front - 0.16], 0.025);
            box('teal', [0.16, 0.08, 0.035], [x - w * 0.14, y + h * 0.045, front - 0.16], 0);
          }
          box('teal', [0.15, h, d - .2], [0, 0.02, 0]);
          box('teal', [w * 0.35, 0.42, d * 0.7], [-w * 0.27, h / 2 + 0.09, 0]);
          break;
        case 5: // Rounded process housing with actual circular lid and motor tower.
          drum('metal', h * 0.36, 0.25, [-w * 0.13, 0.06, front - 0.06], true);
          drum('shell', h * 0.3, 0.29, [-w * 0.13, 0.06, front - 0.1], true);
          box('metal', [0.8, 0.11, 0.15], [-w * 0.13, 0.06, front - 0.29]);
          drum('teal', Math.min(w, d) * 0.3, 0.38, [-w * 0.1, h / 2 + 0.08, 0]);
          box('metal', [w * 0.24, h * 0.84, d * 0.8], [w * 0.36, 0.05, 0], 0.15);
          screen(w * 0.36, h * 0.19, front - 0.02, w * 0.17, 0.4);
          grille(w * 0.36, -h * 0.17, front - 0.02, w * 0.17, 5);
          break;
        case 6: // Charcoal rack: three full-depth bays, stepped cooling towers.
          for (let col = 0; col < 3; col++) {
            const x = (col - 1) * w * 0.315;
            box('metal', [0.08, h * 0.96, d], [x - w * 0.15, 0, 0]);
            box('dark', [w * 0.29, 0.25 + col * 0.12, d * 0.84], [x, h / 2 + col * 0.06, 0]);
            for (let row = 0; row < 5; row++) {
              const y = bottom + 0.62 + row * h * 0.165;
              grille(x, y, front, w * 0.24, 3);
              box('teal', [0.06, 0.06, 0.04], [x + w * 0.11, y, front - 0.09], 0);
            }
          }
          break;
        case 7: // Armoured containment locker with raised cap and external lock bars.
          door('teal', 0, 0, w * 0.81, h * 0.81);
          for (const side of [-1, 1]) {
            box('dark', [0.3, h + 0.14, d + 0.1], [side * (w / 2 - 0.13), 0.03, 0], 0.085);
            box('yellow', [w * 0.78, 0.13, 0.12], [0, side * h * 0.31, front - 0.14]);
          }
          drum('metal', 0.52, 0.18, [0, 0, front - 0.14], true);
          box('dark', [0.9, 0.1, 0.14], [0, 0, front - 0.27]);
          box('metal', [w * 0.8, 0.42, d * 0.84], [0, h / 2 + 0.05, 0], 0.18);
          break;
      }
      // Actual rear hatch and side service panel on every solid housing.
      box('metal', [w * 0.7, h * 0.6, 0.075], [0, -h * 0.03, d / 2 + 0.015]);
      for (const side of [-1, 1]) {
        box(index === 6 ? 'dark' : 'metal', [0.075, h * 0.56, d * 0.68], [side * (w / 2 + 0.005), -h * 0.02, 0]);
        for (let row = 0; row < 5; row++) box('dark', [0.085, 0.035, d * 0.48], [side * (w / 2 + 0.05), h * 0.1 - row * 0.12, 0], 0);
      }
      this.propBounds.set(item.name, bounds);
    }
    for (const [role, geometries] of this.parts) {
      const merged = mergeGeometries(geometries);
      geometries.forEach(geometry => geometry.dispose());
      if (!merged) throw new Error(`Unable to batch cover prop finish: ${role}`);
      this.triangleCount += merged.getAttribute('position').count / 3;
      const mesh = new THREE.Mesh(merged, this.finishes[role]);
      mesh.name = `cover-props-${role}-batch`;
      mesh.userData.presentationOnly = true;
      this.root.add(mesh);
    }
    this.parts.clear();
    builder.root.add(this.root);
  }

  get diagnostics() {
    return { propCount: this.propBounds.size, drawCalls: this.root.children.length, triangles: this.triangleCount, newTextures: this.textures.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.root.clear();
    Object.values(this.finishes).forEach(material => material.dispose());
    this.material.dispose();
    this.textures.forEach(texture => texture.dispose());
  }
}
