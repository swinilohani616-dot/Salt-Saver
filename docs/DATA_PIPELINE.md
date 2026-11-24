# Importing official data

This is the runbook for keeping SaltSaver's medicine data current. It covers where each official file comes from, how to import it, how to review and approve the changes, and how to check that users see real data.

Every import follows the same path: **download → stage → review → approve**. Nothing reaches the catalogue until someone approves it, and every approved change is logged with its source file and checksum.

| Source | What it provides | Where to get it | Expected refresh | Stale after |
|---|---|---|---|---|
| Jan Aushadhi product list (PMBI) | Drug code, generic name, unit size, MRP (incl. taxes), group | [janaushadhi.gov.in › Product MRP list](https://janaushadhi.gov.in/product-portfolio/product-mrp-list) | When PMBI updates it (checked weekly) | 60 days |
| NPPA ceiling prices | Legal maximum price per unit (excl. GST) for scheduled formulations | [nppa.gov.in › Compendium of price](https://www.nppa.gov.in/en/compendiumofprice) | 1 April every year, plus notifications | 400 days |
| Branded medicine MRPs (NPPA) | Brand, strength, form, pack and MRP (incl. taxes) | [Pharma Sahi Daam › Medicine Price](https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine) | Monthly | 90 days |
| Brand review | Brand composition, form, release type and printed MRP, checked from the pack | Filled in by you (`npm run brands:template`) | When you add brands | — |

## Before you start

1. Finish the setup in the [developer guide](DEVELOPER_GUIDE.md#run-locally): `npm install`, then put `DATABASE_URL` in `.env` and run `npm run db:setup`.
2. **Ask PMBI for permission.** PMBI's copyright page says its material "may be reproduced free of charge after taking proper permission by sending a mail to us", and the source must be acknowledged. Send that email before you publish SaltSaver. The app already names the source on every Jan Aushadhi price.
3. NPPA's copyright policy (https://www.nppa.gov.in/en/copyrightpolicy, read 24 Nov 2026) allows its material to be reproduced free of charge without specific permission, if it is reproduced accurately and the source is prominently acknowledged. The app names NPPA on every brand price. The price look-up itself is on nppaipdms.gov.in, which links no separate policy.

## 1. Jan Aushadhi list

1. Open https://janaushadhi.gov.in/product-portfolio/product-mrp-list and click **Download CSV**. CSV is the most reliable format; PDF also works.
2. Stage it, with the "as on" date printed on the list if there is one:

   ```bash
   npm run import:ja -- --file ~/Downloads/<file>.csv --as-of 2026-11-20
   ```

   The command prints a summary and writes a report to `imports/reports/import-<id>-pmbi_product_list.md`:

   ```
   Staged import #3 for review (nothing has changed in the catalogue yet).
     rows 2439: read 2401, failed 38, with warnings 120
     new 2401, changed 0, removed 0, unchanged 0
   ```

3. Read the report. It lists:
   - new, changed and removed products, with what changed;
   - rows that could not be read, with the reason (nothing is guessed);
   - rows imported with warnings, such as a composition or pack size that could not be read, or an MRP of 0 (PMBI's "under process");
   - ingredient names not in the alias list (see section 6).
4. Approve or reject it:

   ```bash
   npm run import:approve -- 3 --by "Your name"
   npm run import:reject  -- 3 --note "wrong file"
   ```

   After approval, run `npm run match:refresh` to update the stored match results.

**If the headers differ.** If PMBI renames a column, staging stops and lists the headers it found. Map the column by hand:

```bash
npm run import:ja -- --file list.csv --map mrp="MRP (in Rs.)" --map unitSize="Pack"
```

Fields: `drugCode`, `genericName`, `unitSize`, `mrp`, `group`.

**If the reading rules change.** The same file is normally refused as "no new version". After a fix in `lib/pharma/`, read the newest imported file again with `--reread`:

```bash
npm run import:ja -- --file <same file>.csv --as-of <same date> --reread
```

It is staged for review like any import, and the report lists only the rows that now read differently. An older file cannot be read again once a newer list has been imported.

## 2. NPPA ceiling prices

1. Open https://www.nppa.gov.in/en/compendiumofprice and follow the **Compendium of Prices** link for the current year. It opens the IPDMS dashboard. Download the list as CSV (or PDF).
2. Stage it with the date the prices take effect:

   ```bash
   npm run import:nppa -- --file ~/Downloads/<file>.csv --as-of 2026-04-01
   ```

3. Review and approve it as in section 1.

Things to know about NPPA data:
- **Units and pack sizes.** Ceiling prices are per unit, as given in the Unit column ("1 Tablet", "1 ml", "Each Pack (10 ml)"). NPPA prices pack sizes and glass or non-glass containers separately, so these are kept apart.
- **GST.** Ceiling prices exclude GST. The app adds 5% GST before warning that an MRP is above the ceiling (`GST_RATE_FOR_CEILING_CHECK` in `js/core/unitSavings.js`). Check that rate if GST on medicines changes.
- **Notification PDFs.** Ad-hoc notifications can be imported as PDFs if they use the usual table layout. If one cannot be read, copy its rows into a CSV with the headers `Medicines, Dosage form and Strength, Unit, Ceiling price, S.O. No, Date` and import that.
- **Tested on a real file.** The PDF reader was tested on NPPA's 30.09.2020 list: it read 843 of 887 rows. The other 44 rows (stents, medical gases, IUDs, IV fluids "with special features", and rows missing a strength) are listed in the report and left out.

## 3. Brand details (to get verified matches)

The demo dataset gives each brand's ingredients and strengths, but not its dosage form, release type or salt form. The matching engine therefore can only say **needs review** for those brands, and the app shows **no savings** for them. To fix that for a brand, check its pack:

```bash
npm run brands:template          # writes imports/brand-review.csv, pre-filled with the demo brands
```

For each row, compare the medicine's own strip or carton with the CSV:
- correct the composition if needed, e.g. `Paracetamol 650 mg`;
- set the dosage form (`Tablet`, `Capsule`, `Syrup`, …);
- set the release type: `IR` if nothing special is printed, otherwise `SR`, `ER`, `XR`, `XL`, `MR`, `CR`, `PR`, or `DR` for enteric coated or gastro-resistant;
- optionally write the MRP printed on that same pack (it needs the pack size);
- write your name in "Checked by".

Then import it like any other source:

```bash
npm run import:brands -- --file imports/brand-review.csv
npm run import:approve -- <id> --by "Your name"
npm run match:refresh
```

You can also add brands that are not in the demo data by adding rows to the CSV.

## 4. Branded medicine MRPs

NPPA's public **Pharma Sahi Daam** page shows the MRP of branded medicines. It has no download, so the rows are looked up by hand and kept in a CSV.

1. Open https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine, choose **Medicine Price**, then **Formulation**, and pick the formulation (e.g. TELMISARTAN). Searching by formulation is what ties a brand to its salts.
2. Copy the rows of the brands you want, exactly as listed, into a CSV:

   ```
   Medicine Name,Formulation,Dosage forms,Status,Ceiling Price,M.R.P / Unit,Release type,Evidence,Notes
   TELMA 40 MG TABLET 15,TELMISARTAN,TABLET,Scheduled,6.92,108.36/15 TABLET,,,
   ```

   - *Dosage forms*: every form the page offers for that formulation ("TABLET; TABLET SR"). Leave it blank if you did not look; the release type is then unknown.
   - *Release type* and *Evidence*: only when the pack or the manufacturer states it. Say where.
   - *Notes*: anything the reviewer should know.
3. Stage, review and approve it:

   ```bash
   npm run import:brand-prices -- --file imports/inbox/nppa_brand_mrp/<file>.csv --as-of <date looked up>
   npm run import:approve -- <id> --by "Your name"
   npm run match:refresh
   ```

What the importer refuses, and why:
- **Prices above the legal ceiling plus 5% GST** are out of date or wrong. The medicine is kept, its price is not.
- **Liquids** are left out: a listing says "120 MG SUSPENSION" without the volume.
- **"TABLET" is not taken to mean a plain tablet** unless nothing else is possible. Glycomet GP (sustained release), Metolar XT (extended release) and Ecosprin (enteric coated) are all listed as TABLET. When the listing does not settle it, the app asks the user to check the strip.
- **Dispensing packs** (more than 150 units) are left out.
- **A file must hold every brand you want to keep.** Brands missing from a newer file are deactivated.

## 5. Downloading from a URL

If an official file ever has a stable direct link, you can download and stage it in one step. Downloads use a 60-second timeout, retry up to 3 times with exponential backoff, refuse files over 50 MB, and change nothing if they fail.

```bash
npm run import:ja -- --download https://example.gov.in/path/list.csv
```

To have the scheduled check pick up new versions automatically, set `PMBI_LIST_URL` or `NPPA_LIST_URL` (see section 7). Do not point these at a website's internal endpoints; use only files the site publishes for download.

## 6. Ingredient names

`db/reference/ingredients.js` lists ingredients by their Indian names, with their aliases: the INN or US name, older British spellings, abbreviations and salt spellings. Examples: paracetamol / acetaminophen / PCM, amoxycillin / amoxicillin, salbutamol / albuterol, adrenaline / epinephrine.

Each import report lists the ingredient names that are not in this list. When one is really another name for a listed ingredient, add it as an alias and run `npm run db:reference`. The loader also merges any duplicate ingredients that were already imported.

## 7. Scheduled check

`.github/workflows/data-check.yml` runs `npm run check:sources` on Mondays and Thursdays at 09:00 IST, and daily from 1 to 7 April. Each run:
- marks a source as stale when its last approved import is older than 60 days (Jan Aushadhi), 400 days (NPPA ceilings) or 90 days (brand MRPs);
- flags NPPA's annual revision (effective 1 April) until you import it;
- reminds you about imports that have been waiting for review for more than 7 days;
- downloads and stages a new file version when `PMBI_LIST_URL` or `NPPA_LIST_URL` is set. It never approves anything.

The run fails when something needs your attention, and GitHub then emails you. The run also queries the database, which keeps a free Supabase project from pausing after a week without activity.

To set it up, push the repository to GitHub, then go to **Settings → Secrets and variables → Actions**:
- add a **secret** `DATABASE_URL` with the Supabase *Session pooler* connection string;
- optionally add **variables** `PMBI_LIST_URL` and `NPPA_LIST_URL`.

GitHub turns off scheduled workflows after 60 days without commits in a repository. If the check stops running, re-enable it from the Actions tab.

## 8. Checking that users see real data

Real data is in use when all of the following hold:

1. `npm run data:status` shows `pmbi_product_list` as `ok`, with a non-zero count of "Jan Aushadhi products (official PMBI list)".
2. `GET /api/status` returns `"officialDataImported": true`.
3. In the app:
   - the footer reads "Jan Aushadhi MRP list (PMBI): updated <date>";
   - every card ends with its source and date, such as "Source: NPPA Pharma Sahi Daam (official MRP), updated <date>";
   - prices from official lists are tagged "Verified price", and your own MRP "Entered by you";
   - brands from the demo data are tagged "Demo data" and "No verified price".
4. Demo prices never reach users. The legacy generics ("Jan Aushadhi Paracetamol 500mg" and so on) are never search results or alternatives, and a brand's price is shown only when an official list or a checked pack gives it. The tests check this (`tests/server/search.test.js`, `tests/server/api.test.js`).

## Logs and history

| Table | What it holds |
|---|---|
| `source_files` and `source_file_blobs` | Every imported file: its bytes, SHA-256 checksum and date |
| `source_records` | Every row as read, with parse errors and warnings |
| `import_diffs` | Every review: pending, approved and committed, or rejected; the report; who approved it |
| `price_history`, `nppa_ceiling_history` | Every price change. Old prices are retired, never overwritten |
| `sync_logs` | Every seed, parse, diff, commit, download and stale check, with its outcome |
| `data_conflicts` | Values that two records disagree on. Both values are kept |
