# SaltSaver — Architecture

> Generic Medicine Substitute Finder · PST_PD_096 · PRD v1.0
> Stack: HTML5, CSS3, Vanilla JavaScript (ES modules), Bootstrap 5 · No backend · Deployed as a static site (GitHub Pages / Vercel)

---

## 1. Architectural summary

SaltSaver is a **single-page, client-only static web app**. All logic runs in the browser:

- **Data** comes from `data/sample-data.json`. On first load it is copied into `localStorage`. After that, `localStorage` is used, and the JSON file is the fallback (PRD §7).
- **Logic** is split into strict layers. The pure logic (search, salt matching, savings math) has **no DOM access and no storage access**, so it can be unit-tested in isolation. That is how we prove the PRD §15 metric: "100% accurate salt matching and price math".
- **UI** is Bootstrap 5 plus small render modules. Each module builds DOM nodes with `textContent`, never `innerHTML` with data (XSS rule, PRD §11).

```
┌──────────────────────────────────────────────────────────────────────┐
│                           index.html (Bootstrap 5)                    │
│  Navbar(Role selector · A+/A- · Contrast · Reset)  Search  Results  Basket │
└───────────────▲──────────────────────────────────────────┬───────────┘
                │ render(state)                            │ DOM events
┌───────────────┴──────────────────────────────────────────▼───────────┐
│  UI LAYER  js/ui/*                                                    │
│  searchView · medicineCard · basketView · roleSelector · a11yControls │
│  printView · toast/alerts           (DOM only, no business rules)     │
└───────────────▲──────────────────────────────────────────┬───────────┘
                │ subscribe(state)                         │ actions
┌───────────────┴──────────────────────────────────────────▼───────────┐
│  STATE  js/state/store.js   — single app state object + pub/sub       │
│  { role, medicines, saltIndex, query, results, basket, prefs, banner }│
└───────────────▲──────────────────────────────────────────┬───────────┘
                │                                          │ calls
┌───────────────┴──────────────────────────────────────────▼───────────┐
│  SERVICES  js/services/*  (API contract, PRD §9)                      │
│  medicineService.searchMedicine(q)                                    │
│  basketService.addToBasket(id, qty) / updateQty / remove / clear      │
│  basketService.calculateTotalSavings()                                │
│  dataService.loadDatabase() / resetDemo()                             │
│  storage.js  (localStorage wrapper + in-memory fallback)              │
└───────────────▲──────────────────────────────────────────┬───────────┘
                │ pure function calls                      │
┌───────────────┴──────────────────────────────────────────▼───────────┐
│  CORE  js/core/*  — PURE, no DOM, no storage, 100% unit-tested        │
│  normalize.js · saltIndex.js · search.js · savings.js · validate.js   │
│  sanitize.js · errors.js · roles.js                                   │
└──────────────────────────────────────────────────────────────────────┘
                ▲
                │ fetch() on first run / reset
        data/sample-data.json  ⇄  localStorage["saltsaver:v1:*"]
```

**Dependency rule:** arrows only point downward. `core` imports nothing from other layers. `services` import `core`. `ui` talks to `state` and `services` only. This one rule is what makes the planned React + Vite refactor (stretch goal) a UI-only rewrite: `core/` and `services/` move across unchanged.

---

## 2. Folder structure

