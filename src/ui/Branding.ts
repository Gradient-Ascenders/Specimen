export const BRAND_ASSETS = {
  detailedMark: './brand/specimen-mark.svg',
  simpleMark: './brand/specimen-mark-simple.svg',
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

/** Shared indeterminate scanner. The mark stays still while its orbit moves. */
export const createBrandedScannerMarkup = (): string => `
  <div class="brand-scanner" aria-hidden="true">
    <span class="brand-scanner-orbit brand-scanner-orbit--outer"></span>
    <span class="brand-scanner-orbit brand-scanner-orbit--inner"></span>
    <span class="brand-scanner-node"></span>
    ${createBrandMarkMarkup('simple', 'brand-scanner-mark')}
  </div>
`;
