/**
 * Read-only catalogue queries for the API: search, autocomplete, source status
 * and NPPA ceiling look-up. Everything reads the local database; no request ever
 * reaches a government website.
 */
import { normalizeText } from '../js/core/normalize.js';
import { nameKey } from '../lib/pharma/text.js';
import { formatStrength } from '../lib/pharma/strength.js';
import { parseQuery, strengthValues } from '../lib/pharma/query.js';
import { PRODUCT_SELECT, toMatchProduct, CANDIDATE_SOURCE, BRAND_PRICE_SOURCE } from '../db/matching.js';

const DAY_MS = 86_400_000;

/**
 * Freshness of each data source. A source is stale when its last successful
 * import is older than its stale_after_days (PMBI 60, NPPA 400), or it has
 * never been imported.
 */
export async function sourceStatus(db, now = new Date()) {
  const rows = await db.query(
    `select s.id, s.name, s.kind, s.homepage_url as "homepageUrl", s.stale_after_days as "staleAfterDays",
            to_char(s.last_success_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastSuccessAt",
            to_char(s.last_checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastCheckedAt",
            (select max(effective_from)::text from import_diffs d where d.source_id = s.id and d.status = 'committed') as "asOf",
            (select count(*) from import_diffs d where d.source_id = s.id and d.status = 'committed')::int as imports
       from data_sources s order by s.id`,
  );
  return rows.map((s) => {
    const last = s.lastSuccessAt ? new Date(s.lastSuccessAt) : null;
    const imported = s.kind !== 'official' ? true : s.imports > 0;
    const ageDays = last ? Math.floor((now - last) / DAY_MS) : null;
    const stale = s.kind === 'official' && (!imported || (s.staleAfterDays && ageDays > s.staleAfterDays));
    return { ...s, imported, ageDays, stale };
  });
}

/** Counts that show whether real official data (not only the demo seed) is in use. */
export async function dataCounts(db) {
  const [c] = await db.query(
    `select (select count(*) from products where source_id = 'pmbi_product_list' and is_active)::int as "janAushadhiProducts",
            (select count(*) from prices where source_id = 'pmbi_product_list' and is_current)::int as "janAushadhiPrices",
            (select count(*) from nppa_ceiling_prices where is_current)::int as "ceilingPrices",
            (select count(*) from products where source_id = 'brand_review' and is_active)::int as "reviewedBrands",
            (select count(*) from prices where source_id in ('brand_review', '${BRAND_PRICE_SOURCE}') and is_current and price_type = 'mrp')::int as "brandPrices",
            (select count(*) from products where source_id = 'legacy_json' and product_type = 'brand' and is_active)::int as "legacyBrands"`,
  );
  return c;
}

/** Brand name without its strength and form: "telma h 40 12.5mg tablet" -> "telma h". */
const baseName = (column) => `btrim(regexp_replace(${column}, '\\s[0-9].*$', ''))`;

/**
 * Names a person may type: brands, Jan Aushadhi products, ingredients and their aliases.
 * Legacy demo generics are excluded. A legacy demo brand is hidden once the same medicine has been
 * checked from its pack, or the official price list has the same brand, strength and dosage form.
 */
const SEARCHABLE = `
  p.is_active
  and not (p.source_id = 'legacy_json' and p.product_type = 'generic')
  and not (p.source_id = 'legacy_json' and exists (
        select 1 from products r where r.source_id = 'brand_review' and r.is_active and r.normalized_name = p.normalized_name))
  and not (p.source_id = 'legacy_json' and exists (
        select 1 from products r where r.source_id = '${BRAND_PRICE_SOURCE}' and r.is_active and r.composition_key = p.composition_key
           and r.dosage_form_id = p.dosage_form_id and ${baseName('r.normalized_name')} = ${baseName('p.normalized_name')}))`;

const likeWord = (w) => `% ${w}%`; // matched against ' ' || normalized_name, so it starts a word
const numberPattern = (n) => `(^| )${String(n).replace('.', '\\.')}([a-z ]|$)`;

/**
 * Everything the search page needs, in one statement:
 *   hits        medicines whose name starts the typed words, or that contain the typed salt(s),
 *               in the typed strength, form and release type
 *   similar     only when there are no hits: names that are close to what was typed
 *   candidates  for each brand found, the official generics with exactly the same salts
 * Grouping and matching happen afterwards, in lib/pharma/groups.js.
 *
 * @returns {Promise<{matchedBy:'name'|'similar'|null, truncated:boolean,
 *   products:Array<object>}>} products as loaded by db/matching.js, with hit and byName
 */
