import * as THREE from 'three';

/** Level-owned maps. Clear references so repeated teardown cannot free them twice. */
export function disposeShadowLight(light: THREE.Light): void {
  light.dispose();
  if (light instanceof THREE.SpotLight || light instanceof THREE.PointLight || light instanceof THREE.DirectionalLight) {
    light.shadow.map = null;
    light.shadow.mapPass = null;
  }
}
