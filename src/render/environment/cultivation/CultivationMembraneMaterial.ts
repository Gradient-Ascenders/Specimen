import type { CultivationAssetSource } from './CultivationBakedAssets.ts';
import * as THREE from 'three';

export function createCultivationMembraneTextures(assets: CultivationAssetSource) {
  const { albedo, roughness, normal } = assets.textures('membrane');
  return { albedo, roughness, normal };
}

export function createCultivationMembraneMaterial(maps: ReturnType<typeof createCultivationMembraneTextures>) {
  const material = new THREE.MeshStandardMaterial({ name: 'cultivation-aged-adhesive-membrane',
    color: 0xffffff, map: maps.albedo, normalMap: maps.normal, normalScale: new THREE.Vector2(.32, .32),
    roughness: .82, roughnessMap: maps.roughness, metalness: 0,
    emissive: 0x398c70, emissiveIntensity: .14, emissiveMap: maps.albedo });
  configureCultivationMembraneMaterial(material);
  return material;
}

export function createCultivationBiofilmTextures(assets:CultivationAssetSource) {
  const {albedo,roughness,normal}=assets.textures('membrane-biofilm');
  return {albedo,roughness,normal};
}

/** Opaque cultured growth. Only its surface response changes; contact geometry
 * and the original membrane emission/shadow policy remain authoritative. */
export function createCultivationBiofilmMaterial(maps:ReturnType<typeof createCultivationBiofilmTextures>) {
  const material=new THREE.MeshStandardMaterial({name:'cultivation-cultured-adhesive-biofilm',
    color:0xffffff,map:maps.albedo,normalMap:maps.normal,normalScale:new THREE.Vector2(.62,.62),
    roughness:.80,roughnessMap:maps.roughness,metalness:0,
    emissive:0x398c70,emissiveIntensity:.14,emissiveMap:maps.albedo});
  material.userData.cultivationMembrane=true;material.userData.cultivationBiofilm=true;
  material.userData.tileSizeMetres=[4,4];
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec4 membranePanel; varying vec4 vMembranePanel; varying vec2 vBiofilmMetric;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvMembranePanel=membranePanel;vBiofilmMetric=uv*4.0;');
    shader.fragmentShader='varying vec4 vMembranePanel; varying vec2 vBiofilmMetric;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float filmEdge=min(min(vMembranePanel.x,vMembranePanel.z-vMembranePanel.x),
        min(vMembranePanel.y,vMembranePanel.w-vMembranePanel.y));
      float filmRipple=0.5+0.5*sin(vBiofilmMetric.x*19.0+sin(vBiofilmMetric.y*13.0)*1.8);
      float filmCrust=1.0-smoothstep(0.09+filmRipple*0.025,0.26+filmRipple*0.04,filmEdge);
      float filmSeam=1.0-smoothstep(0.008,0.032+filmRipple*0.012,filmEdge);
      float filmLip=smoothstep(0.025,0.055,filmEdge)*(1.0-smoothstep(0.09,0.16,filmEdge));
      diffuseColor.rgb*=mix(vec3(1.0),vec3(0.70,0.72,0.51),filmCrust*0.72);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.22+vec3(0.012,0.015,0.007),filmLip*0.55);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.024,0.033,0.022),filmSeam*0.72);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.94,filmCrust);');
  };
  material.customProgramCacheKey=()=> 'cultivation-cultured-biofilm-v1';
  return material;
}

/** Reapply to material clones before composing the finite-light optimization. */
export function configureCultivationMembraneMaterial(material: THREE.MeshStandardMaterial): void {
  material.userData.cultivationMembrane = true;
  material.userData.tileSizeMetres = [8, 8];
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec4 membranePanel; varying vec4 vMembranePanel;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMembranePanel = membranePanel;');
    shader.fragmentShader = 'varying vec4 vMembranePanel;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float membraneEdge = min(min(vMembranePanel.x, vMembranePanel.z-vMembranePanel.x),
        min(vMembranePanel.y, vMembranePanel.w-vMembranePanel.y));
      float membraneRim = 1.0-smoothstep(0.075,0.095,membraneEdge);
      float membraneCrust = (1.0-smoothstep(0.15,0.32,membraneEdge))*(0.4+0.6*diffuseColor.g);
      diffuseColor.rgb *= mix(vec3(1.0),vec3(0.62,0.67,0.49),membraneCrust*0.65);
      float membraneLip = smoothstep(0.095,0.11,membraneEdge)*(1.0-smoothstep(0.13,0.15,membraneEdge));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.24,0.49,0.37),membraneLip*0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.022,0.04,0.035),membraneRim*0.92);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor,0.87,membraneCrust);');
  };
  material.customProgramCacheKey = () => 'cultivation-aged-membrane-rim-v2';
}

/** Per-face metre coordinates survive static batching and the authored wall drops. */
export function mapCultivationMembranePanel(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!, size = bounds.getSize(new THREE.Vector3());
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const panel = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - bounds.min.x, y = positions.getY(i) - bounds.min.y, z = positions.getZ(i) - bounds.min.z;
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
    panel.set(nx > .5 ? [z, y, size.z, size.y] : ny > .5 ? [x, z, size.x, size.z] : [x, y, size.x, size.y], i * 4);
  }
  geometry.setAttribute('membranePanel', new THREE.BufferAttribute(panel, 4));
}
