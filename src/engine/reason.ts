import type { ReasonKind } from './types';

export const categoryNames: Record<string, string> = {
  Toys_and_Games: 'Speelgoed en spellen',
  Video_Games: 'Games',
  Books: 'Boeken',
  Home_and_Kitchen: 'Huis en keuken',
  Sports_and_Outdoors: 'Sport en buiten',
  Electronics: 'Elektronica',
  Arts_Crafts_and_Sewing: 'Knutselen en naaien',
  Musical_Instruments: 'Muziekinstrumenten',
  Handmade_Products: 'Handgemaakt',
  Beauty_and_Personal_Care: 'Verzorging',
  Clothing_Shoes_and_Jewelry: 'Kleding en sieraden',
  Office_Products: 'Kantoor',
  Grocery_and_Gourmet_Food: 'Eten en drinken',
};

export function categoryName(key: string): string {
  return categoryNames[key] ?? key.replace(/_/g, ' ');
}

function short(text: string, max = 40): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** One short Dutch line saying why a product is suggested. */
export function reasonText(kind: ReasonKind, label: string, ctx: { category: string; rating: number; ratingCount: number }): string {
  switch (kind) {
    case 'interest':
      return `Past bij je interesse: ${short(label)}`;
    case 'liked':
      return `Lijkt op iets dat je hoog gaf: ${short(label)}`;
    case 'owned':
      return `Past bij wat je al hebt: ${short(label)}`;
    case 'category':
      return `${categoryName(ctx.category)} scoor je vaak hoog`;
    case 'quality':
      return `Goed beoordeeld: ${ctx.rating.toFixed(1).replace('.', ',')} uit ${ctx.ratingCount.toLocaleString('nl-NL')} reviews`;
  }
}
