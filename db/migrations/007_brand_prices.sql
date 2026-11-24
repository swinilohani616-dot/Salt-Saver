-- Brand prices: official MRPs of branded medicines, from NPPA's public price look-up.
-- Copyright policy read on 24 Nov 2026 (https://www.nppa.gov.in/en/copyrightpolicy): material may be reproduced
-- free of charge without specific permission, if reproduced accurately and the source is prominently acknowledged.
insert into data_sources (id, name, publisher, homepage_url, kind, expected_refresh_days, stale_after_days, notes) values
  ('nppa_brand_mrp',
   'Branded medicine MRPs (Pharma Sahi Daam)',
   'National Pharmaceutical Pricing Authority (NPPA)',
   'https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine',
   'official', 30, 90,
   'Looked up by formulation on the public "Medicine Price" page, for the brands SaltSaver lists. The MRP is for the pack named in the listing and includes taxes. The listing does not name the manufacturer.')
on conflict (id) do nothing;
