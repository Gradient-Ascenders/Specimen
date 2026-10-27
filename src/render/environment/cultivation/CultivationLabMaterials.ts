import { CultivationAssetOwner, type CultivationAssetSource } from './CultivationBakedAssets.ts';
import { optimizeFiniteLightEvaluation } from './FiniteLightEvaluation.ts';
import { configureCultivationTraversalLight } from './CultivationShadowCoverage.ts';
import { disposeShadowLight } from '../../ShadowLightResources.ts';
import { AcidSurfaceMaterial } from '../containment/AcidSurfaceMaterial.ts';
import { createCultivationStickyRouteGeometry } from './CultivationStickyRouteGeometry.ts';
import { CultivationPlatformArt } from './CultivationPlatformArt.ts';
import { createCultivationPlatformWear } from './CultivationPlatformWear.ts';
import { isCultivationBlenderShell } from './CultivationBlenderManifest.ts';
import { createCultivationMembraneMaterial, createCultivationMembraneTextures, createCultivationBiofilmMaterial, createCultivationBiofilmTextures, mapCultivationMembranePanel } from './CultivationMembraneMaterial.ts';
import * as THREE from 'three';
import { createContainmentPlatformMaterial } from '../containment/ContainmentArtResources.ts';
import type { GreyboxRoomBuilder } from '../../../levels/GreyboxRoomBuilder.ts';

interface LabFixtureOptions {
  readonly authoredReplacement?: boolean;
  readonly ceilingOpening?: readonly [number, number, number, number];
  /** Leave authored adhesive/laser walls free of decorative strips and trim. */
  readonly wallSides?: readonly (-1 | 1)[];
  readonly fillHeightMetres?: number;
  readonly fillPositionsZ?: readonly number[];
  readonly shadowTargets?: readonly (readonly [number, number, number])[];
  /** Purpose-built Room 1 practicals; all light properties except position stay fixed. */
  readonly practicalPositions?: readonly (readonly [number, number, number])[];
}

