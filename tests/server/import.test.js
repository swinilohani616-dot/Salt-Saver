/**
 * Phase 4: file readers, download retries and the Jan Aushadhi import pipeline.
 * All rows here are synthetic test data (codes T001…, made-up MRPs), not PMBI data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseCsv } from '../../lib/import/csv.js';
import { mapColumns, findHeader, parseMapArgs } from '../../lib/import/columns.js';
import { extractPdfTable } from '../../lib/import/pdfTable.js';
import { downloadFile, DownloadError } from '../../lib/import/download.js';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { loadReferenceData } from '../../db/reference.js';
import { stageImport, approveImport, rejectImport, detectFormat, ImportError } from '../../db/pipeline.js';
import { pmbiAdapter, parseRupees } from '../../db/importers/pmbi.js';
import { ADAPTERS } from '../../db/importers/index.js';
import { makePdf } from '../helpers/makePdf.js';

const count = async (db, sql, params) => Number((await db.query(sql, params))[0].n);
const csv = (rows) => Buffer.from(rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n'));
const HEADER = ['Sr. No.', 'Drug Code', 'Generic Name', 'Unit Size', 'MRP', 'Group Name'];

const FILE_1 = [
  ['Product list (synthetic test file)'],
  HEADER,
  ['1', 'T001', 'Paracetamol Tablets IP 650 mg', "15's", '15.00', 'Analgesic'],
  ['2', 'T002', 'Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg', "10's", '60.00', 'Antibiotic'],
  ['3', 'T003', 'Metformin Hydrochloride Sustained Release Tablets IP 500 mg', "10's", '9.50', 'Antidiabetic'],
  ['4', 'T004', 'Cefixime Oral Suspension IP 50 mg/5 ml', '30 ml', '22.00', 'Antibiotic'],
  ['5', 'T005', 'Mystery Herbal Tonic', '200 ml', '45.00', 'Other'],
  ['6', 'T006', 'Pantoprazole Gastro-resistant Tablets IP 40 mg', "10's", '0', 'Gastro'],
  ['7', '', 'Row without a code', "10's", '5.00', 'Other'],
  ['8', 'T008', 'Atorvastatin Tablets IP 10 mg', "10's", 'twelve', 'Cardiac'],
  ['9', 'T001', 'Duplicate of T001', "10's", '1.00', 'Other'],
];

async function freshDb() {
  const db = await createPgliteDb();
  await migrate(db);
  await loadReferenceData(db);
  return db;
}

const stage = (db, rows, extra = {}) => stageImport(db, pmbiAdapter, { bytes: csv(rows), fileName: 'test.csv', effectiveFrom: '2026-11-20', ...extra });
const approve = (db, id, extra = {}) => approveImport(db, ADAPTERS, id, { reviewedBy: 'Test reviewer', ...extra });

// ---------------------------------------------------------------- readers

test('CSV reader handles quotes, embedded commas and newlines, CRLF and a BOM', () => {
  const rows = parseCsv(Buffer.from('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3'));
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'two\nlines'], ['1', '2', '3']]);
  assert.throws(() => parseCsv('"open'), /cut off/);
});

test('column mapping accepts header variants and reports what is missing', () => {
  const fields = pmbiAdapter.fields;
  const ok = mapColumns(['S.No', 'DRUG CODE', 'Name of the Product', 'Pack Size', 'MRP (Rs.)'], fields);
  assert.ok(ok.ok);
  assert.deepEqual(ok.index, { drugCode: 1, genericName: 2, unitSize: 3, mrp: 4 });
  const bad = mapColumns(['Code', 'Item', 'Price each'], fields);
  assert.deepEqual(bad.missing, ['genericName', 'unitSize', 'mrp']);
  const mapped = mapColumns(['Code', 'Item', 'Size', 'Price each'], fields, parseMapArgs(['genericName=Item', 'unitSize=Size', 'mrp=Price each']));
  assert.ok(mapped.ok);
  const header = findHeader([['Title line'], ['', ''], HEADER], fields);
  assert.equal(header.headerRow, 2);
});

test('rupee amounts', () => {
  assert.equal(parseRupees('₹ 1,234.50'), 1234.5);
  assert.equal(parseRupees('Rs. 12'), 12);
  assert.equal(parseRupees('12.00/-'), 12);
  assert.equal(parseRupees('0'), 0);
  assert.equal(parseRupees('twelve'), null);
  assert.equal(parseRupees(''), null);
});

test('file format detection', () => {
  assert.equal(detectFormat(Buffer.from('%PDF-1.4 ...')), 'pdf');
  assert.equal(detectFormat(Buffer.from([0x50, 0x4b, 3, 4])), 'xlsx');
  assert.equal(detectFormat(Buffer.from('a,b\n1,2')), 'csv');
});

test('PDF table: header, wrapped names, a repeated header on page 2, and stray lines', async () => {
  const head = (y) => [
    { x: 40, y, text: 'Drug Code' }, { x: 110, y, text: 'Generic Name' }, { x: 380, y, text: 'Unit Size' }, { x: 460, y, text: 'MRP' },
  ];
  const pdf = makePdf([
    [
      { x: 200, y: 815, text: 'Synthetic test list' },
      ...head(790),
      { x: 40, y: 770, text: 'T101' }, { x: 110, y: 770, text: 'Paracetamol Tablets IP 500 mg' }, { x: 380, y: 770, text: "10's" }, { x: 460, y: 770, text: '8.00' },
      // name wrapped over two lines, price on the first
      { x: 40, y: 752, text: 'T102' }, { x: 110, y: 752, text: 'Amoxycillin and Potassium Clavulanate' }, { x: 380, y: 752, text: "10's" }, { x: 460, y: 752, text: '55.00' },
      { x: 110, y: 742, text: 'Tablets IP 500 mg + 125 mg' },
      { x: 250, y: 60, text: 'Page 1 of 2' },
    ],
    [
      ...head(790),
      { x: 40, y: 770, text: 'T103' }, { x: 110, y: 770, text: 'Cetirizine Tablets IP 10 mg' }, { x: 380, y: 770, text: "10's" }, { x: 460, y: 770, text: '3.50' },
    ],
  ]);
  const table = await extractPdfTable(pdf, pmbiAdapter.fields, { anchors: pmbiAdapter.anchors });
  assert.ok(table.ok, table.error);
  assert.deepEqual(table.header, ['Drug Code', 'Generic Name', 'Unit Size', 'MRP']);
  assert.deepEqual(table.rows.map((r) => r.cells), [
    ['T101', 'Paracetamol Tablets IP 500 mg', "10's", '8.00'],
    ['T102', 'Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg', "10's", '55.00'],
    ['T103', 'Cetirizine Tablets IP 10 mg', "10's", '3.50'],
  ]);
  assert.deepEqual(table.unassigned.map((u) => u.text), ['Page 1 of 2'], 'the footer is reported, not glued onto a row');
});

test('PDF without the needed columns is refused', async () => {
  const pdf = makePdf([[{ x: 40, y: 800, text: 'Just a letter, no table' }]]);
  const table = await extractPdfTable(pdf, pmbiAdapter.fields, { anchors: pmbiAdapter.anchors });
  assert.equal(table.ok, false);
});

// ---------------------------------------------------------------- download

async function withServer(handler, fn) {
  const server = http.createServer(handler).listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('download retries server errors with backoff, then succeeds', async () => {
  let calls = 0;
  const delays = [];
  await withServer(
    (req, res) => {
      calls += 1;
      if (calls < 3) {
        res.writeHead(503).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/csv' }).end('a,b\n1,2');
    },
    async (base) => {
      const got = await downloadFile(`${base}/list.csv`, { sleep: async (ms) => delays.push(ms), baseDelayMs: 100 });
      assert.equal(got.bytes.toString(), 'a,b\n1,2');
      assert.equal(got.attempts, 3);
    },
  );
  assert.equal(delays.length, 2);
  assert.ok(delays[1] >= 200 && delays[0] < 200 + 250, `exponential: ${delays}`);
});

test('download does not retry a 404, and enforces size and timeout limits', async () => {
  let calls = 0;
  await withServer(
    (req, res) => {
      calls += 1;
      if (req.url === '/missing') res.writeHead(404).end();
      else if (req.url === '/big') res.writeHead(200).end('x'.repeat(2000));
      else setTimeout(() => res.writeHead(200).end('late'), 500);
    },
    async (base) => {
      await assert.rejects(downloadFile(`${base}/missing`, { sleep: async () => {} }), (e) => e instanceof DownloadError && e.status === 404);
      assert.equal(calls, 1);
      await assert.rejects(downloadFile(`${base}/big`, { maxBytes: 1000, sleep: async () => {} }), /larger than/);
      await assert.rejects(downloadFile(`${base}/slow`, { timeoutMs: 50, retries: 1, sleep: async () => {} }), /Timed out/);
    },
  );
  await assert.rejects(downloadFile('ftp://example.invalid/x'), /Only http/);
});

// ---------------------------------------------------------------- pipeline

test('staging reads, normalises and diffs the file but changes nothing in the catalogue', async () => {
  const db = await freshDb();
  const staged = await stage(db, FILE_1);
  assert.equal(staged.status, 'staged');
  assert.deepEqual(
    { rows: staged.summary.rows, parsed: staged.summary.parsed, failed: staged.summary.failed, new: staged.summary.new },
    { rows: 9, parsed: 6, failed: 3, new: 6 },
  );
  assert.equal(await count(db, "select count(*) as n from products where source_id = 'pmbi_product_list'"), 0, 'nothing committed before approval');
  assert.equal(await count(db, "select count(*) as n from import_diffs where status = 'pending'"), 1);
  assert.equal(await count(db, 'select count(*) as n from source_file_blobs'), 1, 'the raw file is kept');

  const failed = await db.query("select location, parse_errors from source_records where parse_status = 'failed' order by id");
  assert.deepEqual(failed.map((r) => r.location), ['row 9', 'row 10', 'row 11']);
  assert.match(failed[0].parse_errors[0], /drug code is empty/);
  assert.match(failed[1].parse_errors[0], /MRP "twelve" is not a number/);
  assert.match(failed[2].parse_errors[0], /duplicate drug code "T001"/);

  assert.match(staged.report, /## Rows that could not be read \(3\)/);
  assert.match(staged.report, /Mystery Herbal Tonic/);
  assert.match(staged.report, /MRP is 0/);
  await db.close();
});

test('approving commits products, ingredients, packs and MRPs; zero-MRP products get no price', async () => {
  const db = await freshDb();
  const { diffId } = await stage(db, FILE_1);
  const result = await approve(db, diffId);
  assert.equal(result.stats.products, 6);
  assert.equal(result.stats.pricesAdded, 5, 'T006 has MRP 0');

  const [para] = await db.query(
    `select p.ja_drug_code, p.is_jan_aushadhi, p.composition_key, df.code as form, rt.code as release, p.route, p.verification_status,
            ps.unit_count::float8 as units, ps.unit, pr.amount_inr::float8 as mrp, pr.unit_price_inr::float8 as per_unit,
            pr.includes_gst, pr.effective_from::text as effective_from, pr.price_type
       from products p
       join dosage_forms df on df.id = p.dosage_form_id join release_types rt on rt.id = p.release_type_id
       join pack_sizes ps on ps.product_id = p.id
       join prices pr on pr.product_id = p.id and pr.is_current
      where p.source_key = 'T001'`,
  );
  assert.deepEqual(para, {
    ja_drug_code: 'T001', is_jan_aushadhi: true, composition_key: 'paracetamol 650 mg', form: 'tablet', release: 'ir', route: 'oral',
    verification_status: 'verified', units: 15, unit: 'tablet', mrp: 15, per_unit: 1, includes_gst: true, effective_from: '2026-11-20', price_type: 'mrp',
  });

  const [augmentin] = await db.query(
    `select string_agg(i.normalized_name || ':' || coalesce(pi.salt_form, '-'), ', ' order by pi.position) as ing
       from products p join product_ingredients pi on pi.product_id = p.id join ingredients i on i.id = pi.ingredient_id
      where p.source_key = 'T002'`,
  );
  assert.equal(augmentin.ing, 'amoxycillin:-, clavulanic acid:potassium');

  const [susp] = await db.query(
    `select ps.unit_count::float8 as units, ps.unit, pr.unit_price_inr::float8 as per_ml from products p
       join pack_sizes ps on ps.product_id = p.id join prices pr on pr.product_id = p.id and pr.is_current where p.source_key = 'T004'`,
  );
  assert.deepEqual(susp, { units: 30, unit: 'ml', per_ml: 0.7333 });

  const [mystery] = await db.query("select verification_status, composition_key, parse_notes from products where source_key = 'T005'");
  assert.equal(mystery.verification_status, 'needs_review', 'an unreadable composition is never marked verified');
  assert.equal(mystery.composition_key, null);
  assert.equal(await count(db, "select count(*) as n from prices p join products x on x.id = p.product_id where x.source_key = 'T006'"), 0);

  const [diff] = await db.query('select status, reviewed_by from import_diffs where id = $1', [diffId]);
  assert.deepEqual(diff, { status: 'committed', reviewed_by: 'Test reviewer' });
  assert.equal(await count(db, "select count(*) as n from sync_logs where job = 'commit' and status = 'succeeded'"), 1);
  await db.close();
});

test('the same file again is reported as no new version', async () => {
  const db = await freshDb();
  const { diffId } = await stage(db, FILE_1);
  await approve(db, diffId);
  const again = await stage(db, FILE_1);
  assert.equal(again.status, 'unchanged');
  await db.close();
});

test('a file can be read again on request: only what is read differently changes, and nothing until it is approved', async () => {
  const db = await freshDb();
  const { diffId } = await stage(db, FILE_1);
  await approve(db, diffId);
  // Pretend the earlier import had misread T003 as a plain tablet with release words in the salt.
  await db.query(`update products set release_type_id = (select id from release_types where code = 'ir'), composition_key = 'metformin sustained 500 mg' where source_key = 'T003'`);
  const before = await db.query('select id, source_key, composition_key, is_active from products order by id');
  const prices = await db.query('select id, amount_inr, is_current from prices order by id');
  const links = await db.query('select record_key, product_id from source_records order by record_key');
  assert.ok(links.filter((l) => l.product_id).length >= 5);

  const again = await stage(db, FILE_1, { reread: true });
  assert.equal(again.status, 'staged');
  assert.deepEqual([again.summary.new, again.summary.changed, again.summary.removed], [0, 1, 0]);
  assert.match(again.report, /same file as an earlier import/i);
  const [diff] = await db.query('select changes from import_diffs where id = $1', [again.diffId]);
  assert.deepEqual(diff.changes.map((c) => [c.key, c.fields, c.after.releaseType]), [['T003', ['compositionKey', 'releaseType'], 'sr']]);

  assert.deepEqual(await db.query('select id, source_key, composition_key, is_active from products order by id'), before, 'catalogue untouched while waiting for review');
  assert.deepEqual(await db.query('select record_key, product_id from source_records order by record_key'), links, 'rows stay linked to their products');

  await approve(db, again.diffId);
  const [fixed] = await db.query(`select p.composition_key as key, r.code as release from products p join release_types r on r.id = p.release_type_id where p.source_key = 'T003'`);
  assert.deepEqual(fixed, { key: 'metformin 500 mg', release: 'sr' });
  assert.deepEqual(await db.query('select id, amount_inr, is_current from prices order by id'), prices, 'prices are the same file, so they do not change');
  assert.deepEqual(await db.query('select record_key, product_id from source_records order by record_key'), links);
  await db.close();
});

test('a rejected re-read leaves the catalogue and the row links as they were', async () => {
  const db = await freshDb();
  await approve(db, (await stage(db, FILE_1)).diffId);
  const links = await db.query('select record_key, product_id from source_records order by record_key');
  const products = await db.query('select * from products order by id');
  await rejectImport(db, (await stage(db, FILE_1, { reread: true })).diffId);
  assert.deepEqual(await db.query('select record_key, product_id from source_records order by record_key'), links);
  assert.deepEqual(await db.query('select * from products order by id'), products);
  await db.close();
});

test('an older file cannot be read again over a newer one', async () => {
  const db = await freshDb();
  await approve(db, (await stage(db, FILE_1)).diffId);
  await approve(db, (await stage(db, FILE_1.map((r) => (r[1] === 'T001' && r[0] === '1' ? [...r.slice(0, 4), '16.50', r[5]] : r)))).diffId);
  await assert.rejects(stage(db, FILE_1, { reread: true }), /newer list/);
  await db.close();
});

test('a new version: changed MRP keeps history, new rows are added, missing rows are deactivated', async () => {
  const db = await freshDb();
  await approve(db, (await stage(db, FILE_1)).diffId);
  const FILE_2 = [
    HEADER,
    ['1', 'T001', 'Paracetamol Tablets IP 650 mg', "15's", '16.50', 'Analgesic'],
    ['2', 'T002', 'Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg', "10's", '60.00', 'Antibiotic'],
    ['3', 'T003', 'Metformin Hydrochloride Sustained Release Tablets IP 500 mg', "10's", '9.50', 'Antidiabetic'],
    ['4', 'T004', 'Cefixime Oral Suspension IP 50 mg/5 ml', '30 ml', '22.00', 'Antibiotic'],
    ['6', 'T006', 'Pantoprazole Gastro-resistant Tablets IP 40 mg', "10's", '18.00', 'Gastro'],
    ['9', 'T009', 'Cetirizine Tablets IP 10 mg', "10's", '4.00', 'Antiallergic'],
  ];
  const staged = await stage(db, FILE_2);
  assert.deepEqual(
    { new: staged.summary.new, changed: staged.summary.changed, removed: staged.summary.removed, unchanged: staged.summary.unchanged },
    { new: 1, changed: 2, removed: 1, unchanged: 3 },
  );
  const result = await approve(db, staged.diffId);
  assert.equal(result.stats.pricesChanged, 1);
  assert.equal(result.stats.deactivated, 1);

  const history = await db.query(
    `select pr.amount_inr::float8 as amount, pr.is_current from prices pr join products p on p.id = pr.product_id
      where p.source_key = 'T001' order by pr.id`,
  );
  assert.deepEqual(history, [{ amount: 15, is_current: false }, { amount: 16.5, is_current: true }]);
  assert.equal(await count(db, "select count(*) as n from products where source_key = 'T005' and not is_active"), 1, 'T005 left the list');
  assert.equal(await count(db, "select count(*) as n from prices p join products x on x.id = p.product_id where x.source_key = 'T006' and p.is_current"), 1);
  await db.close();
});

test('guards: one pending review per source, outdated reviews, large removals, and rejection', async () => {
  const db = await freshDb();
  const first = await stage(db, FILE_1);
  await assert.rejects(stage(db, [HEADER, ['1', 'T050', 'Cetirizine Tablets IP 10 mg', "10's", '4.00', 'X']]), /still waiting for review/);
  await rejectImport(db, first.diffId, { note: 'test' });
  assert.equal(await count(db, "select count(*) as n from products where source_id = 'pmbi_product_list'"), 0);
  await assert.rejects(approve(db, first.diffId), /rejected, not pending/);

  // Re-staging a rejected file works.
  const again = await stage(db, FILE_1);
  assert.equal(again.status, 'staged');
  await approve(db, again.diffId);

  // A file that drops most products needs an explicit flag.
  const many = [HEADER, ...Array.from({ length: 30 }, (_, i) => [`${i}`, `M${100 + i}`, 'Cetirizine Tablets IP 10 mg', "10's", '4.00', 'X'])];
  await approve(db, (await stage(db, many)).diffId);
  const tiny = await stage(db, [HEADER, ['1', 'M100', 'Cetirizine Tablets IP 10 mg', "10's", '4.00', 'X']]);
  await assert.rejects(approve(db, tiny.diffId), /--allow-large-removal/);
  const ok = await approve(db, tiny.diffId, { allowLargeRemoval: true });
  assert.equal(ok.stats.deactivated, 29);

  await assert.rejects(approveImport(db, ADAPTERS, 999, { reviewedBy: 'x' }), /does not exist/);
  await assert.rejects(approveImport(db, ADAPTERS, tiny.diffId, {}), /--by/);
  await db.close();
});

test('a review made before another import was committed cannot be approved', async () => {
  const db = await freshDb();
  const a = await stage(db, FILE_1);
  await rejectImport(db, a.diffId);
  const b = await stage(db, [HEADER, ['1', 'T001', 'Paracetamol Tablets IP 650 mg', "15's", '15.00', 'Analgesic']]);
  await approve(db, b.diffId);
  // Review "a" was computed against the empty catalogue; the catalogue has changed since.
  await db.query("update import_diffs set status = 'pending' where id = $1", [a.diffId]);
  await assert.rejects(approve(db, a.diffId), /changed since/);
  await db.close();
});

test('wrong files are refused with a helpful message', async () => {
  const db = await freshDb();
  await assert.rejects(stage(db, [['Code', 'Item', 'Price']]), (e) => e instanceof ImportError && /Headers seen: "Code", "Item", "Price"/.test(e.message));
  await assert.rejects(stageImport(db, pmbiAdapter, { bytes: Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), fileName: 'list.xlsx' }), /save it as CSV/);
  await assert.rejects(stage(db, [HEADER, ['1', '', '', '', '', '']]), /No row in the file could be read/);
  assert.equal(await count(db, "select count(*) as n from sync_logs where job = 'parse' and status = 'failed'"), 3);
  await db.close();
});

test('a PDF list goes through the same pipeline', async () => {
  const db = await freshDb();
  const y0 = 790;
  const pdf = makePdf([
    [
      { x: 40, y: y0, text: 'Drug Code' }, { x: 110, y: y0, text: 'Generic Name' }, { x: 380, y: y0, text: 'Unit Size' }, { x: 460, y: y0, text: 'MRP' },
      { x: 40, y: 770, text: 'P001' }, { x: 110, y: 770, text: 'Paracetamol Tablets IP 500 mg' }, { x: 380, y: 770, text: "10's" }, { x: 460, y: 770, text: '8.00' },
    ],
  ]);
  const staged = await stageImport(db, pmbiAdapter, { bytes: pdf, fileName: 'list.pdf' });
  assert.equal(staged.summary.parsed, 1);
  const [rec] = await db.query("select location from source_records where record_key = 'P001'");
  assert.equal(rec.location, 'page 1, line 1');
  await db.close();
});
