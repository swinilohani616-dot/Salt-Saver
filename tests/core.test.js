/**
 * Unit + data tests for js/core and the services (PRD §15: 100% accurate salt
 * matching and price math across the seeded database).
 */
import { normalizeText, saltKey } from '../js/core/normalize.js';
import { toPaise, unitSaving, savingPercent, lineSaving, basketSummary } from '../js/core/savings.js';
import { validateQuantity, validateDb, sanitizeBasket, isValidMedicine } from '../js/core/validate.js';
import { can, isValidRole } from '../js/core/roles.js';
import { escapeHTML, formatINR } from '../js/core/sanitize.js';
import { ERR } from '../js/core/errors.js';
import { MESSAGES, STORAGE_KEYS } from '../js/config.js';
import { loadDataStatus, getDataStatus, sourceInfo } from '../js/services/dataService.js';
import * as basket from '../js/services/basketService.js';
import { compareUnitPrices, validateMrp, validatePackCount, ceilingCheck, savingForUnits } from '../js/core/unitSavings.js';
import { basketTotals, lineReference, isUserPrice } from '../js/core/basketMath.js';
import { saltLabel, hasSameSalt, saltNames, strengthText, formulationLabel } from '../js/core/labels.js';
import { packSaving, brandPackSaving, brandReference, matchWith, compareResults, comparisonLine, isInBasket, savingForLine } from '../js/core/comparison.js';
import { getReferences, saveReference, getEntered, saveEntered, clearReferences } from '../js/services/referenceService.js';
import { medicineCardModel, PRICE_TAGS } from '../js/core/cardModel.js';
import * as storage from '../js/services/storage.js';

/** A basket line: synthetic test values. */
const LINE = (packsPerMonth, extra = {}) => ({
  productId: '101', productName: 'Test Brand 650', composition: 'Paracetamol 650 mg',
  alternativeId: '901', alternativeName: 'Paracetamol Tablets IP 650 mg', jaDrugCode: 'T650', unit: 'tablet',
  enteredMrp: 32, enteredCount: 15, alternativePrice: { mrp: 15, count: 15, unit: 'tablet', packLabel: "15's", asOf: '' },
  packsPerMonth, ...extra,
});

/** A Jan Aushadhi product as the API returns it: synthetic test values. */
const JA500 = (extra = {}) => ({
  id: '51', name: 'Paracetamol Tablets IP 500 mg', isJanAushadhi: true, jaDrugCode: 'T500', manufacturer: null,
  composition: 'Paracetamol 500 mg', salts: [{ name: 'Paracetamol', strength: '500 mg', saltForm: null }],
  dosageForm: 'tablet', releaseType: 'ir', formulationKey: 'paracetamol 500 mg | paracetamol=- | tablet | oral | ir',
  price: { amount: 5.5, packCount: 10, packUnit: 'tablet', packLabel: "10's", unitPrice: 0.55, sourceId: 'pmbi_product_list', updatedAt: '2026-11-24T00:00:00Z' },
  ...extra,
});

const CROCIN = { id: 'med_101', brandName: 'Crocin 500mg', activeSalt: 'Paracetamol 500mg', brandPrice: 30.0, genericName: 'Jan Aushadhi Paracetamol 500mg', genericPrice: 5.5 };

/**
 * @param {{test:Function}} h
 * @param {object} sampleData parsed data/sample-data.json
 */
