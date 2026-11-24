-- SaltSaver schema, version 1.
-- Runs on Supabase Postgres (15+) and on PGlite (tests, local dev).
--
-- Rules carried by the schema:
--   * every data row records its source (source_id) and when it was written;
--   * prices are never overwritten: a new price row is added, the old one is
--     marked is_current = false, and a trigger copies every change to price_history;
--   * when two sources disagree, both values are kept and a data_conflicts row is opened;
--   * row level security is on for every table with no policies, so Supabase's
--     public REST API (anon / authenticated keys) can read nothing. Only the
--     backend, connecting with the database connection string, can read or write.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- helpers

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- sources

create table data_sources (
  id                    text primary key,          -- 'pmbi_product_list', 'nppa_ceiling_prices', 'legacy_json', ...
  name                  text not null,
  publisher             text,
  homepage_url          text,
  kind                  text not null check (kind in ('official', 'legacy', 'user_entered', 'curated')),
  expected_refresh_days integer,
  stale_after_days      integer,
  notes                 text,
  last_checked_at       timestamptz,
  last_success_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table source_files (
  id              bigint generated always as identity primary key,
  source_id       text not null references data_sources (id),
  url             text,                            -- page or file the copy came from; null for files in this repo
  file_name       text not null,
  storage_path    text,                            -- where the raw copy is kept (Supabase Storage path or repo path)
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size       bigint,
  content_type    text,
  version_label   text,                            -- e.g. 'as on 20.11.2026'
  downloaded_at   timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (source_id, checksum_sha256)
);

create table sync_logs (
  id             bigint generated always as identity primary key,
  source_id      text not null references data_sources (id),
  source_file_id bigint references source_files (id),
  job            text not null check (job in ('download', 'parse', 'diff', 'commit', 'seed', 'stale_check')),
  status         text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  message        text,
  stats          jsonb not null default '{}'::jsonb,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index sync_logs_source_idx on sync_logs (source_id, started_at desc);

-- ---------------------------------------------------------------- reference data

create table dosage_forms (
  id            smallint generated always as identity primary key,
  code          text not null unique,              -- 'tablet', 'dry_syrup', 'injection_vial', ...
  name          text not null,
  default_route text not null,                     -- 'oral', 'parenteral', 'topical', ...
  unit_basis    text not null,                     -- unit used for per-unit prices: 'tablet', 'ml', 'vial', 'g', ...
  source_id     text not null references data_sources (id),
  created_at    timestamptz not null default now()
);

create table release_types (
  id          smallint generated always as identity primary key,
  code        text not null unique,                -- 'ir', 'sr', 'er', 'xr', 'mr', 'cr', 'dr'
  name        text not null,
  is_modified boolean not null,                    -- true for anything other than immediate release
  source_id   text not null references data_sources (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- ingredients

create table ingredients (
  id                  bigint generated always as identity primary key,
  name                text not null,               -- Indian / INN display name, e.g. 'Paracetamol'
  normalized_name     text not null unique,
  source_id           text not null references data_sources (id),
  verification_status text not null default 'needs_review'
                      check (verification_status in ('verified', 'needs_review', 'rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ingredients_name_trgm on ingredients using gin (normalized_name gin_trgm_ops);

create table ingredient_aliases (
  id               bigint generated always as identity primary key,
  ingredient_id    bigint not null references ingredients (id) on delete cascade,
  alias            text not null,                  -- 'Acetaminophen', 'PCM', 'Metformin HCl'
  normalized_alias text not null unique,
  alias_type       text not null check (alias_type in ('inn', 'indian', 'usan', 'abbreviation', 'salt_form', 'spelling', 'other')),
  salt_form        text,                           -- set when the alias names a salt form ('hydrochloride')
  source_id        text not null references data_sources (id),
  created_at       timestamptz not null default now()
);
create index ingredient_aliases_trgm on ingredient_aliases using gin (normalized_alias gin_trgm_ops);

-- ---------------------------------------------------------------- products

create table products (
  id                  bigint generated always as identity primary key,
  source_id           text not null references data_sources (id),
  source_key          text not null,               -- key inside the source: JA drug code, legacy id, ...
  product_type        text not null check (product_type in ('brand', 'generic')),
  name                text not null,
  normalized_name     text not null,
  manufacturer        text,
  is_jan_aushadhi     boolean not null default false,
  ja_drug_code        text,
  composition_text    text not null,               -- composition exactly as the source wrote it
  dosage_form_id      smallint references dosage_forms (id),
  route               text,
  release_type_id     smallint references release_types (id),
  therapeutic_group   text,
  verification_status text not null default 'needs_review'
                      check (verification_status in ('verified', 'needs_review', 'rejected')),
  is_active           boolean not null default true,  -- false once a source stops listing it (never deleted)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_id, source_key),
  check (ja_drug_code is null or is_jan_aushadhi)
);
create unique index products_ja_drug_code_uq on products (ja_drug_code) where ja_drug_code is not null;
create index products_name_trgm on products using gin (normalized_name gin_trgm_ops);
create index products_type_idx on products (product_type, is_active);

create table product_ingredients (
  id              bigint generated always as identity primary key,
  product_id      bigint not null references products (id) on delete cascade,
  ingredient_id   bigint not null references ingredients (id),
  position        smallint not null,               -- order in the source composition
  salt_form       text,                            -- 'hydrochloride', 'besylate', ... when stated
  strength_value  numeric(14, 4),                  -- 650 for '650 mg'; null when the source gives none
  strength_unit   text,                            -- 'mg', 'mcg', 'g', 'iu', '%'
  per_value       numeric(14, 4),                  -- 5 for '250 mg/5 ml'
  per_unit        text,                            -- 'ml' for '250 mg/5 ml'
  source_text     text,                            -- the part of the composition this row came from
  source_id       text not null references data_sources (id),
  created_at      timestamptz not null default now(),
  unique (product_id, ingredient_id),
  check ((strength_value is null) = (strength_unit is null)),
  check ((per_value is null) = (per_unit is null))
);
create index product_ingredients_ingredient_idx on product_ingredients (ingredient_id);

create table pack_sizes (
  id                  bigint generated always as identity primary key,
  product_id          bigint not null references products (id) on delete cascade,
  label               text not null,               -- 'Strip of 15 tablets', "10's", '30 ml bottle'
  unit_count          numeric(12, 3),              -- 15, 10, 30; null when the label cannot be read
  unit                text,                        -- 'tablet', 'capsule', 'ml', 'vial', 'g'
  source_id           text not null references data_sources (id),
  verification_status text not null default 'needs_review'
                      check (verification_status in ('verified', 'needs_review', 'rejected')),
  created_at          timestamptz not null default now(),
  unique (product_id, label),
  check ((unit_count is null) = (unit is null))
);

-- ---------------------------------------------------------------- prices

create table prices (
  id                  bigint generated always as identity primary key,
  product_id          bigint not null references products (id),
  pack_size_id        bigint references pack_sizes (id),
  source_id           text not null references data_sources (id),
  source_file_id      bigint references source_files (id),
  -- mrp: printed MRP (incl. taxes); illustrative: demo value from the legacy JSON, not a real price
  price_type          text not null check (price_type in ('mrp', 'illustrative')),
  amount_inr          numeric(12, 2) not null check (amount_inr >= 0),
  includes_gst        boolean,                     -- null when the source does not say
  unit_price_inr      numeric(14, 4),              -- amount / pack unit_count
  price_unit          text,                        -- 'tablet', 'ml', 'vial', ...
  effective_from      date,
  verification_status text not null default 'needs_review'
                      check (verification_status in ('verified', 'needs_review', 'rejected')),
  is_current          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index prices_one_current_uq
  on prices (product_id, source_id, price_type, coalesce(pack_size_id, 0)) where is_current;
create index prices_product_idx on prices (product_id) where is_current;

create table price_history (
  id             bigint generated always as identity primary key,
  price_id       bigint not null references prices (id),
  product_id     bigint not null,
  source_id      text not null,
  source_file_id bigint,
  price_type     text not null,
  amount_inr     numeric(12, 2) not null,
  unit_price_inr numeric(14, 4),
  effective_from date,
  is_current     boolean not null,
  change         text not null check (change in ('insert', 'update')),
  recorded_at    timestamptz not null default now()
);
create index price_history_product_idx on price_history (product_id, recorded_at desc);

create or replace function record_price_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.amount_inr is not distinct from old.amount_inr
     and new.unit_price_inr is not distinct from old.unit_price_inr
     and new.effective_from is not distinct from old.effective_from
     and new.is_current is not distinct from old.is_current then
    return new;
  end if;
  insert into price_history (price_id, product_id, source_id, source_file_id, price_type,
                             amount_inr, unit_price_inr, effective_from, is_current, change)
  values (new.id, new.product_id, new.source_id, new.source_file_id, new.price_type,
          new.amount_inr, new.unit_price_inr, new.effective_from, new.is_current, lower(tg_op));
  return new;
end;
$$;

create trigger prices_history after insert or update on prices
  for each row execute function record_price_history();

-- NPPA ceiling prices are per unit (tablet, ml, ...) for a formulation, not for a brand,
-- and exclude GST. Phase 5 fills this table.
create table nppa_ceiling_prices (
  id                  bigint generated always as identity primary key,
  source_id           text not null references data_sources (id),
  source_file_id      bigint references source_files (id),
  formulation_text    text not null,               -- as printed in the notification
  composition_key     text,                        -- normalised, order-independent ingredient + strength key
  dosage_form_id      smallint references dosage_forms (id),
  release_type_id     smallint references release_types (id),
  price_unit          text not null,               -- '1 tablet', '1 ml', ...
  ceiling_price_inr   numeric(14, 4) not null check (ceiling_price_inr >= 0),
  excludes_gst        boolean not null default true,
  notification_ref    text,                        -- S.O. number
  notification_date   date,
  effective_from      date,
  effective_to        date,
  verification_status text not null default 'needs_review'
                      check (verification_status in ('verified', 'needs_review', 'rejected')),
  is_current          boolean not null default true,
  created_at          timestamptz not null default now()
);
create index nppa_ceiling_composition_idx on nppa_ceiling_prices (composition_key) where is_current;

-- ---------------------------------------------------------------- import pipeline

create table source_records (
  id             bigint generated always as identity primary key,
  source_id      text not null references data_sources (id),
  source_file_id bigint not null references source_files (id),
  record_key     text not null,                    -- drug code, row number, legacy id
  raw            jsonb not null,                   -- the row exactly as parsed
  parse_status   text not null check (parse_status in ('parsed', 'failed', 'skipped')),
  parse_errors   jsonb not null default '[]'::jsonb,
  product_id     bigint references products (id),
  created_at     timestamptz not null default now(),
  unique (source_file_id, record_key)
);

create table import_diffs (
  id                      bigint generated always as identity primary key,
  source_id               text not null references data_sources (id),
  source_file_id          bigint not null references source_files (id),
  previous_source_file_id bigint references source_files (id),
  status                  text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected', 'committed')),
  summary                 jsonb not null default '{}'::jsonb,   -- counts of new / changed / removed / failed rows
  changes                 jsonb not null default '[]'::jsonb,   -- [{kind, key, before, after}]
  report_path             text,
  reviewed_by             text,
  review_note             text,
  created_at              timestamptz not null default now(),
  reviewed_at             timestamptz,
  committed_at            timestamptz
);
create index import_diffs_status_idx on import_diffs (status, created_at desc);

create table data_conflicts (
  id          bigint generated always as identity primary key,
  entity_type text not null,                       -- 'product', 'price', 'product_ingredient', ...
  entity_id   bigint,
  field       text not null,
  values_json jsonb not null,                      -- [{source_id, value, recorded_at}]
  status      text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  note        text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- matching

create table match_results (
  id                   bigint generated always as identity primary key,
  product_id           bigint not null references products (id),
  candidate_product_id bigint not null references products (id),
  status               text not null check (status in ('verified_match', 'needs_review', 'not_equivalent', 'insufficient_data')),
  reasons              jsonb not null default '[]'::jsonb,
  method               text not null,              -- 'legacy_json_pairing' or 'engine'
  engine_version       text,
  source_id            text not null references data_sources (id),
  computed_at          timestamptz not null default now(),
  unique (product_id, candidate_product_id, method),
  check (product_id <> candidate_product_id)
);
create index match_results_product_idx on match_results (product_id, status);

-- ---------------------------------------------------------------- triggers + security

create trigger data_sources_updated_at before update on data_sources for each row execute function set_updated_at();
create trigger ingredients_updated_at before update on ingredients for each row execute function set_updated_at();
create trigger products_updated_at before update on products for each row execute function set_updated_at();
create trigger prices_updated_at before update on prices for each row execute function set_updated_at();

alter table data_sources        enable row level security;
alter table source_files        enable row level security;
alter table sync_logs           enable row level security;
alter table dosage_forms        enable row level security;
alter table release_types       enable row level security;
alter table ingredients         enable row level security;
alter table ingredient_aliases  enable row level security;
alter table products            enable row level security;
alter table product_ingredients enable row level security;
alter table pack_sizes          enable row level security;
alter table prices              enable row level security;
alter table price_history       enable row level security;
alter table nppa_ceiling_prices enable row level security;
alter table source_records      enable row level security;
alter table import_diffs        enable row level security;
alter table data_conflicts      enable row level security;
alter table match_results       enable row level security;
