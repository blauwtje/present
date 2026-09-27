# Keuzes

Korte lijst van keuzes die ik zelf heb gemaakt.

## Catalogus
- Per categorie de producten met de meeste reviews, na het filter (prijs, foto, minstens 50 reviews, minstens 4,0 sterren). Doel 60.000, gelijk verdeeld; heeft een categorie te weinig, dan vullen de andere aan.
- Tekst voor de vector: titel plus de laatste twee stappen van het categoriepad.
- Filteren gebeurt met Python en DuckDB, direct op de parquet-bestanden van Hugging Face. Zijn er geen parquet-bestanden, dan leest het script de jsonl-bestanden.
- Vectoren maken gebeurt met transformers.js in Node, met exact hetzelfde gecomprimeerde (q8) model als in de browser: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.
- Opslag: int8 (`round(v * 127)`), 5.000 producten per bestand, metadata als één JSON-lijst. Afbeelding als korte sleutel in plaats van hele URL.
- De catalogus staat als `catalog.tar.gz` in release `catalog-v1`. De deploy haalt hem op en bouwt hem niet opnieuw.
- Prijzen zijn Amazon US-prijzen, dus in dollars.

## Aanbevelen
- Alle gewichten staan in `src/engine/config.ts`.
- Interesse: gelijkenis met de best passende interesse, maal gewicht/5.
- Scores: Rocchio-gemiddelde met gewicht `score - 3`, gedeeld door de som van de gewichten. Een 3 telt niet mee.
- Heb ik al: past iets erbij, dan telt het mee; gelijkenis boven 0,9 betekent hetzelfde ding en wordt nooit getoond.
- Kwaliteit: Bayesiaans gemiddelde met voorkennis 4,3 sterren en 200 reviews.
- Categorievoorkeur: gemiddelde van `(score - 3) / 2` per categorie, afgezwakt bij weinig scores.
- Ophalen: top 300 per interesse, per ding dat je hebt, voor het Rocchio-gemiddelde, voor je laatste 10 hoge scores, en 300 goed beoordeelde producten zodat een leeg profiel ook ideeën krijgt.
- MMR met lambda 0,7 over de beste kandidaten; relevantie wordt eerst naar 0..1 geschaald.
- Na een score blijft de volgende kaart meteen staan; de rest van de rij wordt op de achtergrond opnieuw berekend.

## App
- Het taalmodel komt van de Hugging Face CDN en wordt in de browser bewaard (transformers.js-cache en service worker). De catalogus pas na de eerste keer uit de cache; `manifest.json` wordt altijd opnieuw gecheckt, en de bouwdatum zit in de URL van elk databestand.
- IndexedDB via `idb`. Backup is een JSON-bestand met interesses, spullen, scores en filters.
- Deploy via de officiële Pages-workflow (`actions/deploy-pages`).

## Design
- Idee: elk product is een cadeaulabel dat aan een lint hangt. Na een score gaat het label van het lint en schommelt het volgende op zijn plek. Zonder beweging (reduced motion) wisselt het direct.
- Kleuren (5): vloeipapier `#e6e9e4`, inkt `#1a1e1c`, label `#fbfbf8`, lint `#1d5a45`, potlood `#545c57`. Contrast minimaal 5,6:1.
- Letters: Young Serif (titels en prijs, als op een prijssticker) en Familjen Grotesk (tekst). Zelf gehost, geen externe fonts.
- Scoreknoppen blijven onderin in beeld, boven het menu, binnen bereik van de duim. Menu onderin.
- Desktop: label links, filters en "Hierna" rechts.
