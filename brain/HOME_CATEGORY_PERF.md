# Home + category load performance (Nov 2026)

## Problem
- Home waited on one huge `/api/store/content/home` payload (all CMS + all listed products).
- File DB `readCollection` deep-cloned the full products JSON on every find/aggregate.
- Category facets ran ~18 aggregations (each cloning the whole catalog).

## Fixes
1. **`peekCollection`** — hot GET paths read shared in-memory docs without cloning the whole DB; only returned rows are cloned.
2. **Home scopes** — `GET /api/store/content/home?scope=above|below|full`
   - `above`: hero video, home-slider banners, ticker, about, bestsellers/carousels
   - `below`: intention, rashi, tiles, featured, how-abhimantrit, testimonials, blogs, FAQs
   - `full`: complete payload (warmup / legacy)
3. **Single-pass product slices** — `lib/homeProductSlices.js` (no `Product.find` of every listed doc into the response path).
4. **Single-pass facets** — `queryFacets` builds all facet counts in one JS pass.
5. **Storefront** — home streams above/below via React `Suspense`; shop pages fetch `category-banner` only.

## Deploy note
Restart backend (pm2) so peek + home scopes + facet rewrite load, then rebuild/restart storefront.
