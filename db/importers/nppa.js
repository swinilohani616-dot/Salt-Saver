/**
 * NPPA ceiling price importer (DPCO 2013 scheduled formulations, NLEM).
 *
 * Input: the "Compendium of Prices" list from https://www.nppa.gov.in/en/compendiumofprice
 * (IPDMS dashboard: Download CSV or PDF), or an NPPA ceiling price PDF.
 * Layout of NPPA's PDFs (checked on the 30.09.2020 list): Sl No | Medicines |
 * Dosage form and Strength | Unit | Ceiling price. Combination medicines are
 * written "Abacavir (A) + Lamivudine (B)" with strengths "60 mg(A) + 30 mg(B)".
 *
 * A ceiling price is the legal maximum price per unit, excluding GST. It is not
 * the shop price, and it applies only to the formulation as notified.
 */
import { parseComposition } from '../../lib/pharma/composition.js';
import { nameKey } from '../../lib/pharma/text.js';
import { parseRupees } from './pmbi.js';
import { batches } from '../pipeline.js';

export const SOURCE_ID = 'nppa_ceiling_prices';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const dropMarkers = (s) => s.replace(/\(\s*[a-z]\s*\)/gi, ' ').replace(/\s+/g, ' ').trim(); // "(A)", "(B)"

const UNIT_WORDS = [
  ['tablet', /^(tablets?|tabs?)$/], ['capsule', /^(capsules?|caps?)$/], ['ml', /^ml$/], ['g', /^(gm|grams?|g)$/],
  ['vial', /^vials?$/], ['ampoule', /^(ampoules?|amps?)$/], ['suppository', /^suppositor(y|ies)$/],
  ['pessary', /^pessar(y|ies)$/], ['sachet', /^sachets?$/], ['dose', /^doses?$/], ['respule', /^respules?$/],
  ['bottle', /^bottles?$/], ['pack', /^(packs?|kits?)$/],
];

/**
 * NPPA's "Unit" column -> what one ceiling price buys.
 *   "1 Tablet" -> {count:1, code:'tablet'}          "Per 0.1 ml" -> {count:0.1, code:'ml'}
 *   "Each Pack (2 ml)" -> {count:1, code:'pack', packMl:2}
 *   "500ml Non-Glass" -> {count:1, code:'pack', packMl:500, container:'non-glass'}
 * Pack volume and container are part of the formulation: NPPA prices them separately.
 * Returns null when the unit is not understood.
 */
export function parseCeilingUnit(text) {
  let t = clean(text).toLowerCase().replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  const bracket = /\(([^)]*)\)/.exec(t);
  const container = /\bnon\s*-?\s*glass\b/.test(t) ? 'non-glass' : /\bglass\b/.test(t) ? 'glass' : null;
  const volume = /(\d+(?:\.\d+)?)\s*ml\b/.exec(bracket ? bracket[1] : t);
  t = t.replace(/\(.*\)/g, ' ').replace(/\b(non\s*-?\s*glass|glass|metered|soft gelatin|hard gelatin|each|per|combi)\b/g, ' ').replace(/\s+/g, ' ').trim();

  // "500ml Non-Glass": a container of a stated volume.
  if (container && volume) return { count: 1, code: 'pack', packMl: Number(volume[1]), container };
  const m = /^(?:(\d+(?:\.\d+)?)\s*)?([a-z]+)$/.exec(t);
  if (!m) return null;
  const code = UNIT_WORDS.find(([, re]) => re.test(m[2]))?.[0];
  if (!code) return null;
  const unit = { count: m[1] ? Number(m[1]) : 1, code };
  if (code === 'pack' && bracket && volume) unit.packMl = Number(volume[1]);
  if (!(unit.count > 0)) return null;
  return unit;
}

/** Key part for the unit: "tablet", "ml", "pack:2ml", "pack:500ml:glass". */
export const unitKey = (u) => [u.code, u.packMl ? `${u.packMl}ml` : null, u.container].filter(Boolean).join(':');

/** "30.09.2020", "30/09/2020", "2020-09-30" -> "2020-09-30"; null otherwise. */
export function parseIndianDate(text) {
  const t = clean(text);
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCDate() !== d || date.getUTCMonth() !== mo - 1) return null;
    return date.toISOString().slice(0, 10);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? t : null;
}

