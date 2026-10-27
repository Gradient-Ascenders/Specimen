import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Low-density beam shells masked by their own spotlight's shadow depth.
 * Clear portions continue to the room surfaces; blockers cast real holes in
 * the volume rather than shortening the entire cone to a flat midair cap. */
export class ShadowedDroneBeam {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly configureSampler: (type: THREE.ShadowMapType, active?: boolean) => void;

  constructor(light: THREE.SpotLight, range: number, angle: number,
    options:{readonly colour?:THREE.ColorRepresentation;readonly opacity?:number;readonly soft?:boolean;
      readonly occlusionFallback?:boolean}={}) {
    // Scanners retain their original 24-edge CPU clipping budget when a
    // searchlight is outside the selected live-shadow slots.
    const shells = (options.occlusionFallback ? [1] : [.45, .72, 1]).map(scale => {
      const geometry = new THREE.ConeGeometry(Math.tan(angle) * range * scale, range, options.occlusionFallback ? 24 : 48, 1, true);
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
      forceSinglePass: true,
      toneMapped: false,
      defines: { SHADOW_COMPARE: 1 },
      uniforms: {
        beamShadow: { value: fallbackDepth }, beamShadowMatrix: { value: light.shadow.matrix },
        beamShadowReady: { value: false }, beamRange: { value: range },
        beamColor: { value: new THREE.Color(options.colour??0xff1830) },
        beamOpacity:{value:options.opacity??.022},beamSoft:{value:options.soft??false},
        beamTangent:{value:Math.tan(angle)},
        beamOcclusionFallback:{value:options.occlusionFallback??false},
      },
      vertexShader: `
        out vec3 beamWorld;
        out float beamDistance;
        out vec3 beamLocal;
        out vec3 beamNormal;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          beamWorld = world.xyz;
          beamDistance = -position.y;
          beamLocal=position;
          beamNormal=normalize(mat3(modelMatrix)*normal);
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
        uniform bool beamOcclusionFallback;
        in vec3 beamWorld;
        in float beamDistance;
        in vec3 beamLocal;
        in vec3 beamNormal;
        out vec4 beamOutput;
        float beamVisibility(vec3 p){
          #ifdef SHADOW_COMPARE
            return texture(beamShadow,vec3(p.xy,p.z-0.00005));
          #else
            return step(p.z-0.00005,texture(beamShadow,p.xy).r);
          #endif
        }
        void main() {
          if (!beamShadowReady&&!beamOcclusionFallback) discard;
          float visible=1.0;
          if(beamShadowReady){
            vec4 projected=beamShadowMatrix*vec4(beamWorld,1.0);
            vec3 uv=projected.xyz/projected.w;
            if(any(lessThan(uv,vec3(0.0)))||any(greaterThan(uv,vec3(1.0))))discard;
            if(beamSoft){
              vec2 texel=0.75/vec2(textureSize(beamShadow,0));
              visible=.25*(beamVisibility(uv+vec3(texel,0.0))+beamVisibility(uv-vec3(texel,0.0))+
                beamVisibility(uv+vec3(texel.x,-texel.y,0.0))+beamVisibility(uv+vec3(-texel.x,texel.y,0.0)));
            }else visible=beamVisibility(uv);
          }
          float fade = 1.0 - smoothstep(beamRange * 0.65, beamRange, beamDistance);
          float alpha = beamOpacity * fade * visible;
          if(beamSoft){
            float radial=length(beamLocal.xz)/max(0.001,beamDistance*beamTangent);
            float edge=1.0-smoothstep(0.35,1.05,radial);
            float grain=fract(sin(dot(floor(beamWorld*18.0),vec3(12.9898,78.233,37.719)))*43758.5453);
            alpha*=mix(0.22,1.0,edge)*mix(0.88,1.0,grain)*smoothstep(0.0,0.5,beamDistance);
            if(beamOcclusionFallback){
              float silhouette=smoothstep(.02,.55,abs(dot(normalize(beamNormal),normalize(cameraPosition-beamWorld))));
              alpha*=silhouette*3.0;
            }
          }
          if (alpha < 0.001) discard;
          beamOutput = vec4(beamColor, alpha);
        }`,
    });
    material.addEventListener('dispose', () => fallbackDepth.dispose());
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.configureSampler = (type, active = true) => {
      const compare = type === THREE.PCFShadowMap;
      if (Boolean(material.defines.SHADOW_COMPARE) !== compare) {
        material.defines = compare ? {SHADOW_COMPARE:1} : {};
        material.needsUpdate = true;
      }
      const comparison = compare ? THREE.LessEqualCompare : null;
      if (fallbackDepth.compareFunction !== comparison) {
        // Three r185 does not reset TEXTURE_COMPARE_MODE when this becomes
        // null. Recreate the tiny GPU allocation before changing sampler type.
        fallbackDepth.dispose();
        fallbackDepth.compareFunction = comparison;
        fallbackDepth.needsUpdate = true;
      }
      const depth = light.shadow.map?.depthTexture;
      const ready = active && !!depth && depth.compareFunction === comparison;
      material.uniforms.beamShadow.value = ready ? depth : fallbackDepth;
      material.uniforms.beamShadowReady.value = ready;
    };
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      this.configureSampler(renderer.shadowMap.type, light.intensity > 0 && light.layers.test(camera.layers));
    };
  }

  /** Preparation clones share uniforms but do not run this mesh's draw hook. */
  setShadowType(type: THREE.ShadowMapType): void { this.configureSampler(type); }
}
