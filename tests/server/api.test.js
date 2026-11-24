/**
 * Phase 7: search API, alternatives, ceilings, data status, validation and rate limiting.
 * Jan Aushadhi and NPPA rows are synthetic test data.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { loadReferenceData } from '../../db/reference.js';
import { seedLegacy } from '../../db/seedLegacy.js';
import { stageImport, approveImport } from '../../db/pipeline.js';
import { pmbiAdapter } from '../../db/importers/pmbi.js';
import { nppaAdapter } from '../../db/importers/nppa.js';
import { brandAdapter } from '../../db/importers/brands.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { createApp } from '../../server/app.js';

let db;
let base;
let server;
const get = async (path, headers) => {
  const r = await fetch(`${base}${path}`, { headers });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
};
/** Every medicine of a search, in the order the page shows them. */
const flat = (body) => [...body.groups.flatMap((g) => [...g.brands, ...g.generics.map((x) => x.product)]), ...body.other];
const approve = async (adapter, text, fileName) =>
  approveImport(db, ADAPTERS, (await stageImport(db, adapter, { bytes: Buffer.from(text), fileName, effectiveFrom: '2026-11-20' })).diffId, { reviewedBy: 'Test' });

before(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  await seedLegacy(db, { bytes: await readFile(new URL('../../data/sample-data.json', import.meta.url)), fileName: 'data/sample-data.json' });
  await approve(pmbiAdapter, [
    'Drug Code,Generic Name,Unit Size,MRP,Group Name',
    "T650,Paracetamol Tablets IP 650 mg,15's,15.00,Analgesic",
    "T500,Paracetamol Tablets IP 500 mg,10's,8.00,Analgesic",
    "TMET,Metformin Hydrochloride Tablets IP 500 mg,10's,5.00,Antidiabetic",
  ].join('\n'), 'ja.csv');
  await approve(nppaAdapter, ['Medicines,Dosage form and Strength,Unit,Ceiling price', 'Paracetamol,Tablet 650 mg,1 Tablet,1.80'].join('\n'), 'nppa.csv');
  await approve(brandAdapter, [
    'Brand name,Manufacturer,Composition,Dosage form,Release type,Pack size,Checked by,Notes',
    'Dolo 650,Micro Labs,Paracetamol 650 mg,Tablet,IR,Strip of 15 tablets,Test reviewer,',
  ].join('\n'), 'brands.csv');
  server = createApp({ db, logger: { error: () => {} }, rateLimitMax: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

test('status shows what is imported, when, and whether it is stale', async () => {
  const { body } = await get('/api/status');
  assert.equal(body.officialDataImported, true);
  assert.deepEqual(
    { ja: body.counts.janAushadhiProducts, ceilings: body.counts.ceilingPrices, reviewed: body.counts.reviewedBrands },
    { ja: 3, ceilings: 1, reviewed: 1 },
  );
  const ja = body.sources.find((s) => s.id === 'pmbi_product_list');
  assert.equal(ja.imported, true);
  assert.equal(ja.stale, false);
  assert.equal(ja.asOf, '2026-11-20');
  assert.match(body.note, /not live/);
});

test('search: brands and Jan Aushadhi products by name, ingredient and alias; demo generics excluded', async () => {
  const dolo = await get('/api/search?q=dolo');
  assert.equal(dolo.status, 200);
  assert.equal(flat(dolo.body)[0].name, 'Dolo 650');
  assert.equal(flat(dolo.body)[0].sourceId, 'brand_review', 'the pack-checked entry replaces the demo one');
  assert.equal(flat(dolo.body).filter((r) => r.name === 'Dolo 650').length, 1);

  const para = await get('/api/search?q=paracetamol');
  const names = flat(para.body).map((r) => r.name);
  assert.ok(names.includes('Paracetamol Tablets IP 650 mg'));
  assert.ok(names.includes('Crocin 500mg'), 'brands containing the ingredient');
  assert.ok(!names.some((n) => n.startsWith('Jan Aushadhi ')), 'legacy demo generics are never search results');
  assert.ok(!flat(para.body).some((r) => 'price' in r && r.price?.type === 'illustrative'));

  const alias = await get('/api/search?q=acetaminophen');
  assert.ok(flat(alias.body).some((r) => r.name === 'Paracetamol Tablets IP 650 mg'), 'US name finds the Indian product');

  const words = await get('/api/search?q=paracetamol%20650');
  assert.equal(flat(words.body)[0].composition.startsWith('Paracetamol 650 mg'), true);
});

test('suggest: autocomplete names, with aliases filling in the Indian name', async () => {
  const { body } = await get('/api/suggest?q=para');
  assert.ok(body.suggestions.some((s) => s.label === 'Paracetamol' && s.type === 'ingredient'));
  const alias = await get('/api/suggest?q=acetam');
  assert.deepEqual(alias.body.suggestions.find((s) => s.type === 'ingredient'), { label: 'acetaminophen = Paracetamol', value: 'Paracetamol', type: 'ingredient' });
});

test('alternatives: verified match with MRP and source, ceiling, disclaimer; no demo prices', async () => {
  const [dolo] = await db.query("select id::text from products where source_id = 'brand_review'");
  const { status, body } = await get(`/api/products/${dolo.id}/alternatives`);
  assert.equal(status, 200);
  assert.equal(body.product.name, 'Dolo 650');
  assert.equal(body.product.price, null, 'no MRP was recorded for this brand, so none is served');
  assert.deepEqual(body.alternatives.map((a) => [a.product.jaDrugCode, a.status]), [['T650', 'verified_match']]);
  const price = body.alternatives[0].product.price;
  assert.deepEqual(
    { amount: price.amount, packCount: price.packCount, packUnit: price.packUnit, unitPrice: price.unitPrice, sourceId: price.sourceId, includesGst: price.includesGst, effectiveFrom: price.effectiveFrom },
    { amount: 15, packCount: 15, packUnit: 'tablet', unitPrice: 1, sourceId: 'pmbi_product_list', includesGst: true, effectiveFrom: '2026-11-20' },
  );
  assert.equal(body.notEquivalent, 1, 'the 500 mg product');
  assert.equal(body.disclaimer, 'Possible alternative only. Confirm with your doctor or pharmacist before switching medicines.');
  assert.deepEqual(body.ceilings.map((c) => [c.ceilingPerUnit, c.unitCode, c.excludesGst, c.releaseConfirmed]), [[1.8, 'tablet', true, true]]);
  assert.equal(body.sources.janAushadhi.stale, false);

  const legacyCrocin = (await db.query("select id::text from products where source_key = 'med_101'"))[0].id;
  const crocin = await get(`/api/products/${legacyCrocin}/alternatives`);
  assert.equal(crocin.body.product.price, null, 'legacy illustrative price is not leaked');
});

test('products by id: current Jan Aushadhi MRPs for the basket page', async () => {
  const ids = (await db.query("select id::text from products where source_key in ('T650', 'TMET') order by source_key")).map((r) => r.id);
  const { body } = await get(`/api/products?ids=${ids.join(',')}`);
  assert.deepEqual(body.products.map((p) => [p.jaDrugCode, p.price.amount]).sort(), [['T650', 15], ['TMET', 5]]);
});

test('input validation: friendly 400s, never a crash', async () => {
  assert.equal((await get('/api/search?q=a')).body.error.code, 'QUERY_TOO_SHORT');
  assert.equal((await get('/api/search?q=' + 'x'.repeat(61))).body.error.code, 'QUERY_TOO_LONG');
  assert.equal((await get('/api/search?q=%3Cscript%3E')).body.error.code, 'BAD_QUERY');
  assert.equal((await get('/api/search')).status, 400);
  assert.equal((await get('/api/products/abc/alternatives')).body.error.code, 'BAD_ID');
  assert.equal((await get('/api/products/999999/alternatives')).status, 404);
  assert.equal((await get('/api/products?ids=')).status, 400);
});

test('stale data is flagged once the expected refresh window has passed', async () => {
  const app = createApp({ db, logger: { error: () => {} } });
  await db.query("update data_sources set last_success_at = now() - interval '61 days' where id = 'pmbi_product_list'");
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/status`).then((x) => x.json());
  await new Promise((res) => s.close(res));
  await db.query("update data_sources set last_success_at = now() where id = 'pmbi_product_list'");
  const ja = r.sources.find((x) => x.id === 'pmbi_product_list');
  assert.equal(ja.stale, true);
  assert.equal(ja.ageDays, 61);
  assert.equal(r.sources.find((x) => x.id === 'nppa_ceiling_prices').stale, false, 'NPPA allows 400 days');
});

test('per-IP rate limit on search', async () => {
  const app = createApp({ db, logger: { error: () => {} }, rateLimitMax: 3 });
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const url = `http://127.0.0.1:${s.address().port}/api/search?q=dolo`;
  const codes = [];
  let last;
  for (let i = 0; i < 4; i += 1) {
    last = await fetch(url);
    codes.push(last.status);
  }
  const body = await last.json();
  await new Promise((r) => s.close(r));
  assert.deepEqual(codes, [200, 200, 200, 429]);
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});
