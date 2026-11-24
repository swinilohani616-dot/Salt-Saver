/**
 * Brand review importer: brand compositions checked from the pack by a person.
 *
 * The legacy dataset gives each brand's ingredients and strengths but not its
 * dosage form, release type or salt form, so the matching engine can only say
 * "needs review" for it. Filling this CSV from the actual strip or carton (and
 * approving it like any other import) lets the engine reach "verified match".
 *
 * Columns: Brand name | Manufacturer | Composition | Dosage form | Release type | Pack size | MRP | Checked by | Notes
 *   Composition: as printed, e.g. "Paracetamol 650 mg" or "Amoxycillin 500 mg + Potassium Clavulanate 125 mg"
 *   Dosage form: Tablet, Capsule, Syrup, Suspension, Injection, Cream, ...
 *   Release type: IR (nothing special printed), SR, ER, XR, XL, MR, CR, PR, or DR (enteric coated / gastro-resistant)
 *   MRP: optional, the price printed on that same pack (incl. of all taxes); it needs a pack size that can be read
 */
import { parseComposition, compositionKey } from '../../lib/pharma/composition.js';
import { prepText } from '../../lib/pharma/text.js';
import { detectDosageForm, detectRoute } from '../../lib/pharma/forms.js';
import { parsePack, unitPrice } from '../../lib/pharma/pack.js';
import { normalizeText } from '../../js/core/normalize.js';
import { upsertProducts, setProductIngredients, upsertPacks, setCurrentPrices, deactivateProducts, linkRecords } from '../catalog.js';
import { parseRupees } from './pmbi.js';

export const SOURCE_ID = 'brand_review';
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const RELEASE = { ir: 'ir', immediate: 'ir', 'immediate release': 'ir', plain: 'ir', none: 'ir', sr: 'sr', er: 'er', xr: 'xr', xl: 'xl', mr: 'mr', cr: 'cr', pr: 'pr', dr: 'dr', ec: 'dr', 'enteric coated': 'dr', 'gastro resistant': 'dr', 'delayed release': 'dr' };

