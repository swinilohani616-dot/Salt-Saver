# SaltSaver – Generic Medicine Substitute Finder

**Project ID:** PST_PD_096 · **Type:** College OJT web development project (4 weeks, 2 students) · **Status:** Phase 1 complete

> ⚠️ **Demonstration only.** All brand names, manufacturers and prices in this project are **fictional**. Active ingredient names are real, but no record is medically verified, no price is official, and nothing here shows availability or clinical equivalence. SaltSaver is **not medical advice** and does not recommend substituting any medicine. Always consult a doctor or pharmacist.

---

## 1. Project goals

Medicines that contain the same active ingredient (the "salt") can be sold under different brand names at very different prices. SaltSaver is a learning project that explores how a simple, accessible website could:

- let a user search by **brand name** or **active ingredient**,
- show records that list the **same ingredients, strength and dosage form** side by side,
- compare prices **fairly, per tablet / capsule / ml**, even when pack sizes differ,
- communicate clearly that a price comparison is **not** a recommendation to substitute.

Learning goals for the team: semantic HTML, responsive layout with Bootstrap, DOM manipulation, `fetch()` and JSON, input and data validation, safe rendering of untrusted data, and accessibility basics.

## 2. Tech stack

| Technology | Used for |
|---|---|
| HTML5 | Page structure, semantic sections, accessible forms |
| CSS3 | Brand colours (CSS variables), card styles, focus styles, small-screen tweaks |
| Bootstrap 5.3.3 (CDN) | Grid, navbar, cards, alerts, form styles |
| Vanilla JavaScript (ES6+) | Loading data, validation, search, grouping, rendering, calculator |
| JSON | Local fictional demonstration dataset |

Not used, by design: React or other frameworks, a backend, a database, or external medicine APIs.

## 3. Folder structure

```
Salt saver 1/
├── index.html              Main page: navbar, hero, search, results, calculator, about
├── css/
│   └── style.css           Custom styles on top of Bootstrap
├── js/
│   └── app.js              All application logic
├── data/
│   └── sample-data.json    Fictional demo dataset (13 valid + 1 intentionally invalid record)
├── screenshots/            Screenshots for the project report
└── README.md               This file
```

## 4. Phase 1 features implemented

1. **Responsive homepage**: SaltSaver branding, collapsible navbar, project description, a permanent demo warning, and a search bar.
2. **Search by brand or ingredient**: case-insensitive, partial matching (`"PARA"` finds Paracetamol) using `filter()`, `includes()` and `some()`.
3. **Composition grouping**: records are compared only if they list identical ingredients, strengths, units, dosage form and pack unit. Ingredient order does not matter. 500 mg is never compared with 650 mg.
4. **Comparison cards**: brand and generic rows with manufacturer, pack size, sample pack price, price per unit, source and verification status, plus a **"Not a recommendation to substitute"** warning on every card.
5. **Savings calculator**: converts two packs to price per unit and shows the difference in rupees and as a percentage. Cards have a **"Use in calculator"** button that fills it in.
6. **Helpful states**:
   - Loading message
   - Empty or too-short search
   - No results, with clickable ingredient suggestions
   - Card note when there is no generic to compare with
   - Invalid records skipped and listed (not crashed on)
   - File-not-found, bad-JSON and opened-as-`file://` errors, each with an explanation
7. **Accessibility**: skip link, labelled inputs, `role="search"`, `aria-live` status updates, `aria-invalid` on bad inputs, visible keyboard focus, WCAG AA colour contrast, reduced-motion support, and text badges so colour is never the only signal.
8. **Security**: all JSON data and user input is rendered with `textContent` / `createElement`. `innerHTML` is never used, so text like `<script>` is shown, not run. Bootstrap is loaded with Subresource Integrity (`integrity` attribute).

## 5. How to run it

`app.js` loads the data with `fetch('data/sample-data.json')`. **Browsers block `fetch()` from reading local files when a page is opened as `file://`** (by double-clicking `index.html`), so you need a small local web server that serves the folder over `http://`.

**Option A: Python (built into macOS)**

