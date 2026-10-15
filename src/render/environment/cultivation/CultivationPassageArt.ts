import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoLabPassageGreybox } from '../../../levels/LevelTwoLabPassageGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import type { CultivationContaminationArt } from './CultivationContaminationArt.ts';
import { createCultivationFacilityLettering } from './CultivationFacilityLettering.ts';

type Point = readonly [number, number, number];

/** Room 1–2's worn observation/decontamination passage. Borrows all texture maps. */
export class CultivationPassageArt {
  readonly root = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials: THREE.Material[] = [];
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  private readonly wall: THREE.Mesh;
  private readonly wallMaterial: THREE.Material | THREE.Material[];
  private readonly lights: { light: THREE.PointLight; position: THREE.Vector3; colour: THREE.Color; intensity: number; distance: number }[] = [];
  private disposed = false;

  constructor(passage: LevelTwoLabPassageGreybox, lab: CultivationLabMaterials, contamination: CultivationContaminationArt) {
    this.root.name = 'cultivation-observation-passage-art';
    this.root.userData.presentationOnly = true;
    this.wall = passage.builder.collisionMeshes.find(mesh => mesh.name.endsWith('-east-wall'))!;
    this.wallMaterial = this.wall.material;
    // Only the wall's rendering is replaced. Its solid, unmodified collider
    // continues to seal the recess; it is never a new route or landing.
    this.wall.material = this.hidden;

    const metal = contamination.finishes.metal;
    const dark = this.finish(lab.metal, 'rubber-and-service-recess', 0x272c29, .94);
    const iron = this.finish(lab.pole, 'corroded-pipes', 0x9b8b6a, .93);
    const tank = this.finish(lab.duct, 'clouded-culture-cartridges', 0x737c69, .57, .035);
    const growth = this.finish(lab.metal, 'desiccated-culture-roots', 0x57543c, .98);
    const paint = this.finish(contamination.finishes.metal, 'abraded-ivory-markings', 0xc4beaa, .9);
    const amber = this.finish(lab.fixture, 'aged-amber-work-light', 0xc39a59, .7, .65);
    amber.emissive.setHex(0xdca35c);
    const lamp = this.finish(lab.fixture, 'observation-fluorescent', 0xc2c8b6, .65, .28);
    const residue = this.finish(contamination.finishes.wall, 'dried-seal-runoff', 0x817960, .98);
    const damp = this.finish(contamination.finishes.wall, 'old-leak-cores', 0x545747, .95);

    this.observation(contamination, metal, dark, iron, tank, growth, paint, lamp);
    this.services(metal, dark, iron, paint, amber);
    this.decontamination(metal, dark, iron, paint, lamp);
    // Local leak sources complement the shared, metre-scaled panel weathering.
    // Keep the dark trails attached to seals and fittings, away from the route.
    for (const [i, z] of [8.05, 10.8, 14.25, 16.8].entries()) {
      this.runoff(residue, 1, z, 1.04, .62 + i % 2 * .17, .22 + i * .035, i);
      this.runoff(damp, 1, z + .03, 1.035, .42 + i % 2 * .15, .055, i + 4, .014);
    }
    for (const [i, z] of [8.3, 12.5, 20.4].entries()) {
      this.runoff(residue, -1, z, 5.65, 1.9 + i * .2, .28, i + 7);
      this.runoff(damp, -1, z + .025, 5.65, 1.5 + i * .22, .07, i + 10, .014);
    }
    this.batch();
    passage.root.add(this.root);

    // Reuse the two original passage pools. No extra light/shadow slots or
    // per-frame lighting work are introduced into the Cultivation layout.
    for (const [index, at, colour, intensity, distance] of [
      [1, [2.8, 4.3, 12], 0xd0d7c9, 24, 13],
      [2, [-3.05, 4.15, 18.7], 0xd7aa70, 19, 13],
    ] as const) {
      const light = passage.root.getObjectByName(`${passage.root.name}-light-${index}`) as THREE.PointLight;
      this.lights.push({ light, position: light.position.clone(), colour: light.color.clone(), intensity: light.intensity, distance: light.distance });
      light.position.set(at[0], at[1], at[2]); light.color.setHex(colour); light.intensity = intensity; light.distance = distance;
    }
  }

