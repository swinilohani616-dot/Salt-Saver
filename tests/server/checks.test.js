/**
 * Phase 9: scheduled source checks and stale detection. Data is synthetic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { loadReferenceData } from '../../db/reference.js';
import { stageImport, approveImport } from '../../db/pipeline.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { checkSources, checkSummaryMarkdown } from '../../db/checks.js';

const JA_CSV = ['Drug Code,Generic Name,Unit Size,MRP,Group Name', "T650,Paracetamol Tablets IP 650 mg,15's,15.00,Analgesic"].join('\n');

async function freshDb() {
  const db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  return db;
}
const importJa = async (db, csv = JA_CSV) =>
  approveImport(db, ADAPTERS, (await stageImport(db, ADAPTERS.pmbi_product_list, { bytes: Buffer.from(csv), fileName: 'ja.csv' })).diffId, { reviewedBy: 'Test' });

test('never-imported sources need attention; nothing is downloaded without a configured URL', async () => {
  const db = await freshDb();
  let downloads = 0;
  const r = await checkSources(db, { env: {}, download: async () => { downloads += 1; } });
  assert.equal(downloads, 0);
  assert.deepEqual(r.attention.sort(), ['Branded medicine MRPs (Pharma Sahi Daam): never imported', 'Jan Aushadhi product and MRP list: never imported', 'NPPA ceiling prices (DPCO 2013, NLEM): never imported']);
  assert.equal(Number((await db.query("select count(*) as n from sync_logs where job = 'stale_check'"))[0].n), 3);
  assert.match(checkSummaryMarkdown(r), /Needs attention \(3\)/);
  await db.close();
});

test('Jan Aushadhi data is stale after 60 days without an approved import', async () => {
  const db = await freshDb();
  await importJa(db);
  const fresh = await checkSources(db, { env: {} });
  assert.ok(!fresh.attention.some((a) => a.startsWith('Jan Aushadhi')));
  const later = new Date(Date.now() + 61 * 86_400_000);
  const old = await checkSources(db, { env: {}, now: later });
  assert.ok(old.attention.some((a) => /Jan Aushadhi.*stale \(61 days old\)/.test(a)));
  await db.close();
});

test('first week of April: the NPPA annual revision is flagged until it is imported', async () => {
  const db = await freshDb();
  const csv = ['Medicines,Dosage form and Strength,Unit,Ceiling price', 'Paracetamol,Tablet 650 mg,1 Tablet,1.80'].join('\n');
  await approveImport(db, ADAPTERS, (await stageImport(db, ADAPTERS.nppa_ceiling_prices, { bytes: Buffer.from(csv), fileName: 'n.csv' })).diffId, { reviewedBy: 'Test' });
  await db.query("update data_sources set last_success_at = '2027-03-15T00:00:00Z' where id = 'nppa_ceiling_prices'");
  const april3 = await checkSources(db, { env: {}, now: new Date('2027-04-03T04:00:00Z') });
  assert.ok(april3.attention.some((a) => /2027 annual revision not imported yet/.test(a)));
  await db.query("update data_sources set last_success_at = '2027-04-02T00:00:00Z' where id = 'nppa_ceiling_prices'");
  const done = await checkSources(db, { env: {}, now: new Date('2027-04-03T04:00:00Z') });
  assert.ok(!done.attention.some((a) => /annual revision/.test(a)));
  const may = await checkSources(db, { env: {}, now: new Date('2027-05-03T04:00:00Z') });
  assert.ok(!may.attention.some((a) => /annual revision/.test(a)));
  await db.close();
});

test('a configured URL: a new file is staged for review (never committed); the same file is not', async () => {
  const db = await freshDb();
  await importJa(db);
  const newer = Buffer.from(JA_CSV.replace('15.00', '16.00'));
  const r = await checkSources(db, { env: { PMBI_LIST_URL: 'https://example.invalid/list.csv' }, download: async () => ({ bytes: newer, url: 'https://example.invalid/list.csv' }) });
  assert.ok(r.attention.some((a) => /new version staged as import #/.test(a)));
  const [price] = await db.query("select amount_inr::float8 as a from prices where is_current and source_id = 'pmbi_product_list'");
  assert.equal(price.a, 15, 'still the approved price');
  const again = await checkSources(db, { env: { PMBI_LIST_URL: 'https://example.invalid/list.csv' }, download: async () => { throw new Error('should not download while a review is pending'); } });
  assert.ok(again.sources[0].notes.some((n) => /waiting for review/.test(n)));
  await db.close();
});

test('a failed download keeps the data and is logged', async () => {
  const db = await freshDb();
  await importJa(db);
  const r = await checkSources(db, { env: { PMBI_LIST_URL: 'https://example.invalid/x.csv' }, download: async () => { throw new Error('HTTP 503 from example.invalid'); } });
  assert.ok(r.attention.some((a) => /automatic download failed/.test(a)));
  assert.equal(Number((await db.query("select count(*) as n from sync_logs where job = 'download' and status = 'failed'"))[0].n), 1);
  assert.equal(Number((await db.query("select count(*) as n from products where source_id = 'pmbi_product_list' and is_active"))[0].n), 1);
  await db.close();
});
