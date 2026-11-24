/**
 * Set-based writes to the catalogue tables, used by importers when a review is
 * approved. Each function sends whole batches as JSON, so a list of thousands
 * of products is a handful of statements, not thousands of round trips.
 */
import { normalizeText } from '../js/core/normalize.js';
import { batches } from './pipeline.js';

const json = (v) => JSON.stringify(v);

/**
 * @param {Array<{sourceKey:string, productType:'brand'|'generic', name:string, manufacturer?:string|null,
 *   isJanAushadhi:boolean, jaDrugCode?:string|null, compositionText:string, compositionKey?:string|null,
 *   dosageForm?:string|null, route?:string|null, releaseType?:string|null, therapeuticGroup?:string|null,
 *   pharmacopoeia?:string|null, parseNotes?:string[], verificationStatus:string}>} products
 * @returns {Promise<Map<string, *>>} source_key -> product id
 */
export async function upsertProducts(tx, sourceId, products) {
  const ids = new Map();
  for (const batch of batches(products)) {
    const rows = await tx.query(
      `insert into products (source_id, source_key, product_type, name, normalized_name, manufacturer, is_jan_aushadhi,
                             ja_drug_code, composition_text, composition_key, dosage_form_id, route, release_type_id,
                             therapeutic_group, pharmacopoeia, parse_notes, verification_status, is_active)
       select $1, x.source_key, x.product_type, x.name, x.normalized_name, x.manufacturer, x.is_jan_aushadhi,
              x.ja_drug_code, x.composition_text, x.composition_key, df.id, x.route, rt.id,
              x.therapeutic_group, x.pharmacopoeia, coalesce(x.parse_notes, '[]'::jsonb), x.verification_status, true
         from jsonb_to_recordset($2::jsonb) as x(source_key text, product_type text, name text, normalized_name text,
              manufacturer text, is_jan_aushadhi boolean, ja_drug_code text, composition_text text, composition_key text,
              dosage_form text, route text, release_type text, therapeutic_group text, pharmacopoeia text,
              parse_notes jsonb, verification_status text)
         left join dosage_forms df on df.code = x.dosage_form
         left join release_types rt on rt.code = x.release_type
       on conflict (source_id, source_key) do update set
         product_type = excluded.product_type, name = excluded.name, normalized_name = excluded.normalized_name,
         manufacturer = excluded.manufacturer, is_jan_aushadhi = excluded.is_jan_aushadhi, ja_drug_code = excluded.ja_drug_code,
         composition_text = excluded.composition_text, composition_key = excluded.composition_key,
         dosage_form_id = excluded.dosage_form_id, route = excluded.route, release_type_id = excluded.release_type_id,
         therapeutic_group = excluded.therapeutic_group, pharmacopoeia = excluded.pharmacopoeia,
         parse_notes = excluded.parse_notes, verification_status = excluded.verification_status, is_active = true
       returning id, source_key`,
      [
        sourceId,
        json(
          batch.map((p) => ({
            source_key: p.sourceKey,
            product_type: p.productType,
            name: p.name,
            normalized_name: normalizeText(p.name),
            manufacturer: p.manufacturer ?? null,
            is_jan_aushadhi: p.isJanAushadhi,
            ja_drug_code: p.jaDrugCode ?? null,
            composition_text: p.compositionText,
            composition_key: p.compositionKey ?? null,
            dosage_form: p.dosageForm ?? null,
            route: p.route ?? null,
            release_type: p.releaseType ?? null,
            therapeutic_group: p.therapeuticGroup ?? null,
            pharmacopoeia: p.pharmacopoeia ?? null,
            parse_notes: p.parseNotes ?? [],
            verification_status: p.verificationStatus,
          })),
        ),
      ],
    );
    for (const r of rows) ids.set(r.source_key, r.id);
  }
  return ids;
}

