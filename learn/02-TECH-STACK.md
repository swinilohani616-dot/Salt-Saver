# 2. Tech stack

A tech stack is the list of tools a project is built with. All of these are free.

## The whole list

| Part | Tool | One line |
|---|---|---|
| Page structure | HTML5 | What is on the page |
| Styling | CSS3, Bootstrap 5.3.3 | How it looks |
| Behaviour | JavaScript (ES modules), no framework | What happens when you click |
| Icons and font | Bootstrap Icons 1.11.3, IBM Plex Sans | Small pictures and letters |
| 3D capsule | Three.js 0.158, GSAP 3.12.5 | Front page animation |
| Server language | Node.js 20.12 or newer | Runs JavaScript outside the browser |
| Server framework | Express 5 | Answers web requests |
| Database | Postgres on Supabase (free tier) | Stores medicines and prices |
| Database driver | `pg` 8 | Lets Node talk to Postgres |
| Test database | PGlite 0.6 | A small Postgres that runs inside Node |
| PDF reading | pdf.js (`pdfjs-dist` 6) | Reads government PDF tables |
| Browser storage | localStorage, sessionStorage | Keeps your basket on your device |
| Tests | `node:test` and a small own harness | Check that the code is right |
| Automation | GitHub Actions | Runs tests and the data check |
| Hosting (planned) | Vercel Hobby | Puts the site online |
| Version control | Git and GitHub | Keeps the history |

Only four npm packages are installed: `express`, `pg`, `pdfjs-dist`, and `@electric-sql/pglite` (for tests and local use). See [package.json](../package.json).

## Why each one

### HTML, CSS and plain JavaScript (no React)
- **What:** the three languages every browser understands.
- **Why:** the PRD asked for HTML5, CSS3, vanilla JavaScript and Bootstrap 5. There is **no build step**: what you write is what the browser runs.
- **Where:** [index.html](../index.html), [search.html](../search.html), [cart.html](../cart.html), [css/](../css/), [js/](../js/).
- **Cost of this choice:** no framework redraws the screen for you, so the project has its own small helpers ([dom.js](../js/ui/dom.js) and [store.js](../js/state/store.js)).

### ES modules
- **What:** splitting JavaScript into files with `import` and `export`.
- **Why:** each file has one job, and the server can reuse browser files.
- **Catch:** modules do not work if you double-click the HTML file. The site must be *served* (`npm start`).

### Bootstrap 5
- **What:** ready-made CSS and small components (pop-up dialogs, toasts, grid).
- **Why:** PRD requirement, and it gives working phone layouts quickly.
- **Where it shows:** the role pop-up, the confirm pop-up, notifications, columns.

### Node.js and Express
- **What:** Node runs JavaScript on a computer. Express makes it answer web addresses like `/api/search`.
- **Why:** **You asked** (Step 7): "If there is no backend yet, use Node.js + Express." Using JavaScript on both sides also means the matching code is shared, not written twice.
- **Where:** [server/app.js](../server/app.js).

### Postgres and Supabase
- **What:** Postgres is a database: tables with rows. Supabase is a company that hosts one for free.
- **Why:** **You asked** for "Postgres (Supabase free tier)". A JSON file of 28 made-up medicines could not hold 2,453 real ones with price history and sources.
- **Where:** tables in [db/migrations/](../db/migrations/), connection in [server/db.js](../server/db.js).
- **Know this:** a free project pauses after about a week without use.

### PGlite
- **What:** real Postgres squeezed into a file that runs inside Node.
- **Why:** **Design choice.** Tests need a clean database every time, and `npm run dev:local` lets anyone try the project without a Supabase account.
- **Where:** [server/pgliteDb.js](../server/pgliteDb.js).

### pdf.js
- **What:** Mozilla's library that reads PDF files.
- **Why:** NPPA and PMBI publish lists as PDF. Their PDFs are text placed at positions, not real tables, so the code rebuilds the rows ([pdfTable.js](../lib/import/pdfTable.js)).

### Three.js and GSAP
- **What:** Three.js draws 3D. GSAP moves things smoothly, here tied to scrolling.
- **Why:** **You gave** your own capsule landing page design (Step 11). If they fail to load, the page still works without the capsule.
- **Where:** [js/landing.js](../js/landing.js).

### IBM Plex Sans
- **Why:** **You asked** for "more professional and good looking font" (Step 13). Six fonts were compared. This one has a real ₹ sign, and its `I`, `l` and `1` look different, which matters for drug names and doses.

### localStorage and sessionStorage
- **What:** small storage inside the browser. localStorage stays; sessionStorage is forgotten when the tab closes.
- **Why:** no login is needed, and your basket and typed prices never leave your device.

### GitHub Actions
- **What:** GitHub runs your commands on its computers.
- **Why:** [test.yml](../.github/workflows/test.yml) runs the tests on every push. [data-check.yml](../.github/workflows/data-check.yml) checks twice a week whether the prices are old. **You asked** for free scheduled jobs (Step 7).

### Vercel
- **What:** hosting for websites and small server functions.
- **Why:** free, and it runs the Express app as one function ([api/index.js](../api/index.js)). GitHub Pages alone stopped being possible when the site started needing a server.

## How the stack changed

| | Version 1 (19 Nov) | Version 2 (23 Nov) | Now (24 Nov) |
|---|---|---|---|
| Pages | 1 | 2 (search, cart) | 3 (landing, search, cart) |
| Data | JSON file, 28 medicines | same | Postgres, official lists |
| Server | none | none | Express API |
| npm packages | 0 | 0 | 4 |
| Search runs in | the browser | the browser | the server |
| Font | Atkinson Hyperlegible | Inter | IBM Plex Sans |
| Look | green | navy and teal | dark with coral |
| Tests | 27 | 27 | 60 + 126 |

Next: [03-ARCHITECTURE.md](03-ARCHITECTURE.md)
