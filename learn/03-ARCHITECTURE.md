# 3. Architecture

Architecture means: which parts exist, what each one is allowed to do, and how they talk.

## The big picture

```
   YOUR BROWSER                        THE SERVER                  THE DATABASE
┌───────────────────┐   question   ┌──────────────────┐   SQL   ┌────────────────┐
│ index.html        │ ───────────► │ Express          │ ──────► │ Postgres       │
│ search.html       │  /api/search │ server/app.js    │         │ (Supabase)     │
│ cart.html         │ ◄─────────── │                  │ ◄────── │ 20 tables      │
└───────────────────┘     JSON     └──────────────────┘   rows  └────────────────┘
  basket and typed                   reads only                        ▲
  prices stay here                                                     │ approved
                                                                       │ changes only
                             ┌─────────────────────────────────────────┴──┐
                             │ Import commands (you run these)            │
                             │ official file → read → compare → report    │
                             │ → YOU APPROVE → save                       │
                             └────────────────────────────────────────────┘
```

Three facts to remember:

1. **The website only reads the database.** Searching can never change it.
2. **The website never contacts a government site.** Searches read SaltSaver's own copy.
3. **Data enters only by the import path,** and only after a person approves.

## The front end has four layers

```
   js/ui        draws the screen, listens to clicks
     │  ▲
     ▼  │
   js/state     one object that holds "what is happening now"
     │  ▲
     ▼  │
   js/services  talks to the server and to browser storage
     │
     ▼
   js/core      pure rules and maths (no screen, no storage)
     │
     ▼
   lib/pharma   medicine rules, shared with the server
```

**The rule:** a layer may use layers below it, never above. `js/core` does not know that a screen exists.

**Why (Design choice, Step 1):** pure code can be tested alone, without a browser. That is how the PRD's "100% accurate salt matching and price math" is shown. It also meant the server could reuse the same files later.

## The folders

| Folder | Job | Runs in |
|---|---|---|
| [js/ui/](../js/ui/) | Draws cards, basket, pop-ups | Browser |
| [js/state/](../js/state/) | Shared state | Browser |
| [js/services/](../js/services/) | API calls, storage, basket | Browser |
| [js/core/](../js/core/) | Rules and maths | Browser (and partly server) |
| [lib/pharma/](../lib/pharma/) | Reads medicine names, matches medicines | **Both** |
| [lib/import/](../lib/import/) | Reads CSV and PDF, downloads | Server side |
| [server/](../server/) | API and database connection | Server |
| [db/](../db/) | Tables, imports, matching | Server side |
| [scripts/](../scripts/) | Commands you type | Your terminal |
| [api/](../api/) | Entry point for Vercel | Vercel |
| [tests/](../tests/) | Checks | Terminal and browser |

---

## Flow 1: searching "Crocin"

What happens, in order, with the function names.

| # | Where | Function | What happens |
|---|---|---|---|
| 1 | Browser | `mountSearchView` | You type. It waits 250 ms after your last key (this is called *debounce*) |
| 2 | Browser | `runSearch` | Checks for at least 2 letters and shows "Searching…" |
| 3 | Browser | `searchCatalog` → `apiGet` | Asks `/api/search?q=Crocin`. Cancels an older search still running |
| 4 | Server | `rateLimit`, `readQuery` | Checks you are not sending too many, and the text is safe |
| 5 | Server | `parseQuery` | Splits the text into name, strength, form, release type |
| 6 | Server | `searchProducts` | **One** SQL question finds the brands, and the generics with the same salts |
| 7 | Server | `groupProducts` | Puts medicines of the same formulation together |
| 8 | Server | `compareProducts` | Decides if each generic matches each brand |
| 9 | Server | `productSummary` | Picks what may be shown. Demo prices are dropped here |
| 10 | Browser | `compareResults` | Works out every saving at once |
| 11 | Browser | `medicineCardModel` | Decides what each card says |
| 12 | Browser | `medicineCard` | Draws each card |

