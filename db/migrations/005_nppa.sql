-- Phase 5: NPPA ceiling prices.

insert into dosage_forms (code, name, default_route, unit_basis, source_id) values
  ('oral_liquid', 'Oral liquid (syrup, suspension or solution)', 'oral',   'ml',          'saltsaver_curated'),
  ('suppository', 'Suppository',                                 'rectal', 'suppository', 'saltsaver_curated'),
  ('enema',       'Enema',                                       'rectal', 'container',   'saltsaver_curated')
on conflict (code) do nothing;

alter table nppa_ceiling_prices add column record_key text;           -- formulation identity used for diffs
alter table nppa_ceiling_prices add column strength_text text;        -- "Tablet 500 mg" as printed
alter table nppa_ceiling_prices add column unit_code text;            -- 'tablet', 'ml', 'pack', ...
alter table nppa_ceiling_prices add column ingredients jsonb not null default '[]'::jsonb;
alter table nppa_ceiling_prices add column parse_notes jsonb not null default '[]'::jsonb;
alter table nppa_ceiling_prices add column updated_at timestamptz not null default now();
create index nppa_ceiling_record_key_idx on nppa_ceiling_prices (record_key) where is_current;
create unique index nppa_ceiling_one_current_uq on nppa_ceiling_prices (record_key) where is_current;

-- Ceiling price changes are kept like MRP changes: old row retired, new row added.
create table nppa_ceiling_history (
  id               bigint generated always as identity primary key,
  ceiling_id       bigint not null references nppa_ceiling_prices (id),
  record_key       text,
  ceiling_price_inr numeric(14, 4) not null,
  is_current       boolean not null,
  change           text not null check (change in ('insert', 'update')),
  recorded_at      timestamptz not null default now()
);
alter table nppa_ceiling_history enable row level security;

create or replace function record_ceiling_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.ceiling_price_inr is not distinct from old.ceiling_price_inr
     and new.is_current is not distinct from old.is_current then
    return new;
  end if;
  insert into nppa_ceiling_history (ceiling_id, record_key, ceiling_price_inr, is_current, change)
  values (new.id, new.record_key, new.ceiling_price_inr, new.is_current, lower(tg_op));
  return new;
end;
$$;
create trigger nppa_ceiling_prices_history after insert or update on nppa_ceiling_prices
  for each row execute function record_ceiling_history();
create trigger nppa_ceiling_prices_updated_at before update on nppa_ceiling_prices
  for each row execute function set_updated_at();

insert into dosage_forms (code, name, default_route, unit_basis, source_id) values
  ('dry_powder_inhaler', 'Dry powder inhaler (DPI)', 'inhalation', 'dose',    'saltsaver_curated'),
  ('nasal_spray',        'Nasal spray',              'nasal',      'dose',    'saltsaver_curated'),
  ('pessary',            'Pessary (vaginal tablet)', 'vaginal',    'pessary', 'saltsaver_curated')
on conflict (code) do nothing;
