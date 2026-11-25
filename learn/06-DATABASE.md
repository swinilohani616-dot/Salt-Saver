# 6. The database

A database is a set of tables. A table has columns (what kind of information) and rows (one thing each).

SaltSaver has **20 tables**. They are made by *migrations*: numbered SQL files that run once, in order.

## The migrations

| File | What it adds | Why | Step |
|---|---|---|---|
| [001_initial_schema.sql](../db/migrations/001_initial_schema.sql) | 17 tables | Your plan listed them | 8 |
| [002_reference_data.sql](../db/migrations/002_reference_data.sql) | 5 sources, 16 forms, 7 release types | Fixed lists the code needs | 8 |
| [003_normalisation.sql](../db/migrations/003_normalisation.sql) | 7 more forms, XL and PR, `composition_key`, "eq. to" columns | Real names need them | 10 |
| [004_import_pipeline.sql](../db/migrations/004_import_pipeline.sql) | Raw file storage, warnings, one pending review per source | Safe imports | 10 |
| [005_nppa.sql](../db/migrations/005_nppa.sql) | 6 more forms, ceiling columns, ceiling history | NPPA list | 10 |
| [006_brand_review.sql](../db/migrations/006_brand_review.sql) | Source `brand_review` | Brands checked from the pack | 10 |
| [007_brand_prices.sql](../db/migrations/007_brand_prices.sql) | Source `nppa_brand_mrp` | Verified brand prices | 20 |

**Why migrations and not one big file:** a database that already has data cannot be rebuilt. A new file adds the change, and the table `schema_migrations` remembers which files ran.

## The tables

### Where data comes from

| Table | Each row is | Important columns |
|---|---|---|
| `schema_migrations` | One migration that ran | `version` |
| `data_sources` | One source (7 of them) | `kind`, `stale_after_days`, `last_success_at` |
| `source_files` | One imported file | `checksum_sha256`, `downloaded_at` |
| `source_file_blobs` | The exact bytes of that file | `content` |
| `source_records` | One row of a file | `raw`, `parsed`, `parse_status`, `warnings` |
| `import_diffs` | One review | `status`, `summary`, `changes`, `report_md`, `reviewed_by` |
| `sync_logs` | One job and its result | `job`, `status`, `message` |
| `data_conflicts` | Two records that disagree | `field`, `values_json` |

### Medicines

| Table | Each row is | Important columns |
|---|---|---|
| `ingredients` | One salt, Indian name | `normalized_name` |
| `ingredient_aliases` | Another name for it | `acetaminophen` → Paracetamol |
| `dosage_forms` | One form (29) | `code`, `default_route`, `unit_basis` |
| `release_types` | One release type (9) | `ir`, `sr`, `er`, `xr`, `xl`, `mr`, `cr`, `pr`, `dr` |
| `products` | One brand or generic | `product_type`, `is_jan_aushadhi`, `composition_key`, `is_active` |
| `product_ingredients` | One salt inside one product | `strength_value`, `strength_unit`, `per_value`, `per_unit` |
| `pack_sizes` | One pack | `label` "10's", `unit_count` 10 |

### Prices

| Table | Each row is |
|---|---|
| `prices` | One price. `is_current` says if it is today's. `price_type` is `mrp` or `illustrative` |
| `price_history` | Every change of a price, written automatically |
| `nppa_ceiling_prices` | Legal maximum per unit, without GST |
| `nppa_ceiling_history` | Every change of a ceiling |

### Matching

| Table | Each row is |
|---|---|
| `match_results` | One stored answer: this brand, this generic, this status, these reasons |

## How a medicine is stored

"Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg" becomes:

```
products             1 row   name, form = tablet, release = ir
product_ingredients  2 rows  Amoxycillin     500 mg
                             Clavulanic Acid 125 mg  (salt form: potassium)
pack_sizes           1 row   "10's" = 10 tablet
prices               1 row   mrp, is_current = true
```

## Database functions (written in SQL)

| Function | What | Why |
|---|---|---|
| `set_updated_at()` | Sets `updated_at` to now on every change | So cards can show "updated 24 Nov 2026" |
| `record_price_history()` | Copies a price into `price_history` when it is added or really changes | You asked that nothing is silently overwritten |
| `record_ceiling_history()` | The same for ceilings | Same reason |

They run by themselves because of *triggers*. The code cannot forget to call them.

## Rules the database itself enforces

| Rule | How |
|---|---|
| One current price per product, source, type and pack | Unique index `prices_one_current_uq` |
| One pending review per source | Unique index |
| A strength must have a unit | `check` |
| A drug code only for Jan Aushadhi products | `check` |
| A price cannot be negative | `check` |
| The same file cannot be stored twice | Unique `source_id` + checksum |
| The public cannot read any table | Row level security on, with no policies |

## Words

- **Primary key:** the column that identifies a row (`id`).
- **Foreign key:** a column that points to another table (`product_id`).
- **Index:** like the index of a book. It makes finding rows fast.
- **Trigram index** (`pg_trgm`): finds names that are *close*, so a spelling mistake still works.
- **JSONB:** a column that holds JSON.

Next: [07-API.md](07-API.md)
