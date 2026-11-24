/**
 * Jan Aushadhi (PMBI) product and MRP list importer.
 *
 * Input: the list downloaded from https://janaushadhi.gov.in/product-portfolio/product-mrp-list
 * (CSV preferred, PDF also read). Columns seen on 22 Nov 2026: Drug Code, Generic Name,
 * Unit Size, MRP, Group Name. Other header spellings are accepted below; anything
 * else can be mapped with --map.
 *
 * MRPs are inclusive of taxes. A 0 MRP means PMBI lists the product as "under process":
 * the product is imported without a price.
 */
import { parseComposition } from '../../lib/pharma/composition.js';
import { parsePack, unitPrice } from '../../lib/pharma/pack.js';
import { routeForForm } from '../../lib/pharma/forms.js';
import { upsertProducts, setProductIngredients, upsertPacks, setCurrentPrices, deactivateProducts, linkRecords } from '../catalog.js';

export const SOURCE_ID = 'pmbi_product_list';

/** "₹ 1,234.50", "Rs. 12", "12.00/-" -> number; null if not a number. */
export function parseRupees(text) {
  const t = String(text ?? '')
    .replace(/₹|rs\.?|inr|\/-/gi, '')
    .replace(/,/g, '')
    .trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const pmbiAdapter = {
  sourceId: SOURCE_ID,
  label: 'Jan Aushadhi product and MRP list (PMBI)',
  keyLabel: 'drug code',
  largeRemovalShare: 0.2,
  fields: {
    drugCode: { required: true, synonyms: ['Drug Code', 'Drug Code No', 'Drug Code No.', 'Product Code', 'Code', 'Drug Cd'] },
    genericName: {
      required: true,
      synonyms: ['Generic Name', 'Generic Name of the Medicine', 'Name of the Product', 'Product Name', 'Name of Product', 'Medicine Name', 'Drug Name', 'Name of Medicine', 'Generic Name of Product'],
    },
    unitSize: { required: true, synonyms: ['Unit Size', 'Pack Size', 'Unit', 'Pack', 'Unit Pack Size'] },
    mrp: { required: true, synonyms: ['MRP', 'MRP (Rs)', 'MRP (Rs.)', 'MRP(Rs.)', 'MRP (in Rs.)', 'MRP in Rs', 'MRP (INR)', 'MRP (₹)', 'MRP Rs', 'Unit MRP'] },
    group: { required: false, synonyms: ['Group Name', 'Group', 'Therapeutic Group', 'Therapeutic Category', 'Category', 'Product Group'] },
  },
  anchors: ['drugCode', 'mrp'],
  reportColumns: [
    { field: 'name', label: 'Generic name' },
    { field: 'unitSize', label: 'Unit size' },
    { field: 'mrp', label: 'MRP (₹)' },
    { field: 'compositionKey', label: 'Composition read as' },
    { field: 'dosageForm', label: 'Form' },
    { field: 'releaseType', label: 'Release' },
  ],

  /**
   * @param {(field:string)=>string} cell
   * @param {{resolver:object}} ctx
   */
  parseRow(cell, { resolver }) {
    const code = clean(cell('drugCode'));
    const name = clean(cell('genericName'));
    const unitSize = clean(cell('unitSize'));
    const mrpText = clean(cell('mrp'));
    const group = clean(cell('group')) || null;
    const errors = [];
    if (!code) errors.push('drug code is empty');
    if (!name) errors.push('generic name is empty');
    const mrp = parseRupees(mrpText);
    if (!mrpText) errors.push('MRP is empty');
    else if (mrp === null) errors.push(`MRP "${mrpText}" is not a number`);
    if (errors.length) return { key: code, status: 'failed', errors };

    const warnings = [];
    const composition = parseComposition(name, resolver);
    warnings.push(...composition.errors.map((e) => `composition: ${e}`), ...composition.warnings);
    if (mrp === 0) warnings.push('MRP is 0 (PMBI lists these as "under process"); no price is imported');
    const pack = parsePack(unitSize, composition.dosageForm);
    if (pack.error) warnings.push(`unit size: ${pack.error}`);

    return {
      key: code,
      status: 'parsed',
      warnings,
      parsed: {
        drugCode: code,
        name,
        unitSize,
        mrp,
        group,
        composition: {
          ok: composition.ok,
          ingredients: composition.ok ? composition.ingredients : [],
          dosageForm: composition.dosageForm,
          route: composition.route,
          releaseType: composition.releaseType,
          pharmacopoeia: composition.pharmacopoeia,
          compositionKey: composition.compositionKey,
        },
        pack: { count: pack.count, unit: pack.unit },
      },
    };
  },

  /** The fields compared between imports. Derived fields are included so parser improvements show up as changes. */
  snapshot(p) {
    return {
      name: p.name,
      unitSize: p.unitSize,
      mrp: p.mrp > 0 ? p.mrp : null,
      group: p.group ?? null,
      compositionKey: p.composition.compositionKey ?? null,
      dosageForm: p.composition.dosageForm ?? null,
      releaseType: p.composition.releaseType ?? null,
      packCount: p.pack.count ?? null,
      packUnit: p.pack.count ? p.pack.unit : null,
    };
  },

  async loadCurrent(tx) {
    const rows = await tx.query(
      `select p.source_key, p.name, p.therapeutic_group, p.composition_key, df.code as dosage_form, rt.code as release_type,
              ps.label as unit_size, ps.unit_count::float8 as pack_count, ps.unit as pack_unit, pr.amount_inr::float8 as mrp
         from products p
         left join dosage_forms df on df.id = p.dosage_form_id
         left join release_types rt on rt.id = p.release_type_id
         left join prices pr on pr.product_id = p.id and pr.is_current and pr.source_id = $1 and pr.price_type = 'mrp'
         left join lateral (
           select label, unit_count, unit from pack_sizes s where s.product_id = p.id
            order by (s.id = pr.pack_size_id) desc nulls last, s.id desc limit 1
         ) ps on true
        where p.source_id = $1 and p.is_active`,
      [SOURCE_ID],
    );
    return new Map(
      rows.map((r) => [
        r.source_key,
        {
          name: r.name,
          unitSize: r.unit_size ?? '',
          mrp: r.mrp ?? null,
          group: r.therapeutic_group ?? null,
          compositionKey: r.composition_key ?? null,
          dosageForm: r.dosage_form ?? null,
          releaseType: r.release_type ?? null,
          packCount: r.pack_count ?? null,
          packUnit: r.pack_count ? r.pack_unit : null,
        },
      ]),
    );
  },

  async commit(tx, { changes, records, sourceFileId, effectiveFrom }) {
    const upserts = changes
      .filter((c) => c.kind === 'new' || c.kind === 'changed')
      .map((c) => records.get(c.key))
      .filter(Boolean);
    const removed = changes.filter((c) => c.kind === 'removed').map((c) => c.key);

    const status = (r) => (r.parsed.composition.ok && r.warnings.length === 0 ? 'verified' : 'needs_review');
    const ids = await upsertProducts(
      tx,
      SOURCE_ID,
      upserts.map((r) => {
        const p = r.parsed;
        return {
          sourceKey: r.key,
          productType: 'generic',
          name: p.name,
          isJanAushadhi: true,
          jaDrugCode: p.drugCode,
          compositionText: p.name,
          compositionKey: p.composition.compositionKey,
          dosageForm: p.composition.dosageForm,
          route: p.composition.route ?? routeForForm(p.composition.dosageForm),
          releaseType: p.composition.releaseType,
          therapeuticGroup: p.group,
          pharmacopoeia: p.composition.pharmacopoeia,
          parseNotes: r.warnings,
          verificationStatus: status(r),
        };
      }),
    );

    const withIds = upserts.map((r) => ({ r, productId: ids.get(r.key) }));
    await setProductIngredients(tx, SOURCE_ID, withIds.map(({ r, productId }) => ({ productId, ingredients: r.parsed.composition.ingredients })));
    const packIds = await upsertPacks(
      tx,
      SOURCE_ID,
      withIds
        .filter(({ r }) => r.parsed.unitSize)
        .map(({ r, productId }) => ({ productId, label: r.parsed.unitSize, count: r.parsed.pack.count, unit: r.parsed.pack.unit, verificationStatus: r.parsed.pack.count ? 'verified' : 'needs_review' })),
    );

    const priced = withIds.filter(({ r }) => r.parsed.mrp > 0);
    const prices = await setCurrentPrices(tx, {
      sourceId: SOURCE_ID,
      sourceFileId,
      priceType: 'mrp',
      includesGst: true,
      effectiveFrom,
      verificationStatus: 'verified',
      items: priced.map(({ r, productId }) => ({
        productId,
        packSizeId: packIds.get(String(productId)) ?? null,
        amount: r.parsed.mrp,
        unitPrice: unitPrice(r.parsed.mrp, r.parsed.pack.count),
        unit: r.parsed.pack.count ? r.parsed.pack.unit : null,
      })),
      clearProductIds: withIds.filter(({ r }) => !(r.parsed.mrp > 0)).map(({ productId }) => productId),
    });

    const deactivated = await deactivateProducts(tx, SOURCE_ID, removed);
    await linkRecords(tx, withIds.map(({ r, productId }) => ({ recordId: r.id, productId })));

    return { products: withIds.length, pricesAdded: prices.added, pricesChanged: prices.changed, pricesCleared: prices.cleared, deactivated };
  },
};