/** Original, deterministic facility finishes shared by the dressed Cultivation rooms. */
export class CultivationLabMaterials extends CultivationAssetOwner {
  readonly textures: import('./CultivationBakedAssets.ts').CultivationTexture[] = [];
  private readonly stickyMaps = createCultivationMembraneTextures(this.assets);
  readonly sticky = createCultivationMembraneMaterial(this.stickyMaps);
  private readonly nurseryStickyMaps=createCultivationBiofilmTextures(this.assets);
  readonly nurserySticky=createCultivationBiofilmMaterial(this.nurseryStickyMaps);
  readonly wall = this.finish('wall', 0xe2e1d8, 0.76, 0.02);
  readonly floor = this.finish('floor', 0xaeb7b2, 0.84, 0.08);
  readonly ceiling = this.finish('ceiling', 0xcbd0ca, 0.8, 0.06);
  readonly metal = this.finish('metal', 0x465156, 0.68, 0.72);
  readonly duct = this.finish('duct', 0x879391, 0.65, 0.7);
  private readonly platformMaps = (() => {
    const { ceramicNormal, ceramicRoughness } = this.assets.textures('ceramic');
    if (!(ceramicNormal instanceof THREE.DataTexture) || !(ceramicRoughness instanceof THREE.DataTexture)) throw Error('Invalid ceramic texture family.');
    return { ceramicNormal, ceramicRoughness };
  })();
  readonly platform = createContainmentPlatformMaterial(this.platformMaps);
  private readonly deckWear = createCultivationPlatformWear(this.assets, 'deck');
  private readonly poleWear = createCultivationPlatformWear(this.assets, 'pole');
  readonly pole = new THREE.MeshStandardMaterial({ name: 'cultivation-oxidized-platform-pole',
    map: this.poleWear.albedo, roughnessMap: this.poleWear.roughness,
    bumpMap: this.poleWear.roughness, bumpScale: .012, roughness: .95, metalness: .35 });
  private readonly acidFoundation = this.assets.textures('acid').albedo;
  readonly acid = new AcidSurfaceMaterial({ foundationMap: this.acidFoundation, microNormalMap: this.platformMaps.ceramicNormal });
  readonly platformArt = new CultivationPlatformArt(this.platform, this.assets);
  readonly rope = this.variant(this.metal, 'soluble-rope', 0x744522);
  readonly fixture = new THREE.MeshStandardMaterial({
    name: 'cultivation-lab-neutral-fixture', color: 0xf3f2e9,
    emissive: 0xf4f2e5, emissiveIntensity: 0.72, roughness: 0.38,
  });
  private readonly bindings: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; geometry: THREE.BufferGeometry }[] = [];
  private readonly decorations: THREE.Object3D[] = [];
  private disposed = false;

  constructor(assets: CultivationAssetSource) {
    super(assets);
    this.platform.map = this.deckWear.albedo;
    this.platform.roughnessMap = this.deckWear.roughness;
    this.platform.roughness = .9;
    this.pole.userData.tileSizeMetres = [.5, 2];
    // Unit-height tethers extend during a drop. Keep rust at metre scale and
    // anchored at the upper end, rather than stretching it into wood-like stripes.
    this.pole.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv.y += (position.y - 0.5) * (length(modelMatrix[1].xyz) - 1.0) / 2.0;
        vRoughnessMapUv = vMapUv;
        vBumpMapUv = vMapUv;
      `);
    };
    this.pole.customProgramCacheKey = () => 'cultivation-anchored-pole-oxidation-v1';
    this.textures.push(...Object.values(this.deckWear), ...Object.values(this.poleWear));
    for (const material of [this.wall, this.floor, this.ceiling, this.metal, this.duct, this.platform, this.pole, this.acid, this.sticky,this.nurserySticky]) {
      optimizeFiniteLightEvaluation(material);
    }
    this.acidFoundation.repeat.set(4, 3);
    this.acid.userData.tileSizeMetres = [32.7, 26.7];
    this.textures.push(this.acidFoundation);
    this.textures.push(...Object.values(this.stickyMaps));
    this.textures.push(...Object.values(this.nurseryStickyMaps));
    for (const texture of Object.values(this.platformMaps)) {
      texture.repeat.set(4, 4);
      this.textures.push(texture);
    }
    this.rope.metalness = 0;
    this.rope.roughness = 0.9;
    this.rope.emissive.setHex(0x211006);
    this.rope.emissiveIntensity = 0.28;
  }

  /** Material identity is an explicit authoring reference, never a gameplay rule. */
  dress(builder: GreyboxRoomBuilder, servicePanels: readonly string[] = [], overrides: ReadonlyMap<string, THREE.MeshStandardMaterial> = new Map()): void {
    const source = builder.materials;
    const nursery=builder.root.name==='cultivation-room-1-greybox'||builder.root.name==='cultivation-room-2-greybox';
    const stickyFinish=nursery?this.nurserySticky:this.sticky;
    const platforms: THREE.Mesh[] = [];
    builder.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BoxGeometry)) return;
      // The drop controller stretches this unit-height pole. Its local mapping
      // keeps oxidation attached to it without introducing stretched panel seams.
      if (object.name.endsWith('-non-soluble-rope')) {
        builder.borrowedMaterials.add(this.pole);
        this.bind(object, this.pole);
        const uv = object.geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i,
          uv.getX(i) + object.position.x * .37, uv.getY(i) + object.position.z * .29);
        return;
      }
      let material: THREE.MeshStandardMaterial | undefined;
      if (object.material === source.wall) {
        material = servicePanels.includes(object.name) ? this.duct :
          object.name.includes('ceiling') ? this.ceiling : this.wall;
      } else if (object.material === source.floor) material = this.floor;
      else if (object.material === source.support) material = this.metal;
      else if (object.material === source.duct) material = this.duct;
      else if (object.material === source.platform) material = this.platform;
      else if (object.material === source.wood) material = this.rope;
      else if (object.material === source.containment) material = this.duct;
      else if (object.material === source.sticky && object.userData.environmentRole === 'air-duct-entry') material = this.duct;
      else if (object.material === source.sticky && object.userData.textureRole === 'sticky-wall-tile') material = stickyFinish;
      // Explicit door art parts; status indicators remain owned by the door.
      else if (object.name.endsWith('-shutter-panel')) material = this.duct;
      else if (/-frame-(top|left|right)$/.test(object.name)) material = this.metal;
      // Updated Room 2's authored service details borrow the same palette.
      else if (/^room-2-panel-(seam|course)-/.test(object.name)) material = this.metal;
      else if (object.name.startsWith('room-2-upper-service-trim-')) material = this.duct;
      else if (object.name.startsWith('room-2-fluorescent-strip-')) material = this.fixture;
      if (object.userData.textureRole === 'acid-floor') material = this.acid;
      material = overrides.get(object.name) ?? material;
      // Explicit platform-family styling must win over broad room finishes.
      if (object.name === 'cultivation-room-2-button-rest-ledge') material = this.platform;
      if (material === this.platform) {
        platforms.push(object);
        material = this.platformArt.hidden;
      }
      if (material) {
        builder.borrowedMaterials.add(material);
        this.bind(object, material);
        if(object.name==='cultivation-room-2-final-vent-sticky-approach'){
          // Growth ends on the climbable wall. Its horizontal threshold cap
          // belongs to the metal vent, using the same submitted triangles.
          const normals=object.geometry.getAttribute('normal'),indices=object.geometry.index;
          for(const group of object.geometry.groups)
            group.materialIndex=normals.getY(indices?.getX(group.start)??group.start)>.5?1:0;
          object.material=[material,this.duct];builder.borrowedMaterials.add(this.duct);
        }
      }
    });
    if (builder.root.name === 'cultivation-room-2-greybox') {
      const panels = builder.collisionMeshes.filter(mesh => /^cultivation-room-2-sticky-route-[a-e]$/.test(mesh.name)) as THREE.Mesh<THREE.BoxGeometry>[];
      if (panels.length) {
        const skin = new THREE.Mesh(this.assets.geometry('room-2-sticky-route', () => createCultivationStickyRouteGeometry(panels,4)), this.nurserySticky);
        skin.name = 'cultivation-room-2-continuous-sticky-route';
        skin.userData.presentationOnly = true;
        builder.root.add(skin);
        this.decorations.push(skin);
        builder.borrowedMaterials.add(this.platformArt.hidden);
        for (const panel of panels) panel.material = this.platformArt.hidden;
      }
    }
    for (const platform of platforms)if(!isCultivationBlenderShell(platform.name))this.platformArt.add(platform);
    if (builder.root.name === 'cultivation-room-3-greybox') this.platformArt.batchStatic(builder.root);
  }

  /** Own presentation geometry copies; collider vertices are never changed. */
  bind(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial): void {
    this.bindings.push({ mesh, material: mesh.material, geometry: mesh.geometry });
    mesh.geometry = mesh.geometry.clone();
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    if (!mesh.geometry.getAttribute('uv')) mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(positions.count * 2), 2));
    const uv = mesh.geometry.getAttribute('uv');
    const tileSize = material.userData.tileSizeMetres as readonly [number, number] | undefined;
    const panelWidth = tileSize?.[0] ?? ( material === this.sticky ? 6.08 : material === this.wall ? 4 : material === this.rope ? 0.5 : 2);
    const panelHeight = tileSize?.[1] ?? ( material === this.sticky ? 6.55 : material === this.wall ? 3 : material === this.rope ? 0.5 : 2);
    for (let i = 0; i < uv.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
      // Offset static panels into their authored bay grid; moving parts use local UVs.
      const moving = material === this.platform || material === this.rope || material === this.pole || mesh.userData.doorId;
      const px = x + (moving ? 0 : mesh.position.x);
      const py = y + (moving ? 0 : mesh.position.y);
      const pz = z + (moving ? 0 : mesh.position.z);
      uv.setXY(i, (Math.abs(nx) > 0.5 ? -nx * pz : Math.abs(ny) > 0.5 ? px : nz * px) / panelWidth,
        (Math.abs(ny) > 0.5 ? -ny * pz : py) / panelHeight);
    }
    uv.needsUpdate = true;
    if (material.userData.cultivationMembrane) mapCultivationMembranePanel(mesh.geometry);
    mesh.material = material;
  }

  addFixtures(
    root: THREE.Group,
    width: number,
    height: number,
    length: number,
    options: LabFixtureOptions = {},
  ): void {
    const { ceilingOpening, wallSides = [-1, 1] } = options;
    const group = new THREE.Group();
    group.name = 'cultivation-lab-presentation';
    group.userData.presentationOnly = true;
    if (!options.authoredReplacement) {
      const transforms: THREE.Matrix4[] = [];
      for (let z = 5; !options.practicalPositions && z < length; z += 8) {
        for (const x of [-width * 0.28, width * 0.28]) {
          if (ceilingOpening && x + 0.12 > ceilingOpening[0] && x - 0.12 < ceilingOpening[1] &&
            z + 1.4 > ceilingOpening[2] && z - 1.4 < ceilingOpening[3]) continue;
          transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, height - 0.24, z),
            new THREE.Quaternion(), new THREE.Vector3(0.24, 0.06, 2.8)));
        }
      }
      // Wall-mounted luminaires carry the same quiet fluorescent family as Level 1.
      for (let z = 5; z < length; z += 8) {
        for (const side of wallSides) {
          transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(side * (width / 2 - 0.23), 4, z),
            new THREE.Quaternion(), new THREE.Vector3(0.06, 0.16, 2.4)));
        }
      }
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const strips = new THREE.InstancedMesh(geometry, this.fixture, transforms.length);
      strips.name = 'cultivation-neutral-ceiling-strips';
      transforms.forEach((matrix, index) => strips.setMatrixAt(index, matrix));
      strips.computeBoundingSphere();
      group.add(strips);
      const trim: THREE.Matrix4[] = [];
      const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        trim.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
      };
      for (const side of wallSides) {
        const x = side * (width / 2 - 0.19);
        box(x, 0.55, length / 2, 0.06, 0.35, length - 0.6);
        box(x, 4, length / 2, 0.04, 0.32, length - 0.6);
        for (let z = 2; z < length - 1; z += 8) box(x, height / 2, z, 0.07, height - 0.5, 0.14);
      }
      const frames = new THREE.InstancedMesh(geometry, this.metal, trim.length);
      frames.name = 'cultivation-service-bay-trims';
      trim.forEach((matrix, i) => frames.setMatrixAt(i, matrix));
      frames.computeBoundingSphere();
      group.add(frames);
    }
    if (height > 10) {
      // Keep the original low point pools, including their upward illumination.
      // Two fixed ceiling fixture keys cover traversal above those pools with
      // one depth pass each. Nothing follows a character or changes a room clock.
      for (const [index, z] of (options.fillPositionsZ ?? [10, 38]).entries()) {
        const fill = new THREE.PointLight(0xf3f2e9, 480, 48, 2);
        fill.name = `${root.name}-neutral-fill`;
        fill.position.set(0, options.fillHeightMetres ?? 10, z);
        const key = new THREE.SpotLight(0xf3f2e9, 120, 40, 1.2, .18, 2);
        key.name = `${root.name}-fixture-shadow-${index + 1}`;
        key.position.set((index === 0 ? -1 : 1) * width * .28, height - .45,
          5 + 8 * Math.round((z - 5) / 8));
        const practical=options.practicalPositions?.[index];
        if(practical){fill.position.set(...practical);key.position.set(...practical);}
        key.target.position.set(...(options.shadowTargets?.[index] ?? [0, 0, z]));
        configureCultivationTraversalLight(key);
        group.add(fill, key, key.target);
      }
    }
    root.add(group);
    this.decorations.push(group);
  }

  get diagnostics() {
    return { materialCount: 15, textureCount: this.textures.length,
      textureBytes: this.textures.reduce((sum, texture) => sum + (texture instanceof THREE.DataTexture ? texture.image.data?.byteLength??0 : texture.mipmaps.reduce((n,m)=>n+m.data.byteLength,0)), 0),
      dressedMeshCount: this.bindings.length, addedDrawCalls: this.decorations.length * 2 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.platformArt.dispose();
    const displacedBatchMaterials = new Set<THREE.Material>();
    for (const { mesh, material, geometry } of this.bindings) {
      if (!Array.isArray(mesh.material) && mesh.material.name === 'cultivation-room-3-batched-collider-material') {
        displacedBatchMaterials.add(mesh.material);
      }
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.material = material;
    }
    for (const material of displacedBatchMaterials) material.dispose();
    this.bindings.length = 0;
    const decorationGeometries = new Set<THREE.BufferGeometry>();
    for (const group of this.decorations) {
      group.removeFromParent();
      group.traverse((object) => {
        if (object instanceof THREE.Light) disposeShadowLight(object);
        if (object instanceof THREE.Mesh) decorationGeometries.add(object.geometry);
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
    }
    for (const geometry of decorationGeometries) geometry.dispose();
    this.decorations.length = 0;
    for (const material of [this.wall, this.floor, this.ceiling, this.metal, this.duct, this.platform, this.pole, this.rope, this.fixture, this.sticky,this.nurserySticky, this.acid]) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  private variant(source: THREE.MeshStandardMaterial, name: string, colour: number) {
    const material = source.clone();
    material.name = `cultivation-lab-${name}`;
    material.color.setHex(colour);
    return material;
  }

  private finish(kind: 'wall' | 'floor' | 'ceiling' | 'metal' | 'duct', colour: number, roughness: number, metalness: number) {
    const { albedo, relief, roughness: rough } = this.assets.textures(`lab-${kind}`);
    this.textures.push(albedo, relief, rough);
    return new THREE.MeshStandardMaterial({ name: `cultivation-lab-${kind}`, color: colour,
      roughness, metalness, map: albedo,
      bumpMap: relief, bumpScale: 0.018,
      roughnessMap: rough });
  }
}
