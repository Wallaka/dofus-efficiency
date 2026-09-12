# Tech Notes

Concrete technical decisions for Dofus Efficiency, and *why* we made them.
The [manifesto](./MANIFESTO.md) covers what and why at a high level; this file
is the "how". It's a living doc — update it when a decision changes.

## Constraints (from us)

- **100% client-side.** No backend, no server to maintain, no API keys.
- **Free.** No paid services.
- **Local data.** No live sync between the two of us. Each runs the app on their
  own machine, with their own screenshots. More screenshots = more data.
- **React app.**

Everything below follows from these.

## Architecture at a glance

```
Static data:  Dofus community API (items, recipes) ──► cached in IndexedDB
Dynamic data: Medal screenshot folder
                 │  (File System Access API — read local files)
                 ▼
              image  ──► crop price region ──► Tesseract.js (digits) ──► prices
                                                        │
                                                        ▼
              recipes ⊕ prices ──► compute margins ──► rank & compare ──► UI
Storage:      IndexedDB (per device)
```

## Key decisions

### 1. Static vs dynamic data — only OCR what actually changes

- **Static** (item names, recipes, ingredients, professions) doesn't change
  between players or sessions. Pull it from a **community Dofus data API** and
  cache it. *Do not OCR this.*
- **Dynamic** (current HDV prices) is the only thing specific to our server and
  this week. This is the only thing OCR needs to read.

This shrinks OCR from "read entire recipes" to "read some numbers" — a much
easier, more reliable job.

**Chosen API: DofusDB** (`https://api.dofusdb.fr`), a Feathers-style JSON API.
Implemented in `src/data/dofusApi.ts`:

- `GET /recipes` → `{ resultId, ingredientIds[], quantities[], jobId, resultLevel }`
- `GET /items` → `{ id, name: {fr,en,…}, level }`
- `GET /jobs` → job names (best-effort)

Strategy: fetch recipes within a **result-item level range** (this bounds the
number of requests), collect every referenced item id, fetch just those items
to resolve names, normalize into our `Item`/`Recipe` types, and **cache each
level range in localStorage** so repeat loads are instant.

> ⚠️ Unverified from the dev sandbox (egress is blocked here), so it's built
> defensively and validated live in the browser. The one thing to watch on
> first real use: **CORS** — the browser fetch from the GitHub Pages origin
> only works if DofusDB sends permissive CORS headers. If it doesn't, we'd need
> a tiny proxy (which we'd rather avoid) or a different data source.

### 2. Reading the Medal folder — File System Access API

A browser app **can** read a local folder the user selects, via the
[File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access):

- User picks the Medal screenshots folder **once**.
- **Persistent permissions** let the app re-read it on later visits without
  re-prompting.
- App enumerates image files and can parse the Medal filename for date/time.

**Constraint:** desktop **Chrome / Edge / Opera only**. Firefox and Safari don't
support picking real local folders. Acceptable — we both use Chrome.

### 3. OCR — Tesseract.js

Fully in-browser, free, zero-backend. The most *accurate* engines in 2026 are
vision-LLMs (olmOCR, PaddleOCR-VL, DeepSeek-OCR), but they need a GPU or an API,
which breaks our "free + local + no backend" rule.

Tesseract's usual weaknesses (messy layouts, handwriting) don't apply here:

- Dofus HDV text is clean, consistent, printed — Tesseract's sweet spot.
- We mainly read **numbers**, so we can **whitelist digits** for a big accuracy
  boost.
- **Crop** to the price region before OCR to cut noise.

Fallback if accuracy disappoints: PaddleOCR (WASM) or a vision-LLM — only if we
decide to relax the no-backend constraint later.

### 4. Storage — IndexedDB

Structured data (items, recipes, parsed prices, saved ideas) lives in IndexedDB.
localStorage is too small and only holds strings. Per device, matching the
"local, no sync" constraint. If we ever want to share, we add JSON export/import
before we add any backend.

### 5. Stack

- **Vite + React + TypeScript** — fast dev, no framework server needed, deploys
  as static files.
- Styling / component choices: TBD, keep it light.

### 6. Routing — react-router `HashRouter`

Multi-page (craft page, éleveur page). We use **HashRouter** (URLs like
`/#/eleveur`) rather than BrowserRouter because GitHub Pages has no SPA
fallback — a real path like `/eleveur` would 404 on refresh. Hash routing needs
zero server config and survives refreshes/deep links.

### 7. Favourites — the "lite DB"

Items the user pins to track. Stored in localStorage (`useFavourites` hook +
`storage.ts`) as the **full Item** (a small cached catalog), so favourites
render and their prices are trackable without loading a full dataset. Search is
`searchItems()` in `dofusApi.ts`, hitting DofusDB's Feathers `$search` on
`name.fr` (field/operator isolated to two constants for easy tweaking), surfaced
through a debounced `ItemAutocomplete`.

## Roadmap (phased)

The calculations are the value; OCR is just a nicer way to input prices. So we
build the value first.

- **Phase 0 — manual core (no OCR).** Vite + React + TS app. Load items/recipes
  from the Dofus API. Type in prices. Compute craft margin. Rank ideas. This
  proves the payoff before touching the hard part.
- **Phase 1 — OCR prices.** Add Medal-folder access (File System Access API) +
  Tesseract.js to auto-fill prices instead of typing them.
- **Phase 2 — more money-making math.** Farming/gathering ideas, kamas-per-hour,
  richer comparison and ranking.
- **Navigation + favourites.** Routing (HashRouter), item search/autocomplete,
  and a favourites "lite DB" for tracking specific items.
- **Éleveur (breeder) calculator.** Dedicated `/eleveur` page. Scope TBD
  (breeding/reproduction planner vs. raising profitability vs. enclos tracker).
- **Later / maybe.** JSON export-import to share data; only then consider a
  backend if we ever truly need sync.

## Open questions

- Which Dofus data API to depend on (see TODO above).
- Exact HDV screenshot layout(s) we take → tells us what/where to crop for OCR.
- How to identify *which item* a price belongs to: OCR the item name and
  fuzzy-match to the known item list, or rely on screenshot context?
