import * as THREE from 'three';

import { createBorrowedBox, createInstancedBoxes,
  type BoxInstanceTransform } from '../render/environment/containment/ContainmentModularComponents.ts';
import { CONTAINMENT_IDENTIFICATION_COLOURS, createContainmentExperimentDirectoryTexture } from '../render/environment/containment/ContainmentProceduralTextures.ts';
import type { TitleScreenScene } from '../ui/TitleScreenScene.ts';
import { OPENING_GAME_TIMING as T, openingEase, type OpeningGameFrame } from './OpeningGameTimeline.ts';
import { OpeningRoomOne, OPENING_ROOM_ONE_LAYOUT as R } from './OpeningRoomOne.ts';
import { OpeningLaboratoryAsset } from './OpeningLaboratoryAsset.ts';

export const OPENING_EXPERIMENTS = [
  { code: 'SP-08', specimen: 'PLUTO', threat: 'LOW', colour: CONTAINMENT_IDENTIFICATION_COLOURS.low, side: -1, z: 60 },
  { code: 'SP-12', specimen: 'MIMIC', threat: 'HIGH', colour: 0xe9b05a, side: 1, z: 47 },
  { code: 'SP-02', specimen: 'GOOP', threat: 'CRITICAL', colour: CONTAINMENT_IDENTIFICATION_COLOURS.critical, side: -1, z: 34 },
  { code: 'SP-03', specimen: 'VOLT', threat: 'CRITICAL', colour: CONTAINMENT_IDENTIFICATION_COLOURS.critical, side: 1, z: 21 },
  { code: 'SP-01', specimen: 'BOB', threat: 'UNKNOWN', colour: CONTAINMENT_IDENTIFICATION_COLOURS.unknown, side: 0, z: R.doorwayZ },
] as const;

export const OPENING_LAB_LAYOUT = Object.freeze({ frontZ: 6.2, backZ: 80.2, startZ: 72, endZ: 10.3,
  centreX: R.doorwayX, halfWidth: 3.4, eyeHeight: 2.5, labelHeight: 3.2, far: 108 });
export const OPENING_DOOR_SHOTS = [5.46, 10.66, 15.86, 21.06, 24.3] as const;
const DOOR_READ_END_OFFSET = 0.4;

/** A presentation-only wing. No gameplay room, physics, feed textures or extra lights. */
export class OpeningLaboratory {
  readonly root = new THREE.Group();
  readonly observatory = new THREE.Group();
  readonly menuEnvironment = new THREE.Group();
  readonly roomOne: OpeningRoomOne;
  readonly entrance = new THREE.Group();
  readonly doorLeaves = [new THREE.Group(), new THREE.Group()] as const;
  readonly labelTexture = createContainmentExperimentDirectoryTexture(OPENING_EXPERIMENTS);
  readonly labels: THREE.Mesh[] = [];
  readonly cameraHeads: THREE.Group[] = [];
  readonly cameraTilts: THREE.Group[] = [];
  readonly authored = new OpeningLaboratoryAsset();

  private readonly room: TitleScreenScene;
  private readonly materials = new Set<THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly instances = new Set<THREE.InstancedMesh>();
  private readonly shellProxy = new THREE.Group();
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly cameraMaterial: THREE.MeshStandardMaterial;
  private readonly point = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly entryLook = new THREE.Vector3(R.doorwayX, OPENING_LAB_LAYOUT.eyeHeight, 4);
  private readonly eggLook = new THREE.Vector3(0, 2.15, -0.5);
  private readonly mainKeyPosition: THREE.Vector3;
  private readonly mainKeyTarget: THREE.Vector3;
  private readonly rim: THREE.PointLight;
  private readonly diffuser: THREE.PointLight;
  private readonly fill: THREE.HemisphereLight;
  private readonly mainRimPosition: THREE.Vector3;
  private readonly mainDiffuserPosition: THREE.Vector3;
  private readonly corridorKeyColour = new THREE.Color(0xe5f1f4);
  private readonly podKeyColour = new THREE.Color(0xffefd9);
  private disposed = false;

