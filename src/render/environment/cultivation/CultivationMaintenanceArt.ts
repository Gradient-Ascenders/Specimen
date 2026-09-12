import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import { CultivationVoltPodArt } from './CultivationVoltPodArt.ts';
import { optimizeFiniteLightEvaluation } from './FiniteLightEvaluation.ts';
import { configureCultivationMembraneMaterial } from './CultivationMembraneMaterial.ts';

/** Room-specific dressing of the shared facility library. No gameplay or frame updates. */
export class CultivationMaintenanceArt {
  readonly acidSurfaces: THREE.Mesh[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly batches: THREE.Mesh[] = [];
  private readonly hidden = new THREE.MeshStandardMaterial({ visible: false });
  private readonly originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private disposed = false;
  private readonly podArt: CultivationVoltPodArt;
  readonly diagnostics = { newTextures: 0, variants: 0, staticMeshesBatched: 0, batches: 0 };

  constructor(room: LevelTwoRoomFiveGreybox, lab: CultivationLabMaterials) {
    const b = room.builder, m = b.materials;
    const variant = (source: THREE.MeshStandardMaterial, name: string, colour: number, roughness: number, lift = .045) => {
      const material = source.clone();
      material.name = `cultivation-maintenance-${name}`;
      material.color.setHex(colour); material.roughness = roughness;
      material.emissive.setHex(colour); material.emissiveIntensity = lift;
      material.emissiveMap = material.map;
      material.userData.tileSizeMetres = source === lab.wall ? [4, 3] : source === lab.sticky ? [6.08, 6.55] : [2, 2];
      if (source === lab.sticky) configureCultivationMembraneMaterial(material);
      optimizeFiniteLightEvaluation(material);
      this.materials.push(material); b.borrowedMaterials.add(material);
      return material;
    };
    const wall = variant(lab.wall, 'lab-panels', 0xcdd2c9, .82, .065);
    const duct = variant(lab.duct, 'service-duct', 0x83948f, .67, .065);
    const metal = variant(lab.metal, 'structural-metal', 0x3e4e51, .72);
    const deck = variant(lab.floor, 'safe-deck', 0xb2c0b8, .82, .085);
    const teal = variant(lab.metal, 'utility-teal', 0x3b7972, .65, .07);
    const wet = variant(lab.floor, 'damp-drainage', 0x68776c, .42, .05);
    const culvert = variant(lab.floor, 'culvert-lining', 0x526459, .87, .035);
    culvert.side = THREE.BackSide;
    const oxidized = variant(lab.metal, 'worn-service-iron', 0x796b52, .8);
    // Preserve the same jade route cue in the dim maintenance section.
    const sticky = variant(lab.sticky, 'adhesive-tile', 0xffffff, lab.sticky.roughness, .14);
    sticky.emissive.copy(lab.sticky.emissive);
    const terminal = variant(lab.metal, 'conductive-terminal', 0xb9a55a, .45, .16);
    // Retain the existing maps. Only the drainage finish adds world-scale runoff shading.
    const compileWet = wet.onBeforeCompile;
    wet.onBeforeCompile = function(shader, renderer) {
      compileWet.call(this, shader, renderer);
      shader.vertexShader = 'varying vec3 vDrainagePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDrainagePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = 'varying vec3 vDrainagePosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float lowerDamp = 1.0 - smoothstep(-11.2, -6.0, vDrainagePosition.y);
        float runoff = .5 + .5 * sin(vDrainagePosition.z * 2.3 + sin(vDrainagePosition.z * 7.1));
        diffuseColor.rgb *= 1.0 - lowerDamp * (.12 + .17 * runoff);
      `);
    };
    const wetKey = wet.customProgramCacheKey(); wet.customProgramCacheKey = () => `${wetKey}:drainage-runoff-v1`;
    const sourceToFinish = new Map<THREE.Material, THREE.MeshStandardMaterial>([
      [m.wall, wall], [m.floor, deck], [m.support, metal], [m.duct, duct],
      [m.platform, deck], [m.containment, teal], [m.cable, metal], [m.sticky, sticky], [m.acid, lab.acid],
    ]);
    const dynamic = new Set(room.dynamicCollisionMeshes);
    const candidates: THREE.Mesh[] = [];
    const platforms: THREE.Mesh[] = [];
    room.root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || !object.material.visible) return;
      const name = object.name;
      if (/room-5-route-\d+-jump-\d+$|room-5-release-quiet-walk$|room-5-safe-\d+-deck$/.test(name)) {
        platforms.push(object); return;
      }
      let finish = sourceToFinish.get(object.material);
      if (/room-5-route-\d+-hanger-|room-5-safe-\d+-suspension-/.test(name)) finish = lab.pole;
      if (object.userData.textureRole === 'acid-floor' || object.material === m.acid) {
        finish = lab.acid; this.acidSurfaces.push(object);
      } else if (object.userData.surfaceTag === 'sticky') finish = sticky;
      else if (object.geometry instanceof THREE.CylinderGeometry && object.material.side === THREE.BackSide) finish = culvert;
      else if (/sewer-(vault|bank|hidden-exit-skin)|drainage-wall/.test(name)) finish = wet;
      else if (/drainage-(bar|crossbar|rim)|control-.*-face/.test(name)) finish = oxidized;
      else if (/sewer-pipe|control-.*-cabinet|pod-(base|cap)/.test(name)) finish = teal;
      else if (/safe-.*-deck|release-quiet-walk|rescue-shortcut|reunion-ramp$/.test(name)) finish = deck;
      else if (name === 'room-5-volt-conductive-terminal') finish = terminal;
      // Retain animated contacts, network signals, glass and the approved damaged drone.
      if (object === room.brokenCore || object.parent === room.brokenCore || object.userData.soluble) finish = undefined;
      if (!finish) return;
      b.borrowedMaterials.add(finish);
      lab.bind(object, finish);
      // Parent-local and dynamic pieces must follow their existing owner. Batch only static direct children.
      if (object.parent === room.root && object.visible && !dynamic.has(object) && object.children.length === 0 && finish !== lab.acid) candidates.push(object);
    });
    for (const platform of platforms) {
      this.originals.push({ mesh: platform, material: platform.material });
      if (platform.geometry instanceof THREE.BoxGeometry) lab.platformArt.add(platform);
      else lab.platformArt.addClipped(platform);
      platform.material = this.hidden;
    }
    lab.platformArt.batchStatic(room.root, 10);
    const platformBatch = room.root.children.find(o => o.name === 'cultivation-static-platform-art');
    platformBatch?.traverse(o => { if (o instanceof THREE.Mesh) o.userData.shadowProxyReceiver = true; });
    // The same deck silhouettes cast shadows through low-poly hulls. Ceramic
    // bevels and underside fittings remain fully detailed in the visible pass.
    const hullMaterial = new THREE.MeshBasicMaterial({colorWrite:false, depthWrite:false});
    this.materials.push(hullMaterial); b.borrowedMaterials.add(hullMaterial);
    const hulls = new Map<string, THREE.BufferGeometry[]>();
    for (const platform of platforms) {
      platform.updateMatrix();
      let hull = platform.geometry.clone();
      if (hull.index) { const indexed = hull; hull = indexed.toNonIndexed(); indexed.dispose(); }
      for (const name of Object.keys(hull.attributes)) if (!['position','normal'].includes(name)) hull.deleteAttribute(name);
      hull.applyMatrix4(platform.matrix);
      const key = [platform.position.x, platform.position.y, platform.position.z].map(n => Math.floor(n / 10)).join(',');
      const list = hulls.get(key) ?? []; list.push(hull); hulls.set(key, list);
    }
    for (const pieces of hulls.values()) {
      const geometry = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose());
      const hull = new THREE.Mesh(geometry, hullMaterial); hull.name = 'room-5-platform-shadow-hulls'; hull.userData.presentationOnly = true;
      room.root.add(hull); this.batches.push(hull);
    }
    this.podArt = new CultivationVoltPodArt(room, lab);
    // Keep spatial batches small enough for camera and shadow-frustum rejection.
    const parts = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    for (const mesh of candidates) {
      const material = mesh.material as THREE.Material;
      const zone = mesh.position.x > 29 ? 'sewer' : mesh.position.y < 0 ? 'maintenance' : 'chamber';
      const key = `${zone}:${Math.floor(mesh.position.z / 24)}:${material.uuid}`;
      let part = parts.get(key);
      if (!part) { part = { material, geometries: [] }; parts.set(key, part); }
      mesh.updateMatrix();
      let geometry = mesh.geometry.clone();
      if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
      for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'membranePanel'].includes(attribute)) geometry.deleteAttribute(attribute);
      geometry.applyMatrix4(mesh.matrix); part.geometries.push(geometry);
      this.originals.push({ mesh, material: mesh.material }); mesh.material = this.hidden;
    }
    for (const [key, part] of parts) {
      const geometry = mergeGeometries(part.geometries, false)!;
      for (const piece of part.geometries) piece.dispose();
      const mesh = new THREE.Mesh(geometry, part.material);
      mesh.name = `room-5-art-static-${key.split(':').slice(0, 2).join('-')}`;
      mesh.userData.presentationOnly = true; room.root.add(mesh); this.batches.push(mesh);
    }
    // Presentation-only service markings: instanced fixtures, no new light sources.
    const accents = new Map<THREE.Material, THREE.Matrix4[]>();
    const box = (material: THREE.Material, position: [number, number, number], size: [number, number, number]) => {
      const list = accents.get(material) ?? []; accents.set(material, list);
      list.push(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion(), new THREE.Vector3(...size)));
    };
    for (const z of [24, 40, 56, 72, 88, 104, 120, 136]) for (const x of [36.94, 43.06]) {
      box(lab.platformArt.warning, [x, -11.19, z], [.1, .012, 1.4]);
      box(teal, [x < 40 ? 31.8 : 48.2, -8.15, z], [.12, .18, 1.8]);
    }
    for (const z of [26, 42, 58, 74]) for (const x of [-19.97, 19.97]) {
      box(teal, [x, 15, z], [.025, .4, 5]);
      box(metal, [x, 19, z], [.04, 36, .12]);
    }
    // Quiet guide markings keep the fork and final terminal legible in the existing darkness.
    for (const x of [-9, -5, 5, 13, 21]) box(teal, [x, .208, 8.1], [1.1, .01, .1]);
    for (const x of [13.9, 18.1]) box(lab.platformArt.warning, [x, .01, 68], [.12, .02, 2.2]);
    for (const [material, transforms] of accents) {
      b.borrowedMaterials.add(material);
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, transforms.length);
      mesh.name = 'room-5-art-service-markings'; mesh.userData.presentationOnly = true;
      transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.computeBoundingSphere();
      room.root.add(mesh); this.batches.push(mesh);
    }
    this.diagnostics.variants = this.materials.length;
    this.diagnostics.staticMeshesBatched = candidates.length;
    this.diagnostics.batches = this.batches.length;
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.podArt.dispose();
    for (const { mesh, material } of this.originals) mesh.material = material;
    for (const mesh of this.batches) {
      mesh.removeFromParent(); mesh.geometry.dispose();
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    }
    for (const material of this.materials) material.dispose();
    this.hidden.dispose();
  }
}
