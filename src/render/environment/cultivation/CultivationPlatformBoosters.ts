import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import { optimizeFiniteLightEvaluation } from './FiniteLightEvaluation.ts';

/** Visual lift engines. No forces, colliders, platform motion or damage volumes. */
export class CultivationPlatformBoosters {
  readonly root = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly jets: { position: THREE.Vector3; score: number; id: number }[] = [];
  private readonly lamps: { light: THREE.PointLight; jet: number }[] = [];
  private readonly clock = { value: 0 };
  private readonly observer = new THREE.Vector3();
  private disposed = false;

  constructor(room: LevelTwoRoomFiveGreybox, maps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }) {
    this.root.name = 'room-5-platform-boosters'; this.root.userData.presentationOnly = true;
    const iron = new THREE.MeshStandardMaterial({ color: 0x89725b, roughness: .94, metalness: .4,
      bumpMap: maps?.bumpMap ?? null, roughnessMap: maps?.roughnessMap ?? null, bumpScale: .02 });
    const soot = new THREE.MeshStandardMaterial({ color: 0x222622, roughness: .9, metalness: .35 });
    const hot = new THREE.MeshBasicMaterial({ color: 0xffb36a, toneMapped: false });
    const flame = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    optimizeFiniteLightEvaluation(iron); optimizeFiniteLightEvaluation(soot);
    this.materials.push(iron, soot, hot, flame);
    flame.onBeforeCompile = shader => {
      shader.uniforms.uBoosterTime = this.clock;
      shader.vertexShader = 'uniform float uBoosterTime; varying float vBoosterPulse; varying float vBoosterEdge;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = instanceMatrix[3].x * 3.7 + instanceMatrix[3].z * 1.9;
        vBoosterPulse = .94 + .06 * sin(uBoosterTime * 13.0 + phase) * sin(uBoosterTime * 7.0 + phase);
        transformed.y *= vBoosterPulse;
        transformed.x += .025 * sin(uBoosterTime * 17.0 + phase - position.y * 8.0) * -position.y;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec3 jetNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vBoosterEdge = pow(abs(dot(jetNormal, normalize(-mvPosition.xyz))), .7);
      `);
      shader.fragmentShader = 'varying float vBoosterPulse; varying float vBoosterEdge;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= vBoosterPulse * vBoosterEdge;');
    };
    flame.customProgramCacheKey = () => 'cultivation-platform-exhaust-v1';
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3) => {
      geometry.translate(position.x, position.y, position.z);
      const list = parts.get(material) ?? []; list.push(geometry); parts.set(material, list);
    };
    for (const object of room.root.children) {
      if (!(object instanceof THREE.Mesh) || !/^room-5-(route-\d+-jump-\d+|safe-\d+-deck|release-quiet-walk)$/.test(object.name)) continue;
      const top = object.geometry instanceof THREE.BoxGeometry ? object.geometry.parameters.height / 2 : 0;
      const at = object.position.clone(); at.y += top;
      // The existing underside socket becomes the engine mount. All parts sit
      // below the tread and inside the platform's existing horizontal footprint.
      add(new THREE.CylinderGeometry(.27, .34, .42, 12, 1, true).translate(0, -.91, 0), iron, at);
      add(new THREE.CylinderGeometry(.34, .27, .18, 12, 1, true).translate(0, -1.21, 0), soot, at);
      add(new THREE.TorusGeometry(.34, .04, 6, 12).rotateX(Math.PI / 2).translate(0, -1.13, 0), iron, at);
      add(new THREE.TorusGeometry(.25, .022, 5, 12).rotateX(Math.PI / 2).translate(0, -1.30, 0), hot, at);
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(.075, .33, .12).translate(side * .29, -.88, 0), soot, at);
        add(new THREE.CylinderGeometry(.045, .045, .04, 6).rotateZ(Math.PI / 2)
          .translate(side * .35, -.86, 0), iron, at);
      }
      this.jets.push({position: at.add(new THREE.Vector3(0, -1.32, 0)), score: 0, id: this.jets.length});
    }
    for (const [material, geometries] of parts) {
      const geometry = mergeGeometries(geometries)!; geometries.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, material); mesh.name = 'room-5-booster-engine-hardware';
      mesh.userData.shadowProxyReceiver = true; mesh.userData.presentationOnly = true;
      this.root.add(mesh); this.meshes.push(mesh);
    }
    const flames: THREE.BufferGeometry[] = [];
    for (const core of [false, true]) {
      const length = core ? .38 : .85;
      const geometry = new THREE.ConeGeometry(core ? .09 : .23, length, 9, 1, true)
        .rotateZ(Math.PI).translate(0, -length / 2, 0);
      const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
      const base = new THREE.Color(core ? 0xd8f2ff : 0xff8a32), color = new THREE.Color();
      for (let i = 0; i < positions.count; i++) {
        const fade = THREE.MathUtils.clamp(1 + positions.getY(i) / length, 0, 1);
        color.copy(base).multiplyScalar(fade).toArray(colors, i * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); flames.push(geometry);
    }
    const flameGeometry = mergeGeometries(flames)!; flames.forEach(g => g.dispose());
    const exhaust = new THREE.InstancedMesh(flameGeometry, flame, this.jets.length);
    exhaust.name = 'room-5-platform-booster-flames'; exhaust.userData.presentationOnly = true;
    const matrix = new THREE.Matrix4();
    for (const jet of this.jets) exhaust.setMatrixAt(jet.id, matrix.makeTranslation(jet.position));
    exhaust.computeBoundingSphere(); this.root.add(exhaust); this.meshes.push(exhaust);
    // Two stable slots, no shadow maps and no per-platform light proliferation.
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffa65b, 0, 6, 2);
      light.name = `room-5-platform-booster-spill-${i}`;
      this.root.add(light); this.lamps.push({light, jet: -1});
    }
    room.root.add(this.root); this.reset();
  }

  update(dt: number, bobWorldPosition?: { readonly x: number; readonly y: number; readonly z: number }): void {
    if (this.disposed) return;
    this.clock.value += dt;
    if (bobWorldPosition) this.root.worldToLocal(this.observer.copy(bobWorldPosition));
    for (const jet of this.jets) jet.score = jet.position.distanceToSquared(this.observer);
    this.jets.sort((a, b) => a.score - b.score || a.id - b.id);
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i], nearest = this.jets[i];
      if (!nearest) continue;
      const target = nearest.score < 14 * 14 ? nearest.id : -1;
      if (lamp.jet !== target) {
        lamp.light.intensity = Math.max(0, lamp.light.intensity - dt * 24);
        if (lamp.light.intensity === 0) {
          lamp.jet = target; lamp.light.position.copy(nearest.position); lamp.light.position.y -= .15;
        }
      } else {
        const power = target < 0 ? 0 : 6 * (.96 + .04 * Math.sin(this.clock.value * 9 + target));
        lamp.light.intensity = THREE.MathUtils.damp(lamp.light.intensity, power, 8, dt);
      }
    }
  }

  reset(): void {
    this.clock.value = 0; this.observer.set(-12, 10.66, 23);
    for (const lamp of this.lamps) { lamp.jet = -1; lamp.light.intensity = 0; }
    this.update(0);
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.root.removeFromParent();
    for (const mesh of this.meshes) { mesh.geometry.dispose(); if (mesh instanceof THREE.InstancedMesh) mesh.dispose(); }
    for (const material of this.materials) material.dispose();
    for (const lamp of this.lamps) lamp.light.dispose();
  }
}
