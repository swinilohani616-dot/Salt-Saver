/**
 * Phase 6: matching engine. Products are built from composition strings with
 * the real parser; the Jan Aushadhi rows in the database test are synthetic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProducts, STATUS } from '../../lib/pharma/match.js';
import { parseComposition } from '../../lib/pharma/composition.js';
import { createIngredientResolver, resolverDataFromCurated } from '../../lib/pharma/ingredients.js';
import { CURATED_INGREDIENTS } from '../../db/reference/ingredients.js';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { loadReferenceData } from '../../db/reference.js';
import { seedLegacy } from '../../db/seedLegacy.js';
import { stageImport, approveImport } from '../../db/pipeline.js';
import { pmbiAdapter } from '../../db/importers/pmbi.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { findAlternatives, refreshMatches } from '../../db/matching.js';
import { readFile } from 'node:fs/promises';

const resolver = createIngredientResolver(resolverDataFromCurated(CURATED_INGREDIENTS));
function product(name, text) {
  const p = parseComposition(text, resolver);
  return { name, ingredients: p.ingredients, dosageForm: p.dosageForm, route: p.route, releaseType: p.releaseType };
}
const codes = (r) => r.reasons.map((x) => x.code);

test('identical composition, strength, form, route and release: verified match', () => {
  const r = compareProducts(product('Brand', 'Paracetamol Tablets 650 mg'), product('JA', 'Paracetamol Tablets IP 650 mg'));
  assert.deepEqual(r, { status: STATUS.VERIFIED, reasons: [] });
});

test('aliases, salt spelling, units and ingredient order do not break a match', () => {
  const a = product('Brand', 'Acetaminophen 0.65 g Tablets');
  const b = product('JA', 'Paracetamol Tablets IP 650 mg');
  assert.equal(compareProducts(a, b).status, STATUS.VERIFIED);
  const c = product('Brand', 'Hydrochlorothiazide 12.5 mg + Telmisartan 40 mg Tablets');
  const d = product('JA', 'Telmisartan and Hydrochlorothiazide Tablets IP 40 mg + 12.5 mg');
  assert.equal(compareProducts(c, d).status, STATUS.VERIFIED);
  const e = product('Brand', 'Amlodipine Besilate Tablets 5 mg');
  const f = product('JA', 'Amlodipine Besylate Tablets IP 5 mg');
  assert.equal(compareProducts(e, f).status, STATUS.VERIFIED);
});

test('release types never match each other', () => {
  const types = ['Tablets', 'SR Tablets', 'ER Tablets', 'XR Tablets', 'MR Tablets', 'CR Tablets', 'Prolonged Release Tablets', 'Gastro-resistant Tablets'];
  for (const a of types) {
    for (const b of types) {
      const r = compareProducts(product('A', `Metformin Hydrochloride ${a} 500 mg`), product('B', `Metformin Hydrochloride ${b} 500 mg`));
      if (a === b) assert.equal(r.status, STATUS.VERIFIED, `${a} vs ${b}`);
      else {
        assert.equal(r.status, STATUS.NOT_EQUIVALENT, `${a} vs ${b}`);
        assert.ok(codes(r).includes('release_differs'));
      }
    }
  }
});

test('an unstated release type needs review', () => {
  const brand = { ...product('Glycomet GP 1', 'Glimepiride 1 mg + Metformin 500 mg Tablets'), releaseType: null };
  const ja = product('JA', 'Glimepiride 1mg + Metformin Hydrochloride (SR) 500mg Tablets');
  const r = compareProducts(brand, ja);
  assert.equal(r.status, STATUS.REVIEW);
  assert.deepEqual(codes(r), ['release_unknown']);
});

test('ingredients: missing, extra, and different strengths are not equivalent', () => {
  const combiflam = product('Combiflam', 'Ibuprofen 400 mg + Paracetamol 325 mg Tablets');
  assert.deepEqual(codes(compareProducts(combiflam, product('JA', 'Ibuprofen Tablets IP 400 mg'))), ['ingredient_missing']);
  assert.deepEqual(codes(compareProducts(product('X', 'Ibuprofen Tablets 400 mg'), combiflam)), ['ingredient_extra']);
  const r = compareProducts(product('Dolo 650', 'Paracetamol Tablets 650 mg'), product('JA', 'Paracetamol Tablets IP 500 mg'));
  assert.equal(r.status, STATUS.NOT_EQUIVALENT);
  assert.match(r.reasons[0].message, /650 mg vs 500 mg/);
});

test('dosage form and route', () => {
  const tab = product('A', 'Cetirizine Tablets 10 mg');
  assert.equal(compareProducts(tab, product('B', 'Cetirizine Capsules 10 mg')).status, STATUS.NOT_EQUIVALENT);
  const dt = compareProducts(product('A', 'Paracetamol Tablets 125 mg'), product('B', 'Paracetamol DT Tablets 125 mg'));
  assert.equal(dt.status, STATUS.REVIEW, 'tablet vs dispersible tablet is close but needs a pharmacist');
  const susp = compareProducts(product('A', 'Cefixime Oral Suspension 50 mg/5 ml'), product('B', 'Cefixime Dry Syrup 50 mg/5 ml'));
  assert.equal(susp.status, STATUS.REVIEW);
  const eye = compareProducts(product('A', 'Ciprofloxacin Eye Drops 0.3% w/v'), product('B', 'Ciprofloxacin Ear Drops 0.3% w/v'));
  assert.equal(eye.status, STATUS.NOT_EQUIVALENT);
  assert.ok(codes(eye).includes('route_differs'));
});

test('salt forms: different stated salts need review; one unstated salt is fine', () => {
  const tartrate = product('Metolar', 'Metoprolol Tartrate Tablets 25 mg');
  const succinate = product('JA', 'Metoprolol Succinate Tablets 25 mg');
  const r = compareProducts(tartrate, succinate);
  assert.equal(r.status, STATUS.REVIEW);
  assert.match(r.reasons[0].message, /tartrate salt vs succinate salt/);
  assert.equal(compareProducts(product('A', 'Metoprolol Tablets 25 mg'), succinate).status, STATUS.VERIFIED);
});

test('missing data: insufficient_data, never a guess', () => {
  const noForm = { ...product('A', 'Paracetamol 500 mg'), dosageForm: null, route: null };
  const r = compareProducts(noForm, product('B', 'Paracetamol Tablets 500 mg'));
  assert.equal(r.status, STATUS.INSUFFICIENT);
  assert.ok(codes(r).includes('form_unknown'));
  const noStrength = compareProducts(product('A', 'Clotrimazole Cream'), product('B', 'Clotrimazole Cream IP 1% w/w'));
  assert.equal(noStrength.status, STATUS.INSUFFICIENT);
  const empty = compareProducts({ name: 'Mystery', ingredients: [], dosageForm: null, route: null, releaseType: null }, product('B', 'Paracetamol Tablets 500 mg'));
  assert.equal(empty.status, STATUS.INSUFFICIENT);
});

test('a liquid whose strength has no volume cannot be compared', () => {
  const a = product('A', 'Paracetamol Suspension 120 mg');
  const b = product('B', 'Paracetamol Oral Suspension IP 120 mg');
  const r = compareProducts(a, b);
  assert.equal(r.status, STATUS.INSUFFICIENT);
  assert.ok(codes(r).includes('concentration_unknown'));
  assert.equal(compareProducts(product('A', 'Paracetamol Suspension 120 mg/5 ml'), product('B', 'Paracetamol Suspension 240 mg/10 ml')).status, STATUS.VERIFIED);
  assert.equal(compareProducts(product('A', 'Ciprofloxacin Eye Drops 0.3% w/v'), product('B', 'Ciprofloxacin Eye Drops 0.3% w/v')).status, STATUS.VERIFIED, 'a percentage carries its volume');
});

test('"eq. to" strengths compare on the stated equivalent', () => {
  const a = product('A', 'Calcium Carbonate 1250 mg (eq. to elemental Calcium 500 mg) + Vitamin D3 250 IU Tablets');
  const b = product('B', 'Calcium Carbonate 1250 mg + Cholecalciferol 250 IU Tablets');
  assert.equal(compareProducts(a, b).status, STATUS.VERIFIED);
});

// ---------------------------------------------------------------- database

test('findAlternatives: only official Jan Aushadhi products are candidates, ranked verified first', async () => {
  const db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  await seedLegacy(db, { bytes: await readFile(new URL('../../data/sample-data.json', import.meta.url)), fileName: 'data/sample-data.json' });
  const csv = [
    'Drug Code,Generic Name,Unit Size,MRP,Group Name',
    "T650,Paracetamol Tablets IP 650 mg,15's,15.00,Analgesic",
    "T500,Paracetamol Tablets IP 500 mg,10's,8.00,Analgesic",
    "T651,Paracetamol Sustained Release Tablets 650 mg,10's,12.00,Analgesic",
    "TCOM,Ibuprofen and Paracetamol Tablets IP 400 mg + 325 mg,10's,9.00,Analgesic",
  ].join('\n');
  const staged = await stageImport(db, pmbiAdapter, { bytes: Buffer.from(csv), fileName: 'ja.csv' });
  await approveImport(db, ADAPTERS, staged.diffId, { reviewedBy: 'Test' });

  const [dolo] = await db.query("select id from products where source_key = 'med_103'");
  const result = await findAlternatives(db, dolo.id);
  assert.equal(result.product.name, 'Dolo 650');
  // Legacy brands have no recorded release type, so the best they can get is needs_review.
  // Dolo's release type is not recorded, so the SR product cannot be ruled out either: both need review.
  assert.deepEqual(result.alternatives.map((a) => [a.product.jaDrugCode, a.status]), [['T650', 'needs_review'], ['T651', 'needs_review']]);
  assert.match(result.alternatives[1].reasons[0].message, /is sustained release \(SR\)/);
  assert.equal(result.notEquivalent, 2, '500 mg and the combination are not equivalent');
  assert.equal(result.alternatives[0].product.price.unitPrice, 1);
  assert.ok(!result.alternatives.some((a) => a.product.sourceId === 'legacy_json'), 'demo generics are never offered');

  // A brand whose release type is known (simulated here) gets a verified match.
  await db.query("update products set release_type_id = (select id from release_types where code = 'ir') where id = $1", [dolo.id]);
  const verified = await findAlternatives(db, dolo.id);
  assert.deepEqual(verified.alternatives.map((a) => [a.product.jaDrugCode, a.status]), [['T650', 'verified_match']]);
  assert.equal(verified.notEquivalent, 3, 'now the SR product is ruled out too');

  const stored = await refreshMatches(db);
  assert.ok(stored.stored >= 1);
  const [row] = await db.query(`select status, engine_version from match_results where method = 'engine' and product_id = $1`, [dolo.id]);
  assert.deepEqual(row, { status: 'verified_match', engine_version: 'v2' });
  await db.close();
});

test('brand review import: a brand checked from its pack can reach a verified match', async () => {
  const { brandAdapter } = await import('../../db/importers/brands.js');
  const db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  const ja = ['Drug Code,Generic Name,Unit Size,MRP,Group Name', "T650,Paracetamol Tablets IP 650 mg,15's,15.00,Analgesic"].join('\n');
  await approveImport(db, ADAPTERS, (await stageImport(db, pmbiAdapter, { bytes: Buffer.from(ja), fileName: 'ja.csv' })).diffId, { reviewedBy: 'Test' });

  const review = [
    'Brand name,Manufacturer,Composition,Dosage form,Release type,Pack size,Checked by,Notes',
    'Example Brand 650,Example Labs,Paracetamol 650 mg,Tablet,IR,Strip of 15 tablets,Test reviewer,',
    'Bad Row,,Paracetamol,Tablet,maybe,,,',
  ].join('\n');
  const staged = await stageImport(db, brandAdapter, { bytes: Buffer.from(review), fileName: 'brands.csv' });
  assert.equal(staged.summary.parsed, 1);
  assert.equal(staged.summary.failed, 1);
  const [bad] = await db.query("select parse_errors from source_records where parse_status = 'failed'");
  assert.ok(bad.parse_errors.some((e) => /Checked by/.test(e)));
  assert.ok(bad.parse_errors.some((e) => /release type "maybe"/.test(e)));
  await approveImport(db, ADAPTERS, staged.diffId, { reviewedBy: 'Test' });

  const [brand] = await db.query("select id, verification_status, parse_notes from products where source_id = 'brand_review'");
  assert.equal(brand.verification_status, 'verified');
  assert.equal(brand.parse_notes[0], 'Checked from the pack by Test reviewer');
  const alt = await findAlternatives(db, brand.id);
  assert.deepEqual(alt.alternatives.map((a) => [a.product.jaDrugCode, a.status]), [['T650', 'verified_match']]);
  await db.close();
});
