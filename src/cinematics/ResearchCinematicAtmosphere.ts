import * as THREE from 'three';
import { RESEARCH_TIMING as T, researchWindow } from './BlackoutResearchTimeline.ts';
import { RESEARCH_WING_ORIGIN } from './BlackoutResearchLayout.ts';

const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}`;
const BILLBOARD_VERTEX = `varying vec2 vUv;varying vec3 vColor;varying float vSeed;
void main(){vUv=uv;vColor=instanceColor;vSeed=instanceMatrix[3].x+instanceMatrix[3].z;
vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
p.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*p;}`;
const PUFF_FRAGMENT = `${NOISE}
varying vec2 vUv;varying vec3 vColor;varying float vSeed;uniform float uTime,uHeat,uOpacity;
void main(){vec2 p=(vUv-.5)*2.;float n=noise(p*3.+vec2(vSeed,uTime*.24));
float edge=1.-length(p)+n*.22;float a=smoothstep(0.,.3,edge)*.62;
vec3 cold=vColor*(.65+n*.45);vec3 hot=mix(vColor,vec3(1.,.98,.7),pow(max(0.,1.-length(p)),2.));
gl_FragColor=vec4(mix(cold,hot*2.,uHeat),a*uOpacity);}`;

export class ResearchCinematicAtmosphere {
  readonly root = new THREE.Group();
  readonly smoke: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly detonations: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly debris: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly veil: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly plane = new THREE.PlaneGeometry(2, 2);
  private readonly chunk = new THREE.BoxGeometry(1, 1, 1);
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly point = new THREE.Vector3();
  constructor() {
    this.root.name = 'research-fusion-atmosphere';
    const puff = (heat: number) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
      blending: heat ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uHeat: { value: heat }, uOpacity: { value: 1 } }, vertexShader: BILLBOARD_VERTEX, fragmentShader: PUFF_FRAGMENT });
    this.smoke = new THREE.InstancedMesh(this.plane, puff(0), 32);
    this.detonations = new THREE.InstancedMesh(this.plane, puff(1), 32);
    this.debris = new THREE.InstancedMesh(this.chunk, new THREE.MeshBasicMaterial({ color: 0xa0b6ba }), 40);
    for (const pool of [this.smoke, this.detonations, this.debris]) {
      pool.frustumCulled = false; pool.count = 0; pool.setColorAt(0, this.color); this.root.add(pool);
    }
    this.veil = new THREE.Mesh(this.plane, new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `${NOISE}varying vec2 vUv;uniform float uTime,uOpacity,uFlash;void main(){
        vec2 p=vUv*4.-vec2(uTime*.08,uTime*.13);float n=noise(p)+noise(p*2.1+9.)*.35;
        vec3 c=mix(vec3(.085,.12,.13),vec3(.42,.49,.47),n*.75);
        c+=uFlash*vec3(.6,.85,.66)*(1.-distance(vUv,vec2(.5))*.5);gl_FragColor=vec4(c,uOpacity);}` }));
    this.veil.frustumCulled = false; this.veil.renderOrder = 10000; this.root.add(this.veil);
  }
  get diagnostics() { return { smoke: this.smoke.count, debris: this.debris.count, detonations: this.detonations.count,
    smokeCover: this.veil.material.uniforms.uOpacity!.value as number }; }
  present(t: number, center: THREE.Vector3, drones: readonly THREE.Vector3[]): void {
    this.smoke.count = this.debris.count = this.detonations.count = 0;
    this.smoke.material.uniforms.uTime!.value = this.detonations.material.uniforms.uTime!.value = t;
    const burst = T.fusion - .1, age = t - burst;
    this.smoke.material.uniforms.uOpacity!.value = age >= 0 ? 1 - researchWindow(age, 2, 7) : 0;
    const cover = researchWindow(t, burst, burst + .35) * (1 - researchWindow(t, T.fusion + 2, T.reveal + 2));
    this.veil.visible = cover > 0;
    this.veil.material.uniforms.uTime!.value = t; this.veil.material.uniforms.uOpacity!.value = cover;
    this.veil.material.uniforms.uFlash!.value = age >= 0 ? Math.exp(-age * 3) : 0;
    if (age >= 0 && age < 7) for (let i = 0; i < 28; i++) {
      const angle = i * 2.399963, expansion = Math.min(age * 5, 3.8 + i % 4 * .35);
      this.dummy.position.copy(center).add(this.point.set(Math.cos(angle) * expansion,
        .3 + i % 5 * .38 + age * .23, Math.sin(angle) * expansion));
      this.dummy.scale.setScalar(.25 + Math.min(2.2, age * 3.5) + age * .06);
      this.add(this.smoke, i % 3 ? 0x53676b : 0x82948c);
    }
    if (t >= T.crossfire + 4 && t < T.reveal + 1) for (let i = 0; i < 36; i++) {
      const start = T.crossfire + 4 + i * .17;
      if (t < start) continue;
      const a = (t - start) % 2.5;
      const x = Math.sin(i * 7.1) * 4.6, z = Math.cos(i * 3.7) * 3.8;
      const y = Math.max(.12, 8.8 - a * a * 5.5);
      this.dummy.position.set(center.x + x + Math.sin(i) * a * .2, RESEARCH_WING_ORIGIN.y + y, center.z + z);
      this.dummy.rotation.set(a * (i % 3 + 1), i + a * 2, a * 1.4);
      const size = (.07 + i % 5 * .045) * (1 - researchWindow(a, 2, 2.5));
      this.dummy.scale.set(size * 1.8, size * .45, size);
      this.add(this.debris, i % 7 ? 0x9cb2b5 : 0xeaffdd, false);
    }
    for (let i = 0; i < 8; i++) {
      const a = t - (T.blast + .3 + i * .065);
      if (a < 0 || a >= .85) continue;
      for (let n = 0; n < 3; n++) {
        this.dummy.position.copy(drones[i]!).add(this.point.set(Math.sin(i * 9 + n) * a, n * .22, Math.cos(i + n) * a));
        this.dummy.scale.setScalar((.15 + Math.sin(Math.min(1, a / .85) * Math.PI) * (n ? 1.2 : 2.1)));
        this.add(this.detonations, n ? 0xffa54d : 0xaaffb4);
      }
    }
    if (age >= 0 && age < .7) {
      this.dummy.position.copy(center); this.dummy.scale.setScalar(.5 + age * 13);
      this.add(this.detonations, 0xcaffdf);
    }
    for (const pool of [this.smoke, this.debris, this.detonations]) if (pool.count) {
      pool.instanceMatrix.needsUpdate = true; pool.instanceColor!.needsUpdate = true;
    }
  }
  private add(pool: THREE.InstancedMesh, color: number, billboard = true): void {
    if (pool.count >= pool.instanceMatrix.count) return;
    if (billboard) this.dummy.quaternion.identity();
    this.dummy.updateMatrix(); const i = pool.count++; pool.setMatrixAt(i, this.dummy.matrix); pool.setColorAt(i, this.color.setHex(color));
  }
  reset(): void { this.smoke.count = this.debris.count = this.detonations.count = 0; this.veil.visible = false; this.veil.material.uniforms.uOpacity!.value = 0; }
  dispose(): void {
    this.root.removeFromParent(); this.plane.dispose(); this.chunk.dispose();
    for (const pool of [this.smoke, this.debris, this.detonations]) { pool.dispose(); pool.material.dispose(); }
    this.veil.material.dispose();
  }
}
