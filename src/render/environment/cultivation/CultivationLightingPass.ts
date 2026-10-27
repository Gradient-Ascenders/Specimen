import * as THREE from 'three';
import type { LevelTwoPreviewScene } from '../../../levels/LevelTwoPreviewScene.ts';
import type { GraphicsSettings } from '../../GraphicsProfiles.ts';
import { ShadowedDroneBeam } from '../../hazards/ShadowedDroneBeam.ts';
import { cultivationRadianceZone, CULTIVATION_LIGHTING_TINTS, CULTIVATION_RADIANCE_LAYOUT } from './CultivationRadianceLayout.ts';
import { CultivationRadiance } from './CultivationRadiance.ts';

const TINTS = CULTIVATION_LIGHTING_TINTS.map(([r, g, b]) => new THREE.Color(r, g, b));
const WARNING_COLOUR = new THREE.Color(1, .53, .19);
interface Fixture {
  readonly name: string;
  readonly light: THREE.PointLight | THREE.SpotLight;
  readonly colour: THREE.Color;
  readonly intensity: number;
  readonly zone: number;
  readonly dynamic: boolean;
  readonly tint: THREE.Color;
}
interface Practical {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material | THREE.Material[];
  readonly material: THREE.MeshStandardMaterial;
  readonly colour: THREE.Color;
  readonly intensity: number;
  readonly zone: number;
}

/** State-driven presentation only. Puzzle clocks, networks, platforms and
 * drone lights retain their gameplay owners. No additional live lights/maps. */
export class CultivationLightingPass {
  private readonly fixtures: Fixture[] = [];
  private readonly practicals: Practical[] = [];
  private readonly practicalMaterials = new Set<THREE.MeshStandardMaterial>();
  private readonly shafts: { light: THREE.SpotLight; beam: ShadowedDroneBeam; intensity: number }[] = [];
  private readonly heroes: { light: THREE.SpotLight; radius: number; near: number; size: THREE.Vector2 }[] = [];
  private readonly powers = CULTIVATION_RADIANCE_LAYOUT.map(() => 1);
  private readonly targetPowers = CULTIVATION_RADIANCE_LAYOUT.map(() => 1);
  private readonly point = new THREE.Vector3();
  private elapsed = 0;
  private seeded = false;
  private quality = '';
  private effectsDensity = .5;
  private disposed = false;
  private previousLift = 0;
  private previousRelease = 0;
  private readonly preview: LevelTwoPreviewScene;
  readonly radiance: CultivationRadiance;

  constructor(preview: LevelTwoPreviewScene, radiance: CultivationRadiance) {
    this.preview = preview; this.radiance = radiance;
    const origin = preview.root.getWorldPosition(new THREE.Vector3()), clones = new Map<string, THREE.MeshStandardMaterial>();
    const lights: (THREE.SpotLight | THREE.PointLight)[] = [], meshes: THREE.Mesh[] = [];
    preview.root.traverse(object => {
      if (object instanceof THREE.SpotLight || object instanceof THREE.PointLight) lights.push(object);
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    for (const light of lights) {
      const name = light.name || light.parent?.name || '';
      if (/drone|search-light|acid-reflected-light/.test(name)) continue;
      light.getWorldPosition(this.point).sub(origin);
      const zone = cultivationRadianceZone(this.point), colour = light.color.clone();
      const tint = /volt-glow/.test(name) ? new THREE.Color(1, 1, 1) : TINTS[zone];
      this.fixtures.push({ light, name, zone, colour, intensity: light.intensity, tint, dynamic: /sewer-maintenance-spill/.test(name) });
      if (light instanceof THREE.SpotLight && /fixture-shadow-|room-4-lift-light/.test(light.name)) {
        const range = Math.min(light.distance, zone >= 6 ? 8 : zone === 5 ? 22 : 15);
        const beam = new ShadowedDroneBeam(light, range, Math.min(.48, light.angle * .45),
          { colour: light.color, opacity: .012, soft: true });
        beam.mesh.name = `${light.name}-humidity-shaft`;
        Object.assign(beam.mesh.userData, { presentationOnly: true, lightingOnly: true, staticBatchExcluded: true });
        beam.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0),
          light.worldToLocal(light.target.getWorldPosition(new THREE.Vector3())).normalize());
        light.add(beam.mesh); this.shafts.push({ light, beam, intensity: light.intensity });
        if (/fixture-shadow-1$|room-4-lift-light/.test(light.name)) {
          this.heroes.push({ light, radius: light.shadow.radius, near: light.shadow.camera.near, size: light.shadow.mapSize.clone() });
          light.shadow.mapSize.set(1024, 1024);
        }
      }
    }
    for (const mesh of meshes) {
      if (!(mesh.material instanceof THREE.MeshStandardMaterial) || !mesh.material.visible ||
          mesh.material.emissiveIntensity <= 0 || !/fixture|lamp|practical/i.test(mesh.material.name)) continue;
      const original = mesh.material;
      mesh.getWorldPosition(this.point).sub(origin); const zone = cultivationRadianceZone(this.point), key = `${original.uuid}:${zone}`;
      let material = clones.get(key);
      if (!material) {
        material = original.clone(); material.onBeforeCompile = original.onBeforeCompile;
        const sourceKey = original.customProgramCacheKey(); material.customProgramCacheKey = () => `${sourceKey}:zoned-practical`;
        material.name = `${original.name}-zone-${zone}-lighting`; clones.set(key, material); this.practicalMaterials.add(material);
      }
      this.practicals.push({ mesh, original, material, zone, colour: original.emissive.clone(), intensity: original.emissiveIntensity });
      mesh.material = material;
    }
    this.update(0);
  }

