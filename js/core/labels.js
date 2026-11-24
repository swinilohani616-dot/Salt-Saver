/**
 * Display text for sources, match statuses, units and dates.
 */
import { formName, releaseName } from '../../lib/pharma/match.js';
import { UNIT_BASIS } from '../../lib/pharma/pack.js';

export { formName, releaseName };

export const SOURCE_LABELS = Object.freeze({
  pmbi_product_list: 'Jan Aushadhi MRP list (PMBI)',
  nppa_ceiling_prices: 'NPPA ceiling price list',
  nppa_brand_mrp: 'NPPA Pharma Sahi Daam (official MRP)',
  legacy_json: 'Demo data, not checked',
  brand_review: 'Checked from the pack',
  user_entered: 'Entered by you',
  saltsaver_curated: 'SaltSaver reference list',
});
export const sourceLabel = (id) => SOURCE_LABELS[id] ?? id;

/** What a strip can say about release type; '' means not sure, so no saving is worked out. */
export const STRIP_CHOICES = Object.freeze([
  ['', 'Not sure'],
  ['ir', 'No, none of these letters'],
  ['sr', 'SR (sustained release)'],
  ['er', 'ER (extended release)'],
  ['xr', 'XR (extended release)'],
  ['xl', 'XL (extended release)'],
  ['mr', 'MR (modified release)'],
  ['cr', 'CR (controlled release)'],
  ['pr', 'PR (prolonged release)'],
  ['dr', 'Enteric coated or gastro-resistant'],
]);

export const STATUS_LABELS = Object.freeze({
  verified_match: { text: 'Verified match', tone: 'verified', icon: 'patch-check-fill' },
  needs_review: { text: 'Needs review', tone: 'review', icon: 'exclamation-circle-fill' },
  insufficient_data: { text: 'Not enough data', tone: 'missing', icon: 'question-circle-fill' },
  not_equivalent: { text: 'Not equivalent', tone: 'mismatch', icon: 'x-circle-fill' },
});

/** "Active salt: " for one salt, "Active salts: " for a combination like "Montelukast 10 mg + Levocetirizine 5 mg". */
export const saltLabel = (composition) => (composition?.includes(' + ') ? 'Active salts: ' : 'Active salt: ');

/**
 * May this alternative carry the BR-02 sentence ("Generics contain identical ... salts")?
 * Not when the salt form differs (e.g. tartrate vs succinate) or a composition is unknown: it would be untrue.
 */
const SALT_NOT_CONFIRMED = new Set(['salt_form_differs', 'composition_unknown']);
export const hasSameSalt = (alternative) => !(alternative.reasons ?? []).some((r) => SALT_NOT_CONFIRMED.has(r.code));

/** "Paracetamol + Caffeine", or null when the salts are not known (or it is a device, such as a bandage). */
export const saltNames = (p) => (p.salts?.length && (p.dosageForm || p.salts.some((s) => s.strength)) ? p.salts.map((s) => s.name).join(' + ') : null);

/** "500 mg + 25 mg", or null unless every salt has a strength. */
export const strengthText = (p) => (p.salts?.length && p.salts.every((s) => s.strength) ? p.salts.map((s) => s.strength).join(' + ') : null);

/** "Metoprolol succinate 25 mg, prolonged release (PR) tablet": what to check on your own strip. */
export function formulationLabel(p) {
  if (!strengthText(p) || !p.dosageForm) return null;
  const salts = p.salts.map((s) => [s.name, s.saltForm, s.strength].filter(Boolean).join(' ')).join(' + ');
  const release = p.releaseType && p.releaseType !== 'ir' ? `${releaseName(p.releaseType)} ` : '';
  return `${salts}, ${release}${formName(p.dosageForm)}`;
}

const PLURAL = {
  tablet: 'tablets', capsule: 'capsules', ml: 'ml', g: 'g', vial: 'vials', ampoule: 'ampoules', dose: 'doses',
  sachet: 'sachets', respule: 'respules', suppository: 'suppositories', pessary: 'pessaries', container: 'packs',
};
/** 1 tablet, 15 tablets, 30 ml */
export const unitText = (unit, count) => {
  if (unit === 'ml' || unit === 'g') return `${count} ${unit}`;
  return `${count} ${count === 1 ? unit ?? 'unit' : PLURAL[unit] ?? `${unit ?? 'unit'}s`}`;
};
/** "per tablet", "per ml" */
export const perUnitText = (unit) => `per ${unit ?? 'unit'}`;

/** The unit a dosage form is priced in (tablet, ml, g, vial, ...), or null if unknown. */
export const unitForForm = (dosageForm) => UNIT_BASIS[dosageForm] ?? null;

export const UNIT_CHOICES = Object.freeze(['tablet', 'capsule', 'ml', 'g', 'vial', 'ampoule', 'dose', 'sachet']);

/** "2026-11-24T05:00:00Z" -> "24 Nov 2026"; '' if missing. */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** "Tablet · Immediate release" style description of a product's form. */
export function formLine(p) {
  const parts = [];
  if (p.dosageForm) parts.push(formName(p.dosageForm).replace(/^./, (c) => c.toUpperCase()));
  if (p.releaseType && p.releaseType !== 'ir') parts.push(releaseName(p.releaseType));
  return parts.join(' · ');
}