export function registerTests({ test }, sampleData) {
  // ---------- normalize ----------
  test('normalizeText lowercases, strips punctuation and joins units', (a) => {
    a.equal(normalizeText('  Crocin-500 MG '), 'crocin 500mg');
    a.equal(normalizeText('Vitamin D3 250 IU'), 'vitamin d3 250iu');
    a.equal(normalizeText('A+B'), 'a + b');
    a.equal(normalizeText(null), '');
  });

  test('saltKey is order-independent for combination drugs', (a) => {
    a.equal(saltKey('Telmisartan 40mg + Hydrochlorothiazide 12.5mg'), saltKey('Hydrochlorothiazide 12.5 mg+Telmisartan 40mg'));
    a.equal(saltKey('Paracetamol 500mg'), 'paracetamol 500mg');
    a.ok(saltKey('Paracetamol 500mg') !== saltKey('Paracetamol 650mg'), 'different strengths must not match');
  });

  // ---------- search (FR-01, BR-03) ----------
  const meds = validateDb(sampleData).data.medicines;

  test('FR-02: Crocin ₹30.00 vs ₹5.50 shows "Save 81%"', (a) => {
    a.equal(formatINR(toPaise(CROCIN.brandPrice)), '₹30.00');
    a.equal(formatINR(toPaise(CROCIN.genericPrice)), '₹5.50');
    a.equal(savingPercent(CROCIN), 81);
    a.equal(unitSaving(CROCIN), 2450);
  });

  test('BR-01: savings = (brandPrice - genericPrice) × quantity', (a) => {
    a.equal(lineSaving(CROCIN, 3), 7350);
  });

  test('paise math avoids floating-point drift', (a) => {
    const m = { brandPrice: 0.3, genericPrice: 0.1 };
    a.equal(unitSaving(m), 20);
    a.equal(lineSaving(m, 3), 60);
  });

  test('a generic that costs more never gives a negative saving', (a) => {
    const m = { brandPrice: 5, genericPrice: 8 };
    a.equal(unitSaving(m), 0);
    a.equal(savingPercent(m), 0);
  });

  test('FR-03: combined monthly savings for 2 drugs', (a) => {
    const byId = new Map(meds.map((m) => [m.id, m]));
    const s = basketSummary(
      [
        { medicineId: 'med_101', quantityPerMonth: 2 }, // (30 - 5.5) * 2 = 49
        { medicineId: 'med_106', quantityPerMonth: 1 }, // (25 - 6) * 1 = 19
      ],
      byId,
    );
    a.equal(s.totalSaving, 6800);
    a.equal(s.totalBrand, 8500);
    a.equal(s.totalGeneric, 1700);
    a.equal(s.overallPercent, 80);
    a.equal(s.yearlySaving, 81600);
    a.equal(formatINR(s.totalSaving), '₹68.00');
  });

  // ---------- validation (PRD §12) ----------
  test('quantity 0 is blocked with "Quantity must be at least 1."', (a) => {
    const r = validateQuantity('0');
    a.equal(r.ok, false);
    a.equal(r.error.code, ERR.VALIDATION);
    a.equal(r.error.message, MESSAGES.QTY_MIN);
  });

  test('quantity rules: negative, empty, decimal, too large, valid', (a) => {
    a.equal(validateQuantity(-2).error.message, MESSAGES.QTY_MIN);
    a.equal(validateQuantity('').error.message, MESSAGES.QTY_MIN);
    a.equal(validateQuantity('abc').error.message, MESSAGES.QTY_MIN);
    a.equal(validateQuantity('2.5').error.message, MESSAGES.QTY_WHOLE);
    a.equal(validateQuantity(1000).error.message, MESSAGES.QTY_MAX);
    a.deepEqual(validateQuantity(' 30 '), { ok: true, data: 30 });
  });

  test('validateDb rejects wrong schema and skips bad records', (a) => {
    a.equal(validateDb({ schemaVersion: 2, medicines: [CROCIN] }).ok, false);
    a.equal(validateDb(null).ok, false);
    const r = validateDb({ schemaVersion: 1, medicines: [CROCIN, { ...CROCIN }, { id: 'x', brandName: 'Bad' }] });
    a.equal(r.data.medicines.length, 1);
    a.equal(r.data.skipped, 2);
  });

  test('sanitizeBasket drops malformed lines and bad quantities and merges duplicates', (a) => {
    const clean = sanitizeBasket([LINE(2), LINE(3), { ...LINE(1), productId: 'nope' }, LINE(0), { ...LINE(1), enteredMrp: -5 }, { medicineId: 'med_101', quantityPerMonth: 2 }]);
    a.equal(clean.length, 1);
    a.equal(clean[0].packsPerMonth, 5);
    a.deepEqual(sanitizeBasket('garbage'), []);
  });

  // ---------- PRD wording ----------
  test('PRD wording is kept word for word (BR-02, PRD §12)', (a) => {
    a.equal(MESSAGES.DISCLAIMER, 'Generics contain identical WHO-approved active chemical salts.');
    a.equal(MESSAGES.NOT_FOUND, 'No brand found. Try searching by active salt name.');
    a.equal(MESSAGES.QTY_MIN, 'Quantity must be at least 1.');
  });

  test('the BR-02 sentence is held back when the salt differs or is unknown', (a) => {
    const alt = (...codes) => ({ reasons: codes.map((code) => ({ code })) });
    a.equal(hasSameSalt(alt()), true, 'verified match');
    a.equal(hasSameSalt(alt('release_unknown')), true);
    a.equal(hasSameSalt(alt('release_unknown', 'salt_form_differs')), false, 'tartrate vs succinate');
    a.equal(hasSameSalt(alt('composition_unknown')), false);
  });

  test('salt label: one salt or a combination', (a) => {
    a.equal(saltLabel('Paracetamol 500 mg'), 'Active salt: ');
    a.equal(saltLabel('Montelukast 10 mg + Levocetirizine 5 mg'), 'Active salts: ');
    a.equal(saltLabel(null), 'Active salt: ');
  });

  // ---------- roles & safety ----------
  test('roles: pharmacy buyer cannot add to basket', (a) => {
    a.equal(can('patient', 'addToBasket'), true);
    a.equal(can('caregiver', 'addToBasket'), true);
    a.equal(can('pharmacy', 'addToBasket'), false);
    a.equal(can('pharmacy', 'print'), true);
    a.equal(isValidRole('admin'), false);
  });

  test('escapeHTML neutralizes markup', (a) => {
    a.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  // ---------- seeded database accuracy (PRD §15) ----------
  test('every seeded record is valid and has a unique id', (a) => {
    a.equal(sampleData.medicines.length, meds.length, 'some records were rejected');
    a.ok(meds.every(isValidMedicine));
  });

  test('every seeded generic is cheaper than its brand', (a) => {
    const bad = meds.filter((m) => toPaise(m.genericPrice) >= toPaise(m.brandPrice)).map((m) => m.brandName);
    a.deepEqual(bad, []);
  });

  test('every seeded generic name contains the same salt(s) as its brand', (a) => {
    const bad = meds
      .filter((m) => {
        const generic = saltKey(normalizeText(m.genericName).replace(/^jan aushadhi /, ''));
        return generic !== saltKey(m.activeSalt);
      })
      .map((m) => m.brandName);
    a.deepEqual(bad, []);
  });

  test('every seeded saving % matches the formula', (a) => {
    for (const m of meds) {
      const expected = Math.floor(((Math.round(m.brandPrice * 100) - Math.round(m.genericPrice * 100)) * 100) / Math.round(m.brandPrice * 100));
      a.equal(savingPercent(m), expected, m.brandName);
    }
  });

  // ---------- per-unit savings (estimates) ----------
  test('savings maths: per-unit prices, saving and percent', (a) => {
    const r = compareUnitPrices({ status: 'verified_match', original: { mrp: 32, count: 15, unit: 'tablet' }, alternative: { mrp: 15, count: 15, unit: 'tablet' } });
    a.ok(r.ok && r.cheaper);
    a.equal(Math.round(r.originalPerUnit * 1000) / 1000, 213.333); // paise per tablet
    a.equal(r.alternativePerUnit, 100);
    a.equal(r.savingPercent, 53, '(2.1333 - 1.00) / 2.1333 = 53.1% -> 53');
    a.equal(savingForUnits(r.savingPerUnit, 15), 1700, 'Rs 17.00 on a pack of 15');
    const diffPacks = compareUnitPrices({ status: 'verified_match', original: { mrp: 30, count: 10, unit: 'tablet' }, alternative: { mrp: 40, count: 20, unit: 'tablet' } });
    a.equal(diffPacks.savingPercent, 33, 'different pack sizes compare per tablet: 3.00 vs 2.00');
  });

  test('savings are only calculated for verified matches with comparable units', (a) => {
    const base = { original: { mrp: 32, count: 15, unit: 'tablet' }, alternative: { mrp: 15, count: 15, unit: 'tablet' } };
    a.equal(compareUnitPrices({ ...base, status: 'needs_review' }).reason, 'not_verified');
    a.equal(compareUnitPrices({ ...base, status: 'insufficient_data' }).reason, 'not_verified');
    a.equal(compareUnitPrices({ ...base, status: 'verified_match', alternative: { mrp: 15, count: 100, unit: 'ml' } }).reason, 'units_differ');
    a.equal(compareUnitPrices({ ...base, status: 'verified_match', alternative: { mrp: null, count: 15, unit: 'tablet' } }).reason, 'no_price');
    const dearer = compareUnitPrices({ ...base, status: 'verified_match', alternative: { mrp: 50, count: 15, unit: 'tablet' } });
    a.ok(dearer.ok && !dearer.cheaper);
    a.equal(dearer.savingPerUnit, 0, 'never a negative saving');
  });

  test('entered MRP and pack size validation', (a) => {
    a.deepEqual(validateMrp('32'), { ok: true, value: 32 });
    a.deepEqual(validateMrp('₹ 1,250.50'), { ok: true, value: 1250.5 });
    a.equal(validateMrp('').ok, false);
    a.equal(validateMrp('0').ok, false);
    a.equal(validateMrp('abc').ok, false);
    a.equal(validateMrp('12.345').ok, false);
    a.deepEqual(validatePackCount('15'), { ok: true, value: 15 });
    a.deepEqual(validatePackCount('2.5'), { ok: true, value: 2.5 });
    a.equal(validatePackCount('0').ok, false);
    a.equal(validatePackCount('-3').ok, false);
  });

  test('NPPA ceiling check adds GST and compares per unit', (a) => {
    const ceiling = { ceilingPerUnit: 2.0, unitCode: 'tablet' };
    a.equal(ceilingCheck({ mrp: 32, count: 15, unit: 'tablet' }, ceiling).above, true, '2.13 > 2.00 + 5% = 2.10');
    a.equal(ceilingCheck({ mrp: 31.5, count: 15, unit: 'tablet' }, ceiling).above, false, '2.10 is not above 2.10');
    a.equal(ceilingCheck({ mrp: 32, count: 15, unit: 'tablet' }, { ceilingPerUnit: 2, unitCode: 'ml' }).applicable, false);
  });

  test('basket totals: per month, using current Jan Aushadhi prices when known', (a) => {
    const t = basketTotals([LINE(2)]);
    a.equal(t.totalOriginal, 6400, 'Rs 32 x 2 packs');
    a.equal(t.totalAlternative, 3000, '30 tablets x Rs 1.00');
    a.equal(t.totalSaving, 3400);
    a.equal(t.overallPercent, 53);
    a.equal(t.yearlySaving, 40800);
    const live = basketTotals([LINE(2)], new Map([['901', { mrp: 18, count: 15, unit: 'tablet' }]]));
    a.equal(live.totalAlternative, 3600);
    a.ok(live.lines[0].priceChanged);
    const gone = basketTotals([LINE(2)], new Map([['901', null]]));
    a.ok(gone.lines[0].noLongerListed);
    a.equal(gone.totalAlternative, 3000, 'falls back to the saved MRP');
  });

  // ---------- search results: savings against the price you pay ----------
  test('pack saving: reference price - alternative price, and the percentage of the reference (FR-02)', (a) => {
    const s = packSaving({ mrp: 30, count: 10, unit: 'tablet' }, JA500().price);
    a.equal(s.ok, true);
    a.equal(s.referenceForPack, 3000);
    a.equal(s.alternative, 550);
    a.equal(s.saving, 2450);
    a.equal(s.percent, 81);
  });

  test('pack saving: different pack sizes are normalised to the same quantity first', (a) => {
    const s = packSaving({ mrp: 45, count: 15, unit: 'tablet' }, JA500().price);
    a.equal(s.referenceForPack, 3000, 'Rs 45 for 15 is Rs 30 for 10');
    a.equal(s.saving, 2450);
    a.equal(s.percent, 81);
  });

  test('pack saving: nothing is claimed when the alternative is not cheaper', (a) => {
    const same = packSaving({ mrp: 5.5, count: 10, unit: 'tablet' }, JA500().price);
    a.deepEqual([same.ok, same.cheaper, same.saving, same.percent], [true, false, 0, 0]);
    const dearer = packSaving({ mrp: 4, count: 10, unit: 'tablet' }, JA500().price);
    a.deepEqual([dearer.cheaper, dearer.saving], [false, 0]);
  });

  test('pack saving: no figure without reliable prices on both sides', (a) => {
    const ref = { mrp: 30, count: 10, unit: 'tablet' };
    a.equal(packSaving(null, JA500().price).reason, 'no_reference');
    a.equal(packSaving(ref, null).reason, 'no_price');
    a.equal(packSaving(ref, { ...JA500().price, amount: 0 }).reason, 'no_price');
    a.equal(packSaving(ref, { ...JA500().price, packCount: null, packUnit: null }).reason, 'pack_unknown');
    a.equal(packSaving({ ...ref, unit: 'ml' }, JA500().price).reason, 'units_differ');
  });

  test('salt names, strength and formulation are shown separately', (a) => {
    const combo = JA500({ salts: [{ name: 'Paracetamol', strength: '500 mg' }, { name: 'Caffeine', strength: '25 mg' }] });
    a.equal(saltNames(JA500()), 'Paracetamol');
    a.equal(saltNames(combo), 'Paracetamol + Caffeine');
    a.equal(strengthText(combo), '500 mg + 25 mg');
    a.equal(strengthText(JA500({ salts: [{ name: 'Iron', strength: null }] })), null);
    a.equal(saltNames(JA500({ salts: [] })), null);
    a.equal(saltNames(JA500({ dosageForm: null, salts: [{ name: 'Elastic Gauze Bandages 10cm', strength: null }] })), null, 'a device is not a salt');
    a.equal(formulationLabel(JA500()), 'Paracetamol 500 mg, tablet');
    a.equal(
      formulationLabel(JA500({ salts: [{ name: 'Metoprolol', strength: '25 mg', saltForm: 'succinate' }], releaseType: 'pr' })),
      'Metoprolol succinate 25 mg, prolonged release (PR) tablet',
    );
  });

  test('comparison line: carries the price and its date; a reference is kept only when units match', (a) => {
    const line = comparisonLine(JA500());
    a.deepEqual([line.alternativeId, line.productId, line.enteredMrp, line.enteredCount], ['51', '', null, null]);
    a.deepEqual(line.alternativePrice, { mrp: 5.5, count: 10, unit: 'tablet', packLabel: "10's", asOf: '2026-11-24T00:00:00Z' });
    const withRef = comparisonLine(JA500(), { product: { id: '2', name: 'Crocin 500mg' }, reference: { mrp: 30, count: 10, unit: 'tablet' } });
    a.deepEqual([withRef.productId, withRef.productName, withRef.enteredMrp], ['2', 'Crocin 500mg', 30]);
    a.equal(comparisonLine(JA500(), { reference: { mrp: 30, count: 10, unit: 'ml' } }).enteredMrp, null);
    a.equal(comparisonLine(JA500({ price: null })), null, 'no price, nothing to compare');
  });

  test('basket totals: medicines without a reference price never count as savings', (a) => {
    const noRef = { ...comparisonLine(JA500()), packsPerMonth: 2 };
    const t = basketTotals([LINE(2), noRef]);
    a.equal(t.totalOriginal, 6400);
    a.equal(t.totalAlternative, 3000, 'only the compared medicine, so the three totals agree');
    a.equal(t.totalSaving, t.totalOriginal - t.totalAlternative);
    a.deepEqual(t.uncompared, { count: 1, cost: 1100 });
    a.deepEqual([t.lines[1].comparable, t.lines[1].original, t.lines[1].alternative, t.lines[1].saving], [false, null, 1100, 0]);
    const only = basketTotals([noRef]);
    a.equal(only.compared, 0);
    a.equal(only.totalSaving, 0);
  });

  // ---------- one comparison for a brand search and a salt search ----------
  const BRAND = (extra = {}) => ({
    id: '2', name: 'Crocin 500mg', isJanAushadhi: false, sourceId: 'legacy_json', updatedAt: '2026-11-23T10:00:00Z', manufacturer: null,
    composition: 'Paracetamol 500 mg', salts: [{ name: 'Paracetamol', strength: '500 mg', saltForm: null }], dosageForm: 'tablet', releaseType: null, formulationKey: null,
    price: null, priceStatus: 'none', pack: null, otherPacks: [], ...extra,
  });
  const VERIFIED = (extra = {}) => BRAND({
    id: '3', name: 'Crocin Advance 500 mg Tablet', sourceId: 'nppa_brand_mrp', releaseType: 'ir', formulationKey: JA500().formulationKey, priceStatus: 'verified',
    price: { amount: 20, packCount: 20, packUnit: 'tablet', packLabel: '20 tablets', unitPrice: 1, includesGst: true, sourceId: 'nppa_brand_mrp', effectiveFrom: '2026-11-24', updatedAt: '2026-11-24T10:00:00Z' }, ...extra,
  });
  const GENERIC = (extra = {}) => JA500({ sourceId: 'pmbi_product_list', updatedAt: '2026-11-24T10:00:00Z', priceStatus: 'verified', ...extra });
  const UNPRICED = GENERIC({ id: '52', price: null, priceStatus: 'none' });
  const DEVICE = GENERIC({ id: '53', name: 'Elastic gauze bandages 10cm', salts: [], dosageForm: null, releaseType: null, formulationKey: null, price: { amount: 178.13, packCount: null, packUnit: null, packLabel: "1's", unitPrice: null, sourceId: 'pmbi_product_list', updatedAt: '2026-11-24T10:00:00Z' } });
  const OK = { status: 'verified_match', reasons: [] };
  const ASK = { status: 'needs_review', reasons: [{ code: 'release_unknown', severity: 'review', message: 'The release type of Crocin 500mg is not recorded.' }] };
  const BODY = (brands, generics) => ({ groups: [{ key: 'g', brands, generics }], other: [] });
  const entry = (product, matches) => ({ product, matches });

  test('comparison: a verified brand price gives the saving at once, on the brand card and on the generic card', (a) => {
    const c = compareResults(BODY([VERIFIED()], [entry(GENERIC(), { 3: OK })]));
    const g = c.generics.get('51');
    a.deepEqual([g.saving.ok, g.saving.saving, g.saving.percent, g.brand.id, g.reference.source], [true, 450, 45, '3', 'nppa_brand_mrp'], '10 tablets: ₹10.00 vs ₹5.50');
    const b = c.brands.get('3');
    a.deepEqual([b.saving.saving, b.saving.percent, b.saving.count, b.generic.id], [900, 45, 20, '51'], '20 tablets: ₹20.00 vs ₹11.00');
  });

  test('comparison: packs are normalised before anything is compared', (a) => {
    const s = brandPackSaving({ mrp: 108.36, count: 15, unit: 'tablet' }, { amount: 12.38, packCount: 10, packUnit: 'tablet' });
    a.deepEqual([s.referenceForPack, s.alternative, s.saving, s.percent], [10836, 1857, 8979, 82]);
    a.equal(brandPackSaving({ mrp: 108.36, count: 15, unit: 'ml' }, { amount: 12.38, packCount: 10, packUnit: 'tablet' }).ok, false);
  });

  test('comparison: no saving without a verified match, however cheap the generic is', (a) => {
    for (const match of [ASK, { status: 'not_equivalent', reasons: [] }, { status: 'insufficient_data', reasons: [] }]) {
      const c = compareResults(BODY([VERIFIED()], [entry(GENERIC(), { 3: match })]));
      a.deepEqual([c.generics.get('51').saving.ok, c.brands.get('3').saving.ok, c.brands.get('3').saving.reason], [false, false, 'not_verified']);
    }
    const none = compareResults(BODY([VERIFIED()], []));
    a.equal(none.brands.get('3').saving.reason, 'no_generic');
    a.equal(compareResults(BODY([], [entry(GENERIC(), {})])).generics.get('51').match, null, 'a generic on its own is not matched with anything');
  });

  test('comparison: a brand without a price needs yours; with it, the saving is marked as entered by you', (a) => {
    const body = BODY([BRAND({ releaseType: 'ir' })], [entry(GENERIC(), { 2: OK })]);
    a.equal(compareResults(body).brands.get('2').saving.reason, 'no_reference');
    const c = compareResults(body, { entered: { 2: { mrp: 30, count: 15, unit: 'tablet', release: '' } } });
    a.deepEqual([c.generics.get('51').saving.saving, c.generics.get('51').reference.source, c.brands.get('2').reference.source], [1450, 'user_entered', 'user_entered']);
  });

  test('comparison: the release type read from the strip settles an unrecorded one, and never overrides a known one', (a) => {
    const item = entry(GENERIC(), { 2: ASK });
    a.equal(matchWith(item, BRAND()).status, 'needs_review');
    a.deepEqual([matchWith(item, BRAND(), { release: 'ir' }).status, matchWith(item, BRAND(), { release: 'ir' }).confirmedRelease], ['verified_match', 'ir']);
    a.equal(matchWith(item, BRAND(), { release: 'sr' }).status, 'not_equivalent', 'an SR strip is not a plain tablet');
    a.equal(matchWith(item, BRAND({ releaseType: 'sr' }), { release: 'ir' }).status, 'needs_review');
    const mixed = entry(GENERIC(), { 2: { status: 'needs_review', reasons: [...ASK.reasons, { code: 'salt_form_differs', message: 'x' }] } });
    a.equal(matchWith(mixed, BRAND(), { release: 'ir' }).status, 'needs_review', 'other differences still need a pharmacist');
    const strip = compareResults(BODY([VERIFIED({ releaseType: null })], [entry(GENERIC(), { 3: ASK })]), { entered: { 3: { release: 'ir' } } });
    a.deepEqual([strip.generics.get('51').saving.ok, strip.brands.get('3').reference.source], [true, 'nppa_brand_mrp'], 'the verified price stays the reference');
  });

  test('comparison: several brands never overstate a saving: the cheapest is used, unless you entered a price', (a) => {
    const dear = VERIFIED({ id: '4', name: 'Dear', price: { ...VERIFIED().price, amount: 60 } });
    const body = BODY([dear, VERIFIED()], [entry(GENERIC(), { 3: OK, 4: OK })]);
    a.equal(compareResults(body).generics.get('51').brand.id, '3');
    const c = compareResults(body, { entered: { 4: { mrp: 50, count: 10, unit: 'tablet', release: '' } } });
    a.deepEqual([c.generics.get('51').brand.id, c.generics.get('51').reference.source], ['4', 'user_entered']);
    a.deepEqual([brandReference(dear).mrp, brandReference(dear, { mrp: 50, count: 10, unit: 'tablet' }).mrp, brandReference(BRAND())], [60, 50, null]);
  });

  test('comparison: a price typed for a generic\'s formulation replaces the brand price, and only yours', (a) => {
    const body = BODY([VERIFIED()], [entry(GENERIC(), { 3: OK })]);
    const c = compareResults(body, { references: { [JA500().formulationKey]: { mrp: 45, count: 15, unit: 'tablet' } } });
    a.deepEqual([c.generics.get('51').ownPrice, c.generics.get('51').saving.saving, c.brands.get('3').saving.saving], [true, 2450, 900]);
  });

  // ---------- one card for every medicine ----------
  const view = (brands, generics, prices) => compareResults(BODY(brands, generics), prices);

  test('medicine card: branded, generic, unpriced, demo and unknown medicines all fill the same slots', (a) => {
    const c = view([VERIFIED(), BRAND()], [entry(GENERIC(), { 3: OK, 2: ASK })]);
    const cards = [
      medicineCardModel(VERIFIED(), c.brands.get('3')), medicineCardModel(BRAND(), c.brands.get('2')), medicineCardModel(GENERIC(), c.generics.get('51')),
      medicineCardModel(UNPRICED), medicineCardModel(DEVICE), medicineCardModel(BRAND()), medicineCardModel(GENERIC(), undefined, { canAdd: false }),
    ];
    a.equal(new Set(cards.map((x) => Object.keys(x).sort().join())).size, 1, 'same slots on every card');
    for (const x of cards) {
      a.deepEqual(x.facts.map((f) => f.label), ['Salt composition', 'Strength', 'Pack size', 'Manufacturer']);
      for (const f of x.facts) a.ok(f.text, `${x.name}: ${f.label} is never blank`);
      for (const slot of [x.category.text, x.form, x.source, x.match, x.price.label, x.price.text, x.price.note, x.price.tag.text, x.saving.text, x.action.label]) a.ok(typeof slot === 'string' && slot !== '', `${x.name}: no empty slot`);
      a.ok(['badge', 'prompt', 'note'].includes(x.saving.kind));
    }
  });

  test('medicine card: brands and generics carry the same button; it says why when it is off', (a) => {
    const c = view([VERIFIED(), BRAND({ releaseType: 'ir' })], [entry(GENERIC(), { 3: OK, 2: OK })]);
    const label = (card) => [card.action.kind, card.action.label, card.action.disabled];
    a.deepEqual(label(medicineCardModel(VERIFIED(), c.brands.get('3'))), ['add', 'Add to Comparison Basket', false]);
    a.deepEqual(label(medicineCardModel(GENERIC(), c.generics.get('51'))), ['add', 'Add to Comparison Basket', false]);
    const noPrice = medicineCardModel(BRAND({ releaseType: 'ir' }), c.brands.get('2'));
    a.deepEqual([...label(noPrice), noPrice.action.hint, noPrice.saving.kind, noPrice.saving.text], ['add', 'Add to Comparison Basket', true, 'Add your price first', 'prompt', 'Enter the MRP on your pack']);
    a.deepEqual([medicineCardModel(UNPRICED).action.disabled, medicineCardModel(UNPRICED).action.hint], [true, 'No listed price to compare']);
    for (const p of [VERIFIED(), GENERIC(), BRAND()]) a.deepEqual(label(medicineCardModel(p, undefined, { canAdd: false })), ['print', 'Print Comparison', false], 'Pharmacy Buyer: same button on every card, no basket');
  });

  test('medicine card: verified, user-entered and missing prices are told apart, and demo data is marked', (a) => {
    const entered = { 2: { mrp: 30, count: 15, unit: 'tablet', release: 'ir' }, 3: { mrp: 25, count: 20, unit: 'tablet', release: '' } };
    const body = [[VERIFIED(), BRAND()], [entry(GENERIC(), { 3: OK, 2: ASK })]];
    const plain = view(...body);
    const mine = view(...body, { entered });
    const price = (p, v) => { const x = medicineCardModel(p, v); return [x.price.tag.text, x.price.text, x.price.available]; };
    a.deepEqual(price(VERIFIED(), plain.brands.get('3')), ['Verified price', '₹20.00', true]);
    a.deepEqual(price(GENERIC(), plain.generics.get('51')), ['Verified price', '₹5.50', true]);
    a.deepEqual(price(BRAND(), plain.brands.get('2')), ['No verified price', 'Price unavailable', false]);
    a.deepEqual(price(BRAND(), mine.brands.get('2')), ['Entered by you', '₹30.00', true]);
    a.deepEqual(price(VERIFIED(), mine.brands.get('3')), ['Entered by you', '₹25.00', true], 'your own price wins, and says so');
    a.equal(medicineCardModel(VERIFIED(), mine.brands.get('3')).saving.links, 'own');
    a.equal(medicineCardModel(VERIFIED(), plain.brands.get('3')).saving.links, 'override');
    a.deepEqual(medicineCardModel(BRAND()).tags.map((t) => t.text), ['Demo data']);
    a.deepEqual(medicineCardModel(VERIFIED()).tags.map((t) => t.text), []);
    a.equal(medicineCardModel(BRAND(), mine.brands.get('2')).source, 'Price entered by you. Details: Demo data, not checked, updated 23 Nov 2026');
    a.equal(new Set(Object.values(PRICE_TAGS).map((t) => t.text)).size, 3);
  });

  test('medicine card: missing details are named as missing, never invented', (a) => {
    const facts = (p, v) => Object.fromEntries(medicineCardModel(p, v).facts.map((f) => [f.label, [f.text, f.missing]]));
    a.deepEqual(facts(GENERIC()).Manufacturer, ['Not listed by PMBI', true]);
    a.deepEqual(facts(VERIFIED()).Manufacturer, ['Not listed by NPPA', true]);
    a.deepEqual(facts(BRAND()).Manufacturer, ['Not listed', true]);
    a.deepEqual(facts(BRAND({ manufacturer: 'Micro Labs' })).Manufacturer, ['Micro Labs', false]);
    a.deepEqual(facts(BRAND())['Pack size'], ['Not listed', true]);
    a.deepEqual(facts(BRAND({ pack: { label: 'Strip of 15 tablets', count: 15, unit: 'tablet' } }))['Pack size'], ['15 tablets', false], 'known without a price');
    a.deepEqual(facts(VERIFIED({ otherPacks: [{ label: '30 tablets', amount: 30, unitPrice: 1 }] }))['Pack size'], ['20 tablets (also 30 tablets)', false]);
    a.deepEqual(facts(GENERIC({ price: null, pack: { label: "1's", count: null, unit: null } }))['Pack size'], ["1's", false], 'shown as listed when it cannot be read');
    a.deepEqual([facts(DEVICE)['Salt composition'], facts(DEVICE).Strength], [['Not listed', true], ['Not listed', true]]);
    a.deepEqual([medicineCardModel(DEVICE).form, medicineCardModel(GENERIC()).form], ['Form not listed, drug code T500', 'Tablet, drug code T500']);
    a.equal(medicineCardModel(BRAND()).source, 'Demo data, not checked, updated 23 Nov 2026');
    a.equal(medicineCardModel(VERIFIED()).source, 'NPPA Pharma Sahi Daam (official MRP), updated 24 Nov 2026');
    a.equal(medicineCardModel(UNPRICED).source, 'Jan Aushadhi MRP list (PMBI), updated 24 Nov 2026', 'an unpriced medicine still names its source');
    a.equal(medicineCardModel(GENERIC({ updatedAt: null, price: null })).source, 'Jan Aushadhi MRP list (PMBI)');
  });

  test('medicine card: what the saving is measured against is always named', (a) => {
    const c = view([VERIFIED()], [entry(GENERIC(), { 3: OK })]);
    const g = medicineCardModel(GENERIC(), c.generics.get('51'));
    a.deepEqual([g.saving.kind, g.saving.text, g.reference, g.status.text], ['badge', 'Save ₹4.50 (45%)', 'Crocin Advance 500 mg Tablet: ₹10.00 for 10 tablets', 'Verified match']);
    const b = medicineCardModel(VERIFIED(), c.brands.get('3'));
    a.deepEqual([b.saving.text, b.reference, b.match, b.status], ['Save ₹9.00 (45%)', 'Generic: ₹11.00 for 20 tablets', 'Compared with Paracetamol Tablets IP 500 mg.', null]);
    const review = medicineCardModel(GENERIC(), view([BRAND()], [entry(GENERIC(), { 2: ASK })]).generics.get('51'));
    a.deepEqual([review.saving.kind, review.reference, review.status.text, review.match], ['note', null, 'Needs review', ASK.reasons[0].message]);
    const cheaper = medicineCardModel(VERIFIED(), view([VERIFIED({ price: { ...VERIFIED().price, amount: 5 } })], [entry(GENERIC(), { 3: OK })]).brands.get('3'));
    a.deepEqual([cheaper.saving.kind, cheaper.action.disabled], ['note', false], 'not cheaper: said plainly, still comparable');
    a.equal(medicineCardModel(GENERIC(), compareResults(BODY([], [entry(GENERIC(), {})])).generics.get('51')).saving.kind, 'prompt');
    for (const p of [UNPRICED, DEVICE]) a.equal(medicineCardModel(p).saving.kind, 'note');
  });

  test('prices typed for a brand: MRP and pack, the strip answer alone, or both; anything else is refused', (a) => {
    clearReferences();
    a.equal(saveEntered('2', { mrp: 30, count: 15, unit: 'tablet', release: 'ir' }), true);
    a.equal(saveEntered('3', { release: 'sr' }), true);
    a.equal(saveEntered('4', { release: 'banana' }), false);
    a.equal(saveEntered('4', { mrp: -1, count: 15, unit: 'tablet' }), false);
    a.equal(saveEntered('5', { mrp: 30, count: 15, unit: 'tablet', release: 'banana', extra: '<b>' }), true);
    a.deepEqual(getEntered(), { 2: { mrp: 30, count: 15, unit: 'tablet', release: 'ir' }, 3: { release: 'sr' }, 5: { mrp: 30, count: 15, unit: 'tablet', release: '' } });
    saveEntered('2', null);
    a.deepEqual(Object.keys(getEntered()), ['3', '5']);
    clearReferences();
    a.deepEqual(getEntered(), {});
  });

  test('basket: a verified reference keeps its source and date, and is refreshed; one typed by you is not', (a) => {
    const reference = brandReference(VERIFIED());
    const line = comparisonLine(GENERIC(), { product: VERIFIED(), reference });
    a.deepEqual([line.productId, line.enteredMrp, line.enteredCount, line.referenceSource, line.referenceAsOf], ['3', 20, 20, 'nppa_brand_mrp', '2026-11-24']);
    const [kept] = sanitizeBasket([{ ...line, packsPerMonth: 1 }]);
    a.deepEqual([kept.referenceSource, kept.referenceAsOf, isUserPrice(kept)], ['nppa_brand_mrp', '2026-11-24', false]);
    const live = new Map([['3', { mrp: 24, count: 20, unit: 'tablet', asOf: '2026-12-24' }]]);
    a.deepEqual([lineReference(kept, live).mrp, lineReference(kept).mrp], [24, 20]);
    a.equal(basketTotals([kept], new Map(), live).totalOriginal, 2400);
    const typed = sanitizeBasket([{ ...line, referenceSource: 'user_entered', packsPerMonth: 1 }])[0];
    a.deepEqual([isUserPrice(typed), lineReference(typed, live).mrp], [true, 20]);
    a.equal(sanitizeBasket([{ ...line, referenceSource: 'made_up', packsPerMonth: 1 }])[0].referenceSource, 'user_entered', 'an unknown source is never shown as verified');
    a.equal(sanitizeBasket([LINE(1)])[0].referenceSource, 'user_entered', 'lines saved before this were all typed by the user');
  });

  test('basket: a brand and its generic are one line, and both cards show it as added', (a) => {
    storage.initStorage();
    storage.clearAll();
    basket.initBasket(() => 'patient');
    basket.clearBasket();
    basket.addComparison(comparisonLine(GENERIC()));
    const r = basket.addComparison(comparisonLine(GENERIC(), { product: VERIFIED(), reference: brandReference(VERIFIED()) }));
    a.deepEqual([r.data.added, r.data.basket.length, r.data.basket[0].productId], [false, 1, '3']);
    a.deepEqual([isInBasket(r.data.basket, '3'), isInBasket(r.data.basket, '51'), isInBasket(r.data.basket, '2')], [true, true, false]);
    const typed = basket.applyBrandReference('3', { mrp: 40, count: 20, unit: 'tablet', source: 'user_entered', asOf: '' });
    a.deepEqual([typed.data[0].enteredMrp, typed.data[0].referenceSource], [40, 'user_entered']);
    const again = basket.addComparison(comparisonLine(GENERIC(), { product: VERIFIED(), reference: brandReference(VERIFIED()) }));
    a.equal(again.data.basket[0].enteredMrp, 40, 'your price is not replaced by adding again');
    const back = basket.applyBrandReference('3', brandReference(VERIFIED()));
    a.deepEqual([back.data[0].enteredMrp, back.data[0].referenceSource], [20, 'nppa_brand_mrp'], 'cleared: the verified price is used again');
    basket.clearBasket();
    storage.clearAll();
  });

  test('data status: loaded from the API, failures reported', async (a) => {
    const status = { sources: [{ id: 'pmbi_product_list', imported: true, stale: false }], counts: { janAushadhiProducts: 1 }, officialDataImported: true };
    a.ok((await loadDataStatus({ loadStatus: async () => status })).ok);
    a.equal(sourceInfo('pmbi_product_list').imported, true);
    const failed = await loadDataStatus({ loadStatus: async () => { throw new Error('offline'); } });
    a.equal(failed.error.code, ERR.DATA_LOAD);
    a.equal(getDataStatus(), null);
    a.equal((await loadDataStatus({ loadStatus: async () => ({ nonsense: true }) })).ok, false);
  });

  test('basket: add, merge, persist, update, remove and undo, and the Pharmacy Buyer block', async (a) => {
    storage.initStorage();
    storage.clearAll();
    let role = 'patient';
    basket.initBasket(() => role);
    basket.clearBasket();

    a.equal(basket.calculateTotalSavings().error.code, ERR.EMPTY_BASKET);
    a.equal(basket.addToBasket(LINE(1), 0).error.message, MESSAGES.QTY_MIN);
    a.equal(basket.addToBasket({ ...LINE(1), enteredMrp: 0 }, 1).error.code, ERR.VALIDATION);

    basket.addToBasket(LINE(1), 1);
    basket.addToBasket(LINE(1), 1);
    basket.addToBasket(LINE(1, { alternativeId: '902' }), 3);
    const b = basket.getBasket();
    a.equal(b.length, 2);
    a.equal(b[0].packsPerMonth, 2, 'same medicine and alternative merge');
    a.equal(basket.calculateTotalSavings().data.totalSaving, 3400 + 5100);

    basket.initBasket(() => role);
    a.equal(basket.getBasket().length, 2, 'basket was not restored from storage');

    const key = basket.basketKey(b[0]);
    a.equal(basket.updateQuantity(key, 4).data[0].packsPerMonth, 4);
    const removed = basket.removeFromBasket(key);
    a.equal(basket.getBasket().length, 1);
    basket.restoreItem(removed.data.removed);
    a.equal(basket.basketKey(basket.getBasket()[0]), key, 'undo should restore original position');

    role = 'pharmacy';
    a.equal(basket.addToBasket(LINE(1), 1).error.code, ERR.FORBIDDEN);
    role = 'patient';
    basket.clearBasket();
  });

  test('reference prices: one per formulation, replaceable, removable, bad values refused', (a) => {
    clearReferences();
    a.deepEqual(getReferences(), {});
    a.equal(saveReference('k1', { mrp: 30, count: 10, unit: 'tablet' }), true);
    a.equal(saveReference('k2', { mrp: 60, count: 60, unit: 'ml' }), true);
    a.equal(saveReference('k1', { mrp: 32, count: 15, unit: 'tablet' }), true);
    a.deepEqual(getReferences().k1, { mrp: 32, count: 15, unit: 'tablet' });
    a.equal(saveReference('k3', { mrp: 0, count: 10, unit: 'tablet' }), false);
    a.equal(saveReference('', { mrp: 30, count: 10, unit: 'tablet' }), false, 'an unknown formulation is never compared');
    a.equal(saveReference('k1', null), true);
    a.deepEqual(Object.keys(getReferences()), ['k2']);
    clearReferences();
    a.deepEqual(getReferences(), {});
  });

  test('comparison basket: add once, no duplicates, survives a refresh, remove', (a) => {
    storage.initStorage();
    storage.clearAll();
    let role = 'patient';
    basket.initBasket(() => role);
    basket.clearBasket();

    const first = basket.addComparison(comparisonLine(JA500()));
    a.deepEqual([first.ok, first.data.added, first.data.basket.length], [true, true, 1]);
    const again = basket.addComparison(comparisonLine(JA500()));
    a.deepEqual([again.ok, again.data.added, again.data.basket.length], [true, false, 1]);
    a.equal(basket.getBasket()[0].packsPerMonth, 1, 'adding again does not change the quantity');
    a.equal(isInBasket(basket.getBasket(), '51'), true);
    a.equal(isInBasket(basket.getBasket(), '99'), false);

    basket.initBasket(() => role);
    a.equal(basket.getBasket().length, 1, 'still there after a refresh');
    basket.removeFromBasket(basket.basketKey(basket.getBasket()[0]));
    a.equal(basket.getBasket().length, 0);

    role = 'pharmacy';
    a.equal(basket.addComparison(comparisonLine(JA500())).error.code, ERR.FORBIDDEN);
    role = 'patient';
    basket.clearBasket();
  });

  test('comparison basket: the same medicine added with a price later updates the one entry', (a) => {
    storage.initStorage();
    storage.clearAll();
    basket.initBasket(() => 'patient');
    basket.clearBasket();
    basket.addComparison(comparisonLine(JA500()));
    const r = basket.addComparison(comparisonLine(JA500(), { product: { id: '2', name: 'Crocin 500mg' }, reference: { mrp: 30, count: 10, unit: 'tablet' } }));
    a.deepEqual([r.data.added, r.data.basket.length], [false, 1]);
    a.deepEqual([r.data.basket[0].productName, r.data.basket[0].enteredMrp], ['Crocin 500mg', 30]);
    const back = basket.addComparison(comparisonLine(JA500()));
    a.equal(back.data.basket[0].enteredMrp, 30, 'a known price is not lost');
    basket.clearBasket();
  });

  test('comparison basket: add the price you pay to an entry; unsafe or unreadable ones are refused', (a) => {
    storage.initStorage();
    storage.clearAll();
    basket.initBasket(() => 'patient');
    basket.clearBasket();
    basket.addComparison(comparisonLine(JA500()));
    const key = basket.basketKey(basket.getBasket()[0]);
    a.equal(basket.setReference(key, { mrp: 0, count: 10 }).ok, false);
    const r = basket.setReference(key, { mrp: 30, count: 10 });
    a.equal(r.ok, true);
    a.equal(basket.calculateTotalSavings().data.totalSaving, 2450);
    basket.clearBasket();

    basket.addComparison(comparisonLine(JA500({ id: '52', formulationKey: null })));
    a.equal(basket.setReference(':52', { mrp: 30, count: 10 }).ok, false, 'strength, form or release type is not known');
    basket.addComparison(comparisonLine(JA500({ id: '53', price: { ...JA500().price, packCount: null, packUnit: null, packLabel: '3 ml' } })));
    a.equal(basket.getBasket().length, 2, 'a medicine with an unreadable pack can still be kept with its price');
    a.equal(basket.setReference(':53', { mrp: 30, count: 10 }).ok, false);
    basket.clearBasket();
  });

  test('basket storage: reading never writes, so a page cannot erase items it does not understand', (a) => {
    storage.initStorage();
    storage.clearAll();
    const stored = [{ ...comparisonLine(JA500()), packsPerMonth: 1 }, { someFutureFormat: true }];
    storage.setJSON(STORAGE_KEYS.basket, stored);
    basket.initBasket(() => 'patient');
    a.equal(basket.getBasket().length, 1, 'only the line it understands is shown');
    a.deepEqual(storage.getJSON(STORAGE_KEYS.basket), stored, 'storage is untouched');
    storage.clearAll();
  });

  test('basket storage: a page still open from the previous version cannot wipe the basket', (a) => {
    storage.initStorage();
    storage.clearAll();
    basket.initBasket(() => 'patient');
    basket.addComparison(comparisonLine(JA500()));
    storage.setJSON('saltsaver:v1:basket3', []); // what the previous version writes when it re-reads its basket
    basket.initBasket(() => 'patient');
    a.equal(basket.getBasket().length, 1);
    basket.clearBasket();
    storage.clearAll();
  });

  test('basket storage: the newest previous basket is carried over once, and stays cleared after that', (a) => {
    storage.initStorage();
    storage.clearAll();
    storage.setJSON('saltsaver:v1:basket2', [LINE(5)]);
    storage.setJSON('saltsaver:v1:basket3', [LINE(2)]);
    basket.initBasket(() => 'patient');
    a.deepEqual(basket.getBasket().map((i) => [i.productName, i.packsPerMonth]), [['Test Brand 650', 2]]);
    basket.addComparison(comparisonLine(JA500()));
    basket.initBasket(() => 'patient');
    a.equal(basket.getBasket().length, 2);
    basket.clearBasket();
    basket.initBasket(() => 'patient');
    a.equal(basket.getBasket().length, 0, 'the previous basket does not come back');
    storage.clearAll();
  });

  test('comparison line keeps the strength for the cart', (a) => {
    a.equal(comparisonLine(JA500()).strength, '500 mg');
    a.equal(comparisonLine(JA500({ salts: [] })).strength, '');
    a.equal(sanitizeBasket([{ ...comparisonLine(JA500()), packsPerMonth: 1 }])[0].strength, '500 mg', 'kept when saved');
  });

  test('line comparison: price, reference price and saving for one Jan Aushadhi pack', (a) => {
    const line = { ...comparisonLine(JA500(), { reference: { mrp: 45, count: 15, unit: 'tablet' } }), packsPerMonth: 3 };
    const s = savingForLine(line);
    a.deepEqual([s.ok, s.alternative, s.referenceForPack, s.saving, s.percent], [true, 550, 3000, 2450, 81]);
    a.equal(savingForLine({ ...line, enteredMrp: null, enteredCount: null }).reason, 'no_reference');
    a.equal(savingForLine(line, { mrp: 6, count: 10, unit: 'tablet' }).alternative, 600, 'a refreshed price is used');
  });

  test('comparison basket: a price entered on the search page reaches the medicine already in the basket', (a) => {
    storage.initStorage();
    storage.clearAll();
    let role = 'patient';
    basket.initBasket(() => role);
    const other = JA500({ id: '60', formulationKey: 'another formulation' });
    basket.addComparison(comparisonLine(JA500()));
    basket.addComparison(comparisonLine(other));
    const ref = { mrp: 30, count: 15, unit: 'tablet' };
    const r = basket.applyReference(JA500().formulationKey, ref);
    a.deepEqual(r.data.map((i) => [i.alternativeId, i.enteredMrp, i.enteredCount]), [['51', 30, 15], ['60', null, null]], 'only the same formulation');
    basket.initBasket(() => role);
    a.equal(basket.getBasket()[0].enteredMrp, 30, 'saved');
    basket.applyReference(JA500().formulationKey, { ...ref, mrp: 45 });
    a.equal(basket.getBasket()[0].enteredMrp, 45, 'a changed price replaces it');
    basket.applyReference(JA500().formulationKey, { ...ref, unit: 'ml' });
    a.equal(basket.getBasket()[0].enteredMrp, 45, 'a different unit is never applied');
    basket.clearBasket();

    basket.addComparison(comparisonLine(JA500(), { product: { id: '2', name: 'Crocin 500mg' }, reference: { mrp: 20, count: 10, unit: 'tablet' } }));
    basket.applyReference(JA500().formulationKey, ref);
    a.equal(basket.getBasket()[0].enteredMrp, 20, "a brand's own price is kept");
    role = 'pharmacy';
    a.equal(basket.applyReference(JA500().formulationKey, ref).error.code, ERR.FORBIDDEN);
    role = 'patient';
    basket.clearBasket();
    storage.clearAll();
  });

  test('comparison basket: baskets saved before this change still load', (a) => {
    a.equal(sanitizeBasket([LINE(2)])[0].enteredMrp, 32);
    a.equal(sanitizeBasket([{ ...LINE(1), enteredMrp: null }]).length, 0, 'a half-filled reference is dropped');
  });
}
