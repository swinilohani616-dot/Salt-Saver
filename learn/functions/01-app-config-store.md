# Function notes 1: start-up, settings, state

Files: [js/app.js](../../js/app.js) · [js/config.js](../../js/config.js) · [js/state/store.js](../../js/state/store.js)

---

## js/app.js: starts the search and cart pages

**File history**
| Step | Change | Why |
|---|---|---|
| [3](../04-MY-STEPS.md#step-3) | Made | One place to start the app |
| [4](../04-MY-STEPS.md#step-4) | Works for two pages, keeps tabs in sync | The basket got its own page |
| [10](../04-MY-STEPS.md#step-10) | Loads data status from the server instead of the JSON file | Data moved to the database |
| [20](../04-MY-STEPS.md#step-20) | Reset also clears prices you typed for brands | New kind of typed price |

### `PAGE`
- **What:** `'cart'` or `'search'`, read from `<body data-page>`.
- **Why:** both pages use this one file.
- **Changed:** Step 4, when the second page was made.

### `IDLE_SEARCH`
- **What:** the state when nothing is searched.
- **Why:** used at start and after Reset, so both are the same.

### `readPrefs()`
- **What:** reads text size and contrast from storage.
- **Why:** a wrong saved value (edited by hand) is replaced by the default.

### `readRole()`
- **What:** reads the saved role, or `null` if it is not a real role.
- **Why:** `null` means "ask the user".

### `resyncFromStorage()`
- **What:** reads basket, role and settings again.
- **Why:** another tab may have changed them, or the Back button showed an old page.
- **Changed:** new in Step 4, because two pages can be open at once.

### `boot()`
- **What:** the start-up list: storage check, state, connect buttons, load status, show page, ask for role.
- **Why:** the order matters. Storage must work before the basket is read.
- **Changed:** Step 4 (two pages). Step 10: it no longer loads medicines. If the server is down the page still opens, because the basket is on your device.

### `bindGlobalButtons()`
- **What:** connects **Reset** and the banner's **Print**.
- **Why:** these exist on both pages. Reset asks first, then clears basket, typed prices, role and settings.
- **Changed:** Step 14 and 20: also clears typed prices.

---

## js/config.js: settings and all words

**File history**
| Step | Change | Why |
|---|---|---|
| 3 | Made | All settings and messages in one place |
| 10 | `DATA_URL` replaced by `API_BASE` | Data comes from the server |
| [12](../04-MY-STEPS.md#step-12) | Softer words | You asked, "so people are not scerd" |
| [13](../04-MY-STEPS.md#step-13) | PRD wording | You asked |
| [15](../04-MY-STEPS.md#step-15) | New basket storage name | The basket bug |
| [20](../04-MY-STEPS.md#step-20) | `basket4`, new result messages | Basket lines now keep who vouches for the price |

| Constant | What | Why |
|---|---|---|
| `SCHEMA_VERSION` | 1. Version of the demo file format | A file of another version is refused |
| `API_BASE` | `./api` | Start of every server address |
| `STORAGE_PREFIX` | `saltsaver:v1:` | Our storage names cannot clash with others |
| `STORAGE_KEYS` | Names of saved things. `basket` is now `basket4`; `previousBaskets` are read once. `db` is left from version 1 | **Rule:** if the shape of a basket line changes, change the name |
| `SEARCH` | 2 letters minimum, 250 ms wait. `maxResults` is not used now | Fewer requests |
| `QTY` | 1 to 999 | PRD limits |
| `FONT_SCALES` | 1, 1.25, 1.5 | Text sizes for seniors |
| `DEFAULT_PREFS` | Normal size, no high contrast | Starting point |
| `EXAMPLE_QUERIES` | Crocin, Paracetamol, Metformin, Amlodipine, Telma | The chips under the search box. Also your test searches in Step 20 |
| `SUGGEST` | 200 ms wait | For suggestions |
| `MESSAGES` | Every sentence the user can see | One place to change or translate |

Some messages are small functions, because they contain a value: `STALE(name, date)`, `added(name)`, `removed(name)`, `roleChanged(label)`, `similar(q)`, `notShown(n)`, `resultsCount(body, q)`.

`MESSAGES.DISCLAIMER` is the PRD's BR-02 sentence, word for word. A test checks it.

---

## js/state/store.js: the shared state

**File history:** Step 3. The list of what state holds was updated in Steps 10 and 20. The four functions did not change.

### `getState()`
- **What:** gives the current state.
- **Why:** any part can look, nobody keeps a private copy.

### `initStore(initial)`
- **What:** sets the first state.
- **Why:** called once, by `boot`.

### `setState(patch)`
- **What:** replaces some parts and tells every subscriber, giving the new and the old state.
- **Why:** subscribers compare the two and redraw only if their part changed.
- **Example:** `setState({ basket })` updates the badge, the buttons and the basket page.

### `subscribe(fn)`
- **What:** "call me when something changes". Returns a function that stops it.
- **Why:** the badge does not need to know who changed the basket.
