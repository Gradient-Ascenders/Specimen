import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const forbiddenRoots = new Set([
  '.git', '.github', 'dist', 'build', 'docs', 'node_modules', 'public',
  'scripts', 'src', 'tests',
]);
const forbiddenFiles = new Set([
  'README.md', 'package.json', 'package-lock.json',
  'start-production-server.ps1', 'start-production-server.sh',
  'start-server.ps1', 'start-server.sh', 'tsconfig.json', 'vite.config.ts',
]);

export const collectProductionFiles = async (root, current = root) => {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectProductionFiles(root, absolutePath)));
    } else if (entry.isFile()) {
      files.push(relative(root, absolutePath).split(sep).join('/'));
    } else {
      throw new Error(`Unsupported build entry: ${absolutePath}`);
    }
  }
  return files.sort();
};

// Resolve HTML/CSS references as a browser would under a group subdirectory.
// Runtime JavaScript requests are checked by the production browser smoke test.
const validateReference = (reference, sourceFile, files) => {
  if (/^(?:#|data:|blob:)/i.test(reference)) return;
  if (reference.startsWith('/')) {
    throw new Error(`${sourceFile} contains a root-relative reference: ${reference}`);
  }
  const base = new URL(`https://specimen.invalid/group-folder/${sourceFile}`);
  const url = new URL(reference, base);
  if (url.origin !== base.origin || !url.pathname.startsWith('/group-folder/')) {
    throw new Error(`${sourceFile} references a file outside the build: ${reference}`);
  }
  const referencedFile = decodeURIComponent(url.pathname.slice('/group-folder/'.length));
  if (!files.has(referencedFile)) {
    throw new Error(`${sourceFile} references a missing file: ${reference}`);
  }
};

export const validateProductionBuild = async (root) => {
  const files = await collectProductionFiles(root);
  const fileSet = new Set(files);
  if (!fileSet.has('index.html')) {
    throw new Error('index.html is required at the production build root.');
  }
  if (!files.some((file) => file.startsWith('assets/'))) {
    throw new Error('The production build must contain assets/.');
  }
  for (const file of files) {
    if (forbiddenRoots.has(file.split('/')[0]) || forbiddenFiles.has(file) ||
        file.split('/').some((part) => part.startsWith('.'))) {
      throw new Error(`Development-only path found in production build: ${file}`);
    }
  }

  const indexHtml = await readFile(join(root, 'index.html'), 'utf8');
  const references = Array.from(
    indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/g),
    (match) => match[1],
  );
  for (const extension of ['js', 'css']) {
    if (!references.some((reference) => reference.split(/[?#]/, 1)[0].endsWith(`.${extension}`))) {
      throw new Error(`index.html does not reference a production ${extension} file.`);
    }
  }
  for (const reference of references) validateReference(reference, 'index.html', fileSet);

  for (const file of files.filter((file) => file.endsWith('.css'))) {
    const css = await readFile(join(root, file), 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
      validateReference(match[1], file, fileSet);
    }
  }
  return files;
};
