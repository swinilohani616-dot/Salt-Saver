/**
 * Brand prices from NPPA's price look-up: what a listing states, what it does not, and which
 * rows are refused. Listings are real ones seen on 24 Nov 2026; formulation columns as searched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandPriceAdapter, releaseFromListing } from '../../db/importers/brandPrices.js';
import { createIngredientResolver, resolverDataFromCurated } from '../../lib/pharma/ingredients.js';
import { CURATED_INGREDIENTS } from '../../db/reference/ingredients.js';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { loadReferenceData } from '../../db/reference.js';
import { stageImport, approveImport } from '../../db/pipeline.js';
import { ADAPTERS } from '../../db/importers/index.js';

const resolver = createIngredientResolver(resolverDataFromCurated(CURATED_INGREDIENTS));
const cellOf = (row) => (f) => row[f] ?? '';
const row = (listing, formulation, mrp, { forms = 'TABLET', status = 'Non-Scheduled', ceiling = 'Not Applicable' } = {}) => ({ listing, formulation, mrp, forms, status, ceiling });
const read = (r, others = []) => brandPriceAdapter.parseRow(cellOf(r), { resolver, file: brandPriceAdapter.prepare([r, ...others].map(cellOf)) });

test('a listing gives brand, salts, strengths, form, pack and MRP', () => {
  const r = read(row('TELMA H 40/12.5 MG TABLET 15', 'TELMISARTAN + HYDROCHLOROTHIAZIDE', '356.72/15 TABLET'));
  assert.equal(r.status, 'parsed');
  const p = r.parsed;
  assert.deepEqual([p.name, p.mrp, p.packSize, p.dosageForm, p.route, p.releaseType], ['Telma H 40/12.5 mg Tablet', 356.72, '15 tablets', 'tablet', 'oral', 'ir']);
  assert.equal(p.composition.compositionKey, 'hydrochlorothiazide 12.5 mg + telmisartan 40 mg');
  assert.ok(r.warnings.some((w) => /Telmisartan 40 mg \+ Hydrochlorothiazide 12.5 mg/.test(w)), 'the reading of a combination is reported for review');
});

test('rows that do not state what a comparison needs are refused, with a reason', () => {
  const reasons = (r) => read(r).errors?.join(' ') ?? '';
  assert.match(reasons(row('CROCIN TABLET 10', 'PARACETAMOL', '19.31/10 TABLET')), /could not all be read/, 'no strength');
  assert.match(reasons(row('CROCIN 120 MG SUSPENSION 60 ML', 'PARACETAMOL', '39.06/60 ML SUSPENSION')), /not a tablet or capsule|not in the form/);
  assert.match(reasons(row('PAN 40 MG INJECTION 10 ML', 'PANTOPRAZOLE', '54.24/10 ML INJECTION')), /not a tablet or capsule|not in the form/);
  assert.match(reasons(row('TELMA 40 MG TABLET 15', 'TELMISARTAN', '108.36/30 TABLET')), /pack of 15 but the MRP is for 30/);
  assert.match(reasons(row('SHELCAL 500 MG TABLET 15', 'CALCIUM CARBONATE + VITAMIN D3', '130.00/15 TABLET')), /2 salt\(s\).*1 strength/);
  assert.match(reasons(row('NEWBRAND 5 MG TABLET 10', 'UNKNOWNAMIDE', '50.00/10 TABLET')), /not recognised/);
  assert.match(reasons(row('TELMA 40 MG TABLET 15', 'TELMISARTAN', 'N/A')), /not in the form/);
});

test('an MRP above the legal ceiling plus GST is not taken as a price; the medicine is kept', () => {
  const opts = { status: 'Scheduled', ceiling: '2.56', forms: 'CAPSULE; TABLET' };
  const high = read(row('AMLONG 5 MG TABLET 15', 'AMLODIPINE', '48.55/15 TABLET', opts));
  assert.deepEqual([high.status, high.parsed.mrp, high.parsed.packSize], ['parsed', null, '15 tablets']);
  assert.match(high.warnings.join(), /above the ceiling price/);
  assert.equal(read(row('AMLONG 5 MG TABLET 30', 'AMLODIPINE', '80.51/30 TABLET', opts)).parsed.mrp, 80.51);
  assert.equal(read(row('TELMA 40 MG TABLET 15', 'TELMISARTAN', '108.36/15 TABLET', { status: 'Scheduled', ceiling: '6.92' })).parsed.mrp, 108.36);
});

test('a release type read elsewhere needs its evidence, and dispensing packs are left out', () => {
  const base = row('CROCIN ADVANCE 500 MG TABLET 20', 'PARACETAMOL', '19.31/20 TABLET', { forms: 'TABLET; TABLET SR', status: 'Scheduled', ceiling: '0.93' });
  assert.equal(read(base).parsed.releaseType, null);
  assert.match(read({ ...base, release: 'IR' }).errors.join(), /needs evidence/);
  const stated = read({ ...base, release: 'IR', evidence: 'https://www.crocin.com/crocin-products-for-adult/crocin-advance-tablets/', notes: 'Formulation from the NPPA ceiling list.' });
  assert.equal(stated.parsed.releaseType, 'ir');
  assert.match(stated.warnings.join(' | '), /release type IR from: https:\/\/www\.crocin\.com.*/);
  assert.match(stated.warnings.join(' | '), /Formulation from the NPPA ceiling list/);
  assert.match(read({ ...base, release: 'quick', evidence: 'x' }).errors.join(), /must be one of/);
  assert.match(read(row('CALPOL 500 MG TABLET 1000', 'PARACETAMOL', '724.72/1000 TABLET')).errors.join(), /for dispensing/);
});

