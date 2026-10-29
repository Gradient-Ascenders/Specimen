import * as THREE from 'three';
import { disposeShadowLight } from '../render/ShadowLightResources.ts';
import { FINAL_ARENA } from './FinalBossConfig.ts';

/** One open, tapered shell suggests airborne haze without ray marching,
 * screen-sized buffers, particles or another shadow pass. */
export class ExterminationMoonlight {
  readonly root = new THREE.Group();
  readonly light: THREE.SpotLight;
  readonly shaft: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly strength = { value: 0 };
  private disposed = false;
  private shaftEnabled = true;

  constructor() {
    this.root.name = 'extermination-roof-moonlight';
    const source = new THREE.Vector3(-8, FINAL_ARENA.ceilingY - 1.2, FINAL_ARENA.centreZ - 7);
    const landing = new THREE.Vector3(14, FINAL_ARENA.floorY, FINAL_ARENA.centreZ - 82);
    const axis = source.clone().sub(landing), length = axis.length();
    this.light = new THREE.SpotLight(0xadcaff, 0, length * 2, Math.atan2(24, length), .55, 2);
    this.light.name = 'extermination-moonlight-spill'; this.light.position.copy(source);
    this.light.target.position.copy(landing); this.light.castShadow = false;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { moonStrength: this.strength, moonColor: { value: new THREE.Color(0xb6d2ff) } },
      vertexShader: `varying vec2 moonUv; varying vec3 moonNormal,moonView;
        void main(){vec4 view=modelViewMatrix*vec4(position,1.);
          moonUv=uv;moonNormal=normalMatrix*normal;moonView=-view.xyz;
          gl_Position=projectionMatrix*view;}`,
      fragmentShader: `uniform float moonStrength; uniform vec3 moonColor;
        varying vec2 moonUv; varying vec3 moonNormal,moonView;
        void main(){
          float edge=pow(abs(dot(normalize(moonNormal),normalize(moonView))),.75);
          float ends=smoothstep(0.,.09,moonUv.y)*(1.-smoothstep(.97,1.,moonUv.y));
          float haze=.9+.1*sin(moonUv.y*24.+sin(moonUv.x*6.283185)*2.);
          float alpha=moonStrength*.1*edge*ends*haze;
          if(alpha<.001)discard;
          gl_FragColor=vec4(moonColor,alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 24, length, 48, 1, true), material);
    this.shaft.name = 'extermination-moonlight-shaft';
    this.shaft.position.copy(source).add(landing).multiplyScalar(.5);
    this.shaft.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, axis.normalize());
    this.shaft.castShadow = this.shaft.receiveShadow = false;
    this.shaft.renderOrder = -2; // Threat markings draw above the restrained blue haze.
    this.shaft.visible = false;
    this.root.add(this.light, this.light.target, this.shaft);
  }

  setStrength(value: number): void {
    if (this.disposed) return;
    this.strength.value = THREE.MathUtils.clamp(value, 0, 1);
    this.light.intensity = this.strength.value * 45000;
    this.shaft.visible = this.shaftEnabled && this.strength.value > .001;
  }

  /** Medium combat retains the actual spill light without the cosmetic haze. */
  setShaftEnabled(enabled: boolean): void {
    this.shaftEnabled = enabled;
    this.shaft.visible = !this.disposed && enabled && this.strength.value > .001;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeShadowLight(this.light);
    this.shaft.geometry.dispose(); this.shaft.material.dispose();
    this.root.removeFromParent(); this.root.clear();
  }
}
