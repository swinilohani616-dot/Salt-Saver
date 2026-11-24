/**
 * Search results and price comparison: what each result carries, the order of results,
 * the formulation key, and the release type a user reads from their own strip.
 * Jan Aushadhi rows are synthetic test data.
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
import { brandAdapter } from '../../db/importers/brands.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { createApp } from '../../server/app.js';
import { formulationKey } from '../../lib/pharma/formulation.js';

let db;
let base;
let server;
const get = async (path) => {
  const r = await fetch(`${base}${path}`);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const approve = async (adapter, text, fileName) =>
  approveImport(db, ADAPTERS, (await stageImport(db, adapter, { bytes: Buffer.from(text), fileName, effectiveFrom: '2026-11-20' })).diffId, { reviewedBy: 'Test' });

before(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  await seedLegacy(db, { bytes: await readFile(new URL('../../data/sample-data.json', import.meta.url)), fileName: 'data/sample-data.json' });
  const combos = Array.from({ length: 24 }, (_, i) => `C${i},Paracetamol ${100 + i}mg and Tramadol 37.5mg Tablets,10's,13.62,Analgesic`);
  await approve(pmbiAdapter, [
    'Drug Code,Generic Name,Unit Size,MRP,Group Name',
    ...combos,
    "T500,Paracetamol Tablets IP 500 mg,10's,8.00,Analgesic",
    "T650,Paracetamol Tablets IP 650 mg,15's,15.00,Analgesic",
    "TZERO,Paracetamol Tablets IP 1000 mg,10's,0,Analgesic",
    "MSUC,Metoprolol Succinate Prolonged release tablets IP 25mg,15's,17.02,CVS",
    "MTAR,Metoprolol Tartrate Tablets IP 25 mg,10's,6.81,CVS",
  ].join('\n'), 'ja.csv');
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

/** Every medicine of a search, in the order the page shows them. */
const flat = (body) => [...body.groups.flatMap((g) => [...g.brands, ...g.generics.map((x) => x.product)]), ...body.other];
const search = async (q) => flat((await get(`/api/search?q=${encodeURIComponent(q)}`)).body);
const byCode = (results, code) => results.find((r) => r.jaDrugCode === code);

test('each result carries salts, strength, pack and the official price with its source and date', async () => {
  const r = byCode(await search('paracetamol 500'), 'T500');
  assert.deepEqual(r.salts, [{ name: 'Paracetamol', strength: '500 mg', saltForm: null }]);
  assert.deepEqual(
    { amount: r.price.amount, count: r.price.packCount, unit: r.price.packUnit, label: r.price.packLabel, source: r.price.sourceId, from: r.price.effectiveFrom },
    { amount: 8, count: 10, unit: 'tablet', label: "10's", source: 'pmbi_product_list', from: '2026-11-20' },
  );
  assert.ok(r.price.updatedAt);
  assert.equal(r.manufacturer, null, 'PMBI does not list manufacturers; nothing is invented');
});

test('every result carries its recorded pack size, even without a price', async () => {
  const unpriced = byCode(await search('paracetamol tablets'), 'TZERO');
  assert.equal(unpriced.price, null);
  assert.deepEqual(unpriced.pack, { label: "10's", count: 10, unit: 'tablet' });
  const crocin = (await search('crocin')).find((r) => r.name === 'Crocin 500mg');
  assert.equal(crocin.price, null);
  assert.equal(crocin.pack.unit, 'tablet');
  assert.ok(crocin.pack.count > 0);
});

test('every result says when its record was last updated, with or without a price', async () => {
  const results = [...(await search('paracetamol')), ...(await search('crocin'))];
  assert.ok(results.some((r) => !r.isJanAushadhi) && results.some((r) => !r.price && r.isJanAushadhi) && results.some((r) => r.price));
  for (const r of results) assert.match(r.updatedAt ?? '', /^\d{4}-\d\d-\d\dT/, r.name);
});

test('a medicine listed at Rs 0 has no price, and demo brand prices are never served', async () => {
  assert.equal(byCode(await search('paracetamol tablets'), 'TZERO').price, null);
  const crocin = (await search('crocin')).find((r) => r.name === 'Crocin 500mg');
  assert.equal(crocin.price, null);
});