```bash
cd "path/to/Salt saver 1"
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser. Press `Ctrl + C` in the terminal to stop the server.

**Option B: VS Code Live Server**

Install the *Live Server* extension, right-click `index.html`, and choose **Open with Live Server**.

If you open the file directly anyway, the page shows a message explaining this.

## 6. How to test

| # | Action | Expected result |
|---|---|---|
| 1 | Load the page | "Sample data ready: 13 fictional records"; the notice lists `DEMO-INVALID-01` as skipped |
| 2 | Search `PARACETAMOL` | 3 cards: 500 mg, 650 mg and Ibuprofen + Paracetamol |
| 3 | Search `pyrovin` | Brand and generic shown; ₹1.10 per tablet lower (55.0%) |
| 4 | Search `duoflam` | Combination brand matched with its generic |
| 5 | Search `cetirizine` | Syrup card says no comparable generic in sample data |
| 6 | Search `xyz` | No-results box with ingredient buttons; clicking one searches it |
| 7 | Search with empty box, then `a` | Friendly validation message, red input border |
| 8 | Search `<img src=x onerror=alert(1)>` | Text shown as typed; no alert pops up |
| 9 | Click **Use in calculator** on Pyrovin 500 | Calculator shows ₹2.00 vs ₹0.90 per tablet, 55.0% less |
| 10 | Calculator with pack size `0` | Field highlighted, error message shown |
| 11 | Open `index.html` by double-clicking | Message explaining that a local server is needed |
| 12 | Rename the JSON file temporarily | "Could not load sample data" box (rename it back afterwards) |
| 13 | DevTools phone width | Hamburger menu, single-column cards, stacked search button |
| 14 | Navigate using only the Tab key | Skip link first; visible yellow focus ring on every control |

## 7. About the sample data

`data/sample-data.json` has a `meta` block (dataset name, version, currency, disclaimer) and a `medicines` list. Each record contains:

`id`, `brandName`, `type` (`brand`/`generic`), `ingredients` (list of `{name, strength, unit}`), `dosageForm`, `manufacturer`, `packSize`, `packUnit`, `packPrice`, `unitPrice`, `source`, `verificationStatus`.

- Every manufacturer is marked "(fictional)", every `verificationStatus` is `"unverified"`, and every `source` says the data was invented for teaching.
- `unitPrice` must equal `packPrice ÷ packSize`. `app.js` rejects records where it doesn't.
- `DEMO-INVALID-01` is **deliberately broken** so the invalid-data handling can be demonstrated.

## 8. Limitations

- **Fictional data only.** Brand names, manufacturers and prices are invented. The dataset is tiny (13 valid records).
- **Not medical advice.** Matching ingredients, strength and form in a file does not mean two products are interchangeable for a person (excipients, release mechanisms, bioequivalence, allergies and a doctor's judgement all matter).
- **No real pricing or availability.** Nothing is connected to any official price list, pharmacy or API.
- **Exact matching only.** Spelling mistakes (e.g. `paracetmol`) and alternative names (e.g. "acetaminophen") are not recognised.
- **Same-unit comparisons only.** Tablets are not compared with syrups, and no dose conversion is attempted.
- **No saved data.** Nothing is remembered between visits (planned for a later phase).
- **Needs a local server and an internet connection** (Bootstrap loads from a CDN).

## 9. Planned later phases

| Phase | Planned work |
|---|---|
| Phase 2 | Prescription basket: add several medicines and see total sample savings; save the basket with `localStorage` |
| Phase 3 | Filters and sorting (dosage form, price per unit), search history in `localStorage`, alternative-name and typo-tolerant search |
| Phase 4 | Accessibility and performance audit (Lighthouse), cross-browser testing, final report, presentation and deployment as a static site |

## 10. Screenshots

Screenshots are stored in [`screenshots/`](screenshots/). Suggested set for the report:

1. `01-home-desktop.png`: homepage with search bar
2. `02-results-paracetamol.png`: comparison cards for "paracetamol"
3. `03-no-results.png`: no-results state with suggestions
4. `04-calculator.png`: calculator filled from a card
5. `05-invalid-input.png`: empty-search or calculator validation message
6. `06-mobile.png`: phone-width view with the menu open
7. `07-file-protocol-error.png`: message shown when opened without a server

## 11. Team

- Swini Lohani
- Krishna Pandey

---

*SaltSaver is an educational project. It is not affiliated with any pharmaceutical company, pharmacy or regulator.*
