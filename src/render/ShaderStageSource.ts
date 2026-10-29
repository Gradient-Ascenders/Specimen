/** Three's diagnostic defines vary between otherwise identical stages. Keep
 * any macro referenced by shader code intact; only canonicalize unused names
 * so the driver's source cache can reuse compiled stages across materials. */
export function canonicalShaderSource(source: string): string {
  for (const name of ['SHADER_NAME', 'SHADER_TYPE']) {
    if ((source.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length === 1) {
      source = source.replace(new RegExp(`^#define ${name}[^\\r\\n]*`, 'm'), `#define ${name} SpecimenSharedStage`);
    }
  }
  return source;
}
