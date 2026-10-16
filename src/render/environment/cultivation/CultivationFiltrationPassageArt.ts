import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoLabPassageGreybox } from '../../../levels/LevelTwoLabPassageGreybox.ts';
import type { LevelTwoAirDuctGreybox } from '../../../levels/LevelTwoAirDuctGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import type { CultivationContaminationArt } from './CultivationContaminationArt.ts';
import { createCultivationFacilityLettering } from './CultivationFacilityLettering.ts';

type Triple = readonly [number, number, number];
type Material = THREE.MeshStandardMaterial;

/** Room 2–3's filtration/service approach and companion duct. All maps are borrowed. */
export class CultivationFiltrationPassageArt {
  readonly root = new THREE.Group();
  readonly ductRoot = new THREE.Group();
  readonly fan: THREE.Mesh;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials: Material[] = [];
  private readonly originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private readonly lights: { light: THREE.PointLight; colour: THREE.Color; position: THREE.Vector3; intensity: number; distance: number }[] = [];
  private readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  private readonly parts = new Map<Material, THREE.BufferGeometry[]>();
  private passageBatches = 0;
  private ductBatches = 0;
  private triangles = 0;
  private disposed = false;

  constructor(passage: LevelTwoLabPassageGreybox, duct: LevelTwoAirDuctGreybox,
    lab: CultivationLabMaterials, contamination: CultivationContaminationArt) {
    this.root.name = 'cultivation-filtration-passage-art';
    this.ductRoot.name = 'cultivation-filtration-duct-art';
    this.root.userData.presentationOnly = this.ductRoot.userData.presentationOnly = true;
    const wall = contamination.finishes.wall, metal = contamination.finishes.metal;
    const dark = this.finish(lab.metal, 'rubber-and-shadowed-services', 0x242c29, .94);
    const iron = this.finish(lab.pole, 'oxidized-brackets', 0x96886a, .94);
    const dust = this.finish(wall, 'dry-filter-deposits', 0x77765a, .98);
    const paint = this.finish(metal, 'worn-ivory-markings', 0xc1bdab, .92);
    const amber = this.finish(lab.fixture, 'caged-amber-lamp', 0xc49d65, .72);
    amber.emissive.setHex(0xd7a164); amber.emissiveIntensity = .7;

    // The complete original wall colliders remain registered and visible to
    // physics/camera queries. Only their drawing is replaced by sealed niches.
    for (const mesh of passage.collisionMeshes) {
      if (mesh.name.endsWith('-east-wall') || mesh.name.endsWith('-west-wall')) this.replaceMaterial(mesh, this.hidden);
    }
    this.opening(1, 6.8, 17.2, 1.25, 4.8, wall, metal, dark);
    this.opening(-1, 17, 23.4, 1.05, 4.65, wall, metal, dark);
    this.fan = this.filters(wall, metal, dark, iron, dust, paint);
    this.serviceBay(metal, dark, iron, paint, amber);
    this.cableTray(metal, dark, iron);
    this.signs(metal, dark, paint);
    for (const [side, z, top, length] of [[1, 8.5, 1.1, .72], [1, 16.4, 1.1, .62], [-1, 18.4, .95, .55], [-1, 22.7, 4.95, .9]] as const) {
      this.deposit(dust, side, z, top, length, .2);
    }
    this.passageBatches = this.batch(this.root, wall);
    passage.root.add(this.root);

    this.ductDetails(metal, dark, dust);
    this.ductBatches = this.batch(this.ductRoot);
    duct.root.add(this.ductRoot);
    // Use the existing three emitters and point pools inside the upper duct.
    for (let i = 1; i <= 3; i++) {
      const fixture = duct.root.getObjectByName(`${duct.root.name}-ceiling-light-${i}`) as THREE.Mesh;
      this.replaceMaterial(fixture, lab.fixture);
      const light = duct.root.getObjectByName(`${duct.root.name}-received-light-${i}`) as THREE.PointLight;
      this.relight(light, [light.position.x, light.position.y, light.position.z], 0xc5d0c8, 6, 8);
    }
    this.relight(passage.root.getObjectByName(`${passage.root.name}-light-1`) as THREE.PointLight, [2.5, 4.9, 11.5], 0xcbd5d2, 23, 14);
    this.relight(passage.root.getObjectByName(`${passage.root.name}-light-2`) as THREE.PointLight, [-2.8, 4.55, 17.95], 0xd5ae78, 14, 12);
  }

