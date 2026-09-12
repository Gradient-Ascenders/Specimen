import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import type { CultivationContaminationArt } from './CultivationContaminationArt.ts';
import { mapCultivationPlatformWear } from './CultivationPlatformWear.ts';

/** Acid exposure and service hardware. Borrows existing maps; owns no lights or colliders. */
export class CultivationSewerArt {
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly originals: {mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]}[] = [];
  readonly lining: THREE.MeshStandardMaterial;
  readonly bank: THREE.MeshStandardMaterial;
  readonly iron: THREE.MeshStandardMaterial;
  readonly cabinet: THREE.MeshStandardMaterial;
  readonly waste: THREE.MeshStandardMaterial;
  private readonly rubber: THREE.MeshStandardMaterial;
  private readonly mineral: THREE.MeshStandardMaterial;

  constructor(lab: CultivationLabMaterials, contamination: CultivationContaminationArt) {
    const finish = (source: THREE.MeshStandardMaterial, name: string, color: number, roughness: number) => {
      const m = new THREE.MeshStandardMaterial().copy(source);
      m.name = `cultivation-sewer-${name}`; m.color.setHex(color); m.roughness = roughness;
      m.emissive.setHex(0); m.emissiveIntensity = 0;
      m.onBeforeCompile = source.onBeforeCompile;
      const key = source.customProgramCacheKey(); m.customProgramCacheKey = () => `${key}:sewer-${name}`;
      this.materials.push(m); return m;
    };
    this.lining = finish(contamination.finishes.wall, 'acid-etched-lining', 0xb7b39b, .94);
    this.lining.userData.tileSizeMetres = [3, 2];
    this.bank = finish(contamination.finishes.floor, 'contaminated-bank', 0x8b8871, .84);
    this.bank.userData.tileSizeMetres = [2.5, 2.5];
    this.iron = finish(lab.metal, 'flaking-iron', 0xd0af8b, .95);
    this.iron.map = lab.pole.map; this.iron.bumpMap = lab.pole.bumpMap;
    this.iron.roughnessMap = lab.pole.roughnessMap; this.iron.bumpScale = .025; this.iron.metalness = .28;
    this.iron.userData.tileSizeMetres = [1.3, 2];
    this.cabinet = finish(contamination.finishes.metal, 'stripped-enamel', 0x96937b, .9);
    this.rubber = finish(lab.metal, 'oil-black-machinery', 0x282e29, .86);
    this.mineral = finish(lab.pole, 'mineral-crust', 0xb5ae82, 1);
    this.waste = finish(lab.acid, 'industrial-effluent', 0xffffff, lab.acid.roughness);
    const liquidHook = lab.acid.onBeforeCompile;
    this.waste.onBeforeCompile = (shader, renderer) => {
      liquidHook.call(lab.acid, shader, renderer);
      // Share the existing clock, ripple pool and emission settings. The film is
      // a local surface treatment, with no new liquid geometry or lighting.
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float sewerScum = smoothstep(.46, .72, acidFbm(vAcidWorldPosition.xz * .8 + vec2(31.0, 7.0)));
        float sewerFilm = smoothstep(.6, .82, acidFbm(vAcidWorldPosition.xz * 4.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .40, .16), sewerScum * .65);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.20, .21, .075), sewerScum * sewerFilm * .4);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
        'roughnessFactor = mix(roughnessFactor, .72, sewerScum * .65);\n#include <metalnessmap_fragment>');
    };
    // Keep original drainage visibility under the existing lights; this is surface finish only.
    for (const m of [this.lining, this.bank]) {
      m.emissive.setHex(0x68776c); m.emissiveIntensity = .05; m.emissiveMap = m.map;
      const prior = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        prior.call(m, shader, renderer);
        shader.vertexShader = 'varying vec3 vSewerPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvSewerPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = `varying vec3 vSewerPosition;
          float sewerHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float sewerNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(sewerHash(i), sewerHash(i+vec2(1,0)), f.x),
              mix(sewerHash(i+vec2(0,1)), sewerHash(i+vec2(1,1)), f.x), f.y);
          }\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec2 sewerP = vec2(vSewerPosition.x + vSewerPosition.z, vSewerPosition.y);
          float sewerRunoff = smoothstep(.42, .78, sewerNoise(sewerP * vec2(2.2, .13)));
          float sewerExposure = sewerNoise(vSewerPosition.xz * .42);
          float sewerTide = 1.0 - smoothstep(-11.5, -8.3 + sewerNoise(sewerP * .3), vSewerPosition.y);
          float sewerCrust = smoothstep(.65, .86, sewerNoise(sewerP * 8.0)) * sewerRunoff;
          diffuseColor.rgb *= mix(vec3(1.0), vec3(.25, .29, .14), sewerTide * (.3 + sewerExposure * .5));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.48, .25, .10), sewerRunoff * .48);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24, .22, .13), sewerCrust * .35);
        `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
          'roughnessFactor = mix(roughnessFactor, .38, sewerTide * sewerExposure * .55);\n#include <metalnessmap_fragment>');
      };
    }
  }

  finishFor(mesh: THREE.Mesh): THREE.MeshStandardMaterial | undefined {
    if (/^room-5-(sewer-acid-channel|drainage-water-)/.test(mesh.name)) return this.waste;
    if (/^room-5-sewer-(vault|hidden-exit-skin)/.test(mesh.name) || /^room-5-drainage-wall/.test(mesh.name)) return this.lining;
    if (/^room-5-sewer-(bank|reunion-bridge)/.test(mesh.name)) return this.bank;
    if (/^room-5-(sewer-(pipe|rib)|drainage-(bar|crossbar|rim))/.test(mesh.name)) return this.iron;
    if (/^room-5-control-.*-cabinet$/.test(mesh.name)) return this.cabinet;
    if (/^room-5-control-.*-face$/.test(mesh.name)) return this.iron;
    return undefined;
  }

  addDetails(room: LevelTwoRoomFiveGreybox, lab: CultivationLabMaterials): void {
    const staticParts = new Map<string, {material: THREE.Material; pieces: THREE.BufferGeometry[]}>();
    const build = (parent: THREE.Object3D, name: string, draw: (add: (g: THREE.BufferGeometry, m: THREE.Material) => void) => void, damageStage?: number) => {
      const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
      draw((g, m) => { mapCultivationPlatformWear(g, name, 2); const list = parts.get(m) ?? []; list.push(g); parts.set(m, list); });
      for (const [m, pieces] of parts) {
        if (parent === room.root) {
          for (const piece of pieces) {
            piece.computeBoundingBox();
            const zone = Math.floor(piece.boundingBox!.getCenter(new THREE.Vector3()).z / 32);
            const key = `${zone}:${m.uuid}`;
            const entry = staticParts.get(key) ?? {material:m, pieces:[]};
            entry.pieces.push(piece); staticParts.set(key, entry);
          }
          continue;
        }
        const geometry = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geometry, m); mesh.name = name; mesh.userData.presentationOnly = true;
        if (damageStage !== undefined) mesh.userData.damageStage = damageStage;
        parent.add(mesh); this.meshes.push(mesh);
      }
    };
    const box = (size: [number, number, number], at: [number, number, number]) => new THREE.BoxGeometry(...size).translate(...at);
    // Bolted collars follow the existing service pipes; no clutter on the walking banks.
    for (const z of [28, 46, 68, 90, 110, 132]) build(room.root, `room-5-sewer-pipe-joints-${z}`, add => {
      for (const x of [32, 48]) {
        add(new THREE.TorusGeometry(.49, .10, 6, 12).translate(x, -8.7, z), this.iron);
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
          add(new THREE.CylinderGeometry(.07, .07, .1, 6).rotateX(Math.PI / 2)
            .translate(x + Math.cos(angle) * .5, -8.7 + Math.sin(angle) * .5, z - .14), this.mineral);
      }
    });
    for (const [i, handle] of [...room.controls.values()].entries()) {
      const z = 118 + i * 4;
      build(room.root, `room-5-sewer-switch-housing-${i}`, add => {
        for (const side of [-1, 1]) {
          add(box([.14, 3.02, .13], [46.62, -9.5, z + side * 1.28]), this.iron);
          add(box([.14, .12, 2.7], [46.62, -9.5 + side * 1.59, z]), this.iron);
        }
        for (const y of [-10.5, -8.5]) add(box([.2, .32, .16], [46.49, y, z + 1.28]), this.mineral);
        // Recessed louvres below the live network symbol, clear of its existing face.
        for (let n = 0; n < 5; n++) add(box([.025, .06, .55], [46.76, -9.15 + n * .11, z + .74]), this.rubber);
        add(box([.08, .1, 1.95], [46.49, -7.82, z]), this.mineral);
      });
      lab.bind(handle, this.iron);
      for (const child of handle.children) if (child instanceof THREE.Mesh) lab.bind(child, this.rubber);
      build(handle, `room-5-sewer-switch-grip-${i}`, add => {
        for (const x of [-.49, -.37, -.25]) add(box([.045, .39, .74], [x, 0, 0]), this.iron);
      });
    }
    const drone = room.brokenCore;
    const shell = new THREE.MeshStandardMaterial().copy(drone.material as THREE.MeshStandardMaterial);
    shell.name = 'cultivation-sewer-pitted-drone-shell'; shell.map = lab.pole.map;
    shell.roughnessMap = lab.pole.roughnessMap; shell.bumpMap = lab.pole.bumpMap; shell.bumpScale = .006;
    const assign = (mesh: THREE.Mesh, material: THREE.Material) => {
      this.originals.push({mesh, material:mesh.material}); mesh.material = material;
    };
    // Keep the curved shell's authored UVs and collision geometry.
    this.materials.push(shell); assign(drone, shell);
    for (const part of drone.children) if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial)
      assign(part, part.material.color.getHex() === 0x192224 ? this.rubber : this.iron);
    // Bent armour ribs and exposed hoses give the wreck a readable mechanical silhouette.
    // Each side follows the existing hit-stage removal and retry restoration.
    for (const side of [-1, 1]) build(drone, `room-5-sewer-drone-exposed-rig-${side}`, add => {
      for (const z of [-.38, .12, .62]) {
        const rib = new THREE.TorusGeometry(.61, .047, 6, 14, Math.PI * .72);
        rib.rotateZ(side * .22).scale(.55, 1, 1).translate(side * .85, .03, z);
        add(rib, this.mineral);
      }
      const points = [new THREE.Vector3(side * .65, -.38, .6), new THREE.Vector3(side * 1.2, -.58, .8), new THREE.Vector3(side * 1.55, -.28, .25)];
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .05, 6, false), this.rubber);
      const plate = box([.28, .07, .64], [side * .8, .53, -.2]); plate.rotateZ(side * .18); add(plate, this.iron);
    }, side < 0 ? 1 : 2);
    build(drone, 'room-5-sewer-drone-optic-bezel', add => {
      add(new THREE.TorusGeometry(.255, .035, 6, 16).translate(0, .05, -1.23), this.iron);
    });
    for (const [key, {material, pieces}] of staticParts) {
      const geometry = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `room-5-sewer-service-detail-${key.split(':')[0]}`;
      mesh.userData.presentationOnly = true; room.root.add(mesh); this.meshes.push(mesh);
    }
  }

  get materialCount(): number { return this.materials.length; }
  get batchCount(): number { return this.meshes.length; }
  dispose(): void {
    for (const {mesh, material} of this.originals) mesh.material = material;
    this.originals.length = 0;
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.meshes.length = 0;
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }
}
