# Function notes 3: js/services

These files talk to the outside: the server and the browser's storage.

| File | Job | Made in |
|---|---|---|
| [api.js](#apijs) | Ask the server | Step 10 |
| [catalogService.js](#catalogservicejs) | Search, suggestions, prices | Step 10 |
| [dataService.js](#dataservicejs) | Status of the data | Step 3, rewritten |
| [storage.js](#storagejs) | Safe saving | Step 3 |
| [basketService.js](#basketservicejs) | The basket | Step 3, rewritten |
| [referenceService.js](#referenceservicejs) | Prices you type | Step 14 |

**Deleted:** `medicineService.js` (Step 10). It searched the demo file in the browser. `catalogService.js` replaced it.

---

## api.js

[Source](../../js/services/api.js)

### `ApiError` (class)
- **What:** an error with a code, a message and an HTTP status. Its `constructor` stores them.
- **Why:** the screen can show the right sentence.

### `apiGet(path, params, { signal })`
- **What:** asks the server, waits at most 15 seconds, returns JSON.
- **Why:** one place for time limits and friendly errors (offline, too many searches, server error). A request cancelled by a newer one is not an error.

## catalogService.js

[Source](../../js/services/catalogService.js)

| Function | What | Why |
|---|---|---|
| `searchCatalog(query)` | Search. Cancels the older one | While typing "cro", the answer for "cr" must not arrive later and replace it |
| `suggestNames(query)` | Suggestions, also cancels | |
| `getProducts(ids)` | Today's details, up to 50 | Refreshes basket prices |
| `isAbort(error)` | Was it cancelled by us? | Then say nothing |

**Changed:** Step 20 removed the separate request for alternatives, because a search now brings everything.

## dataService.js

[Source](../../js/services/dataService.js)

**File history:** Step 3 loaded the demo JSON and kept a copy in localStorage **forever**. Step 7 found that users would never see new prices. Step 8 loaded it from the server. Step 10: it only loads the status.

| Function | What | Why |
|---|---|---|
| `loadDataStatus({ loadStatus })` | Asks `/api/status` | `loadStatus` can be replaced in tests |
| `getDataStatus()` | The last status, or null | For the banner and the print sheet |
| `sourceInfo(id)` | One source | Tests only now |
| `resetApp(options)` | Clears this device and loads the status again | The Reset button |

## storage.js

[Source](../../js/services/storage.js)

**File history:** Step 3: localStorage, with memory if it fails (PRD section 12). Step 4: sessionStorage added, because the basket must survive moving between two pages.

| Function | What | Why |
|---|---|---|
| `getLocal()`, `getSession()` | Get the storage, or null if blocked | Some private modes throw an error just for looking |
| `readSession(key)` | Read from sessionStorage, safely | |
| `switchToMemory()` | From now on, do not use localStorage; tell listeners once | Shows the yellow banner |
| `initStorage()` | Writes and removes a test value | The only sure way to know it works |
| `isMemoryMode()` | Are we in fallback? | |
| `onFallback(fn)` | "Tell me when it happens" | |
| `getJSON(key, fallback)` | Read: memory, then session, then local | The newest copy wins. Broken data gives the fallback |
| `setJSON(key, value)` | Save. `persisted: false` means only for this tab | If storage is full, it switches |
| `remove(key)` | Delete everywhere | |
| `clearAll()` | Delete everything of SaltSaver only | Reset. Other sites' data is safe |

## basketService.js

[Source](../../js/services/basketService.js)

**File history**
| Step | Change | Why |
|---|---|---|
| 3 | Ids and quantities | PRD |
| 10 | Full lines with prices | Prices no longer sit in a demo file |
| 14 | `addComparison`, `setReference` | Comparison basket |
| [15](../04-MY-STEPS.md#step-15) | Reading never writes; `applyReference` | Bug: items vanished |
| 20 | `applyBrandReference`, reference source | Verified brand prices |

| Function | What | Why |
|---|---|---|
| `snapshot()` / `getBasket` | A copy of the basket. `getBasket` is not used now | Nobody can change the real one by accident |
| `persist()` | Saves it | Only after a change by the user |
| `checkRole()` | Error if the role may not use the basket | The second guard, behind the screen |

### `initBasket(roleGetter)`
- **What:** loads the saved basket: the new name first, then older names.
- **Why:** old baskets are not lost.
- **Changed (Step 15):** version 1 also saved right after loading. A page that did not understand the lines then erased them. **Now reading never writes.**

### `addToBasket(line, qty)`
- **What:** checks role, quantity and line; joins with an existing one.
- **Why:** base for adding.

### `addComparison(line)`
- **What:** adds a medicine **once**. If it is there already, only a missing reference price or brand name is filled in.
- **Why:** you asked "Prevent duplicate entries". A price you typed is kept.

### `setReference(key, { mrp, count })`
- **What:** your price, typed on the basket page.
- **Why:** refused if strength, form, release or pack is unknown, because it could not be compared safely.

### `applyReference(formulationKey, reference)`
- **What:** a price typed on the search page reaches the same medicine in the basket.
- **Why:** Step 15: it did not arrive before. Lines from a brand keep that brand's price.

### `applyBrandReference(productId, reference)`
- **What:** the same for a brand. With null, the price is removed but the generic stays.
- **Why:** Step 20.

| Function | What | Why |
|---|---|---|
| `updateQuantity(key, qty)` | Packs per month | |
| `removeFromBasket(key)` | Removes, and returns the line and its place | For Undo |
| `restoreItem({ item, index })` | Puts it back in the same place | Undo |
| `clearBasket()` | Empties it | |
| `resetBasketMemory()` | Forgets without saving | Reset already cleared storage |
| `calculateTotalSavings(live, liveRefs)` | Totals, or "empty" error | Calls `basketTotals` |

`basketKey` is passed on from `validate.js`.

## referenceService.js

[Source](../../js/services/referenceService.js). Made in Step 14. Step 20 added prices **per brand**.

Two kinds of typed price: `references` (per formulation, typed on a generic) and `entered` (per brand: price, strip answer, or both). Kept in this tab only and never sent to the server.

**Why so private:** your plan (Step 7) said a typed price must not become a catalogue price.

| Function | What | Why |
|---|---|---|
| `isPositive`, `isReference`, `isStripOnly`, `isValid` | Is it a proper price, or only a strip answer? | A strip answer without a price is allowed for brands |
| `clean(kind, r)` | Keep only known fields | Nothing else from storage reaches the page |
| `read(kind)`, `write(kind, next)` | Session storage, with memory as backup | |
| `getReferences()`, `getEntered()` | All typed prices, checked again | |
| `save(kind, key, value)` | Save, or remove with null | |
| `saveReference(key, ref)`, `saveEntered(id, entered)` | Public versions | |
| `clearReferences()` | Forget all | Reset |
