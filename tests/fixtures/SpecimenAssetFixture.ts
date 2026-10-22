import { readFile } from 'node:fs/promises';
import { parseSpecimenAsset } from '../../src/render/specimen/SpecimenAsset.ts';

export async function loadSpecimen() {
  const bytes = await readFile(new URL('../../assets/characters/specimen/specimen.glb', import.meta.url));
  return parseSpecimenAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
