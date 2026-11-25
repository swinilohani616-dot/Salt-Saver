# 5. Bugs and decisions

## Bugs, their real cause, and the fix

| # | What was seen | Real cause | Fix | Step |
|---|---|---|---|---|
| 1 | Added items vanished from the basket | Saved data changed shape but kept its name. An old open tab erased the new lines | New name `basket3` (now `basket4`). Reading never writes | [15](04-MY-STEPS.md#step-15) |
| 2 | Clicks on "Add" did nothing after a few adds | Pop-up messages lay over the buttons | Messages ignore clicks, do not pile up, moved left | [15](04-MY-STEPS.md#step-15) |
| 3 | Price typed later did not reach the basket | Nothing connected the two | `applyReference`, later `applyBrandReference` | [15](04-MY-STEPS.md#step-15) |
| 4 | Crocin and Paracetamol gave different pages | Two search paths, two card designs | One search, one card | [20](04-MY-STEPS.md#step-20) |
| 5 | Brands always "Price unavailable" | No importer stored brand prices | `brandPrices.js` | [20](04-MY-STEPS.md#step-20) |
| 6 | "Crocin 500mg" found Lincomycin 500mg | Strength treated as a word | `parseQuery` separates strength from name | [20](04-MY-STEPS.md#step-20) |
| 7 | Paracetamol 650 missing from results | Combination medicines filled the list | Single-salt medicines first | [14](04-MY-STEPS.md#step-14) |
| 8 | Slow-release medicines stored as plain | Spellings "relase", "resistance" unknown | Read them. Unknown wording is never plain | [19](04-MY-STEPS.md#step-19) |
| 9 | Cards looked different | Copied card code in several places | One model, one template | [18](04-MY-STEPS.md#step-18) |
| 10 | Database login failed | The link in `.env` was not URL-encoded | URL-encode special characters in the link | [9](04-MY-STEPS.md#step-9) |
| 11 | No keyboard focus ring | Bootstrap hid it, another rule removed the replacement | One clear ring for everything | [5](04-MY-STEPS.md#step-5) |
| 12 | Basket lost between pages when storage is blocked | Fallback was memory only | sessionStorage fallback | [4](04-MY-STEPS.md#step-4) |
| 13 | Keyboard reached an invisible search box | It fades in at the end of the scroll | Focus jumps to the end | [11](04-MY-STEPS.md#step-11) |
| 14 | Capsule covered the text | It travelled while text was on screen | It moves only between texts | [11](04-MY-STEPS.md#step-11) |
| 15 | Phone basket bar broke onto two lines | Too wide | Layout fixed | [3](04-MY-STEPS.md#step-3) |

**Still open:** importing a second brand review file hides the brands of the first one. See [brands.js](functions/10-db-importers.md#brandsjs). It was found while writing these notes and is not fixed.

## Decisions and the reason

| Decision | Reason |
|---|---|
| Money in **paise** (whole numbers) | Computers get decimals slightly wrong: 0.1 + 0.2 is not exactly 0.3 |
| Percent **rounded down** | Never promise more than the truth, and it gives the PRD's 81% |
| Price **per unit** before comparing | A strip of 15 and a strip of 10 are not the same amount |
| Functions return `{ok, data}` or `{ok, error}` | Every caller handles errors the same way |
| Role checked in the screen **and** in the service | The screen is never the only guard |
| Data from storage is checked again | A user can edit it |
| No `innerHTML` with data | Stops harmful text becoming code |
| Old prices are **retired**, not overwritten | Price history stays |
| Missing products are **deactivated**, not deleted | Nothing is lost by mistake |
| A person approves every import | A wrong file could damage all prices |
| File **checksum** | The same file is never imported twice by accident |
| Refuse if too many products would disappear | A partial file would otherwise hide real medicines. The limit is 20% of the list, and at least 20 products |
| Unknown release type stays unknown | Guessing "plain" could compare the wrong medicine |
| Liquids need "per ml" | "120 mg" means nothing without the volume |
| Cheapest brand pack is the reference | A saving is never made to look bigger |
| A price **you type** beats the listed price | You know what you pay |
| Typed prices stay in the browser tab | Privacy, and they are not official |
| Demo prices are never sent to the browser | They were made up |
| Price above the legal ceiling + 5% GST is refused | It is out of date or wrong |
| Combinations folded below single salts | Easier to read |
| One SQL question per search | The link to Supabase can be slow, so fewer trips are better |

## Things that were tried and dropped

| Tried | Why it was dropped |
|---|---|
| Searching in the browser | Cannot hold thousands of medicines or match safely |
| Salt index (text match) | Treated SR and plain tablets as equal |
| Compare panel (second screen) | Gave different results from the search |
| Calling PMBI's private API | Not permitted, undocumented, and the site is fragile |
| Colours from a Dribbble page | The site blocks automatic reading |
| Centred landing page | You asked for it back as it was |
| Instrument Serif italic font | You asked for a more professional font |

## Code that is still there but not used by the pages

Good to know before a viva. These are used only by tests, or by nothing.

| Code | State |
|---|---|
| `basketSummary`, `unitSaving`, `savingPercent`, `lineSaving` in `js/core/savings.js` | Version 1 maths. Tests only. `toPaise` from the same file **is** used everywhere |
| `validateDb` in `js/core/validate.js` | Tests only |
| `saltKey`, `isValidMedicine` | Used by the demo import only |
| `escapeHTML`, `savingForUnits`, `sourceInfo`, `formatComposition`, `parseStrength`, `parseStrengthList`, `resolverDataFromCurated` | Tests only |
| `getBasket`, `isSolidOral`, `normalizeSaltForm`, `escapeRegExp` | Not used anywhere |
| `STORAGE_KEYS.db`, `SEARCH.maxResults` | Left from version 1 |
| `GET /api/medicines`, `GET /api/products/:id/alternatives` | Work and are tested, but no page calls them now |
| `<div id="load-error">` in the HTML | No code shows it now |

Next: [06-DATABASE.md](06-DATABASE.md)