```
saltsaver/
├── index.html                 # Search page: navbar (with cart icon), search, results, print sheet
├── cart.html                  # Prescription Basket page (same navbar and store)
├── css/
│   ├── styles.css             # Theme tokens, large-type scale, high-contrast theme
│   └── print.css              # @media print: shows only the savings sheet
├── js/
│   ├── app.js                 # Bootstrap: load DB → init store → mount views
│   ├── config.js              # Storage keys, schemaVersion, debounce ms, limits
│   ├── core/                  # PURE logic (unit tested)
│   │   ├── errors.js          # Error codes + Result helpers {ok,data} / {ok:false,error}
│   │   ├── normalize.js       # normalizeText(), saltKey()
│   │   ├── saltIndex.js       # buildSaltIndex(medicines) → Map<saltKey, Medicine[]>
│   │   ├── search.js          # searchMedicines(query, medicines) → ranked Medicine[]
│   │   ├── savings.js         # unitSaving(), savingPercent(), lineSaving(), basketSummary()
│   │   ├── validate.js        # validateQuantity(), validateMedicine(), validateDb()
│   │   ├── roles.js           # ROLES, can(role, capability) — PRD §4 matrix
│   │   └── sanitize.js        # escapeHTML() (for the rare template string), formatINR()
│   ├── services/
│   │   ├── storage.js         # safeGet/safeSet + memory fallback on QuotaExceeded
│   │   ├── dataService.js     # loadDatabase(), resetDemo()
│   │   ├── medicineService.js # searchMedicine(query)               (PRD §9)
│   │   └── basketService.js   # addToBasket(), calculateTotalSavings() (PRD §9)
│   ├── state/
│   │   └── store.js           # getState(), setState(patch), subscribe(fn)
│   └── ui/
│       ├── dom.js             # el(tag, attrs, children) helper (textContent only)
│       ├── searchView.js      # Input, debounce, aria-live result count, empty state
│       ├── medicineCard.js    # Brand vs generic comparison card + disclaimer
│       ├── basketView.js      # Basket page (cart.html): items, qty steppers, monthly totals
│       ├── cartBadge.js       # Navbar cart icon + item-count badge
│       ├── roleSelector.js    # Patient/Senior · Caregiver · Pharmacy Buyer
│       ├── a11yControls.js    # Font size A-/A/A+, high-contrast toggle
│       ├── printView.js       # Builds printable sheet, calls window.print()
│       └── alerts.js          # Bootstrap toast/alert wrapper (role="alert")
├── data/
│   └── sample-data.json       # Seed DB (deliverable, PRD §17)
├── tests/
│   ├── index.html             # Browser test runner (no npm needed)
│   └── core.test.js           # Assertions for core/* (salt match + math)
├── docs/
│   ├── screenshots/           # For README
│   └── TEST_LOG.md            # Manual test log (deliverable)
├── README.md
└── ARCHITECTURE.md
```

---

## 3. Data model

### 3.1 Medicine (from PRD §8, plus fields this design adds)

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | string | PRD | `med_<n>`, unique |
| `brandName` | string | PRD | e.g. `"Crocin 500mg"` |
| `activeSalt` | string | PRD | e.g. `"Paracetamol 500mg"`. Combinations joined with `+` |
| `brandPrice` | number (₹) | PRD | Price per **unit of sale** (see §3.3) |
| `genericName` | string | PRD | e.g. `"Jan Aushadhi Paracetamol 500mg"` |
| `genericPrice` | number (₹) | PRD | Same unit as `brandPrice` |
| `manufacturer` | string | PRD | Brand manufacturer |
| `category` | string | *added, optional* | e.g. "Diabetes", used for filter chips |
| `packSize` | string | *added, optional* | e.g. "Strip of 15 tablets", display only |

### 3.2 Storage layout (localStorage)

All keys are namespaced and versioned, so a future schema change can't break old data:

| Key | Value | Written when |
|---|---|---|
| `saltsaver:v1:db` | `{ schemaVersion, medicines[] }` | First load / reset |
| `saltsaver:v1:basket` | `[{ medicineId, quantityPerMonth }]` | Every basket change |
| `saltsaver:v1:role` | `"patient" \| "caregiver" \| "pharmacy"` | Role change |
| `saltsaver:v1:prefs` | `{ fontScale: 1\|1.25\|1.5, highContrast: bool }` | A11y toggle |

The basket stores **only IDs and quantities**, never prices. Prices are always looked up from the DB at render time, so a price fix in the data flows through to every saved basket.

### 3.3 ⚠ Open question for mentor review: what "unit" is the price for?

BR-01 says `savings = (brandPrice − genericPrice) × quantity`, and the sample basket says `quantityPerMonth: 30`. If ₹30 is the price of a *strip* and 30 is a count of *tablets*, the result is wrong by a factor of 15.
**Proposal:** prices and quantity use the same unit. The UI labels the quantity as "strips/packs per month", and `packSize` shows what one pack contains. This needs mentor sign-off before the Week 1 dataset is compiled.

---

## 4. Core logic design

### 4.1 Normalization (`normalize.js`)

```
normalizeText("  Crocin-500 MG ") → "crocin 500mg"
  lowercase → trim → collapse whitespace → strip punctuation except '+' and '.'
  → join number+unit ("500 mg" → "500mg")

saltKey("Paracetamol 500mg")                 → "paracetamol 500mg"
saltKey("Clavulanic Acid 125mg + Amoxicillin 500mg")
                                             → "amoxicillin 500mg + clavulanic acid 125mg"
  split on '+', normalize each part, sort, rejoin  (order-independent combos)
```

