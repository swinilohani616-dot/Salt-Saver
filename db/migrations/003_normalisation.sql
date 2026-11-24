-- Phase 3: normalisation support.

insert into dosage_forms (code, name, default_route, unit_basis, source_id) values
  ('chewable_tablet',    'Chewable tablet',           'oral',       'tablet',    'saltsaver_curated'),
  ('oral_solution',      'Oral solution',             'oral',       'ml',        'saltsaver_curated'),
  ('granules',           'Granules (sachet)',         'oral',       'sachet',    'saltsaver_curated'),
  ('injection',          'Injection (container not stated)', 'parenteral', 'container', 'saltsaver_curated'),
  ('lotion',             'Lotion',                    'topical',    'ml',        'saltsaver_curated'),
  ('inhalation_capsule', 'Capsule for inhalation (Rotacap)', 'inhalation', 'capsule', 'saltsaver_curated'),
  ('respules',           'Respules (nebuliser solution)',    'inhalation', 'respule', 'saltsaver_curated')
on conflict (code) do nothing;

insert into release_types (code, name, is_modified, source_id) values
  ('xl', 'Extended release (XL)',  true, 'saltsaver_curated'),
  ('pr', 'Prolonged release (PR)', true, 'saltsaver_curated')
on conflict (code) do nothing;

-- Parsed composition, so matching and NPPA look-ups do not re-parse names.
alter table products add column composition_key text;        -- order-independent "ingredient strength + ..." key
alter table products add column pharmacopoeia text;          -- IP / BP / USP when stated
alter table products add column parse_notes jsonb not null default '[]'::jsonb;  -- warnings from the parser
create index products_composition_key_idx on products (composition_key) where composition_key is not null;

-- "Calcium carbonate 1250 mg eq. to elemental calcium 500 mg"
alter table product_ingredients add column equivalent_ingredient_id bigint references ingredients (id);
alter table product_ingredients add column equivalent_strength_value numeric(14, 4);
alter table product_ingredients add column equivalent_strength_unit text;
