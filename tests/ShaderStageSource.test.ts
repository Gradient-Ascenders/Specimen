import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalShaderSource } from '../src/render/ShaderStageSource.ts';

test('stage sharing removes diagnostic differences while preserving macros used by shader code', () => {
  const a = '#version 300 es\n#define SHADER_NAME Bob\n#define SHADER_TYPE MeshPhysicalMaterial\nvoid main(){}';
  const b = a.replace('Bob', 'Goop').replace('MeshPhysicalMaterial', 'MeshStandardMaterial');
  assert.equal(canonicalShaderSource(a), canonicalShaderSource(b));
  assert.equal(canonicalShaderSource(a).split('\n').length, a.split('\n').length);
  const used = '#define SHADER_NAME vec4(1.0)\n#define SHADER_TYPE vec4\nvoid main(){SHADER_TYPE value=SHADER_NAME;}';
  assert.equal(canonicalShaderSource(used), used);
});
