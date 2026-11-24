/**
 * Unified search: a brand name and a salt name lead to the same comparison groups, each with
 * its branded medicines and the generics that match them. Jan Aushadhi and NPPA rows are
 * synthetic test data.
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
import { brandPriceAdapter } from '../../db/importers/brandPrices.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { createApp } from '../../server/app.js';
import { parseQuery } from '../../lib/pharma/query.js';

let db;
let base;
let server;
const get = async (path) => {
  const r = await fetch(`${base}${path}`);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const search = async (q) => (await get(`/api/search?q=${encodeURIComponent(q)}`)).body;
const approve = async (adapter, text, fileName) =>
  approveImport(db, ADAPTERS, (await stageImport(db, adapter, { bytes: Buffer.from(text), fileName, effectiveFrom: '2026-11-24' })).diffId, { reviewedBy: 'Test' });

const group = (body, composition) => body.groups.find((g) => g.composition === composition);
const names = (list) => list.map((x) => (x.product ?? x).name);
const codes = (g) => g.generics.map((x) => x.product.jaDrugCode);

before(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  await seedLegacy(db, { bytes: await readFile(new URL('../../data/sample-data.json', import.meta.url)), fileName: 'data/sample-data.json' });
  await approve(pmbiAdapter, [
    'Drug Code,Generic Name,Unit Size,MRP,Group Name',
    ...Array.from({ length: 24 }, (_, i) => `C${i},Paracetamol ${100 + i}mg and Tramadol 37.5mg Tablets,10's,13.62,Analgesic`),
    "T500,Paracetamol Tablets IP 500 mg,10's,6.56,Analgesic",
    "T5AA,Paracetamol IP 500 mg Tablets,10's,0,Analgesic",
    "T650,Paracetamol Tablets IP 650 mg,15's,15.47,Analgesic",
    'TSUS,Paracetamol Suspension IP 120 mg,60 ml,12.19,Analgesic',
    "LINC,Lincomycin 500mg Capsules,10's,43.13,Antibiotic",
    "MIR,Metformin Hydrochloride Tablets IP 500mg,10's,6.81,Antidiabetic",
    "MPR,Metformin Hydrochloride Prolonged release Tablets IP 500 mg,10's,10.79,Antidiabetic",
    "TEL,Telmisartan Tablets IP 40mg,10's,12.38,CVS",
    "TEL8,Telmisartan Tablets IP 80mg,10's,20.00,CVS",
    "TELH,Telmisartan 40mg and Hydrochlorothiazide 12.5mg Tablets IP,10's,17.53,CVS",
    "ASDR,Aspirin Gastro-resistant Tablets IP 75 mg,14's,4.00,CVS",
    "AMIS,Amlodipine + Enalapril Tablet (5/5 Mg),10's,15.00,CVS",
  ].join('\n'), 'ja.csv');
  await approve(brandPriceAdapter, [
    'Medicine Name,Formulation,Dosage forms,Status,Ceiling Price,M.R.P / Unit',
    'TELMA 40 MG TABLET 15,TELMISARTAN,TABLET,Scheduled,6.92,108.36/15 TABLET',
    'TELMA 40 MG TABLET 30,TELMISARTAN,TABLET,Scheduled,6.92,216.72/30 TABLET',
    'TELMA 80 MG TABLET 15,TELMISARTAN,TABLET,Scheduled,10.65,165.99/15 TABLET',
    'TELMA H 40/12.5 MG TABLET 15,TELMISARTAN + HYDROCHLOROTHIAZIDE,TABLET,Non-Scheduled,Not Applicable,356.72/15 TABLET',
    'CROCIN ADVANCE 500 MG TABLET 20,PARACETAMOL,TABLET; TABLET DT,Scheduled,0.93,19.31/20 TABLET',
    'ECOSPRIN 75 MG TABLET 14,ASPIRIN,CAPSULE; TABLET,Scheduled,0.36,5.00/14 TABLET',
    'GLYCOMET SR 500 MG TABLET SR 20,METFORMIN,TABLET; TABLET ER; TABLET SR,Scheduled,2.00,40.00/20 TABLET',
  ].join('\n'), 'brand-prices.csv');
  server = createApp({ db, logger: { error: () => {} }, rateLimitMax: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

// ---------------------------------------------------------------- reading the query

test('query: names, strengths and form words are read separately', () => {
  assert.deepEqual(parseQuery('Crocin 500mg'), { text: 'crocin 500mg', words: ['crocin'], phrases: ['crocin'], strengths: [{ value: 500, unit: 'mg' }], forms: [], release: null });
  assert.deepEqual(parseQuery('paracetamol 650').strengths, [{ value: 650, unit: null }]);
  assert.deepEqual(parseQuery('Telmisartan 40 mg + Hydrochlorothiazide 12.5 mg').phrases, ['telmisartan', 'hydrochlorothiazide']);
  assert.deepEqual(parseQuery('paracetamol tablets').forms, ['tablet']);
  assert.deepEqual([parseQuery('Glycomet SR 500').words, parseQuery('Glycomet SR 500').release], [['glycomet'], 'sr']);
  assert.deepEqual(parseQuery('Vitamin D3').words, ['vitamin', 'd3'], 'a number inside a word is part of the name');
});

// ---------------------------------------------------------------- brand search

test('brand search returns the branded medicine and its generic options in one answer, without another request', async () => {
  const body = await search('Telma 40');
  const g = group(body, 'Telmisartan 40 mg');
  assert.ok(g, 'the active salt and strength are identified');
  assert.deepEqual([g.dosageForm, g.route, g.releaseType], ['tablet', 'oral', 'ir']);
  assert.deepEqual(names(g.brands), ['Telma 40 mg Tablet']);
  assert.deepEqual(codes(g), ['TEL']);
  const brand = g.brands[0];
  assert.equal(g.generics[0].matches[brand.id].status, 'verified_match');
  assert.equal(body.groups.length, 1, 'Telma 80 and Telma H are a different strength and a different combination');
});

test('"Crocin 500mg" finds Crocin and paracetamol 500 mg only, and nothing that merely contains "500mg"', async () => {
  const body = await search('Crocin 500mg');
  assert.deepEqual(body.groups.map((g) => g.composition), ['Paracetamol 500 mg']);
  assert.deepEqual(names(body.groups[0].brands).sort(), ['Crocin 500mg', 'Crocin Advance 500 mg Tablet']);
  assert.deepEqual(codes(body.groups[0]), ['T500', 'T5AA'], 'a generic with a price comes before one without');
  assert.ok(!JSON.stringify(body).includes('Lincomycin') && !JSON.stringify(body).includes('Calpol'));
});

test('brand search: only the brand that was searched is shown, not other brands of the same salt', async () => {
  const body = await search('crocin');
  assert.ok(body.groups.length >= 1);
  for (const g of body.groups) for (const b of g.brands) assert.match(b.name, /^Crocin/);
});

test('a brand with several strengths gets one group each, and never a generic of another strength', async () => {
  const body = await search('telma');
  assert.deepEqual(body.groups.map((g) => [g.composition, codes(g)]), [
    ['Telmisartan 40 mg', ['TEL']],
    ['Telmisartan 80 mg', ['TEL8']],
    ['Telmisartan 40 mg + Hydrochlorothiazide 12.5 mg', ['TELH']],
  ]);
});

// ---------------------------------------------------------------- salt search

test('salt search returns the same group, with the branded medicines and the generics', async () => {
  const bySalt = group(await search('telmisartan'), 'Telmisartan 40 mg');
  const byBrand = group(await search('telma'), 'Telmisartan 40 mg');
  assert.deepEqual(bySalt, byBrand, 'a brand name and a salt name lead to the same comparison');
});

test('salt search: brands are not crowded out by generics or combinations', async () => {
  const body = await search('paracetamol');
  const g500 = group(body, 'Paracetamol 500 mg');
  assert.deepEqual(names(g500.brands).sort(), ['Calpol 500mg', 'Crocin 500mg', 'Crocin Advance 500 mg Tablet']);
  assert.deepEqual(codes(g500), ['T500', 'T5AA']);
  assert.deepEqual(names(group(body, 'Paracetamol 650 mg').brands), ['Dolo 650']);
  const order = body.groups.map((g) => g.salts.length);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'single-salt groups before combinations');
});

test('salt search with a strength keeps only that strength, brands included', async () => {
  const body = await search('paracetamol 650');
  assert.deepEqual(body.groups.map((g) => g.composition), ['Paracetamol 650 mg']);
  assert.deepEqual(names(body.groups[0].brands), ['Dolo 650']);
  assert.deepEqual((await search('acetaminophen 650 mg')).groups.map((g) => g.composition), ['Paracetamol 650 mg'], 'an alias works the same way');
});

test('a medicine whose strength or form is not listed is shown, but never in a comparison group', async () => {
  const body = await search('amlodipine');
  assert.ok(body.other.some((p) => p.jaDrugCode === 'AMIS'));
  assert.ok(!body.groups.some((g) => codes(g).includes('AMIS')));
});

// ---------------------------------------------------------------- what may be compared

test('release types are never mixed: an SR brand is not matched with a plain or prolonged release tablet', async () => {
  const body = await search('glycomet sr');
  const g = body.groups[0];
  assert.deepEqual([g.releaseType, names(g.brands), codes(g)], ['sr', ['Glycomet SR 500 mg Tablet'], []]);
  assert.ok(body.notEquivalent >= 1, 'says that other products with the same salt are not shown');
});

test('a brand whose release type is not recorded: every release type is offered for checking, none is a verified match', async () => {
  const body = await search('glycomet 500');
  const metformin = body.groups.filter((g) => g.composition === 'Metformin 500 mg');
  const brand = metformin.flatMap((g) => g.brands).find((b) => b.name === 'Glycomet 500');
  assert.equal(brand.releaseType, null);
  const offered = metformin.flatMap((g) => g.generics);
  assert.deepEqual(offered.map((x) => x.product.jaDrugCode).sort(), ['MIR', 'MPR']);
  for (const x of offered) {
    assert.equal(x.matches[brand.id].status, 'needs_review');
    assert.deepEqual(x.matches[brand.id].reasons.map((r) => r.code), ['release_unknown']);
  }
});

test('aspirin listed as "tablet" is not taken to be plain: it is usually enteric coated', async () => {
  const body = await search('ecosprin');
  const brand = body.groups.flatMap((g) => g.brands).find((b) => b.price);
  assert.equal(brand.releaseType, null);
  for (const g of body.groups) for (const x of g.generics) assert.notEqual(x.matches[brand.id]?.status, 'verified_match');
});

test('a brand of unknown release type is never filed under a release type', async () => {
  const body = await search('ecosprin 75');
  const g = body.groups.find((x) => x.brands.some((b) => b.price));
  assert.equal(g.releaseType, null, 'the only generic is enteric coated; whether the brand is, is for the strip to say');
  assert.deepEqual(codes(g), ['ASDR'], 'the generic is still offered for checking');
  assert.equal(g.generics[0].product.releaseType, 'dr', 'and states its own release type');
  const bySalt = (await search('aspirin 75')).groups;
  assert.deepEqual(bySalt.map((x) => [x.releaseType, codes(x), names(x.brands)]), [[null, ['ASDR'], ['Ecosprin 75 mg Tablet']]], 'the same from a salt search, with nothing listed twice');
});

test('liquids without a strength per ml are never a verified match', async () => {
  const body = await search('paracetamol suspension');
  for (const g of body.groups) for (const x of g.generics) for (const m of Object.values(x.matches)) assert.notEqual(m.status, 'verified_match');
});

// ---------------------------------------------------------------- prices and provenance

test('verified brand prices come from NPPA, with pack, source and date; packs of one medicine share a card', async () => {
  const { brands: [telma] } = group(await search('telma 40'), 'Telmisartan 40 mg');
  assert.deepEqual(
    [telma.price.amount, telma.price.packCount, telma.price.packUnit, telma.price.sourceId, telma.price.effectiveFrom, telma.price.includesGst],
    [108.36, 15, 'tablet', 'nppa_brand_mrp', '2026-11-24', true],
  );
  assert.equal(telma.price.unitPrice, 7.224);
  assert.deepEqual(telma.otherPacks, [{ label: '30 tablets', amount: 216.72, unitPrice: 7.224 }]);
  assert.equal(telma.priceStatus, 'verified');
});

test('a demo brand has no price: the illustrative value is never served, and the record says it is demo data', async () => {
  const demo = group(await search('crocin 500mg'), 'Paracetamol 500 mg').brands.find((b) => b.name === 'Crocin 500mg');
  assert.equal(demo.price, null);
  assert.equal(demo.priceStatus, 'none');
  assert.equal(demo.sourceId, 'legacy_json');
  assert.equal(demo.manufacturer, null, '"Sample Pharma" is a placeholder, not a manufacturer');
});

test('an official listing replaces the demo record of the same brand, strength and form', async () => {
  const g = group(await search('telma 40'), 'Telmisartan 40 mg');
  assert.ok(!names(g.brands).includes('Telma 40'));
});

test('a brand checked from its pack can carry its printed MRP', async () => {
  await approve(brandAdapter, [
    'Brand name,Manufacturer,Composition,Dosage form,Release type,Pack size,MRP,Checked by,Notes',
    'Dolo 650,Micro Labs,Paracetamol 650 mg,Tablet,IR,Strip of 15 tablets,33.00,Test reviewer,',
  ].join('\n'), 'brands.csv');
  const { brands: [dolo] } = group(await search('dolo'), 'Paracetamol 650 mg');
  assert.deepEqual([dolo.sourceId, dolo.price.amount, dolo.price.packCount, dolo.price.sourceId, dolo.priceStatus], ['brand_review', 33, 15, 'brand_review', 'verified']);
});

// ---------------------------------------------------------------- misspellings, and the cost of a search

test('a close misspelling is answered, and marked as similar rather than exact', async () => {
  const body = await search('paracetmol');
  assert.equal(body.matchedBy, 'similar');
  assert.ok(body.groups.some((g) => g.composition.startsWith('Paracetamol')));
  assert.equal((await search('paracetamol')).matchedBy, 'name');
  assert.deepEqual((await search('zzzzqq')).groups, []);
});

test('a search makes a single trip to the database', async () => {
  const sql = [];
  const counted = { ...db, query: (text, params) => { sql.push(text); return db.query(text, params); } };
  const app = createApp({ db: counted, logger: { error: () => {} }, rateLimitMax: 1000 }).listen(0);
  await new Promise((r) => app.once('listening', r));
  const url = `http://127.0.0.1:${app.address().port}`;
  await fetch(`${url}/api/status`); // the source status is cached, so it does not count below
  for (const q of ['telma', 'paracetamol']) {
    sql.length = 0;
    const body = await (await fetch(`${url}/api/search?q=${q}`)).json();
    assert.ok(body.groups.some((g) => g.generics.some((x) => x.product.price)), 'generics and prices are included');
    assert.equal(sql.length, 1, q);
  }
  await new Promise((r) => app.close(r));
});
