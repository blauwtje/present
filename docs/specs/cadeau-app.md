# Cadeau-app

## Goal
A static web app on GitHub Pages recommends gift products from a ~60,000-item Amazon catalog to one user, based on their interests, the things they already own and the 1-5 scores they give shown products, and each score changes the next suggestions.

## Decisions
- Architecture: static site, Vite + React + TypeScript, hosted on GitHub Pages, no server, no database, no accounts. Closed by: user.
- Profile and scores live in IndexedDB in the browser, with JSON export and import as backup. Closed by: user.
- Service worker caches catalog and model after first load; web manifest for home screen install. Closed by: user.
- Catalog source: Hugging Face dataset `McAuley-Lab/Amazon-Reviews-2023`, `raw_meta_*` parquet configs, 13 categories: Toys_and_Games, Video_Games, Books, Home_and_Kitchen, Sports_and_Outdoors, Electronics, Arts_Crafts_and_Sewing, Musical_Instruments, Handmade_Products, Beauty_and_Personal_Care, Clothing_Shoes_and_Jewelry, Office_Products, Grocery_and_Gourmet_Food. Closed by: user.
- Catalog filter: has price and image, `rating_number >= 50`, `average_rating >= 4.0`, ~60,000 items spread evenly over categories. Closed by: user.
- Catalog is built in its own GitHub Actions workflow and stored as a release asset; a normal deploy downloads it and never rebuilds it. Closed by: user.
- Embeddings: multilingual 384-dim sentence model `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (ONNX port of paraphrase-multilingual-MiniLM-L12-v2), the same model and the same quantized weights via transformers.js in the build (Node) and in the browser. Closed by: user (model), exo (ONNX port choice).
- Vectors stored as L2-normalized int8 in shards; compact metadata (id, title, category path, price, image, average rating, rating count). Closed by: user.
- Algorithm runs in a Web Worker: brute-force cosine, top 300 per signal, score = weighted interest similarity + Rocchio term from scores (weight `score - 3`) + owned-item fit with near-duplicate exclusion above 0.9 + Bayesian quality + category affinity, weights in one config file, MMR rerank with lambda 0.7, never show scored or owned items, one reason line per suggestion, filters for price min/max and category. Closed by: user.
- Screens: Suggesties (default, opens directly), Profiel, Gescoord; mobile first; first load shows catalog progress. Closed by: user.
- Work autonomously: choices go to `DECISIONS.md`; commit, PR, self-merge to `main`, fix every Actions run until green. Closed by: user.

## Assumptions
- Catalog selection per category: filter, then sort by `rating_number` descending and take the top `ceil(60000/13)`; categories with fewer items hand their remainder to the others in order.
- Embedded text per product: `title` plus the last two `categories` path entries, truncated to 128 tokens.
- Data step uses Python with DuckDB reading the parquet files over HTTPS with column projection; the file list comes from the Hugging Face tree API, so the exact file layout is discovered at run time.
- Catalog format, version 1, under `catalog/` in the site:
  - `manifest.json`: `{ version: 1, model, dim: 384, count, categories: string[], paths: string[], shards: [{ file, count, bytes }], meta: { file, bytes }, totalBytes, builtAt }`.
  - `vec-NN.bin`: raw `Int8Array`, row-major, 384 bytes per product, value `round(v * 127)` of the L2-normalized float vector; shard size 5,000 rows.
  - `meta.json`: array of rows `[asin, title, categoryIndex, pathIndex, priceCents, imageKey, ratingX10, ratingCount]`; `imageKey` is the file name after `https://m.media-amazon.com/images/I/`; `pathIndex` points into `manifest.paths`.