export async function searchProducts(db, query, { limit = 80 } = {}) {
  const q = parseQuery(query);
  if (!q.words.length) return { matchedBy: null, truncated: false, products: [] };
  const rows = await db.query(
    `with ing as (
       select ph.n, i.id from unnest($2::text[]) with ordinality as ph(k, n) join ingredients i on i.normalized_name like ph.k || '%'
       union
       select ph.n, a.ingredient_id from unnest($2::text[]) with ordinality as ph(k, n) join ingredient_aliases a on a.normalized_alias like ph.k || '%'
     ),
     found as (
       select p.id, p.product_type, p.normalized_name,
              (' ' || p.normalized_name) like all ($1::text[]) as by_name,
              cardinality($2::text[]) > 0 and not exists (
                select 1 from generate_series(1, cardinality($2::text[])) as ph(n)
                 where not exists (select 1 from product_ingredients pi join ing on ing.id = pi.ingredient_id and ing.n = ph.n where pi.product_id = p.id)) as by_salt
         from products p
         left join dosage_forms df on df.id = p.dosage_form_id
         left join release_types rt on rt.id = p.release_type_id
        where ${SEARCHABLE}
          and ((' ' || p.normalized_name) like all ($1::text[])
               or exists (select 1 from product_ingredients pi join ing on ing.id = pi.ingredient_id where pi.product_id = p.id))
          and not exists (
                select 1 from jsonb_to_recordset($3::jsonb) as st(vals jsonb, re text)
                 where not (p.normalized_name ~ st.re
                            or exists (select 1 from product_ingredients pi where pi.product_id = p.id and st.vals @> to_jsonb(pi.strength_value::float8))))
          and (cardinality($4::text[]) = 0 or df.code is null or df.code = any($4))
          and ($5::text is null or rt.code is null or rt.code = $5)
     ),
     hits as (select id, product_type, by_name, 'name'::text as how from found where by_name or by_salt),
     similar_ing as (select i.id from ingredients i where not exists (select 1 from hits) and $6 <> '' and i.normalized_name % $6),
     similar_hits as (
       select p.id, p.product_type, false as by_name, 'similar'::text as how
         from products p
        where not exists (select 1 from hits) and $6 <> '' and ${SEARCHABLE}
          and (word_similarity($6, p.normalized_name) >= 0.5
               or exists (select 1 from product_ingredients pi where pi.product_id = p.id and pi.ingredient_id in (select id from similar_ing)))
     ),
     chosen as (
       select h.*, (select count(*) from product_ingredients pi where pi.product_id = h.id) as salts, p.name,
              exists (select 1 from prices pr where pr.product_id = h.id and pr.is_current and pr.price_type = 'mrp') as priced
         from (select * from hits union all select * from similar_hits) h join products p on p.id = h.id
        order by (h.by_name and h.product_type = 'brand') desc, nullif((select count(*) from product_ingredients pi where pi.product_id = h.id), 0) asc nulls last,
                 h.product_type = 'brand' desc, priced desc, p.name
        limit $7
     ),
     brand_salts as (
       select distinct array_agg(pi.ingredient_id order by pi.ingredient_id) as ids
         from product_ingredients pi where pi.product_id in (select id from chosen where product_type = 'brand') group by pi.product_id
     ),
     candidates as (
       select c.id
         from products c
        where c.is_active and c.is_jan_aushadhi and c.source_id = '${CANDIDATE_SOURCE}'
          and c.id in (select pi.product_id from product_ingredients pi where pi.ingredient_id in (select unnest(ids) from brand_salts))
          and (select array_agg(pi.ingredient_id order by pi.ingredient_id) from product_ingredients pi where pi.product_id = c.id) in (select ids from brand_salts)
        limit 200
     ),
     wanted as (
       select id, true as hit, by_name, how from chosen
       union all
       select id, false, false, null from candidates where id not in (select id from chosen)
     )
     select details.*, w.hit, w.by_name as "byName", w.how
       from wanted w join lateral (${PRODUCT_SELECT} where p.id = w.id) details on true`,
    [
      q.words.map(likeWord),
      q.phrases.map(nameKey).filter(Boolean),
      JSON.stringify(q.strengths.map((s) => ({ vals: strengthValues(s), re: numberPattern(s.value) }))),
      q.forms,
      q.release,
      q.words.join(' '),
      limit,
    ],
  );
  const hits = rows.filter((r) => r.hit);
  const products = rows.map(({ how, ...row }) => toMatchProduct(row));
  return { matchedBy: hits[0]?.how ?? null, truncated: hits.length >= limit, products: narrow(products, q) };
}

/**
 * Drops hits that only half fit, when others fit completely: "Telma 40" is not Telma H 40/12.5,
 * "metformin SR" is not a metformin whose release type is unknown. With nothing better, they stay.
 */
function narrow(products, q) {
  let dropped = new Set();
  const prefer = (fits) => {
    const hits = products.filter((p) => p.hit && !dropped.has(p.id));
    if (hits.some(fits)) dropped = new Set([...dropped, ...hits.filter((p) => !fits(p)).map((p) => p.id)]);
  };
  if (q.release) prefer((p) => p.releaseType === q.release);
  if (q.forms.length) prefer((p) => q.forms.includes(p.dosageForm));
  if (q.strengths.length) prefer((p) => p.ingredients.length === q.strengths.length && q.strengths.every((s) => p.ingredients.some((i) => strengthValues(s).includes(i.strength?.value))));
  // A dropped hit may still be a generic to compare with a brand that stays.
  return products.filter((p) => !(dropped.has(p.id) && p.productType === 'brand')).map((p) => (dropped.has(p.id) ? { ...p, hit: false, byName: false } : p));
}

