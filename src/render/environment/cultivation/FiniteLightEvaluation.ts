import * as THREE from 'three';

const DIRECT_LIGHT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
// Only shadow samplers require constant indices. Keep ordinary point lights
// in one loop instead of duplicating the entire BRDF for every padded slot.
// Shadowed points stay first, preserving Three's accumulation order.
const pointLoopStart = '\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {';
const pointLoopEnd = '\t#pragma unroll_loop_end';
const pointStart = THREE.ShaderChunk.lights_fragment_begin.indexOf(pointLoopStart);
const pointEndMarker = THREE.ShaderChunk.lights_fragment_begin.indexOf(pointLoopEnd, pointStart);
const pointEnd = pointEndMarker + pointLoopEnd.length;
const shadowedPoints = THREE.ShaderChunk.lights_fragment_begin.slice(pointStart, pointEnd)
  .replace('i < NUM_POINT_LIGHTS', 'i < NUM_POINT_LIGHT_SHADOWS');
const ordinaryPoints = `
  for ( int pointIndex = NUM_POINT_LIGHT_SHADOWS; pointIndex < NUM_POINT_LIGHTS; pointIndex ++ ) {
    pointLight = pointLights[ pointIndex ];
    getPointLightInfo( pointLight, geometryPosition, directLight );
    ${DIRECT_LIGHT_CALL}
  }
`;
// A Three upgrade must fall back to its valid loop rather than splice at -1.
const compactLightingChunk = pointStart >= 0 && pointEndMarker > pointStart
  ? THREE.ShaderChunk.lights_fragment_begin.slice(0, pointStart)
    + shadowedPoints + ordinaryPoints + THREE.ShaderChunk.lights_fragment_begin.slice(pointEnd)
  : THREE.ShaderChunk.lights_fragment_begin;
// Samplers must still use constant indices, but the much larger physical BRDF
// does not. Gather the original shadow/map-adjusted light contributions first,
// then accumulate them in the original order with one shared BRDF loop.
const spotLoopStart = '\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {';
const spotStart = compactLightingChunk.indexOf(spotLoopStart);
const spotEndMarker = compactLightingChunk.indexOf(pointLoopEnd, spotStart);
const spotEnd = spotEndMarker + pointLoopEnd.length;
const spotLoop = compactLightingChunk.slice(spotStart, spotEnd);
const compactSpots = spotStart >= 0 && spotEndMarker > spotStart && spotLoop.includes(DIRECT_LIGHT_CALL)
  ? compactLightingChunk.slice(0, spotStart)
    + 'IncidentLight spotContributions[ NUM_SPOT_LIGHTS ];\n'
    + spotLoop.replace(DIRECT_LIGHT_CALL, 'spotContributions[ i ] = directLight;')
    + `
    for ( int spotIndex = 0; spotIndex < NUM_SPOT_LIGHTS; spotIndex ++ ) {
      directLight = spotContributions[ spotIndex ];
      ${DIRECT_LIGHT_CALL}
    }
    ` + compactLightingChunk.slice(spotEnd)
  : compactLightingChunk;
// Zero-radiance padding and powered-down lamps need no direction, distance
// or cone evaluation. Keep IncidentLight fully initialized for the shadow
// and shared BRDF loops that follow, retaining all nonzero light math.
function skipZeroRadiance(chunk: string): string {
  if (chunk.includes('// specimen-zero-radiance-v2')) return chunk;
  for (const [kind, variable] of [['Point', 'pointLight'], ['Spot', 'spotLight']]) {
    const call = `get${kind}LightInfo( ${variable}, geometryPosition, directLight );`;
    chunk = chunk.replaceAll(call, `if ( any( notEqual( ${variable}.color, vec3( 0.0 ) ) ) ) {
      ${call}
    } else {
      directLight.color = vec3( 0.0 );
      directLight.direction = vec3( 0.0 );
      directLight.visible = false;
    }`);
  }
  // Three marks directional lights visible even when their radiance is zero.
  // The existing visibility guards then skip both shadow sampling and BRDF
  // work for dark cinematic lights, retaining the original nonzero math.
  const directional = 'getDirectionalLightInfo( directionalLight, directLight );';
  chunk = chunk.replaceAll(directional, `${directional}
    directLight.visible = any( notEqual( directionalLight.color, vec3( 0.0 ) ) );`);
  return '// specimen-zero-radiance-v2\n' + chunk;
}
const finiteLightingChunk = compactSpots.replaceAll(
  DIRECT_LIGHT_CALL, `if ( directLight.visible ) { ${DIRECT_LIGHT_CALL} }`,
);
// Bob's transmissive physical shader is already substantially more complex.
// Keeping its original spot loop avoids a slower driver first draw for that
// variant; the shared loop benefits the room's ordinary standard materials.
const physicalLightingChunk = compactLightingChunk.replaceAll(
  DIRECT_LIGHT_CALL, `if ( directLight.visible ) { ${DIRECT_LIGHT_CALL} }`,
);
const optimized = new WeakSet<THREE.Material>();

/** Skip BRDF work only when Three's own attenuation/cone test says contribution is zero. */
export function optimizeFiniteLightEvaluation(material: THREE.Material, skipPaddingMath = false): void {
  if (optimized.has(material)) return;
  optimized.add(material);
  const priorCompile = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey();
  // Preserve an inherited padding hook when preparing a material clone.
  const earlyZero = skipPaddingMath || priorKey.includes(':finite-light-branch-v5');
  const suffix = earlyZero ? ':finite-light-branch-v5' : ':finite-light-branch-v3';
  const first = priorKey.indexOf(suffix);
  // Clones may borrow an already composed hook. Keep its original key order
  // and remove only redundant markers, including around later custom hooks.
  const cacheKey = first < 0 ? priorKey + suffix
    : priorKey.slice(0, first + suffix.length) + priorKey.slice(first + suffix.length).replaceAll(suffix, '');
  const lightingChunk = material instanceof THREE.MeshPhysicalMaterial ? physicalLightingChunk : finiteLightingChunk;
  material.onBeforeCompile = function(shader, renderer) {
    priorCompile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lightingChunk);
    if (earlyZero) shader.fragmentShader = skipZeroRadiance(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => cacheKey;
  material.needsUpdate = true;
}
