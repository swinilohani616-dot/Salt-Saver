-- Phase 4: import pipeline (download -> parse -> diff -> approve -> commit).

-- The exact bytes of every imported file, kept for audit. Official lists are a
-- few MB at most, well inside the Supabase free tier.
create table source_file_blobs (
  source_file_id bigint primary key references source_files (id) on delete cascade,
  content        bytea not null,
  created_at     timestamptz not null default now()
);
alter table source_file_blobs enable row level security;

-- Parsed form of each row (normalised fields), next to the raw row.
alter table source_records add column parsed jsonb;
alter table source_records add column warnings jsonb not null default '[]'::jsonb;
alter table source_records add column location text;            -- 'row 12' (CSV) or 'page 3, line 40' (PDF)

-- The review report is stored with the diff so it can be read from anywhere.
alter table import_diffs add column report_md text;
alter table import_diffs add column file_format text;           -- 'csv' or 'pdf'
alter table import_diffs add column effective_from date;        -- the "as on" date of the list, when known

-- Only one pending review per source at a time keeps approvals unambiguous.
create unique index import_diffs_one_pending_per_source on import_diffs (source_id) where status = 'pending';
