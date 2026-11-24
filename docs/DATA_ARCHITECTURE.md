# SaltSaver: data architecture

This document describes the database-backed version of SaltSaver (November 2026). It covers India-only official data, the import pipeline, normalisation, the matching engine, the API and the frontend.

The original static design is in [ARCHITECTURE.md](../ARCHITECTURE.md). That document still describes the parts that did not change: the UI structure, roles, accessibility, the storage fallback and printing.

## Overview

```
Browser (index.html, search.html, cart.html)
  │  /api/search · /api/suggest · /api/products/:id/alternatives · /api/products · /api/status
  ▼
Express API (server/app.js) ── reads only ──► Postgres (Supabase free tier)
                                                ▲
Import CLI (scripts/import.js)                  │ approved changes only
  official file → checksum + raw copy → parse → normalise → diff → review report → approve → commit
                                                ▲
GitHub Actions (twice a week): freshness check, review reminders, optional download + staging
```

- **Search never calls a government website.** Every request reads SaltSaver's own database.
- **Nothing is live.** Data is imported periodically, and every price shows its source and import date.
- **Free tools only.** Node.js, Express, `pg`, pdf.js, Supabase free tier, Vercel Hobby and GitHub Actions. Tests run on PGlite, an in-process Postgres.

## Data sources

| Id | Kind | Use |
|---|---|---|
| `pmbi_product_list` | official | Jan Aushadhi products and MRPs, the only source of alternatives |
| `nppa_ceiling_prices` | official | Ceiling price per unit, excluding GST (legal maximum) |
| `nppa_brand_mrp` | official | MRPs of branded medicines from NPPA's Pharma Sahi Daam page: the verified price of a brand |
| `brand_review` | curated | Brand composition, form, release type and (optionally) printed MRP, checked from the pack by a named person |
| `legacy_json` | legacy | The original demo dataset: brand names and compositions. Its prices are never shown |
| `user_entered` | user | The MRP a user types. Kept in their browser only |
| `saltsaver_curated` | curated | Dosage forms, release types and ingredient aliases |

The files for these sources are described in [DATA_PIPELINE.md](DATA_PIPELINE.md).

## Database

The migrations are in `db/migrations/`. Every table has row-level security turned on and no policies, so Supabase's public REST API cannot read any of them. Only the backend can, through `DATABASE_URL`.

| Table | Purpose |
|---|---|
| `data_sources`, `source_files`, `source_file_blobs` | Sources, and every imported file with its checksum and raw bytes |
| `source_records` | Each raw row, its parsed form, and its errors and warnings |
| `import_diffs` | Reviews: pending → committed, or rejected. One pending review per source |
| `ingredients`, `ingredient_aliases` | Canonical Indian names, and aliases with their salt form |
| `products`, `product_ingredients` | Brands and generics with parsed composition, form, route and release type |
| `dosage_forms`, `release_types` | Reference lists |
| `pack_sizes`, `prices`, `price_history` | Pack unit counts, MRPs (one current price per product and source), and every change |
| `nppa_ceiling_prices`, `nppa_ceiling_history` | Ceiling prices per formulation and unit, with history |
| `match_results` | Stored engine results (`npm run match:refresh`) and the legacy pairings |
| `data_conflicts` | Disagreements between records. Both values are kept |
| `sync_logs` | Every job, with its outcome |

Rules the schema enforces:
- Every row records its source and a timestamp.
- Prices are retired (`is_current = false`), never overwritten, and a trigger records every change.
- Products a source stops listing are deactivated, never deleted.
- Indexes: trigram (`pg_trgm`) on product names, ingredient names and aliases; a unique index on `ja_drug_code`; an index on `composition_key`.

## Normalisation (`lib/pharma/`)

| Module | What it does |
|---|---|
| `text.js` | Lowercases and collapses abbreviations (`S.R.` becomes `sr`, `I.P.` becomes `ip`). Reads `1,000` and lakh amounts (`12 lac` = 12,00,000) and µg. |
| `strength.js` | Reads `650mg`, `250 mg/5 ml`, `100 mcg/dose`, `1% w/w` and `60000 IU`. Compares in mg, per 1 ml. |
| `ingredients.js` | Resolves names: exact name → alias → strip salt words (`Metformin HCl` becomes metformin + hydrochloride). Hydrates are ignored. Mineral salts such as `zinc sulphate` stay whole. |
| `forms.js` | Detects the dosage form (tablet, DT, MD, capsule, syrup, suspension, dry syrup, injection vial or ampoule, cream, drops, inhaler, …), the route, the release type (IR, SR, ER, XR, XL, MR, CR, PR, DR) and the IP/BP/USP suffix. Release wording that cannot be read (a misspelling, "long acting") is unknown, never plain (IR). |
| `composition.js` | Parses inline compositions ("A 1 mg + B 500 mg") and trailing ones ("A and B 500 mg + 125 mg"), and "eq. to" statements. A trailing "/5 ml" applies to every strength. Builds an order-independent `composition_key`. |
| `pack.js` | Converts a pack label to a unit count: "10's", "Strip of 15 tablets", "10 x 10", "30 ml", "1 Vial & WFI", "15 gm", "200 MDI". |

When a value cannot be read, it is reported as an error or warning. It is never guessed.

## Matching engine (`lib/pharma/match.js`)

The engine compares the user's medicine with each active Jan Aushadhi product from the official list that shares at least one ingredient.