export const brandAdapter = {
  sourceId: SOURCE_ID,
  label: 'Brand details checked from the pack',
  keyLabel: 'brand name',
  largeRemovalShare: 1, // a partial review file must not deactivate earlier reviews by accident
  fields: {
    brand: { required: true, synonyms: ['Brand name', 'Brand', 'Medicine'] },
    manufacturer: { required: false, synonyms: ['Manufacturer', 'Company', 'Marketed by'] },
    composition: { required: true, synonyms: ['Composition', 'Active ingredients', 'Salt'] },
    dosageForm: { required: true, synonyms: ['Dosage form', 'Form'] },
    releaseType: { required: true, synonyms: ['Release type', 'Release'] },
    packSize: { required: false, synonyms: ['Pack size', 'Pack'] },
    mrp: { required: false, synonyms: ['MRP', 'MRP (Rs)', 'MRP (₹)', 'Printed MRP'] },
    checkedBy: { required: true, synonyms: ['Checked by', 'Reviewer', 'Verified by'] },
    notes: { required: false, synonyms: ['Notes', 'Note', 'Comments'] },
  },
  anchors: ['brand'],
  reportColumns: [
    { field: 'name', label: 'Brand' },
    { field: 'compositionKey', label: 'Composition read as' },
    { field: 'dosageForm', label: 'Form' },
    { field: 'releaseType', label: 'Release' },
    { field: 'mrp', label: 'MRP (₹)' },
    { field: 'checkedBy', label: 'Checked by' },
  ],

  parseRow(cell, { resolver }) {
    const name = clean(cell('brand'));
    const errors = [];
    if (!name) errors.push('brand name is empty');
    const checkedBy = clean(cell('checkedBy'));
    if (!checkedBy) errors.push('"Checked by" is empty: say who checked the pack');
    const form = detectDosageForm(prepText(cell('dosageForm')));
    if (!form.code) errors.push(`dosage form "${clean(cell('dosageForm'))}" is not recognised`);
    const release = RELEASE[prepText(cell('releaseType'))];
    if (!release) errors.push(`release type "${clean(cell('releaseType'))}" must be IR, SR, ER, XR, XL, MR, CR, PR or DR`);
    const composition = parseComposition(clean(cell('composition')), resolver);
    if (!composition.ok) errors.push(...composition.errors.map((e) => `composition: ${e}`));
    else if (composition.ingredients.some((i) => !i.strength)) errors.push('composition: every ingredient needs a strength');
    const packLabel = clean(cell('packSize'));
    const pack = packLabel && form.code ? parsePack(packLabel, form.code) : { count: null, unit: null, error: null };
    const mrpText = clean(cell('mrp'));
    const mrp = mrpText ? parseRupees(mrpText) : null;
    if (mrpText && !(mrp > 0)) errors.push(`MRP "${mrpText}" is not a price`);
    else if (mrp && !pack.count) errors.push('an MRP needs the pack size it is for, like "Strip of 15 tablets"');
    if (errors.length) return { key: normalizeText(name), status: 'failed', errors };

    const warnings = pack.error ? [`pack size: ${pack.error}`] : [];
    return {
      key: normalizeText(name),
      status: 'parsed',
      warnings,
      parsed: {
        name,
        manufacturer: clean(cell('manufacturer')) || null,
        compositionText: clean(cell('composition')),
        composition: { ok: true, ingredients: composition.ingredients, compositionKey: compositionKey(composition.ingredients) },
        dosageForm: form.code,
        route: detectRoute(prepText(`${cell('dosageForm')} ${cell('composition')}`), form.code).route,
        releaseType: release,
        packSize: packLabel || null,
        pack: { count: pack.count, unit: pack.unit },
        mrp,
        checkedBy,
        notes: clean(cell('notes')) || null,
      },
    };
  },

  snapshot(p) {
    return {
      name: p.name,
      manufacturer: p.manufacturer,
      compositionKey: p.composition.compositionKey,
      dosageForm: p.dosageForm,
      releaseType: p.releaseType,
      packSize: p.packSize,
      mrp: p.mrp ?? null,
      checkedBy: p.checkedBy,
    };
  },

  async loadCurrent(tx) {
    const rows = await tx.query(
      `select p.source_key, p.name, p.manufacturer, p.composition_key, df.code as form, rt.code as release,
              (select label from pack_sizes s where s.product_id = p.id order by id desc limit 1) as pack,
              (select amount_inr::float8 from prices pr where pr.product_id = p.id and pr.is_current and pr.price_type = 'mrp' and pr.source_id = $1) as mrp,
              p.parse_notes->>0 as checked
         from products p left join dosage_forms df on df.id = p.dosage_form_id left join release_types rt on rt.id = p.release_type_id
        where p.source_id = $1 and p.is_active`,
      [SOURCE_ID],
    );
    return new Map(rows.map((r) => [r.source_key, {
      name: r.name, manufacturer: r.manufacturer, compositionKey: r.composition_key, dosageForm: r.form, releaseType: r.release,
      packSize: r.pack ?? null, mrp: r.mrp ?? null, checkedBy: (r.checked ?? '').replace(/^Checked from the pack by /, '') || null,
    }]));
  },

  async commit(tx, { changes, records, sourceFileId, effectiveFrom }) {
    const upserts = changes.filter((c) => c.kind !== 'removed').map((c) => records.get(c.key)).filter(Boolean);
    const ids = await upsertProducts(tx, SOURCE_ID, upserts.map((r) => ({
      sourceKey: r.key,
      productType: 'brand',
      name: r.parsed.name,
      manufacturer: r.parsed.manufacturer,
      isJanAushadhi: false,
      compositionText: r.parsed.compositionText,
      compositionKey: r.parsed.composition.compositionKey,
      dosageForm: r.parsed.dosageForm,
      route: r.parsed.route,
      releaseType: r.parsed.releaseType,
      parseNotes: [`Checked from the pack by ${r.parsed.checkedBy}`, ...(r.parsed.notes ? [r.parsed.notes] : [])],
      verificationStatus: 'verified',
    })));
    const withIds = upserts.map((r) => ({ r, productId: ids.get(r.key) }));
    await setProductIngredients(tx, SOURCE_ID, withIds.map(({ r, productId }) => ({ productId, ingredients: r.parsed.composition.ingredients })));
    const packIds = await upsertPacks(tx, SOURCE_ID, withIds.filter(({ r }) => r.parsed.packSize).map(({ r, productId }) => ({
      productId, label: r.parsed.packSize, count: r.parsed.pack.count, unit: r.parsed.pack.unit, verificationStatus: 'verified',
    })));
    const prices = await setCurrentPrices(tx, {
      sourceId: SOURCE_ID,
      sourceFileId,
      priceType: 'mrp',
      includesGst: true, // an MRP includes all taxes
      effectiveFrom,
      verificationStatus: 'verified',
      items: withIds.filter(({ r }) => r.parsed.mrp > 0).map(({ r, productId }) => ({
        productId, packSizeId: packIds.get(String(productId)) ?? null, amount: r.parsed.mrp,
        unitPrice: unitPrice(r.parsed.mrp, r.parsed.pack.count), unit: r.parsed.pack.unit,
      })),
      clearProductIds: withIds.filter(({ r }) => !(r.parsed.mrp > 0)).map(({ productId }) => productId),
    });
    const deactivated = await deactivateProducts(tx, SOURCE_ID, changes.filter((c) => c.kind === 'removed').map((c) => c.key));
    await linkRecords(tx, withIds.map(({ r, productId }) => ({ recordId: r.id, productId })));
    return { brands: withIds.length, pricesAdded: prices.added, pricesChanged: prices.changed, deactivated };
  },
};