/** [{name, value, unit, perValue, perUnit}] -> "Amoxycillin 500 mg + Clavulanic Acid 125 mg" */
export function compositionLabel(ingredients) {
  if (!ingredients?.length) return null;
  return ingredients
    .map((i) => (i.value === null || i.value === undefined ? i.name : `${i.name} ${formatStrength({ value: Number(i.value), unit: i.unit, perValue: i.perValue === null ? null : Number(i.perValue), perUnit: i.perUnit })}`))
    .join(' + ');
}

/** Autocomplete: up to `limit` names starting with (or close to) what was typed. */
export async function suggest(db, query, { limit = 8 } = {}) {
  const q = normalizeText(query);
  const k = nameKey(query);
  const rows = await db.query(
    `(select p.name as label, p.name as value, case when p.is_jan_aushadhi then 'generic' else 'brand' end as type,
             case when p.normalized_name like $1 || '%' then 2 else 1 end as rank
        from products p
       where ${SEARCHABLE} and (p.normalized_name like $1 || '%' or p.normalized_name like '% ' || $1 || '%')
       order by rank desc, length(p.name) limit $3)
     union all
     (select i.name, i.name, 'ingredient', 3 from ingredients i
       where i.normalized_name like $2 || '%'
         and exists (select 1 from product_ingredients pi join products p on p.id = pi.product_id where pi.ingredient_id = i.id and ${SEARCHABLE})
       limit $3)
     union all
     (select a.alias || ' = ' || i.name, i.name, 'ingredient', 2 from ingredient_aliases a join ingredients i on i.id = a.ingredient_id
       where a.normalized_alias like $2 || '%' and a.normalized_alias <> i.normalized_name
       limit 3)`,
    [q, k, limit],
  );
  const seen = new Set();
  return rows
    .sort((a, b) => b.rank - a.rank || a.label.length - b.label.length)
    .filter((r) => !seen.has(r.label.toLowerCase()) && seen.add(r.label.toLowerCase()))
    .slice(0, limit)
    .map(({ label, value, type }) => ({ label, value, type }));
}

/** Ceiling form codes that cover a product's dosage form. */
const CEILING_FORMS = {
  syrup: ['syrup', 'oral_liquid'], suspension: ['suspension', 'oral_liquid'], oral_solution: ['oral_solution', 'oral_liquid'],
  injection_vial: ['injection_vial', 'injection'], injection_ampoule: ['injection_ampoule', 'injection'],
};

const CEILING_COLUMNS = `c.id::text, c.formulation_text as "formulation", c.strength_text as "strength", c.price_unit as "unitText",
            c.unit_code as "unitCode", c.ceiling_price_inr::float8 as "ceilingPerUnit", c.excludes_gst as "excludesGst",
            c.notification_ref as "notification", c.notification_date::text as "notificationDate",
            c.effective_from::text as "effectiveFrom", rt.code as "releaseType", c.verification_status as "verificationStatus",
            to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt",
            c.composition_key as "compositionKey", df.code as "dosageForm"`;

/**
 * NPPA ceiling prices for several formulations at once: same ingredients and strengths,
 * a dosage form the ceiling covers, and the same release type.
 * @param {Array<{key:string, compositionKey:string|null, dosageForm:string|null, releaseType:string|null}>} groups
 * @returns {Promise<Map<string, object[]>>} group key -> ceilings
 */
export async function ceilingsForGroups(db, groups) {
  const wanted = groups.filter((g) => g.compositionKey && g.dosageForm);
  if (!wanted.length) return new Map();
  const rows = await db.query(
    `select ${CEILING_COLUMNS}
       from nppa_ceiling_prices c
       join dosage_forms df on df.id = c.dosage_form_id
       left join release_types rt on rt.id = c.release_type_id
      where c.is_current and c.composition_key = any($1)`,
    [[...new Set(wanted.map((g) => g.compositionKey))]],
  );
  return new Map(wanted.map((g) => [g.key, rows
    .filter((r) => r.compositionKey === g.compositionKey && (CEILING_FORMS[g.dosageForm] ?? [g.dosageForm]).includes(r.dosageForm))
    .filter((r) => !g.releaseType || !r.releaseType || r.releaseType === g.releaseType)
    .map(({ compositionKey, dosageForm, ...r }) => ({ ...r, releaseConfirmed: !!(g.releaseType && r.releaseType) }))]));
}

/** NPPA ceiling prices for exactly this product's formulation. */
export async function ceilingsFor(db, product) {
  if (!product) return [];
  return (await ceilingsForGroups(db, [{ ...product, key: 'product' }])).get('product') ?? [];
}