### 4.2 Active salt index (`saltIndex.js`)

`buildSaltIndex(medicines)` returns a `Map<saltKey, Medicine[]>`. It is built **once** at load time (O(n)), so finding "every product with the same salt" is an O(1) lookup. This is the "active salt index match engine" listed in PRD §5.

### 4.3 Search (`search.js`). Covers FR-01 and BR-03

`searchMedicines(query, medicines)`:
1. `q = normalizeText(query)`. If `q.length < 2`, return `[]` (no search on 1 character).
2. Match each medicine against **brandName, activeSalt and genericName** (BR-03).
3. Rank the results:
   | Score | Rule |
   |---|---|
   | 100 | brand name exact (`"crocin 500mg"`) |
   | 80 | brand name starts with q (`"croc"`) |
   | 60 | salt name starts with q (`"paracet"`) |
   | 40 | q found anywhere in brand / salt / generic |
4. Sort by score descending, then by `brandName`. Cap at 20 results.

The service layer wraps this: if there are 0 results it returns `ERR_NOT_FOUND`, and the UI shows *"No brand found. Try searching by active salt name."* (PRD §12).

### 4.4 Savings math (`savings.js`). Covers FR-02, FR-03 and BR-01

To avoid floating-point drift (₹0.1 + ₹0.2), **all arithmetic is done in integer paise**:

```js
toPaise = rupees => Math.round(rupees * 100)

unitSaving(m)        = toPaise(m.brandPrice) - toPaise(m.genericPrice)      // paise
savingPercent(m)     = Math.floor(unitSaving(m) / toPaise(m.brandPrice) * 100)
lineSaving(m, qty)   = unitSaving(m) * qty                                   // BR-01
basketSummary(items, medicinesById) → {
  lines: [{ medicine, qty, brandTotal, genericTotal, saving }],
  totalBrand, totalGeneric, totalSaving, overallPercent       // all paise
}
```

- `Math.floor` for the percentage matches the PRD acceptance test exactly: (30 − 5.5) / 30 = 81.67% → **"Save 81%"**. It also means we never over-promise.
- If `genericPrice ≥ brandPrice`, the saving is reported as 0 and the card shows "No saving". It never shows a negative number.
- `formatINR(paise)` uses `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` and gives `₹30.00`.

### 4.5 Validation (`validate.js`). Covers PRD §12

| Input | Rule | Error |
|---|---|---|
| quantity | integer, `1 ≤ qty ≤ 999` | `ERR_VALIDATION` → "Quantity must be at least 1." |
| medicineId | exists in DB | `ERR_VALIDATION` |
| DB on load | `schemaVersion === 1`, every medicine has required fields, prices > 0 | bad records are skipped and logged with `console.warn` |

### 4.6 Roles (`roles.js`). Implements the PRD §4 matrix as data

```js
const CAPABILITIES = {
  search:        ['patient', 'caregiver', 'pharmacy'],
  viewGeneric:   ['patient', 'caregiver', 'pharmacy'],
  addToBasket:   ['patient', 'caregiver'],            // Pharmacy Buyer: No
  print:         ['patient', 'caregiver', 'pharmacy'],
  resetDemo:     ['patient', 'caregiver', 'pharmacy'],
};
can(role, capability) → boolean
```

The check runs in **two places**: the UI hides or disables "Add to basket" for the Pharmacy Buyer role, and `basketService.addToBasket` checks again and rejects with `ERR_FORBIDDEN`. The UI is never the only guard.

---

## 5. Service contract (PRD §9)

Every service returns a uniform **Result** instead of throwing:

```js
{ ok: true,  data: ... }
{ ok: false, error: { code: 'ERR_NOT_FOUND' | 'ERR_VALIDATION' | 'ERR_EMPTY_BASKET'
                            | 'ERR_FORBIDDEN' | 'ERR_STORAGE' | 'ERR_DATA_LOAD',
                      message: 'User-facing text' } }
```

