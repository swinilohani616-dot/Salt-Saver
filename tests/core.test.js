/**
 * Unit + data tests for js/core and the services (PRD §15: 100% accurate salt
 * matching and price math across the seeded database).
 */
import { normalizeText, saltKey } from '../js/core/normalize.js';
import { buildSaltIndex, sameSaltBrands } from '../js/core/saltIndex.js';
import { searchMedicines, scoreMedicine, SCORE } from '../js/core/search.js';
import { toPaise, unitSaving, savingPercent, lineSaving, basketSummary } from '../js/core/savings.js';
import { validateQuantity, validateDb, sanitizeBasket, isValidMedicine } from '../js/core/validate.js';
import { can, isValidRole } from '../js/core/roles.js';
import { escapeHTML, formatINR } from '../js/core/sanitize.js';
import { ERR } from '../js/core/errors.js';
import { MESSAGES } from '../js/config.js';
import { loadDatabase } from '../js/services/dataService.js';
import { searchMedicine } from '../js/services/medicineService.js';
import * as basket from '../js/services/basketService.js';
import * as storage from '../js/services/storage.js';

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

  test('FR-01: "Crocin" finds Crocin 500mg with salt Paracetamol 500mg', (a) => {
    const [first] = searchMedicines('Crocin', meds);
    a.equal(first.brandName, 'Crocin 500mg');
    a.equal(first.activeSalt, 'Paracetamol 500mg');
  });

  test('BR-03: searching by salt "Paracetamol" also returns Crocin', (a) => {
    const names = searchMedicines('Paracetamol', meds).map((m) => m.brandName);
    a.ok(names.includes('Crocin 500mg'), 'Crocin missing');
    a.ok(names.includes('Dolo 650'), 'Dolo 650 missing');
  });

  test('search is case- and spacing-insensitive', (a) => {
    a.equal(searchMedicines('  cRoCiN ', meds)[0].id, 'med_101');
    a.equal(searchMedicines('paracetamol 500 mg', meds)[0].activeSalt, 'Paracetamol 500mg');
  });

  test('search matches the second salt of a combination', (a) => {
    const ids = searchMedicines('metformin', meds).map((m) => m.id);
    a.ok(ids.includes('med_108'), 'Glycomet GP 1 (Glimepiride + Metformin) missing');
  });

  test('ranking: exact brand > brand prefix > salt prefix > contains', (a) => {
    a.equal(scoreMedicine('crocin 500mg', CROCIN), SCORE.BRAND_EXACT);
    a.equal(scoreMedicine('cro', CROCIN), SCORE.BRAND_PREFIX);
    a.equal(scoreMedicine('parac', CROCIN), SCORE.SALT_PREFIX);
    a.equal(scoreMedicine('aushadhi', CROCIN), SCORE.CONTAINS);
    a.equal(scoreMedicine('zzz', CROCIN), 0);
  });

  test('queries shorter than 2 characters return nothing', (a) => {
    a.equal(searchMedicines('c', meds).length, 0);
    a.equal(searchMedicines('', meds).length, 0);
  });

  test('unknown query returns no results', (a) => {
    a.equal(searchMedicines('xyzabc', meds).length, 0);
  });

  // ---------- salt index ----------
  test('salt index groups brands with identical salt and strength', (a) => {
    const index = buildSaltIndex(meds);
    const crocin = meds.find((m) => m.id === 'med_101');
    a.deepEqual(sameSaltBrands(index, crocin).map((m) => m.brandName), ['Calpol 500mg']);
    const dolo = meds.find((m) => m.id === 'med_103');
    a.equal(sameSaltBrands(index, dolo).length, 0, 'Paracetamol 650mg must not group with 500mg');
  });

  // ---------- savings (FR-02, FR-03, BR-01) ----------
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

  test('sanitizeBasket drops unknown ids, bad quantities and merges duplicates', (a) => {
    const byId = new Map([[CROCIN.id, CROCIN]]);
    const clean = sanitizeBasket(
      [
        { medicineId: 'med_101', quantityPerMonth: 2 },
        { medicineId: 'med_101', quantityPerMonth: 3 },
        { medicineId: 'nope', quantityPerMonth: 1 },
        { medicineId: 'med_101', quantityPerMonth: 0 },
      ],
      byId,
    );
    a.deepEqual(clean, [{ medicineId: 'med_101', quantityPerMonth: 5 }]);
    a.deepEqual(sanitizeBasket('garbage', byId), []);
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

  test('every seeded brand is found by its own brand name and by each of its salts', (a) => {
    const misses = [];
    for (const m of meds) {
      if (searchMedicines(m.brandName, meds)[0]?.id !== m.id) misses.push(`brand:${m.brandName}`);
      for (const part of m.activeSalt.split('+')) {
        const name = part.trim().split(/\s+\d/)[0];
        if (!searchMedicines(name, meds, { maxResults: 100 }).some((r) => r.id === m.id)) misses.push(`salt:${name}`);
      }
    }
    a.deepEqual(misses, []);
  });

  test('every seeded saving % matches the formula', (a) => {
    for (const m of meds) {
      const expected = Math.floor(((Math.round(m.brandPrice * 100) - Math.round(m.genericPrice * 100)) * 100) / Math.round(m.brandPrice * 100));
      a.equal(savingPercent(m), expected, m.brandName);
    }
  });

  // ---------- services (PRD §9) ----------
  test('services: load DB, search, add, merge, calculate, remove and undo', async (a) => {
    storage.initStorage();
    storage.clearAll();
    const loaded = await loadDatabase({ loadSeed: async () => sampleData });
    a.ok(loaded.ok, 'database did not load');

    let role = 'patient';
    basket.initBasket(() => role);
    basket.clearBasket();

    a.equal(searchMedicine('xyz').error.code, ERR.NOT_FOUND);
    a.equal(searchMedicine('x').error.code, ERR.VALIDATION);
    const found = searchMedicine('Crocin');
    a.equal(found.data[0].medicine.id, 'med_101');
    a.deepEqual(found.data[0].sameSalt.map((m) => m.id), ['med_102']);

    a.equal(basket.calculateTotalSavings().error.code, ERR.EMPTY_BASKET);
    a.equal(basket.addToBasket('med_101', 0).error.message, MESSAGES.QTY_MIN);
    a.equal(basket.addToBasket('nope', 1).error.code, ERR.VALIDATION);

    basket.addToBasket('med_101', 1);
    basket.addToBasket('med_101', 1);
    basket.addToBasket('med_106', 1);
    a.deepEqual(basket.getBasket(), [
      { medicineId: 'med_101', quantityPerMonth: 2 },
      { medicineId: 'med_106', quantityPerMonth: 1 },
    ]);
    a.equal(basket.calculateTotalSavings().data.totalSaving, 6800);

    // FR-04: a fresh init restores the stored basket
    basket.initBasket(() => role);
    a.equal(basket.getBasket().length, 2, 'basket was not restored from storage');

    const removed = basket.removeFromBasket('med_101');
    a.equal(basket.getBasket().length, 1);
    basket.restoreItem(removed.data.removed);
    a.equal(basket.getBasket()[0].medicineId, 'med_101', 'undo should restore original position');

    role = 'pharmacy';
    a.equal(basket.addToBasket('med_101', 1).error.code, ERR.FORBIDDEN);
    role = 'patient';
    basket.clearBasket();
  });
}
