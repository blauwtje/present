const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });

/** Fixed USD -> EUR estimate rate for catalog prices. Not a live rate: revisit if it drifts
 * far from market (see Task 5, which adds a live-fetched NL total this must stay visually
 * distinct from). */
export const USD_TO_EUR = 0.92;

/** Catalog prices are Amazon US cents; shown as a rounded, clearly-approximate euro estimate. */
export function price(cents: number): string {
  return `ca. ${euro.format((cents / 100) * USD_TO_EUR)}`;
}

export function mb(bytes: number): string {
  return `${(bytes / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

export const scoreWords = ['Nee', 'Liever niet', 'Maakt niet uit', 'Leuk', 'Heel leuk'];

const CATEGORY_HUE_COUNT = 6;

/** Hash a category label to one of the six card-frame/ground-glow hue slots
 * (`--hue-cat-0`..`--hue-cat-5` in styles.css). Stable per string, not cryptographic. */
export function categoryHueIndex(category: string): number {
  let h = 0;
  for (let i = 0; i < category.length; i += 1) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return h % CATEGORY_HUE_COUNT;
}