test('release type: "TABLET" is plain only when the listing leaves no other reading', () => {
  const forms = 'TABLET; TABLET ER; TABLET PR; TABLET SR';
  const glycometSr = row('GLYCOMET 500 MG TABLET SR 20', 'METFORMIN', '42.24/20 TABLET SR', { forms });
  const glycomet = row('GLYCOMET 500 MG TABLET 10', 'METFORMIN', '19.59/10 TABLET', { forms });
  assert.deepEqual([read(glycometSr).parsed.releaseType, read(glycometSr).parsed.name], ['sr', 'Glycomet 500 mg Tablet SR']);
  assert.equal(read(glycomet, [glycometSr]).parsed.releaseType, 'ir', 'the company lists its SR tablet separately');
  assert.equal(read(glycomet).parsed.releaseType, null, 'nothing in the file tells the two apart');

  const gpPr = row('GLYCOMET GP 1/850 MG TABLET PR 10', 'GLIMEPIRIDE + METFORMIN', '70.64/10 TABLET PR', { forms });
  assert.equal(read(row('GLYCOMET GP 1/500 MG TABLET 15', 'GLIMEPIRIDE + METFORMIN', '123.28/15 TABLET', { forms }), [gpPr]).parsed.releaseType, null, 'a combination with an SR form on the list is never taken to be plain');

  const metForms = 'CAPSULE XR; TABLET; TABLET ER; TABLET XL';
  const xrCap = row('METOLAR 25 MG CAPSULE XR 15', 'METOPROLOL', '85.16/15 CAPSULE XR', { forms: metForms });
  assert.equal(read(row('METOLAR 25 MG TABLET 15', 'METOPROLOL', '43.65/15 TABLET', { forms: metForms }), [xrCap]).parsed.releaseType, 'ir');
  assert.equal(read(row('METOLAR XT 25 MG TABLET 15', 'METOPROLOL', '65.00/15 TABLET', { forms: metForms }), [xrCap]).parsed.releaseType, null, 'XT is not read as plain');

  assert.equal(read(row('ECOSPRIN 75 MG TABLET 14', 'ASPIRIN', '5.29/14 TABLET', { forms: 'CAPSULE; TABLET' })).parsed.releaseType, null, 'usually enteric coated');
  assert.equal(read(row('PAN 40 MG TABLET 15', 'PANTOPRAZOLE', '192.80/15 TABLET', { forms: 'TABLET; TABLET DR' })).parsed.releaseType, null);
  assert.equal(read(row('DOLO 650 MG TABLET 15', 'PARACETAMOL', '32.28/15 TABLET', { forms: '' })).parsed.releaseType, null, 'the other forms of the salt were not looked up');
  assert.equal(releaseFromListing({ brand: 'X', dosage: 'TABLET IR', formsListed: ['TABLET SR'], ingredientKeys: ['a', 'b'], brandListsModified: false, entericKeys: new Set() }), 'ir');
});

test('an import is staged for review, then priced; a changed MRP keeps its history', async () => {
  const db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  const csv = (mrp) => Buffer.from(['Medicine Name,Formulation,Dosage forms,Status,Ceiling Price,M.R.P / Unit', `TELMA 40 MG TABLET 15,TELMISARTAN,TABLET,Scheduled,6.92,${mrp}/15 TABLET`, 'CROCIN TABLET 10,PARACETAMOL,TABLET,Scheduled,0.93,19.31/10 TABLET'].join('\n'));
  const first = await stageImport(db, brandPriceAdapter, { bytes: csv('108.36'), fileName: 'a.csv', effectiveFrom: '2026-11-24' });
  assert.deepEqual([first.summary.parsed, first.summary.failed, first.summary.new], [1, 1, 1]);
  assert.equal((await db.query("select count(*)::int as n from products where source_id = 'nppa_brand_mrp'"))[0].n, 0, 'nothing is live before approval');
  await approveImport(db, ADAPTERS, first.diffId, { reviewedBy: 'Test' });

  const second = await stageImport(db, brandPriceAdapter, { bytes: csv('105.00'), fileName: 'b.csv', effectiveFrom: '2026-12-24' });
  assert.equal(second.summary.changed, 1);
  await approveImport(db, ADAPTERS, second.diffId, { reviewedBy: 'Test' });
  const prices = await db.query("select amount_inr::float8 as amount, is_current, unit_price_inr::float8 as unit from prices where source_id = 'nppa_brand_mrp' order by id");
  assert.deepEqual(prices, [{ amount: 108.36, is_current: false, unit: 7.224 }, { amount: 105, is_current: true, unit: 7 }]);
  await db.close();
});