Salt search ("Paracetamol") takes exactly the same path. That was the point of [Step 20](04-MY-STEPS.md#step-20).

## Flow 2: pressing "Add to Comparison Basket"

```
handleAdd              (js/ui/searchView.js)      finds the saving for this card
  → comparisonLine     (js/core/comparison.js)    builds one basket line
  → addComparison      (js/services/basketService.js)
       checkRole                                  Pharmacy Buyer is refused
       isValidBasketItem                          is the line complete?
       already there? → do nothing twice
  → persist → setJSON                             saved in localStorage
  → setState({ basket })                          tells everybody
       → cart badge number goes up
       → the button turns into "Added ✓"
```

## Flow 3: opening the basket page

```
boot             reads role, settings and basket from storage
mountBasketView  draws the basket
refreshPrices    asks /api/products?ids=... for today's prices
basketTotals     adds up: reference, alternative, saving
render           shows it; if the server is down, it uses saved prices and says so
```

## Flow 4: importing an official list

```
npm run import:ja -- --file list.csv
  → stageImport     fingerprint of the file (checksum): seen before? then stop
  → readTable       CSV or PDF → rows
  → parseRow        each row: code, name, price. Cannot read it? Mark it failed
  → computeDiff     new / changed / removed, compared with the database
  → buildReport     a report for you to read
  (nothing in the catalogue has changed yet)

npm run import:approve -- 3 --by "Your name"
  → approveImport   checks again, then saves everything in ONE transaction
```

A *transaction* means all or nothing. If one part fails, nothing is saved.

## Flow 5: start-up of a page

```
boot()  in js/app.js
  1 initStorage      does localStorage work? if not, use memory and show a banner
  2 initStore        create the state
  3 mount...         connect buttons, badge, search or basket
  4 loadDataStatus   ask /api/status: which lists are loaded, how old
  5 setState ready   show the page
  6 no role saved?   open the role pop-up
```

---

## How matching decides

This is the heart of the project: [lib/pharma/match.js](../lib/pharma/match.js).

| Check | If it fails |
|---|---|
| Same salts, no more and no fewer | Not equivalent |
| Same strength of each salt | Not equivalent |
| Same form (tablet, capsule, syrup…) | Not equivalent, or needs review if related (tablet and dispersible tablet) |
| Same route (mouth, eye, skin…) | Not equivalent |
| Same release type (plain, SR, ER…) | Not equivalent |
| Release type known on both sides | Needs review |
| Same salt form when both state it | Needs review |
| Everything needed is known | Not enough data |

Four results: **verified_match**, **needs_review**, **not_equivalent**, **insufficient_data**. A saving is shown only for a verified match.

Two names that look alike never make a match. Only the parsed contents count.

## How state works

There is one object, in [store.js](../js/state/store.js):

```
state = { status, role, prefs, search, basket, references, entered, storageFallback }
```

- `setState({ basket })` changes a part and tells everyone who subscribed.
- Each screen part redraws only if *its* part changed.

This is a small version of what Redux does in React projects.

## How data is kept safe

| Danger | Protection |
|---|---|
| Harmful text in a medicine name | Text is set with `textContent`, never `innerHTML` ([dom.js](../js/ui/dom.js)) |
| Password leaking | Only in `.env` on the server. `.env` is not in Git |
| Someone reading the database directly | Row level security on every table, with no rules that allow access |
| Edited browser storage | Everything read from storage is checked again |
| Too many requests | 60 per minute per address ([rateLimit.js](../server/rateLimit.js)) |
| SQL injection | Values are sent separately as `$1`, `$2`, never pasted into the SQL |
| Wrong list imported | Review step, checksum, large-removal guard |
| Server code being downloaded | Only a fixed list of files and folders is served |

## Old documents

[ARCHITECTURE.md](../ARCHITECTURE.md), [USER_WORKFLOW.md](../USER_WORKFLOW.md) and [docs/DIAGRAMS.md](../docs/DIAGRAMS.md) describe **version 1**, which had no server. They are kept as history, with a note at the top. The current design is in [docs/DATA_ARCHITECTURE.md](../docs/DATA_ARCHITECTURE.md).

Next: [04-MY-STEPS.md](04-MY-STEPS.md)
