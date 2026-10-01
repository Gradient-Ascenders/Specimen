import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Low-density beam shells masked by their own spotlight's shadow depth.
 * Clear portions continue to the room surfaces; blockers cast real holes in
 * the volume rather than shortening the entire cone to a flat midair cap. */
export class ShadowedDroneBeam {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(light: THREE.SpotLight, range: number, angle: number) {
    const shells = [.45, .72, 1].map(scale => {
      const geometry = new THREE.ConeGeometry(Math.tan(angle) * range * scale, range, 48, 1, true);
      geometry.translate(0, -range / 2, 0);
      return geometry;
    });
    const geometry = mergeGeometries(shells)!;
    shells.forEach(shell => shell.dispose());
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false,
      defines: { SHADOW_COMPARE: 1 },
      uniforms: {
        beamShadow: { value: null }, beamShadowMatrix: { value: light.shadow.matrix },
        beamShadowReady: { value: false }, beamRange: { value: range },
        beamColor: { value: new THREE.Color(0xff1830) },
      },
      vertexShader: `
        out vec3 beamWorld;
        out float beamDistance;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          beamWorld = world.xyz;
          beamDistance = -position.y;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        #ifdef SHADOW_COMPARE
          uniform highp sampler2DShadow beamShadow;
        #else
          uniform sampler2D beamShadow;
        #endif
        uniform mat4 beamShadowMatrix;
        uniform bool beamShadowReady;
        uniform float beamRange;
        uniform vec3 beamColor;
        in vec3 beamWorld;
        in float beamDistance;
        out vec4 beamOutput;
        void main() {
          if (!beamShadowReady) discard;
          vec4 projected = beamShadowMatrix * vec4(beamWorld, 1.0);
          vec3 uv = projected.xyz / projected.w;
          if (any(lessThan(uv, vec3(0.0))) || any(greaterThan(uv, vec3(1.0)))) discard;
          #ifdef SHADOW_COMPARE
            float visible = texture(beamShadow, vec3(uv.xy, uv.z - 0.00005));
          #else
            float visible = step(uv.z - 0.00005, texture(beamShadow, uv.xy).r);
          #endif
          float fade = 1.0 - smoothstep(beamRange * 0.65, beamRange, beamDistance);
          float alpha = 0.022 * fade * visible;
          if (alpha < 0.001) discard;
          beamOutput = vec4(beamColor, alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.onBeforeRender = renderer => {
      const compare = renderer.shadowMap.type === THREE.PCFShadowMap;
      if (Boolean(material.defines.SHADOW_COMPARE) !== compare) {
        material.defines = compare ? {SHADOW_COMPARE:1} : {};
        material.needsUpdate = true;
      }
      material.uniforms.beamShadow.value = light.shadow.map?.depthTexture ?? null;
      material.uniforms.beamShadowReady.value = Boolean(light.shadow.map?.depthTexture);
    };
  }
}
