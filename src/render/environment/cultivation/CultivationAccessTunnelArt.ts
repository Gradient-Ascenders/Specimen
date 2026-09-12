import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import type { CultivationContaminationArt } from './CultivationContaminationArt.ts';

/** The low access ducts and fork only; all hazard and climbing bounds stay authored. */
export class CultivationAccessTunnelArt {
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly root = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly wall: THREE.MeshStandardMaterial;
  private readonly floor: THREE.MeshStandardMaterial;
  private readonly ceiling: THREE.MeshStandardMaterial;
  private readonly iron: THREE.MeshStandardMaterial;
  private readonly sticky: THREE.MeshStandardMaterial;
  private readonly waste: THREE.MeshStandardMaterial;
  private disposed = false;

  constructor(lab: CultivationLabMaterials, contamination: CultivationContaminationArt) {
    const finish = (source: THREE.MeshStandardMaterial, name: string, colour: number, roughness: number, emission = .018) => {
      const material = new THREE.MeshStandardMaterial().copy(source);
      material.name = `cultivation-access-${name}`;
      material.color.setHex(colour); material.roughness = roughness;
      material.emissive.setHex(colour); material.emissiveIntensity = emission;
      material.emissiveMap = source.map;
      // Retain established runoff, floor wear and membrane hooks on these copies.
      material.onBeforeCompile = (shader, renderer) => source.onBeforeCompile(shader, renderer);
      material.customProgramCacheKey = () => `${source.customProgramCacheKey()}:access-${name}-v1`;
      this.materials.push(material);
      return material;
    };
    this.wall = finish(contamination.finishes.wall, 'stained-panels', 0x929383, .96);
    this.wall.userData.tileSizeMetres = [2, 1.1];
    const wallHook = this.wall.onBeforeCompile;
    this.wall.onBeforeCompile = (shader, renderer) => {
      wallHook(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 accessWallP = vec2(vCultivationPosition.x + vCultivationPosition.z, vCultivationPosition.y);
        float accessTide = 1.0 - smoothstep(.3, 1.6 + cultivationNoise(accessWallP * .55) * .65, accessWallP.y);
        float accessGrime = smoothstep(.38, .75,
          cultivationNoise(accessWallP * vec2(.65, 1.2) + vec2(42.0, 7.0)) * .65 + cultivationNoise(accessWallP * 3.5) * .35);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(.25, .28, .19), min(.85, accessTide * .55 + accessGrime * .5));
      `);
    };
    this.floor = finish(contamination.finishes.floor, 'greasy-deck', 0x7b8071, .83, .012);
    this.floor.userData.tileSizeMetres = [1.6, 1.6];
    const floorHook = this.floor.onBeforeCompile;
    this.floor.onBeforeCompile = (shader, renderer) => {
      floorHook(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 accessFloorP = vCultivationFloorPosition.xz;
        float accessGrease = smoothstep(.3, .8, floorWearNoise(accessFloorP * .55 + vec2(7.0, 19.0)) * .6 + floorWearNoise(accessFloorP * 2.8) * .4);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(.32, .30, .21), accessGrease * .55);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
        'roughnessFactor = mix(roughnessFactor, .24, smoothstep(.55, .8, accessGrease));\n#include <metalnessmap_fragment>');
    };
    this.ceiling = finish(contamination.finishes.metal, 'sooted-ceiling', 0x3c433c, .94, .008);
    this.iron = finish(lab.metal, 'oxidized-pipework', 0xb0a98d, .94, .01);
    this.iron.map = lab.pole.map; this.iron.roughnessMap = lab.pole.roughnessMap;
    this.iron.bumpMap = lab.pole.bumpMap; this.iron.bumpScale = .009;
    this.iron.emissiveMap = this.iron.map; this.iron.metalness = .32;
    this.sticky = finish(lab.sticky, 'damp-adhesive', 0xb5c8b8, .83, .18);
    this.sticky.emissive.copy(lab.sticky.emissive);
    this.sticky.normalScale.set(.42, .42);
    this.sticky.userData.tileSizeMetres = [3.5, 5];
    this.waste = finish(lab.acid, 'stagnant-waste', 0x46501a, .46);
    const acidHook = this.waste.onBeforeCompile;
    // Borrow the shared liquid clock and ripple pool, while tinting only these
    // shallow deposits. Goop wakes still use the same authoritative surface bounds.
    const colours = {
      uDeepColour: { value: new THREE.Color(0x242809) },
      uMidColour: { value: new THREE.Color(0x4b5716) },
      uFilmColour: { value: new THREE.Color(0x92a13b) },
      uBubbleColour: { value: new THREE.Color(0xc3c776) },
      uFlowSpeed: { value: .12 }, uEmissionStrength: { value: .045 },
    };
    this.waste.onBeforeCompile = (shader, renderer) => {
      acidHook(shader, renderer);
      Object.assign(shader.uniforms, colours);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float accessScum = smoothstep(.43, .72, acidFbm(vAcidWorldPosition.xz * 1.25 + vec2(13.0, 4.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .115, .035), accessScum * .7);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
        'roughnessFactor = mix(roughnessFactor, .74, accessScum * .75);\n#include <metalnessmap_fragment>');
    };
  }

  finishFor(mesh: THREE.Mesh): THREE.MeshStandardMaterial | undefined {
    const name = mesh.name;
    if (name.startsWith('room-5-vent-acid-')) return this.waste;
    if (!/^room-5-(shared-vent|fork-|bob-(shaft|approach|exit)|goop-(vent|drop)|drop-ceiling)/.test(name)) return undefined;
    if (mesh.userData.surfaceTag === 'sticky') return this.sticky;
    if (/floor$/.test(name)) return this.floor;
    if (/roof$|header|flange/.test(name)) return this.ceiling;
    return this.wall;
  }

  addDetails(parent: THREE.Group): void {
    this.root.name = 'room-5-access-tunnel-details';
    this.root.userData.presentationOnly = true;
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (material: THREE.Material, geometry: THREE.BufferGeometry) => {
      const list = parts.get(material) ?? []; list.push(geometry); parts.set(material, list);
    };
    const box = (material: THREE.Material, size: [number, number, number], at: [number, number, number]) =>
      add(material, new THREE.BoxGeometry(...size).translate(...at));
    // Shallow pipes and clamps stay above head height and off the wall plane.
    for (const y of [2.04, 2.25]) add(this.iron,
      new THREE.CylinderGeometry(.045, .045, 48, 8).rotateZ(Math.PI / 2).translate(14, y, 10.08));
    for (const x of [-9, -3, 3, 9, 15, 21, 27, 33, 37])
      box(this.iron, [.10, .38, .10], [x, 2.145, 10.08]);
    for (const x of [-1, 1]) {
      add(this.iron, new THREE.CylinderGeometry(.04, .04, 7.6, 8).rotateX(Math.PI / 2).translate(x, 2.15, 4));
      box(this.iron, [.09, .012, 7.4], [x, .21, 4]);
    }
    const lamp = new THREE.MeshStandardMaterial({ name: 'cultivation-access-caged-lamp',
      color: 0xa08755, emissive: 0xd1a356, emissiveIntensity: .65, roughness: .85 });
    this.materials.push(lamp);
    // Broad, gently fading light approximates spill through the low corridor.
    // The existing three lights overlap along the branches without extra shadow passes.
    for (const [x, y, z, colour, intensity, reach] of [
      [0, 2.2, 9.8, 0xd6bd87, 6.4, 32], [-12.82, 2.15, 17.3, 0x9bbaa0, 4.8, 28], [40, 2.2, 18.4, 0xb8bb79, 4.8, 28],
    ]) {
      if (x < 0) box(this.iron, [.2, .18, .24], [-13.08, y + .03, z]);
      else box(this.iron, [.08, .18, .08], [x, 2.35, z]);
      box(this.iron, [.55, .12, .24], [x, y + .03, z]);
      box(lamp, [.39, .05, .16], [x, y - .055, z]);
      for (const dx of [-.15, 0, .15]) box(this.iron, [.024, .025, .18], [x + dx, y - .0925, z]);
      const light = new THREE.PointLight(colour, intensity, reach, 1);
      light.position.set(x, y - .2, z); this.root.add(light);
    }
    // Map detail geometry in metres after placement so adjacent fittings differ.
    for (const [material, pieces] of parts) {
      for (const piece of pieces) {
        const p = piece.getAttribute('position'), n = piece.getAttribute('normal'), uv = piece.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i,
          (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / 2,
          (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / 2);
      }
      const geometry = mergeGeometries(pieces, false)!;
      for (const piece of pieces) piece.dispose();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.userData.presentationOnly = true;
      this.root.add(mesh);
    }
    parent.add(this.root);
  }

  get materialCount(): number { return this.materials.length; }
  get batchCount(): number { return this.geometries.length; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
