-- Phase 6: brand compositions checked against the pack by a person.
insert into data_sources (id, name, publisher, homepage_url, kind, expected_refresh_days, stale_after_days, notes) values
  ('brand_review', 'Brand details checked from the pack', 'SaltSaver maintainers', null, 'curated', null, null,
   'Brand name, composition, dosage form and release type copied from the medicine''s own strip or carton, with the name of the person who checked it.')
on conflict (id) do nothing;
