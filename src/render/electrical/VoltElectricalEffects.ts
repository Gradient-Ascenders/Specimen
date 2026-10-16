import * as THREE from 'three';
import type { VoltElectricalReadModel } from '../../abilities/VoltElectricalSystem.ts';
import { markDecorativeEffect } from '../GraphicsResourcePolicy.ts';

const SEGMENTS = 32;
const STRANDS = 3;
const PATH_COMPONENTS = (SEGMENTS + 1) * 3;
const FORKS = 4;
const FORK_SEGMENTS = 4;
const PARTICLES = 24;

function dynamicPositions(geometry: THREE.BufferGeometry, count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  return positions;
}

function arcNoise(node: number, time: number): number {
  const tick = Math.floor(time);
  const fraction = time - tick;
  const a = Math.sin(node * 127.1 + tick * 311.7) * 43758.5453;
  const b = Math.sin(node * 127.1 + (tick + 1) * 311.7) * 43758.5453;
  const start = (a - Math.floor(a)) * 2 - 1;
  const end = (b - Math.floor(b)) * 2 - 1;
  return start + (end - start) * fraction * fraction * (3 - 2 * fraction);
}

function softPoints(size: number, color: number, kind: 'charge' | 'corona' | 'impact' = 'charge'): THREE.PointsMaterial {
  const material = new THREE.PointsMaterial({
    color, size, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  });
  material.onBeforeCompile = shader => {
    if (kind === 'corona') {
      shader.vertexShader = `attribute float contactScale;\n${shader.vertexShader}`.replace(
        '#include <logdepthbuf_vertex>', 'gl_PointSize *= contactScale;\n#include <logdepthbuf_vertex>');
    } else if (kind === 'impact') {
      shader.vertexShader = `attribute vec3 sparkDirection;\nvarying vec2 sparkAxis;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>', `#include <begin_vertex>
        vec2 projectedDirection = (modelViewMatrix * vec4(sparkDirection, 0.0)).xy;
        sparkAxis = length(projectedDirection) > 0.0001 ? normalize(projectedDirection) : vec2(1.0, 0.0);`);
      shader.fragmentShader = `varying vec2 sparkAxis;\n${shader.fragmentShader}`;
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
      ${kind === 'impact' ? `
        // Point coordinates run down the screen, while view space runs up.
        point.y = -point.y;
        point = vec2(dot(point, sparkAxis), dot(point, vec2(-sparkAxis.y, sparkAxis.x)) * 5.0);
      ` : ''}
      float radius = length(point);
      float core = 1.0 - smoothstep(0.0, ${kind === 'corona' ? '0.32' : '0.6'}, radius);
      float halo = exp(-radius * radius * 5.0) * (1.0 - smoothstep(0.7, 1.0, radius)) * 0.42;
      ${kind === 'corona' ? `
        float spokes = pow(abs(cos(atan(point.y, point.x + 0.00001) * 3.0)), 14.0);
        halo += spokes * (1.0 - smoothstep(0.1, 0.85, radius)) * 0.45;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 1.0, 0.85), core);
      ` : ''}
      diffuseColor.a *= max(core, halo);
    `);
  };
  material.customProgramCacheKey = () => `volt-electrical-soft-points-v2-${kind}`;
  return material;
}

/** Five bounded draws: ribbon (core + halo), forks, travelling charges, contacts,
 * and a 24-particle impact pool. No textures, lights, bloom or frame allocations.
 * Camera-facing ribbon expansion happens in the vertex shader, including a
 * small pixel floor so the core survives at gameplay distances on an iGPU. */