  private opening(side: -1 | 1, start: number, end: number, low: number, high: number,
    wall: Material, metal: Material, dark: Material): void {
    const x = side * 3.5, centre = (start + end) / 2;
    this.box(wall, [.3, 6.485, start], [x, 3.2575, start / 2]);
    this.box(wall, [.3, 6.485, 28 - end], [x, 3.2575, (28 + end) / 2]);
    this.box(wall, [.3, low - .015, end - start], [x, (low + .015) / 2, centre]);
    this.box(wall, [.3, 6.5 - high, end - start], [x, (6.5 + high) / 2, centre]);
    this.box(dark, [.12, high - low, end - start], [side * 4.72, (low + high) / 2, centre]);
    for (const z of [start, end]) this.box(metal, [1.32, high - low, .1], [side * 4.01, (low + high) / 2, z]);
    for (const y of [low, high]) this.box(metal, [1.32, .1, end - start], [side * 4.01, y, centre]);
    for (const z of [start - .06, end + .06]) this.box(metal, [.16, high - low + .28, .15], [side * 3.38, (low + high) / 2, z]);
    for (const y of [low - .08, high + .08]) this.box(metal, [.18, .13, end - start + .28], [side * 3.38, y, centre]);
    // Quiet rails continue around the equipment instead of crossing its face.
    this.box(metal, [.055, .28, 26.8], [side * 3.31, .55, 14]);
    for (const [from, to] of [[.6, start - .26], [end + .26, 27.4]]) this.box(metal,
      [.045, .26, to - from], [side * 3.31, 4, (from + to) / 2]);
    for (const z of [2, 25.8]) this.box(metal, [.055, 6, .12], [side * 3.31, 3.25, z]);
  }

