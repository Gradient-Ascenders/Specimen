import type { CultivationAssetSource } from './CultivationBakedAssets.ts';

export function createCultivationEquipmentWear(assets: CultivationAssetSource, drone = false) {
  const { albedo, roughness } = assets.textures(`equipment-${drone ? 'drone' : 'panel'}`);
  return { albedo, roughness };
}
