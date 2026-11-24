/**
 * Phase 5: NPPA ceiling price importer. The PDF below copies the layout of NPPA's
 * ceiling price lists (two-line header, "(1) (2) ..." line, (A)/(B) combinations,
 * wrapped cells, pack-size variants); its prices are synthetic test values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { loadReferenceData } from '../../db/reference.js';
import { stageImport, approveImport } from '../../db/pipeline.js';
import { nppaAdapter, parseCeilingUnit, parseIndianDate, unitKey } from '../../db/importers/nppa.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { nppaPdf } from '../helpers/nppaFixture.js';

const count = async (db, sql, params) => Number((await db.query(sql, params))[0].n);

async function freshDb() {
  const db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  return db;
}

test('NPPA units and dates', () => {
  assert.deepEqual(parseCeilingUnit('1 Tablet'), { count: 1, code: 'tablet' });
  assert.deepEqual(parseCeilingUnit('1 ml'), { count: 1, code: 'ml' });
  assert.deepEqual(parseCeilingUnit('Per 0.1 ml'), { count: 0.1, code: 'ml' });
  assert.deepEqual(parseCeilingUnit('Each Pack'), { count: 1, code: 'pack' });
  assert.deepEqual(parseCeilingUnit('Each Vial'), { count: 1, code: 'vial' });
  assert.deepEqual(parseCeilingUnit('Per Metered Dose'), { count: 1, code: 'dose' });
  assert.deepEqual(parseCeilingUnit('1 soft gelatin capsule'), { count: 1, code: 'capsule' });
  assert.deepEqual(parseCeilingUnit('Each Pack (10 ml)'), { count: 1, code: 'pack', packMl: 10 });
  assert.deepEqual(parseCeilingUnit('500ml Non-Glass'), { count: 1, code: 'pack', packMl: 500, container: 'non-glass' });
  assert.equal(unitKey(parseCeilingUnit('500ml Non-Glass')), 'pack:500ml:non-glass');
  assert.equal(parseCeilingUnit('1 IUD'), null);
  assert.equal(parseCeilingUnit('Cubic Meter'), null);
  assert.equal(parseIndianDate('30.09.2020'), '2020-09-30');
  assert.equal(parseIndianDate('1/4/2026'), '2026-04-01');
  assert.equal(parseIndianDate('31.02.2026'), null);
});

test('NPPA PDF: layout is read, combinations and wrapped cells are joined, odd rows are flagged', async () => {
  const db = await freshDb();
  const staged = await stageImport(db, nppaAdapter, { bytes: nppaPdf(), fileName: 'nppa.pdf', effectiveFrom: '2026-04-01' });
  assert.deepEqual({ rows: staged.summary.rows, parsed: staged.summary.parsed, failed: staged.summary.failed }, { rows: 9, parsed: 8, failed: 1 });
  const keys = (await db.query("select record_key from source_records where parse_status = 'parsed' order by id")).map((r) => r.record_key);
  assert.deepEqual(keys, [
    'paracetamol 500 mg|tablet|ir|tablet',
    'abacavir 60 mg + lamivudine 30 mg|tablet|ir|tablet',
    'aspirin 75 mg|tablet|dr|tablet',
    'amoxycillin 40 mg/ml + clavulanic acid 5.7 mg/ml|oral_liquid|ir|ml',
    'dexamethasone 4 mg/ml|injection|ir|pack:2ml',
    'dexamethasone 4 mg/ml|injection|ir|pack:10ml',
    'iron 100 mg|tablet|ir|tablet',
    'cetirizine 10 mg|tablet|ir|tablet',
  ]);
  const [failed] = await db.query("select parse_errors from source_records where parse_status = 'failed'");
  assert.match(failed.parse_errors[0], /unit "1 IUD" is not understood/);
  await db.close();
});

test('approving stores ceiling prices per unit, excluding GST; a revision keeps history', async () => {
  const db = await freshDb();
  const first = await stageImport(db, nppaAdapter, { bytes: nppaPdf(), fileName: 'nppa.pdf', effectiveFrom: '2025-04-01' });
  const r1 = await approveImport(db, ADAPTERS, first.diffId, { reviewedBy: 'Test reviewer' });
  assert.equal(r1.stats.ceilingPrices, 8);

  const [para] = await db.query(
    `select c.ceiling_price_inr::float8 as price, c.excludes_gst, c.unit_code, c.effective_from::text as eff, df.code as form, rt.code as rel,
            c.composition_key, c.verification_status
       from nppa_ceiling_prices c join dosage_forms df on df.id = c.dosage_form_id join release_types rt on rt.id = c.release_type_id
      where c.record_key = 'paracetamol 500 mg|tablet|ir|tablet' and c.is_current`,
  );
  assert.deepEqual(para, { price: 1, excludes_gst: true, unit_code: 'tablet', eff: '2025-04-01', form: 'tablet', rel: 'ir', composition_key: 'paracetamol 500 mg', verification_status: 'verified' });

  // Annual revision (1 April): new price, old one kept in history.
  const second = await stageImport(db, nppaAdapter, { bytes: nppaPdf({ para: '1.05' }), fileName: 'nppa-2026.pdf', effectiveFrom: '2026-04-01' });
  assert.equal(second.summary.changed, 1);
  await approveImport(db, ADAPTERS, second.diffId, { reviewedBy: 'Test reviewer' });
  const rows = await db.query(
    `select ceiling_price_inr::float8 as price, is_current, effective_from::text as eff from nppa_ceiling_prices
      where record_key = 'paracetamol 500 mg|tablet|ir|tablet' order by id`,
  );
  assert.deepEqual(rows, [{ price: 1, is_current: false, eff: '2025-04-01' }, { price: 1.05, is_current: true, eff: '2026-04-01' }]);
  assert.equal(await count(db, "select count(*) as n from nppa_ceiling_history where record_key = 'paracetamol 500 mg|tablet|ir|tablet'"), 3);
  await db.close();
});

test('NPPA CSV with different header names is read through the column synonyms', async () => {
  const db = await freshDb();
  const csv = [
    'Name of the Scheduled Formulation,Dosage Form & Strength,Unit,Ceiling Price (Rs.),S.O. No,Date',
    'Paracetamol,Tablet 650 mg,1 Tablet,1.80,S.O. 0000(E),01.04.2026',
    'Cetirizine,Tablet 10 mg,1 Tablet,"1.50*",S.O. 0000(E),01.04.2026',
  ].join('\n');
  const staged = await stageImport(db, nppaAdapter, { bytes: Buffer.from(csv), fileName: 'compendium.csv' });
  assert.equal(staged.summary.parsed, 2);
  const [cet] = await db.query("select warnings, parsed from source_records where record_key like 'cetirizine%'");
  assert.match(cet.warnings[0], /footnote/);
  assert.equal(cet.parsed.notificationDate, '2026-04-01');
  await db.close();
});
