import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import type { CultivationContaminationArt } from './CultivationContaminationArt.ts';
import { mapCultivationPlatformWear } from './CultivationPlatformWear.ts';

/** Upper Room 5 service chamber. Shared wear maps, static hardware, no gameplay or lights. */
export class CultivationDroneChamberArt {
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly wall: THREE.MeshStandardMaterial;
  private readonly ceiling: THREE.MeshStandardMaterial;
  private readonly enamel: THREE.MeshStandardMaterial;
  private readonly iron: THREE.MeshStandardMaterial;
  readonly deck: THREE.MeshStandardMaterial;
  private readonly landing: THREE.MeshStandardMaterial;

  constructor(lab: CultivationLabMaterials, contamination: CultivationContaminationArt) {
    const finish = (source: THREE.MeshStandardMaterial, name: string, color: number,
      emission: number, intensity: number) => {
      const m = new THREE.MeshStandardMaterial().copy(source);
      m.name = `cultivation-drone-chamber-${name}`; m.color.setHex(color); m.roughness = .92;
      // Retain the previous chamber finishes' visibility under the existing lights.
      m.emissive.setHex(emission); m.emissiveIntensity = intensity; m.emissiveMap = m.map;
      m.onBeforeCompile = source.onBeforeCompile;
      const key = source.customProgramCacheKey(); m.customProgramCacheKey = () => key;
      this.materials.push(m); return m;
    };
    this.wall = finish(contamination.finishes.wall, 'stained-panels', 0xbcbdb0, 0xcdd2c9, .065);
    this.ceiling = finish(contamination.finishes.ceiling, 'soot-stained-ceiling', 0x828b80, 0x3e4e51, .045);
    this.enamel = finish(lab.platform, 'solid-shield-panels', 0xafa79b, 0xafa79b, .065);
    this.iron = finish(lab.pole, 'corroded-fittings', 0xc3a88a, 0x3e4e51, .045);
    // Match the shared dirty ceramic deck, with the material visibility lift
    // already used by maintenance floors. This does not add or alter lights.
    this.deck = finish(lab.platform, 'dirty-white-deck', 0xe1dfd6, 0xe1dfd6, .085);
    this.landing = finish(contamination.finishes.floor, 'dirty-landing-tile', 0xd3cfc3, 0xd3cfc3, .085);
    this.addUnevenWear(this.wall, .45);
    this.addUnevenWear(this.enamel);
  }

