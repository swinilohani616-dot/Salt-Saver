# 8. Pages, HTML and CSS

## The three pages

| Page | What it is | JavaScript | CSS |
|---|---|---|---|
| [index.html](../index.html) | Landing page with the capsule | `js/landing.js` | `css/landing.css` |
| [search.html](../search.html) | Search and results | `js/app.js` | `css/styles.css` |
| [cart.html](../cart.html) | Comparison basket | `js/app.js` | `css/styles.css` |

`search.html` and `cart.html` share one start-up file. It looks at `<body data-page="search">` or `<body data-page="cart">` to know which page it is on.

### History
| Change | Why | Step |
|---|---|---|
| One page with everything | Version 1 | 3 |
| `cart.html` added | Keep the homepage clean | 4 |
| Landing page became `index.html`, search moved to `search.html` | You asked for it as the front page | 11 |
| Text follows the PRD | You asked | 13 |
| `search.html` centred | You asked | 17 |

## Important ids in the HTML

JavaScript finds places on the page by their id.

| Id | Page | Filled by |
|---|---|---|
| `search-input`, `search-form`, `search-suggestions` | search | `searchView.js` |
| `example-chips`, `results-status`, `results` | search | `searchView.js` |
| `basket-page` | cart | `basketView.js` |
| `cart-link`, `cart-count` | both | `cartBadge.js` |
| `role-button`, `role-modal`, `role-options` | both | `roleSelector.js` |
| `font-smaller`, `font-reset`, `font-larger`, `contrast-toggle` | both | `a11yControls.js` |
| `reset-button`, `banner-print` | both | `app.js` |
| `data-banner`, `data-sources` | both | `dataBanner.js` |
| `storage-banner`, `toast-stack`, `confirm-modal` | both | `alerts.js` |
| `loading-state` | both | Hidden by `app.js` when ready |
| `print-sheet` | both | `printView.js` |
| `stage`, `q`, `sf`, `res`, `res-status`, `try` | landing | `landing.js` |

## Safety in the HTML

- **Content Security Policy** (a `<meta>` tag): the browser may run scripts only from this site and from cdn.jsdelivr.net.
- **`integrity="sha384-..."`**: if a CDN file is changed by someone, the browser refuses it.

## Accessibility in the HTML

- A "Skip to search" link for keyboard users.
- `aria-live` areas, so screen readers hear the number of results.
- `<label>` for every input.
- `role="alert"` for errors.

## The CSS files

| File | Job |
|---|---|
| [styles.css](../css/styles.css) | Theme for search and cart, on top of Bootstrap |
| [landing.css](../css/landing.css) | Landing page only |
| [print.css](../css/print.css) | Used only when printing |

### Colours (CSS variables)

| Colour | Value | Used for |
|---|---|---|
| Ground | `#0C0F13` | Background |
| Surface | `#151A21` | Cards |
| Ink | `#EEF0F2` | Text |
| Coral | `#FF5B4A` | Buttons |
| Bone | `#F3EFE8` | Highlights |
| Mint | `#7FD8B5` | Savings, verified |
| Soft red | `#FF8F84` | Brand price, danger |
| Amber | `#F2C46D` | Needs review |

Some names are old: `--ss-teal` now holds coral. The names were kept so that nothing else had to change (Step 6 and Step 11).

### The sections of styles.css

Focus and skip link, buttons, navbar, search, empty states, basket page, role pop-up, info banners, toasts and footer, high contrast, reduced motion, home steps, data sources and match status, result groups, result rows, price you pay now, and `search.html` only.

### Text size and contrast

- `html { font-size: calc(112.5% * var(--font-scale)) }` means 18 px, and **A+** changes `--font-scale`.
- `[data-contrast="high"]` turns everything black, white and yellow.
- `prefers-reduced-motion` switches off animation.

### How printing works

`print.css` hides everything except `#print-sheet`. That is why no PDF library is needed: the browser's own "Save as PDF" makes the file.

Next: [functions/01-app-config-store.md](functions/01-app-config-store.md)
