import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ExterminationFinish, ExterminationMaterials } from './ExterminationMaterials.ts';

export const EXTERMINATION_LAIR_URL = new URL('../../assets/environments/extermination-lair/extermination-lair.glb', import.meta.url).href;
export const EXTERMINATION_LAIR_VERSION = 'extermination-lair-v1';
const finishes: Record<string, ExterminationFinish> = {
  Lair_Armour: 'ivory', Lair_Gunmetal: 'coolPanel', Lair_Graphite: 'rubber', Lair_StructuralAlloy: 'steel',
  Lair_BrushedAlloy: 'bareSteel', Lair_Deck: 'floor', Lair_ReplacementDeck: 'repairDeck', Lair_ServiceGrate: 'grate',
  Lair_Seal: 'rubber', Lair_ShaftLiner: 'shaft', Lair_ObservationGlass: 'glass', Lair_SafetyAmber: 'hazard',
};

export interface ExterminationLairAsset {
  readonly root: THREE.Group;
  readonly staticRoot: THREE.Object3D;
  readonly entryDoor: THREE.Object3D;
  readonly exitDoor: THREE.Object3D;
  readonly hatch: THREE.Object3D;
  readonly coverTemplates: Readonly<Record<string, THREE.Object3D>>;
}
export async function parseExterminationLairAsset(bytes: ArrayBuffer): Promise<ExterminationLairAsset> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const require = (name: string) => {
    const object = gltf.scene.getObjectByName(name);
    if (!object) throw new Error(`Missing Lair asset node: ${name}.`);
    return object;
  };
  const staticRoot = require('Lair_Static');
  if (staticRoot.userData.asset !== EXTERMINATION_LAIR_VERSION) throw new Error('Unexpected Extermination Lair asset version.');
  gltf.scene.traverse(o => {
    if (o instanceof THREE.Light || o instanceof THREE.Camera) throw new Error('Lair export must not include Blender preview lights or cameras.');
    if (!(o instanceof THREE.Mesh)) return;
    for (const a of Object.values(o.geometry.attributes)) {
      if (!(a as THREE.BufferAttribute).array.every(Number.isFinite)) throw new Error(`Non-finite Lair geometry: ${o.name}.`);
    }
  });
  return { root: gltf.scene, staticRoot, entryDoor: require('Lair_EntryDoor'), exitDoor: require('Lair_ExitDoor'),
    hatch: require('Lair_Hatch'), coverTemplates: Object.fromEntries(['Bastion', 'Capacitor', 'HeatSink'].map(name => [name, require(`Lair_Cover_${name}`)])) };
}
export async function loadExterminationLairAsset(signal: AbortSignal): Promise<ExterminationLairAsset> {
  const response = await fetch(EXTERMINATION_LAIR_URL, { signal });
  if (!response.ok) throw new Error(`Could not load Extermination Lair: HTTP ${response.status}.`);
  return parseExterminationLairAsset(await response.arrayBuffer());
}

/** Geometry and authored lamps belong to the asset; mapped finishes belong to the room kit. */
export function applyLairMaterials(asset: ExterminationLairAsset, kit: ExterminationMaterials): THREE.Material[] {
  const replaced = new Set<THREE.Material>(), retained = new Set<THREE.Material>();
  asset.root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const materials = (Array.isArray(o.material) ? o.material : [o.material]).map(m => {
      const finish = finishes[m.name];
      if (finish) { replaced.add(m); return kit.get(finish); }
      if (m instanceof THREE.MeshStandardMaterial && /ReactorLight|EmergencyLight/.test(m.name)) {
        // These are emissive apertures, with separate real lights for spill.
        // Suppress reflected white light and preserve the fixture's red output.
        m.color.setScalar(0); m.metalness = 1; m.roughness = 1; m.toneMapped = false;
      }
      retained.add(m); return m;
    });
    o.material = materials.length === 1 ? materials[0]! : materials;
  });
  for (const m of replaced) m.dispose();
  return [...retained];
}
