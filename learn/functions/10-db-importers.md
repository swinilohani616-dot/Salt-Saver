# Function notes 10: db/importers

There are four kinds of list. Each has its own reader, called an *adapter*. All four have the same parts, so the pipeline treats them alike.

| Part | Job |
|---|---|
| `fields` | Columns and the names they may have |
| `prepare` | Look at the whole file first (only brand prices) |
| `parseRow` | Read one row |
| `snapshot` | Which fields are compared |
| `loadCurrent` | What the database has now |
| `commit` | Save after approval |

**Why adapters (Design choice):** the steps (read, compare, approve) are the same for every list. Only the reading differs.

| File | List | Made in |
|---|---|---|
| [pmbi.js](#pmbijs) | Jan Aushadhi | Step 10 |
| [nppa.js](#nppajs) | Ceiling prices | Step 10 |
| [brands.js](#brandsjs) | Packs checked by a person | Step 10 |
| [brandPrices.js](#brandpricesjs) | Brand MRPs | Step 20 |
| [index.js](#indexjs) | List of adapters | Step 10 |

`SOURCE_ID` in each file is the id of its source. `clean(s)` in each removes extra spaces.

---

## pmbi.js

[Source](../../db/importers/pmbi.js)

| Function | What | Why |
|---|---|---|
| `parseRupees(text)` | "₹ 1,234.50", "12.00/-" → number | Used by the other readers too |
| `pmbiAdapter` | The adapter | |
| `parseRow(cell, { resolver })` | Code, name, pack, MRP | No code, name or MRP → failed. MRP 0 means "under process": kept **without** a price |
| `snapshot(p)` | Also form and release type | So a better reader shows up as a change (Step 19) |
| `loadCurrent(tx)` | Current products | |
| `commit(tx, { ... })` | Saves products, salts, packs, prices | `status` gives *verified* only if there was no warning |

## nppa.js

[Source](../../db/importers/nppa.js)

| Function | What | Why |
|---|---|---|
| `dropMarkers(s)` | Removes "(A)", "(B)" | NPPA marks combination parts |
| `parseCeilingUnit(text)` | "1 Tablet", "Per 0.1 ml", "500ml Non-Glass" | NPPA prices packs and containers separately |
| `unitKey(u)` | "pack:500ml:glass" | Part of the identity |
| `parseIndianDate(text)` | 30.09.2020 → 2020-09-30 | Refuses 31.02 |
| `nppaAdapter` | The adapter | |
| `parseRow(...)` | Medicine, strength, unit, price | A price with `*` gets a warning |
| `snapshot`, `loadCurrent`, `commit` | As above | `commit` retires the old ceiling and adds the new one |

The list itself is **not imported yet**.

## brands.js

[Source](../../db/importers/brands.js). Step 20 added the optional MRP.

**Why:** the demo brands have no form or release type, so they could never be a verified match. A person reads the real strip and fills in a CSV.

| Function | What | Why |
|---|---|---|
| `brandAdapter` | The adapter. `largeRemovalShare: 1` | See the problem below |
| `parseRow(...)` | Brand, composition, form, release, pack, MRP, "Checked by" | A name in "Checked by" is required. An MRP needs a pack size |
| `snapshot`, `loadCurrent`, `commit` | As above | Saved as *verified* |

**Problem found on 25 November 2026, not fixed.** The comment beside `largeRemovalShare: 1` says a partial file must not hide brands reviewed earlier. The code does the opposite: 1 switches the guard off, and `commit` still hides every brand missing from the new file. Tested: file 1 had brand A, file 2 had brand B. After approving file 2, brand A was hidden. `brands:template` leaves out brands that were already reviewed, so following it twice would cause this. Until it is fixed, **keep every reviewed brand in the file**, and read the *Removed* part of the report.

## brandPrices.js

[Source](../../db/importers/brandPrices.js). New in [Step 20](../04-MY-STEPS.md#step-20).

**Why:** you asked for verified brand prices. NPPA's public page shows them but has no download, so rows are kept in a CSV.

### `releaseFromListing({ ... })`
- **What:** which release type a listing really supports, or null.
- **Why so careful:** NPPA lists Glycomet GP (slow), Metolar XT (extended) and Ecosprin (coated) all as "TABLET". So "TABLET" means plain only if nothing else is possible.

| Function | What | Why |
|---|---|---|
| `brandKey(formulation, brand)` | Identity of a brand | |
| `titleCase(s)` | "TELMA H" → "Telma H" | |
| `brandPriceAdapter` | The adapter | |
| `prepare(rows)` | Which brands also list their own SR or ER | Then their "TABLET" is the plain one |
| `parseRow(...)` | "TELMA 40 MG TABLET 15" → brand, strength, pack | Refuses liquids (no volume), dispensing packs over 150, and prices above ceiling + 5% GST (with 1% allowed for rounding) |
| `snapshot`, `loadCurrent`, `commit` | As above | *verified* only if the release type is known. Manufacturer stays empty: NPPA does not name it |

## index.js

[Source](../../db/importers/index.js)

| Name | What |
|---|---|
| `ADAPTERS` | Source id → adapter |
| `COMMAND_NAMES` | `ja`, `pmbi`, `nppa`, `brands`, `brand-prices` → source id |
