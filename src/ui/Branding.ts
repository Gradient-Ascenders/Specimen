export const BRAND_ASSETS = {
  detailedMark: './brand/specimen-app-icon.png',
  simpleMark: './brand/specimen-app-icon.png',
} as const;

type BrandMarkVariant = 'detailed' | 'simple';

const markAssetByVariant: Readonly<Record<BrandMarkVariant, string>> = {
  detailed: BRAND_ASSETS.detailedMark,
  simple: BRAND_ASSETS.simpleMark,
};

/** Decorative brand markup shared by the game-flow surfaces. */
export const createBrandMarkMarkup = (
  variant: BrandMarkVariant,
  className: string,
): string => `
  <span class="brand-mark brand-mark--${variant} ${className}" aria-hidden="true">
    <img src="${markAssetByVariant[variant]}" alt="" aria-hidden="true" draggable="false">
  </span>
`;

/** Shared decorative loading art. The activity bar is indeterminate: only
 * the real readiness owner may mark its enclosing surface as ready. */
export const createLiquidLoaderMarkup = (): string => `
  <div class="liquid-loader" aria-hidden="true">
    <div class="liquid-emblem">
      <div class="liquid-emblem-gel">
        <img src="${BRAND_ASSETS.simpleMark}" alt="" draggable="false" decoding="async">
        <span class="liquid-emblem-sheen" style="mask-image: url('${BRAND_ASSETS.simpleMark}'); -webkit-mask-image: url('${BRAND_ASSETS.simpleMark}')"><span></span></span>
      </div>
      <span class="liquid-droplet liquid-droplet--one"></span>
      <span class="liquid-droplet liquid-droplet--two"></span>
      <span class="liquid-droplet liquid-droplet--three"></span>
    </div>
    <span class="liquid-wordmark">SP<span>E</span>CIMEN</span>
    <span class="liquid-loading-track"><span class="liquid-loading-fill"></span></span>
  </div>
`;