  private filters(wall: Material, metal: Material, dark: Material, iron: Material, dust: Material, paint: Material): THREE.Mesh {
    for (const [index, z] of [8.55, 12, 15.45].entries()) {
      for (const dz of [-1.49, 1.49]) this.box(iron, [.34, 3.1, .085], [3.63, 3.05, z + dz]);
      for (const y of [1.5, 4.6]) this.box(wall, [.36, .12, 3], [3.64, y, z]);
      for (const y of [1.65, 4.45]) for (const dz of [-1.49, 1.49]) this.add(iron,
        new THREE.CylinderGeometry(.045, .045, .026, 6).rotateZ(Math.PI / 2).translate(3.43, y, z + dz));
      if (index !== 1) {
        // Pleats give the filter actual relief; the crossed guard remains open
        // opaque geometry, with no alpha layers or extra texture samples.
        for (let i = 0; i < 19; i++) this.add(wall,
          new THREE.BoxGeometry(.09, 2.86, .16).rotateY(i % 2 ? .32 : -.32).translate(3.89, 3.05, z - 1.38 + i * .153));
      } else {
        this.add(dark, new THREE.CylinderGeometry(1.19, 1.19, .3, 24, 1, true).rotateZ(Math.PI / 2).translate(4.02, 3.05, z));
        this.add(iron, new THREE.TorusGeometry(1.2, .055, 5, 24).rotateY(Math.PI / 2).translate(3.82, 3.05, z));
        // A pulled cartridge is retained inside its recess above the fan.
        this.add(wall, new THREE.BoxGeometry(.12, .22, 2.8).rotateY(.045).translate(3.77, 4.4, z));
      }
      for (let i = 0; i < 10; i++) this.box(metal, [.028, .022, 2.84], [3.49, 1.72 + i * .295, z]);
      for (let i = 0; i < 9; i++) this.box(metal, [.028, 2.83, .018], [3.465, 3.05, z - 1.28 + i * .32]);
      // Uneven matting gathers at the bottom and one corner of each intake.
      for (let i = 0; i < 5; i++) {
        const shape = new THREE.Shape();
        shape.moveTo(-.38, 0); shape.lineTo(-.32, .1); shape.lineTo(-.22, .06);
        shape.lineTo(-.11, .25 + (i + index) % 3 * .08); shape.lineTo(.03, .14);
        shape.lineTo(.18, .19); shape.lineTo(.34, .02); shape.lineTo(.38, 0); shape.closePath();
        this.add(dust, new THREE.ShapeGeometry(shape).rotateY(-Math.PI / 2)
          .translate(3.515, 1.63 + (i % 2) * .15, z - 1.08 + i * .53));
      }
    }
    this.box(dark, [.08, .46, 3.4], [3.34, 5.28, 12]);
    this.add(paint, createCultivationFacilityLettering('FILTER 02', .23, [3.29, 5.16, 11.23], -Math.PI / 2));

    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const shape = new THREE.Shape([new THREE.Vector2(.16, -.035), new THREE.Vector2(.98, -.16),
        new THREE.Vector2(1.04, .02), new THREE.Vector2(.38, .21), new THREE.Vector2(.16, .04)]);
      blades.push(new THREE.ShapeGeometry(shape).rotateY(-Math.PI / 2).translate(-.025, 0, 0).rotateX(i * Math.PI * 2 / 5));
    }
    blades.push(new THREE.CylinderGeometry(.22, .22, .22, 12).rotateZ(Math.PI / 2));
    const geometry = mergeGeometries(blades, false)!;
    blades.forEach(blade => blade.dispose());
    const fan = new THREE.Mesh(geometry, metal);
    fan.name = 'cultivation-filtration-slow-fan'; fan.position.set(4.02, 3.05, 12);
    fan.userData.presentationOnly = true; fan.userData.shadowProxyReceiver = true;
    this.geometries.add(geometry); this.triangles += geometry.index!.count / 3;
    this.root.add(fan);
    return fan;
  }

  private serviceBay(metal: Material, dark: Material, iron: Material, paint: Material, amber: Material): void {
    // Empty twin-rotor cradle: back rail, mounting shoes and charging contacts.
    // Every arm and cable stays behind the original wall's blocking plane.
    for (const z of [18, 22.35]) this.box(metal, [.12, 2.9, .22], [-4.28, 2.95, z]);
    for (const y of [1.65, 3.95]) this.box(iron, [.2, .16, 4.5], [-4.17, y, 20.2]);
    for (const z of [18.8, 21.6]) {
      this.tube(iron, [[-4.25, 2.05, z], [-4.05, 2.07, z], [-3.7, 2.25, z], [-3.58, 2.65, z]], .07);
      this.add(metal, new THREE.TorusGeometry(.36, .07, 5, 16, Math.PI).rotateY(Math.PI / 2).translate(-3.62, 2.68, z));
      this.box(dark, [.24, .18, .48], [-3.8, 2.0, z]);
    }
    for (const z of [19.7, 20.05, 20.4]) this.add(iron,
      new THREE.CylinderGeometry(.065, .065, .12, 8).rotateZ(Math.PI / 2).translate(-3.74, 3.55, z));
    this.box(metal, [.12, .6, 1.6], [-3.94, 3.52, 20.05]);
    for (let i = 0; i < 3; i++) this.tube(dark, [
      [-3.85, 3.75, 21.1 + i * .23], [-3.66, 3.25, 21.2 + i * .24],
      [-3.59, 2.3, 21.05 + i * .31], [-3.72, 1.45 + i * .15, 21.4 + i * .2],
    ], .022);
    for (let i = 0; i < 5; i++) this.box(paint, [.012, .05, .11], [-4.055, 2.8 + i * .18, 18.12]);
    this.box(dark, [.08, .46, 3.5], [-3.34, 5.25, 20.2]);
    this.add(paint, createCultivationFacilityLettering('DRONE SERVICE', .22, [-3.29, 5.14, 21.2], Math.PI / 2));
    const lampZ = 17.95;
    this.box(metal, [.18, .75, .65], [-3.38, 4.91, lampZ]);
    this.box(amber, [.07, .48, .39], [-3.24, 4.91, lampZ]);
    for (const z of [lampZ - .22, lampZ, lampZ + .22]) this.box(metal, [.045, .57, .025], [-3.18, 4.91, z]);
    for (const y of [4.62, 5.2]) this.box(iron, [.16, .05, .52], [-3.23, y, lampZ]);
  }

  private cableTray(metal: Material, dark: Material, iron: Material): void {
    for (const x of [-.85, .85]) this.box(metal, [.075, .16, 24.4], [x, 5.97, 14]);
    for (let i = 0; i < 20; i++) this.box(metal, [1.62, .055, .055], [0, 5.91, 2.2 + i * 1.25]);
    for (let i = 0; i < 4; i++) {
      const points: Triple[] = [];
      for (let j = 0; j < 8; j++) points.push([-.52 + i * .34 + Math.sin(j + i) * .035,
        6.01 + i % 2 * .065, 2 + j * 3.43]);
      this.tube(i === 3 ? iron : dark, points, .038 + i % 2 * .012);
    }
    for (const z of [4.2, 12.8, 21.5]) for (const x of [-.85, .85]) {
      this.box(iron, [.075, .25, .09], [x, 6.175, z]);
    }
    this.tube(dark, [[.76, 5.94, 14], [.96, 5.56, 15.2], [.91, 5.42, 16.8], [.78, 5.96, 18.1]], .028);
  }

  private signs(metal: Material, dark: Material, paint: Material): void {
    this.box(metal, [5.9, .8, .08], [0, 5.35, 27.23]);
    this.box(dark, [5.5, .55, .015], [0, 5.35, 27.178]);
    this.add(paint, createCultivationFacilityLettering('03 RESTRICTED ACCESS', .29, [2.07, 5.2, 27.163], Math.PI));
    for (const x of [-2.65, 2.65]) this.box(metal, [.2, 2.6, .03], [x, 2.8, 27.29]);
  }

  private ductDetails(metal: Material, dark: Material, dust: Material): void {
    for (const [side, z] of [[1, 9.5], [-1, 22]] as const) {
      this.box(dark, [.014, .8, 1.65], [side * .982, 1.15, z]);
      for (const y of [.72, 1.58]) this.box(metal, [.02, .045, 1.75], [side * .964, y, z]);
      for (const dz of [-.87, .87]) this.box(metal, [.02, .9, .045], [side * .964, 1.15, z + dz]);
      for (let i = 0; i < 6; i++) this.box(metal, [.025, .024, 1.58], [side * .953, .81 + i * .13, z]);
      this.box(dust, [.008, .14, 1.5], [side * .968, .86, z]);
    }
    for (const z of [5, 11.5, 18, 24]) for (const side of [-1, 1]) {
      this.box(metal, [.018, 1.8, .035], [side * .982, 1, z]);
      for (const y of [.32, 1.72]) this.add(metal,
        new THREE.CylinderGeometry(.024, .024, .012, 6).rotateZ(Math.PI / 2).translate(side * .966, y, z));
    }
  }

  private deposit(material: Material, side: -1 | 1, z: number, top: number, length: number, width: number): void {
    const shape = new THREE.Shape([new THREE.Vector2(-width, 0), new THREE.Vector2(width, 0),
      new THREE.Vector2(width * .4, -length * .4), new THREE.Vector2(width * .32, -length * .7),
      new THREE.Vector2(0, -length), new THREE.Vector2(-width * .17, -length * .62)]);
    this.add(material, new THREE.ShapeGeometry(shape).rotateY(-side * Math.PI / 2).translate(side * 3.337, top, z));
  }

  private finish(source: Material, name: string, colour: number, roughness: number): Material {
    const material = source.clone(); material.name = `cultivation-filtration-${name}`;
    material.color.setHex(colour); material.roughness = roughness;
    material.onBeforeCompile = (shader, renderer) => source.onBeforeCompile(shader, renderer);
    material.customProgramCacheKey = () => source.customProgramCacheKey();
    this.materials.push(material); return material;
  }

  private box(material: Material, size: Triple, position: Triple): void {
    this.add(material, new THREE.BoxGeometry(...size).translate(...position));
  }

  private tube(material: Material, points: readonly Triple[], radius: number): void {
    this.add(material, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), points.length * 3, radius, 5, false));
  }

  private add(material: Material, geometry: THREE.BufferGeometry): void {
    const pieces = this.parts.get(material) ?? []; pieces.push(geometry); this.parts.set(material, pieces);
  }

  private batch(parent: THREE.Group, shell?: Material): number {
    for (const [material, pieces] of this.parts) {
      const tile = material.userData.tileSizeMetres ?? [2, 2];
      for (const piece of pieces) {
        const uv = piece.getAttribute('uv');
        if (piece instanceof THREE.BoxGeometry) {
          const p = piece.getAttribute('position'), n = piece.getAttribute('normal');
          for (let i = 0; i < uv.count; i++) uv.setXY(i,
            (Math.abs(n.getX(i)) > .5 ? -n.getX(i) * p.getZ(i) : Math.abs(n.getY(i)) > .5 ? p.getX(i) : n.getZ(i) * p.getX(i)) / tile[0],
            (Math.abs(n.getY(i)) > .5 ? -n.getY(i) * p.getZ(i) : p.getY(i)) / tile[1]);
        } else if (piece instanceof THREE.TubeGeometry) {
          const length = piece.parameters.path.getLength();
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length / tile[1], uv.getY(i) * Math.PI * 2 * piece.parameters.radius / tile[0]);
        }
      }
      const geometry = mergeGeometries(pieces, false);
      pieces.forEach(piece => piece.dispose());
      if (!geometry) throw new Error('Cannot merge Cultivation filtration art.');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${parent.name}-${material.name}-batch`;
      mesh.userData.presentationOnly = true;
      // Only the broad shell casts; fine guards/cables receive existing shadows.
      mesh.userData.shadowProxyReceiver = material !== shell;
      this.geometries.add(geometry); this.triangles += geometry.index!.count / 3;
      parent.add(mesh);
    }
    const count = this.parts.size; this.parts.clear(); return count;
  }

  private replaceMaterial(mesh: THREE.Mesh, material: THREE.Material): void {
    this.originals.push({ mesh, material: mesh.material }); mesh.material = material;
  }

  private relight(light: THREE.PointLight, position: Triple, colour: number, intensity: number, distance: number): void {
    this.lights.push({ light, colour: light.color.clone(), position: light.position.clone(), intensity: light.intensity, distance: light.distance });
    light.position.set(...position); light.color.setHex(colour); light.intensity = intensity; light.distance = distance;
  }

  update(deltaSeconds: number): void {
    if (this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !this.root.visible ||
      this.root.parent?.visible === false || this.root.parent?.parent?.visible === false) return;
    this.fan.rotation.x = (this.fan.rotation.x + Math.min(deltaSeconds, .1) * .24) % (Math.PI * 2);
  }

  reset(): void { this.fan.rotation.x = 0; }

  get diagnostics() {
    return { passageBatches: this.passageBatches, ductBatches: this.ductBatches, movingMeshes: 1,
      triangles: this.triangles, newTextures: 0, additionalLights: 0 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent(); this.ductRoot.removeFromParent(); this.root.clear(); this.ductRoot.clear();
    for (const { mesh, material } of this.originals) mesh.material = material;
    for (const state of this.lights) {
      state.light.color.copy(state.colour); state.light.position.copy(state.position);
      state.light.intensity = state.intensity; state.light.distance = state.distance;
    }
    // Cleanup owns replacement/proxy geometry; retain our original allocations.
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.hidden.dispose();
  }
}
