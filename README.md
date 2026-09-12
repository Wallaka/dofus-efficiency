# Dofus Efficiency

A small, local web app to figure out **which craft/idea makes the most kamas
right now**. See [`MANIFESTO.md`](./MANIFESTO.md) for what & why, and
[`TECH_NOTES.md`](./TECH_NOTES.md) for the technical decisions.

## Status: Phase 0 (manual core)

Right now the app:

- ships with a small **sample** set of items/recipes (bundled, offline),
- lets you enter **HDV prices** (saved in your browser),
- shows a table of recipes **ranked by profit per craft**.

Next up (see the roadmap in `TECH_NOTES.md`):

- **Phase 1** — read your **Medal screenshots** and OCR prices automatically
  (no more typing).
- Real items/recipes from the **DofusDB API** (adapter stubbed in
  `src/data/dofusApi.ts`).

## Run it

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install
npm run dev      # start the dev server (prints a localhost URL)
```

Other scripts:

```bash
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
```

Use **Chrome or Edge** — later phases rely on the File System Access API to read
the Medal folder, which Firefox/Safari don't support.
