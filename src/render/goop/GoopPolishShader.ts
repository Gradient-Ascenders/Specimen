import { GOOP_LANDING_RIPPLE_METRES } from './GoopPolishMotion.ts';

const polishFunctions = /* glsl */ `
uniform vec2 uGoopCrestLag;
uniform vec2 uGoopLandingRipple;
float goopProtection(vec3 p);

vec3 goopPolishPosition(vec3 p) {
  float crest = (1.0 - smoothstep(0.08, 0.19, abs(p.x))) *
    max(smoothstep(0.23, 0.45, p.y), smoothstep(0.35, 0.63, p.z)) *
    smoothstep(-0.20, 0.03, p.y);
  p.xz += crest * uGoopCrestLag;
  float radius = length(p.xz);
  float fromWave = radius - uGoopLandingRipple.y * 1.4;
  float wave = sin(fromWave * 24.0) * exp(-pow(fromWave / 0.18, 2.0));
  float lifetime = 1.0 - smoothstep(0.25, 0.65, uGoopLandingRipple.y);
  float lowerBody = 1.0 - smoothstep(-0.28, -0.12, p.y);
  float ripple = ${GOOP_LANDING_RIPPLE_METRES} * uGoopLandingRipple.x * lifetime *
    lowerBody * goopProtection(p) * wave;
  p.xz += p.xz / max(radius, 0.001) * ripple;
  return p;
}
`;

const polishNormal = /* glsl */ `
if (dot(uGoopCrestLag, uGoopCrestLag) + uGoopLandingRipple.x > 0.0) {
  vec3 goopPolishBase = position + goopBaseMask(position.y) * uGoopBaseOffset;
  mat3 goopPolishJacobian = mat3(
    (goopPolishPosition(goopPolishBase + vec3(0.001, 0.0, 0.0)) - goopPolishPosition(goopPolishBase - vec3(0.001, 0.0, 0.0))) / 0.002,
    (goopPolishPosition(goopPolishBase + vec3(0.0, 0.001, 0.0)) - goopPolishPosition(goopPolishBase - vec3(0.0, 0.001, 0.0))) / 0.002,
    (goopPolishPosition(goopPolishBase + vec3(0.0, 0.0, 0.001)) - goopPolishPosition(goopPolishBase - vec3(0.0, 0.0, 0.001))) / 0.002
  );
  objectNormal = normalize(
    cross(goopPolishJacobian[1], goopPolishJacobian[2]) * objectNormal.x +
    cross(goopPolishJacobian[2], goopPolishJacobian[0]) * objectNormal.y +
    cross(goopPolishJacobian[0], goopPolishJacobian[1]) * objectNormal.z
  );
}
`;

export function injectGoopPolishVertexShader(vertexShader: string, shadowPass: boolean): string {
  return (polishFunctions + vertexShader)
    .replace('transformed += goopBaseMask(transformed.y) * uGoopBaseOffset;',
      'transformed += goopBaseMask(transformed.y) * uGoopBaseOffset;\ntransformed = goopPolishPosition(transformed);')
    .replace('#include <defaultnormal_vertex>', `${shadowPass ? '' : polishNormal}\n#include <defaultnormal_vertex>`);
}

/** Close over the original seated eye surface instead of scaling it out of its socket. */
export function injectGoopEyeBlinkShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = `varying vec3 vGoopEyePosition;\n${shader.vertexShader}`
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGoopEyePosition = position;');
  shader.fragmentShader = `uniform float uGoopEyeClosure;\nvarying vec3 vGoopEyePosition;\n${shader.fragmentShader}`
    .replace('void main() {', `void main() {
      if (uGoopEyeClosure > 0.0) {
        float halfHeight = mix(0.18, 0.006, uGoopEyeClosure);
        if (abs(vGoopEyePosition.y + 0.1292475) > halfHeight) discard;
      }
    `);
}
