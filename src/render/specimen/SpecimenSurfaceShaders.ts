import * as THREE from 'three';

export interface SpecimenSurfaceUniforms {
  time: THREE.IUniform<number>;
  charge: THREE.IUniform<number>;
}

type Region = 'shell' | 'flow' | 'core' | 'eye' | 'electric';

// The rest position keeps the tissue attached to the authored morphs. Nine
// neighbouring cells give an organic membrane without textures or extra draws.
const TISSUE = /* glsl */`
  varying vec3 vSpecimenRest;
  uniform float uSpecimenTime;
  uniform float uSpecimenCharge;
  vec2 specimenHash(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  vec3 specimenTissue(vec2 p) {
    vec2 tile = floor(p), local = fract(p);
    float nearest = 8.0, second = 8.0, identity = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 seed = specimenHash(tile + offset);
        float distanceToCell = length(offset + 0.2 + seed * 0.6 - local);
        if (distanceToCell < nearest) {
          second = nearest; nearest = distanceToCell; identity = seed.x;
        } else second = min(second, distanceToCell);
      }
    }
    return vec3(nearest, second - nearest, identity);
  }
  vec2 specimenTissueUV(vec3 p) {
    return vec2(atan(p.z, p.x) * 0.56, p.y);
  }
`;

/** UVs live on the existing lenses, so pupils follow blinking/focus morphs. */
export function prepareSpecimenEyeCoordinates(mesh: THREE.Mesh<THREE.BufferGeometry>): void {
  const positions = mesh.geometry.getAttribute('position');
  const centre = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute).getCenter(new THREE.Vector3());
  const side = Math.sign(centre.x);
  const coordinates = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - centre.x, y = positions.getY(i) - centre.y;
    coordinates[i * 3] = (x * 0.85 + side * y * 0.52) / 0.038;
    coordinates[i * 3 + 1] = (-side * x * 0.52 + y * 0.85) / 0.062;
    coordinates[i * 3 + 2] = 1 - THREE.MathUtils.smoothstep(positions.getZ(i), centre.z - 0.035, centre.z + 0.035);
  }
  mesh.geometry.setAttribute('specimenEye', new THREE.BufferAttribute(coordinates, 3));
}

export function configureSpecimenSurface(
  material: THREE.MeshPhysicalMaterial,
  region: Region,
  uniforms: SpecimenSurfaceUniforms,
): void {
  material.customProgramCacheKey = () => `specimen-living-fusion-v2-${region}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uSpecimenTime = uniforms.time;
    shader.uniforms.uSpecimenCharge = uniforms.charge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSpecimenRest;${region === 'eye' ? '\nattribute vec3 specimenEye; varying vec3 vSpecimenEye;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSpecimenRest = position;${region === 'eye' ? '\nvSpecimenEye = specimenEye;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      `#include <common>\n${TISSUE}${region === 'eye' ? '\nvarying vec3 vSpecimenEye;' : ''}`);

    if (region === 'shell') {
      // Surface roughness still controls the wet highlights. Bound only the
      // refraction mip level so the heart, currents and veins retain detail.
      shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_pars_fragment>',
        THREE.ShaderChunk.transmission_pars_fragment.replace(
          'return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );',
          'return textureBicubic( transmissionSamplerMap, fragCoord.xy, min(lod, 0.25) );'));
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 specimenCells = specimenTissue(specimenTissueUV(vSpecimenRest) * 28.0);
        float specimenMembrane = 1.0 - smoothstep(0.012, 0.07, specimenCells.y);
        float specimenAccent = smoothstep(0.5, 0.92, diffuseColor.r) * smoothstep(0.48, 0.75, diffuseColor.g);
        float specimenCellBody = 0.5 + 0.5 * cos(specimenCells.x * 4.0);
        vec3 specimenJade = mix(vec3(0.002, 0.018, 0.022), vec3(0.004, 0.12, 0.085), specimenCellBody);
        diffuseColor.rgb *= mix(0.7, 1.0, specimenCellBody);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + specimenMembrane * 0.025, 0.08, 0.22);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        normal = normalize(normal - vec3(dFdx(specimenCellBody), dFdy(specimenCellBody), 0.0) * 0.03);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float specimenRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 5.0);
        totalEmissiveRadiance += specimenJade * (0.6 + 0.3 * uSpecimenCharge);
        totalEmissiveRadiance += vec3(0.02, 0.7, 0.65) * specimenRim * 0.85;
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.015) * specimenAccent * (0.8 + specimenRim * 2.0) * (1.0 + uSpecimenCharge);`);
      // Keep the skin's diffuse jade separate from the clearer transmitted
      // light, so the tissue remains dark while gold and the heart stay bright.
      shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', `
        vec3 specimenSkinColor = diffuseColor.rgb;
        diffuseColor.rgb = mix(vec3(0.78, 0.98, 0.9), specimenSkinColor, 0.48);
        ${THREE.ShaderChunk.transmission_fragment}
        diffuseColor.rgb = specimenSkinColor;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        #ifndef USE_TRANSMISSION
          float gelReflection = max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b);
          float gelCoverage = min(0.95, mix(0.28, 0.82, specimenRim) + gelReflection);
          outgoingLight = max(outgoingLight - totalDiffuse, vec3(0.0)) / gelCoverage + totalDiffuse;
          diffuseColor.a *= gelCoverage;
        #endif
        #include <opaque_fragment>`);
    } else if (region === 'flow') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float flowEdge = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 1.5);
        float flowBands = 0.5 + 0.5 * sin(vSpecimenRest.y * 22.0 + vSpecimenRest.x * 9.0 - uSpecimenTime * 0.5);
        totalEmissiveRadiance *= 0.28 + flowEdge * 1.8 + flowBands * 0.12;`);
    } else if (region === 'core') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        vec3 coreP = vSpecimenRest - vec3(0.15, 0.12, -0.17);
        vec3 coreCells = specimenTissue(vec2(atan(coreP.z, coreP.x) * 1.8, coreP.y * 12.0));
        float coreSwirl = 0.5 + 0.5 * sin(atan(coreP.z, coreP.x) * 4.0 + length(coreP.xz) * 32.0 + coreP.y * 17.0 - uSpecimenTime * 0.7);
        totalEmissiveRadiance *= mix(0.22, 1.25, smoothstep(0.15, 0.9, coreSwirl * 0.65 + coreCells.z * 0.35));`);
    } else if (region === 'eye') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float pupilDistance = length(vSpecimenEye.xy);
        float pupil = 1.0 - smoothstep(0.7, 1.0, pupilDistance);
        float pupilHalo = exp(-pupilDistance * 1.8) * 0.22;
        totalEmissiveRadiance += vec3(0.003, 1.0, 0.92) * (pupil * 5.0 + pupilHalo) * vSpecimenEye.z;`);
    } else {
      shader.vertexShader = shader.vertexShader.replace('#include <morphtarget_vertex>',
        '#include <morphtarget_vertex>\ntransformed += normalize(objectNormal) * 0.0015;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float currentPulse = 0.88 + 0.12 * sin(vSpecimenRest.y * 11.0 - uSpecimenTime * 2.0);
        totalEmissiveRadiance *= currentPulse;`);
    }
  };
}
