import * as THREE from 'three';
import { GEL_LANDING_RIPPLE_METRES, GEL_LANDING_RIPPLE_SECONDS } from '../slime/GelElasticMotion.ts';
import { VOLT_EYE_BOUNDS } from './VoltAsset.ts';

const eyeMin = Math.min(...VOLT_EYE_BOUNDS.map(b => b.min.y));
const eyeMax = Math.max(...VOLT_EYE_BOUNDS.map(b => b.max.y));
const eyeX = Math.max(...VOLT_EYE_BOUNDS.map(b => Math.max(Math.abs(b.min.x), Math.abs(b.max.x))));
const eyeZ = Math.max(...VOLT_EYE_BOUNDS.map(b => b.max.z));
const smoothstep = THREE.MathUtils.smoothstep;

/** Source-coordinate mask protects the entire seated lenses, sole and crest. */
export function voltMotionProtection(p: THREE.Vector3): number {
  const eye = (1 - smoothstep(Math.abs(p.x), eyeX + 0.025, eyeX + 0.09)) *
    smoothstep(p.y, eyeMin - 0.085, eyeMin - 0.025) *
    (1 - smoothstep(p.y, eyeMax + 0.025, eyeMax + 0.085)) *
    (1 - smoothstep(p.z, eyeZ + 0.025, eyeZ + 0.085));
  return (1 - eye) * smoothstep(p.y, -0.45, -0.32) * (1 - smoothstep(p.y, 0.04, 0.12));
}

const protectionFunction = /* glsl */ `
float voltProtection(vec3 p) {
  float eye = (1.0 - smoothstep(${eyeX + 0.025}, ${eyeX + 0.09}, abs(p.x))) *
    smoothstep(${eyeMin - 0.085}, ${eyeMin - 0.025}, p.y) *
    (1.0 - smoothstep(${eyeMax + 0.025}, ${eyeMax + 0.085}, p.y)) *
    (1.0 - smoothstep(${eyeZ + 0.025}, ${eyeZ + 0.085}, p.z));
  return (1.0 - eye) * smoothstep(-0.45, -0.32, p.y) *
    (1.0 - smoothstep(0.04, 0.12, p.y));
}
`;

export const VOLT_SECONDARY_PROTECTION_SHADER = /* glsl */ `
  float bobEyeSeatProtection = voltProtection(bobPosition);
  vec3 bobEyeSeatProtectionGradient = vec3(
    voltProtection(bobPosition + vec3(0.001, 0.0, 0.0)) - voltProtection(bobPosition - vec3(0.001, 0.0, 0.0)),
    voltProtection(bobPosition + vec3(0.0, 0.001, 0.0)) - voltProtection(bobPosition - vec3(0.0, 0.001, 0.0)),
    voltProtection(bobPosition + vec3(0.0, 0.0, 0.001)) - voltProtection(bobPosition - vec3(0.0, 0.0, 0.001))
  ) / 0.002;
  float bobContactProtection = 1.0;
  vec3 bobContactProtectionGradient = vec3(0.0);
`;

const elasticFunctions = /* glsl */ `
uniform vec3 uVoltBaseOffset;
uniform vec2 uVoltCrestLag;
uniform vec2 uVoltLandingRipple;

vec3 voltElasticPosition(vec3 p) {
  // End below the lowest lens vertex. Authored morphs are applied afterwards,
  // so blinking/squashing never moves an eye vertex into the trailing region.
  vec3 moved = p + (1.0 - smoothstep(-0.41, -0.32, p.y)) * uVoltBaseOffset;
  moved.xz += smoothstep(0.35, 0.70, p.y) * uVoltCrestLag;
  float radius = length(moved.xz);
  float fromWave = radius - uVoltLandingRipple.y * 1.4;
  float wave = sin(fromWave * 24.0) * exp(-pow(fromWave / 0.18, 2.0));
  float lifetime = 1.0 - smoothstep(0.25, ${GEL_LANDING_RIPPLE_SECONDS}, uVoltLandingRipple.y);
  float ripple = ${GEL_LANDING_RIPPLE_METRES} * uVoltLandingRipple.x * lifetime *
    (1.0 - smoothstep(-0.28, -0.12, p.y)) * voltProtection(p) * wave;
  moved.xz += moved.xz / max(radius, 0.001) * ripple;
  return moved;
}
`;

const elasticNormal = /* glsl */ `
if (dot(uVoltBaseOffset, uVoltBaseOffset) + dot(uVoltCrestLag, uVoltCrestLag) + uVoltLandingRipple.x > 0.0) {
  mat3 voltElasticJacobian = mat3(
    (voltElasticPosition(position + vec3(0.001, 0.0, 0.0)) - voltElasticPosition(position - vec3(0.001, 0.0, 0.0))) / 0.002,
    (voltElasticPosition(position + vec3(0.0, 0.001, 0.0)) - voltElasticPosition(position - vec3(0.0, 0.001, 0.0))) / 0.002,
    (voltElasticPosition(position + vec3(0.0, 0.0, 0.001)) - voltElasticPosition(position - vec3(0.0, 0.0, 0.001))) / 0.002
  );
  objectNormal = normalize(
    cross(voltElasticJacobian[1], voltElasticJacobian[2]) * objectNormal.x +
    cross(voltElasticJacobian[2], voltElasticJacobian[0]) * objectNormal.y +
    cross(voltElasticJacobian[0], voltElasticJacobian[1]) * objectNormal.z
  );
}
`;

export function injectVoltMotionVertexShader(vertexShader: string, shadowPass: boolean): string {
  return (protectionFunction + elasticFunctions + vertexShader)
    .replace('transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;',
      'transformed += bobSecondaryBaseNormal * bobSecondaryDisplacement;\ntransformed += voltElasticPosition(position) - position;')
    .replace('#include <defaultnormal_vertex>', `${shadowPass ? '' : elasticNormal}\n#include <defaultnormal_vertex>`);
}

/** CPU counterpart for checking deformed real-asset topology and eye protection. */
export function evaluateVoltElasticPosition(p: THREE.Vector3, base: THREE.Vector3, crest: THREE.Vector2,
  rippleStrength: number, rippleAge: number, out: THREE.Vector3): THREE.Vector3 {
  out.copy(p).addScaledVector(base, 1 - smoothstep(p.y, -0.41, -0.32));
  const crestMask = smoothstep(p.y, 0.35, 0.70);
  out.x += crestMask * crest.x; out.z += crestMask * crest.y;
  const radius = Math.hypot(out.x, out.z), fromWave = radius - rippleAge * 1.4;
  const wave = Math.sin(fromWave * 24) * Math.exp(-Math.pow(fromWave / 0.18, 2));
  const ripple = GEL_LANDING_RIPPLE_METRES * rippleStrength * (1 - smoothstep(rippleAge, 0.25, GEL_LANDING_RIPPLE_SECONDS)) *
    (1 - smoothstep(p.y, -0.28, -0.12)) * voltMotionProtection(p) * wave;
  out.x += out.x / Math.max(radius, 0.001) * ripple; out.z += out.z / Math.max(radius, 0.001) * ripple;
  return out;
}