- Release asset: tag `catalog-v1`, one file `catalog.tar.gz` holding the `catalog/` folder; the deploy workflow downloads it into `dist/catalog/`.
- Similarity between a float query and an int8 row is `dot / 127`; between two int8 rows `dot / (127*127)`.
- Bayesian quality: `(C*m + n*r) / (C + n)` with prior mean `m = 4.3`, `C = 200`, mapped to 0..1 over the 4.0..5.0 range.
- Category affinity: mean of `(score - 3) / 2` over scored products in the same top category, shrunk by `n / (n + 3)`.
- "Have already" entries: free text is embedded; a catalog product is stored by its id and its vector reused.
- Reason line: named after the largest positive score term, for example "Past bij je interesse: koken" or "Lijkt op iets dat je 5 gaf".
- Feed: compute 30 suggestions per run; after each score the worker recomputes and the next card shows immediately from the remaining queue while the new list arrives.
- Pages deploy uses the official `actions/deploy-pages` flow; if Pages cannot be enabled from this session the user enables it once.
- Fonts: self-hosted via Fontsource packages, no Google Fonts request; exact pair chosen in the design task.
- Model is loaded from the Hugging Face CDN at run time and cached by transformers.js' browser cache plus the service worker.

## Acceptance
- The catalog workflow run succeeds and publishes `catalog.tar.gz` with a manifest `count >= 50000`; seam: GitHub Actions run of the catalog workflow.
- `npm run lint`, `npm run typecheck` and `npm test` pass, with unit tests for scoring and MMR; seam: CI workflow on the PR.
- The deploy workflow succeeds and the Pages URL serves the app with the catalog; seam: GitHub Actions deploy run and an HTTP fetch of `catalog/manifest.json` on the live URL.
- Recommendation behavior: a higher-scored neighbour raises a candidate, a low score lowers it, scored and owned items and near-duplicates never appear, MMR spreads near-identical items; seam: `npm test`.
- Design rules from the request hold: no banned fonts, no purple/indigo, no gradients, at most 5 color tokens, WCAG AA contrast, 44px tap targets, safe-area insets, no horizontal scroll at 360px, reduced motion respected; seam: design-ui checks on the rendered app.

## Manual checks
- On a phone, open the live link, add an interest, score a few products and see the suggestions change.
- Add the app to the home screen and reopen it offline after the first load.

## Visual direction
New visual surface, no existing identity. Ambition: a distinct, quiet, tactile look taken from gift wrapping (wrapping paper, ribbon, price tag), not a generic dashboard. Exo chooses between rendered directions without asking the user. Hard rules from the user: no Inter, Roboto, Arial, Geist, Space Grotesk, Instrument Serif or Fraunces; no purple or indigo, no gradients, no gradient text, no glassmorphism, no neon glow; not cream + terracotta, not black + one bright green; one neutral base plus one accent from the gift subject, at most 5 color tokens; no centered hero, no row of three icon cards, no cards in cards, no colored left border on cards, no 01/02/03, no emoji as icons, no default shadcn look; motion only when it explains something, respect `prefers-reduced-motion`; plain short Dutch copy; WCAG AA contrast, 44px tap targets, iPhone safe-area, no horizontal scroll at 360px.

## Plan basis
Repository: /home/user/present
Branch: claude/exo-skills-availability-jmd9x0
Worktree setup: npm ci

## Success criterion
`npm run lint && npm run typecheck && npm test && npm run build` passes.

## Checkpoint
- Blocks first: Task 1.
- Parallel: after Task 1, Tasks 2, 5, 10 and 11 need no other task; after Task 5, Tasks 6 and 7.
- Shared state: `src/App.tsx` (Task 1 creates, Task 12 replaces, chained), `src/engine/types.ts` (written by Task 5, read by 6, 7, 8, 9).
- Smallest safe split: one module with its own test file per task.

