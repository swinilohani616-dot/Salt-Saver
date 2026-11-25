# Function notes 4: js/ui (drawing the screen)

| File | Draws | Made in |
|---|---|---|
| [dom.js](#domjs) | Helpers for all others | Step 3 |
| [alerts.js](#alertsjs) | Messages and confirm pop-up | Step 3 |
| [stepper.js](#stepperjs) | − 1 + buttons | Step 3 |
| [a11yControls.js](#a11ycontrolsjs) | Text size, contrast | Step 3 |
| [roleSelector.js](#roleselectorjs) | Role pop-up | Step 3 |
| [cartBadge.js](#cartbadgejs) | Cart number | Step 4 |
| [dataBanner.js](#databannerjs) | Notice about the data | Step 10 |
| [searchView.js](#searchviewjs) | Search page | Step 3 |
| [resultGroup.js](#resultgroupjs) | One group of results | Step 20 |
| [medicineCard.js](#medicinecardjs) | The card | Step 3, rewritten 18 |
| [referenceForm.js](#referenceformjs) | "The price you pay now" | Step 14 |
| [basketView.js](#basketviewjs) | Basket page | Step 3 |
| [printView.js](#printviewjs) | Printed sheets | Step 3 |

**Deleted in Step 20:** `productCard.js` and `comparePanel.js` (both made in Step 10). They were a second way to show the same thing, and gave different results.

---

## dom.js

[Source](../../js/ui/dom.js). Not changed since Step 3.

| Function | What | Why |
|---|---|---|
| `el(tag, props, ...children)` | Makes an element. `el('p', { class: 'x' }, 'Hi')` | Text is always text, never HTML. This prevents XSS |
| `append(node, children)` | Adds children, skips null and false | Allows `condition && el(...)` |
| `icon(name)` | A Bootstrap icon, hidden from screen readers | Decoration should not be read aloud |
| `clear(node)` | Removes all children | |
| `renderInto(container, ...children)` | Replaces content but **keeps keyboard focus** | Without it, focus is lost after every redraw |
| `$(selector, root)` | Short for `querySelector` | |

## alerts.js

[Source](../../js/ui/alerts.js)

**Changed (Step 15):** messages covered the Add buttons. Now a new message replaces the old one of the same `group`, and CSS lets clicks pass through.

| Function | What | Why |
|---|---|---|
| `toast(message, options)` | A small message, with an optional button like Undo | Errors use `role="alert"` so screen readers say them at once |
| `showStorageBanner()` | The yellow "storage is full" line | PRD section 12 |
| `confirmDialog({ ... })` | Asks, and returns true or false | Inside it, `onOk` remembers that you confirmed |

## stepper.js

[Source](../../js/ui/stepper.js). Not changed since Step 3.

### `stepper({ id, value, label, ... })`
- **What:** − number + with large buttons.
- **Why:** 44 px targets for seniors. Enter saves.

## a11yControls.js

[Source](../../js/ui/a11yControls.js). Not changed since Step 3.

| Function | What | Why |
|---|---|---|
| `applyPrefs(prefs)` | Sets size and contrast on the page | |
| `updatePrefs(patch)` | Saves and tells the state | |
| `stepFont(direction)` | One size up or down | Stops at the ends |
| `mountA11yControls()` | Connects the buttons | |

## roleSelector.js

[Source](../../js/ui/roleSelector.js). Step 13 changed words only.

| Function | What | Why |
|---|---|---|
| `mountRoleSelector()` | Connects the pop-up. Closed without choosing → Patient | A role is always set |
| `openRoleSelector()` | Opens it | First visit, and after Reset |
| `renderOptions()` | Draws the three choices | |
| `setRole(roleId, { silent })` | Saves the role | |
| `renderRoleButton(roleId)` | The button in the top bar | |

## cartBadge.js

[Source](../../js/ui/cartBadge.js). New in [Step 4](../04-MY-STEPS.md#step-4). Step 13 changed words.

| Function | What | Why |
|---|---|---|
| `bump(badge)` | Small pulse | Step 5: you asked for a subtle badge animation |
| `render(state)` | Number and label. Hidden for Pharmacy Buyer | Has no cart of its own, reads the store |
| `mountCartBadge()` | Connects it | |

## dataBanner.js

[Source](../../js/ui/dataBanner.js). New in Step 10. [Step 12](../04-MY-STEPS.md#step-12) softened the words. Step 20 added brand prices.

| Function | What | Why |
|---|---|---|
| `renderDataBanner()` | Notice if the server is down, data is missing or old | Never hide that data is old |
| `renderFooterSources(status)` | "Prices: … updated 24 Nov 2026" | Every source needs a date |

## searchView.js

[Source](../../js/ui/searchView.js)

**File history:** Step 3. Step 4: remembers the last search. Step 5: how-it-works box. Step 10: asks the server. Step 11: reads `?q=` from the landing page. Step 14–15: prices and basket. Step 20: one answer for everything; compare panel removed.

| Function | What | Why |
|---|---|---|
| `session.get`, `session.set` | Small safe sessionStorage | May be blocked |
| `mountSearchView()` | Connects input, form, chips and state | A basket change redraws **only the buttons**, so a half-typed price is not lost |
| `searchFor(text)` | Search from a chip | |
| `takeQueryFromUrl()` | Reads `?q=` and removes it | A reload then restores the latest search |
| `restoreLastSearch()` | Runs the handed-over or the last search | "Continue searching" comes back to the same results |
| `updateSuggestions(raw)` | Fills the suggestion list | Errors are ignored, it is optional |
| `runSearch(raw)` | Idle, short, loading, results, not found, error | `searchSeq` ignores late answers |
| `chip(text)` | One example button | |
| `render(state)` | Draws the state above | No animation if the results did not change |
| `errorState(message, retry)` | Message and "Try again" | |
| `step(icon, title, text)` | One step of "How SaltSaver works" | |
| `handleAdd(product)` | Adds. From a brand card it takes the best matching generic | Same saving as the card shows |
| `handleRemove(product)` | Removes, with Undo | |
| `handlePrice(product, value)` | Saves or clears your price, and updates the basket too | Step 15: it did not reach the basket |

## resultGroup.js

[Source](../../js/ui/resultGroup.js). New in [Step 20](../04-MY-STEPS.md#step-20).

| Function | What | Why |
|---|---|---|
| `priceForm(p, view, ...)` | The right form for this card | Brand and generic ask different things |
| `card(p, group, ctx)` | Model + template | |
| `list(products, ...)` | A list of cards | |
| `plural(n, one, many)` | "1 option", "2 options" | |
| `groupFacts(g)` | "Tablet · by mouth" | |
| `resultGroup(group, ctx)` | Title, brands, then generics | No extra click, as you asked |
| `resultGroups(body, ctx, query)` | All groups. Combinations are folded away | Inside it, `byName`: a brand you searched by name always stays visible |
| `otherResults(products, ctx)` | Found but not comparable | Shown, with the reason |
| `ceilings(group, ctx)` | Legal maximum, and a warning if your price is above | |
| `safetyReminder(body)` | One reminder on top | Step 20: instead of on every card. No salt sentence for devices |

## medicineCard.js

[Source](../../js/ui/medicineCard.js)

**File history:** Step 3: card for one demo record (brand and generic price side by side). Step 18: rewritten as the only card. Step 20: price tags and strip check.

| Function | What | Why |
|---|---|---|
| `actionSlot(card, ...)` | The button. `draw` puts the button and the row under it | The row is always there, so buttons line up. `slot.refresh` redraws only this |
| `editLink(card, label, onClick)` | Small link like "Use my price" | |
| `priceSlot(card, ...)` | Price, pack, who vouches | |
| `savingSlot(card, ...)` | Saving, or the reason, or a link | |
| `medicineCard(card, options)` | The whole card | Left: details. Right: price, saving, button |
| `closeForm()`, `onEditPrice()` | Open and close your price form | Focus goes to the right place |

## referenceForm.js

[Source](../../js/ui/referenceForm.js). New in Step 14. Step 20: works for brands, asks the strip question, accepts the listed price.

| Function | What | Why |
|---|---|---|
| `plural(unit)` | tablet → tablets | |
| `referenceForm({ ... })` | MRP, pack size, strip question, "my pack says…" box | The box must be ticked: different medicines cannot be compared |
| `showError(message, field)` | Shows the message and moves there | |

## basketView.js

[Source](../../js/ui/basketView.js)

**File history:** Step 3: side panel. Step 4: full page. Step 5: animations. Step 10: current prices from the server. Step 14–15: facts and reference price. Step 20: verified references.

| Function | What | Why |
|---|---|---|
| `reduceMotion()`, `wait(ms)` | No waiting if motion is off | Accessibility |
| `getLivePrices()`, `getLiveReferences()` | Today's prices | The print sheet uses them too |
| `mountBasketView()` | Connects it | |
| `refreshPrices()` | Asks for current prices of generics and verified brands | Saved prices can be old |
| `searchLink(label)` | Link back | |
| `render(state)` | Pharmacy notice, empty, or the basket. Inside, `isNew` marks lines for the entrance animation | |
| `refreshNote()` | "Checking…" or "could not check" | Honest when offline |
| `highlightChangedValues(container)` | Soft highlight on numbers that changed | You asked for calm updates (Step 5) |
| `resetRenderMemory()` | Forgets what was shown | |
| `summaryCard(s, count)` | The totals. `shown` prints "—" when nothing is compared | ₹0 would look like a result |
| `lineItem(line, enterIndex)` | One medicine. Inside: `showError`, `commit` (save quantity) | |
| `lineFacts(i, alt, reference)` | Strength, pack, price, reference, saving. Inside: `fact`, `missing` | You listed these in Step 15 |
| `referenceBlock(i, key, ...)` | Your or the verified price, or a form. Inside: `open`, `edit` | Says clearly who vouches |
| `handleRemove(key, name, ask)` | Removes, with Undo | Asks when you press − at 1 |
| `handleClear()` | Empties, after asking | |

## printView.js

[Source](../../js/ui/printView.js). Step 3. Step 10: real data. Step 13: PRD wording. Step 20: names who vouches for each price.

| Function | What | Why |
|---|---|---|
| `header(title)` | Title, date, role | |
| `footer(sameSalt)` | Disclaimers. BR-02 only if true for all | Step 13 rule |
| `printBasket()` | The basket list | FR-05 |
| `priceText(reference)` | "MRP ₹108.36 for 15 tablets (source, date)" | A pharmacist must see where it came from |
| `printComparison(group, comparison)` | One group, for any role | Pharmacy Buyers have no basket |
