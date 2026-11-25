# Function notes 8: server (the API)

| File | Job | Made in |
|---|---|---|
| [app.js](#appjs) | All addresses | Step 8 |
| [catalog.js](#catalogjs) | Questions to the database | Step 10 |
| [db.js](#dbjs) | Connection | Step 8 |
| [medicines.js](#medicinesjs) | Demo data in the old shape | Step 8 |
| [pgliteDb.js](#pglitedbjs) | Local database | Step 8 |
| [rateLimit.js](#ratelimitjs) | Not too many requests | Step 10 |
| [start.js](#startjs) | `npm start` | Step 8 |

---

## app.js

[Source](../../server/app.js)

**File history:** Step 8: `/api/medicines`. Step 10: search, suggest, products, alternatives, status. Step 11: serves the new pages. Step 14: salts, formulation key, price and pack. Step 18: pack and update date. Step 20: `/api/search` answers in groups.

### `HttpError` (class)
- **What:** an error meant for the user, with status and code (`constructor` stores them).
- **Why:** any other error is hidden behind a 503.

### `apiError(res, status, code, message)`
- **What:** sends an error in the one shape.

### `readQuery(req)`
- **What:** 2 to 60 characters, safe characters only.
- **Why:** input checking, from section 10 of your plan.

### `readId(value)`, `readRelease(value)`
- **What:** only digits, or only a known release code.
- **Why:** wrong input gives a 400, never a crash.

### `verifiedPrice(price)`
- **What:** the price, only if an official list or a checked pack vouches for it.
- **Why:** demo prices stop here.

### `manufacturerOf(p)`
- **What:** the maker, but not "Sample Pharma".
- **Why:** that is a placeholder in the demo data.

### `comparisonFields(p)`
- **What:** salts, formulation key, price, price status, packs.
- **Why:** all the browser needs for a saving.

### `productSummary(p)`
- **What:** what the public may see of a product.
- **Why:** a list of allowed fields is safer than hiding some.

### `createApp({ db, serveStatic, ... })`
- **What:** builds the Express app with all addresses.
- **Why a function:** tests make an app with a test database, Vercel makes one without static files.

| Inside | What | Why |
|---|---|---|
| `cachedStatus()` | Status, kept for 60 seconds | Fewer database trips |
| `sourceBrief(sources, id)` | Short version of a source | |
| `handle(fn)` | Wraps every address: catches errors | No address can crash the server |

`PUBLIC_FILES` and `PUBLIC_DIRS` list what may be served. `server/`, `db/` and `.env` are not in it. `learn/` is not either.

## catalog.js

[Source](../../server/catalog.js)

**File history:** Step 10. Step 14: one trip per search, single salts first. [Step 20](../04-MY-STEPS.md#step-20): search rewritten.

| Function | What | Why |
|---|---|---|
| `sourceStatus(db, now)` | Age of each source, and if it is too old | 60, 400 or 90 days |
| `dataCounts(db)` | How many products and prices | Shows if real data is loaded |
| `baseName(column)` | "telma h 40 12.5mg" → "telma h" (in SQL) | To see if an official record replaces a demo one |
| `likeWord(w)` | Pattern for "a word starts with" | |
| `numberPattern(n)` | Pattern for "this number alone" | 50 must not match 500 |

### `searchProducts(db, query, { limit })`
- **What:** one large SQL question: hits, or similar names if none, plus generics with the same salts as each brand.
- **Why one:** the link to Supabase can be slow, so one trip is better than three.

### `narrow(products, q)`
- **What:** drops half-fitting results when complete ones exist (`prefer` does one rule).
- **Why:** "Telma 40" should not show Telma H 40/12.5.

| Function | What | Why |
|---|---|---|
| `compositionLabel(ingredients)` | "Amoxycillin 500 mg + …" | |
| `suggest(db, query)` | Names while typing | "acetaminophen = Paracetamol" |
| `ceilingsForGroups(db, groups)` | Legal maximum for many groups | One question for all |
| `ceilingsFor(db, product)` | For one product | Uses the function above |

## db.js

[Source](../../server/db.js). Step 8.

| Function | What | Why |
|---|---|---|
| `wrapPg(client)` | Gives `query` and `exec` | Supabase and PGlite look the same to the rest |
| `sslConfig(env)` | Encryption setting | Wrong values stop the start |
| `stripSslMode(url)` | Removes `sslmode` from the link | It would override our setting |
| `createPgDb({ ... })` | Pool with 10-second limits and `transaction` | A lost connection must not crash the server |
| `MissingDatabaseUrlError` | Helpful error (its `constructor` holds the text) | Tells you what to do |
| `createDbFromEnv(env, { max })` | Uses `DATABASE_URL` | The password is only in the environment |
| `loadEnvFile()` | Reads `.env` if there is one | |

## medicines.js

[Source](../../server/medicines.js). Step 8.

### `loadLegacyMedicines(db)`
- **What:** the 28 demo medicines in the old JSON shape.
- **Why:** phase 2 had to behave "exactly as before". No page uses it now, tests do.

## pgliteDb.js

[Source](../../server/pgliteDb.js). Step 8.

### `createPgliteDb(dataDir)`
- **What:** Postgres inside Node. `wrap` gives it the same interface as `db.js`.
- **Why:** tests and `npm run dev:local` need no account.

## rateLimit.js

[Source](../../server/rateLimit.js). Step 10 (phase 7).

### `rateLimit({ windowMs, max, ... })`
- **What:** counts requests per address. Over 60 a minute → 429.
- **Why:** protects the free database. On Vercel each copy counts for itself.

## start.js

[Source](../../server/start.js). Step 8. No functions. Loads `.env`, connects, starts on port 3000, and closes cleanly on `Ctrl + C`.
