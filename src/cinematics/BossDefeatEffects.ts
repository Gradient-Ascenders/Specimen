import * as THREE from 'three';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';
import { ENDING_ANCHOR, ENDING_TIMING as T, endingProgress, endingBeamCollision, endingDroneDeathTime, sampleEndingDrone, sampleEndingSlime, sampleEndingIncomingShot,
  endingGoopHitTime, sampleEndingGoopHit, endingCollapseBlastTime, endingCollapseBlastPosition } from './BossDefeatTimeline.ts';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
export class BossDefeatEffects {
  readonly root = new THREE.Group();
  readonly collision = new THREE.Vector3();
  readonly smoke: THREE.InstancedMesh;
  readonly sparks: THREE.InstancedMesh;
  readonly bolts: THREE.InstancedMesh;
  readonly incoming: THREE.InstancedMesh;
  readonly explosions: THREE.InstancedMesh;
  readonly rings: THREE.InstancedMesh;
  readonly beams: THREE.Mesh[] = [];
  readonly charges: THREE.Mesh[] = [];
  readonly core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly smokeMaterial: THREE.ShaderMaterial;
  private readonly explosionMaterial: THREE.ShaderMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly direction = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly tips = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly color = new THREE.Color();
  private directHits = 0;
  private readonly lightning: THREE.LineSegments;
  private readonly arcVertices = new Float32Array(8 * 30 * 2 * 3);
  private sparkCount = 0; private boltCount = 0; private smokeCount = 0; private ringCount = 0;
  private density=1;
  setDensity(value:number):void { this.density=Number.isFinite(value)?THREE.MathUtils.clamp(value,.5,1):1; }
  constructor() {
    this.root.name = 'boss-ending-preallocated-effects';
    const cylinder = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true));
    const sphere = this.geometry(new THREE.IcosahedronGeometry(1, 2));
    for (const color of [0x36ffd3, 0xff254f]) {
      for (let layer = 0; layer < 3; layer++) {
        const material = this.material(new THREE.MeshBasicMaterial({ color: layer === 0 ? 0xf6ffef : color,
          transparent: true, opacity: layer === 0 ? .95 : layer === 1 ? .58 : .1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        const mesh = new THREE.Mesh(cylinder, material); mesh.visible = false; mesh.frustumCulled = false; this.root.add(mesh); this.beams.push(mesh);
      }
      const mesh = new THREE.Mesh(sphere, this.material(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending })));
      mesh.visible = false; this.charges.push(mesh); this.root.add(mesh);
    }
    this.core = new THREE.Mesh(sphere, this.material(new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.core.name = 'balanced-beam-collision'; this.root.add(this.core);
    this.smokeMaterial = this.material(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vN,vV,vP;void main(){vec4 p=instanceMatrix*vec4(position,1.);vP=position;
        vec4 mv=modelViewMatrix*p;vV=-mv.xyz;vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vN,vV,vP;uniform float uTime;void main(){float edge=pow(abs(dot(normalize(vN),normalize(vV))),2.);
        float n=.7+.3*sin(vP.x*9.+uTime)*sin(vP.y*8.-uTime*.6)*sin(vP.z*11.);
        vec3 c=mix(vec3(.11,.14,.16),vec3(.48,.53,.51),clamp(vP.y*.4+.5,0.,1.));gl_FragColor=vec4(c,edge*n*.42);}` }));
    this.smoke = new THREE.InstancedMesh(sphere, this.smokeMaterial, 192);
    this.sparks = new THREE.InstancedMesh(this.geometry(new THREE.IcosahedronGeometry(1, 0)), this.material(new THREE.MeshBasicMaterial({ color: 0xffddb1 })), 256);
    this.bolts = new THREE.InstancedMesh(cylinder, this.material(new THREE.MeshBasicMaterial({ color: 0x6bff51 })), 64);
    this.incoming = new THREE.InstancedMesh(cylinder, this.material(new THREE.MeshBasicMaterial({ color: 0xff6457 })), 64);
    this.explosionMaterial = this.material(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vP,vN,vV,vTint;void main(){vP=position;vTint=instanceColor;
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vV=-mv.xyz;
        vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vP,vN,vV,vTint;uniform float uTime;void main(){
        float edge=pow(abs(dot(normalize(vN),normalize(vV))),1.25);
        float fire=.6+.4*sin(vP.x*13.+uTime*11.)*sin(vP.y*9.-uTime*7.)*sin(vP.z*11.);
        vec3 hot=mix(vec3(3.6,.38,.025),vec3(5.,3.5,1.4),edge*fire);
        gl_FragColor=vec4(hot*vTint.r,edge*fire*.8);}` }));
    this.explosions = new THREE.InstancedMesh(sphere, this.explosionMaterial, 24); this.explosions.setColorAt(0, this.color.setRGB(1, 1, 1));
    this.rings = new THREE.InstancedMesh(this.geometry(new THREE.TorusGeometry(1, .018, 5, 64)), this.material(new THREE.MeshBasicMaterial({ color: 0x96ffea, transparent: true, opacity: .38, depthWrite: false, blending: THREE.AdditiveBlending })), 24);
    for (const pool of [this.smoke, this.sparks, this.bolts, this.incoming, this.explosions, this.rings]) {
      pool.count = 0; pool.frustumCulled = false; pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(pool);
    }
    this.explosions.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    const arcs = this.geometry(new THREE.BufferGeometry()); arcs.setAttribute('position', new THREE.BufferAttribute(this.arcVertices, 3).setUsage(THREE.DynamicDrawUsage));
    this.lightning = new THREE.LineSegments(arcs, this.material(new THREE.LineBasicMaterial({ color: 0xd9fff1, transparent: true, opacity: .8, blending: THREE.AdditiveBlending })));
    this.lightning.frustumCulled = false; this.root.add(this.lightning);
  }
  private geometry<G extends THREE.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
  private material<M extends THREE.Material>(m: M): M { this.materials.add(m); return m; }
  private instance(pool: THREE.InstancedMesh, index: number, at: THREE.Vector3, x: number, y = x, z = x): void {
    this.dummy.position.copy(at); this.dummy.scale.set(x, y, z); this.dummy.updateMatrix(); pool.setMatrixAt(index, this.dummy.matrix);
  }
  private connect(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
    this.direction.subVectors(to, from); mesh.position.addVectors(from, to).multiplyScalar(.5);
    mesh.scale.set(radius, this.direction.length(), radius); mesh.quaternion.setFromUnitVectors(UP, this.direction.normalize());
  }
  present(t: number, specimenSource: THREE.Vector3, bossSource: THREE.Vector3, goop: THREE.Vector3): void {
    this.sparkCount = this.boltCount = this.smokeCount = this.ringCount = this.incoming.count = this.explosions.count = this.directHits = 0;
    this.dummy.rotation.set(0, 0, 0); this.smokeMaterial.uniforms.uTime!.value = t;
    this.explosionMaterial.uniforms.uTime!.value = t;
    endingBeamCollision(t, specimenSource, bossSource, this.collision);
    const firing = t >= T.fire && t < T.explosion, clashing = t >= T.impact && t < T.explosion, charge = endingProgress(t, T.charge, T.fire);
    const power = 1.2 + endingProgress(t, T.impact, T.explosion) * 1.5;
    this.tips[0]!.lerpVectors(specimenSource, this.collision, Math.max(.001, endingProgress(t, T.specimenFire, T.impact)));
    this.tips[1]!.lerpVectors(bossSource, this.collision, Math.max(.001, endingProgress(t, T.fire, T.impact)));
    const pulse = 1 + Math.sin(t * 33) * .035;
    this.beams.forEach((mesh, i) => { mesh.visible = t >= (i < 3 ? T.specimenFire : T.fire) && t < T.explosion;
      if (mesh.visible) this.connect(mesh, i < 3 ? specimenSource : bossSource, this.tips[i < 3 ? 0 : 1]!, power * [.46, 1, 1.55][i % 3]! * pulse); });
    this.charges.forEach((mesh, i) => { mesh.visible = t >= T.charge && t < T.explosion;
      mesh.position.copy(i === 0 ? specimenSource : bossSource); mesh.scale.setScalar((firing ? power : .15 + charge * 2.1) * pulse); mesh.rotation.set(t, t * .7, 0); });
    this.core.visible = clashing; this.core.position.copy(this.collision);
    this.core.scale.setScalar((1.6 + endingProgress(t, T.impact, T.explosion) * 5) * (1 + Math.sin(t * 24) * .06));
    this.lightning.visible = t >= T.charge && t < T.explosion;
    if (this.lightning.visible) {
      let cursor = 0;
      for (let arc = 0; arc < 8; arc++) for (let j = 0; j < 30; j++) for (let endpoint = 0; endpoint < 2; endpoint++) {
        const p = (j + endpoint) / 30, start = arc < 4 ? specimenSource : bossSource;
        this.point.lerpVectors(start, firing ? this.tips[arc < 4 ? 0 : 1]! : start, p);
        const a = arc * Math.PI / 2 + p * 14 + t * 7, radius = (firing ? power : charge * 3.2) * Math.sin(p * Math.PI) * (1.2 + Math.sin(j * 5.1 + Math.floor(t * 18)) * .35);
        this.point.x += Math.cos(a) * radius; this.point.y += Math.sin(a) * radius;
        this.arcVertices[cursor++] = this.point.x; this.arcVertices[cursor++] = this.point.y; this.arcVertices[cursor++] = this.point.z;
      }
      this.lightning.geometry.getAttribute('position').needsUpdate = true;
    }
    if (clashing) {
      for (let i = 0; i < 100; i++) {
        const age = ((t * 1.6 + i * .173) % 1.5), angle = i * 2.39996;
        this.point.copy(this.collision).add(this.direction.set(Math.sin(angle) * age * 8, Math.cos(angle) * age * 5 - age * age * 2, Math.sin(i * 8.2) * age * 8));
        this.instance(this.sparks, this.sparkCount++, this.point, .04 + age * .04);
      }
      for (let i = 0; i < 8; i++) {
        const phase = (t * .7 + i / 8) % 1;
        this.dummy.rotation.set(Math.PI / 2 + .15 * Math.sin(i), i * .4, 0);
        this.instance(this.rings, this.ringCount++, this.collision, 2 + phase * 20);
      }
    }
    if (t < T.explosion) for (let i = 0; i < 12; i++) {
      const a = i * 2.39996, age = (t * .4 + i * .21) % 1;
      this.point.copy(bossSource).add(this.direction.set(Math.sin(a) * 4, 1 + age * 7, 4 + Math.cos(a) * 3));
      this.dummy.rotation.set(i, t * .1, 0); this.instance(this.smoke, this.smokeCount++, this.point, 1 + age * 2.4);
    }
    if (t >= T.explosion && t < T.explosion + 12) {
      const age = t - T.explosion;
      for (let i = 0; i < 44; i++) {
        const a = i * 2.39996, r = (2 + i % 5) * Math.min(3, age * .8);
        this.point.copy(i % 3 === 0 ? this.collision : ENDING_ANCHOR).add(this.direction.set(Math.sin(a) * r, (i % 7) * 1.2 + age * .7, Math.cos(a) * r));
        this.dummy.rotation.set(i + age * .1, i, 0); const size = Math.max(.01, (5 + age * .5) * (1 - endingProgress(age, 6, 12)));
        this.instance(this.smoke, this.smokeCount++, this.point, size, size * .8, size);
      }
      for (let i = 0; i < 120; i++) {
        const a = i * 2.39996; this.point.copy(this.collision).add(this.direction.set(Math.sin(a) * age * 12, (2 + i % 9) * age - age * age * 2, Math.cos(a) * age * 12));
        this.instance(this.sparks, this.sparkCount++, this.point, .08 * Math.max(0, 1 - age / 8));
      }
      this.dummy.rotation.set(Math.PI / 2, 0, 0); this.instance(this.rings, this.ringCount++, ENDING_ANCHOR, age * 20);
    }
    if (t >= T.explosion && t < T.black) for (let i = 0; i < 28; i++) {
      const age = (t * .13 + i * .37) % 1;
      this.point.set(Math.sin(i * 5.3) * 76, 4 + age * 24, FINAL_ARENA.centreZ - 70 + Math.cos(i * 3.7) * 29);
      this.dummy.rotation.set(i, age, 0); this.instance(this.smoke, this.smokeCount++, this.point, 5 + age * 7);
    }
    if (t >= T.leave && t < T.hideGoop) for (let i = 0; i < 24; i++) {
      const death = endingDroneDeathTime(i), age = t - death;
      if (!Number.isFinite(death)) continue;
      sampleEndingDrone(i, Math.min(t, death), this.target);
      const shot = t - (death - 1), flight = 1;
      if (shot >= 0 && shot < flight) {
        this.origin.copy(goop).y += .6; this.point.lerpVectors(this.origin, this.target, shot / flight);
        this.dummy.quaternion.setFromUnitVectors(UP, this.direction.subVectors(this.target, this.origin).normalize());
        this.instance(this.bolts, this.boltCount++, this.point, .2, 1.6, .2);
      }
      if (age >= 0 && age < 1.3) for (let j = 0; j < 7; j++) {
        const a = j * 2.39996 + i;
        this.point.copy(this.target).add(this.direction.set(Math.sin(a) * age * 4, Math.cos(a) * age * 3 - age * age, Math.sin(j * 5) * age * 3));
        this.dummy.rotation.set(age, j, 0); this.instance(this.sparks, this.sparkCount++, this.point, .16 * (1 - age / 1.3));
      }
    }
    if (t >= T.leave && t < T.hideGoop) {
      const shotOrdinal = Math.floor((t - T.leave) / .7);
      for (let n = Math.max(0, shotOrdinal - 1); n <= shotOrdinal; n++) {
        const age = t - (T.leave + n * .7), index = (n * 7 + 3) % 24;
        if (age < 0 || age >= .7 || !sampleEndingDrone(index, t, this.target)) continue;
        sampleEndingSlime('goop', T.leave + n * .7, this.origin); this.origin.y += .55;
        this.point.lerpVectors(this.origin, this.target, age / .7);
        this.dummy.quaternion.setFromUnitVectors(UP, this.direction.subVectors(this.target, this.origin).normalize());
        this.instance(this.bolts, this.boltCount++, this.point, .18, 1.4, .18);
      }
    }
    if (t >= T.returnFire && t < T.hideGoop) for (let i = 0; i < 24; i++) {
      const ordinal = Math.floor((t - T.returnFire - i * .045) / 1.3);
      for (let n = Math.max(0, ordinal - 1); n <= ordinal; n++) {
        const launch = T.returnFire + i * .045 + n * 1.3, age = t - launch;
        if (age < 0 || age > 1 || !sampleEndingIncomingShot(i, launch, this.origin, this.target)) continue;
        if (age < .65) {
          this.point.lerpVectors(this.origin, this.target, age / .65);
          this.dummy.quaternion.setFromUnitVectors(UP, this.direction.subVectors(this.target, this.origin).normalize());
          this.instance(this.incoming, this.incoming.count++, this.point, .065, 1.5, .065);
        } else for (let spark = 0; spark < 3; spark++) {
          this.point.copy(this.target); this.point.x += Math.sin(i + spark * 3) * (age - .65) * 2; this.point.y += (age - .65) * (2 + spark);
          this.instance(this.sparks, this.sparkCount++, this.point, .06 * (1 - (age - .65) / .35));
        }
      }
    }
    if (t >= T.returnFire && t < T.hideGoop) for (let i = 0; i < 3; i++) {
      const age = t - endingGoopHitTime(i); sampleEndingGoopHit(i, this.origin, this.target);
      if (age >= -.55 && age < 0) {
        this.point.lerpVectors(this.origin, this.target, (age + .55) / .55);
        this.dummy.quaternion.setFromUnitVectors(UP, this.direction.subVectors(this.target, this.origin).normalize());
        this.instance(this.incoming, this.incoming.count++, this.point, .1, 1.6, .1);
      }
      if (age < 0 || age >= .45) continue;
      this.directHits++;
      this.dummy.quaternion.setFromUnitVectors(FORWARD, this.direction.subVectors(this.origin, this.target).normalize());
      this.instance(this.rings, this.ringCount++, this.target, .16 + age * 1.7);
      for (let n = 0; n < 14; n++) {
        const a = n * 2.39996; this.point.copy(this.target).add(this.direction.set(Math.sin(a) * age * 2, Math.cos(a) * age * 2, Math.sin(a * 3) * age * 2));
        this.instance(this.sparks, this.sparkCount++, this.point, .11 * (1 - age / .45));
      }
    }
    if (t >= T.destruction && t < T.black) {
      for (let i = 0; i < 112; i++) {
        const phase = ((t - T.destruction) * .15 + i * .137) % 1;
        this.point.set(15 + i * 23 % 65, 5 + phase * 55, FINAL_ARENA.centreZ + 10 + i * 17 % 80);
        this.dummy.rotation.set(i, phase, 0); this.instance(this.smoke, this.smokeCount++, this.point, 5 + phase * 10);
      }
      for (let i = 0; i < 12; i++) {
        const age = t - endingCollapseBlastTime(i); if (age < 0 || age >= 1.3) continue;
        endingCollapseBlastPosition(i, this.target); this.dummy.rotation.set(age * .7, i, age);
        const size = 1 + age * 8; this.instance(this.explosions, this.explosions.count, this.target, size, size * 1.35, size);
        this.color.setRGB(1, .82 - age * .4, .25).multiplyScalar((1 - age / 1.3) ** 2);
        this.explosions.setColorAt(this.explosions.count++, this.color);
        for (let n = 0; n < 24; n++) {
          const a = n * 2.39996; this.point.copy(this.target).add(this.direction.set(Math.sin(a) * age * 11, Math.cos(a) * age * 8 - age * age * 3, Math.sin(n * 4) * age * 9));
          this.instance(this.sparks, this.sparkCount++, this.point, .16 * (1 - age / 1.3));
        }
      }
    }
    this.smoke.count = Math.ceil(this.smokeCount*this.density); this.bolts.count = this.boltCount;
    this.sparks.count = Math.ceil(this.sparkCount*this.density); this.rings.count = Math.ceil(this.ringCount*this.density);
    // Upload the active prefix, not the complete dormant pool. Clear ranges
    // each sample because a hidden/cull-skipped frame may not consume them.
    for (const pool of [this.smoke, this.bolts, this.incoming, this.explosions, this.sparks, this.rings]) {
      pool.instanceMatrix.clearUpdateRanges();
      if(pool.count){pool.instanceMatrix.addUpdateRange(0,pool.count*16);pool.instanceMatrix.needsUpdate=true;}
    }
    if (this.explosions.instanceColor) {
      this.explosions.instanceColor.clearUpdateRanges();
      if(this.explosions.count){this.explosions.instanceColor.addUpdateRange(0,this.explosions.count*3);this.explosions.instanceColor.needsUpdate=true;}
    }
  }
  get diagnostics() { return { smoke: this.smoke.count, sparks: this.sparks.count, bolts: this.bolts.count, rings: this.rings.count,
    beamVisible: this.core.visible, beamsLaunched: this.beams[3]!.visible, specimenBeamLaunched: this.beams[0]!.visible,
    incoming: this.incoming.count, directHits: this.directHits, explosions: this.explosions.count,
    tips: this.tips.map(v => v.toArray()), collision: this.collision.toArray(), equalBeamRadius: this.beams[1]!.scale.x === this.beams[4]!.scale.x }; }
  dispose(): void { this.root.removeFromParent(); for (const pool of [this.smoke, this.bolts, this.incoming, this.explosions, this.sparks, this.rings]) pool.dispose(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}