export class VoltElectricalEffects {
  readonly root = new THREE.Group();
  private readonly path = new Float32Array(PATH_COMPONENTS * STRANDS);
  private readonly beamGeometry = new THREE.BufferGeometry();
  private readonly beamPositions = dynamicPositions(this.beamGeometry, (SEGMENTS + 1) * 2 * STRANDS);
  private readonly tangents = new Float32Array(this.beamPositions.length);
  private readonly beamMaterial = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    uniforms: {
      tint: { value: new THREE.Color(0xffd329) },
      width: { value: 0.12 },
      strength: { value: 1 },
      phase: { value: 0 },
      viewportHeight: { value: 720 },
    },
    vertexShader: `
      attribute vec3 tangent;
      attribute float strand;
      uniform float width;
      uniform float viewportHeight;
      varying vec2 beamUv;
      varying float filament;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vec2 direction = (modelViewMatrix * vec4(tangent, 0.0)).xy;
        float magnitude = length(direction);
        vec2 normal = magnitude > 0.0001 ? vec2(-direction.y, direction.x) / magnitude : vec2(1.0, 0.0);
        float pixelWidth = max(0.0, -viewPosition.z) * 12.0 / (projectionMatrix[1][1] * viewportHeight);
        float strandWidth = strand < 0.5 ? 1.0 : 0.38;
        viewPosition.xy += normal * uv.y * max(width, pixelWidth) * strandWidth;
        beamUv = uv;
        filament = strand;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float strength;
      uniform float phase;
      varying vec2 beamUv;
      varying float filament;
      void main() {
        float radius = abs(beamUv.y);
        float charge = pow(0.5 + 0.5 * sin(beamUv.x * 19.0 - phase * 2.0), 8.0);
        float core = 1.0 - smoothstep(0.025, 0.09 + charge * 0.055 + fwidth(beamUv.y) * 0.5, radius);
        float halo = exp(-radius * radius * 4.0) * (1.0 - smoothstep(0.65, 1.0, radius));
        float secondary = step(0.5, filament);
        float shimmer = 0.78 + 0.22 * sin(beamUv.x * 87.0 + phase * 5.0 + filament * 7.0);
        float ends = mix(1.0, sin(beamUv.x * 3.14159265), secondary);
        vec3 color = mix(tint, vec3(1.0, 1.0, 0.88), core * mix(1.0, 0.25, secondary));
        float opacity = max(core * shimmer, halo * (0.48 + charge * 0.35));
        gl_FragColor = vec4(color, opacity * strength * ends * mix(1.0, 0.65, secondary));
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
  private readonly branchGeometry = new THREE.BufferGeometry();
  private readonly branchPositions = dynamicPositions(this.branchGeometry, FORKS * FORK_SEGMENTS * 2);
  private readonly branchMaterial = new THREE.LineBasicMaterial({
    color: 0xffcb32, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  private readonly branches = new THREE.LineSegments(this.branchGeometry, this.branchMaterial);
  private readonly travelGeometry = new THREE.BufferGeometry();
  private readonly travelPositions = dynamicPositions(this.travelGeometry, 7);
  private readonly travelMaterial = softPoints(0.11, 0xffffdc);
  private readonly travelling = new THREE.Points(this.travelGeometry, this.travelMaterial);
  private readonly contactGeometry = new THREE.BufferGeometry();
  private readonly contactPositions = dynamicPositions(this.contactGeometry, 2);
  private readonly contactMaterial = softPoints(0.8, 0xffd752, 'corona');
  private readonly contacts = new THREE.Points(this.contactGeometry, this.contactMaterial);
  private readonly impactGeometry = new THREE.BufferGeometry();
  private readonly impactPositions = dynamicPositions(this.impactGeometry, PARTICLES);
  private readonly impactColors = new Float32Array(PARTICLES * 3);
  private readonly impactMaterial = softPoints(0.18, 0xffffff, 'impact');
  private readonly impacts = new THREE.Points(this.impactGeometry, this.impactMaterial);
  private readonly drawingBufferSize = new THREE.Vector2();
  private elapsed = 0;
  private connectedSeconds = 0;
  private wasConnected = false;
  private disposed = false;

  constructor() {
    this.root.name = 'volt-electrical-effects';
    const uv = new Float32Array((SEGMENTS + 1) * 4 * STRANDS);
    const strands = new Float32Array((SEGMENTS + 1) * 2 * STRANDS);
    const indices: number[] = [];
    for (let strand = 0; strand < STRANDS; strand++) {
      for (let node = 0; node <= SEGMENTS; node++) {
        const vertex = (strand * (SEGMENTS + 1) + node) * 2;
        uv.set([node / SEGMENTS, -1, node / SEGMENTS, 1], vertex * 2);
        strands[vertex] = strands[vertex + 1] = strand;
        if (node < SEGMENTS) {
          indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
        }
      }
    }
    this.beamGeometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.beamGeometry.setAttribute('strand', new THREE.BufferAttribute(strands, 1));
    this.beamGeometry.setAttribute('tangent', new THREE.BufferAttribute(this.tangents, 3).setUsage(THREE.DynamicDrawUsage));
    this.beamGeometry.setIndex(indices);
    this.beam.onBeforeRender = renderer => {
      renderer.getDrawingBufferSize(this.drawingBufferSize);
      this.beamMaterial.uniforms.viewportHeight!.value = this.drawingBufferSize.y;
    };
    this.impactGeometry.setAttribute('color', new THREE.BufferAttribute(this.impactColors, 3).setUsage(THREE.DynamicDrawUsage));
    const directions = new Float32Array(PARTICLES * 3);
    for (let particle = 0; particle < PARTICLES; particle++) {
      const angle = particle * 2.399963;
      directions.set([Math.cos(angle), Math.sin(angle * 1.7), Math.sin(angle)], particle * 3);
    }
    this.impactGeometry.setAttribute('sparkDirection', new THREE.BufferAttribute(directions, 3));
    this.contactGeometry.setAttribute('contactScale', new THREE.BufferAttribute(new Float32Array([0.55, 1]), 1));
    this.impactMaterial.vertexColors = true;
    markDecorativeEffect(this.travelGeometry);
    markDecorativeEffect(this.impactGeometry);
    for (const [object, name] of [
      [this.beam, 'volt-electrical-arc-core'],
      [this.branches, 'volt-electrical-branch-arcs'],
      [this.travelling, 'volt-electrical-travelling-sparks'],
      [this.contacts, 'volt-electrical-contact-coronas'],
      [this.impacts, 'volt-electrical-impact-sparks'],
    ] as const) {
      object.name = name;
      object.frustumCulled = false;
      this.root.add(object);
    }
    this.root.visible = false;
    this.impacts.visible = false;
  }

  update(state: VoltElectricalReadModel, deltaSeconds: number): void {
    if (this.disposed) return;
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const connected = state.beamMode === 'connected';
    if (!connected || !this.wasConnected) this.connectedSeconds = 0;
    if (connected) this.connectedSeconds += dt;
    this.wasConnected = connected;
    this.root.visible = state.beamMode !== 'none';
    this.beam.visible = this.root.visible;
    this.branches.visible = this.root.visible;
    this.travelling.visible = this.root.visible;
    this.contacts.visible = this.root.visible;
    if (!this.root.visible) {
      this.elapsed = 0;
      this.impacts.visible = false;
      return;
    }
    this.elapsed += dt;
    const unstable = connected && state.connectionUnstable;
    const phase = this.elapsed * (unstable ? 32 : connected ? 13 : 27);
    const tint = unstable ? 0xff9e25 : 0xffd329;
    this.beamMaterial.uniforms.tint!.value.setHex(tint);
    this.beamMaterial.uniforms.width!.value = connected ? (unstable ? 0.23 : 0.19) : 0.12;
    this.beamMaterial.uniforms.strength!.value = unstable ? 0.76 + Math.sin(phase * 0.7) * 0.2 : connected ? 1 : 0.72;
    this.beamMaterial.uniforms.phase!.value = this.elapsed * (unstable ? 14 : 7);
    this.branchMaterial.color.setHex(tint);
    this.branchMaterial.opacity = unstable ? 0.95 : connected ? 0.8 : 0.5;
    this.contactMaterial.color.setHex(unstable ? 0xffa932 : 0xffd752);
    this.contactMaterial.size = connected ? 0.8 + Math.max(0, 1 - this.connectedSeconds * 4) * 0.4 : 0.32;
    this.contactMaterial.opacity = 0.85 + Math.sin(this.elapsed * 11) * 0.1;

    const { x: sx, y: sy, z: sz } = state.beamStart;
    const dx = state.beamEnd.x - sx, dy = state.beamEnd.y - sy, dz = state.beamEnd.z - sz;
    const length = Math.hypot(dx, dy, dz);
    const horizontal = Math.hypot(dx, dz);
    const px = horizontal > 0.0001 ? -dz / horizontal : 1;
    const pz = horizontal > 0.0001 ? dx / horizontal : 0;
    // Two perpendicular axes keep vertical/steep connections as lively as horizontal ones.
    const qx = length > 0.0001 ? -dy * pz / length : 0;
    const qy = length > 0.0001 ? (dz * px - dx * pz) / length : 1;
    const qz = length > 0.0001 ? dy * px / length : 0;
    const amplitude = Math.min(1, length / 3) * (unstable ? 0.4 : connected ? 0.2 : 0.26);
    for (let strand = 0; strand < STRANDS; strand++) {
      const pathStart = strand * PATH_COMPONENTS;
      for (let node = 0; node <= SEGMENTS; node++) {
        const t = node / SEGMENTS;
        const envelope = node === 0 || node === SEGMENTS ? 0 : Math.sin(Math.PI * t);
        const jitter = envelope * amplitude * arcNoise(node + strand * 37, this.elapsed * (unstable ? 27 : 18));
        const lift = envelope * amplitude * arcNoise(node + 113 + strand * 41, this.elapsed * 16) * 0.6;
        const spread = strand === 0 ? 0 : envelope * (strand === 1 ? 1 : -1) * (unstable ? 0.3 : 0.18);
        const offset = pathStart + node * 3;
        this.path[offset] = sx + dx * t + px * (jitter + spread) + qx * lift;
        this.path[offset + 1] = sy + dy * t + qy * lift;
        this.path[offset + 2] = sz + dz * t + pz * (jitter + spread) + qz * lift;
      }
      for (let node = 0; node <= SEGMENTS; node++) {
        const before = pathStart + Math.max(0, node - 1) * 3, after = pathStart + Math.min(SEGMENTS, node + 1) * 3;
        for (let side = 0; side < 2; side++) {
          for (let axis = 0; axis < 3; axis++) {
            const offset = (strand * (SEGMENTS + 1) * 2 + node * 2 + side) * 3 + axis;
            this.beamPositions[offset] = this.path[pathStart + node * 3 + axis]!;
            this.tangents[offset] = this.path[after + axis]! - this.path[before + axis]!;
          }
        }
      }
    }
    this.beamGeometry.getAttribute('position').needsUpdate = true;
    this.beamGeometry.getAttribute('tangent').needsUpdate = true;

    for (let fork = 0; fork < FORKS; fork++) {
      const origin = (5 + fork * 7) * 3;
      const side = fork % 2 === 0 ? 1 : -1;
      for (let segment = 0; segment < FORK_SEGMENTS; segment++) {
        for (let end = 0; end < 2; end++) {
          const t = (segment + end) / FORK_SEGMENTS;
          const reach = Math.min(1, length) * (unstable ? 0.55 : 0.3);
          const bend = Math.sin(t * Math.PI * 2 + fork + phase) * t * 0.07;
          const offset = ((fork * FORK_SEGMENTS + segment) * 2 + end) * 3;
          this.branchPositions[offset] = this.path[origin]! + dx * t * 0.06 + px * side * (t * reach + bend);
          this.branchPositions[offset + 1] = this.path[origin + 1]! + dy * t * 0.06 + t * Math.sin(phase + fork * 2.1) * reach * 0.5;
          this.branchPositions[offset + 2] = this.path[origin + 2]! + dz * t * 0.06 + pz * side * (t * reach + bend);
        }
      }
    }
    this.branchGeometry.getAttribute('position').needsUpdate = true;
    for (let spark = 0; spark < 7; spark++) {
      const t = (spark / 7 + this.elapsed * (unstable ? 1.8 : 0.95)) % 1;
      const node = t * SEGMENTS, base = Math.floor(node), fraction = node - base;
      for (let axis = 0; axis < 3; axis++) {
        const a = this.path[base * 3 + axis]!, b = this.path[(base + 1) * 3 + axis]!;
        this.travelPositions[spark * 3 + axis] = a + (b - a) * fraction;
      }
    }
    this.travelGeometry.getAttribute('position').needsUpdate = true;
    for (let axis = 0; axis < 3; axis++) {
      this.contactPositions[axis] = this.path[axis]!;
      this.contactPositions[axis + 3] = this.path[SEGMENTS * 3 + axis]!;
    }
    this.contactGeometry.getAttribute('position').needsUpdate = true;

    // Analytic particle ages avoid spawn allocations and frame-rate-dependent
    // emission. Prefixes stay spread out for the minimum profile's thinning.
    this.impacts.visible = connected;
    if (connected) {
      for (let particle = 0; particle < PARTICLES; particle++) {
        const age = (this.connectedSeconds * (unstable ? 2.8 : 2.1) + particle * 0.618033989) % 1;
        const angle = particle * 2.399963;
        const radius = age * (unstable ? 0.85 : 0.6);
        const brightness = (1 - age) * (1 - age) * Math.min(1, age * 12);
        const offset = particle * 3;
        this.impactPositions[offset] = state.beamEnd.x + Math.cos(angle) * radius;
        this.impactPositions[offset + 1] = state.beamEnd.y + Math.sin(angle * 1.7) * radius + age * 0.22 - age * age * 0.4;
        this.impactPositions[offset + 2] = state.beamEnd.z + Math.sin(angle) * radius;
        this.impactColors[offset] = brightness;
        this.impactColors[offset + 1] = brightness * (unstable ? 0.42 : 0.8);
        this.impactColors[offset + 2] = brightness * 0.18;
      }
      this.impactGeometry.getAttribute('position').needsUpdate = true;
      this.impactGeometry.getAttribute('color').needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const object of [this.beam, this.branches, this.travelling, this.contacts, this.impacts]) {
      object.geometry.dispose();
      object.material.dispose();
    }
  }
}