  async prepare(renderer: THREE.WebGLRenderer, root: THREE.Object3D, settings: GraphicsSettings): Promise<void> {
    this.setQuality(settings, renderer.shadowMap.type);
    await this.radiance.prepare(renderer, root);
  }

  setQuality(settings: GraphicsSettings, type: THREE.ShadowMapType): void {
    const key = `${settings.shadowMapSizeCap}:${settings.effectsDensity}:${type}`;
    if (this.quality === key) return;
    this.quality = key; this.effectsDensity = settings.effectsDensity; this.radiance.setQuality(settings);
    for (const { light } of this.heroes) {
      const size = Math.min(1024, settings.shadowMapSizeCap);
      if (light.shadow.mapSize.x !== size) {
        light.shadow.dispose(); light.shadow.map = null; light.shadow.mapPass = null; light.shadow.mapSize.set(size, size);
      }
      light.shadow.camera.near = .35; light.shadow.camera.updateProjectionMatrix();
      light.shadow.radius = type === THREE.BasicShadowMap ? -light.distance : 1.5;
      light.shadow.needsUpdate = true;
    }
    for (const { beam } of this.shafts) {
      beam.setShadowType(type);
      const count = beam.mesh.geometry.index!.count;
      beam.mesh.geometry.setDrawRange(0, settings.effectsDensity <= .5 ? count / 3 : count);
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const dt = Number.isFinite(deltaSeconds) ? Math.min(.1, Math.max(0, deltaSeconds)) : 0;
    const { roomThree, roomFour, roomFive } = this.preview;
    const lift = roomFour.controller.progress, release = roomFive.controller.releaseElapsed;
    if (lift < this.previousLift || release < this.previousRelease) this.seeded = false;
    this.previousLift = lift; this.previousRelease = release; this.elapsed += dt;
    const falling = roomThree.wallDrops.some(drop => drop.state === 'falling');
    const networks = ['red', 'blue', 'green'] as const;
    const enabled = networks.filter(network => roomFive.controller.security.isEnabled(network)).length;
    const target = this.targetPowers; target.fill(1);
    target[5] = falling ? .35 + .1 * Math.sin(this.elapsed * 7) : 1;
    target[6] = target[7] = roomFour.controller.running && lift > .85 ? .72 : 1;
    target[10] = roomFive.controller.rescued ? .85 : .35 + .65 * enabled / 3;
    target[11] = roomFive.controller.brokenDroneState === 'active' ? .65 : roomFive.controller.brokenDroneState === 'rebooting' ? .8 : 1;
    for (let i = 0; i < this.powers.length; i++) this.powers[i] = this.seeded ? THREE.MathUtils.damp(this.powers[i], target[i], 5, dt) : target[i];
    this.seeded = true;
    for (const fixture of this.fixtures) {
      const { light, zone, colour, tint } = fixture, power = this.powers[zone];
      if (fixture.dynamic) { light.color.copy(colour).multiply(tint); continue; } // The existing owner drives flicker.
      light.color.copy(colour).multiply(tint).lerp(WARNING_COLOUR, (1 - power) * .5);
      let weight = light instanceof THREE.SpotLight ? zone === 5 ? 1.4 : 1.15 : zone <= 5 ? .78 : 1;
      if (/volt-glow/.test(fixture.name)) weight = roomFive.controller.rescued ? 0 : 1 - .65 * THREE.MathUtils.clamp(release / 4, 0, 1);
      light.intensity = fixture.intensity * (.34 + .66 * power) * weight;
    }
    for (const practical of this.practicals) {
      practical.material.emissive.copy(practical.colour).multiply(TINTS[practical.zone]);
      practical.material.emissiveIntensity = practical.intensity * (.34 + .66 * this.powers[practical.zone]);
    }
    for (const { light, beam, intensity } of this.shafts) {
      beam.mesh.material.uniforms.beamColor.value.copy(light.color);
      beam.mesh.material.uniforms.beamOpacity.value = .012 * this.effectsDensity * Math.min(1.4, light.intensity / intensity);
      beam.mesh.visible = light.intensity > .001;
    }
    this.radiance.setState(this.powers, lift, this.elapsed);
  }

  get diagnostics() { return { ...this.radiance.diagnostics, shafts: this.shafts.length, heroShadows: this.heroes.length,
    additionalLights: 0, additionalShadowMaps: 0, liveStateSources: ['descending-walls', 'lift', 'security-networks', 'volt-release', 'sewer-drone'] }; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.radiance.dispose();
    for (const fixture of this.fixtures) { fixture.light.color.copy(fixture.colour); if (!fixture.dynamic) fixture.light.intensity = fixture.intensity; }
    for (const { light, radius, near, size } of this.heroes) { light.shadow.radius = radius; light.shadow.camera.near = near; light.shadow.mapSize.copy(size); light.shadow.camera.updateProjectionMatrix(); }
    for (const practical of this.practicals) practical.mesh.material = practical.original;
    for (const material of this.practicalMaterials) material.dispose();
    for (const { beam } of this.shafts) { beam.mesh.removeFromParent(); beam.mesh.geometry.dispose(); beam.mesh.material.dispose(); }
  }
}
