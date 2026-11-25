# Function notes 11: scripts and deployment

Scripts are what `npm run ...` starts. Most have no functions of their own: they connect, call a function from `db/` or `server/`, print, and close.

| File | Command | What | Made in |
|---|---|---|---|
| [db-migrate.js](../../scripts/db-migrate.js) | `db:migrate` | Calls `migrate` | 8 |
| [db-seed.js](../../scripts/db-seed.js) | `db:seed` | Calls `seedLegacy`. `--force` imports again | 8, 10 |
| [dev-local.js](../../scripts/dev-local.js) | `dev:local` | Local database, demo data, server | 8 |
| [db-reference.js](../../scripts/db-reference.js) | `db:reference` | Calls `loadReferenceData` | 10 |
| [import.js](../../scripts/import.js) | `import:*` | Imports | 10, 19 |
| [match-refresh.js](../../scripts/match-refresh.js) | `match:refresh` | Calls `refreshMatches` | 10 |
| [brands-template.js](../../scripts/brands-template.js) | `brands:template` | Makes a CSV to fill in | 10, 20 |
| [check-sources.js](../../scripts/check-sources.js) | `check:sources` | Calls `checkSources` | 10 |
| [data-status.js](../../scripts/data-status.js) | `data:status` | Shows what is loaded | 10 |
| [seedReport.js](../../scripts/seedReport.js) | (helper) | Prints a seed result | 8 |

## Functions

### import.js
| Function | What | Why |
|---|---|---|
| `usage()` | Prints help | When called wrongly |
| `saveReport(id, sourceId, markdown)` | Writes to `imports/reports/` | You read it before approving |
| `printSummary(s)` | Short numbers | |
| `stage(db, sourceId)` | Reads or downloads the file and stages it | Nothing in the catalogue changes |

**Changed (Step 19):** `--reread`. The same file is normally refused, but the reader had been improved.

### brands-template.js
- `q(v)`: puts quotes around a value if it has a comma. **Why:** otherwise the CSV breaks.
- **Changed (Step 20):** an MRP column.

### seedReport.js
- `printSeedResult({ skipped, checksum, stats })`: prints what was imported. **Why:** two scripts need the same text.

### check-sources.js
- No functions. With `--fail-on-attention` it ends with an error, so GitHub emails you.

## Deployment files

| File | What | Why |
|---|---|---|
| [api/index.js](../../api/index.js) | Express app for Vercel, one connection | Each Vercel function should hold few connections |
| [vercel.json](../../vercel.json) | `/api/*` goes to that function | Vercel serves the pages itself |
| [.vercelignore](../../.vercelignore) | Not uploaded: `.env`, server tests, `imports/` | Secrets and files the site does not need |
| [.github/workflows/test.yml](../../.github/workflows/test.yml) | Tests on every push | Errors are seen early |
| [.github/workflows/data-check.yml](../../.github/workflows/data-check.yml) | Monday and Thursday 09:00, and 1–7 April | Old prices are noticed. It also keeps the free Supabase project awake |
| [.gitignore](../../.gitignore) | Not in Git: `node_modules`, `.env`, `imports/` | |
| [.env.example](../../.env.example) | Template for `.env` | Shows the names without the secrets |
| [package.json](../../package.json) | Packages and commands | |