  constructor(room: TitleScreenScene) {
    this.room = room;
    this.root.name = 'opening-experiment-wing';
    this.observatory.name = 'opening-observatory-render-scope';
    this.entrance.name = 'opening-bob-doorway';
    this.menuEnvironment.name = 'opening-original-menu-environment';
    this.root.position.x = R.doorwayX;
    this.entrance.position.set(R.doorwayX, 0, R.doorwayZ - 5.7);
    for (const root of [this.root, this.observatory, this.entrance]) {
      root.userData.presentationOnly = true;
      root.userData.visualOnly = true;
    }
    // Original resources remain owned by TitleScreenScene. Only their visibility
    // is scoped; the actual menu pod, egg and hero are not cloned.
    for (const child of [...room.scene.children]) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Group) this.observatory.add(child);
    }
    for (const child of [...this.observatory.children]) {
      if (/^title-(room-|floor-panel|observatory-|recessed-wall|ceiling-light|wall-light)/.test(child.name)) this.menuEnvironment.add(child);
    }
    this.roomOne = new OpeningRoomOne(room.resources);
    this.roomOne.root.visible = false;
    this.observatory.add(this.menuEnvironment, this.roomOne.root);
    room.scene.add(this.observatory, this.root, this.entrance);
    this.mainKeyPosition = room.keyLight.position.clone();
    this.mainKeyTarget = room.keyLight.target.position.clone();
    this.rim = room.scene.getObjectByName('title-laboratory-rim') as THREE.PointLight;
    this.diffuser = room.scene.getObjectByName('title-chamber-diffuser') as THREE.PointLight;
    this.fill = room.scene.children.find(child => child instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    this.mainRimPosition = this.rim.position.clone();
    this.mainDiffuserPosition = this.diffuser.position.clone();

    this.labelMaterial = new THREE.MeshStandardMaterial({ name: 'opening-shared-directory-material',
      map: this.labelTexture, emissiveMap: this.labelTexture, emissive: 0xffffff, emissiveIntensity: 0.9,
      roughness: 0.65, metalness: 0.05 });
    this.materials.add(this.labelMaterial);
    this.cameraMaterial = new THREE.MeshStandardMaterial({ name: 'opening-camera-painted-housing',
      color: 0xffffff, roughness: 0.4, metalness: 0.35, emissive: 0x111c24, emissiveIntensity: 0.08 });
    this.materials.add(this.cameraMaterial);
    this.buildWing();
    this.buildEntrance();
    this.root.add(this.authored.root);

    this.root.visible = false;
  }

  async prepare(): Promise<void> {
    await this.roomOne.prepare();
    if (this.disposed) return;
    await this.authored.prepare(name=>this.roomOne.borrowShellFinish(name));
    if (this.disposed) return;
    this.shellProxy.visible=false;
    for(const tilt of this.cameraTilts){
      if(tilt.getObjectByName('opening-authored-surveillance-camera'))continue;
      for(const child of [...tilt.children]){
        if(!child.name.endsWith('-recording-led'))child.removeFromParent();
      }
      this.authored.attachCamera(tilt);
    }
  }

  apply(frame: OpeningGameFrame, reducedMotion: boolean): void {
    const t = frame.seconds;
    const inWing = t >= T.blackoutEnd && t < T.hatchStart;
    this.root.visible = inWing;
    this.observatory.visible = t < T.blackoutEnd || t >= T.doorStart;
    this.entrance.visible = true;
    this.doorLeaves[0].position.x = -frame.doorOpen * 1.64;
    this.doorLeaves[1].position.x = frame.doorOpen * 1.64;
    for (let index = 0; index < this.cameraHeads.length; index++) {
      this.cameraHeads[index].rotation.y = reducedMotion ? 0 : Math.sin(t * 0.7 + index * 1.3) * 0.82;
      this.cameraTilts[index].rotation.x = 0.18 + (reducedMotion ? 0 : Math.sin(t * 1.05 + index * 0.9) * 0.12);
    }
    // Exactly the existing four light slots, never a light for each door/camera.
    // The opaque UI scrim is gone: do not compensate with a blown-out key or
    // a strong purple rim. Labels retain their own low-cost emissive atlas.
    const menu = t < T.blackoutEnd;
    this.menuEnvironment.visible = menu;
    this.roomOne.root.visible = !menu;
    this.room.setPodCeilingHeight(menu ? 7 : R.ceilingY);
    const roomBlend = menu ? 1 : openingEase(T.doorStart, T.hatchStart, t);
    this.room.keyLight.position.lerpVectors(this.point.set(R.doorwayX, 4.4, 41), this.mainKeyPosition, roomBlend);
    this.room.keyLight.target.position.lerpVectors(this.point.set(R.doorwayX, 0, 40), this.mainKeyTarget, roomBlend);
    this.room.keyLight.intensity = menu ? 205 : THREE.MathUtils.lerp(210, 165, roomBlend);
    if(menu)this.room.keyLight.color.setHex(0xd9f8f2);
    else this.room.keyLight.color.copy(this.corridorKeyColour).lerp(this.podKeyColour,roomBlend);
    this.rim.position.lerpVectors(this.point.set(R.doorwayX, 3.8, 59), this.mainRimPosition, roomBlend);
    this.rim.color.setHex(menu ? 0xaca2e6 : 0xb0cbd1);
    this.rim.distance = menu ? 9 : THREE.MathUtils.lerp(28, 9, roomBlend);
    this.rim.intensity = menu ? 36 : THREE.MathUtils.lerp(100, 14, roomBlend);
    this.diffuser.position.lerpVectors(this.point.set(R.doorwayX, 3.8, 22), this.mainDiffuserPosition, roomBlend);
    this.diffuser.distance = menu ? 3 : THREE.MathUtils.lerp(28, 3.5, roomBlend);
    this.diffuser.intensity = menu ? 3.5 : THREE.MathUtils.lerp(80, 2.4, roomBlend);
    this.diffuser.color.setHex(menu?0x99e6d7:0xb9e6f4);
    if(!menu&&!reducedMotion&&t>=T.crackOne&&t<T.crackComplete){
      // A soft internal lift follows the three existing crack/audio beats.
      // No flash layer, added light or per-frame allocation.
      const age=t-(t<T.crackTwo?T.crackOne:t<T.crackThree?T.crackTwo:T.crackThree);
      this.diffuser.intensity+=1.5*Math.sin(Math.min(1,age/.9)*Math.PI)**2;
    }
    this.fill.intensity = menu ? 0.68 : THREE.MathUtils.lerp(0.8, 0.58, roomBlend);
    if (this.room.scene.fog instanceof THREE.FogExp2) this.room.scene.fog.density = THREE.MathUtils.lerp(0.009, 0.035, roomBlend);
  }

  poseCamera(seconds: number, aspect: number): void {
    const camera = this.room.camera;
    camera.clearViewOffset();
    if (seconds < T.entryStart) {
      // Constant-height, always-forward dolly. Horizontal angles are blended
      // explicitly: interpolating two world look-at points can cross directly
      // above the lens and produce the old roofward swing.
      const z = this.dollyZ(seconds);
      camera.position.set(R.doorwayX, OPENING_LAB_LAYOUT.eyeHeight, z);
      let index = 0;
      while (index < OPENING_DOOR_SHOTS.length - 1 && seconds > OPENING_DOOR_SHOTS[index] + DOOR_READ_END_OFFSET) index++;
      const panStart = index === 0 ? T.labVisible - 0.5 : OPENING_DOOR_SHOTS[index - 1] + DOOR_READ_END_OFFSET;
      const panEnd = OPENING_DOOR_SHOTS[index] - (index === OPENING_DOOR_SHOTS.length - 1 ? 0.2 : 1.5);
      const blend = openingEase(panStart, panEnd, seconds);
      const startYaw = index === 0 ? 0 : this.doorYaw(index - 1, this.dollyZ(panStart));
      // Ease out of tracking the previous door before it passes behind us.
      // The soft limit retains angular velocity at the join without a backwards
      // whip-pan or an abrupt hard angle clamp.
      const previousYaw = index === 0 ? 0 : startYaw + 0.12 * Math.tanh((this.doorYaw(index - 1, z) - startYaw) / 0.12);
      const yaw = THREE.MathUtils.lerp(previousYaw, this.doorYaw(index, z), blend);
      const previousPitch = index === 0 ? 0 : this.doorPitch(index - 1, z);
      // Level pan first, then a small upward tilt once facing the plaque.
      const pitch = previousPitch * (1 - openingEase(panStart, panStart + 0.7, seconds)) +
        this.doorPitch(index, z) * openingEase(panEnd + 0.15, panEnd + 0.9, seconds);
      const faceForward = openingEase(T.doorClear - 0.6, T.entryStart, seconds);
      camera.rotation.set(pitch * (1 - faceForward), yaw * (1 - faceForward), 0, 'YXZ');
    } else {
      const progress = THREE.MathUtils.clamp((seconds - T.entryStart) / (T.hatchStart - T.entryStart), 0, 1);
      camera.position.set(THREE.MathUtils.lerp(R.doorwayX, 3.65, openingEase(0.7, 1, progress)),
        OPENING_LAB_LAYOUT.eyeHeight + 0.35 * openingEase(0.7, 1, progress),
        THREE.MathUtils.lerp(OPENING_LAB_LAYOUT.endZ, 3.65, progress));
      this.lookTarget.lerpVectors(this.entryLook, this.eggLook, progress);
      camera.lookAt(this.lookTarget);
    }
    const baseFov = THREE.MathUtils.lerp(58, 50, openingEase(T.entryStart, T.hatchStart, seconds));
    camera.fov = Math.min(seconds < T.entryStart ? 112 : 78, THREE.MathUtils.radToDeg(2 * Math.atan(
      Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) / Math.min(1, aspect))));
    camera.far = OPENING_LAB_LAYOUT.far;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  private dollyZ(seconds: number): number {
    const progress = THREE.MathUtils.clamp((seconds - T.labReveal) / (T.entryStart - T.labReveal), 0, 1);
    return THREE.MathUtils.lerp(OPENING_LAB_LAYOUT.startZ, OPENING_LAB_LAYOUT.endZ, progress);
  }

  private doorYaw(index: number, z: number): number {
    const entry = OPENING_EXPERIMENTS[index];
    return THREE.MathUtils.clamp(Math.atan2(-entry.side * 3.04, z - entry.z), -1.95, 1.95);
  }

  private doorPitch(index: number, z: number): number {
    const entry = OPENING_EXPERIMENTS[index];
    const height = entry.side ? OPENING_LAB_LAYOUT.labelHeight : 4.22;
    return Math.min(0.245, Math.atan2(height - OPENING_LAB_LAYOUT.eyeHeight, Math.hypot(entry.side * 3.04, z - entry.z)));
  }
  showAllForPreparation(): void {
    this.root.visible = true;
    this.observatory.visible = true;
    // Prepare the authored gameplay room, never both environment shells at once.
    this.menuEnvironment.visible = false;
    this.roomOne.root.visible = true;
    this.entrance.visible = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.authored.dispose();
    this.roomOne.dispose();
    this.room.setPodCeilingHeight(7);
    for (const instance of this.instances) instance.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.labelTexture.dispose();
    this.root.removeFromParent(); this.entrance.removeFromParent();
    this.observatory.add(...this.menuEnvironment.children);
    this.menuEnvironment.removeFromParent();
    this.room.scene.add(...this.observatory.children);
    this.observatory.removeFromParent();
    this.root.clear(); this.entrance.clear();
  }

  private buildWing(): void {
    const resources = this.room.resources, m = resources.materials;
    const batches = new Map<THREE.Material, BoxInstanceTransform[]>();
    const indicators = new Map<THREE.Material,BoxInstanceTransform[]>();
    const box = (material: THREE.Material, size: readonly [number, number, number],
      position: readonly [number, number, number], rotation?: readonly [number, number, number]) => {
      let entries = batches.get(material);
      if (!entries) { entries = []; batches.set(material, entries); }
      entries.push({ size, position, rotation });
    };
    const length = OPENING_LAB_LAYOUT.backZ - OPENING_LAB_LAYOUT.frontZ;
    // A small synchronous proxy supports CPU-only storyboard tools. Production
    // replaces it with the Blender set under the opaque preparation cover.
    this.shellProxy.name='opening-wing-preparation-proxy';
    this.root.add(this.shellProxy);
    const centreZ = (OPENING_LAB_LAYOUT.backZ + OPENING_LAB_LAYOUT.frontZ) / 2;
    box(m.clinicalFloor, [6.8, 0.2, length], [0, -0.1, centreZ]);
    box(m.mechanicalBacking, [6.8, 0.2, length], [0, 4.7, centreZ]);
    box(m.mechanicalBacking, [6.8, 4.6, 0.2], [0, 2.3, OPENING_LAB_LAYOUT.backZ]);
    for (const side of [-1, 1]) {
      box(m.mainCeramic, [0.18, 4.6, length], [side * 3.4, 2.3, centreZ]);
      box(m.graphite, [0.12, 0.32, length], [side * 3.27, 0.2, centreZ]);
      box(m.graphite, [0.12, 0.16, length], [side * 3.27, 4.35, centreZ]);
      box(m.structuralSteel, [0.09, 0.1, length - 1], [side * 2.8, 4.42, centreZ]);
      box(m.staticCyanEmissive, [0.035, 0.025, length - 3], [side * 2.9, 0.02, centreZ]);
    }
    for (let z = 7; z < OPENING_LAB_LAYOUT.backZ - 2; z += 6) {
      box(m.graphite, [6.6, 0.05, 0.025], [0, 0.01, z]);
      // The first bay is already supported by the full-width door transom.
      // A second beam at z=7 sits in front of Bob's plaque and hides its text.
      if (z > 7) box(m.graphite, [6.7, 0.16, 0.24], [0, 4.4, z]);
      box(m.neutralFixture, [2.2, 0.035, 0.28], [0, 4.48, z + 2]);
    }
    OPENING_EXPERIMENTS.slice(0, -1).forEach((entry, index) => {
      const angle = entry.side === -1 ? Math.PI / 2 : -Math.PI / 2;
      const place = (material: THREE.Material, size: readonly [number, number, number], x: number, y: number, z: number) => {
        box(material, size, [entry.side * 3.2 + Math.sin(angle) * z, y, entry.z - Math.sin(angle) * x], [0, angle, 0]);
      };
      place(m.graphite, [2.9, 3.05, 0.14], 0, 1.525, 0);
      place(m.secondaryCeramic, [2.5, 2.75, 0.1], 0, 1.385, 0.1);
      place(m.gasket, [0.035, 2.65, 0.025], 0, 1.385, 0.165);
      place(m.graphite, [1.2, 0.26, 0.035], 0, 2.1, 0.17);
      place(m.serviceMetal, [2.7, 0.12, 0.22], 0, 0.06, 0.1);
      place(m.graphite, [3.02, 0.84, 0.12], 0, OPENING_LAB_LAYOUT.labelHeight, 0.08);
      const statusMaterial=entry.threat==='LOW'?m.staticCyanEmissive:m.warningStatus;
      let statuses=indicators.get(statusMaterial);
      if(!statuses){statuses=[];indicators.set(statusMaterial,statuses);}
      statuses.push({size:[.38,.04,.025],position:[entry.side*3.17,2.7,entry.z-Math.sin(angle)*.7],rotation:[0,angle,0]});
      const label = this.makeLabel(index, 2.85, 0.7125);
      label.position.set(entry.side * 3.04, OPENING_LAB_LAYOUT.labelHeight, entry.z);
      label.rotation.y = angle;
      this.root.add(label);
      place(m.structuralSteel, [0.3, 0.48, 0.12], -1.85, 3.9, 0.08);
      place(m.structuralSteel, [0.14, 0.12, 0.62], -1.85, 3.97, 0.28);
      const mount = new THREE.Group(), head = new THREE.Group(), tilt = new THREE.Group();
      mount.name = `opening-surveillance-camera-${index}`;
      mount.position.set(entry.side * 2.74, 3.73, entry.z + Math.sin(angle) * 1.85);
      mount.rotation.y = angle; mount.add(head); head.add(tilt); this.root.add(mount);
      head.name = `${mount.name}-pan`; tilt.name = `${mount.name}-tilt`;
      this.buildCamera(tilt, mount.name);
      // Shadowless gimbals scan without redrawing the static corridor depth.
      this.cameraHeads.push(head); this.cameraTilts.push(tilt);
    });
    let index = 0;
    for (const [material, entries] of batches) {
      const mesh = createInstancedBoxes(resources, `opening-wing-static-batch-${index++}`, material, entries);
      mesh.receiveShadow = true;
      mesh.castShadow = material !== m.neutralFixture && material !== m.staticCyanEmissive;
      this.instances.add(mesh); this.shellProxy.add(mesh);
    }
    for(const [material,entries] of indicators){
      const mesh=createInstancedBoxes(resources,`opening-chamber-status-${index++}`,material,entries);
      this.instances.add(mesh);this.root.add(mesh);
    }
  }

  private buildCamera(tilt: THREE.Group, name: string): void {
    const resources = this.room.resources;
    type Part = BoxInstanceTransform & { colour: number };
    const housing: Part[] = [
      { size: [0.48, 0.3, 0.66], position: [0, 0, 0.15], colour: 0xc2c9c9 },
      { size: [0.57, 0.045, 0.79], position: [0, 0.177, 0.18], colour: 0xd7dfdf },
      { size: [0.035, 0.24, 0.69], position: [-0.263, 0.035, 0.18], colour: 0x72868c },
      { size: [0.035, 0.24, 0.69], position: [0.263, 0.035, 0.18], colour: 0x72868c },
      { size: [0.45, 0.27, 0.035], position: [0, 0, 0.498], colour: 0x18262c },
      { size: [0.36, 0.065, 0.48], position: [0, -0.18, 0.1], colour: 0x42535c },
    ];
    for (let index = 0; index < 4; index++) housing.push({ size: [0.23, 0.024, 0.018],
      position: [0, -0.04 + index * 0.05, -0.187], colour: 0x18262c });
    const lenses: Part[] = [
      { size: [0.13, 0.13, 0.13], position: [0, 0, 0.55], rotation: [Math.PI / 2, 0, 0], colour: 0x263c45 },
      { size: [0.15, 0.055, 0.15], position: [0, 0, 0.617], rotation: [Math.PI / 2, 0, 0], colour: 0x72868c },
      { size: [0.108, 0.014, 0.108], position: [0, 0, 0.652], rotation: [Math.PI / 2, 0, 0], colour: 0x79b4c6 },
      { size: [0.092, 0.06, 0.092], position: [-0.29, -0.03, 0], rotation: [0, 0, Math.PI / 2], colour: 0x42535c },
      { size: [0.092, 0.06, 0.092], position: [0.29, -0.03, 0], rotation: [0, 0, Math.PI / 2], colour: 0x42535c },
    ];
    // Many housing/lens details, still only two pooled draws and one recording
    // LED per camera. Only the two parent joints change during playback.
    const parts = (geometry: THREE.BufferGeometry, transforms: Part[], suffix: string) => {
      const mesh = new THREE.InstancedMesh(geometry, this.cameraMaterial, transforms.length);
      mesh.name = `${name}-${suffix}`;
      mesh.userData.visualOnly = true; mesh.userData.presentationOnly = true;
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
      const quaternion = new THREE.Quaternion(), rotation = new THREE.Euler(), colour = new THREE.Color();
      transforms.forEach((transform, index) => {
        position.set(...transform.position); scale.set(...transform.size);
        rotation.set(...(transform.rotation ?? [0, 0, 0])); quaternion.setFromEuler(rotation);
        mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
        mesh.setColorAt(index, colour.setHex(transform.colour));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.instances.add(mesh); tilt.add(mesh);
    };
    parts(resources.geometries.unitBox, housing, 'housing');
    parts(resources.geometries.unitCylinder, lenses, 'optics-and-hinges');
    tilt.add(createBorrowedBox(resources, { name: `${name}-recording-led`, size: [0.03, 0.03, 0.02],
      material: resources.materials.lockedStatus, position: [0.185, 0.075, 0.527] }));
  }

  private buildEntrance(): void {
    const resources = this.room.resources, m = resources.materials;
    const batches = new Map<THREE.Material, { transforms: BoxInstanceTransform[]; names: string[] }>();
    const add = (name: string, size: readonly [number, number, number], position: readonly [number, number, number],
      material: THREE.Material) => {
      let batch = batches.get(material);
      if (!batch) { batch = { transforms: [], names: [] }; batches.set(material, batch); }
      batch.transforms.push({ size, position }); batch.names.push(`opening-bob-door-${name}`);
    };
    // Actual sliding pockets, not solid jambs intersected by moving leaves.
    // Front/back skins hide each leaf only after it enters the empty channel.
    for (const side of [-1, 1]) {
      add(`pocket-${side}-front`, [1.77, 3.95, 0.22], [side * 2.435, 1.975, 6.09], m.graphite);
      add(`pocket-${side}-back`, [1.77, 3.95, 0.22], [side * 2.435, 1.975, 5.31], m.graphite);
      add(`pocket-${side}-end`, [0.05, 3.95, 0.96], [side * 3.295, 1.975, 5.7], m.graphite);
    }
    add('header', [6.64, 0.24, 1.1], [0, 4.06, 5.65], m.graphite);
    add('front-transom-lip', [6.64, 0.2, 0.22], [0, 3.94, 6.09], m.graphite);
    add('rear-transom-lip', [6.64, 0.2, 0.22], [0, 3.94, 5.31], m.graphite);
    add('upper-guide', [6.54, 0.06, 0.38], [0, 3.93, 5.7], m.serviceMetal);
    add('full-width-transom', [6.8, 0.54, 1.1], [0, 4.43, 5.65], m.mainCeramic);
    add('upper-wall', [6.8, 3.95, 0.5], [0, 6.075, 5.55], m.mainCeramic);
    add('label-backing', [3.2, 0.84, 0.12], [0, 4.22, 6.16], m.graphite);
    add('threshold', [3.1, 0.04, 1], [0, 0.02, 5.65], m.serviceMetal);
    let batchIndex = 0;
    for (const [material, batch] of batches) {
      const mesh = createInstancedBoxes(resources, `opening-bob-door-static-batch-${batchIndex++}`, material, batch.transforms);
      mesh.userData.staticBatchSourceNames = batch.names;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.instances.add(mesh); this.entrance.add(mesh);
    }
    const label = this.makeLabel(OPENING_EXPERIMENTS.length - 1, 3, 0.75);
    label.position.set(0, 4.22, 6.235); this.entrance.add(label);
    this.doorLeaves.forEach((leaf, index) => {
      leaf.name = `opening-bob-door-leaf-${index}`;
      const sign = index === 0 ? -1 : 1;
      const panel = createBorrowedBox(resources, { name: `${leaf.name}-panel`, size: [1.55, 3.82, 0.15],
        position: [sign * 0.775, 1.97, 5.7], material: m.secondaryCeramic });
      panel.castShadow = true; panel.receiveShadow = true;
      leaf.add(panel, createBorrowedBox(resources, { name: `${leaf.name}-vertical-seal`, size: [0.025, 3.7, 0.025],
        position: [sign * 0.015, 1.97, 5.79], material: m.gasket }));
      this.entrance.add(leaf);
    });
  }

  private makeLabel(index: number, width: number, height: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, height);
    this.geometries.add(geometry);
    const uv = geometry.getAttribute('uv'), rowHeight = this.labelTexture.userData.rowHeight;
    for (let vertex = 0; vertex < uv.count; vertex++) uv.setY(vertex,
      (index * rowHeight + (1 - uv.getY(vertex)) * rowHeight) / this.labelTexture.image.height);
    uv.needsUpdate = true;
    const label = new THREE.Mesh(geometry, this.labelMaterial);
    label.name = `opening-experiment-label-${OPENING_EXPERIMENTS[index].specimen.toLowerCase()}`;
    label.userData.labelLines = this.labelTexture.userData.directoryLines[index];
    label.userData.visualOnly = true;
    this.labels.push(label);
    return label;
  }
}