  private observation(c: CultivationContaminationArt, metal: THREE.Material, dark: THREE.Material,
    iron: THREE.Material, tank: THREE.Material, growth: THREE.Material, paint: THREE.Material, lamp: THREE.Material): void {
    // Positive X is the player's left when entering toward Room 2 (+Z).
    // The 1.8m-deep sealed niche lives outside the existing passage envelope.
    const front = 3.85, low = 1.2, high = 4.65, start = 7.6, end = 17.2;
    const centre = (start + end) / 2;
    this.box(c.finishes.wall, [.3, 6.485, start], [4, 3.2575, start / 2]);
    this.box(c.finishes.wall, [.3, 6.485, 28 - end], [4, 3.2575, (28 + end) / 2]);
    this.box(c.finishes.wall, [.3, low - .015, end - start], [4, (low + .015) / 2, centre]);
    this.box(c.finishes.wall, [.3, 6.5 - high, end - start], [4, (6.5 + high) / 2, centre]);
    this.box(dark, [.15, high - low, end - start], [5.75, (low + high) / 2, centre]);
    for (const z of [start, end]) this.box(metal, [1.8, high - low, .12], [4.75, (low + high) / 2, z]);
    for (const y of [low, high]) this.box(metal, [1.8, .12, end - start], [4.75, y, centre]);

    // Stepped surround and gasket; mullions divide the old glass into three
    // replaceable panes. Leave their edges visibly dark and mineral-stained.
    for (const z of [start - .08, start + 3.2, start + 6.4, end + .08]) {
      this.box(metal, [.22, high - low + .36, .14], [front - .065, (low + high) / 2, z]);
      for (const y of [low + .1, 2.9, high - .1]) {
        this.add(iron, new THREE.CylinderGeometry(.045, .045, .025, 8).rotateZ(Math.PI / 2).translate(front - .19, y, z));
      }
    }
    for (const y of [low - .12, high + .12]) this.box(metal, [.28, .18, 9.9], [front - .065, y, centre]);
    this.box(dark, [.04, .07, 9.5], [front - .23, low + .01, centre]);
    for (let i = 0; i < 26; i++) this.box(dark, [.025, .055, .17], [front - .22, low - .12, start + .25 + i * .35]);

    for (let i = 0; i < 3; i++) {
      const z = start + 1.6 + i * 3.2;
      const height = i === 1 ? 2.55 : 2.85;
      this.add(tank, new THREE.CylinderGeometry(.58, .58, height, 24).translate(4.85, 2.9, z));
      for (const y of [2.9 - height / 2, 2.9 + height / 2]) {
        this.add(iron, new THREE.CylinderGeometry(.64, .64, .16, 24).translate(4.85, y, z));
      }
      for (const y of [2.08, 3.7]) this.add(metal,
        new THREE.TorusGeometry(.594, .035, 6, 24).rotateX(Math.PI / 2).translate(4.85, y, z));
      this.box(dark, [.065, 2.15, .14], [4.25, 2.9, z]);
      for (let j = 0; j < 7; j++) this.box(paint, [.014, .024, j % 2 ? .12 : .2], [4.206, 2.15 + j * .23, z + .18]);
      this.box(lamp, [.04, 2.4, .075], [5.1, 2.95, z - .82]);
      this.tube(iron, [[4.85, 4.35, z], [4.85, 4.55, z], [5.4, 4.57, z], [5.5, 4.1, z]], .065);
      for (let j = 0; j < 3; j++) {
        const points: Point[] = [];
        for (let k = 0; k <= 8; k++) points.push([4.22 + Math.sin(k * .7 + i) * .035,
          4.1 - k * (.26 + j * .03), z + (j - 1) * .2 + Math.sin(k * .9 + j + i) * .17]);
        this.tube(growth, points, .018 + j * .005);
        for (let k = 2; k < 7; k += 2) {
          const [x, y, zz] = points[k];
          this.tube(growth, [[x, y, zz], [x - .02, y - .13, zz + .22], [x, y - .38, zz + .3]], .012);
        }
      }
      const pane = new THREE.PlaneGeometry(3.02, high - low - .12);
      const uv = pane.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setXY(k,
        (.008 + uv.getX(k) * .984 + i % 2) / 2, (.008 + uv.getY(k) * .984 + Math.floor(i / 2)) / 2);
      pane.rotateY(-Math.PI / 2).translate(front - .07, (low + high) / 2, z);
      this.add(c.glass, pane);
    }
    this.box(dark, [.08, .52, 3.3], [front - .025, 5.25, centre]);
    this.label('CULTURE 02', .22, [front - .071, 5.14, centre - .82], -Math.PI / 2, paint);
    // Restore the quiet service rails outside the opening, rather than letting
    // the default wall trims run straight across the observation glass.
    for (const [z, length] of [[3.9, 6.4], [22.6, 9.4]]) for (const y of [.55, 4]) {
      this.box(metal, [.06, .32, length], [3.81, y, z]);
    }
  }

