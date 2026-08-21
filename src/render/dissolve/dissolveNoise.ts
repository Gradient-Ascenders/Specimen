/**
 * Texture-free value noise shared verbatim by the visible and shadow passes.
 *
 * The input is target-local position plus an authored, deterministic offset.
 * Keeping this function free of time makes the removed fragments stable while
 * gameplay is interrupted and after any repeated progress/reset cycle.
 */
export const dissolveNoiseGlsl = /* glsl */ `
float dissolveHash(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33);
  return fract((point.x + point.y) * point.z);
}

float dissolveValueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  vec3 blend = local * local * (3.0 - 2.0 * local);

  float n000 = dissolveHash(cell + vec3(0.0, 0.0, 0.0));
  float n100 = dissolveHash(cell + vec3(1.0, 0.0, 0.0));
  float n010 = dissolveHash(cell + vec3(0.0, 1.0, 0.0));
  float n110 = dissolveHash(cell + vec3(1.0, 1.0, 0.0));
  float n001 = dissolveHash(cell + vec3(0.0, 0.0, 1.0));
  float n101 = dissolveHash(cell + vec3(1.0, 0.0, 1.0));
  float n011 = dissolveHash(cell + vec3(0.0, 1.0, 1.0));
  float n111 = dissolveHash(cell + vec3(1.0, 1.0, 1.0));

  float lower = mix(
    mix(n000, n100, blend.x),
    mix(n010, n110, blend.x),
    blend.y
  );
  float upper = mix(
    mix(n001, n101, blend.x),
    mix(n011, n111, blend.x),
    blend.y
  );
  return mix(lower, upper, blend.z);
}

float dissolveMask(vec3 localPosition) {
  vec3 point = localPosition * uNoiseScale + uNoiseOffset;
  float broad = dissolveValueNoise(point);
  float medium = dissolveValueNoise(point * 2.03 + vec3(7.1, -3.7, 5.4));
  float fine = dissolveValueNoise(point * 4.11 + vec3(-2.8, 9.2, 1.6));
  return broad * 0.57 + medium * 0.29 + fine * 0.14;
}
`;
