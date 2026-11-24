/**
 * Shows what data the app is serving: `npm run data:status`.
 * Use it to confirm that real official data (not only the demo seed) is in the database.
 */
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { sourceStatus, dataCounts } from '../server/catalog.js';

loadEnvFile();
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const [sources, counts, imports] = await Promise.all([
    sourceStatus(db),
    dataCounts(db),
    db.query(`select id, source_id, status, created_at::date::text as day from import_diffs order by id desc limit 5`),
  ]);
  console.log('Sources');
  for (const s of sources) {
    const state = s.kind !== 'official' ? s.kind : !s.imported ? 'NOT IMPORTED' : s.stale ? `STALE (${s.ageDays} days)` : `ok (${s.ageDays} days old)`;
    console.log(`  ${s.id.padEnd(20)} ${state.padEnd(18)} last import ${s.lastSuccessAt ?? '—'}${s.asOf ? `, list as on ${s.asOf}` : ''}`);
  }
  console.log('\nCatalogue');
  console.log(`  Jan Aushadhi products (official PMBI list): ${counts.janAushadhiProducts}, with current MRP: ${counts.janAushadhiPrices}`);
  console.log(`  NPPA ceiling prices: ${counts.ceilingPrices}`);
  console.log(`  Brands checked from the pack: ${counts.reviewedBrands}; demo brands (not checked): ${counts.legacyBrands}`);
  console.log('\nLatest imports');
  if (!imports.length) console.log('  none');
  for (const i of imports) console.log(`  #${i.id} ${i.source_id} ${i.status} (${i.day})`);
  console.log(
    counts.janAushadhiProducts > 0
      ? '\nReal Jan Aushadhi data is in use. Demo prices are never shown to users.'
      : '\nNo official Jan Aushadhi data yet: the app shows no alternatives or savings until you import the list (docs/DATA_PIPELINE.md).',
  );
} finally {
  await db.close();
}