## Tasks
### Task 1: chore(app): scaffold Vite React TypeScript app with lint, typecheck and tests
Depends on: none | Files: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `.gitignore` | Data: npm scripts `dev`, `build`, `lint`, `typecheck`, `test` (vitest run), with `@huggingface/transformers`, `idb`, `react`, `react-dom` as dependencies and Vite `base: './'` | Proof: npm run lint && npm run typecheck && npm test -- --passWithNoTests && npm run build
### Task 2: feat(catalog): download and filter Amazon metadata into a balanced product table
Depends on: 1 | Files: `scripts/catalog/fetch_filter.py`, `scripts/catalog/requirements.txt` | Data: one parquet file `work/products.parquet` with rows `asin, title, top_category, path, price_cents, image_key, rating_x10, rating_count, text` | Proof: python3 -m py_compile scripts/catalog/fetch_filter.py
### Task 3: feat(catalog): embed products and pack int8 shards with manifest and metadata
Depends on: 2 | Files: `scripts/catalog/embed.mjs`, `scripts/catalog/pack.test.mjs` | Data: `Int8Array` shards of 5,000 rows plus `meta.json` rows and `manifest.json` in the catalog v1 format | Proof: node --test scripts/catalog/pack.test.mjs
### Task 4: ci(catalog): build the catalog in Actions and publish it as release asset catalog-v1
Depends on: 3 | Files: `.github/workflows/catalog.yml` | Data: `workflow_dispatch` job producing `catalog.tar.gz` and printing total bytes | Proof: node -e "require('fs').readFileSync('.github/workflows/catalog.yml')"
### Task 5: feat(engine): define catalog types and load shards with progress
Depends on: 1 | Files: `src/engine/types.ts`, `src/engine/catalog.ts`, `src/engine/catalog.test.ts` | Data: one `Catalog` object holding a single concatenated `Int8Array` and a metadata row array, loaded with a `(loaded, total)` progress callback | Proof: npm test -- catalog
### Task 6: feat(engine): score candidates from interests, scores, owned items, quality and category affinity
Depends on: 5 | Files: `src/engine/config.ts`, `src/engine/score.ts`, `src/engine/score.test.ts` | Data: one plain `ScoreParts` object per candidate plus its total and reason key | Proof: npm test -- score
### Task 7: feat(engine): rerank candidates with MMR
Depends on: 5 | Files: `src/engine/mmr.ts`, `src/engine/mmr.test.ts` | Data: an array of candidate indices in pick order | Proof: npm test -- mmr
### Task 8: feat(engine): retrieve, exclude, filter and explain recommendations
Depends on: 6, 7 | Files: `src/engine/recommend.ts`, `src/engine/recommend.test.ts`, `src/engine/reason.ts` | Data: an array of `Suggestion` objects `{ index, total, reason }` | Proof: npm test -- recommend
### Task 9: feat(engine): run embedding and recommendation in a web worker
Depends on: 8 | Files: `src/engine/worker.ts`, `src/engine/client.ts` | Data: a typed message union between page and worker | Proof: npm run typecheck
### Task 10: feat(store): keep profile and scores in IndexedDB with JSON backup
Depends on: 1 | Files: `src/store/db.ts`, `src/store/db.test.ts`, `src/store/backup.ts` | Data: object stores `interests`, `owned`, `ratings` keyed by id | Proof: npm test -- db
### Task 11: feat(pwa): cache catalog and model with a service worker and add a web manifest
Depends on: 1 | Files: `public/sw.js`, `public/manifest.webmanifest`, `public/icon.svg`, `src/pwa.ts` | Data: cache-first Cache API store for `catalog/` and Hugging Face model URLs | Proof: npm run build
### Task 12: feat(ui): build Suggesties, Profiel and Gescoord screens
Depends on: 9, 10, 11 | Files: `src/App.tsx`, `src/styles.css`, `src/ui/Suggestions.tsx`, `src/ui/Profile.tsx`, `src/ui/Rated.tsx`, `src/ui/Loading.tsx` | Data: React state fed by the worker client and the IndexedDB store | Design: design-ui | Proof: npm run build
### Task 13: ci(app): run checks on pull requests and deploy to GitHub Pages with the released catalog
Depends on: 4, 12 | Files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | Data: a deploy job that downloads release `catalog-v1` into `dist/catalog/` before `actions/deploy-pages` | Proof: node -e "require('fs').readFileSync('.github/workflows/deploy.yml')"
### Task 14: docs(app): record choices in DECISIONS.md
Depends on: 13 | Files: `DECISIONS.md`, `README.md` | Data: one short line per choice | Proof: test -s DECISIONS.md
