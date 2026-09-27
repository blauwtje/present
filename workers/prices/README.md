# Prices Worker

A Cloudflare Worker that looks up Dutch shop offers for a product name via
SerpApi's Google Shopping (NL) results, and returns them as JSON:

```
GET https://<your-worker>.workers.dev/?q=<product name>

{
  "offers": [
    { "shop": "bol.com", "price": 110, "shipping": 4.95, "total": 114.95, "url": "https://..." },
    ...
  ]
}
```

Offers are limited to the allowlist in `ALLOWED_SHOPS` in `index.ts`, and
sorted cheapest total (price + shipping) first. Edit that list to add or
remove shops.

## How it works

For each request the Worker calls SerpApi twice, with `gl=nl&hl=nl`:

1. `engine=google_shopping` with your query, to find the product's
   Immersive Product page token.
2. `engine=google_immersive_product` with that token, to get the per-store
   offers (`stores[]`, each with a name, link, price and shipping).

## Setup

1. Create a free [SerpApi](https://serpapi.com/) account and copy your API key
   (the free plan covers roughly 50-125 searches per month; each price lookup
   here uses 2 searches).
2. Create a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
3. In this directory:

   ```
   npx wrangler login
   npx wrangler secret put SERPAPI_KEY   # paste your SerpApi key
   ```

4. In `wrangler.toml`, set `ALLOWED_ORIGIN` to the URL where the app is
   hosted (so only that page can call this Worker via CORS). Use `"*"` only
   while testing locally.
5. Deploy:

   ```
   npx wrangler deploy
   ```

6. Paste the deployed `https://<name>.<subdomain>.workers.dev` address into
   the app's profile screen ("price helper address").

## Testing

```
npx vitest run workers/prices
```
