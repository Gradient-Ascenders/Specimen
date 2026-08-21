export const dissolveVertexShader = /* glsl */ `
varying vec3 vLocalPosition;
varying vec3 vWorldNormal;

void main() {
  vLocalPosition = position;

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
