# Modern uiterlijk, niets wat je al hebt, en Nederlandse prijzen

## Goal
De app ziet er modern, vloeiend en visueel uit met swipen en animaties, stelt nooit iets voor wat je al hebt of wat daar sterk op lijkt, en toont per idee op verzoek de prijzen van bekende Nederlandse winkels, gesorteerd op goedkoopste totaal inclusief verzending.

## Decisions
- Nederlandse prijzen staan in de app zelf, van meerdere winkels, gesorteerd op totaal inclusief verzending (gebruiker, 1b).
- Bron: Google Shopping NL via SerpApi (Immersive Product API: per winkel `extracted_total` en `shipping_extracted`), gratis plan, doorgegeven door een eigen Cloudflare Worker die de SerpApi-sleutel als geheim bewaart (gebruiker: "doe wat jij aanbeveelt").
- Prijzen worden pas opgehaald na een tik op "Vergelijk prijzen" en daarna bewaard, omdat het gratis plan ongeveer 50 tot 125 producten per maand dekt (gebruiker, 1a).
- Afgewezen: Tweakers (geen officiële API), bol.com en affiliate-feeds (eigen goedgekeurde website nodig, en werken met een barcode die de Amazon-gegevens bijna nooit hebben).

## Assumptions
- Alleen bekende winkels tellen: bol.com, Coolblue, MediaMarkt, Amazon.nl, Wehkamp, Alternate, Azerty, Megekko, Paradigit, Artencraft, BCC, Expert, Blokker, HEMA, Decathlon, Intertoys, Bever, Zalando; de lijst staat in de Worker en is makkelijk aan te passen.
- Opgehaalde prijzen blijven 7 dagen geldig, daarna kan opnieuw worden opgehaald.
- De Amazon-prijs uit de catalogus wordt getoond als ongeveer-bedrag in euro, met een vaste koers in de code.
- Dingen die je hebt worden niet meer gebruikt om soortgelijke dingen aan te raden; ze sluiten alleen uit: het ding zelf en alles wat er sterk op lijkt.
- Swipen naar rechts is een 4, naar links een 2; de knoppen 1 tot 5 blijven.
- Er komt een donkere stand die meegaat met het apparaat.
- Het nieuwe uiterlijk mag het huidige "cadeaupapier"-uiterlijk vervangen; exo kiest de richting.
- Voor animatie en swipen gebruiken we bekende open-source pakketten (zoals `motion`), gekozen tijdens het ontwerpen.

## Acceptance
- Met "MacBook Pro M5 Pro 14 inch" bij "wat ik heb" komt geen laptop die er sterk op lijkt meer voor; bewezen met een enginetest (`npx vitest run src/engine`).
- De Worker geeft voor een product een lijst winkels terug, alleen bekende winkels, gesorteerd op totaal; bewezen met `npx vitest run workers/prices`.
- De app bewaart opgehaalde prijzen en vraagt ze binnen 7 dagen niet opnieuw op; bewezen met `npx vitest run src/prices`.
- Op het ideeënscherm toont "Vergelijk prijzen" de winkels met prijs, verzending en totaal, goedkoopste bovenaan.
- In het profiel kun je het adres van je prijshulp invullen; zonder adres legt de knop uit hoe je die instelt.
- De app werkt met swipen, animaties en een donkere stand, ook op telefoonbreedte.

## Manual checks
- Maak een gratis SerpApi-account en een gratis Cloudflare-account, zet de Worker online volgens `workers/prices/README.md`, en vul het adres in het profiel in.
- Tik bij een idee op "Vergelijk prijzen" en zie Nederlandse winkels met totaalprijs, goedkoopste bovenaan.
- Met je MacBook bij "wat ik heb" krijg je geen MacBook of soortgelijke laptop meer als idee.
- Swipen, animaties en de donkere stand voelen vloeiend op je telefoon.

## Visual direction
- Het huidige uiterlijk mag vervangen worden.
- Ambitie: modern, vloeiend, veel beeld (grote foto's, kleur), interactief (swipen, kleine animaties bij elke tik), donkere stand.
- Onderzoek eerst open-source GitHub-projecten die hierbij helpen (animatie, gebaren, kaart-swipen) en kies wat past.
- exo kiest tussen de gerenderde richtingen.

## Plan basis
Repository: /home/user/present
Branch: claude/frontend-exploration-b2ahcz
Worktree setup: npm ci

## Success criterion
`npm run lint && npm run typecheck && npm test && npm run build` passes.

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2, 3 and 4.
- Shared state: `src/ui/Suggestions.tsx`, `src/styles.css` and `src/ui/Profile.tsx`, touched by Tasks 4, 5 and 6, serialized by Depends on.
- Smallest safe split: one task per module, each with its own test.

## Tasks
### Task 1: fix(engine): never suggest owned items or close look-alikes
Depends on: none | Files: `src/engine/config.ts`, `src/engine/recommend.ts`, `src/engine/score.ts`, `src/engine/score.test.ts`, `src/engine/recommend.test.ts` | Data: owned vectors only feed the near-duplicate check (no retrieval seed, owned weight 0), with `nearDuplicate` lowered so a same-kind product counts as owned | Proof: npx vitest run src/engine
### Task 2: feat(prices): add a Cloudflare Worker that returns Dutch shop offers
Depends on: none | Files: `workers/prices/index.ts`, `workers/prices/index.test.ts`, `workers/prices/wrangler.toml`, `workers/prices/README.md`, `vite.config.ts` | Data: an array of `{ shop, price, shipping, total, url }` rows from SerpApi Google Shopping NL (`gl=nl`, `hl=nl`, then the Immersive Product stores), kept to an allowlist of known shops and sorted by total, with CORS for the app's origin | Proof: npx vitest run workers/prices
### Task 3: feat(prices): fetch and cache offers per product in the app
Depends on: none | Files: `src/prices/client.ts`, `src/prices/client.test.ts` | Data: a separate IndexedDB database keyed by product id holding `{ at, offers }`, fresh for 7 days, with the Worker address kept in `localStorage` | Proof: npx vitest run src/prices
### Task 4: feat(ui): redesign the app with motion, swipe and dark mode
Depends on: 1 | Files: `package.json`, `package-lock.json`, `src/styles.css`, `src/App.tsx`, `src/ui/Suggestions.tsx`, `src/ui/ScoreRow.tsx`, `src/ui/Loading.tsx`, `src/ui/Rated.tsx`, `src/ui/Profile.tsx`, `src/ui/format.ts` | Data: the existing view state in `App`, with swipe right mapped to score 4 and left to score 2, and catalog prices shown as approximate euros | Design: design-ui | Proof: npm run build
### Task 5: feat(ui): show Dutch prices on the idea card
Depends on: 3, 4 | Files: `src/ui/Prices.tsx`, `src/ui/Suggestions.tsx`, `src/styles.css` | Data: the offers array from the price client, rendered as a list cheapest first with price, shipping and total | Design: design-ui | Proof: npm run build
### Task 6: feat(ui): add the price helper address to the profile
Depends on: 3, 5 | Files: `src/ui/PriceSetup.tsx`, `src/ui/Profile.tsx`, `src/styles.css` | Data: one string, the Worker address, saved through the price client | Design: design-ui | Proof: npm run build
