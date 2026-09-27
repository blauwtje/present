const dollar = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });

/** Catalog prices are Amazon US prices in dollars. */
export function price(cents: number): string {
  return dollar.format(cents / 100);
}

export function mb(bytes: number): string {
  return `${(bytes / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

export const scoreWords = ['Nee', 'Liever niet', 'Maakt niet uit', 'Leuk', 'Heel leuk'];
