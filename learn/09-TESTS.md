# 9. Tests

A test is a small program that checks another program. Run all of them:

```bash
npm test
```

Result on 25 November 2026: **60 of 60** front-end and **126 of 126** server tests pass.

## Two groups

| Group | File | Runs in |
|---|---|---|
| Front end | [tests/core.test.js](../tests/core.test.js) | Node, and the browser at `/tests/` |
| Server | [tests/server/](../tests/server/) | Node only, with PGlite (no Supabase needed) |

**Why two:** front-end code is also checked in a real browser. The server tests use Node's own test tool.

## What each file checks

| File | Checks |
|---|---|
| `core.test.js` | Savings maths, roles, basket, storage, cards, PRD wording |
| `server/pharma.test.js` | Reading strengths, salts, forms, release types, packs |
| `server/match.test.js` | Every matching rule |
| `server/search.test.js` | Brand and salt search give the same comparison |
| `server/results.test.js` | What a result carries, formulation key, strip check |
| `server/import.test.js` | CSV, PDF, download, staging, approving, guards |
| `server/nppa.test.js` | NPPA units, dates, PDF layout |
| `server/brandPrices.test.js` | Brand listings and release type rules |
| `server/api.test.js` | Every address, bad input, rate limit |
| `server/database.test.js` | Tables, seed, security, what the server may serve |
| `server/checks.test.js` | Old data warnings, April revision |

## Tests that came from real bugs

| Bug | Test that stops it coming back |
|---|---|
| Basket erased by an old tab | "basket storage: a page still open from the previous version cannot wipe the basket" |
| Slow release read as plain | "release types: the spellings found in the PMBI list are not mistaken for plain tablets" |
| Crocin 500mg found Lincomycin | "'Crocin 500mg' finds Crocin and paracetamol 500 mg only…" |
| Combinations crowded the list | "searching a salt lists the single-salt medicines before the combinations" |
| Demo prices shown | "a demo brand has no price: the illustrative value is never served…" |

## Functions in the test helpers

### [tests/harness.js](../tests/harness.js)
| Function | What | Why |
|---|---|---|
| `createHarness()` | Gives `test` and `run` | Works in Node and in the browser, with no package to install |
| `test(name, fn)` | Adds a test to the list | |
| `assert.equal(a, b)` | Fails if not the same | |
| `assert.deepEqual(a, b)` | Compares whole objects, as JSON | |
| `assert.ok(v)` | Fails if false | |
| `run()` | Runs all, collects pass or fail | One failure does not stop the others |

### [tests/run-node.js](../tests/run-node.js)
No functions. Loads the sample data, runs the tests, prints ✓ or ✗, and ends with exit code 1 if any failed (so GitHub knows).

### [tests/index.html](../tests/index.html)
The same tests, shown as a list in the browser.

### [tests/helpers/makePdf.js](../tests/helpers/makePdf.js)
| Function | What | Why |
|---|---|---|
| `makePdf(pages)` | Writes a tiny PDF by hand | Tests need PDFs without using real government files |
| `esc(s)` | Protects brackets and backslashes | They have a meaning inside a PDF |

### [tests/helpers/nppaFixture.js](../tests/helpers/nppaFixture.js)
| Function | What | Why |
|---|---|---|
| `nppaPdf(prices)` | A PDF laid out like NPPA's real list, with invented test prices | The layout was copied from a real list, so the reader is really tested |
| `header(y)`, `row(...)` | Place the text of one header or row | |

Next: [10-COMMANDS-AND-DEPLOY.md](10-COMMANDS-AND-DEPLOY.md)
