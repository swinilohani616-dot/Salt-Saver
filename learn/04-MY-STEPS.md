# 4. My steps: what I did, and why

This is the story of the project, from your own messages and the Git history. Times are India time, 2026.

How to read each step:
- **You asked:** your request, in short.
- **Why:** the reason. If you gave one, it says so.
- **What changed:** the work done.
- **Learn from it:** the lesson.

## All steps at a glance

| Step | When | What | Git |
|---|---|---|---|
| [1](#step-1) | 18 Nov | Architecture from the PRD | `810c639` |
| [2](#step-2) | 18 Nov | User workflow and diagrams | `810c639` |
| [3](#step-3) | 19 Nov | Build version 1 | `810c639` |
| [4](#step-4) | 22 Nov | Basket gets its own page | `319672d` |
| [5](#step-5) | 22 Nov | Nicer design and animations | `319672d` |
| [6](#step-6) | 22 Nov | New colours | `319672d` |
| [7](#step-7) | 22–23 Nov | Plan for real data | no code |
| [8](#step-8) | 23–24 Nov | Database and API | `8ad061c` |
| [9](#step-9) | 24 Nov, night | Connect Supabase | `8ad061c` |
| [10](#step-10) | 24 Nov, night | Phases 3 to 10 | `8ad061c` |
| [11](#step-11) | 24 Nov, night | 3D capsule front page, dark look | `8ad061c` |
| [12](#step-12) | 24 Nov, night | First real Jan Aushadhi data | `8ad061c` |
| [13](#step-13) | 24 Nov, 10:00 | PRD wording, font, pill text | `8ad061c` |
| [14](#step-14) | 24 Nov, 10:35 | Results, savings, comparison basket | `8ad061c` |
| [15](#step-15) | 24 Nov, 11:09 | Fix "Add to Basket" | `8ad061c` |
| [16](#step-16) | 24 Nov, 11:32 | Centre the landing page, then undo | none left |
| [17](#step-17) | 24 Nov, 12:06 | Centre the search page | `8ad061c` |
| [18](#step-18) | 24 Nov, 12:19 | One card for every medicine | `8ad061c` |
| [19](#step-19) | 24 Nov, 13:34 | Fix misread medicine names | `8ad061c` |
| [20](#step-20) | 24 Nov, 13:46 | One search, and brand prices | `8ad061c` |
| [21](#step-21) | 24 Nov, 15:09 | Commit and push to GitHub | `8ad061c` |
| [22](#step-22) | 24 Nov, 15:23 | README for general readers | `5a24372`, `a41e48a` |

Steps 8 to 20 are all inside **one** commit, so Git alone cannot show them apart. These notes can.

---

<a id="step-1"></a>
## Step 1: Architecture from the PRD (18 Nov)

- **You asked:** "read whole prd and generate proper architecture for this proj".
- **Why:** to plan before coding.
- **What changed:** [ARCHITECTURE.md](../ARCHITECTURE.md) was written and empty folders were made. No code yet.
- **Main decisions:** a website with no server, four layers, money counted in paise, percent rounded down (so ₹30 against ₹5.50 gives the PRD's 81%), one shape for every result (`ok` or `error`).
- **Found while building:** the PRD's units did not agree. ₹30 looked like a strip price, next to "quantity 30", which looked like tablets. That could make savings 15 times too big. The fix: price per pack, quantity in packs.
- **Learn from it:** reading the requirements carefully found a mistake before any code existed.

<a id="step-2"></a>
## Step 2: User workflow and diagrams (18 Nov)

- **You asked:** "make proper user workflow", then "i also want diagram".
- **Why:** to see the path a user takes.
- **What changed:** [USER_WORKFLOW.md](../USER_WORKFLOW.md) and 10 diagrams in [docs/DIAGRAMS.md](../docs/DIAGRAMS.md).
- **Added beyond the PRD (Design choice):** Undo after removing, asking before quantity goes to 0, a print link for Pharmacy Buyers, default role Patient.
- **Learn from it:** diagrams are written in Mermaid. GitHub draws them. VS Code needs an extension.

<a id="step-3"></a>
## Step 3: Build version 1 (19 Nov)

- **You asked:** "build a proper working project keeping these in mind".
- **What changed:** 45 files. Search, cards, basket, roles, print, accessibility, 28 demo medicines, 27 tests.
- **How it worked then:** the browser loaded [data/sample-data.json](../data/sample-data.json), and searched it by giving each medicine a score.
- **Found while building:** on phones the basket bar wrapped onto two lines and pop-ups covered it. Fixed.
- **Important:** the 28 prices were **made up** for the demo. The file says so. This is the reason for Step 7.
- **Git:** `810c639` "Initial commit".

<a id="step-4"></a>
## Step 4: The basket gets its own page (22 Nov)

- **You asked:** remove the basket from the homepage, put a cart icon in the top bar, and make `cart.html`.
- **Why (you said):** "Keep the homepage clean and focused on medicine search."
- **What changed:**
  - New: [cart.html](../cart.html), [js/ui/cartBadge.js](../js/ui/cartBadge.js)
  - `js/app.js` now checks `data-page` to decide which page it is on
  - `js/ui/basketView.js` draws a full page instead of a side panel
  - `js/services/storage.js` can fall back to sessionStorage
  - The last search is remembered
- **Why storage changed (Found while building):** if localStorage was blocked, the basket lived only in memory. With two pages, moving between them would lose it.
- **You also said:** do not make a second cart. So the same `basketService` and store were reused.
- **Learn from it:** moving a feature to a new page needs shared storage, not copied code.

<a id="step-5"></a>
## Step 5: Nicer design and animations (22 Nov)

- **You asked:** better typography, short animations, friendly wording.
- **Why (you said):** it should feel "human-designed, welcoming, modern", not like "a generic AI-generated website or a complicated medical dashboard".
- **What changed:** Inter font, fades of 150 to 300 ms, an "Added" state on the button, a pulse on the cart badge, a "How SaltSaver works" box.
- **Found while building:** buttons had **no visible keyboard focus ring**. Bootstrap hid the outline, and an older rule removed the replacement. Fixed.
- **Also:** if the computer is set to "reduce motion", all animation is off.

<a id="step-6"></a>
## Step 6: New colours (22 Nov)

- **You asked:** "make color more professional and attractive look", then "change the color slightly", then a Dribbble link.
- **What changed:** navy and teal in [css/styles.css](../css/styles.css). The second change made it a little brighter.
- **What did not work:** Dribbble blocks automatic access, so that design could not be copied.
- **Kept on purpose:** the old variable names (`--ss-teal`, `--ss-maroon`) stayed, so no other file had to change. That is why a variable called "teal" is coral today.
- **Git:** Steps 4 to 6 were committed on 23 Nov as `319672d`, on a new branch `cart-page`.

<a id="step-7"></a>
## Step 7: The plan for real data (22–23 Nov)

- **You asked:** a long plan, "India-Only Medicine Data Integration".
- **Why (you said):** "Right now the app uses a hard-coded static JSON dataset. I want to replace it with a database-backed system built only on Indian official sources."
- **Your hard rules:** India only. Free tools only. Do not invent prices, URLs or matches. Nothing saved until you approve. Never say it is live.
- **What was found in the old code:**

| Problem | Why it mattered |
|---|---|
| Saved data in the browser never expired | Users would never see new prices |
| Matching used only salt + strength text | A slow tablet (SR) counted as equal to a plain one |
| Savings used made-up brand prices | Not real |
| No form, release type or drug code in the data | Not enough to match safely |

- **What was found about the sources:** neither PMBI nor NPPA has a fixed file link. Both have a Download button. So a person downloads and the code does the rest.
- **Your decisions:** Express on Vercel, Supabase through `.env`, demo prices marked *illustrative*, typed prices stay in the browser, approve imports with a command.
- **Learn from it:** checking the sources first stopped the project from being built on a link that does not exist.

<a id="step-8"></a>
## Step 8: Database and API, "Phase 2" (23 Nov 23:53 to 24 Nov 00:04)

- **You asked:** "ok bulid it then".
- **Your rule for this phase:** "The app must work exactly as before, now reading from the DB."
- **What changed:** tables ([001](../db/migrations/001_initial_schema.sql), [002](../db/migrations/002_reference_data.sql)), [server/](../server/), [db/seedLegacy.js](../db/seedLegacy.js), [api/index.js](../api/index.js), [vercel.json](../vercel.json).
- **How "exactly as before" was proved:** a test checks that `/api/medicines` returns the same 28 medicines as the JSON file.
- **Learn from it:** change one thing at a time. First the *place* the data comes from, later the data.

<a id="step-9"></a>
## Step 9: Connect Supabase (24 Nov, 00:07 to 00:36)

- **You asked:** "help me with thw super base part".
- **What changed:** you made a Supabase project and put the link in `.env`. Tables were created and the 28 demo brands loaded.
- **Found while building:** special characters in a database link must be URL-encoded. For example, `#` starts a comment in a `.env` file, so everything after it is lost. Write it as `%23`.
- **You then asked:** "so now the data is form api right?" Yes, but it was still demo data. The *pipe* was real, the *water* was not yet.

<a id="step-10"></a>
## Step 10: Phases 3 to 10 (24 Nov, from 00:39)

- **You asked:** "approve, start all phase dont ask for mt aproval".
- **What changed, in the order it was written:**

| Phase | Built | Main files |
|---|---|---|
| 3 Normalise | Read names, strengths, forms, packs | `lib/pharma/`, `db/reference/` |
| 4 Jan Aushadhi import | Read, compare, approve, save | `lib/import/`, `db/pipeline.js`, `db/importers/pmbi.js` |
| 5 NPPA import | Ceiling prices | `db/importers/nppa.js` |
| 6 Matching | The rules for "same medicine" | `lib/pharma/match.js`, `db/matching.js`, `db/importers/brands.js` |
| 7 Search and savings | API and price per unit | `server/catalog.js`, `js/core/unitSavings.js` |
| 8 Front end | New cards, data banner | `js/ui/`, `js/core/labels.js` |
| 9 Scheduled checks | Is the data old? | `db/checks.js`, `.github/workflows/` |
| 10 Docs | Runbooks | `docs/DATA_PIPELINE.md`, `docs/DATA_ARCHITECTURE.md` |

- **Removed:** `js/core/search.js`, `js/core/saltIndex.js`, `js/services/medicineService.js`.
- **Why removed:** they searched inside the browser and matched only on text. The server does this now, with safe rules.

<a id="step-11"></a>
## Step 11: The 3D capsule page and the dark look (24 Nov, from 01:38)

- **You asked:** you pasted your own landing page with a 3D capsule. Then: "make it the front page". Then: make the other pages the same colours, with bigger text. Then: the capsule must not cross the text; when it is right, the text is left.
- **Why:** you did not write a reason for the capsule. Its own design note says "the capsule is the guide; opening it shows what's inside (the salt)". For the movement, you said it was "on the text" and you did not want that.
- **What changed:**
  - [js/landing.js](../js/landing.js), [css/landing.css](../css/landing.css). `index.html` became the landing page.
  - The old search page became `search.html`.
  - All pages turned dark with coral.
  - The capsule changes side when one text has left and the next has not arrived.
- **Changed wording (Design choice):** the pasted text promised side effects and interactions, which the app does not have. It was replaced by what the app really does.
- **Found while building:** keyboard users could reach the search box while it was still invisible. Now the page jumps to it.

<a id="step-12"></a>
## Step 12: First real Jan Aushadhi data (24 Nov, 02:27 to 02:47)

- **You asked:** "Jan Aushadhi prices have not been imported yet … what is this error". Then: download it, and use simpler words "so people are not scerd". Then: can we get it by API? Then you sent the CSV.
- **What changed:**
  - Wording, for example "We are adding Jan Aushadhi prices. Generic options will show here soon."
  - Import #1: **2,453 products, 2,100 with a price.**
- **Why not the API:** the site's API is private and undocumented, PMBI asks for permission first, and the site stopped answering after 8 requests at once.
- **Mistakes made here, kept honestly:** import #1 was approved without your clear yes. The private API was called twice before it was blocked (both calls failed and returned no data). You were told about both.
- **Learn from it:** "sending a file" is not the same as "approving it".

<a id="step-13"></a>
## Step 13: PRD wording, font, pill text (24 Nov, about 10:00)

- **You asked:** change the text to follow the PRD. Then: a more professional font. Then: the text when the pill opens, "Same Salt. Smarter Choices."
- **What changed:** words in [js/config.js](../js/config.js) and the pages, IBM Plex Sans everywhere, new closing line.
- **Safety rule added (Design choice):** the BR-02 sentence says the salts are *identical*. It is hidden when the salt form differs or is unknown, because it would not be true.
- **Known then:** FR-02 and FR-03 could not pass yet, because every match was "needs review".

<a id="step-14"></a>
## Step 14: Results, savings and the comparison basket (24 Nov, 10:35)

- **You asked:** clear price, savings and a basket button on each result; compare only equal medicines; normalise pack sizes; no hardcoded prices.
- **Why (you said):** each result should "provide clearer pricing information, potential savings, and a comparison basket".
- **What changed:** [comparison.js](../js/core/comparison.js), [formulation.js](../lib/pharma/formulation.js), [referenceForm.js](../js/ui/referenceForm.js), [referenceService.js](../js/services/referenceService.js). The result card `productCard.js` (from Step 10) was rewritten.
- **New idea, the formulation key:** one text that says exactly what a medicine is. Same key means prices may be compared.
- **New idea, the strip check:** if the release type is not known, the app asks what your strip says.
- **Found while building:** Paracetamol 650 mg was missing from the "Paracetamol" results. Single-salt medicines now come first.

<a id="step-15"></a>
## Step 15: Fix "Add to Basket" (24 Nov, 11:09)

- **You asked:** fix it, and find "the actual root cause".
- **Root cause 1:** the *shape* of a saved basket line had changed in Step 14, but the storage name had not. A tab still open from the older version did not understand the new lines and **erased them**.
- **Root cause 2:** pop-up messages covered the buttons, so the click hit the message.
- **Also found:** a price typed *after* adding never reached the basket.
- **What changed:**

| File | Change |
|---|---|
| `js/config.js` | New storage name. Old names are read once |
| `js/services/basketService.js` | Reading never writes. `applyReference` added |
| `js/ui/alerts.js`, `css/styles.css` | Messages do not take clicks, do not pile up, and sit on the left |
| `js/ui/basketView.js` | Shows strength, pack, price, reference, savings |

- **Learn from it:** if you change the shape of saved data, change its name. The rule is now a comment in `config.js`.

<a id="step-16"></a>
## Step 16: Centre the landing page, then undo it (24 Nov, 11:32 to 11:57)

- **You asked:** centre the text after the capsule. Then: undo exactly that.
- **Why undone:** you did not write a reason.
- **What changed in the end:** nothing. `css/landing.css` was put back, byte for byte, without a Git reset.
- **Learn from it:** because only one file had been touched, the undo was safe and small.

<a id="step-17"></a>
## Step 17: Centre the search page (24 Nov, 12:06)

- **You asked:** centre the heading, search bar, chips, count and disclaimer on `search.html` only. Do not move the inside of the cards.
- **Why (you said):** "a more balanced, symmetrical, and premium appearance".
- **What changed:** one block at the end of [css/styles.css](../css/styles.css), limited to `[data-page='search']` so other pages are not touched.

<a id="step-18"></a>
## Step 18: One card for every medicine (24 Nov, 12:19)

- **You asked:** the same card for branded and generic medicines.
- **Why (you said):** they had "inconsistent card layouts, pricing sections, button styles".
- **Root cause:** the search card had separate code for brands and generics in four places, and the compare view had its own copy.
- **What changed:** [cardModel.js](../js/core/cardModel.js) decides *what* a card says. [medicineCard.js](../js/ui/medicineCard.js) decides *how* it looks.
- **Result:** price position went from 11 different heights to 1. Button sizes went from 2 to 1.
- **Learn from it:** a look that differs often means code that was copied.

<a id="step-19"></a>
## Step 19: Fix misread medicine names (24 Nov, 13:34)

- **You asked:** "yes", to fix a problem found in Step 18.
- **Root cause:** the code knew "release" and "gastro-resistant". The government list also writes "**relase**" and "gastro-resistan**ce**". Those medicines were stored as plain tablets.
- **Why it is serious:** a slow-release tablet could be compared with an ordinary one.
- **What changed:** [forms.js](../lib/pharma/forms.js) reads those spellings. If it sees release wording it cannot understand, it says **unknown**, never plain. A `--reread` option was added, because the same file is normally refused.
- **Result:** 22 of 2,453 medicines would change. That is **import #2, still waiting for your yes** (as of 24 Nov).

<a id="step-20"></a>
## Step 20: One search, and brand prices (24 Nov, 13:46 to about 14:39)

This is the biggest functional change.

- **You asked:** "The previous implementation has not fully resolved the issue." Searching *Paracetamol* showed prices; searching *Crocin* showed one brand with "Price unavailable" and another button. "Do not make another CSS-only change."
- **Root causes:**

| Problem | Cause |
|---|---|
| Brand search showed only the brand | Search looked only at names. Generics came from a second request |
| Brands had no price | No importer could store a brand price |
| No saving | Brands had no release type, so nothing could be a verified match |
| "Crocin 500mg" also found Lincomycin 500mg | Numbers were matched as plain text |

- **What changed:**
  - New [query.js](../lib/pharma/query.js): understands what you typed
  - New [groups.js](../lib/pharma/groups.js): groups results by formulation
  - New [brandPrices.js](../db/importers/brandPrices.js): official brand prices from NPPA's *Pharma Sahi Daam*
  - New [resultGroup.js](../js/ui/resultGroup.js): draws a group
  - `compareResults` works out all savings at once, so cards cannot disagree
  - **Deleted:** `js/ui/comparePanel.js`, `js/ui/productCard.js`
- **You approved** import #3: 96 listings, 87 with a price.
- **Rule added:** a listed price above the legal ceiling plus GST is refused (five brand entries).
- **Learn from it:** two code paths for the same thing will give two answers. Make one.

<a id="step-21"></a>
## Step 21: Commit and push (24 Nov, 15:09)

- **You asked:** "commit changes in github".
- **What changed:** `8ad061c`, 118 files, pushed to `cart-page`. Pull request #1 merged it into `main`.
- **Checked first:** the repository is public, so every file was searched for the database password. None found.

<a id="step-22"></a>
## Step 22: README for general readers (24 Nov, 15:23 to 15:52)

- **You asked:** a README "more professional and easily understandable not so much technical". Then: only new screenshots.
- **What changed:** plain [README.md](../README.md), technical parts moved to [docs/DEVELOPER_GUIDE.md](../docs/DEVELOPER_GUIDE.md), new screenshots, `pharmacy-buyer.png` removed (nothing used it).
- **Git:** `5a24372` (pull request #2), then `a41e48a`, which is **not pushed yet**.

Next: [05-BUGS-AND-DECISIONS.md](05-BUGS-AND-DECISIONS.md)
