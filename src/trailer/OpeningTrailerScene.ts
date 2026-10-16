import * as THREE from 'three';

import { BobCharacterPresentation } from '../render/bob/BobCharacterPresentation.ts';
import { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { createBorrowedBox, createChamferedBox } from '../render/environment/containment/ContainmentModularComponents.ts';
import { RoomOneArt } from '../render/environment/containment/RoomOneArt.ts';
import { OPENING_TRAILER_TIMING, sampleOpeningTrailer, type OpeningTrailerFrame } from './OpeningTrailerTimeline.ts';
import { TrailerEggFracture } from './TrailerEggFracture.ts';

export const TRAILER_BOB_CLEARANCE_RADIUS_METRES = 0.34;
const BOB_HATCH_CENTRE = new THREE.Vector3(0.025, 0, -0.48);

/** Capture-only Room 1 composition: no gameplay bodies, hazards or other rooms. */
export class OpeningTrailerScene {
  readonly root = new THREE.Group();
  readonly resources = new ContainmentArtResources();
  readonly room = new RoomOneArt(this.resources);
  readonly bob = new BobCharacterPresentation(0.45);
  readonly doorLeaves = [new THREE.Group(), new THREE.Group()] as const;
  readonly eggFracture: TrailerEggFracture;
  readonly roomLights: readonly THREE.Light[];

  private readonly entrancePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4.3, 1.82, 9.4),
    new THREE.Vector3(4.3, 1.82, 6.65),
    new THREE.Vector3(4.1, 1.95, 4.4),
    new THREE.Vector3(3.9, 2.05, 3.5),
  ]);
  private readonly closeupPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.9, 2.05, 3.5),
    new THREE.Vector3(3.15, 2.4, 1.15),
    new THREE.Vector3(1.75, 2.48, -2.3),
    new THREE.Vector3(0.95, 2.24, -2.75),
  ]);
  private readonly lookTarget = new THREE.Vector3();
  private readonly doorTarget = new THREE.Vector3(4.3, 1.75, 5.65);
  private readonly eggTarget = new THREE.Vector3(0, 2.16, -0.5);
  private disposed = false;

  constructor() {
    this.root.name = 'trailer-bob-opening';
    // The trailer's smaller shell sits on the same chamber floor as the menu
    // and gameplay pod, leaving room for its in-container partial hatch.
    this.room.eggRoot.position.y = 2.14;
    this.room.eggRoot.scale.set(0.82, 0.96, 0.82);
    const clearanceCentre = BOB_HATCH_CENTRE.clone().sub(this.room.eggRoot.position)
      .divide(this.room.eggRoot.scale);
    clearanceCentre.y = 0;
    this.eggFracture = new TrailerEggFracture(this.resources, {
      centre: clearanceCentre,
      radius: TRAILER_BOB_CLEARANCE_RADIUS_METRES / this.room.eggRoot.scale.x,
      initialRadius: 0.28 / this.room.eggRoot.scale.x,
    });
    for (const state of Object.values(this.room.eggStates)) state.visible = false;
    this.room.eggRoot.add(this.eggFracture.root);
    this.root.add(this.room.root, this.bob.root);
    // Replace only the trailer copy of the locked door with an actual opening.
    this.room.root.getObjectByName('room-1-locked-laboratory-door-assembly')!.visible = false;
    this.buildRoomShell();
    this.buildEntrance();

    const fill = new THREE.HemisphereLight(0xc9e6e5, 0x35474b, 0);
    fill.name = 'trailer-room-fill';
    const key = new THREE.SpotLight(0xe9f5f2, 0, 18, 0.9, 0.7, 2);
    key.name = 'trailer-containment-ceiling-light';
    key.position.set(-2.3, 7.2, -2.1);
    key.target.position.set(0, 1.4, -0.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 18;
    key.shadow.normalBias = 0.025;
    const rim = new THREE.PointLight(0xbfe2f0, 0, 10, 2);
    rim.name = 'trailer-room-rim';
    rim.position.set(3.8, 5.6, 0.1);
    const specimen = new THREE.PointLight(0xd7f6f5, 0, 3, 2);
    specimen.name = 'trailer-specimen-interior-light';
    specimen.position.set(0.3, 2.65, -0.78);
    const interiorDiffuser = this.box('trailer-specimen-interior-diffuser',
      [0.48, 0.025, 0.15], [0.3, 2.69, -0.78], this.resources.materials.neutralFixture);
    this.roomLights = [fill, key, rim, specimen];
    const corridor = new THREE.PointLight(0xa5bbc0, 45, 5.5, 2);
    corridor.name = 'trailer-corridor-light';
    corridor.position.set(4.3, 3.0, 10.5);
    // A finite reach lights the door but cannot illuminate the specimen room.
    this.root.add(fill, key, key.target, rim, specimen, interiorDiffuser, corridor);

    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      // Transparent glass is not an opaque blocker of the specimen key light.
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.castShadow = !object.userData.trailerDetail && !object.userData.specimenPodShadowlessSupport &&
        materials.some(material => !material.transparent && material !== this.resources.materials.neutralFixture);
    });
    this.apply(sampleOpeningTrailer(0));
  }

  async prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    await this.bob.prepare();
    if (this.disposed) return;
    // Prepare every later-visible hero mesh before recording starts. Changing
    // intensity never adds/removes a light, so the dark reveal shares programs.
    this.apply(sampleOpeningTrailer(OPENING_TRAILER_TIMING.emergeEnd - 0.2));
    await renderer.compileAsync(scene, camera);
    if (this.disposed) return;
    renderer.render(scene, camera);
    this.apply(sampleOpeningTrailer(0));
  }

  apply(frame: OpeningTrailerFrame, camera?: THREE.PerspectiveCamera): void {
    if (this.disposed) return;
    const { seconds, roomLighting, shellOpening, emergence } = frame;
    this.doorLeaves[0].position.x = -frame.doorOpen * 1.7;
    this.doorLeaves[1].position.x = frame.doorOpen * 1.7;
    this.roomLights[0].intensity = roomLighting * 0.95;
    this.roomLights[1].intensity = roomLighting * 180;
    this.roomLights[2].intensity = roomLighting * 32;
    this.roomLights[3].intensity = roomLighting * 3.5;
    this.resources.materials.neutralFixture.emissiveIntensity = roomLighting * 1.7;
    this.resources.materials.specimenShell.emissiveIntensity = roomLighting * 0.04;
    this.resources.materials.staticCyanEmissive.emissiveIntensity = 0.08 + roomLighting * 0.24;
    this.eggFracture.apply(frame.eggState, shellOpening);
    this.room.eggRoot.rotation.z = Math.sin(seconds * 21) * frame.wobble * 0.018;
    this.room.eggRoot.rotation.x = Math.sin(seconds * 17) * frame.wobble * 0.009;
    // Bob is physically present inside the opaque shell from the first shot;
    // the widening fractures reveal him rather than spawning a new character.
    this.bob.root.visible = true;
    const bobWidth = 0.5 + emergence * 0.1;
    const bobHeight = 0.42 + emergence * 0.12 + Math.sin(seconds * 5) * emergence * 0.006;
    this.bob.root.scale.set(bobWidth, bobHeight, bobWidth);
    // Keep the authored -0.45 m resting sole seated while the hatch unfurls.
    const settle = THREE.MathUtils.smoothstep(shellOpening, 0.6, 1);
    this.bob.root.position.set(BOB_HATCH_CENTRE.x,
      THREE.MathUtils.lerp(2.06, 1.665 + bobHeight * 0.45, settle), BOB_HATCH_CENTRE.z);
    this.bob.setYaw(-0.16);
    this.bob.setExpression('surprise', emergence * 0.5);

    if (camera) {
      if (seconds < 2.6) camera.position.set(4.3, 1.82, 10.7 - seconds / 2.6 * 1.3);
      else if (seconds < 5.4) this.entrancePath.getPoint(frame.entranceProgress, camera.position);
      else this.closeupPath.getPoint(frame.closeupProgress, camera.position);
      this.lookTarget.lerpVectors(this.doorTarget, this.eggTarget, frame.lookAtEgg);
      camera.up.set(0, 1, 0);
      camera.lookAt(this.lookTarget);
      camera.fov = 47 - frame.closeupProgress * 7;
      camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.bob.dispose();
    this.eggFracture.dispose();
    this.room.dispose();
    this.corridorDiffuserMaterial?.dispose();
    for (const light of this.roomLights) light.dispose();
    this.resources.dispose();
    this.root.clear();
  }

  private buildRoomShell(): void {
    const { clinicalFloor, mainCeramic, mechanicalBacking } = this.resources.materials;
    for (const [name, size, position, material] of [
      ['floor', [14, 0.3, 12], [0, -0.15, 0], clinicalFloor],
      ['rear', [14, 8, 0.25], [0, 4, -5.95], mechanicalBacking],
      ['west', [0.25, 8, 12], [-6.95, 4, 0], mechanicalBacking],
      ['east', [0.25, 8, 12], [6.95, 4, 0], mechanicalBacking],
      ['ceiling', [14, 0.2, 12], [0, 7.95, 0], mainCeramic],
      ['north-west', [9.62, 8, 0.28], [-2.19, 4, 5.88], mechanicalBacking],
      ['north-east', [0.92, 8, 0.28], [6.54, 4, 5.88], mechanicalBacking],
      ['north-header', [3.46, 4.5, 0.28], [4.35, 5.75, 5.88], mechanicalBacking],
    ] as const) this.root.add(this.box(`trailer-room-${name}`, size, position, material));
  }

  private buildEntrance(): void {
    const { mainCeramic, clinicalFloor, graphite, serviceMetal, neutralFixture } = this.resources.materials;
    const corridor = new THREE.Group();
    corridor.name = 'trailer-entrance-corridor';
    for (const [name, size, position, material] of [
      ['floor', [5.7, 0.3, 8], [4.3, -0.15, 10], clinicalFloor],
      ['west', [0.2, 4.1, 8], [1.5, 2, 10], mainCeramic],
      ['east', [0.2, 4.1, 8], [7.1, 2, 10], mainCeramic],
      ['ceiling', [5.7, 0.2, 8], [4.3, 4.0, 10], graphite],
      ['rear', [5.7, 4.1, 0.2], [4.3, 2, 14], graphite],
      ['facade-west', [1.1, 4, 0.12], [2.05, 2, 6.08], mainCeramic],
      ['facade-east', [1.1, 4, 0.12], [6.55, 2, 6.08], mainCeramic],
      ['facade-header', [3.4, 0.6, 0.12], [4.3, 3.7, 6.08], mainCeramic],
      ['jamb-west', [0.18, 3.5, 0.32], [2.64, 1.75, 6.02], graphite],
      ['jamb-east', [0.18, 3.5, 0.32], [5.96, 1.75, 6.02], graphite],
      ['header', [3.65, 0.22, 0.35], [4.3, 3.48, 6.02], serviceMetal],
      ['threshold', [3.4, 0.035, 0.45], [4.3, 0.018, 6.0], serviceMetal],
    ] as const) corridor.add(this.box(`trailer-corridor-${name}`, size, position, material));
    const diffuser = this.box('trailer-corridor-diffuser', [1.5, 0.03, 0.5], [4.3, 3.82, 10.5], neutralFixture);
    // A distinct material keeps the corridor light independent of the reveal.
    diffuser.material = neutralFixture.clone();
    (diffuser.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    this.corridorDiffuserMaterial = diffuser.material;
    corridor.add(diffuser);
    this.doorLeaves.forEach((leaf, index) => {
      leaf.name = `trailer-door-leaf-${index}`;
      const x = index === 0 ? 3.48 : 5.12;
      leaf.add(this.box(`trailer-door-slab-${index}`, [1.64, 3.28, 0.16], [x, 1.65, 5.97], mainCeramic));
      for (const y of [0.6, 1.35, 2.1, 2.8]) {
        leaf.add(this.box(`trailer-door-seam-${index}-${y}`, [1.5, 0.018, 0.02], [x, y, 6.06], graphite));
      }
      corridor.add(leaf);
    });
    this.root.add(corridor);
  }

  private corridorDiffuserMaterial: THREE.Material | undefined;

  private box(name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material): THREE.Mesh {
    return name.includes('door') || name.includes('jamb') || name.includes('header')
      ? createChamferedBox(this.resources, { name, size, position, material, radius: 0.035 })
      : createBorrowedBox(this.resources, { name, size, position, material });
  }

}
