# Function notes 7: lib/import (reading files)

All made in Step 10 (phase 4). No later changes are recorded.

**Why this folder exists:** official lists are CSV or PDF files, with changing column names and broken lines.

## columns.js

[Source](../../lib/import/columns.js)

| Function | What | Why |
|---|---|---|
| `headerKey(h)` | "MRP (Rs.)" → "mrprs" | Compare headers without signs |
| `mapColumns(header, fields, overrides)` | Which column is which field | Each field lists names it accepts. A missing one stops the import |
| `findHeader(rows, fields, overrides)` | Finds the header in the first 15 rows | Lists often start with a title |
| `parseMapArgs(values)` | Reads `--map mrp="MRP in Rs"` | You can name a column yourself |

## csv.js

[Source](../../lib/import/csv.js)

### `parseCsv(input)`
- **What:** reads CSV into rows.
- **Why own code:** quotes, commas inside quotes, two line endings and a hidden first character (BOM) must be right. A file that ends inside a quote is refused, because it may be cut off.

## download.js

[Source](../../lib/import/download.js)

### `DownloadError` (class)
- **What:** an error with status and number of tries, stored by its `constructor`.

### `downloadFile(url, options)`
- **What:** downloads with a 60 s limit, up to 3 retries (waiting longer each time), 50 MB maximum.
- **Why:** your plan asked for retries with backoff. A 404 is not retried, because it will not change.
- **Note:** used only if an official file has a direct link. Today none has.

## pdfTable.js

[Source](../../lib/import/pdfTable.js)

A PDF has no table. It has words at positions. This file rebuilds the table.

| Function | What | Why |
|---|---|---|
| `extractPdfLines(bytes)` | Words grouped into lines by height | |
| `chunk(items)` | Joins neighbouring words into one cell | |
| `mergeHeaderLines(a, b)` | "MRP" over "(Rs.)" → one header | Headers can have two lines |
| `overlap(a, b)`, `center(c)` | Position helpers | |
| `columnFor(columns, patterns, item)` | Which column a word belongs to | A serial number column accepts only numbers |
| `median(values)` | Middle value | The normal distance between lines |
| `place(usePatterns)` | Puts the words of one line into cells | Inside `extractPdfTable` |

### `extractPdfTable(bytes, fields, { anchors, overrides })`
- **What:** the full table. A row is found by its *anchor* (for example, the price). Wrapped lines join the nearest row.
- **Why:** lines that cannot be placed are returned in `unassigned` and shown in the report. They are never guessed into a row. A scanned PDF has no text, and gives a clear error.
- **Result on a real list:** 843 of 887 rows of NPPA's 2020 PDF were read.
