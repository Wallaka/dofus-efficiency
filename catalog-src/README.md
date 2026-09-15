# catalog-src — the HDV catalog source

This folder is the **source of the bundled HDV catalog**. You drop raw DofusDB
responses here, one file per in-game category, and
`npm run build:catalog` turns them into `src/data/catalog.generated.ts`, which
the app ships offline.

## Convention

```
catalog-src/<Tab>/<Category>.json
```

- **Folder = HDV tab** — e.g. `Ressources/`
- **File name = the category** — e.g. `Bois.json`, `Céréales.json`, `Minerais.json`

Example:

```
catalog-src/
  Ressources/
    Bois.json
    Céréales.json
    Minerais.json
```

A file placed directly in `catalog-src/` (no tab folder) is filed under the
**Ressources** tab, using the file name as its category.

## What to paste into each file

The response of a DofusDB `/items` query for that category. Any of these shapes
works, so paste whatever is easiest:

- the whole page object: `{ "total": …, "data": [ … ] }`
- just the array: `[ { "id": …, "name": { "fr": … }, "img": …, "level": … }, … ]`
- several pages at once: `[ { "data": [ … ] }, { "data": [ … ] } ]`

Only `id`, `name` (`.fr`/`.en`), `img` and `level` are kept; everything else is
ignored, so extra fields are fine.

## Rebuild

```
npm run build:catalog
```

Commit both the raw files here **and** the regenerated
`src/data/catalog.generated.ts` — the raw files make the snapshot reproducible,
the generated file is what the app bundles.