| Check | Result if it fails |
|---|---|
| Same set of active ingredients | not equivalent |
| Same strength for each ingredient (unit-converted; "eq. to" respected) | not equivalent |
| Same dosage form | not equivalent; needs review if the forms are related (tablet and DT; syrup, suspension and dry syrup; injection containers) |
| Same route | not equivalent |
| Same release type; types never match each other | not equivalent |
| Release type stated on both sides | needs review |
| Salt form, when both sides state it | needs review |
| Composition, strength and form known | insufficient data |
| A liquid's strength states its volume ("120 mg" alone does not) | insufficient data |

Every result shown to users carries the line "Possible alternative only. Confirm with your doctor or pharmacist before switching medicines." Names alone never produce a match.

## Search (`lib/pharma/query.js`, `server/catalog.js`, `lib/pharma/groups.js`)

One statement answers a search, whether a brand or a salt was typed:

1. **Read the query.** Name words, strengths, dosage form and release type are separated ("Crocin 500mg" is *crocin*, 500 mg).
2. **Find hits.** Medicines whose name starts with the words, or that contain the salts, in that strength, form and release. Only when there are none, similar names are offered and marked as similar.
3. **Load candidates.** For each brand found, the official generics with exactly the same salts.
4. **Group by formulation** (salts, strengths, form, route, release type). The matching engine compares every generic with every brand; a group never decides a match.

A brand whose release type is not recorded sits with the plain form, or in a group without a release type. It is never filed under one it may not have. Packs of one medicine share a card, priced by the cheapest pack per unit, so a saving is never overstated. A demo brand is hidden when an official listing has the same brand name, strength and form.

## Savings (`js/core/comparison.js`, `js/core/unitSavings.js`, `js/core/basketMath.js`)

`compareResults()` works out every comparison of a search at once, so a brand card and the generic cards under it cannot disagree. The reference is the MRP you typed for that brand, otherwise its verified MRP; with several brands, the cheapest.

```
your unit price         = reference MRP / units in its pack
Jan Aushadhi unit price = Jan Aushadhi MRP / units in its pack
saving per unit         = your unit price − Jan Aushadhi unit price    (never below 0)
saving %                = saving per unit / your unit price × 100      (rounded down)
```

- Savings are calculated only for verified matches whose units match.
- Money is held in paise and shown in ₹ with Indian digit grouping.
- Every saving is labelled an estimate.
- The NPPA ceiling warning compares your price per unit with the ceiling plus 5% GST.

## API (`server/app.js`)

| Endpoint | Returns |
|---|---|
| `GET /api/status` | Freshness of each source (imported, stale, age, list date), catalogue counts, and `officialDataImported` |
| `GET /api/search?q=` | `groups` (one per formulation, each with its `brands`, its `generics` with the match against each brand, and NPPA `ceilings`), `other` (found, but without the details needed to compare), `matchedBy` (`name` or `similar`), `notEquivalent`, the disclaimer and source status. Legacy demo generics and demo prices are never served |
| `GET /api/suggest?q=` | Autocomplete. Aliases fill in the Indian name |
| `GET /api/products/:id/alternatives` | The product, its alternatives with status, reasons, MRP and source, the count of non-equivalent products, NPPA ceilings, the disclaimer, and source status |
| `GET /api/products?ids=` | Current details and MRPs, used to refresh the basket |
| `GET /api/health` | Database reachability |

- **Input validation:** queries of 2–60 characters from letters, numbers and `+ - . , / % ( ) ' &`; numeric ids.
- **Rate limiting:** 60 requests a minute per IP on search, suggest and product endpoints. The limit is held in memory, so each serverless instance counts separately.
- **Errors:** friendly JSON messages. Internal details are logged, never sent to the browser.

## Frontend

- **Search:** debounced, with datalist autocomplete. The newest request wins. States: idle, short, loading, results, not found, error.
- **Results (`ui/resultGroup.js`):** one section per formulation, branded medicines first, matching generics under them, with no extra click. Every medicine is drawn by the one card (`ui/medicineCard.js`) from the one model (`core/cardModel.js`), so all cards have the same slots, size and button.
- **Your price:** a form on the card for the MRP and pack printed on your strip ("Entered by you", kept in this tab). It asks for the release type when the catalogue does not know it.
- **Missing and stale data:** shown inline. A banner appears when official data is missing or stale, and the footer lists the import date of each source.
- **Basket:** stored in the browser only. Each line keeps the reference price and who vouches for it (a verified source and date, or you). The cart page refreshes verified MRPs and says when it can't. Undo, steppers, print and the Pharmacy Buyer restriction work as before.

## Security

- Credentials exist only in `.env` or the hosting settings. The browser never sees them, and Supabase's public API is closed by row-level security.
- The database connection uses TLS. Set `DATABASE_SSL=verify` with Supabase's CA certificate to check the server certificate.
- Downloads have timeouts and size limits. PDFs are parsed with eval disabled, using pdf.js 6.x, which fixes the version 5 code-execution advisory.
- The UI builds the DOM without `innerHTML`, and the Content Security Policy is unchanged.

## Known limits

- **No stable file URLs.** Neither PMBI nor NPPA publishes one, so new versions are downloaded by hand. The scheduled check reminds you.
- **Most demo brands give "needs review" until checked.** Their release type and dosage form are not recorded until someone checks them through the brand review import.
- **The alias list is a starting list.** Import reports show which ingredient names to add.
- **The GST rate in the ceiling check is a setting.** It is not read from the notification.
