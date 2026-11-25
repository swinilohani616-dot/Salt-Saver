# Learn SaltSaver: start here

These notes explain the whole project as if you have never seen it. You do not need to know any of it before you begin.

## SaltSaver in one minute

You type the name on your medicine strip, like **Crocin**. SaltSaver finds the **salt** inside it (paracetamol 500 mg). Then it shows the **Jan Aushadhi generic** with the same salt, and how much money you could save.

It is a website with three parts:

```
1. The pages you see        (HTML, CSS, JavaScript in the browser)
2. The server               (Node.js + Express, answers questions from the pages)
3. The database             (Postgres on Supabase, holds medicines and prices)
```

It only compares prices. It does not sell medicines and does not give medical advice.

## Read in this order

| # | File | What you learn |
|---|---|---|
| 1 | [01-THE-PROJECT.md](01-THE-PROJECT.md) | What the project is, who it is for, what works today |
| 2 | [11-GLOSSARY.md](11-GLOSSARY.md) | The words. Keep this open while you read the rest |
| 3 | [02-TECH-STACK.md](02-TECH-STACK.md) | Every technology, what it is, and why it was picked |
| 4 | [03-ARCHITECTURE.md](03-ARCHITECTURE.md) | How the parts connect, with step-by-step flows |
| 5 | [04-MY-STEPS.md](04-MY-STEPS.md) | All 22 steps you took, what you asked, why, and what changed |
| 6 | [05-BUGS-AND-DECISIONS.md](05-BUGS-AND-DECISIONS.md) | Problems, their causes, and the choices made |
| 7 | [06-DATABASE.md](06-DATABASE.md) | Every table |
| 8 | [07-API.md](07-API.md) | Every address the server answers |
| 9 | [08-PAGES-HTML-CSS.md](08-PAGES-HTML-CSS.md) | The three pages and the styling |
| 10 | [functions/](functions/) | Notes on **every function**, one file per part of the code |
| 11 | [09-TESTS.md](09-TESTS.md) | How the project checks itself |
| 12 | [10-COMMANDS-AND-DEPLOY.md](10-COMMANDS-AND-DEPLOY.md) | How to run it and put it online |
| 13 | [12-QUIZ.md](12-QUIZ.md) | Test yourself, useful before a viva |

## The function notes

| File | Code it explains |
|---|---|
| [01-app-config-store.md](functions/01-app-config-store.md) | `js/app.js`, `js/config.js`, `js/state/` (start-up, settings, shared state) |
| [02-js-core.md](functions/02-js-core.md) | `js/core/` (pure maths and rules) |
| [03-js-services.md](functions/03-js-services.md) | `js/services/` (talking to the server and browser storage) |
| [04-js-ui.md](functions/04-js-ui.md) | `js/ui/` (drawing the screen) |
| [05-landing-page.md](functions/05-landing-page.md) | `js/landing.js` (the 3D capsule page) |
| [06-lib-pharma.md](functions/06-lib-pharma.md) | `lib/pharma/` (reading medicine names, matching) |
| [07-lib-import.md](functions/07-lib-import.md) | `lib/import/` (reading CSV and PDF files) |
| [08-server.md](functions/08-server.md) | `server/` (the API) |
| [09-db.md](functions/09-db.md) | `db/` (database, import pipeline, matching) |
| [10-db-importers.md](functions/10-db-importers.md) | `db/importers/` (one reader for each official list) |
| [11-scripts-and-deploy.md](functions/11-scripts-and-deploy.md) | `scripts/`, `api/`, GitHub Actions |

Each function note answers three questions:

- **What:** what it does.
- **Why:** why the project needs it.
- **Changed:** what was changed later and the reason. If there is no "Changed" line, it has stayed the same since it was first made.

## Where the reasons come from

The reasons are not guesses. They come from three places, and the notes say which:

| Label | Meaning |
|---|---|
| **You asked** | From a message you typed |
| **Found while building** | A problem that showed up during the work |
| **Design choice** | Decided during the build, without you asking for it |

When no reason was written down anywhere, the note says so.

**Who wrote the code:** you decided what to build and described each change. Claude Code wrote the code from your requests. The commits say `Co-Authored-By: Claude`. Say this honestly if someone asks.

*Written on 25 November 2026. If the code changes after that, the code is right and these notes are old.*