/**
 * Replaces the ingredient list of each product. Unknown ingredients are created
 * (needs_review) under the importing source.
 * @param {Array<{productId:*, ingredients:Array<{key:string, name:string, saltForm:string|null, strength:object|null,
 *   sourceText?:string, equivalent?:{key:string, name:string, strength:object}}>}>} items
 */
export async function setProductIngredients(tx, sourceId, items) {
  const names = new Map();
  for (const item of items) {
    for (const i of item.ingredients) {
      names.set(i.key, i.name);
      if (i.equivalent) names.set(i.equivalent.key, i.equivalent.name);
    }
  }
  const keys = [...names.keys()];
  for (const batch of batches(keys)) {
    await tx.query(
      `insert into ingredients (name, normalized_name, source_id, verification_status)
       select x.name, x.key, $1, 'needs_review' from jsonb_to_recordset($2::jsonb) as x(key text, name text)
       on conflict (normalized_name) do nothing`,
      [sourceId, json(batch.map((key) => ({ key, name: names.get(key) })))],
    );
  }
  const idByKey = new Map();
  for (const batch of batches(keys)) {
    for (const r of await tx.query('select id, normalized_name from ingredients where normalized_name = any($1)', [batch])) idByKey.set(r.normalized_name, r.id);
  }

  const productIds = items.map((i) => i.productId);
  for (const batch of batches(productIds)) await tx.query('delete from product_ingredients where product_id = any($1)', [batch]);

  const rows = items.flatMap((item) =>
    item.ingredients.map((i, n) => ({
      product_id: item.productId,
      ingredient_id: idByKey.get(i.key),
      position: n + 1,
      salt_form: i.saltForm ?? null,
      strength_value: i.strength?.value ?? null,
      strength_unit: i.strength?.unit ?? null,
      per_value: i.strength?.perValue ?? null,
      per_unit: i.strength?.perUnit ?? null,
      source_text: i.sourceText ?? null,
      equivalent_ingredient_id: i.equivalent ? idByKey.get(i.equivalent.key) : null,
      equivalent_strength_value: i.equivalent?.strength?.value ?? null,
      equivalent_strength_unit: i.equivalent?.strength?.unit ?? null,
    })),
  );
  for (const batch of batches(rows)) {
    await tx.query(
      `insert into product_ingredients (product_id, ingredient_id, position, salt_form, strength_value, strength_unit, per_value, per_unit,
                                        source_text, equivalent_ingredient_id, equivalent_strength_value, equivalent_strength_unit, source_id)
       select x.product_id, x.ingredient_id, x.position, x.salt_form, x.strength_value, x.strength_unit, x.per_value, x.per_unit,
              x.source_text, x.equivalent_ingredient_id, x.equivalent_strength_value, x.equivalent_strength_unit, $1
         from jsonb_to_recordset($2::jsonb) as x(product_id bigint, ingredient_id bigint, position smallint, salt_form text,
              strength_value numeric, strength_unit text, per_value numeric, per_unit text, source_text text,
              equivalent_ingredient_id bigint, equivalent_strength_value numeric, equivalent_strength_unit text)`,
      [sourceId, json(batch)],
    );
  }
  return { ingredients: keys.length, rows: rows.length };
}

/**
 * @param {Array<{productId:*, label:string, count:number|null, unit:string|null, verificationStatus:string}>} packs
 * @returns {Promise<Map<string, *>>} productId -> pack_size id
 */
export async function upsertPacks(tx, sourceId, packs) {
  const ids = new Map();
  for (const batch of batches(packs)) {
    const rows = await tx.query(
      `insert into pack_sizes (product_id, label, unit_count, unit, source_id, verification_status)
       select x.product_id, x.label, x.unit_count, x.unit, $1, x.verification_status
         from jsonb_to_recordset($2::jsonb) as x(product_id bigint, label text, unit_count numeric, unit text, verification_status text)
       on conflict (product_id, label) do update set unit_count = excluded.unit_count, unit = excluded.unit,
         verification_status = excluded.verification_status
       returning id, product_id`,
      [sourceId, json(batch.map((p) => ({ product_id: p.productId, label: p.label, unit_count: p.count, unit: p.count ? p.unit : null, verification_status: p.verificationStatus })))],
    );
    for (const r of rows) ids.set(String(r.product_id), r.id);
  }
  return ids;
}

