# 10. Commands and deployment

## Run it

```bash
npm install            # once: downloads the packages
npm run dev:local      # quick: local database, demo brands only
npm start              # real: your Supabase database
```

Then open http://localhost:3000. Stop with `Ctrl + C`.

**It must be served.** Double-clicking `index.html` does not work, because modules and the API need a server.

**Why the site stops:** when Claude starts it, it stops when that session ends. Start it yourself in a terminal to keep it running.

## All commands

| Command | What |
|---|---|
| `npm start` | Site and API with Supabase |
| `npm run dev:local` | Site and API with a local database |
| `npm test` | All tests |
| `npm run db:setup` | Migrations, then names, then demo data |
| `npm run db:migrate` | Only the tables |
| `npm run db:reference` | Only salt names and aliases |
| `npm run db:seed` | Only the demo brands |
| `npm run import:ja -- --file x.csv --as-of 2026-11-20` | Stage a Jan Aushadhi list |
| `npm run import:nppa -- --file x.csv` | Stage NPPA ceilings |
| `npm run import:brand-prices -- --file x.csv` | Stage brand prices |
| `npm run import:brands -- --file x.csv` | Stage brands checked from the pack |
| `npm run import:list` | All imports |
| `npm run import:show -- 2` | Read report number 2 |
| `npm run import:approve -- 2 --by "Your name"` | Save it |
| `npm run import:reject -- 2` | Throw it away |
| `npm run match:refresh` | Recompute stored matches |
| `npm run brands:template` | Make a CSV to check brands |
| `npm run check:sources` | Is the data old? |
| `npm run data:status` | What is loaded now |

## The `.env` file

It holds secrets and is **never** put in Git. Copy [.env.example](../.env.example) to `.env`.

| Name | What |
|---|---|
| `DATABASE_URL` | Address and password of the database |
| `DATABASE_SSL` | `require` (default), `verify` or `disable` |
| `DATABASE_SSL_CA_FILE` | Certificate, only for `verify` |
| `PORT` | 3000 if empty |
| `PMBI_LIST_URL`, `NPPA_LIST_URL` | Normally empty |

If your password has `#`, write `%23`. Why: see [Step 9](04-MY-STEPS.md#step-9).

## Add new prices

1. Download the official file by hand.
2. Stage it. Nothing changes yet.
3. Read the report in `imports/reports/`.
4. Approve or reject.
5. `npm run match:refresh`

Full guide: [docs/DATA_PIPELINE.md](../docs/DATA_PIPELINE.md).

## Put it online (not done yet)

1. Send PMBI the permission email first.
2. On vercel.com, import the GitHub repository. Preset **Other**, no build command, output directory `.`
3. Add `DATABASE_URL` with Supabase's **Transaction pooler** link (port 6543).
4. On GitHub, add the secret `DATABASE_URL` (Session pooler) for the data check.

**Why two different links:** a Vercel function starts and stops all the time, so it needs the transaction pooler. Your computer stays connected, so it uses the session pooler.

**Why not GitHub Pages:** it can only serve files. SaltSaver needs a server.

## Git

| Word | Meaning |
|---|---|
| commit | A saved point in history |
| push | Send commits to GitHub |
| branch | A separate line of work. Yours is `cart-page` |
| pull request | A request to put a branch into `main` |
| merge | Doing it |

Your history: `810c639` → `319672d` → `8ad061c` (PR #1) → `5a24372` (PR #2) → `a41e48a` (not pushed).

```bash
git log --oneline          # the list
git show 8ad061c --stat    # what one commit changed
git show 810c639:js/core/search.js   # an old file that no longer exists
```

Next: [11-GLOSSARY.md](11-GLOSSARY.md)
