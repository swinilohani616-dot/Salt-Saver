/**
 * Loads products in the shape the matching engine needs, finds Jan Aushadhi
 * candidates for a medicine, and (refreshMatches) stores engine results in
 * match_results for audit.
 *
 * Only products from the official PMBI list are candidates. The legacy demo
 * generics are never offered as alternatives.
 */
import { compareProducts, statusRank, ENGINE_VERSION } from '../lib/pharma/match.js';

export const CANDIDATE_SOURCE = 'pmbi_product_list';
/** Official MRPs of branded medicines (NPPA Pharma Sahi Daam). */
export const BRAND_PRICE_SOURCE = 'nppa_brand_mrp';

/** One product (alias p) with its ingredients and current official MRP. Add a where clause. */
export const PRODUCT_SELECT = `
  select p.id, p.source_id as "sourceId", p.source_key as "sourceKey", p.product_type as "productType", p.name,
         p.manufacturer, p.is_jan_aushadhi as "isJanAushadhi", p.ja_drug_code as "jaDrugCode",
         p.composition_text as "compositionText", p.composition_key as "compositionKey",
         df.code as "dosageForm", coalesce(p.route, df.default_route) as route, rt.code as "releaseType",
         p.therapeutic_group as "therapeuticGroup", p.verification_status as "verificationStatus", p.is_active as "isActive",
         to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt",
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'key', i.normalized_name, 'name', i.name, 'saltForm', pi.salt_form,
                    'value', pi.strength_value, 'unit', pi.strength_unit, 'perValue', pi.per_value, 'perUnit', pi.per_unit,
                    'eqKey', ei.normalized_name, 'eqValue', pi.equivalent_strength_value, 'eqUnit', pi.equivalent_strength_unit)
                  order by pi.position)
             from product_ingredients pi
             join ingredients i on i.id = pi.ingredient_id
             left join ingredients ei on ei.id = pi.equivalent_ingredient_id
            where pi.product_id = p.id), '[]'::jsonb) as ingredients,
         price.price, pack.pack
    from products p
    left join dosage_forms df on df.id = p.dosage_form_id
    left join release_types rt on rt.id = p.release_type_id
    left join lateral (
      select jsonb_build_object(
               'amount', pr.amount_inr::float8, 'type', pr.price_type, 'sourceId', pr.source_id,
               'includesGst', pr.includes_gst, 'unitPrice', pr.unit_price_inr::float8, 'unit', pr.price_unit,
               'packLabel', ps.label, 'packCount', ps.unit_count::float8, 'packUnit', ps.unit,
               'effectiveFrom', pr.effective_from::text,
               'updatedAt', to_char(pr.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) as price
        from prices pr left join pack_sizes ps on ps.id = pr.pack_size_id
       where pr.product_id = p.id and pr.is_current and pr.price_type = 'mrp'
       order by pr.id desc limit 1
    ) price on true
    left join lateral (
      select jsonb_build_object('label', ps.label, 'count', ps.unit_count::float8, 'unit', ps.unit) as pack
        from pack_sizes ps where ps.product_id = p.id order by ps.id desc limit 1
    ) pack on true`;

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** DB row -> engine product (+ display fields). */
export function toMatchProduct(row) {
  return {
    ...row,
    id: String(row.id),
    ingredients: (row.ingredients ?? []).map((i) => ({
      key: i.key,
      name: i.name,
      saltForm: i.saltForm ?? null,
      strength: i.value === null || i.value === undefined ? null : { value: num(i.value), unit: i.unit, perValue: num(i.perValue), perUnit: i.perUnit ?? null },
      ...(i.eqKey && i.eqValue !== null ? { equivalent: { key: i.eqKey, strength: { value: num(i.eqValue), unit: i.eqUnit, perValue: null, perUnit: null } } } : {}),
    })),
  };
}

export async function loadProducts(db, ids) {
  if (!ids.length) return [];
  const rows = await db.query(`${PRODUCT_SELECT} where p.id = any($1)`, [ids]);
  return rows.map(toMatchProduct);
}

export async function loadProduct(db, id) {
  return (await loadProducts(db, [id]))[0] ?? null;
}

/** Active Jan Aushadhi products from the official list that share at least one ingredient. */
async function candidateIds(db, productId) {
  const rows = await db.query(
    `select distinct c.id
       from product_ingredients mine
       join product_ingredients ci on ci.ingredient_id = mine.ingredient_id
       join products c on c.id = ci.product_id
      where mine.product_id = $1 and c.id <> $1 and c.is_active and c.is_jan_aushadhi and c.source_id = $2
      limit 300`,
    [productId, CANDIDATE_SOURCE],
  );
  return rows.map((r) => r.id);
}

/**
 * @param {{stripRelease?:string|null}} [options] the release type a user read from their own strip. Used only when
 *        the catalogue does not record one; it never replaces a known value and is never stored.
 * @returns {Promise<{product:object|null, alternatives:Array<{product:object, status:string, reasons:object[]}>,
 *          notEquivalent:number, confirmedRelease:string|null}>}
 */
export async function findAlternatives(db, productId, { stripRelease = null } = {}) {
  const product = await loadProduct(db, productId);
  if (!product) return { product: null, alternatives: [], notEquivalent: 0, confirmedRelease: null };
  const confirmedRelease = !product.releaseType && product.dosageForm && stripRelease ? stripRelease : null;
  const original = confirmedRelease ? { ...product, releaseType: confirmedRelease } : product;
  const candidates = await loadProducts(db, await candidateIds(db, productId));
  const compared = candidates
    .map((candidate) => ({ product: candidate, ...compareProducts(original, candidate) }))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.product.price?.unitPrice ?? Infinity) - (b.product.price?.unitPrice ?? Infinity));
  return {
    product,
    alternatives: compared.filter((r) => r.status !== 'not_equivalent'),
    notEquivalent: compared.filter((r) => r.status === 'not_equivalent').length,
    confirmedRelease,
  };
}

/**
 * Recomputes match_results (method 'engine') for every active brand product.
 * Run after an import is approved: `npm run match:refresh`.
 */
export async function refreshMatches(db) {
  const brands = await db.query(`select id from products where product_type = 'brand' and is_active`);
  let stored = 0;
  await db.transaction(async (tx) => {
    await tx.query(`delete from match_results where method = 'engine'`);
    for (const { id } of brands) {
      const { alternatives } = await findAlternatives(tx, id);
      for (const alt of alternatives) {
        await tx.query(
          `insert into match_results (product_id, candidate_product_id, status, reasons, method, engine_version, source_id)
           values ($1, $2, $3, $4::jsonb, 'engine', $5, $6)`,
          [id, alt.product.id, alt.status, JSON.stringify(alt.reasons), ENGINE_VERSION, CANDIDATE_SOURCE],
        );
        stored += 1;
      }
    }
  });
  return { brands: brands.length, stored };
}
