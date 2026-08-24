export const BRAND_ASSETS = {
  detailedMark: './brand/specimen-mark.svg',
  simpleMark: './brand/specimen-mark-simple.svg',
} as const;

type BrandMarkVariant = 'detailed' | 'simple';

const markAssetByVariant: Readonly<Record<BrandMarkVariant, string>> = {
  detailed: BRAND_ASSETS.detailedMark,
  simple: BRAND_ASSETS.simpleMark,
};

/** Shared decorative brand mark markup for the DOM/CSS application shell. */
export const createBrandMarkMarkup = (
  variant: BrandMarkVariant,
  className: string,
): string => `
  <span class="brand-mark brand-mark--${variant} ${className}" aria-hidden="true">
    <img src="${markAssetByVariant[variant]}" alt="" aria-hidden="true" draggable="false">
  </span>
`;

/** One indeterminate containment-scanner treatment for every loading surface. */
export const createBrandedLoaderMarkup = (): string => `
  <div class="brand-loader" aria-hidden="true">
    <span class="brand-loader-ring"></span>
    <span class="brand-loader-ticks"></span>
    ${createBrandMarkMarkup('simple', 'brand-loader-mark')}
  </div>
`;