| Function | Input | Output (`data`) | Roles | Errors |
|---|---|---|---|---|
| `searchMedicine(query)` | string | `Medicine[]` (each with `substitutes` from the salt index) | All | `ERR_NOT_FOUND` |
| `addToBasket(medId, qty)` | string, int | updated basket | Patient, Caregiver | `ERR_VALIDATION`, `ERR_FORBIDDEN` |
| `updateQuantity(medId, qty)` | string, int | updated basket | Patient, Caregiver | `ERR_VALIDATION` |
| `removeFromBasket(medId)` | string | updated basket | Patient, Caregiver | — |
| `calculateTotalSavings()` | — | `basketSummary` | All | `ERR_EMPTY_BASKET` |
| `loadDatabase()` | — | `{ medicines, saltIndex }` | — | `ERR_DATA_LOAD` |
| `resetDemo()` | — | clears all `saltsaver:v1:*` keys and re-seeds | All (demo) | — |

Adding a medicine that is already in the basket **adds to its quantity** instead of creating a duplicate line.

---

## 6. Runtime flows

### 6.1 App boot (`app.js`)

```
DOMContentLoaded
 → storage.init()              // checks that localStorage works (private mode can throw)
 → dataService.loadDatabase()
     localStorage db valid & schemaVersion==1 ?  use it
     else fetch('data/sample-data.json') → validateDb → save to localStorage
     fetch fails → show "Could not load medicine data" alert, keep search disabled
 → buildSaltIndex(medicines)
 → store.init({ medicines, saltIndex, basket, role, prefs })
 → apply prefs (font scale, contrast) to <html>
 → mount views; each view subscribes to the store
 → if no role saved → open the role-selector modal
```

### 6.2 Search → card (FR-01, FR-02)

```
input event ─debounce 250ms─▶ medicineService.searchMedicine(q)
   ok      → store.setState({results}) → searchView renders medicineCard × n
             aria-live region: "3 medicines found"
   NOT_FOUND → empty state "No brand found. Try searching by active salt name."
```

What a **medicine card** contains:
- Brand name, manufacturer, active salt (as a badge).
- Two price columns: "Branded ₹30.00" and "Jan Aushadhi Generic ₹5.50".
- A green badge: **"Save 81%"**.
- Quantity input and an "Add to basket" button. These are hidden for the Pharmacy Buyer role.
- **Disclaimer (BR-02), on every card:** *"Generics contain identical WHO-approved active chemical salts."*

### 6.3 Basket (FR-03, FR-04)

```
addToBasket → validate → role check → merge → storage.safeSet(basket)
            → store.setState({basket}) → basketView re-renders
            → calculateTotalSavings() → "You save ₹1,234.00 / month (78%)"
reload page → boot reads saltsaver:v1:basket → basket restored        (FR-04 test)
```

### 6.4 Storage-full fallback (PRD §12)

`storage.safeSet` wraps `localStorage.setItem` in `try/catch`. When it hits a `QuotaExceededError` or `SecurityError` (some private-mode browsers):
1. it switches to the in-memory `Map` for the rest of the session,
2. it sets `store.banner = "Storage is full — your basket will be kept until you close this tab."`,
3. the app keeps working normally.

### 6.5 Print (FR-05)

The "Print savings sheet" button calls `printView.build()`. This fills a hidden `<section id="print-sheet">` with a date, a table (brand, salt, generic, qty, brand cost, generic cost, saving), totals, and the BR-02 disclaimer. Then it calls `window.print()`.
`print.css` hides everything else (`body > *:not(#print-sheet) { display:none }`) and uses black-on-white, 12pt type and no shadows. "Save as PDF" in the browser's print dialog gives the PDF export, so no PDF library is needed.

---

## 7. Accessibility design (PRD §13, §16 risk mitigation)

| Concern | Decision |
|---|---|
| Small text for seniors | Base font **18px**. A-/A/A+ toggle sets `--font-scale` (1 / 1.25 / 1.5) on `<html>`. All sizes are in `rem`. Saved in prefs. |
| Low vision | A high-contrast theme (`[data-theme="high-contrast"]`): pure black/white/yellow, all text ≥ 7:1. The default theme meets WCAG AA (≥ 4.5:1). |
| Motor | Tap targets ≥ 44×44px. Quantity uses −/+ steppers as well as typing. |
| Screen readers | Every input has a `<label>`. Results count is in `aria-live="polite"`. Errors use `role="alert"`. Cards are `<article>` with a heading. |
| Keyboard | Logical tab order, visible `:focus-visible` ring (3px), Esc closes modals, and a "Skip to search" link. |
| Language | Plain words ("You save", not "Delta"). Money always formatted as ₹ with Indian digit grouping. |
| Color-only meaning | The savings badge has text ("Save 81%") as well as its green color. |

