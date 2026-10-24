import * as THREE from 'three';
import type { Vector3State } from '../slime/SlimePresentationContract.ts';

const CAPACITY = 64;

/** A fixed pool of soft jade/gold wisps, emitted by resolved player travel. */
export class SpecimenTrail {
  readonly root: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY * 3), 3);
  private readonly alphas = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY), 1);
  private readonly sizes = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY), 1);
  private readonly colors = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY * 3), 3);
  private readonly slots = Array.from({ length: CAPACITY }, () => ({
    age: 1, life: 0, size: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
  }));
  private readonly previousTravel = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly displacement = new THREE.Vector3();
  private readonly viewport = new THREE.Vector2();
  private readonly radius: number;
  private cursor = 0;
  private distance = 0;
  private tracked = false;
  private requestedVisible = false;
  private count = 0;
  private primed = false;
  private disposed = false;

  constructor(radius: number) {
    this.radius = radius;
    for (const attribute of [this.positions, this.alphas, this.sizes]) attribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('trailAlpha', this.alphas);
    this.geometry.setAttribute('trailSize', this.sizes);
    this.geometry.setAttribute('trailColor', this.colors);
    for (let i = 0; i < CAPACITY; i++) {
      const gold = i % 7 === 0;
      this.colors.setXYZ(i, gold ? 1 : 0.08, gold ? 0.72 : 0.9, gold ? 0.06 : 0.72);
    }
    const material = new THREE.ShaderMaterial({
      name: 'Specimen-Locomotion-Aura', transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uViewportHeight: { value: 720 }, uOpacity: { value: 1 } },
      vertexShader: `
        attribute float trailAlpha;
        attribute float trailSize;
        attribute vec3 trailColor;
        uniform float uViewportHeight;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(trailSize * uViewportHeight * projectionMatrix[1][1] / max(1.0, -mvPosition.z), 1.0, 48.0);
          vAlpha = trailAlpha;
          vColor = trailColor;
        }`,
      fragmentShader: `
        uniform float uOpacity;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float radius = length(gl_PointCoord * 2.0 - 1.0);
          float glow = pow(max(0.0, 1.0 - radius * radius), 2.0);
          float alpha = vAlpha * glow * uOpacity * 0.65;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(vColor, alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.root = new THREE.Points(this.geometry, material);
    this.root.name = 'specimen-movement-aura';
    this.root.visible = false; this.root.frustumCulled = false;
    this.root.onBeforeRender = renderer => {
      renderer.getDrawingBufferSize(this.viewport);
      material.uniforms.uViewportHeight!.value = this.viewport.y;
    };
  }

  get diagnostics() { return { activeParticles: this.count, capacity: CAPACITY, visible: this.root.visible }; }
  setVisible(value: boolean): void {
    if (this.requestedVisible === value) return;
    this.requestedVisible = value;
    if (!value) this.reset();
  }
  setOpacity(value: number): void { this.root.material.uniforms.uOpacity!.value = value; }

  update(dt: number, position: Vector3State, travel: Vector3State, up: THREE.Vector3, maximumSpeed: number, charge: number): void {
    if (this.disposed || !this.requestedVisible) return;
    for (const slot of this.slots) {
      slot.age += dt;
      if (slot.age < slot.life) slot.position.addScaledVector(slot.velocity, dt);
    }
    this.displacement.copy(travel).sub(this.previousTravel).projectOnPlane(up);
    const distance = this.displacement.length();
    const discontinuity = this.previousPosition.distanceTo(position) > Math.max(this.radius * 4, maximumSpeed * dt * 2) || distance > maximumSpeed * dt * 1.5;
    if (this.tracked && discontinuity) this.reset();
    if (this.tracked && distance > 0.15 * dt) {
      this.direction.copy(this.displacement).normalize();
      this.side.crossVectors(this.direction, up).normalize();
      this.distance += distance;
      let emitted = 0;
      const spacing = this.radius * 0.3;
      while (this.distance >= spacing && emitted < 8) {
        this.distance -= spacing;
        for (let j = 0; j < 2; j++) {
          const index = this.cursor++ % CAPACITY, slot = this.slots[index]!;
          const offset = Math.sin(this.cursor * 2.399963) * this.radius * 0.4;
          slot.position.copy(position).addScaledVector(this.direction, -this.radius * 0.7 - this.distance)
            .addScaledVector(this.side, offset).addScaledVector(up, this.radius * (-0.65 + (index % 5) * 0.14));
          slot.velocity.copy(up).multiplyScalar(this.radius * 0.3).addScaledVector(this.direction, -this.radius * 0.25);
          slot.age = 0; slot.life = 0.45 + (index % 3) * 0.08 + charge * 0.12;
          slot.size = this.radius * (0.2 + (index % 3) * 0.035);
        }
        emitted += 2;
      }
      this.distance %= spacing;
    } else this.distance = 0;
    this.previousTravel.copy(travel); this.previousPosition.copy(position); this.tracked = true;
    this.writeParticles();
  }

  private writeParticles(): void {
    this.count = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const slot = this.slots[i]!, remaining = slot.life > 0 ? Math.max(0, 1 - slot.age / slot.life) : 0;
      this.positions.setXYZ(i, slot.position.x, slot.position.y, slot.position.z);
      this.alphas.setX(i, remaining * remaining);
      this.sizes.setX(i, slot.size * (0.5 + remaining * 0.5));
      if (remaining > 0) this.count++;
    }
    this.positions.needsUpdate = this.alphas.needsUpdate = this.sizes.needsUpdate = true;
    this.root.visible = this.requestedVisible && this.count > 0;
  }

  primeResources(position: Vector3State, render: (root: THREE.Object3D) => void): void {
    if (this.primed || this.count > 0 || this.disposed) return;
    const requested = this.requestedVisible;
    try {
      this.requestedVisible = true;
      const slot = this.slots[0]!;
      slot.position.copy(position); slot.age = 0; slot.life = 1; slot.size = this.radius * 0.2;
      this.writeParticles(); render(this.root); this.primed = true;
    } finally { this.reset(); this.requestedVisible = requested; }
  }
  reset(): void {
    for (const slot of this.slots) { slot.age = 1; slot.life = 0; }
    this.count = this.cursor = this.distance = 0; this.tracked = false;
    this.root.visible = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.reset(); this.root.removeFromParent();
    this.geometry.dispose(); this.root.material.dispose();
  }
}
