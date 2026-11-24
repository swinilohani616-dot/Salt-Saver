/**
 * Imports data/sample-data.json into the database (source = legacy_json).
 *
 * - The raw file is recorded in source_files with its SHA-256 checksum; every row
 *   is kept verbatim in source_records, with rows that fail to parse flagged.
 * - Each legacy record becomes a brand product, a Jan Aushadhi generic product
 *   (shared by brands that name the same generic), their ingredients, pack size
 *   and illustrative per-pack prices, and a match_results row for the pairing.
 * - Everything is marked verification_status = needs_review. The prices are
 *   price_type = 'illustrative': they are demo values, not MRPs.
 * - Re-running with the same file does nothing. A changed file updates rows:
 *   changed prices are retired (is_current = false) and re-added, so
 *   price_history keeps both; records that disappear are deactivated, not deleted.
 * - It all runs in one transaction: a failure leaves the previous data untouched.
 */
import { createHash } from 'node:crypto';
import { normalizeText, saltKey } from '../js/core/normalize.js';
import { isValidMedicine } from '../js/core/validate.js';
import { SCHEMA_VERSION } from '../js/config.js';
import { parseLegacyComposition, parseLegacyPack } from './legacyParse.js';
import { loadResolver } from './reference.js';
import { compositionKey } from '../lib/pharma/composition.js';