  private services(metal: THREE.Material, dark: THREE.Material, iron: THREE.Material,
    paint: THREE.Material, amber: THREE.Material): void {
    for (let i = 0; i < 3; i++) {
      const y = 4.85 + i * .33;
      this.tube(iron, [[-3.67, y, 3], [-3.67, y, 19.7], [-3.64, y + .12, 20.3],
        [-3.55, 5.95, 20.8 + i * .23], [-2.9, 6.12, 21.1 + i * .23], [-.6, 6.12, 21.1 + i * .23]], .075 + i * .012);
      for (const z of [4.2, 8.3, 12.5, 16.8]) {
        this.add(metal, new THREE.CylinderGeometry(.115 + i * .012, .115 + i * .012, .1, 12)
          .rotateX(Math.PI / 2).translate(-3.67, y, z));
      }
    }
    for (const z of [4.2, 8.3, 12.5, 16.8]) this.box(metal, [.12, 1.15, .12], [-3.79, 5.18, z]);

    this.box(metal, [.18, 2.65, 3.5], [-3.78, 2.9, 18.7]);
    this.box(dark, [.035, 2.39, 3.22], [-3.675, 2.9, 18.7]);
    for (const z of [17.18, 20.22]) this.box(iron, [.12, 2.42, .075], [-3.6, 2.9, z]);
    // Partly removed cover, retained hinges and cooling louvres.
    this.add(metal, new THREE.BoxGeometry(.08, 2.3, 1.25).rotateY(-.12).translate(-3.59, 2.88, 19.51));
    for (let j = 0; j < 6; j++) this.box(dark, [.025, .055, .72], [-3.465, 2.25 + j * .15, 19.5]);
    for (const y of [2.05, 3.7]) this.box(iron, [.16, .24, .12], [-3.61, y, 20.18]);
    for (const z of [17.65, 18.32]) {
      this.add(iron, new THREE.CylinderGeometry(.225, .225, .08, 24).rotateZ(Math.PI / 2).translate(-3.57, 3.5, z));
      this.add(paint, new THREE.CylinderGeometry(.177, .177, .012, 24).rotateZ(Math.PI / 2).translate(-3.52, 3.5, z));
      this.box(dark, [.02, .14, .018], [-3.502, 3.53, z - .035]);
      for (let i = 0; i < 5; i++) {
        const a = -.8 + i * .4;
        this.box(dark, [.018, .025, .018], [-3.501, 3.5 + Math.cos(a) * .135, z + Math.sin(a) * .135]);
      }
      this.tube(iron, [[-3.57, 3.25, z], [-3.57, 2.8, z], [-3.63, 2.5, z + .1], [-3.63, 1.75, z + .1]], .035);
    }
    for (let i = 0; i < 4; i++) {
      const z = 17.5 + i * .21;
      this.tube(dark, [[-3.61, 3.95, z], [-3.53, 3.75, z + .06], [-3.58, 3.05, z - .05], [-3.6, 2.15, z + .13]], .018);
    }
    this.box(metal, [.22, .8, .7], [-3.73, 4.33, 18.7]);
    this.box(amber, [.09, .48, .39], [-3.56, 4.33, 18.7]);
    for (const z of [18.48, 18.7, 18.92]) this.box(metal, [.065, .57, .028], [-3.49, 4.33, z]);
    for (const y of [4.04, 4.62]) this.box(iron, [.18, .055, .54], [-3.56, y, 18.7]);
    // Small low-level vent with clogged, uneven slats, flush to the wall.
    this.box(dark, [.08, .6, 2.7], [-3.77, 1.1, 9.4]);
    for (let i = 0; i < 5; i++) this.box(metal, [.12, .035, 2.5], [-3.69, .89 + i * .1, 9.4]);
  }

