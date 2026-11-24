/**
 * Writes a brand review CSV pre-filled from the brands in the database:
 * `npm run brands:template`. Fill in Dosage form, Release type and Checked by
 * from each medicine's own pack, then `npm run import:brands -- --file <csv>`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createDbFromEnv, loadEnvFile } from '../server/db.js';

const OUT = 'imports/brand-review.csv';
const q = (v) => (/[",\n]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : v ?? '');

loadEnvFile();
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const rows = await db.query(
    `select p.name, p.manufacturer, p.composition_text, df.name as form,
            (select label from pack_sizes s where s.product_id = p.id order by id desc limit 1) as pack
       from products p left join dosage_forms df on df.id = p.dosage_form_id
      where p.product_type = 'brand' and p.is_active and p.source_id = 'legacy_json'
        and not exists (select 1 from products r where r.source_id = 'brand_review' and r.normalized_name = p.normalized_name and r.is_active)
      order by p.name`,
  );
  const lines = [['Brand name', 'Manufacturer', 'Composition', 'Dosage form', 'Release type', 'Pack size', 'MRP', 'Checked by', 'Notes'].join(',')];
  for (const r of rows) lines.push([r.name, r.manufacturer, r.composition_text, r.form ?? '', '', r.pack ?? '', '', '', ''].map(q).join(','));
  await mkdir('imports', { recursive: true });
  await writeFile(OUT, `${lines.join('\n')}\n`);
  console.log(`Wrote ${rows.length} brands to ${OUT}.`);
  console.log('Check each row against the medicine\'s own strip: composition, dosage form, release type (IR if nothing special is printed).');
  console.log(`Then: npm run import:brands -- --file ${OUT}`);
} finally {
  await db.close();
}