export const LEGACY_SOURCE = 'legacy_json';
export const PAIRING_METHOD = 'legacy_json_pairing';
export const PAIRING_REASONS = Object.freeze([
  'Paired in the legacy demo JSON; not checked by the matching engine.',
  'Dosage form, release type and salt form are not recorded for this pairing.',
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sameId = (a, b) => (a == null && b == null) || String(a) === String(b);
const round4 = (n) => Math.round(n * 10_000) / 10_000;

async function upsertProduct(tx, p) {
  const params = [
    LEGACY_SOURCE, p.sourceKey, p.type, p.name, normalizeText(p.name), p.manufacturer,
    p.isJanAushadhi, p.composition, p.dosageFormId, p.group, p.compositionKey,
  ];
  const rows = await tx.query(
    `insert into products (source_id, source_key, product_type, name, normalized_name, manufacturer,
                           is_jan_aushadhi, composition_text, dosage_form_id, therapeutic_group,
                           composition_key, verification_status, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'needs_review', true)
     on conflict (source_id, source_key) do update set
       product_type = excluded.product_type, name = excluded.name, normalized_name = excluded.normalized_name,
       manufacturer = excluded.manufacturer, is_jan_aushadhi = excluded.is_jan_aushadhi,
       composition_text = excluded.composition_text, dosage_form_id = excluded.dosage_form_id,
       therapeutic_group = excluded.therapeutic_group, composition_key = excluded.composition_key, is_active = true
     where (products.product_type, products.name, products.manufacturer, products.is_jan_aushadhi,
            products.composition_text, products.dosage_form_id, products.therapeutic_group,
            products.composition_key, products.is_active)
           is distinct from
           (excluded.product_type, excluded.name, excluded.manufacturer, excluded.is_jan_aushadhi,
            excluded.composition_text, excluded.dosage_form_id, excluded.therapeutic_group,
            excluded.composition_key, true)
     returning id`,
    params,
  );
  if (rows.length) return rows[0].id;
  const [existing] = await tx.query('select id from products where source_id = $1 and source_key = $2', [LEGACY_SOURCE, p.sourceKey]);
  return existing.id;
}

async function ingredientId(tx, part) {
  await tx.query(
    `insert into ingredients (name, normalized_name, source_id, verification_status)
     values ($1, $2, $3, 'needs_review') on conflict (normalized_name) do nothing`,
    [part.displayName, part.key, LEGACY_SOURCE],
  );
  const [row] = await tx.query('select id from ingredients where normalized_name = $1', [part.key]);
  return row.id;
}

async function setIngredients(tx, productId, parts) {
  const ids = [];
  for (const [index, part] of parts.entries()) {
    const id = await ingredientId(tx, part);
    ids.push(id);
    await tx.query(
      `insert into product_ingredients (product_id, ingredient_id, position, salt_form, strength_value, strength_unit, source_text, source_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (product_id, ingredient_id) do update set
         position = excluded.position, salt_form = excluded.salt_form, strength_value = excluded.strength_value,
         strength_unit = excluded.strength_unit, source_text = excluded.source_text`,
      [productId, id, index + 1, part.saltForm, part.strengthValue, part.strengthUnit, part.sourceText, LEGACY_SOURCE],
    );
  }
  await tx.query('delete from product_ingredients where product_id = $1 and not (ingredient_id = any($2))', [productId, ids]);
}

async function packSizeId(tx, productId, label, pack) {
  if (!label) return null;
  const [row] = await tx.query(
    `insert into pack_sizes (product_id, label, unit_count, unit, source_id, verification_status)
     values ($1, $2, $3, $4, $5, 'needs_review')
     on conflict (product_id, label) do update set unit_count = excluded.unit_count, unit = excluded.unit
     returning id`,
    [productId, label, pack.unitCount, pack.unit, LEGACY_SOURCE],
  );
  return row.id;
}

/** @returns {Promise<'added'|'changed'|'unchanged'>} */
async function setPrice(tx, { productId, packId, amount, pack, sourceFileId }) {
  const current = await tx.query(
    `select id, amount_inr::float8 as amount, pack_size_id from prices
     where product_id = $1 and source_id = $2 and price_type = 'illustrative' and is_current`,
    [productId, LEGACY_SOURCE],
  );
  const keep = current.find((r) => r.amount === amount && sameId(r.pack_size_id, packId));
  const retire = current.filter((r) => r !== keep).map((r) => r.id);
  if (retire.length) await tx.query('update prices set is_current = false where id = any($1)', [retire]);
  if (keep) return retire.length ? 'changed' : 'unchanged';

  await tx.query(
    `insert into prices (product_id, pack_size_id, source_id, source_file_id, price_type, amount_inr,
                         includes_gst, unit_price_inr, price_unit, verification_status, is_current)
     values ($1, $2, $3, $4, 'illustrative', $5, null, $6, $7, 'needs_review', true)`,
    [productId, packId, LEGACY_SOURCE, sourceFileId, amount, pack.unitCount ? round4(amount / pack.unitCount) : null, pack.unit],
  );
  return retire.length ? 'changed' : 'added';
}

async function recordConflict(tx, productId, field, values) {
  await tx.query(
    `insert into data_conflicts (entity_type, entity_id, field, values_json, note)
     values ('product', $1, $2, $3::jsonb, 'Two legacy records describe the same generic differently. The first value was kept.')`,
    [productId, field, JSON.stringify(values)],
  );
}

async function logSync(db, { sourceFileId = null, status, message = null, stats = {} }) {
  await db.query(
    `insert into sync_logs (source_id, source_file_id, job, status, message, stats, finished_at)
     values ($1, $2, 'seed', $3, $4, $5::jsonb, now())`,
    [LEGACY_SOURCE, sourceFileId, status, message, JSON.stringify(stats)],
  );
}

async function importRecords(tx, records, sourceFileId) {
  const resolver = await loadResolver(tx);
  const formIds = new Map((await tx.query('select code, id from dosage_forms')).map((r) => [r.code, r.id]));
  const stats = { records: records.length, imported: 0, failed: 0, brands: 0, generics: 0, pricesAdded: 0, pricesChanged: 0, conflicts: 0, deactivated: 0 };
  const seenKeys = new Set();
  const generics = new Map(); // generic source_key -> what the first record said about it
  const activeKeys = [];

  for (const [index, m] of records.entries()) {
    const id = typeof m?.id === 'string' && m.id.trim() ? m.id.trim() : null;
    const errors = [];
    let composition = null;
    if (!isValidMedicine(m)) errors.push('missing or invalid required field (id, brandName, activeSalt, genericName, brandPrice, genericPrice)');
    else if (seenKeys.has(id)) errors.push(`duplicate id "${id}"`);
    else {
      composition = parseLegacyComposition(m.activeSalt);
      if (!composition.ok) errors.push(composition.error);
      else {
        // Resolve through the alias table: "Amoxicillin" -> Amoxycillin, "Vitamin D3" -> Cholecalciferol.
        composition.parts = composition.parts.map((p) => {
          const r = resolver.resolve(p.name);
          return { ...p, key: r.key, displayName: r.known ? r.name : p.name, saltForm: r.saltForm };
        });
        const keys = composition.parts.map((p) => p.key);
        if (new Set(keys).size !== keys.length) errors.push('the same ingredient is listed twice under different names');
        composition.key = compositionKey(
          composition.parts.map((p) => ({ key: p.key, strength: { value: p.strengthValue, unit: p.strengthUnit, perValue: null, perUnit: null } })),
        );
      }
    }

    const recordKey = id && !seenKeys.has(id) ? id : `row-${index + 1}`;
    const [record] = await tx.query(
      `insert into source_records (source_id, source_file_id, record_key, raw, parse_status, parse_errors)
       values ($1, $2, $3, $4::jsonb, $5, $6::jsonb) returning id`,
      [LEGACY_SOURCE, sourceFileId, recordKey, JSON.stringify(m ?? null), errors.length ? 'failed' : 'parsed', JSON.stringify(errors)],
    );
    if (errors.length) {
      stats.failed += 1;
      continue;
    }
    seenKeys.add(id);

    const packLabel = typeof m.packSize === 'string' ? m.packSize.trim() : '';
    const pack = parseLegacyPack(packLabel);
    const dosageFormId = pack.dosageFormCode ? formIds.get(pack.dosageFormCode) ?? null : null;
    const category = typeof m.category === 'string' && m.category.trim() ? m.category.trim() : null;

    // Generic (shared between brands that name the same generic)
    const genericKey = `generic:${normalizeText(m.genericName)}`;
    let generic = generics.get(genericKey);
    if (!generic) {
      const genericId = await upsertProduct(tx, {
        sourceKey: genericKey, type: 'generic', name: m.genericName.trim(), manufacturer: null, isJanAushadhi: true,
        composition: m.activeSalt.trim(), dosageFormId, group: category, compositionKey: composition.key,
      });
      await setIngredients(tx, genericId, composition.parts);
      const genericPackId = await packSizeId(tx, genericId, packLabel, pack);
      const outcome = await setPrice(tx, { productId: genericId, packId: genericPackId, amount: m.genericPrice, pack, sourceFileId });
      if (outcome === 'added') stats.pricesAdded += 1;
      if (outcome === 'changed') stats.pricesChanged += 1;
      generic = { id: genericId, recordKey, price: m.genericPrice, packLabel, salt: saltKey(m.activeSalt) };
      generics.set(genericKey, generic);
      activeKeys.push(genericKey);
      stats.generics += 1;
    } else {
      const checks = [
        ['genericPrice', generic.price, m.genericPrice],
        ['packSize', generic.packLabel, packLabel],
        ['activeSalt', generic.salt, saltKey(m.activeSalt)],
      ];
      for (const [field, first, other] of checks) {
        if (first === other) continue;
        await recordConflict(tx, generic.id, field, [
          { source_id: LEGACY_SOURCE, record: generic.recordKey, value: first },
          { source_id: LEGACY_SOURCE, record: recordKey, value: other },
        ]);
        stats.conflicts += 1;
      }
    }

    // Brand
    const brandId = await upsertProduct(tx, {
      sourceKey: id, type: 'brand', name: m.brandName.trim(),
      manufacturer: typeof m.manufacturer === 'string' && m.manufacturer.trim() ? m.manufacturer.trim() : null,
      isJanAushadhi: false, composition: m.activeSalt.trim(), dosageFormId, group: category, compositionKey: composition.key,
    });
    await setIngredients(tx, brandId, composition.parts);
    const brandPackId = await packSizeId(tx, brandId, packLabel, pack);
    const outcome = await setPrice(tx, { productId: brandId, packId: brandPackId, amount: m.brandPrice, pack, sourceFileId });
    if (outcome === 'added') stats.pricesAdded += 1;
    if (outcome === 'changed') stats.pricesChanged += 1;
    activeKeys.push(id);
    stats.brands += 1;

    // Pairing: stored as an unverified match, never as a verified one.
    await tx.query(
      `insert into match_results (product_id, candidate_product_id, status, reasons, method, source_id)
       values ($1, $2, 'needs_review', $3::jsonb, $4, $5)
       on conflict (product_id, candidate_product_id, method) do update set
         status = excluded.status, reasons = excluded.reasons, computed_at = now()`,
      [brandId, generic.id, JSON.stringify(PAIRING_REASONS), PAIRING_METHOD, LEGACY_SOURCE],
    );
    await tx.query(
      'delete from match_results where method = $1 and product_id = $2 and candidate_product_id <> $3',
      [PAIRING_METHOD, brandId, generic.id],
    );
    await tx.query('update source_records set product_id = $1 where id = $2', [brandId, record.id]);
    stats.imported += 1;
  }

  if (stats.imported === 0) throw new Error('No valid records in the file; nothing was imported.');

  const deactivated = await tx.query(
    `update products set is_active = false
     where source_id = $1 and is_active and not (source_key = any($2)) returning id`,
    [LEGACY_SOURCE, activeKeys],
  );
  stats.deactivated = deactivated.length;
  return stats;
}

/**
 * @param {{query:Function, exec:Function, transaction:Function}} db
 * @param {{bytes:Buffer, fileName:string, downloadedAt?:Date, force?:boolean}} file
 * @returns {Promise<{skipped:boolean, sourceFileId:*, checksum:string, stats?:object}>}
 */
export async function seedLegacy(db, { bytes, fileName, downloadedAt = new Date(), force = false }) {
  const checksum = sha256(bytes);
  try {
    let data;
    try {
      data = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error(`${fileName} is not valid JSON.`);
    }
    if (!data || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.medicines)) {
      throw new Error(`${fileName} must have schemaVersion ${SCHEMA_VERSION} and a "medicines" array.`);
    }

    return await db.transaction(async (tx) => {
      const [existing] = await tx.query('select id from source_files where source_id = $1 and checksum_sha256 = $2', [LEGACY_SOURCE, checksum]);
      if (existing) {
        const [done] = await tx.query(
          `select 1 from sync_logs where source_file_id = $1 and job = 'seed' and status = 'succeeded' limit 1`,
          [existing.id],
        );
        if (done && !force) {
          await tx.query('update data_sources set last_checked_at = now() where id = $1', [LEGACY_SOURCE]);
          await logSync(tx, { sourceFileId: existing.id, status: 'skipped', message: 'File already imported (same checksum).' });
          return { skipped: true, sourceFileId: existing.id, checksum };
        }
      }

      const sourceFileId = existing
        ? existing.id
        : (
            await tx.query(
              `insert into source_files (source_id, url, file_name, storage_path, checksum_sha256, byte_size,
                                         content_type, version_label, downloaded_at)
               values ($1, null, $2, $2, $3, $4, 'application/json', $5, $6) returning id`,
              [LEGACY_SOURCE, fileName, checksum, bytes.length, `schemaVersion ${data.schemaVersion}`, downloadedAt],
            )
          )[0].id;

      // --force re-runs an already imported file (e.g. after the normaliser improved); its rows are replaced.
      if (existing) await tx.query('delete from source_records where source_file_id = $1', [sourceFileId]);
      const stats = await importRecords(tx, data.medicines, sourceFileId);
      await tx.query('update data_sources set last_checked_at = now(), last_success_at = now() where id = $1', [LEGACY_SOURCE]);
      await logSync(tx, { sourceFileId, status: 'succeeded', stats });
      return { skipped: false, sourceFileId, checksum, stats };
    });
  } catch (error) {
    await logSync(db, { status: 'failed', message: error.message, stats: { checksum } }).catch(() => {});
    throw error;
  }
}