Week 4 checks: Lighthouse Accessibility score ≥ 95, axe DevTools with 0 critical issues, and a keyboard-only walkthrough. Record all three in `docs/TEST_LOG.md`.

---

## 8. Security (PRD §11)

- **No `innerHTML` with data.** All rendering goes through `ui/dom.js → el()`, which sets `textContent`. `escapeHTML()` exists only for the print template, if one is used.
- Data from localStorage is **untrusted**: it is re-validated (`validateDb`, `validateQuantity`) on every load, because a user can edit it in DevTools.
- No third-party scripts other than Bootstrap from the CDN, pinned with an SRI `integrity` hash.
- Optional: a CSP `<meta>` with `default-src 'self'; script-src 'self' cdn.jsdelivr.net`.

---

## 9. Testing strategy (PRD §15: "100% accurate")

| Level | Tool | What |
|---|---|---|
| Unit | `tests/index.html` (tiny `assert` runner, opened in a browser) | All of `core/*`: normalization, combination salt keys, ranking, paise math, the 81% case, zero/negative quantity, generic ≥ brand |
| Data | A test that loops over **every** record in `sample-data.json` | Same salt → same `saltKey`; `genericPrice < brandPrice`; all required fields present |
| Manual | `docs/TEST_LOG.md` | One row per acceptance test FR-01…FR-05 and PRD §12 edge cases, with pass/fail, date and tester |

Required acceptance tests (copied from the PRD):
- FR-01: Typing "Crocin" shows the salt Paracetamol 500mg. Typing "Paracetamol" also finds Crocin.
- FR-02: The card shows Branded ₹30.00 vs Generic ₹5.50 (Save 81%).
- FR-03: Adding 2 drugs gives the correct combined monthly saving.
- FR-04: Add a drug and reload; the basket is still there.
- FR-05: Clicking Print opens the print dialog showing only the generic list.
- Edge cases: an unknown query shows the empty state; qty 0 shows the alert; a full storage shows the banner.

---

## 10. Running & deployment

- **Local:** ES modules and `fetch()` don't work over `file://`, so the app **must be served**. Use the VS Code "Live Server" extension or `npx serve .`.
- **Deploy:** push to GitHub → **GitHub Pages** (Settings → Pages → branch `main`, root). No build step is needed. Vercel also works with zero config (framework preset "Other").
- All paths are **relative** (`./data/sample-data.json`), so the site works under the `/<repo>/` sub-path that GitHub Pages uses.

---

## 11. Milestone mapping (PRD §14)

| Week | Modules |
|---|---|
| 1 | `index.html` layout, `styles.css` (tokens, large type, contrast), `sample-data.json` (≥ 25 medicines, prices checked against the Jan Aushadhi product list), `config.js`, `roleSelector`, `a11yControls` |
| 2 | `core/normalize`, `saltIndex`, `search`, `savings`, `validate` + `tests/`; `medicineService`; `searchView`, `medicineCard` |
| 3 | `storage.js` (with fallback), `basketService`, `store.js`, `basketView`, `printView` + `print.css`, `resetDemo` |
| 4 | Accessibility audit, `TEST_LOG.md`, README with screenshots, deployment |

Suggested split for the 2-person team: **Student A** owns `core/` + `services/` + tests. **Student B** owns `ui/` + CSS + accessibility. Both work against the Result contract in §5.

---

## 12. Stretch-goal readiness

- **React + Vite:** move `core/` and `services/` across unchanged. Replace `ui/` + `store.js` with components and a `useReducer`/context store. No logic is rewritten.
- **Chart.js:** `basketSummary().lines` already gives you per-medicine brand vs generic totals. Feed them straight into a grouped bar chart in a new `ui/savingsChart.js`.

---

## 13. Items for mentor review

1. **Price unit** (§3.3): is the price per pack or per tablet, and is quantity counted in packs?
2. Rounding of the savings %: `floor` (matches the PRD's 81%) or `round` (would show 82%)?
3. Data source and disclaimer: seed prices are for demo only. Should the UI also say *"Prices are indicative; confirm at your Jan Aushadhi Kendra. Consult your doctor before switching."*?
4. Should the role be picked on every visit or remembered (current design: remembered, and can be changed from the navbar)?
