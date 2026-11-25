# Function notes 2: js/core (rules and maths)

Nothing here touches the screen or the storage. That makes every function easy to test.

| File | Job | Made in |
|---|---|---|
| [normalize.js](#normalizejs) | Clean text | Step 3 |
| [errors.js](#errorsjs) | One shape for results | Step 3 |
| [roles.js](#rolesjs) | Who may do what | Step 3 |
| [sanitize.js](#sanitizejs) | Safe text and ₹ | Step 3 |
| [savings.js](#savingsjs) | Version 1 maths | Step 3 |
| [unitSavings.js](#unitsavingsjs) | Price per tablet, checks | Step 10 |
| [validate.js](#validatejs) | Check all input | Step 3 |
| [labels.js](#labelsjs) | Words for codes | Step 10 |
| [comparison.js](#comparisonjs) | All savings | Step 14 |
| [basketMath.js](#basketmathjs) | Basket totals | Step 10 |
| [cardModel.js](#cardmodeljs) | What a card says | Step 18 |

**Deleted:** `search.js` and `saltIndex.js` (Step 10). Search moved to the server, with safe matching.

---

## normalize.js

[Source](../../js/core/normalize.js). Not changed since Step 3. The server uses it too.

### `normalizeText(value)`
- **What:** `"  Crocin-500 MG "` becomes `"crocin 500mg"`.
- **Why:** people type the same thing in many ways.

### `saltKey(activeSalt)`
- **What:** sorts the parts, so `A + B` and `B + A` are the same.
- **Why:** version 1 used it to find "same salt".
- **Changed:** now only the demo import uses it. Real matching uses `compositionKey`.

## errors.js

[Source](../../js/core/errors.js). Not changed since Step 3.

| Name | What | Why |
|---|---|---|
| `ERR` | List of error codes | No spelling mistakes |
| `ok(data)` | `{ ok: true, data }` | Every service answers in this shape |
| `fail(code, message)` | `{ ok: false, error }` | The caller always checks `.ok` |

## roles.js

[Source](../../js/core/roles.js). Step 13 changed the descriptions to PRD wording.

| Name | What | Why |
|---|---|---|
| `ROLES` | The three roles with text | PRD section 4 |
| `DEFAULT_ROLE` | `patient` | Used if the pop-up is closed without choosing |
| `isValidRole(role)` | Is it a real role? | Saved data may be edited |
| `can(role, capability)` | May this role do this? | One table decides, not scattered `if`s |

## sanitize.js

[Source](../../js/core/sanitize.js). Not changed since Step 3.

| Name | What | Why |
|---|---|---|
| `escapeHTML(value)` | Turns `<` into `&lt;` and so on | A safety net. Only tests use it, because the page never uses `innerHTML` |
| `formatINR(paise)` | `245000` → `₹2,450.00` | Indian digit grouping, always two decimals |

## savings.js

[Source](../../js/core/savings.js). The file did not change, but the app stopped using most of it.

### `toPaise(rupees)`
- **What:** 108.36 → 10836.
- **Why:** whole numbers have no decimal errors. **Used everywhere.**

### `unitSaving(medicine)`, `savingPercent(medicine)`, `lineSaving(medicine, quantity)`, `basketSummary(items, medicinesById)`
- **What:** version 1 savings: brand price minus generic price, percent rounded down, times quantity, and basket totals.
- **Why:** FR-02, FR-03 and BR-01 in the PRD.
- **Changed:** they need brand and generic prices in one demo record. Real data has separate products with different packs, so `comparison.js` and `basketMath.js` replaced them. Only tests use these now.

## unitSavings.js

[Source](../../js/core/unitSavings.js). Made in Step 10 (phase 7).

| Constant | What | Why |
|---|---|---|
| `MRP_LIMITS`, `COUNT_LIMITS` | Smallest and largest allowed | Catch typing mistakes |
| `GST_RATE_FOR_CEILING_CHECK` | 0.05 | An MRP includes tax, a ceiling does not |

### `validateMrp(value)`
- **What:** reads `"₹ 32.50"` or `"1,250"` as a number, or gives a friendly message.
- **Why:** people copy the price as printed.

### `validatePackCount(value)`
- **What:** the same for "how many tablets".
- **Why:** dividing by zero or by text must be impossible.

### `perUnitPaise(mrpRupees, count)`
- **What:** price of one tablet, in paise (may have fractions).
- **Why:** rounding happens only when showing.

### `compareUnitPrices({ status, original, alternative })`
- **What:** the basic comparison. Gives both unit prices, saving and percent, or a reason why not (`not_verified`, `no_price`, `units_differ`).
- **Why:** one place refuses unsafe comparisons: not verified, no price, or tablets against ml.

### `savingForUnits(savingPerUnit, units)`
- **What:** saving for a number of units.
- **Why:** made in Step 10. Only tests use it now.

### `ceilingCheck(entered, ceiling, gstRate)`
- **What:** is your price above the legal maximum plus GST?
- **Why:** you asked for this warning in Step 7.

Small helper: `fail(message)` makes `{ ok: false, message }`.

## validate.js

[Source](../../js/core/validate.js)

**File history:** Step 3 made it. Step 10: basket lines became full lines, not just an id. Steps 14 and 15: reference price optional, strength saved. Step 20: remembers where the reference price came from.

| Function | What | Why |
|---|---|---|
| `validateQuantity(value)` | Whole number, 1 to 999 | PRD: quantity 0 is blocked |
| `isText(v)`, `isPrice(v)`, `isId(v)`, `isPositive(v)`, `isMissing(v)` | Tiny checks | Make the rules below easy to read |
| `isValidMedicine(m)` | Is a demo record complete? | Used by the demo import |
| `validateDb(db)` | Keeps good demo records, skips bad | Version 1 loading. Tests only now |
| `hasReference(i)` | Does this basket line have a price to compare with? | Lines without one are left out of the totals |
| `hasValidReference(i)` | Both numbers or none, same unit as the generic | Half a price cannot be compared |
| `isValidBasketItem(i)` | Is the whole line fine? | Storage is not trusted |
| `basketKey(i)` | `"brandId:genericId"` | The identity of a line |
| `sanitizeBasket(items)` | Drops bad lines, joins doubles, keeps only known fields | A changed or broken basket never crashes the page |

**Changed, and why:** in version 1 a line was `{ medicineId, quantityPerMonth }` and prices came from the demo file. Now a line keeps the generic, its price, your reference price, who vouches for it, and the date. `REFERENCE_SOURCES` lists who may vouch: you, NPPA, or a pack check.

## labels.js

[Source](../../js/core/labels.js). Made in Step 10, extended in Steps 13, 14 and 20.

| Name | What | Why |
|---|---|---|
| `SOURCE_LABELS`, `sourceLabel(id)` | `pmbi_product_list` → "Jan Aushadhi MRP list (PMBI)" | Codes are for programs, words are for people |
| `STRIP_CHOICES` | The answers for "what does your strip say?" | Strip check, Step 14 |
| `STATUS_LABELS` | Text, colour and icon for each match status | Same everywhere |
| `saltLabel(composition)` | "Active salt:" or "Active salts:" | Grammar |
| `hasSameSalt(alternative)` | May the BR-02 sentence be shown? | Step 13: it would be untrue if the salt form differs |
| `saltNames(p)` | "Paracetamol + Caffeine", or null | Null for devices like bandages |
| `strengthText(p)` | "500 mg + 25 mg", or null if any is missing | Half a strength is misleading |
| `formulationLabel(p)` | "Metoprolol succinate 25 mg, prolonged release (PR) tablet" | What to check on your own strip |
| `unitText(unit, count)` | "15 tablets", "30 ml" | Correct plural |
| `perUnitText(unit)` | "per tablet" | |
| `unitForForm(dosageForm)` | tablet → tablet, syrup → ml | Which unit to ask for |
| `UNIT_CHOICES` | Units in the drop-down | When the form is not known |
| `formatDate(iso)` | "24 Nov 2026", India time | |
| `formLine(p)` | "Tablet · sustained release (SR)" | Plain release is not mentioned |

`formName` and `releaseName` are passed on from `lib/pharma/match.js`.

## comparison.js

[Source](../../js/core/comparison.js)

**File history:** made in Step 14. `savingForLine` in Step 15. Rewritten in Step 20 so that one function works out every saving.

### `packSaving(reference, price)`
- **What:** the saving on **the generic's pack**. Your price is first changed to the same number of tablets.
- **Why:** different pack sizes. Gives a reason when it cannot: `no_price`, `pack_unknown`, `no_reference`, `units_differ`.
- **Example:** ₹30 for 15 becomes ₹20 for 10. Against ₹6.56 the saving is ₹13.44 (67%).

### `brandPackSaving(reference, price)`
- **What:** the same for **the pack you buy**.
- **Why:** on the brand's card you think in your own strip of 15.
- **Changed:** new in Step 20, when brand cards got savings.

### `brandReference(brand, entered)`
- **What:** the price to compare with: yours if you typed one, otherwise the verified MRP, otherwise null.
- **Why:** you know what you pay.
- **Changed:** new in Step 20, because before it brands had no price.

### `matchWith(item, brand, entered)`
- **What:** the match between one generic and one brand. If only the release type is unknown and you answered the strip question, your answer decides.
- **Why:** many brands do not record a release type. Your answer never replaces a known one.

### `compareResults(body, { entered, references })`
- **What:** works out **every** comparison of a search at once. Returns one view for each generic and each brand.
- **Why:** before Step 20, two pieces of code gave two answers. Now the brand card and the generic card always agree. With several brands, your typed price comes first, then the cheapest brand, so a saving is never made to look bigger.

### `comparisonLine(alternative, { product, reference })`
- **What:** builds a basket line. Null if the generic has no price.
- **Why:** one shape for every way of adding.

### `isInBasket(items, productId)`
- **What:** is this medicine in the basket, as generic or as brand?
- **Why:** decides "Added ✓" on both cards.

### `savingForLine(line, livePrice, reference)`
- **What:** the saving of one basket line.
- **Why:** the basket shows price, reference and saving (Step 15).

`USER_ENTERED` is the text `'user_entered'`, in one place.

## basketMath.js

[Source](../../js/core/basketMath.js). Made in Step 10. Changed in 14 (lines without reference) and 20 (verified references).

### `isUserPrice(item)`
- **What:** did the user type this reference price?
- **Why:** a typed price is never refreshed. A verified one is.

### `lineReference(item, liveReferences)`
- **What:** the reference price of a line, newer if the server has it.
- **Why:** brand prices change.
- **Changed:** new in Step 20.

### `basketTotals(items, live, liveReferences)`
- **What:** all lines, the three totals, percent, yearly saving.
- **Why:** FR-03. A line without a reference price stays out of **all three** totals, so the totals compare like with like. It is counted in `uncompared`.

## cardModel.js

[Source](../../js/core/cardModel.js). Made in [Step 18](../04-MY-STEPS.md#step-18) because brand and generic cards had different code. Changed in Step 20: price tags, brand savings.

| Function | What | Why |
|---|---|---|
| `PRICE_TAGS` | Verified price / Entered by you / No verified price | You asked to tell them apart |
| `packText(price)` | "10 tablets", or the pack as printed | |
| `packFact(p, entered)` | Pack of the price, plus "(also 30 tablets)" | Packs of one brand share a card |
| `fact(label, value, missing)` | One line of details | Missing things are named, never blank |
| `sourceText(p, entered)` | "Source, updated date" | Every price needs it |
| `perUnitLine(amount, count, unit)` | ", ₹7.22 per tablet" | |
| `priceSlot(p, entered)` | The price area | Says why when there is none |
| `badge`, `note`, `prompt` | Three kinds of saving area: a saving, a reason, or "add your price" | Same size, different content |
| `brandSlots(p, view)` | Saving and button of a brand card | Each reason has its own sentence |
| `genericSlots(p, view)` | The same for a generic card | |
| `medicineCardModel(p, view, { canAdd })` | Puts it all together | The **one** card. `canAdd` false (Pharmacy Buyer) gives a Print button |
| `NO_BRAND_VIEW`, `NO_GENERIC_VIEW` | Empty comparison | For medicines that are not compared |

Inside: `others` (other pack sizes), `blocked` (fills in the reason when the button is off).