export const nppaAdapter = {
  sourceId: SOURCE_ID,
  label: 'NPPA ceiling prices (DPCO 2013 scheduled formulations)',
  keyLabel: 'formulation',
  largeRemovalShare: 0.2,
  fields: {
    serial: { required: false, synonyms: ['Sl No', 'Sl. No.', 'Sl.No.', 'S. No.', 'S.No', 'Sr. No.', 'Sr No'], pattern: /^\d{1,5}\.?$/ },
    medicine: {
      required: true,
      synonyms: ['Medicines', 'Medicine', 'Name of the Medicine', 'Name of Medicine', 'Formulation', 'Name of the Formulation', 'Name of the Scheduled Formulation', 'Scheduled Formulation', 'Name of Scheduled Formulation', 'Drug Name'],
    },
    strength: {
      required: true,
      synonyms: ['Dosage form and Strength', 'Dosage Form & Strength', 'Dosage form/Strength', 'Dosage Form/ Strength', 'Dosage form and strength', 'Strength'],
    },
    dosageForm: { required: false, synonyms: ['Dosage Form', 'Form'] },
    unit: { required: true, synonyms: ['Unit', 'Unit of Measurement', 'Per Unit', 'Unit (Pack)'] },
    ceilingPrice: {
      required: true,
      synonyms: ['Ceiling price', 'Ceiling Price (Rs.)', 'Ceiling Price (Rs)', 'Ceiling Price (in Rs.)', 'Ceiling Price (in Rs)', 'Ceiling Price per Unit', 'Ceiling Price (₹)', 'Ceiling Price (excluding GST)', 'Ceiling price (Rs.) per unit'],
    },
    notification: { required: false, synonyms: ['S.O. No', 'S.O. No.', 'SO No', 'S.O. Number', 'Notification No', 'Notification Number', 'S.O. No. & Date', 'Notification'] },
    notificationDate: { required: false, synonyms: ['S.O. Date', 'Notification Date', 'Date of Notification', 'Date', 'Effective Date', 'w.e.f.', 'With effect from'] },
  },
  anchors: ['ceilingPrice'],
  reportColumns: [
    { field: 'medicine', label: 'Medicine' },
    { field: 'strength', label: 'Dosage form and strength' },
    { field: 'unit', label: 'Unit' },
    { field: 'ceilingPrice', label: 'Ceiling (₹, excl. GST)' },
    { field: 'compositionKey', label: 'Read as' },
  ],

  parseRow(cell, { resolver }) {
    const medicineRaw = clean(cell('medicine'));
    const strengthRaw = [clean(cell('dosageForm')), clean(cell('strength'))].filter(Boolean).join(' ');
    const unitText = clean(cell('unit'));
    const priceText = clean(cell('ceilingPrice'));
    const errors = [];
    if (!medicineRaw) errors.push('medicine name is empty');
    if (!strengthRaw) errors.push('dosage form and strength are empty');
    const footnote = /\*\s*$/.test(priceText);
    const price = parseRupees(priceText.replace(/\*+\s*$/, ''));
    if (!priceText) errors.push('ceiling price is empty');
    else if (price === null) errors.push(`ceiling price "${priceText}" is not a number`);
    else if (price === 0) errors.push('ceiling price is 0');
    const unit = parseCeilingUnit(unitText);
    if (!unitText) errors.push('unit is empty');
    else if (!unit) errors.push(`unit "${unitText}" is not understood`);
    const fallbackKey = `text:${nameKey(`${medicineRaw} ${strengthRaw} ${unitText}`)}`;
    if (errors.length) return { key: fallbackKey, status: 'failed', errors };

    const medicine = dropMarkers(medicineRaw);
    const strength = dropMarkers(strengthRaw);
    const composition = parseComposition(`${medicine} ${strength}`, resolver);
    const warnings = [...composition.errors.map((e) => `composition: ${e}`), ...composition.warnings];
    if (footnote) warnings.push('the price carries a footnote mark (*) in the list; check the notification');
    const key = composition.ok && composition.compositionKey
      ? `${composition.compositionKey}|${composition.dosageForm ?? '?'}|${composition.releaseType ?? '?'}|${unitKey(unit)}`
      : fallbackKey;

    const notificationDate = parseIndianDate(cell('notificationDate'));
    return {
      key,
      status: 'parsed',
      warnings,
      parsed: {
        medicine: medicineRaw,
        strength: strengthRaw,
        unit: unitText,
        unitCode: unitKey(unit),
        ceilingPrice: price,
        ceilingPerUnit: Math.round((price / unit.count) * 10_000) / 10_000,
        notification: clean(cell('notification')) || null,
        notificationDate,
        composition: {
          ok: composition.ok,
          ingredients: composition.ok ? composition.ingredients : [],
          dosageForm: composition.dosageForm,
          releaseType: composition.releaseType,
          compositionKey: composition.compositionKey,
        },
      },
    };
  },

  snapshot(p) {
    return {
      medicine: p.medicine,
      strength: p.strength,
      unit: p.unit,
      ceilingPrice: p.ceilingPerUnit,
      notification: p.notification ?? null,
      compositionKey: p.composition.compositionKey ?? null,
      dosageForm: p.composition.dosageForm ?? null,
      releaseType: p.composition.releaseType ?? null,
    };
  },

  async loadCurrent(tx) {
    const rows = await tx.query(
      `select c.record_key, c.formulation_text, c.strength_text, c.price_unit, c.ceiling_price_inr::float8 as price,
              c.notification_ref, c.composition_key, df.code as dosage_form, rt.code as release_type
         from nppa_ceiling_prices c
         left join dosage_forms df on df.id = c.dosage_form_id
         left join release_types rt on rt.id = c.release_type_id
        where c.source_id = $1 and c.is_current`,
      [SOURCE_ID],
    );
    return new Map(
      rows.map((r) => [
        r.record_key,
        {
          medicine: r.formulation_text,
          strength: r.strength_text,
          unit: r.price_unit,
          ceilingPrice: r.price,
          notification: r.notification_ref ?? null,
          compositionKey: r.composition_key ?? null,
          dosageForm: r.dosage_form ?? null,
          releaseType: r.release_type ?? null,
        },
      ]),
    );
  },

  async commit(tx, { changes, records, sourceFileId, effectiveFrom }) {
    const upserts = changes.filter((c) => c.kind === 'new' || c.kind === 'changed').map((c) => records.get(c.key)).filter(Boolean);
    const retireKeys = changes.filter((c) => c.kind !== 'new').map((c) => c.key);
    let retired = 0;
    for (const batch of batches(retireKeys)) {
      const r = await tx.query(
        'update nppa_ceiling_prices set is_current = false where source_id = $1 and is_current and record_key = any($2) returning id',
        [SOURCE_ID, batch],
      );
      retired += r.length;
    }
    let inserted = 0;
    for (const batch of batches(upserts)) {
      const rows = await tx.query(
        `insert into nppa_ceiling_prices (source_id, source_file_id, record_key, formulation_text, strength_text, composition_key,
                                          dosage_form_id, release_type_id, price_unit, unit_code, ceiling_price_inr, excludes_gst,
                                          notification_ref, notification_date, effective_from, ingredients, parse_notes,
                                          verification_status, is_current)
         select $1, $2, x.record_key, x.medicine, x.strength, x.composition_key, df.id, rt.id, x.unit, x.unit_code, x.price, true,
                x.notification, x.notification_date, coalesce($3::date, x.notification_date), x.ingredients, x.parse_notes,
                x.verification_status, true
           from jsonb_to_recordset($4::jsonb) as x(record_key text, medicine text, strength text, composition_key text,
                dosage_form text, release_type text, unit text, unit_code text, price numeric, notification text,
                notification_date date, ingredients jsonb, parse_notes jsonb, verification_status text)
           left join dosage_forms df on df.code = x.dosage_form
           left join release_types rt on rt.code = x.release_type
         returning id`,
        [
          SOURCE_ID,
          sourceFileId,
          effectiveFrom,
          JSON.stringify(
            batch.map((r) => ({
              record_key: r.key,
              medicine: r.parsed.medicine,
              strength: r.parsed.strength,
              composition_key: r.parsed.composition.compositionKey,
              dosage_form: r.parsed.composition.dosageForm,
              release_type: r.parsed.composition.releaseType,
              unit: r.parsed.unit,
              unit_code: r.parsed.unitCode,
              price: r.parsed.ceilingPerUnit,
              notification: r.parsed.notification,
              notification_date: r.parsed.notificationDate,
              ingredients: r.parsed.composition.ingredients,
              parse_notes: r.warnings,
              verification_status: r.parsed.composition.ok && r.warnings.length === 0 ? 'verified' : 'needs_review',
            })),
          ),
        ],
      );
      inserted += rows.length;
    }
    const removed = changes.filter((c) => c.kind === 'removed').length;
    return { ceilingPrices: inserted, changed: changes.filter((c) => c.kind === 'changed').length, removed, retired };
  },
};
