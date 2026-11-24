/**
 * Phase 2 tests: schema, legacy import and the /api/medicines endpoint, run
 * against an in-memory PGlite database. `npm test`
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPgliteDb } from '../../server/pgliteDb.js';
import { migrate } from '../../db/migrate.js';
import { seedLegacy, PAIRING_REASONS } from '../../db/seedLegacy.js';
import { loadReferenceData, loadResolver } from '../../db/reference.js';
import { parseLegacyComposition, parseLegacyPack } from '../../db/legacyParse.js';
import { createApp } from '../../server/app.js';
import { validateDb } from '../../js/core/validate.js';

const SEED_PATH = new URL('../../data/sample-data.json', import.meta.url);
const seedBytes = await readFile(SEED_PATH);
const seedJson = JSON.parse(seedBytes.toString('utf8'));
const quietLogger = { error: () => {} };

const toBytes = (data) => Buffer.from(JSON.stringify(data));
const count = async (db, sql, params) => Number((await db.query(sql, params))[0].n);

async function freshDb({ reference = true } = {}) {
  const db = await createPgliteDb();
  await migrate(db);
  if (reference) await loadReferenceData(db);
  return db;
}

async function startServer(db, options = {}) {
  const server = createApp({ db, logger: quietLogger, ...options }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

// ---------------------------------------------------------------- parsers

test('legacy composition parser reads every seed composition', () => {
  for (const m of seedJson.medicines) {
    const parsed = parseLegacyComposition(m.activeSalt);
    assert.ok(parsed.ok, `${m.activeSalt}: ${parsed.error}`);
  }
  assert.deepEqual(parseLegacyComposition('Calcium Carbonate 1250mg + Vitamin D3 250 IU').parts.map((p) => [p.normalizedName, p.strengthValue, p.strengthUnit]), [
    ['calcium carbonate', 1250, 'mg'],
    ['vitamin d3', 250, 'iu'],
  ]);
  assert.equal(parseLegacyComposition('Hydrochlorothiazide 12.5mg').parts[0].strengthValue, 12.5);
});

test('legacy composition parser flags what it cannot read instead of guessing', () => {
  assert.equal(parseLegacyComposition('Paracetamol').ok, false);
  assert.equal(parseLegacyComposition('').ok, false);
  assert.equal(parseLegacyComposition('Paracetamol 500mg + Paracetamol 500mg').ok, false);
  assert.equal(parseLegacyComposition('Amoxicillin 250mg/5ml').ok, false, 'liquids are Phase 3');
});

test('legacy pack parser reads unit count and form, and returns nulls otherwise', () => {
  assert.deepEqual(parseLegacyPack('Strip of 15 tablets'), { unitCount: 15, unit: 'tablet', dosageFormCode: 'tablet' });
  assert.deepEqual(parseLegacyPack('Strip of 15 capsules'), { unitCount: 15, unit: 'capsule', dosageFormCode: 'capsule' });
  assert.deepEqual(parseLegacyPack('Bottle of 100 tablets'), { unitCount: 100, unit: 'tablet', dosageFormCode: 'tablet' });
  assert.deepEqual(parseLegacyPack('30 ml bottle'), { unitCount: null, unit: null, dosageFormCode: null });
});

// ---------------------------------------------------------------- schema

test('migrations apply once and re-running is a no-op', async () => {
  const db = await createPgliteDb();
  assert.deepEqual(await migrate(db), ['001_initial_schema', '002_reference_data', '003_normalisation', '004_import_pipeline', '005_nppa', '006_brand_review', '007_brand_prices']);
  assert.deepEqual(await migrate(db), []);
  assert.equal(await count(db, 'select count(*) as n from data_sources'), 7);
  assert.equal(await count(db, "select count(*) as n from release_types where code = 'ir' and not is_modified"), 1);
  await db.close();
});

test('row level security is on for every table, so the Supabase public API sees nothing', async () => {
  const db = await freshDb();
  const open = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  );
  assert.deepEqual(open.map((r) => r.relname), []);
  await db.close();
});

test('schema rejects bad data', async () => {
  const db = await freshDb();
  const insertProduct = (extra) =>
    db.query(
      `insert into products (source_id, source_key, product_type, name, normalized_name, composition_text, is_jan_aushadhi, ja_drug_code)
       values ('legacy_json', $1, 'generic', 'X', 'x', 'X 1mg', $2, $3)`,
      extra,
    );
  await assert.rejects(insertProduct(['a', false, 'JA1']), /check/i, 'a drug code requires is_jan_aushadhi');
  await insertProduct(['b', true, 'JA2']);
  await assert.rejects(insertProduct(['c', true, 'JA2']), /duplicate|unique/i, 'drug codes are unique');
  await assert.rejects(
    db.query(`insert into source_files (source_id, file_name, checksum_sha256, downloaded_at) values ('legacy_json', 'f', 'nothex', now())`),
    /check/i,
  );
  await db.close();
});

// ---------------------------------------------------------------- reference data

test('reference list loads ingredients and aliases, and re-loading is safe', async () => {
  const db = await freshDb({ reference: false });
  const first = await loadReferenceData(db);
  const second = await loadReferenceData(db);
  assert.equal(first.ingredients, second.ingredients);
  assert.equal(await count(db, 'select count(*) as n from ingredient_aliases'), first.aliases);
  const resolver = await loadResolver(db);
  assert.equal(resolver.resolve('Acetaminophen').key, 'paracetamol');
  assert.equal(resolver.resolve('Metformin HCl').saltForm, 'hydrochloride');
  await db.close();
});

test('loading the alias list merges ingredients an earlier import created under an alias', async () => {
  const db = await freshDb({ reference: false });
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' }); // creates "amoxicillin", "vitamin d3"
  assert.equal(await count(db, "select count(*) as n from ingredients where normalized_name in ('amoxicillin', 'vitamin d3')"), 2);
  const stats = await loadReferenceData(db);
  assert.ok(stats.merged.includes('amoxicillin -> amoxycillin'));
  assert.ok(stats.merged.includes('vitamin d3 -> cholecalciferol'));
  assert.equal(await count(db, "select count(*) as n from ingredients where normalized_name in ('amoxicillin', 'vitamin d3')"), 0);
  assert.equal(
    await count(db, `select count(*) as n from product_ingredients pi join ingredients i on i.id = pi.ingredient_id where i.normalized_name = 'amoxycillin'`),
    2, 'Augmentin and its generic now point at Amoxycillin',
  );
  await db.close();
});

// ---------------------------------------------------------------- legacy import

test('seed imports every legacy record with its source, marked needs_review', async () => {
  const db = await freshDb();
  const result = await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  assert.equal(result.skipped, false);
  assert.equal(result.stats.imported, 28);
  assert.equal(result.stats.failed, 0);
  assert.equal(result.stats.conflicts, 0);

  assert.equal(await count(db, "select count(*) as n from products where product_type = 'brand'"), 28);
  assert.equal(await count(db, "select count(*) as n from products where product_type = 'generic' and is_jan_aushadhi"), 25);
  assert.equal(await count(db, "select count(*) as n from products where source_id <> 'legacy_json' or verification_status <> 'needs_review'"), 0);
  assert.equal(await count(db, "select count(*) as n from products where ja_drug_code is not null"), 0, 'legacy generics have no real drug codes');
  assert.equal(await count(db, "select count(*) as n from prices where price_type <> 'illustrative' or verification_status <> 'needs_review'"), 0);
  assert.equal(await count(db, 'select count(*) as n from prices where is_current'), 28 + 25);
  assert.equal(await count(db, "select count(*) as n from match_results where status <> 'needs_review'"), 0, 'no pairing is a verified match');
  assert.equal(await count(db, 'select count(*) as n from source_records'), 28);
  assert.equal(await count(db, 'select count(*) as n from price_history'), 53);

  const [file] = await db.query('select checksum_sha256, byte_size from source_files');
  assert.equal(file.checksum_sha256, result.checksum);
  assert.equal(Number(file.byte_size), seedBytes.length);
  const [log] = await db.query("select status, stats from sync_logs where job = 'seed' and source_id = 'legacy_json'");
  assert.equal(log.status, 'succeeded');
  assert.equal(log.stats.imported, 28);

  const [combiflam] = await db.query(
    `select string_agg(i.normalized_name || ' ' || pi.strength_value::float8 || pi.strength_unit, ' + ' order by pi.position) as c,
            df.code as form, ps.unit_count::float8 as units, pr.unit_price_inr::float8 as unit_price
       from products p
       join product_ingredients pi on pi.product_id = p.id join ingredients i on i.id = pi.ingredient_id
       join dosage_forms df on df.id = p.dosage_form_id
       join pack_sizes ps on ps.product_id = p.id
       join prices pr on pr.product_id = p.id and pr.is_current
      where p.source_key = 'med_104' group by df.code, ps.unit_count, pr.unit_price_inr`,
  );
  assert.deepEqual(combiflam, { c: 'ibuprofen 400mg + paracetamol 325mg', form: 'tablet', units: 20, unit_price: 2.25 });

  const [augmentin] = await db.query(
    `select string_agg(i.name || coalesce(' (' || pi.salt_form || ')', ''), ' + ' order by pi.position) as c, p.composition_key
       from products p join product_ingredients pi on pi.product_id = p.id join ingredients i on i.id = pi.ingredient_id
      where p.source_key = 'med_122' group by p.composition_key`,
  );
  assert.deepEqual(augmentin, { c: 'Amoxycillin + Clavulanic Acid', composition_key: 'amoxycillin 500 mg + clavulanic acid 125 mg' }, 'legacy "Amoxicillin" resolves to the Indian name');

  const [pairing] = await db.query("select reasons from match_results limit 1");
  assert.deepEqual(pairing.reasons, [...PAIRING_REASONS]);
  await db.close();
});

test('re-seeding the same file changes nothing', async () => {
  const db = await freshDb();
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  const again = await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  assert.equal(again.skipped, true);
  assert.equal(await count(db, 'select count(*) as n from products'), 53);
  assert.equal(await count(db, 'select count(*) as n from price_history'), 53);
  assert.equal(await count(db, "select count(*) as n from sync_logs where status = 'skipped'"), 1);
  await db.close();
});

test('--force re-imports the same file in place, without duplicates', async () => {
  const db = await freshDb();
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  await db.query('update products set composition_key = null');
  const again = await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json', force: true });
  assert.equal(again.skipped, false);
  assert.equal(await count(db, 'select count(*) as n from products'), 53);
  assert.equal(await count(db, 'select count(*) as n from source_records'), 28);
  assert.equal(await count(db, 'select count(*) as n from products where composition_key is null'), 0);
  assert.equal(await count(db, 'select count(*) as n from price_history'), 53, 'prices did not change');
  await db.close();
});

test('a changed price keeps the old one in history instead of overwriting it', async () => {
  const db = await freshDb();
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  const changed = structuredClone(seedJson);
  changed.medicines[0].brandPrice = 31.5;
  const result = await seedLegacy(db, { bytes: toBytes(changed), fileName: 'data/sample-data.json' });
  assert.equal(result.stats.pricesChanged, 1);

  const rows = await db.query(
    `select pr.amount_inr::float8 as amount, pr.is_current from prices pr join products p on p.id = pr.product_id
     where p.source_key = 'med_101' order by pr.id`,
  );
  assert.deepEqual(rows, [{ amount: 30, is_current: false }, { amount: 31.5, is_current: true }]);
  assert.equal(await count(db, "select count(*) as n from price_history h join products p on p.id = h.product_id where p.source_key = 'med_101'"), 3);
  assert.equal(await count(db, 'select count(*) as n from source_files'), 2);
  await db.close();
});

test('a record that disappears is deactivated, not deleted', async () => {
  const db = await freshDb();
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  const smaller = structuredClone(seedJson);
  smaller.medicines = smaller.medicines.filter((m) => m.id !== 'med_128');
  const result = await seedLegacy(db, { bytes: toBytes(smaller), fileName: 'data/sample-data.json' });
  assert.equal(result.stats.deactivated, 2, 'Shelcal and its generic');
  assert.equal(await count(db, "select count(*) as n from products where source_key = 'med_128' and not is_active"), 1);
  await db.close();
});

test('rows that fail to parse are flagged and kept, not guessed', async () => {
  const db = await freshDb();
  const data = structuredClone(seedJson);
  data.medicines.push({ id: 'bad_1', brandName: 'Mystery', activeSalt: 'Something', brandPrice: 10, genericName: 'JA Something', genericPrice: 2 });
  data.medicines.push({ id: 'bad_2', brandName: 'No price', activeSalt: 'Paracetamol 500mg', genericName: 'JA Paracetamol 500mg' });
  data.medicines.push({ ...data.medicines[0] });
  const result = await seedLegacy(db, { bytes: toBytes(data), fileName: 'x.json' });
  assert.equal(result.stats.imported, 28);
  assert.equal(result.stats.failed, 3);
  const failed = await db.query("select record_key, parse_errors from source_records where parse_status = 'failed' order by id");
  assert.deepEqual(failed.map((r) => r.record_key), ['bad_1', 'bad_2', 'row-31']);
  assert.match(failed[0].parse_errors[0], /cannot read ingredient and strength/);
  assert.match(failed[2].parse_errors[0], /duplicate id/);
  assert.equal(await count(db, "select count(*) as n from products where source_key like 'bad_%'"), 0);
  await db.close();
});

test('two records that describe the same generic differently open a conflict', async () => {
  const db = await freshDb();
  const data = structuredClone(seedJson);
  data.medicines.find((m) => m.id === 'med_102').genericPrice = 6.0; // Crocin's generic says 5.50
  const result = await seedLegacy(db, { bytes: toBytes(data), fileName: 'x.json' });
  assert.equal(result.stats.conflicts, 1);
  const [conflict] = await db.query('select field, values_json, status from data_conflicts');
  assert.equal(conflict.field, 'genericPrice');
  assert.equal(conflict.status, 'open');
  assert.deepEqual(conflict.values_json.map((v) => v.value), [5.5, 6]);
  await db.close();
});

test('a file with no valid records changes nothing and logs the failure', async () => {
  const db = await freshDb();
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  const bad = { schemaVersion: 1, medicines: [{ id: 'x' }] };
  await assert.rejects(seedLegacy(db, { bytes: toBytes(bad), fileName: 'bad.json' }), /No valid records/);
  await assert.rejects(seedLegacy(db, { bytes: Buffer.from('{oops'), fileName: 'bad.json' }), /not valid JSON/);
  assert.equal(await count(db, 'select count(*) as n from products where is_active'), 53);
  assert.equal(await count(db, 'select count(*) as n from source_files'), 1);
  assert.equal(await count(db, "select count(*) as n from sync_logs where status = 'failed'"), 2);
  await db.close();
});

// ---------------------------------------------------------------- API

let db;
let server;
before(async () => {
  db = await freshDb();
  await seedLegacy(db, { bytes: seedBytes, fileName: 'data/sample-data.json' });
  server = await startServer(db, { serveStatic: true });
});
after(async () => {
  await server.close();
  await db.close();
});

test('GET /api/medicines returns exactly the medicines the app used to read from the JSON file', async () => {
  const response = await fetch(`${server.url}/api/medicines`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const body = await response.json();

  const fromApi = validateDb(body);
  const fromFile = validateDb(seedJson);
  assert.ok(fromApi.ok);
  assert.deepEqual(fromApi.data.medicines, fromFile.data.medicines);
  assert.equal(fromApi.data.skipped, 0);

  assert.match(body.dataVersion, /^[0-9a-f]{16}$/);
  assert.match(body.note, /illustrative/);
  assert.equal(body.sources[0].id, 'legacy_json');
  for (const m of body.medicines) {
    assert.equal(m.source, 'legacy_json');
    assert.equal(m.verificationStatus, 'needs_review');
    assert.equal(m.matchStatus, 'needs_review');
    assert.equal(m.priceType, 'illustrative');
    assert.match(m.updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
});

test('GET /api/medicines answers 304 when the data has not changed', async () => {
  const first = await fetch(`${server.url}/api/medicines`);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const second = await fetch(`${server.url}/api/medicines`, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
});

test('GET /api/health reports the database, and unknown API paths are JSON 404s', async () => {
  const health = await fetch(`${server.url}/api/health`);
  assert.deepEqual(await health.json(), { ok: true, database: 'up' });
  const missing = await fetch(`${server.url}/api/nope`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
});

test('the API returns a friendly 503 when the database fails', async () => {
  const broken = await startServer({ query: async () => { throw new Error('connection refused'); } });
  const response = await fetch(`${broken.url}/api/medicines`);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'DB_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(body), /connection refused/, 'internal errors are not leaked');
  await broken.close();
});

test('the local server serves the site but not the server code, database files or .env', async () => {
  for (const path of ['/', '/search.html', '/cart.html', '/js/landing.js', '/css/landing.css', '/js/app.js', '/css/styles.css', '/data/sample-data.json']) {
    assert.equal((await fetch(`${server.url}${path}`)).status, 200, path);
  }
  assert.match(await (await fetch(`${server.url}/`)).text(), /js\/landing\.js/, 'the front page is the landing page');
  assert.match(await (await fetch(`${server.url}/search.html`)).text(), /id="search-input"/, 'search.html is the search page');
  for (const path of ['/server/db.js', '/db/migrations/001_initial_schema.sql', '/.env', '/package.json', '/node_modules/pg/package.json', '/js/../server/db.js']) {
    assert.equal((await fetch(`${server.url}${path}`)).status, 404, path);
  }
});
