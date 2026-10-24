import * as THREE from 'three';
import { RESEARCH_WING_ORIGIN as ORIGIN, RESEARCH_OVERLOAD_LAMP, researchWorldPoint } from './BlackoutResearchLayout.ts';
import { RESEARCH_TIMING as T, researchWindow, researchPursuerShotTime, researchDroneDeathTime, researchDroneFireStart, researchDroneFireInterval } from './BlackoutResearchTimeline.ts';
import { sampleResearchDronePosition } from './BlackoutResearchFlight.ts';
import { ResearchCinematicAtmosphere } from './ResearchCinematicAtmosphere.ts';

const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1), COLORS = [0x6ce9ee, 0x82ff62, 0xffda65] as const;
export class BlackoutResearchEffects {
  readonly root = new THREE.Group();
  readonly light = new THREE.PointLight(0xaaffcf, 0, 26, 2);
  readonly bolts: THREE.InstancedMesh;
  readonly shots: THREE.InstancedMesh;
  readonly sparks: THREE.InstancedMesh;
  readonly shards: THREE.InstancedMesh;
  readonly absorptionRings: THREE.InstancedMesh;
  private readonly atmosphere = new ResearchCinematicAtmosphere();
  private readonly shell: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>;
  private readonly rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly dummy = new THREE.Object3D();
  private readonly a = new THREE.Vector3(); private readonly b = new THREE.Vector3();
  private readonly p = new THREE.Vector3(); private readonly q = new THREE.Vector3();
  private readonly d = new THREE.Vector3(); private readonly center = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly incomingDirection = new THREE.Vector3();
  private readonly absorptionTarget = new THREE.Vector3();
  private incomingProjectiles = 0;
  private absorbedShots = 0;
  constructor() {
    this.root.name = 'research-pooled-energy-and-impact-effects'; this.root.visible = false; this.root.add(this.atmosphere.root);
    this.bolts = this.pool(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 256);
    this.shots = this.pool(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ toneMapped: false }), 8);
    this.sparks = this.pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: .8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 192);
    this.shards = this.pool(new THREE.BoxGeometry(1, 1, .12), new THREE.MeshBasicMaterial({ color: 0xc4f0f4, transparent: true,
      opacity: .65, depthWrite: false, toneMapped: false }), 88);
    this.absorptionRings = this.pool(new THREE.TorusGeometry(1, .045, 5, 24), new THREE.MeshBasicMaterial({
      transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 32);
    const shellMaterial = this.mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
      vertexShader: 'varying vec3 vP,vN,vV;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vV=-p.xyz;gl_Position=projectionMatrix*p;}',
      fragmentShader: `varying vec3 vP,vN,vV;uniform float uTime,uPower;void main(){
        float rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.4);
        float a=atan(vP.z,vP.x);float coil=pow(.5+.5*sin(a*9.+vP.y*19.-uTime*12.),14.);
        float crack=pow(.5+.5*sin(a*23.+sin(vP.y*21.+uTime*4.)*2.),25.);
        vec3 c=mix(vec3(.19,.94,1.),vec3(.6,1.,.2),.5+.5*sin(a*2.+uTime));
        c=mix(c,vec3(1.,.8,.18),coil*.65);gl_FragColor=vec4(c*1.5,(rim*.4+coil*.22+crack*.3)*uPower);
      }` }));
    this.shell = new THREE.Mesh(this.geom(new THREE.IcosahedronGeometry(1, 3)), shellMaterial); this.root.add(this.shell);
    for (const c of [...COLORS, 0xb8fff0, 0xd5edf2]) {
      const ring = new THREE.Mesh(this.geom(new THREE.TorusGeometry(1, .018, 5, 64)), this.mat(new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
      this.rings.push(ring); this.root.add(ring);
    }
  }
  get diagnostics() { return { bolts: this.bolts.count, shots: this.shots.count, sparks: this.sparks.count, shards: this.shards.count,
    incomingProjectiles: this.incomingProjectiles, absorbedShots: this.absorbedShots, absorptionRings: this.absorptionRings.count,
    absorptionTarget: this.absorptionTarget.toArray(), ...this.atmosphere.diagnostics, energyCenter: this.shell.position.toArray() }; }
  present(t: number, actors: readonly { position: THREE.Vector3 }[], specimen: THREE.Vector3, drones: readonly THREE.Vector3[], active = true): void {
    this.root.visible = active; this.bolts.count = this.shots.count = this.sparks.count = this.shards.count = 0;
    this.absorptionRings.count = this.incomingProjectiles = this.absorbedShots = 0;
    const bob = actors[0]!.position;
    if (t >= T.overload && t < T.lampBurst) {
      this.a.copy(actors[2]!.position).add(this.d.set(0, .16, 0)); this.b.copy(RESEARCH_OVERLOAD_LAMP).add(ORIGIN);
      this.lightning(this.a, this.b, t, 0xffe692, .032, 12);
      this.p.copy(this.b); this.sparkBurst(this.p, (t - T.overload) % .18, 1.5, 8, 0xffd982);
    }
    for (const z of [25, 20, 12, 4]) {
      const at = T.lampBurst + (25 - z) / 8 * .65;
      researchWorldPoint(0, 7.68, z, this.p); this.sparkBurst(this.p, t - at, 3.6, 12, 0xffe6a1);
      if (z !== 25 && t >= at - .25 && t < at + .12) {
        researchWorldPoint(0, 7.7, z + 6, this.a); researchWorldPoint(0, 7.7, z, this.b); this.lightning(this.a, this.b, t, 0xc9ecff, .025, 8);
      }
    }
    if (t >= T.crossfire && t < T.fusion) for (const index of [1, 2]) {
      this.a.copy(actors[index]!.position).add(this.d.set(0, .06, .18)); this.b.copy(bob).add(this.d.set(0, .02, -.14));
      if (index === 2) this.lightning(this.a, this.b, t, 0xffdb68, .032, 12);
      else for (let i = 0; i < 6; i++) {
        const u = ((t - T.crossfire) * 3.2 + i / 6) % 1;
        this.p.lerpVectors(this.a, this.b, u); this.q.lerpVectors(this.a, this.b, Math.min(1, u + .12)); this.line(this.p, this.q, .07, 0x79ff65);
      }
    }
    this.center.copy(bob).add(this.d.set(0, .06, 0));
    const gathering = researchWindow(t, T.crossfire + 1, T.fusion), morph = researchWindow(t, T.fusion, T.reveal);
    this.shell.visible = t >= T.crossfire + 1 && t < T.reveal + .8;
    if (this.shell.visible) {
      const radius = .32 + gathering * 1.3;
      this.shell.position.copy(this.center);
      this.shell.scale.set(radius * (1 + morph * .3), radius * (1 + morph * 1.2), radius * (1 + morph * .3));
      this.shell.material.uniforms.uTime!.value = t;
      this.shell.material.uniforms.uPower!.value = (gathering * .9 + .15) * (1 - researchWindow(t, T.reveal - .2, T.reveal + .8));
      for (let n = 0; n < 3; n++) {
        for (let i = 0; i < 15; i++) {
          const a = i / 15 * Math.PI * 2 + t * (2 + n * .2) + n * 2.094;
          const b = (i + 1) / 15 * Math.PI * 2 + t * (2 + n * .2) + n * 2.094;
          const r = radius * (1.1 + Math.sin(t * 7 + n) * .04), height = .5 + (1 + morph * 2.1) * (i / 15);
          this.p.set(Math.cos(a) * r, height, Math.sin(a) * r).add(this.center);
          this.q.set(Math.cos(b) * r, height + .13, Math.sin(b) * r).add(this.center);
          this.line(this.p, this.q, .014 + gathering * .014, COLORS[n]!);
        }
      }
      for (let i = 0; i < 36; i++) {
        const angle = i * 2.399963 + t * (1.8 + i % 3 * .2), r = (.3 + gathering * 2.5) * (.65 + i % 5 * .1);
        this.dummy.position.copy(this.center).add(this.d.set(Math.cos(angle) * r, Math.sin(i * 7.3 + t * 4) * 1.5 + morph * 1.2, Math.sin(angle) * r));
        this.dummy.scale.setScalar(.035 + gathering * .035); this.particle(COLORS[i % 3]!);
      }
    }
    this.rings.forEach(r => { r.visible = false; });
    if (t >= T.crossfire + 3 && t < T.reveal) for (let i = 0; i < 3; i++) {
      const ring = this.rings[i]!; ring.visible = true; ring.position.copy(this.center);
      ring.scale.setScalar(.5 + gathering * (1.6 + i * .2)); ring.rotation.set(Math.PI / 2 + i * .5, t * (i + 1) * .17, i * .9);
      ring.material.opacity = .15 + gathering * .4;
    }
    this.shockwave(3, this.center, t - (T.fusion + .8), 10, .9, 0xb5ffcb);
    if (t >= T.blast && t < T.blast + 1.1) {
      this.p.copy(specimen).add(this.d.set(0, .85, -1.8 - (t - T.blast) * 40)); this.orb(this.p, 1.1, 0xc4ffd3);
      this.a.copy(this.p); this.b.copy(this.p).add(this.d.set(0, 0, 2.3)); this.line(this.a, this.b, .18, 0xb1fff0);
    }
    if (t >= T.doorBlast && t < T.doorBlast + .25) {
      this.p.copy(specimen).add(this.d.set(0, .7, 1.75)); this.q.set(16, 2.7, 94.5).add(ORIGIN);
      this.p.lerp(this.q, (t - T.doorBlast) / .25); this.orb(this.p, .6, 0xbaffcd);
    }
    for (let i = 0; i < 4; i++) {
      const fire = researchPursuerShotTime(i), age = t - fire;
      if (age >= 0 && age < .28) {
        this.a.copy(specimen).add(this.d.set(0, .7, .5)); sampleResearchDronePosition(8 + i, fire + .28, this.b);
        this.p.lerpVectors(this.a, this.b, age / .28); this.orb(this.p, .24, 0xbaffcf);
      }
    }
    for (let i = 0; i < 8; i++) this.sparkBurst(drones[i]!, t - (T.blast + .3 + i * .065), 3.5, 9, COLORS[i % 3]!);
    for (let i = 0; i < 4; i++) {
      sampleResearchDronePosition(8 + i, researchPursuerShotTime(i) + .28, this.p);
      this.sparkBurst(this.p, t - researchPursuerShotTime(i) - .28, 3.8, 14, 0xb1f4ed);
    }
    this.presentShards(t);
    this.atmosphere.present(t, this.center, drones);
    this.presentIncomingFire(t, specimen);
    this.p.copy(specimen).setY(.43); this.shockwave(4, this.p, t - T.landing, 7.5, 1.3, 0xb6d7d4);
    if (t >= T.landing && t < T.landing + 1.4) for (let i = 0; i < 24; i++) {
      const age = t - T.landing, angle = i * 2.399963;
      this.dummy.position.copy(this.p).add(this.d.set(Math.cos(angle) * age * 6, Math.sin(age * Math.PI / 1.4) * (.5 + i % 3 * .14), Math.sin(angle) * age * 6));
      this.dummy.scale.setScalar(Math.max(.001, (.12 + i % 3 * .03) * (1 - age / 1.4))); this.particle(0x829b9e);
    }
    const power = this.shell.visible ? gathering * 100 : t >= T.charge && t < T.blast ? researchWindow(t, T.charge, T.blast) * 90 : 0;
    this.light.position.copy(this.shell.visible ? this.center : specimen); this.light.intensity = active ? power : 0;
    for (const pool of [this.bolts, this.shots, this.sparks, this.shards, this.absorptionRings]) if (pool.count) {
      pool.instanceMatrix.needsUpdate = true; pool.instanceColor!.needsUpdate = true;
    }
  }
  private presentIncomingFire(t: number, specimen: THREE.Vector3): void {
    this.absorptionTarget.copy(specimen); this.absorptionTarget.y += .7;
    for (let i = 0; i < 12; i++) {
      const start = researchDroneFireStart(i), interval = researchDroneFireInterval(i), death = researchDroneDeathTime(i);
      if (t < start || t > death + 1.5) continue;
      const latest = Math.floor((t - start) / interval);
      for (let n = latest; n >= Math.max(0, latest - 4); n--) {
        const fired = start + n * interval, age = t - fired;
        if (fired >= death) continue;
        sampleResearchDronePosition(i, fired, this.a);
        this.incomingDirection.subVectors(this.absorptionTarget, this.a).normalize();
        this.a.addScaledVector(this.incomingDirection, .85);
        this.b.copy(this.absorptionTarget).addScaledVector(this.incomingDirection, -1.15);
        const flight = this.a.distanceTo(this.b) / 58;
        if (age < flight) {
          this.p.lerpVectors(this.a, this.b, age / flight);
          this.q.copy(this.p).addScaledVector(this.incomingDirection, -Math.min(.95, age * 58));
          this.line(this.p, this.q, .065, 0xff5368); this.line(this.p, this.q, .022, 0xffe5cb); this.incomingProjectiles++;
          if (age < .055) {
            this.dummy.position.copy(this.a); this.dummy.scale.setScalar(.13 * (1 - age / .055)); this.particle(0xffe2b5);
          }
          continue;
        }
        const u = (age - flight) / .24;
        if (u < 0 || u >= 1) continue;
        this.absorbedShots++;
        if (this.absorptionRings.count < this.absorptionRings.instanceMatrix.count) {
          this.dummy.position.lerpVectors(this.b, this.absorptionTarget, u * .5);
          this.dummy.scale.setScalar(.035 + .4 * (1 - u)); this.dummy.quaternion.setFromUnitVectors(FORWARD, this.incomingDirection); this.dummy.updateMatrix();
          const slot = this.absorptionRings.count++; this.absorptionRings.setMatrixAt(slot, this.dummy.matrix); this.absorptionRings.setColorAt(slot, this.color.setHex(0x8fffe4));
        }
        for (let p = 0; p < 3; p++) {
          const angle = p * Math.PI * 2 / 3 + u * 4;
          this.dummy.position.lerpVectors(this.b, this.absorptionTarget, u).add(this.d.set(Math.cos(angle) * .18 * (1 - u), Math.sin(angle) * .18 * (1 - u), 0));
          this.dummy.scale.setScalar(.065 * (1 - u)); this.particle(0x91ffe0);
        }
      }
    }
  }
  private lightning(a: THREE.Vector3, b: THREE.Vector3, t: number, color: number, radius: number, segments: number): void {
    for (let i = 0; i < segments; i++) {
      const u = i / segments, v = (i + 1) / segments;
      this.p.lerpVectors(a, b, u); this.q.lerpVectors(a, b, v);
      this.p.x += Math.sin(t * 57 + i * 7.1) * .06 * Math.sin(u * Math.PI);
      this.q.x += Math.sin(t * 57 + (i + 1) * 7.1) * .06 * Math.sin(v * Math.PI);
      this.line(this.p, this.q, radius, color);
    }
  }
  private line(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number): void {
    if (this.bolts.count >= this.bolts.instanceMatrix.count) return;
    this.d.subVectors(b, a); const length = this.d.length(); if (length <= .001) return;
    this.dummy.position.lerpVectors(a, b, .5); this.dummy.scale.set(radius, length, radius);
    this.dummy.quaternion.setFromUnitVectors(UP, this.d.divideScalar(length)); this.dummy.updateMatrix();
    const i = this.bolts.count++; this.bolts.setMatrixAt(i, this.dummy.matrix); this.bolts.setColorAt(i, this.color.setHex(color));
  }
  private orb(at: THREE.Vector3, radius: number, color: number): void {
    if (this.shots.count >= this.shots.instanceMatrix.count) return;
    this.dummy.position.copy(at); this.dummy.scale.setScalar(radius); this.dummy.quaternion.identity(); this.dummy.updateMatrix();
    const i = this.shots.count++; this.shots.setMatrixAt(i, this.dummy.matrix); this.shots.setColorAt(i, this.color.setHex(color));
  }
  private particle(color: number): void {
    if (this.sparks.count >= this.sparks.instanceMatrix.count) return;
    this.dummy.quaternion.identity(); this.dummy.updateMatrix(); const i = this.sparks.count++;
    this.sparks.setMatrixAt(i, this.dummy.matrix); this.sparks.setColorAt(i, this.color.setHex(color));
  }
  private sparkBurst(at: THREE.Vector3, age: number, strength: number, count: number, color: number): void {
    if (age < 0 || age > 1.35) return;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963;
      this.dummy.position.copy(at).add(this.d.set(Math.cos(angle) * age * strength, Math.sin(i * 3.7) * age * strength - age * age * 2, Math.sin(angle) * age * strength));
      this.dummy.scale.setScalar(Math.max(.001, (1 - age / 1.35) * (.04 + i % 4 * .025))); this.particle(color);
    }
  }
  private shockwave(index: number, at: THREE.Vector3, age: number, radius: number, seconds: number, color: number): void {
    const ring = this.rings[index]!; if (age < 0 || age >= seconds) return;
    ring.visible = true; ring.position.copy(at); ring.position.y = index === 4 ? .44 : ORIGIN.y + .035;
    ring.rotation.set(-Math.PI / 2, 0, 0); ring.scale.setScalar(Math.max(.05, age / seconds * radius));
    ring.material.color.setHex(color); ring.material.opacity = (1 - age / seconds) * .75;
  }
  private presentShards(t: number): void {
    const glass = t >= T.glass && t < T.glass + 3.5, door = t >= T.doorBlast + .25 && t < T.doorBlast + 1.8;
    if (!glass && !door) return;
    const age = t - (glass ? T.glass : T.doorBlast + .25), count = glass ? 80 : 32;
    for (let i = 0; i < count; i++) {
      const x = ((i * 17) % 13 - 6) * (glass ? .95 : .29), y = .3 + ((i * 7) % 11) * (glass ? .7 : .45);
      this.dummy.position.set(16 + x + Math.sin(i * 9) * age * 2, y + age * 1.3 - age * age * 4.8,
        (glass ? 111.3 : 94.5) + age * (4 + i % 5)); this.dummy.position.add(ORIGIN);
      this.dummy.rotation.set(age * (i % 3 + 1), age * 2 + i, age * 1.2);
      this.dummy.scale.set(.12 + i % 3 * .16, .17 + i % 4 * .14, .08); this.dummy.updateMatrix();
      this.shards.setMatrixAt(i, this.dummy.matrix); this.shards.setColorAt(i, this.color.setHex(glass ? i % 3 ? 0xb8e9f0 : 0xffffff : 0x8aabb6));
    }
    this.shards.count = count;
  }
  reset(): void { this.root.visible = false; this.light.intensity = 0; this.absorptionRings.count = this.incomingProjectiles = this.absorbedShots = 0; this.atmosphere.reset(); }
  dispose(): void {
    this.reset(); this.root.removeFromParent(); this.light.removeFromParent(); this.atmosphere.dispose();
    for (const pool of [this.bolts, this.shots, this.sparks, this.shards, this.absorptionRings]) pool.dispose();
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
  }
  private pool(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geom(geometry), this.mat(material), capacity);
    mesh.setColorAt(0, this.color); mesh.count = 0; mesh.frustumCulled = false; mesh.userData.prewarmInstanceCount = 1; this.root.add(mesh); return mesh;
  }
  private geom<G extends THREE.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
  private mat<M extends THREE.Material>(m: M): M { this.materials.add(m); return m; }
}