/**
 * Makes `items` the current prices for their products. A product whose amount
 * or pack changed has its old price retired (is_current = false) and a new one
 * added, so price_history shows both. Products in clearProductIds lose their
 * current price without a replacement (e.g. MRP shown as 0 / under process).
 */
export async function setCurrentPrices(tx, { sourceId, sourceFileId, priceType, includesGst, effectiveFrom = null, verificationStatus, items, clearProductIds = [] }) {
  let retired = 0;
  let inserted = 0;
  for (const batch of batches(items)) {
    const payload = json(batch.map((i) => ({ product_id: i.productId, pack_size_id: i.packSizeId ?? null, amount: i.amount, unit_price: i.unitPrice ?? null, unit: i.unit ?? null })));
    const r = await tx.query(
      `update prices p set is_current = false
         from jsonb_to_recordset($1::jsonb) as x(product_id bigint, pack_size_id bigint, amount numeric, unit_price numeric, unit text)
        where p.product_id = x.product_id and p.source_id = $2 and p.price_type = $3 and p.is_current
          and (p.amount_inr <> x.amount or coalesce(p.pack_size_id, 0) <> coalesce(x.pack_size_id, 0))
        returning p.id`,
      [payload, sourceId, priceType],
    );
    retired += r.length;
    const ins = await tx.query(
      `insert into prices (product_id, pack_size_id, source_id, source_file_id, price_type, amount_inr, includes_gst,
                           unit_price_inr, price_unit, effective_from, verification_status, is_current)
       select x.product_id, x.pack_size_id, $2, $3, $4, x.amount, $5, x.unit_price, x.unit, $6, $7, true
         from jsonb_to_recordset($1::jsonb) as x(product_id bigint, pack_size_id bigint, amount numeric, unit_price numeric, unit text)
        where not exists (select 1 from prices p where p.product_id = x.product_id and p.source_id = $2 and p.price_type = $4 and p.is_current)
       returning id`,
      [payload, sourceId, sourceFileId, priceType, includesGst, effectiveFrom, verificationStatus],
    );
    inserted += ins.length;
  }
  let cleared = 0;
  for (const batch of batches(clearProductIds)) {
    const r = await tx.query(
      `update prices set is_current = false where product_id = any($1) and source_id = $2 and price_type = $3 and is_current returning id`,
      [batch, sourceId, priceType],
    );
    cleared += r.length;
  }
  return { added: inserted - Math.min(inserted, retired), changed: Math.min(inserted, retired), cleared };
}

/** Marks products inactive (never deleted) and retires their current prices. */
export async function deactivateProducts(tx, sourceId, sourceKeys) {
  let count = 0;
  for (const batch of batches(sourceKeys)) {
    const rows = await tx.query(
      `update products set is_active = false where source_id = $1 and source_key = any($2) and is_active returning id`,
      [sourceId, batch],
    );
    count += rows.length;
    if (rows.length) {
      await tx.query('update prices set is_current = false where product_id = any($1) and is_current', [rows.map((r) => r.id)]);
    }
  }
  return count;
}

/** Links staged source_records to the products they produced. */
export async function linkRecords(tx, links /* [{recordId, productId}] */) {
  for (const batch of batches(links)) {
    await tx.query(
      `update source_records s set product_id = x.product_id
         from jsonb_to_recordset($1::jsonb) as x(record_id bigint, product_id bigint) where s.id = x.record_id`,
      [json(batch.map((l) => ({ record_id: l.recordId, product_id: l.productId })))],
    );
  }
}