  private decontamination(metal: THREE.Material, dark: THREE.Material, iron: THREE.Material,
    paint: THREE.Material, lamp: THREE.Material): void {
    const z = 24.1;
    for (const x of [-3.84, 3.84]) {
      this.box(metal, [.16, 5.35, .65], [x, 2.88, z]);
      this.box(iron, [.19, .14, .73], [x, .37, z]);
      for (const y of [1.55, 3.65]) this.box(iron, [.2, .12, .68], [x, y, z]);
    }
    this.box(metal, [7.5, .58, .75], [0, 5.55, z]);
    this.box(dark, [6.8, .29, .03], [0, 5.55, z - .396]);
    this.label('DECON', .22, [.4, 5.44, z - .414], Math.PI, paint);
    for (const x of [-2.65, 0, 2.65]) {
      this.add(iron, new THREE.CylinderGeometry(.09, .055, .22, 12).translate(x, 5.16, z));
      this.add(dark, new THREE.CylinderGeometry(.036, .036, .012, 10).translate(x, 5.042, z));
    }
    for (const x of [-2.15, 2.15]) this.box(lamp, [.7, .035, .12], [x, 5.242, z - .16]);

    // Millimetres above the original floor, with real gaps into a dark tray.
    // The unchanged solid floor still supports both slime bodies throughout.
    this.box(dark, [6.7, .012, 1.8], [0, .212, z]);
    for (const x of [-3.4, 3.4]) this.box(iron, [.11, .045, 1.96], [x, .243, z]);
    for (const dz of [-.95, .95]) this.box(metal, [6.7, .045, .1], [0, .243, z + dz]);
    for (let i = 0; i < 42; i++) this.box(metal, [.055, .025, 1.75], [-3.27 + i * .16, .238, z]);
    for (const dz of [-.53, 0, .53]) this.box(iron, [6.6, .018, .034], [0, .223, z + dz]);

    // Facility typography and a restrained sector marker frame the destination.
    this.box(metal, [5.9, .8, .08], [0, 5.35, 27.23]);
    this.label('02 CULTIVATION', .32, [1.68, 5.19, 27.182], Math.PI, paint);
    for (const x of [-2.65, 2.65]) {
      this.box(iron, [.28, 2.8, .035], [x, 2.65, 27.292]);
      this.box(paint, [.16, .3, .012], [x, 4.28, 27.27]);
    }
  }

  private finish(source: THREE.MeshStandardMaterial, name: string, colour: number, roughness: number, emission = 0): THREE.MeshStandardMaterial {
    const material = source.clone();
    material.name = `cultivation-passage-${name}`;
    material.color.setHex(colour); material.roughness = roughness;
    material.emissive.setHex(colour); material.emissiveIntensity = emission;
    material.emissiveMap = emission > 0 ? source.map : source.emissiveMap;
    // clone() does not retain the source's weathering/light-evaluation hooks.
    material.onBeforeCompile = (shader, renderer) => source.onBeforeCompile(shader, renderer);
    // These copies change uniforms only; retain the shared shader cache entry.
    material.customProgramCacheKey = () => source.customProgramCacheKey();
    this.materials.push(material);
    return material;
  }