  /** Metre-scale deposits cross texture repeats, leaving larger areas of intact paint. */
  private addUnevenWear(material: THREE.MeshStandardMaterial, strength = 1): void {
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.uChamberWearStrength = { value: strength };
      shader.vertexShader = 'varying vec3 vChamberWearPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvChamberWearPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = `varying vec3 vChamberWearPosition;
        uniform float uChamberWearStrength;
        float chamberWearHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float chamberWearNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(chamberWearHash(i), chamberWearHash(i+vec2(1,0)), f.x),
            mix(chamberWearHash(i+vec2(0,1)), chamberWearHash(i+vec2(1,1)), f.x), f.y);
        }\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wearP = vec2(vChamberWearPosition.x + vChamberWearPosition.z, vChamberWearPosition.y);
        float broadWear = chamberWearNoise(wearP * .38 + vec2(17.3, 8.1));
        float brokenWear = chamberWearNoise(wearP * 1.7 + vec2(6.8, 23.4));
        float deposits = smoothstep(.40, .73, broadWear * .72 + brokenWear * .28);
        float runoffWear = chamberWearNoise(wearP * vec2(5.2, .32));
        float streaks = deposits * smoothstep(.38, .76, runoffWear);
        float chips = deposits * smoothstep(.65, .84, chamberWearNoise(wearP * 18.0));
        float paintVariation = mix(.86, 1.08, chamberWearNoise(wearP * .16 + 51.0));
        vec3 chamberWearTint = mix(vec3(1.0), vec3(.44, .39, .32), deposits * .62 + streaks * .25);
        chamberWearTint *= paintVariation;
        chamberWearTint = mix(chamberWearTint, vec3(.28, .27, .25), chips * .8);
        chamberWearTint = mix(vec3(1.0), chamberWearTint, uChamberWearStrength);
        diffuseColor.rgb *= chamberWearTint;
      `);
      // Weather the existing visibility lift too, so deposits remain legible in
      // shadow without brightening the finish or adding any room illumination.
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= chamberWearTint;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .72, streaks * .5 * uChamberWearStrength);');
    };
    material.customProgramCacheKey = () => `${key}:chamber-uneven-wear-v1`;
  }

  finishFor(mesh: THREE.Mesh): THREE.MeshStandardMaterial | undefined {
    if (mesh.name === 'room-5-bob-shaft-landing-tile') return this.landing;
    if (/^room-5-chamber-(west|east|back|front)/.test(mesh.name)) return this.wall;
    if (mesh.name === 'room-5-chamber-roof') return this.ceiling;
    if (/^room-5-safe-\d+-network-\d+-baffle$/.test(mesh.name) || mesh.name === 'room-5-release-pedestal') return this.enamel;
    if (/^room-5-pod-cable-|^room-5-manual-release-lever$/.test(mesh.name)) return this.iron;
    return undefined;
  }

  mapShield(mesh: THREE.Mesh, room: LevelTwoRoomFiveGreybox): void {
    if (!/^room-5-safe-\d+-network-\d+-baffle$/.test(mesh.name)) return;
    const face = room.root.getObjectByName(`${mesh.name}-collision`)!;
    const across = new THREE.Vector3(1, 0, 0).applyQuaternion(face.quaternion);
    const positions = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
    const point = new THREE.Vector3();
    // A single projection across each solid shield avoids stretched grime at
    // the mitred corners, where the collision prism's vertex normals blend.
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).add(mesh.position);
      uv.setXY(i, point.dot(across) / 2, point.y / 2);
    }
  }

  addDetails(room: LevelTwoRoomFiveGreybox): void {
    const parts = new Map<string, {material: THREE.Material; pieces: THREE.BufferGeometry[]}>();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      mapCultivationPlatformWear(geometry, 'drone-chamber-service-hardware', 2);
      geometry.computeBoundingBox();
      const zone = Math.floor(geometry.boundingBox!.getCenter(new THREE.Vector3()).z / 32);
      const key = `${zone}:${material.uuid}`;
      const part = parts.get(key) ?? {material, pieces: []}; part.pieces.push(geometry); parts.set(key, part);
    };
    const box = (size: [number, number, number], at: [number, number, number]) => new THREE.BoxGeometry(...size).translate(...at);
    // Service risers hug the shell, away from jump exits and the patrol volume.
    for (const side of [-1, 1]) for (const z of [33, 65]) {
      add(new THREE.CylinderGeometry(.16, .16, 28, 10).translate(side * 19.62, 21, z), this.iron);
      for (const y of [9, 13, 21, 29, 34]) {
        add(new THREE.CylinderGeometry(.23, .23, .22, 10).translate(side * 19.62, y, z), this.enamel);
        add(box([.29, .16, .58], [side * 19.79, y, z]), this.iron);
      }
      for (const y of [11, 25, 34]) {
        const ventZ = z + 3.7;
        add(box([.14, 2.1, 3.1], [side * 19.83, y, ventZ]), this.iron);
        for (const dy of [-1.1, 1.1]) add(box([.23, .12, 3.35], [side * 19.7, y + dy, ventZ]), this.enamel);
        for (let i = 0; i < 7; i++) add(box([.18, .11, 2.8], [side * 19.61, y - .84 + i * .28, ventZ]), this.enamel);
      }
    }
    // Reinforced edges and fastening bars follow each mitred shield face. Leave
    // the corners inset so neighbouring panels never produce coplanar trim.
    for (const collider of room.collisionMeshes) {
      if (!/^room-5-safe-\d+-network-\d+-baffle-collision$/.test(collider.name)) continue;
      const width = (collider.geometry as THREE.BoxGeometry).parameters.width;
      if (width < .65) continue;
      collider.updateMatrix();
      const detail = (size: [number, number, number], at: [number, number, number], m: THREE.Material) =>
        add(box(size, at).applyMatrix4(collider.matrix), m);
      for (const face of [-1, 1]) {
        for (const y of [-1.46, 1.46]) detail([width - .3, .12, .07], [0, y, face * .17], this.iron);
        for (const x of [-width / 2 + .22, width / 2 - .22]) {
          detail([.12, 2.76, .07], [x, 0, face * .17], this.iron);
          for (const y of [-1.25, 0, 1.25]) add(new THREE.CylinderGeometry(.045, .045, .04, 6)
            .rotateX(Math.PI / 2).translate(x, y, face * .225).applyMatrix4(collider.matrix), this.enamel);
        }
        // Short raised wear guards break up broad plate faces without masking exits.
        for (const x of [-.27, .27]) if (width > 1.6)
          detail([.065, 1.5, .055], [x, -.2, face * .163], this.iron);
      }
    }
    for (const [key, part] of parts) {
      const geometry = mergeGeometries(part.pieces)!; part.pieces.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, part.material);
      mesh.name = `room-5-drone-chamber-hardware-${key.split(':')[0]}`;
      // The wall and shield hulls already cast these silhouettes. Small bolts
      // and louvres receive their shadows without repeating every spotlight pass.
      mesh.userData.shadowProxyReceiver = true;
      mesh.userData.presentationOnly = true; room.root.add(mesh); this.meshes.push(mesh);
    }
  }

  get materialCount(): number { return this.materials.length; }
  get batchCount(): number { return this.meshes.length; }
  dispose(): void {
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const material of this.materials) material.dispose();
  }
}