test('searching a salt lists the single-salt medicines before the combinations', async () => {
  const results = await search('paracetamol');
  const codes = results.map((r) => r.jaDrugCode).filter(Boolean);
  assert.ok(codes.includes('T650') && codes.includes('T500'), 'not pushed out by 24 combinations');
  assert.ok(codes.indexOf('T650') < codes.findIndex((c) => c.startsWith('C')));
});

test('formulation key: same only for the same salts, salt forms, strengths, form, route and release type', async () => {
  const results = await search('metoprolol');
  const suc = byCode(results, 'MSUC').formulationKey;
  const tar = byCode(results, 'MTAR').formulationKey;
  assert.ok(suc && tar);
  assert.notEqual(suc, tar);

  const p = (over = {}) => ({
    ingredients: [{ key: 'metoprolol', saltForm: 'succinate', strength: { value: 25, unit: 'mg', perValue: null, perUnit: null } }],
    dosageForm: 'tablet', route: 'oral', releaseType: 'pr', ...over,
  });
  const key = formulationKey(p());
  assert.equal(formulationKey(p()), key);
  assert.notEqual(formulationKey(p({ ingredients: [{ ...p().ingredients[0], saltForm: 'tartrate' }] })), key, 'salt form');
  assert.notEqual(formulationKey(p({ ingredients: [{ ...p().ingredients[0], strength: { value: 50, unit: 'mg', perValue: null, perUnit: null } }] })), key, 'strength');
  assert.notEqual(formulationKey(p({ dosageForm: 'capsule' })), key, 'form');
  assert.notEqual(formulationKey(p({ releaseType: 'ir' })), key, 'release type');
  assert.notEqual(formulationKey(p({ route: 'topical' })), key, 'route');
});

test('formulation key: none when anything needed is unknown', () => {
  const p = { ingredients: [{ key: 'x', saltForm: null, strength: { value: 1, unit: 'mg', perValue: null, perUnit: null } }], dosageForm: 'tablet', route: 'oral', releaseType: 'ir' };
  assert.ok(formulationKey(p));
  assert.equal(formulationKey({ ...p, releaseType: null }), null);
  assert.equal(formulationKey({ ...p, dosageForm: null }), null);
  assert.equal(formulationKey({ ...p, route: null }), null);
  assert.equal(formulationKey({ ...p, ingredients: [] }), null);
  assert.equal(formulationKey({ ...p, ingredients: [{ ...p.ingredients[0], strength: null }] }), null);
});

test('strip check: a release type read from the strip completes an unchecked brand', async () => {
  const [{ id }] = await db.query("select id::text from products where source_key = 'med_101'"); // Crocin 500mg, release type not recorded
  const statusOf = (body) => body.alternatives.find((a) => a.product.jaDrugCode === 'T500')?.status;

  const unknown = await get(`/api/products/${id}/alternatives`);
  assert.equal(statusOf(unknown.body), 'needs_review');
  assert.equal(unknown.body.confirmedRelease, null);

  const plain = await get(`/api/products/${id}/alternatives?release=ir`);
  assert.equal(statusOf(plain.body), 'verified_match');
  assert.equal(plain.body.confirmedRelease, 'ir');
  assert.equal(plain.body.product.releaseType, null, 'the catalogue itself is not changed');

  const sr = await get(`/api/products/${id}/alternatives?release=sr`);
  assert.equal(statusOf(sr.body), undefined, 'a sustained release strip does not match a plain tablet');
});

test('strip check: cannot override a known release type, and bad values are refused', async () => {
  const [{ id }] = await db.query("select id::text from products where source_id = 'brand_review'"); // Dolo 650, IR
  const { body } = await get(`/api/products/${id}/alternatives?release=sr`);
  assert.equal(body.alternatives.find((a) => a.product.jaDrugCode === 'T650').status, 'verified_match');
  assert.equal(body.confirmedRelease, null);
  const bad = await get(`/api/products/${id}/alternatives?release=banana`);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'BAD_RELEASE');
});
