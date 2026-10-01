import { resolve } from 'node:path';
import { validateProductionBuild } from './lib/production-build.mjs';

try {
  const files = await validateProductionBuild(resolve('dist'));
  console.log(`Validated production layout and HTML/CSS references (${files.length} files).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
