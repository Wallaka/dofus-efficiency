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

> TODO: confirm which Dofus data API is currently live and complete enough
> (candidates: DofusDB, DofAPI-style community APIs). Verify before Phase 0
> build. Cache the response locally so we don't hammer it / depend on uptime.

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
- **Later / maybe.** JSON export-import to share data; only then consider a
  backend if we ever truly need sync.

## Open questions

- Which Dofus data API to depend on (see TODO above).
- Exact HDV screenshot layout(s) we take → tells us what/where to crop for OCR.
- How to identify *which item* a price belongs to: OCR the item name and
  fuzzy-match to the known item list, or rely on screenshot context?
