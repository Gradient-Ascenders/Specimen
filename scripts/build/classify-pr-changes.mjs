// @ts-check
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Conservative selection: unfamiliar paths run unit/type and game checks.
 * @param {readonly string[]} paths
 */
export function classifyChanges(paths) {
  const relevant = paths.filter(path => !(
    path.startsWith('docs/') || /(^|\/)README\.md$/.test(path) ||
    ['CONTRIBUTING.md', '.editorconfig'].includes(path)
  ));
  return {
    checks: relevant.length > 0,
    browser: relevant.some(path => !(
      /^(tests\/unit\/|scripts\/(diagnostics|audio|blender|assets)\/)/.test(path) ||
      /^assets\/.+\.(py|blend)$/.test(path) ||
      path === 'tsconfig.tooling.json'
    )),
    generated: relevant.some(path => /^(src\/|assets\/|scripts\/(assets|lib)\/|package(-lock)?\.json$|\.nvmrc$|\.gitattributes$|\.github\/)/.test(path)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2];
  const head = process.argv[3] ?? 'HEAD';
  if (!base) throw new Error('Usage: node scripts/build/classify-pr-changes.mjs BASE [HEAD]');
  const paths = execFileSync('git', ['diff', '--name-only', '-z', base, head], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const checks = classifyChanges(paths);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(checks).map(([key, value]) => `${key}=${value}\n`).join(''));
  console.log(JSON.stringify({ paths, ...checks }, null, 2));
}
