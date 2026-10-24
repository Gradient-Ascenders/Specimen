import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Low-density beam shells masked by their own spotlight's shadow depth.
 * Clear portions continue to the room surfaces; blockers cast real holes in
 * the volume rather than shortening the entire cone to a flat midair cap. */
export class ShadowedDroneBeam {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(light: THREE.SpotLight, range: number, angle: number,
    options:{readonly colour?:THREE.ColorRepresentation;readonly opacity?:number;readonly soft?:boolean}={}) {
    const shells = [.45, .72, 1].map(scale => {
      const geometry = new THREE.ConeGeometry(Math.tan(angle) * range * scale, range, 48, 1, true);
      geometry.translate(0, -range / 2, 0);
      return geometry;
    });
    const geometry = mergeGeometries(shells)!;
    shells.forEach(shell => shell.dispose());
    // The GPU validates active samplers even when beamShadowReady discards
    // fragments. Hidden transit beams also participate in loading preparation.
    const fallbackDepth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    fallbackDepth.compareFunction = THREE.LessEqualCompare;
    fallbackDepth.minFilter = fallbackDepth.magFilter = THREE.LinearFilter;
    fallbackDepth.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false,
      defines: { SHADOW_COMPARE: 1 },
      uniforms: {
        beamShadow: { value: fallbackDepth }, beamShadowMatrix: { value: light.shadow.matrix },
        beamShadowReady: { value: false }, beamRange: { value: range },
        beamColor: { value: new THREE.Color(options.colour??0xff1830) },
        beamOpacity:{value:options.opacity??.022},beamSoft:{value:options.soft??false},
        beamTangent:{value:Math.tan(angle)},
      },
      vertexShader: `
        out vec3 beamWorld;
        out float beamDistance;
        out vec3 beamLocal;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          beamWorld = world.xyz;
          beamDistance = -position.y;
          beamLocal=position;
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
        uniform float beamOpacity;
        uniform bool beamSoft;
        uniform float beamTangent;
        in vec3 beamWorld;
        in float beamDistance;
        in vec3 beamLocal;
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
          float alpha = beamOpacity * fade * visible;
          if(beamSoft){
            float radial=length(beamLocal.xz)/max(0.001,beamDistance*beamTangent);
            float edge=1.0-smoothstep(0.35,1.05,radial);
            float grain=fract(sin(dot(floor(beamWorld*18.0),vec3(12.9898,78.233,37.719)))*43758.5453);
            alpha*=mix(0.22,1.0,edge)*mix(0.88,1.0,grain)*smoothstep(0.0,0.5,beamDistance);
          }
          if (alpha < 0.001) discard;
          beamOutput = vec4(beamColor, alpha);
        }`,
    });
    material.addEventListener('dispose', () => fallbackDepth.dispose());
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.onBeforeRender = renderer => {
      const compare = renderer.shadowMap.type === THREE.PCFShadowMap;
      if (Boolean(material.defines.SHADOW_COMPARE) !== compare) {
        material.defines = compare ? {SHADOW_COMPARE:1} : {};
        material.needsUpdate = true;
      }
      const comparison = compare ? THREE.LessEqualCompare : null;
      if (fallbackDepth.compareFunction !== comparison) {
        fallbackDepth.compareFunction = comparison;
        fallbackDepth.needsUpdate = true;
      }
      material.uniforms.beamShadow.value = light.shadow.map?.depthTexture ?? fallbackDepth;
      material.uniforms.beamShadowReady.value = Boolean(light.shadow.map?.depthTexture);
    };
  }
}
