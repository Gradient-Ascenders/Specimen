import * as THREE from 'three';
import { BobCharacterPresentation } from '../render/bob/BobCharacterPresentation.ts';
import { GoopCharacterPresentation } from '../render/goop/GoopCharacterPresentation.ts';
import { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { createBorrowedBox, createBorrowedCylinder, createChamferedBox } from '../render/environment/containment/ContainmentModularComponents.ts';
import { disposeShadowLight } from '../render/ShadowLightResources.ts';
import { TrailerAttackDrone } from './TrailerAttackDrone.ts';
import { GOOP_INTRO_BOB_POSITION, GOOP_INTRO_BLOCK_POSITION, GOOP_INTRO_TIMING, sampleGoopIntro, type GoopIntroFrame, type TrailerPoint } from './GoopIntroTimeline.ts';

type Sparks = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

/** A small, capture-only service bay. No physics, game session or combat HUD. */
export class GoopIntroScene {
  readonly root = new THREE.Group();
  readonly resources = new ContainmentArtResources();
  readonly bob = new BobCharacterPresentation(0.45);
  readonly goop = new GoopCharacterPresentation();
  readonly drone = new TrailerAttackDrone();
  readonly incomingShot = new THREE.Group();
  readonly acidShot = new THREE.Group();
  readonly charge: THREE.Mesh;
  readonly shieldSparks: Sparks;
  readonly impactSparks: Sparks;
  readonly smoke: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  readonly shieldPosition = new THREE.Vector3(-0.8, 0.95, 0.05);
  readonly shieldEffectPosition = new THREE.Vector3();
  readonly acidOrigin = new THREE.Vector3();

  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly smokeMap: THREE.DataTexture;
  private readonly hitFlash: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly muzzleFlash: THREE.Mesh;
  private readonly muzzleLight = new THREE.PointLight(0xff334d, 0, 2.7, 2);
  private readonly shotLight = new THREE.PointLight(0xff4256, 0, 1.8, 2);
  private readonly impactLight = new THREE.PointLight(0xa6ff45, 0, 4, 2);
  private readonly lights: THREE.Light[] = [];
  private readonly direction = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly shieldLocalPosition = new THREE.Vector3();
  private readonly bobLookAxis = new THREE.Vector3();
  private readonly bobPushRotation = new THREE.Quaternion();
  private readonly bobSupportPoint = new THREE.Vector3();
  private readonly bobSupport: THREE.Vector3[] = [];
  private bobBody: THREE.Mesh | undefined;
  private shieldAttached = false;
  private disposed = false;

  constructor() {
    this.root.name = 'trailer-goop-rescue-scene';
    this.root.userData.presentationOnly = true;
    this.buildServiceBay();
    this.root.add(this.bob.root, this.goop.root, this.drone.root);
    this.bob.setReflectionIntensity(0, 0);
    this.goop.setReflectionIntensity(0, 0);

    const sphere = this.ownGeometry(new THREE.IcosahedronGeometry(1, 2));
    const red = this.ownMaterial(new THREE.MeshBasicMaterial({ color: 0xff254a, toneMapped: false }));
    const white = this.ownMaterial(new THREE.MeshBasicMaterial({ color: 0xffe3bf, toneMapped: false }));
    const green = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xb5f636, emissive: 0x3b7309, emissiveIntensity: 0.75, roughness: 0.22 }));
    const bolt = new THREE.Mesh(sphere, white);
    bolt.scale.set(0.045, 0.045, 0.13);
    const boltTail = new THREE.Mesh(sphere, red);
    boltTail.position.z = -0.16;
    boltTail.scale.set(0.043, 0.043, 0.22);
    this.incomingShot.name = 'trailer-drone-projectile';
    this.incomingShot.add(bolt, boltTail);

    const glob = new THREE.Mesh(sphere, green);
    glob.scale.set(0.13, 0.12, 0.18);
    this.acidShot.name = 'trailer-goop-acid-projectile';
    this.acidShot.add(glob);
    for (let i = 0; i < 3; i++) {
      const bead = new THREE.Mesh(sphere, green);
      bead.position.set(Math.sin(i * 2.1) * 0.035, Math.cos(i * 2) * 0.03, -0.22 - i * 0.12);
      bead.scale.setScalar(0.045 - i * 0.009);
      this.acidShot.add(bead);
    }
    this.charge = new THREE.Mesh(sphere, green);
    this.charge.name = 'trailer-goop-acid-charge';
    this.muzzleFlash = new THREE.Mesh(sphere, white);
    this.muzzleFlash.name = 'trailer-drone-muzzle-flash';
    this.hitFlash = new THREE.Mesh(sphere, this.ownMaterial(new THREE.MeshBasicMaterial({
      color: 0xadff45, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    })));
    this.hitFlash.name = 'trailer-drone-acid-impact';
    this.shieldSparks = this.createSparks('trailer-goop-interception-sparks', 10, 0xffcc82);
    this.impactSparks = this.createSparks('trailer-drone-electrical-sparks', 24, 0xdbff9a);
    this.smokeMap = this.createSmokeMap();
    const smokeGeometry = this.ownGeometry(new THREE.BufferGeometry());
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.smoke = new THREE.Points(smokeGeometry, this.ownMaterial(new THREE.PointsMaterial({
      color: 0x62746b, map: this.smokeMap, size: 0.7, transparent: true,
      opacity: 0, depthWrite: false, sizeAttenuation: true,
    })));
    this.smoke.frustumCulled = false;
    this.smoke.name = 'trailer-drone-short-circuit-smoke';
    this.root.add(this.incomingShot, this.acidShot, this.charge, this.muzzleFlash,
      this.hitFlash, this.shieldSparks, this.impactSparks, this.smoke);

    const fill = new THREE.HemisphereLight(0xbadce1, 0x26322f, 0.85);
    const key = new THREE.SpotLight(0xf4f5e8, 220, 22, 0.95, 0.65, 2);
    key.name = 'trailer-goop-ceiling-key';
    key.position.set(-2.6, 6.1, 3.4);
    key.target.position.set(-0.5, 0.4, -0.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 22;
    key.shadow.normalBias = 0.018;
    const rim = new THREE.PointLight(0x68bccc, 38, 10, 2);
    rim.position.set(2, 3.6, -4.8);
    const front = new THREE.PointLight(0xe8eee4, 12, 8, 2);
    front.position.set(-1.8, 2.5, 4.5);
    this.lights.push(fill, key, rim, front, this.muzzleLight, this.shotLight, this.impactLight);
    this.root.add(...this.lights, key.target);
    this.direction.copy(this.drone.hitPosition).sub(this.target.fromArray(GOOP_INTRO_BLOCK_POSITION)).normalize();
    this.acidOrigin.copy(this.target).addScaledVector(this.direction, 0.63);
    this.acidOrigin.y += 0.16;
    this.apply(sampleGoopIntro(0));
  }

  async prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
    await Promise.all([this.bob.prepare(), this.goop.prepare()]);
    if (this.disposed) return;
    this.bobBody = this.bob.root.getObjectByName('Bob-Body') as THREE.Mesh;
    if (this.bobSupport.length === 0) {
      const positions = this.bobBody.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        if (positions.getY(i) < -0.24) this.bobSupport.push(new THREE.Vector3().fromBufferAttribute(positions, i));
      }
    }
    // Stop the incoming bolt on the actual authored gel surface, not an
    // approximate sphere or a point behind Goop. Bob stays behind that surface.
    this.apply(sampleGoopIntro(GOOP_INTRO_TIMING.shieldHit));
    this.root.updateMatrixWorld(true);
    const body = this.goop.root.getObjectByName('Goop-Body')!;
    this.direction.fromArray(GOOP_INTRO_BOB_POSITION).sub(this.drone.fireOrigin).normalize();
    const intersection = new THREE.Raycaster(this.drone.fireOrigin, this.direction).intersectObject(body)[0];
    if (!intersection) throw new Error('Goop must intercept the drone shot before it reaches Bob.');
    this.shieldPosition.copy(intersection.point).addScaledVector(this.direction, -0.02);
    this.shieldLocalPosition.copy(this.shieldPosition);
    this.goop.root.worldToLocal(this.shieldLocalPosition);
    this.shieldAttached = true;
    // Prime intact and broken drone parts, both projectiles, smoke and sparks
    // before capture. They share fixed lights; recording adds no GPU resources.
    this.apply(sampleGoopIntro(GOOP_INTRO_TIMING.breakup + 0.16));
    // A separate preparation view sees both heroes and the drone hardware;
    // the film's close-up/reverse cuts deliberately do not show them all.
    camera.position.set(5.8, 2.15, 7);
    camera.lookAt(this.cameraTarget.set(-0.1, 1.25, -0.5));
    camera.fov = 55;
    camera.updateProjectionMatrix();
    for (const object of [this.drone.rig, this.incomingShot, this.acidShot, this.charge,
      this.muzzleFlash, this.hitFlash, this.shieldSparks, this.impactSparks, this.smoke]) object.visible = true;
    this.shieldSparks.geometry.setDrawRange(0, 20);
    this.impactSparks.geometry.setDrawRange(0, 48);
    try {
      await renderer.compileAsync(scene, camera);
      if (!this.disposed) renderer.render(scene, camera);
    } finally {
      this.apply(sampleGoopIntro(0), camera);
    }
  }

  apply(frame: GoopIntroFrame, camera?: THREE.PerspectiveCamera): void {
    if (this.disposed) return;
    const time = frame.seconds;
    this.drone.apply(frame);
    this.applyGelPose(this.bob.root, frame.bobPosition,
      1 - frame.bobAlarm * 0.13 - frame.bobJolt * 0.1 + Math.sin(time * 3.2) * 0.008);
    this.applyGelPose(this.goop.root, frame.goopPosition,
      1 + frame.goopJump * 0.16 - frame.goopLanding * 0.2 - frame.shieldPulse * 0.07
      - frame.acidCharge * 0.09 - frame.acidRecoil * 0.1 + Math.sin(time * 3.8) * 0.007);
    const bobYaw = THREE.MathUtils.lerp(-0.9, -2.4, frame.heroTurn);
    this.bob.setYaw(bobYaw);
    this.bob.setExpression('surprise', 0.12 + frame.bobAlarm * 0.85);
    this.bob.setExpression('stress-expression', frame.bobAlarm * 0.4);
    this.bob.setExpression('blink', this.blink(time, 6.8));
    this.bobLookAxis.set(Math.cos(bobYaw), 0, -Math.sin(bobYaw));
    this.bob.root.quaternion.setFromAxisAngle(this.bobLookAxis, frame.bobLookUp * 0.18);
    this.bobPushRotation.setFromAxisAngle(this.bobLookAxis.set(0.8, 0, -0.6), frame.bobJolt * 0.24);
    this.bob.root.quaternion.premultiply(this.bobPushRotation);
    this.keepBobAboveFloor();
    this.goop.setYaw(frame.goopYaw);
    this.direction.copy(this.drone.hitPosition).sub(this.acidOrigin).setY(0).normalize();
    this.goop.root.position.addScaledVector(this.direction, -frame.acidRecoil * 0.11);
    this.shieldEffectPosition.copy(this.shieldPosition);
    if (this.shieldAttached && time >= GOOP_INTRO_TIMING.shieldHit) {
      this.goop.root.localToWorld(this.shieldEffectPosition.copy(this.shieldLocalPosition));
    }

    this.incomingShot.visible = frame.redShotProgress !== null;
    if (frame.redShotProgress !== null) {
      this.incomingShot.position.lerpVectors(this.drone.fireOrigin, this.shieldPosition, frame.redShotProgress);
      this.incomingShot.lookAt(this.shieldPosition);
      this.incomingShot.scale.setScalar(Math.min(1, 0.2 + frame.redShotProgress * 12));
    }
    this.shotLight.intensity = this.incomingShot.visible ? 8 : 0;
    this.shotLight.position.copy(this.incomingShot.position);
    const muzzleAge = time - GOOP_INTRO_TIMING.droneFire;
    const muzzle = muzzleAge >= 0 && muzzleAge < 0.13 ? Math.sin(muzzleAge / 0.13 * Math.PI) : 0;
    this.muzzleFlash.visible = muzzle > 0;
    this.muzzleFlash.position.copy(this.drone.fireOrigin);
    this.muzzleFlash.scale.setScalar(0.04 + muzzle * 0.16);
    this.muzzleLight.position.copy(this.drone.fireOrigin);
    this.muzzleLight.intensity = muzzle * 18;

    this.charge.visible = frame.acidCharge > 0;
    this.charge.position.copy(this.acidOrigin);
    this.charge.scale.setScalar(frame.acidCharge * 0.12);
    this.acidShot.visible = frame.acidShotProgress !== null;
    if (frame.acidShotProgress !== null) {
      const progress = frame.acidShotProgress;
      this.acidShot.position.lerpVectors(this.acidOrigin, this.drone.hitPosition, progress);
      this.acidShot.position.y += Math.sin(progress * Math.PI) * 0.22;
      this.acidShot.lookAt(this.drone.hitPosition);
      const wobble = Math.sin(time * 34) * 0.06;
      this.acidShot.scale.set(1 + wobble, 1 - wobble, 1);
    }
    const age = frame.droneImpactAge;
    this.hitFlash.visible = age >= 0 && age < 0.22;
    this.hitFlash.position.copy(this.drone.hitPosition);
    this.hitFlash.scale.setScalar(0.12 + Math.max(0, age) * 2.2);
    this.hitFlash.material.opacity = age < 0 ? 0 : Math.exp(-age * 18) * 0.65;
    this.updateSparks(this.shieldSparks, this.shieldEffectPosition, time - GOOP_INTRO_TIMING.shieldHit, 0.35, 1.8);
    this.updateSparks(this.impactSparks, this.drone.hitPosition, age, 0.65, 3.2);
    this.updateSmoke(frame.breakupAge);
    const shieldLight = time >= GOOP_INTRO_TIMING.shieldHit && time < GOOP_INTRO_TIMING.shieldHit + 0.3;
    this.impactLight.color.setHex(shieldLight ? 0xffc18a : 0xa4ff48);
    this.impactLight.position.copy(shieldLight ? this.shieldEffectPosition : this.drone.hitPosition);
    this.impactLight.intensity = shieldLight ? frame.shieldPulse * 12
      : age >= 0 ? Math.exp(-age * 10) * 45 : 0;

    if (camera) {
      camera.position.fromArray(frame.cameraPosition);
      camera.up.set(0, 1, 0);
      camera.lookAt(this.cameraTarget.fromArray(frame.cameraTarget));
      camera.fov = frame.cameraFov;
      camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.bob.dispose();
    this.goop.dispose();
    this.drone.dispose();
    for (const light of this.lights) disposeShadowLight(light);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.smokeMap.dispose();
    this.resources.dispose();
    this.root.clear();
  }

  private applyGelPose(root: THREE.Group, position: TrailerPoint, height: number): void {
    root.scale.set(1 / Math.sqrt(height), height, 1 / Math.sqrt(height));
    root.position.set(position[0], position[1] + 0.45 * (height - 1), position[2]);
    root.quaternion.identity();
    root.visible = true;
  }

  private keepBobAboveFloor(): void {
    if (!this.bobBody) return;
    this.bob.root.updateWorldMatrix(true, true);
    let minimum = Infinity;
    for (const point of this.bobSupport) {
      minimum = Math.min(minimum, this.bobSupportPoint.copy(point).applyMatrix4(this.bobBody.matrixWorld).y);
    }
    if (minimum < 0) this.bob.root.position.y -= minimum;
  }

  private blink(seconds: number, at: number): number {
    const age = seconds - at;
    return age < 0 || age > 0.18 ? 0 : Math.sin(age / 0.18 * Math.PI);
  }

  private createSparks(name: string, count: number, colour: number): Sparks {
    const geometry = this.ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.LineSegments(geometry, this.ownMaterial(new THREE.LineBasicMaterial({
      color: colour, transparent: true, opacity: 0.85, toneMapped: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    sparks.name = name;
    sparks.frustumCulled = false;
    return sparks;
  }

  private updateSparks(sparks: Sparks, origin: THREE.Vector3, age: number, lifetime: number, speed: number): void {
    sparks.visible = age >= 0 && age < lifetime;
    if (!sparks.visible) { sparks.geometry.setDrawRange(0, 0); return; }
    const positions = sparks.geometry.getAttribute('position');
    const count = positions.count / 2;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996;
      const velocity = speed * (0.6 + i % 4 * 0.16);
      const tailAge = Math.max(0, age - 0.04);
      for (let end = 0; end < 2; end++) {
        const t = end ? age : tailAge;
        positions.setXYZ(i * 2 + end,
          origin.x + Math.cos(angle) * velocity * t,
          Math.max(0.04, origin.y + (i % 5 - 1.5) * t - 2.5 * t * t),
          origin.z + Math.sin(angle) * velocity * t,
        );
      }
    }
    sparks.material.opacity = (1 - age / lifetime) * 0.85;
    sparks.geometry.setDrawRange(0, positions.count);
    positions.needsUpdate = true;
  }

  private updateSmoke(age: number): void {
    this.smoke.visible = age >= 0 && age < 3.3;
    if (!this.smoke.visible) return;
    const positions = this.smoke.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const phase = i * 2.39996;
      positions.setXYZ(i,
        this.drone.hitPosition.x + Math.cos(phase) * age * 0.22,
        this.drone.hitPosition.y + age * 0.52 + Math.sin(phase) * age * 0.12,
        this.drone.hitPosition.z + Math.sin(phase) * age * 0.2,
      );
    }
    positions.needsUpdate = true;
    this.smoke.material.size = 0.24 + age * 0.52;
    this.smoke.material.opacity = 0.32 * (1 - THREE.MathUtils.smoothstep(age, 0.8, 3.3));
  }

  private createSmokeMap(): THREE.DataTexture {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
      const index = (y * 32 + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 255);
    }
    const texture = new THREE.DataTexture(pixels, 32, 32);
    texture.needsUpdate = true;
    return texture;
  }

  private buildServiceBay(): void {
    const m = this.resources.materials;
    for (const [name, size, position, material] of [
      ['floor', [16, 0.3, 17], [0, -0.15, 1.5], m.clinicalFloor],
      ['rear-wall', [16, 6.5, 0.25], [0, 3.25, -6.9], m.mainCeramic],
      ['left-wall', [0.25, 6.5, 17], [-7.9, 3.25, 1.5], m.mechanicalBacking],
      ['right-wall', [0.25, 6.5, 17], [7.9, 3.25, 1.5], m.mainCeramic],
      ['front-wall', [16, 6.5, 0.25], [0, 3.25, 9.9], m.mechanicalBacking],
      ['ceiling', [16, 0.2, 17], [0, 6.4, 1.5], m.mechanicalBacking],
    ] as const) this.addBox(`goop-trailer-${name}`, size, position, material);
    for (const x of [-6, -4, -2, 0, 2, 4, 6]) {
      this.addBox(`goop-trailer-wall-seam-${x}`, [0.025, 6.1, 0.025], [x, 3.05, -6.75], m.graphite);
      this.addBox(`goop-trailer-floor-seam-${x}`, [0.018, 0.006, 17], [x, 0.003, 1.5], m.graphite);
    }
    for (const z of [-5, -2.5, 0, 2.5, 5, 7.5]) {
      this.addBox(`goop-trailer-floor-cross-seam-${z}`, [16, 0.006, 0.018], [0, 0.003, z], m.graphite);
    }
    for (const y of [1.8, 3.6, 5.4]) this.addBox(`goop-trailer-wall-cross-seam-${y}`, [16, 0.025, 0.025], [0, y, -6.75], m.graphite);
    for (const x of [-5, 1.8, 5.4]) {
      this.addBox(`goop-trailer-ceiling-rail-${x}`, [0.14, 0.14, 16], [x, 6.15, 1.5], m.graphite);
      this.addBox(`goop-trailer-ceiling-fixture-${x}`, [1.3, 0.08, 0.48], [x, 6.02, -0.8], m.neutralFixture);
    }
    m.neutralFixture.emissiveIntensity = 0.75;
    for (const x of [-7.5, 7.5]) {
      this.root.add(createBorrowedCylinder(this.resources, {
        name: `goop-trailer-service-pipe-${x}`, size: [0.11, 16, 0.11],
        position: [x, 1.3, 1.3], rotation: [Math.PI / 2, 0, 0], material: m.serviceMetal,
      }));
      this.addBox(`goop-trailer-floor-drain-${x}`, [0.22, 0.02, 14], [x, 0.01, 1.3], m.graphite);
    }
    this.addBox('goop-trailer-service-door-frame', [3.2, 3.65, 0.16], [2.2, 1.825, -6.63], m.graphite);
    this.addBox('goop-trailer-service-door', [2.85, 3.35, 0.12], [2.2, 1.68, -6.52], m.serviceMetal);
    this.addBox('goop-trailer-door-split', [0.025, 3.35, 0.03], [2.2, 1.68, -6.44], m.graphite);
    this.addBox('goop-trailer-door-status-light', [2.85, 0.065, 0.06], [2.2, 3.34, -6.43], m.staticCyanEmissive);
    for (const x of [-5.8, -4.3]) {
      this.root.add(createChamferedBox(this.resources, { name: `goop-trailer-service-crate-${x}`,
        size: [1.1, 1.05, 1.2], position: [x, 0.525, -4.6], material: m.serviceMetal, radius: 0.05 }));
      this.addBox(`goop-trailer-crate-band-${x}`, [1.12, 0.13, 1.22], [x, 0.7, -4.6], m.graphite);
    }
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
    });
  }

  private addBox(name: string, size: TrailerPoint, position: TrailerPoint, material: THREE.Material): void {
    this.root.add(createBorrowedBox(this.resources, { name, size, position, material }));
  }

  private ownGeometry<Geometry extends THREE.BufferGeometry>(geometry: Geometry): Geometry {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial<Material extends THREE.Material>(material: Material): Material {
    this.materials.add(material);
    return material;
  }
}