  private box(material: THREE.Material, size: Point, at: Point): void {
    this.add(material, new THREE.BoxGeometry(...size).translate(...at));
  }

  private tube(material: THREE.Material, points: readonly Point[], radius: number): void {
    this.add(material, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))),
      points.length * 5, radius, 6, false));
  }

  private runoff(material: THREE.Material, side: -1 | 1, z: number, top: number, length: number, width: number, seed: number, lift = .008): void {
    const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const spread = width * (1 - t * .88) * (.7 + .2 * Math.sin(i * 2.1 + seed));
      const drift = Math.sin(t * 5 + seed) * width * .13;
      left.push(new THREE.Vector2(drift - spread / 2, -t * length));
      right.push(new THREE.Vector2(drift + spread / 2, -t * length));
    }
    const geometry = new THREE.ShapeGeometry(new THREE.Shape([...left, ...right.reverse()]));
    // Two distinct offsets keep the narrow damp cores clear of their dry halo.
    geometry.rotateY(-side * Math.PI / 2).translate(side * (3.85 - lift), top, z);
    this.add(material, geometry);
  }

  private add(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const list = this.parts.get(material) ?? [];
    list.push(geometry); this.parts.set(material, list);
  }

  private batch(): void {
    for (const [material, pieces] of this.parts) {
      for (const piece of pieces) {
        const tile = material.userData.tileSizeMetres ?? [2, 2];
        const uv = piece.getAttribute('uv');
        // Keep corrosion at metre scale along long pipe runs and cartridges.
        // The observation panes retain their authored condensation atlas UVs.
        if (piece instanceof THREE.TubeGeometry) {
          const { path, radius } = piece.parameters;
          for (let i = 0; i < uv.count; i++) uv.setXY(i,
            uv.getX(i) * path.getLength() / tile[1], uv.getY(i) * Math.PI * 2 * radius / tile[0]);
        } else if (piece instanceof THREE.CylinderGeometry) {
          const { height, radiusTop, radiusBottom } = piece.parameters;
          for (let i = 0; i < uv.count; i++) uv.setXY(i,
            uv.getX(i) * Math.PI * (radiusTop + radiusBottom) / tile[0], uv.getY(i) * height / tile[1]);
        }
        if (!(piece instanceof THREE.BoxGeometry)) continue;
        const p = piece.getAttribute('position'), n = piece.getAttribute('normal');
        for (let i = 0; i < uv.count; i++) uv.setXY(i,
          (Math.abs(n.getX(i)) > .5 ? -n.getX(i) * p.getZ(i) : Math.abs(n.getY(i)) > .5 ? p.getX(i) : n.getZ(i) * p.getX(i)) / tile[0],
          (Math.abs(n.getY(i)) > .5 ? -n.getY(i) * p.getZ(i) : p.getY(i)) / tile[1]);
      }
      const geometry = mergeGeometries(pieces, false);
      for (const piece of pieces) piece.dispose();
      if (!geometry) throw new Error('Cannot merge Cultivation passage dressing.');
      this.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `cultivation-passage-${material.name}-batch`;
      mesh.userData.presentationOnly = true;
      this.root.add(mesh);
    }
    this.parts.clear();
  }

  /** Small painted vector letters use the facility's narrow, geometric style. */
  private label(text: string, height: number, at: Point, yaw: number, material: THREE.Material): void {
    this.add(material, createCultivationFacilityLettering(text, height, at, yaw));
  }

  get diagnostics() { return { batches: this.geometries.size, newTextures: 0, additionalLights: 0 }; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent(); this.root.clear();
    this.wall.material = this.wallMaterial;
    for (const state of this.lights) {
      state.light.position.copy(state.position); state.light.color.copy(state.colour);
      state.light.intensity = state.intensity; state.light.distance = state.distance;
    }
    // Keep allocation ownership independent of cleanup's replacement geometry.
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.hidden.dispose();
  }
}
