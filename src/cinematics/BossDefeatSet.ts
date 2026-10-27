import * as THREE from 'three';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';
import { ENDING_ANCHOR, ENDING_EXIT_Z, ENDING_DRONE_BAYS, ENDING_TIMING as T, endingProgress, sampleEndingBossWreck, endingCollapseBlastTime, endingCollapseBlastPosition } from './BossDefeatTimeline.ts';
import { BossDefeatTerrain } from './BossDefeatTerrain.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class BossDefeatSet {
  readonly root = new THREE.Group();
  readonly lights = new THREE.Group();
  readonly exterior = new THREE.Group();
  readonly passage = new THREE.Group();
  readonly bossDamage = new THREE.Group();
  readonly terrain = new BossDefeatTerrain();
  readonly debris: THREE.InstancedMesh;
  readonly wreckage: THREE.InstancedMesh;
  readonly structural: THREE.InstancedMesh;
  readonly emergency = new THREE.PointLight(0xff4231, 0, 120, 2);
  readonly energyLight = new THREE.PointLight(0x8cfff1, 0, 120, 2);
  readonly sun = new THREE.DirectionalLight(0xffe7b0, 0);
  readonly fill = new THREE.HemisphereLight(0xb9e4ff, 0x786748, 0);
  readonly passageLight = new THREE.PointLight(0xb2dfcf, 0, 55, 2);
  readonly wreckLight = new THREE.PointLight(0xff7138, 0, 65, 2);
  readonly collapseLight = new THREE.PointLight(0xff913e, 0, 170, 2);
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly dummy = new THREE.Object3D();
  private readonly cracks = new THREE.Group();
  private readonly doors: THREE.Mesh[] = [];
  private readonly exitDoors: THREE.Group[] = [];
  private readonly safetyDoors: THREE.Group[] = [];
  private readonly lamps: THREE.MeshBasicMaterial[] = [];
  private readonly metal = this.material(new THREE.MeshStandardMaterial({ color: 0x46545b, roughness: .86, metalness: .55 }));
  private readonly white = this.material(new THREE.MeshStandardMaterial({ color: 0xc6d5d6, roughness: .67, metalness: .12 }));
  private readonly dark = this.material(new THREE.MeshStandardMaterial({ color: 0x152a33, roughness: .82, metalness: .6 }));
  private readonly unitBox = this.geometry(new THREE.BoxGeometry(1, 1, 1));

  constructor() {
    this.root.name = 'boss-ending-authored-set'; this.root.visible = false;
    this.lights.name = 'boss-ending-retained-light-slots';
    this.root.add(this.passage, this.exterior, this.cracks);
    this.emergency.position.set(0, 10, ENDING_ANCHOR.z - 12);
    this.energyLight.position.set(0, 8, ENDING_ANCHOR.z + 22);
    this.sun.position.set(100, 140, -180); this.sun.target.position.set(0, 0, ENDING_EXIT_Z - 25);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024); Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 500 });
    this.sun.shadow.bias = -.0003; this.sun.shadow.normalBias = .045; this.passageLight.position.set(0, 5, 150);
    this.sun.shadow.camera.updateProjectionMatrix();
    this.lights.add(this.emergency, this.energyLight, this.sun, this.sun.target, this.fill, this.passageLight, this.wreckLight, this.collapseLight);
    this.debris = new THREE.InstancedMesh(this.unitBox, this.white, 224); this.debris.name = 'collapsing-lab-ceiling-and-wall-panels';
    this.debris.frustumCulled = false; this.debris.count = 0; this.root.add(this.debris);
    this.wreckage = new THREE.InstancedMesh(this.unitBox, this.metal, 48); this.wreckage.name = 'destroyed-exterminator-shrapnel';
    this.wreckage.frustumCulled = false; this.wreckage.count = 0; this.root.add(this.wreckage);
    this.structural = new THREE.InstancedMesh(this.unitBox, this.metal, 48); this.structural.name = 'collapsing-major-roof-girders';
    this.structural.frustumCulled = false; this.structural.count = 0; this.root.add(this.structural);
    this.buildCracks(); this.buildPassage(); this.buildExterior(); this.buildDeploymentBays(); this.buildBossDamage();
    // Wreck dressing belongs to the ending, outside the live RAM contact hull.
    this.bossDamage.traverse(object => { object.userData.contactSolid = false; });
  }
  private geometry<G extends THREE.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
  private material<M extends THREE.Material>(m: M): M { this.materials.add(m); return m; }
  private box(name: string, size: readonly number[], position: readonly number[], material: THREE.Material, parent = this.root): THREE.Mesh {
    const m = new THREE.Mesh(this.unitBox, material); m.name = name;
    m.scale.set(size[0]!, size[1]!, size[2]!); m.position.set(position[0]!, position[1]!, position[2]!); parent.add(m); return m;
  }
  private buildCracks(): void {
    const fissure = this.material(new THREE.MeshBasicMaterial({ color: 0x111b20 }));
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI * 2 / 12;
      for (let j = 0; j < 7; j++) {
        const r = 1.5 + j * 1.4, a = angle + Math.sin(i * 7 + j * 4) * .12;
        const strip = this.box('fractured-annular-deck', [.045 + j * .014, .018, 1.65],
          [Math.sin(a) * r, FINAL_ARENA.floorY + .028, ENDING_ANCHOR.z + Math.cos(a) * r], fissure, this.cracks);
        strip.rotation.y = a;
      }
    }
  }
  private buildBossDamage(): void {
    this.bossDamage.name = 'torn-exterminator-armour-and-exposed-wiring'; this.bossDamage.visible = false;
    const scorch = this.material(new THREE.MeshStandardMaterial({ color: 0x161b1d, roughness: 1, metalness: .15 }));
    const copper = this.material(new THREE.MeshBasicMaterial({ color: 0xff642d }));
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const panel = this.box('torn-charred-armour', [1.2 + i % 3 * .3, .16, .8], [side * (2.1 + i % 3 * .5), .8 + (i % 2) * .25, -2.5 + Math.floor(i / 2) * .9], scorch, this.bossDamage);
      panel.rotation.set(i % 2 ? .23 : -.13, i * .7, side * .23);
    }
    for (let i = 0; i < 5; i++) {
      const points = [new THREE.Vector3(-3.7 + i * .13, .5, -3), new THREE.Vector3(-4 + i * .12, -.4, -3.3),
        new THREE.Vector3(-3.8 + i * .2, -1.8 - i * .14, -3.9), new THREE.Vector3(-3.2 + i * .18, -1.9 - i * .1, -4.2)];
      const wire = new THREE.Mesh(this.geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .035, 5, false)), i % 2 ? copper : this.metal);
      wire.name = 'severed-power-cable'; this.bossDamage.add(wire);
    }
    const coilGeometry = this.geometry(new THREE.TorusGeometry(.28, .035, 5, 14));
    for (let i = 0; i < 6; i++) { const coil = new THREE.Mesh(coilGeometry, copper); coil.position.set(2.7, .4 + i * .14, -3.35); coil.rotation.x = Math.PI / 2; this.bossDamage.add(coil); }
  }
  private buildPassage(): void {
    const start = 190, end = ENDING_EXIT_Z, length = start - end;
    this.passage.name = 'ending-emergency-egress-tunnel';
    const flooring = this.material(new THREE.MeshStandardMaterial({ color: 0x667a7d, metalness: .5, roughness: .68 }));
    const lamp = this.material(new THREE.MeshBasicMaterial({ color: 0xd9f5e7 }));
    this.box('escape-tunnel-floor', [13.4, .8, length], [0, 0, (start + end) / 2], flooring, this.passage);
    this.box('escape-tunnel-ceiling', [14.4, .6, length], [0, 8.1, (start + end) / 2], this.dark, this.passage);
    for (const side of [-1, 1]) {
      this.box('sealed-egress-wall', [.6, 8.4, length], [side * 7, 4, (start + end) / 2], this.white, this.passage);
      for (let i = 0; i < 10; i++) {
        const z = start - 4 - i * 8;
        this.box('recessed-service-panel', [.07, 3.2, 5.5], [side * 6.66, 3.8, z], this.dark, this.passage);
        this.box('egress-wall-rib', [.3, 7.5, .2], [side * 6.5, 4, z + 3.5], this.metal, this.passage);
        const glow = this.material(new THREE.MeshBasicMaterial({ color: 0x76e6bc })); this.lamps.push(glow);
        this.box('emergency-route-light', [.08, .13, 2.5], [side * 6.62, 1.1, z], glow, this.passage);
        this.box('lower-service-plinth', [.3, .5, 7.8], [side * 6.6, .68, z], this.metal, this.passage);
        this.box('ceiling-cable-tray', [1.4, .18, 7.7], [side * 4.7, 7.5, z], this.metal, this.passage);
        this.box('warm-ceiling-strip', [.26, .07, 3], [side * 3, 7.66, z], lamp, this.passage);
        this.box('recessed-control-cabinet', [.2, 1.4, 1.5], [side * 6.55, 2.1, z - 1.8], this.metal, this.passage);
        for (let v = 0; v < 4; v++) this.box('cabinet-vent-fin', [.025, .035, 1.1], [side * 6.42, 2.25 + v * .13, z - 1.8], this.dark, this.passage);
        this.box('cabinet-status-lamp', [.035, .08, .25], [side * 6.42, 1.65, z - 1.8], glow, this.passage);
        this.box('deck-expansion-joint', [6.3, .012, .035], [side * 3.2, .415, z + 3.9], this.dark, this.passage);
        this.box('drain-channel', [.23, .018, 7.8], [side * 5.5, .418, z], this.dark, this.passage);
        for (let n = 0; n < 10; n++) this.box('drain-grille', [.25, .022, .045], [side * 5.5, .43, z - 3.5 + n * .7], this.metal, this.passage);
      }
      for (let i = 0; i < 3; i++) this.box('exposed-conduit', [.2, .2, length], [side * 6.3, 6.7 + i * .32, (start + end) / 2], this.metal, this.passage);
    }
    for (const z of [ENDING_EXIT_Z, 189.5]) {
      this.box('emergency-door-lintel', [14.4, .65, .8], [0, 7.6, z], this.metal, this.passage);
      for (const side of [-1, 1]) {
        this.box('reinforced-door-jamb', [.55, 7, .85], [side * 6.5, 4, z], this.metal, this.passage);
        const door = new THREE.Group(); door.name = z === ENDING_EXIT_Z ? 'daylight-exit-door' : 'rear-emergency-isolation-door';
        door.position.set(side * 3.05, 3.7, z); this.passage.add(door);
        this.box('reinforced-door-leaf', [6.1, 6.6, .25], [0, 0, 0], this.white, door);
        (z === ENDING_EXIT_Z ? this.exitDoors : this.safetyDoors).push(door);
        this.box('door-inspection-window', [3.3, 1.1, .28], [0, .6, 0], z === ENDING_EXIT_Z ? lamp : this.dark, door);
        this.box('door-panel-recess', [4.8, 2.5, .28], [0, -1.5, 0], this.metal, door);
      }
    }
    this.batch(this.passage, new Set(['escape-tunnel-floor', 'daylight-exit-door', 'rear-emergency-isolation-door']));
  }
  private batch(root: THREE.Group, preserve: ReadonlySet<string> = new Set()): void {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const object of [...root.children]) {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || preserve.has(object.name)) continue;
      const group = groups.get(object.material) ?? []; group.push(object); groups.set(object.material, group);
    }
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const copies = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
      const combined = mergeGeometries(copies); copies.forEach(g => g.dispose()); if (!combined) continue;
      const mesh = new THREE.Mesh(this.geometry(combined), material); mesh.name = 'batched-egress-lab-detail'; root.add(mesh); meshes.forEach(m => m.removeFromParent());
    }
  }
  private buildDeploymentBays(): void {
    for (const [i, source] of ENDING_DRONE_BAYS.entries()) {
      const bay = new THREE.Group(); bay.name = `reinforcement-launch-bay-${i}`;
      bay.position.set(source.x, source.y, source.z); bay.rotation.y = -source.angle + Math.PI / 2; this.root.add(bay);
      this.box('reinforcement-bay-dark-interior', [5, 4, .25], [0, 0, 1.7], this.dark, bay);
      for (const side of [-1, 1]) {
        this.box('reinforcement-bay-side-wall', [.3, 4, 3], [side * 2.65, 0, .2], this.dark, bay);
        this.box('reinforcement-bay-liner', [5.6, .3, 3], [0, side * 2.15, .2], this.dark, bay);
      }
      for (const side of [-1, 1]) this.box('reinforcement-bay-jamb', [.3, 4.6, 1], [side * 2.65, 0, -1], this.metal, bay);
      this.box('reinforcement-bay-header', [5.6, .3, 1], [0, 2.15, -1], this.metal, bay);
      this.doors.push(this.box('reinforcement-launch-shutter', [5, 4, .25], [0, 0, -1.3], this.white, bay));
    }
  }
  private buildExterior(): void {
    this.exterior.name = 'first-daylight-facility-exit';
    const stone = this.material(new THREE.MeshStandardMaterial({ color: 0x959f96, roughness: 1 }));
    this.exterior.add(this.terrain.root);
    const pad = this.box('worn-egress-concrete', [16, .8, 1.2], [0, 0, ENDING_EXIT_Z - .6], stone, this.exterior); pad.receiveShadow = true;
    for (const side of [-1, 1]) {
      this.box('facility-exterior-concrete-wall', [95, 19, 7], [side * 54, 9, ENDING_EXIT_Z + 2], this.white, this.exterior);
      this.box('facility-roof-cap', [104, .5, 1.2], [side * 52, 18.8, ENDING_EXIT_Z - 1.6], this.metal, this.exterior);
      this.box('exit-door-frame', [.8, 8.5, 2], [side * 7.1, 4.2, ENDING_EXIT_Z], this.metal, this.exterior);
      this.box('bollard', [.4, 1.5, .4], [side * 6, 1.05, ENDING_EXIT_Z - 5], this.dark, this.exterior);
      for (let i = 0; i < 8; i++) this.box('exterior-lab-vent', [5, 1.8, .12], [side * (14 + i * 10), 12, ENDING_EXIT_Z - 1.6], this.dark, this.exterior);
      for (let i = 0; i < 9; i++) {
        this.box('concrete-expansion-joint', [.07, 18.8, .03], [side * (10 + i * 11), 9.2, ENDING_EXIT_Z - 1.52], this.metal, this.exterior);
        this.box('lower-concrete-panel-joint', [10.8, .065, .03], [side * (15.5 + i * 11), 5.5, ENDING_EXIT_Z - 1.52], this.metal, this.exterior);
      }
      this.box('exterior-concrete-footing', [101, .8, .5], [side * 57.5, .4, ENDING_EXIT_Z - 1.6], stone, this.exterior);
    }
    this.box('exit-lintel', [15, 10.8, 7], [0, 13.2, ENDING_EXIT_Z + 2], this.white, this.exterior);
    const sky = this.material(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vP;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(vP);float h=max(0.,d.y);
        vec3 c=mix(vec3(.91,.91,.77),vec3(.26,.58,.82),pow(h,.5));
        float sun=max(0.,dot(d,normalize(vec3(.35,.24,-.9))));c+=vec3(1.,.66,.26)*pow(sun,80.)*.45+vec3(1.,.92,.7)*pow(sun,2200.)*2.;
        vec2 uv=d.xz/(.3+h)*4.;float cloud=noise(uv)*.55+noise(uv*2.1)*.3+noise(uv*4.2)*.15;
        float band=smoothstep(.08,.18,h)*(1.-smoothstep(.5,.8,h));
        c=mix(c,vec3(.97,.96,.9),smoothstep(.57,.75,cloud)*band*.72);
        gl_FragColor=vec4(c,1.);}` }));
    const dome = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(1000, 32, 16)), sky); dome.position.set(0, 0, ENDING_EXIT_Z); dome.name = 'sunrise-sky'; this.exterior.add(dome);
  }
  present(t: number): void {
    this.root.visible = true; this.exterior.visible = t >= T.daylight - 1;
    this.cracks.visible = t >= T.strain && t < T.daylight;
    const crackSpread = Math.max(.01, endingProgress(t, T.strain, T.explosion)); this.cracks.scale.set(crackSpread, 1, crackSpread);
    // Scaling the crack pattern must not move its world-space anchor.
    this.cracks.position.z = ENDING_ANCHOR.z * (1 - this.cracks.scale.z);
    const daylight = endingProgress(t, T.daylight, T.daylight + 3);
    this.sun.intensity = daylight * 3; this.fill.intensity = .7 + daylight * 1.4;
    this.emergency.intensity = t >= T.explosion && t < T.black ? 650 * (.6 + .4 * Math.sin(t * 9)) : 0;
    this.energyLight.intensity = t >= T.charge && t < T.explosion ? (600 + endingProgress(t, T.charge, T.explosion) * 6500) : 0;
    this.doors.forEach((door, i) => { door.position.y = endingProgress(t, T.drones - 1 + i * .48, T.drones + i * .48) * 4.4; });
    this.exitDoors.forEach((door, i) => { door.position.x = (i === 0 ? -1 : 1) * (3.05 + endingProgress(t, T.daylight - 1, T.daylight + 1) * 6.3); });
    this.safetyDoors.forEach((door, i) => { door.position.x = (i === 0 ? -1 : 1) * (3.05 + (1 - endingProgress(t, T.runAgain + 1, T.runAgain + 4)) * 6.3); });
    this.passageLight.intensity = t >= T.leave && t < T.black ? 80 : t >= T.daylight ? 25 : 0;
    sampleEndingBossWreck(t, this.wreckLight.position); this.wreckLight.position.y += 4; this.wreckLight.position.z -= 9;
    this.wreckLight.intensity = t >= T.explosion && t < T.bossLost ? 1700 * Math.exp(-(t - T.explosion) / 10) : 0;
    this.collapseLight.intensity = 0;
    if (t >= T.destruction && t < T.black) for (let i = 0; i < 12; i++) {
      const age = t - endingCollapseBlastTime(i), intensity = age >= 0 && age < 1.3 ? 14000 * Math.exp(-age * 5) : 0;
      if (intensity > this.collapseLight.intensity) { this.collapseLight.intensity = intensity; endingCollapseBlastPosition(i, this.collapseLight.position); }
    }
    this.lamps.forEach((lamp, i) => lamp.color.setHex(t < T.black && Math.sin(t * 7 + i) < -.75 ? 0x0a2018 : 0x76e6bc));
    this.debris.count = 0;
    if (t >= T.strain && t < T.black) for (let i = 0; i < 224; i++) {
      const start = i < 32 ? T.strain + (i % 8) * .8 : t >= T.destruction ? T.destruction + (i - 32) * .04 : T.explosion + (i - 32) * .34;
      const age = t - start; if (age < 0) continue;
      const angle = i * 2.39996, radius = 67 + (i % 11) * 2.7;
      this.dummy.position.set(Math.cos(angle) * radius, 64 + (i % 7) * 4 - 3.2 * age * age, FINAL_ARENA.centreZ + Math.sin(angle) * radius);
      if (i < 32) this.dummy.position.set(Math.sin(i * 3) * 9, 6 - 1.8 * age * age, ENDING_ANCHOR.z + Math.cos(i * 2) * 8);
      const s = i < 32 ? .12 + i % 4 * .08 : 1 + (i % 5) * .7;
      const grounded = this.dummy.position.y <= FINAL_ARENA.floorY + s * .16;
      this.dummy.position.y = Math.max(FINAL_ARENA.floorY + s * .16, this.dummy.position.y);
      const motion = grounded ? i < 32 ? 1.7 : Math.sqrt((64 + (i % 7) * 4) / 3.2) : age;
      this.dummy.rotation.set(grounded ? 0 : motion * (.2 + i % 3 * .11), i + motion * .3, grounded ? 0 : motion * .17);
      this.dummy.scale.set(s * 2.7, s * .3, s * 1.6); this.dummy.updateMatrix(); this.debris.setMatrixAt(this.debris.count++, this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true; this.wreckage.count = 0;
    if (t >= T.explosion && t < T.explosion + 11) for (let i = 0; i < 48; i++) {
      const age = t - T.explosion, a = i * 2.39996, speed = 4 + i % 7;
      this.dummy.position.set(Math.sin(a) * speed * age, 12 + (3 + i % 4) * age - 2.3 * age * age, FINAL_ARENA.centreZ - 22 + Math.cos(a) * speed * age);
      this.dummy.rotation.set(age * .7 + i, age * .4, age + i); this.dummy.scale.set(1 + i % 3, .3, 1.8);
      this.dummy.updateMatrix(); this.wreckage.setMatrixAt(this.wreckage.count++, this.dummy.matrix);
    }
    this.wreckage.instanceMatrix.needsUpdate = true;
    this.structural.count = 0;
    if (t >= T.destruction && t < T.black) for (let i = 0; i < 48; i++) {
      const age = t - T.destruction - i * .11; if (age < 0) continue;
      const angle = .05 + i % 12 * .13, radius = 67 + i % 6 * 4;
      this.dummy.position.set(Math.cos(angle) * radius, Math.max(1.1, 91 - age * age * 8), FINAL_ARENA.centreZ + Math.sin(angle) * radius);
      const settle = 1 - THREE.MathUtils.smoothstep(age, 2.8, 3.4);
      this.dummy.rotation.set((age * .36 + i * .11) * settle, angle, Math.sin(i) * age * .26 * settle);
      this.dummy.scale.set(10 + i % 5 * 2, i % 3 === 0 ? .3 : .7, i % 3 === 0 ? 5 : .8);
      this.dummy.updateMatrix();
      const elements = this.dummy.matrix.elements, halfHeight = (Math.abs(elements[1]!) + Math.abs(elements[5]!) + Math.abs(elements[9]!)) * .5;
      this.dummy.position.y = Math.max(this.dummy.position.y, FINAL_ARENA.floorY + halfHeight); this.dummy.updateMatrix();
      this.structural.setMatrixAt(this.structural.count++, this.dummy.matrix);
    }
    this.structural.instanceMatrix.needsUpdate = true;
  }
  reset(): void { this.root.visible = false; this.debris.count = this.wreckage.count = this.structural.count = 0; this.sun.intensity = this.fill.intensity = this.energyLight.intensity = this.emergency.intensity = this.passageLight.intensity = this.wreckLight.intensity = this.collapseLight.intensity = 0; }
  dispose(): void {
    this.terrain.dispose(); this.root.removeFromParent(); this.lights.removeFromParent(); this.bossDamage.removeFromParent(); this.debris.dispose(); this.wreckage.dispose(); this.sun.shadow.dispose();
    this.root.traverse(o => { if (o instanceof THREE.InstancedMesh && o !== this.debris && o !== this.wreckage) o.dispose(); });
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
  }
}
