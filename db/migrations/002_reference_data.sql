-- Data sources and reference lists. Re-running is safe (on conflict do nothing).
-- URLs are the official pages checked on 22-23 Nov 2026. They are pages, not
-- download endpoints: neither PMBI nor NPPA publishes a stable file URL.

insert into data_sources (id, name, publisher, homepage_url, kind, expected_refresh_days, stale_after_days, notes) values
  ('pmbi_product_list',
   'Jan Aushadhi product and MRP list',
   'Pharmaceuticals & Medical Devices Bureau of India (PMBI)',
   'https://janaushadhi.gov.in/product-portfolio/product-mrp-list',
   'official', 7, 60,
   'Downloaded by hand with the page''s Download CSV / PDF button. PMBI asks for permission by email before its material is reproduced, and the source must be acknowledged.'),
  ('nppa_ceiling_prices',
   'NPPA ceiling prices (DPCO 2013, NLEM)',
   'National Pharmaceutical Pricing Authority (NPPA)',
   'https://www.nppa.gov.in/en/compendiumofprice',
   'official', 7, 400,
   'Ceiling prices are the legal maximum per unit, exclude GST, and apply to scheduled formulations only. Revised every 1 April plus ad-hoc notifications.'),
  ('legacy_json',
   'SaltSaver demo dataset (data/sample-data.json)',
   'SaltSaver',
   null,
   'legacy', null, null,
   'Demo dataset. Prices are illustrative per-pack values, not official MRPs or Jan Aushadhi rates. Brand-to-generic pairings were never checked by the matching engine.'),
  ('user_entered',
   'Entered by you',
   null,
   null,
   'user_entered', null, null,
   'MRP typed by the user from their own pack. Kept in the user''s browser only, never saved as a catalogue price.'),
  ('saltsaver_curated',
   'SaltSaver reference lists',
   'SaltSaver',
   null,
   'curated', null, null,
   'Dosage forms, release types and ingredient aliases maintained in this repository.')
on conflict (id) do nothing;

insert into dosage_forms (code, name, default_route, unit_basis, source_id) values
  ('tablet',                  'Tablet',                  'oral',       'tablet',  'saltsaver_curated'),
  ('dispersible_tablet',      'Dispersible tablet (DT)', 'oral',       'tablet',  'saltsaver_curated'),
  ('mouth_dissolving_tablet', 'Mouth dissolving tablet (MD)', 'oral',  'tablet',  'saltsaver_curated'),
  ('capsule',                 'Capsule',                 'oral',       'capsule', 'saltsaver_curated'),
  ('syrup',                   'Syrup',                   'oral',       'ml',      'saltsaver_curated'),
  ('suspension',              'Suspension',              'oral',       'ml',      'saltsaver_curated'),
  ('dry_syrup',               'Dry syrup',               'oral',       'ml',      'saltsaver_curated'),
  ('oral_drops',              'Oral drops',              'oral',       'ml',      'saltsaver_curated'),
  ('injection_vial',          'Injection (vial)',        'parenteral', 'vial',    'saltsaver_curated'),
  ('injection_ampoule',       'Injection (ampoule)',     'parenteral', 'ampoule', 'saltsaver_curated'),
  ('cream',                   'Cream',                   'topical',    'g',       'saltsaver_curated'),
  ('ointment',                'Ointment',                'topical',    'g',       'saltsaver_curated'),
  ('gel',                     'Gel',                     'topical',    'g',       'saltsaver_curated'),
  ('eye_drops',               'Eye drops',               'ophthalmic', 'ml',      'saltsaver_curated'),
  ('ear_drops',               'Ear drops',               'otic',       'ml',      'saltsaver_curated'),
  ('inhaler',                 'Inhaler',                 'inhalation', 'dose',    'saltsaver_curated')
on conflict (code) do nothing;

insert into release_types (code, name, is_modified, source_id) values
  ('ir', 'Immediate release',                              false, 'saltsaver_curated'),
  ('sr', 'Sustained release (SR)',                         true,  'saltsaver_curated'),
  ('er', 'Extended release (ER)',                          true,  'saltsaver_curated'),
  ('xr', 'Extended release (XR)',                          true,  'saltsaver_curated'),
  ('mr', 'Modified release (MR)',                          true,  'saltsaver_curated'),
  ('cr', 'Controlled release (CR)',                        true,  'saltsaver_curated'),
  ('dr', 'Delayed release / gastro-resistant / enteric coated', true, 'saltsaver_curated')
on conflict (code) do nothing;
