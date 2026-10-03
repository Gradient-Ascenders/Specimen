import * as THREE from 'three';

/** Keep comparison samplers valid, then skip the maps of unpowered sources. */
export function setShadowMapUpdatesActive(light: THREE.SpotLight | THREE.PointLight, active: boolean): void {
  light.shadow.autoUpdate = active;
  light.shadow.needsUpdate = active || light.shadow.map === null;
}

/** Level-owned maps. Clear references so repeated teardown cannot free them twice. */
export function disposeShadowLight(light: THREE.Light): void {
  light.dispose();
  if (light instanceof THREE.SpotLight || light instanceof THREE.PointLight || light instanceof THREE.DirectionalLight) {
    light.shadow.map = null;
    light.shadow.mapPass = null;
  }
}
