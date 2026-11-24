/**
 * Matching engine: is a Jan Aushadhi product a possible alternative to the user's medicine?
 *
 * Compares, for the user's medicine and each candidate:
 *   - the complete set of active ingredients (all of them, no more, no fewer)
 *   - the strength of every ingredient (units converted, concentrations per 1 ml)
 *   - dosage form, route of administration
 *   - release type (immediate vs SR / ER / XR / XL / MR / CR / PR / DR never match each other)
 *   - salt form, when both products state it
 *
 * Result:
 *   verified_match    everything above matches exactly
 *   needs_review      close, with a difference a pharmacist should check (salt form, a related
 *                     dosage form, or a release type that is not stated)
 *   not_equivalent    a real mismatch
 *   insufficient_data a required field is missing
 *
 * Names alone never produce a match: products are compared on their parsed composition.
 */
import { sameStrength, formatStrength } from './strength.js';
import { UNIT_BASIS } from './pack.js';

export const STATUS = Object.freeze({
  VERIFIED: 'verified_match',
  REVIEW: 'needs_review',
  NOT_EQUIVALENT: 'not_equivalent',
  INSUFFICIENT: 'insufficient_data',
});

export const DISCLAIMER = 'Possible alternative only. Confirm with your doctor or pharmacist before switching medicines.';
export const ENGINE_VERSION = 'v2';

/** Forms close enough that a pharmacist could judge the difference (needs_review, not a match). */
const FORM_FAMILIES = [
  ['tablet', 'dispersible_tablet', 'mouth_dissolving_tablet', 'chewable_tablet'],
  ['syrup', 'suspension', 'oral_solution', 'oral_liquid', 'dry_syrup'],
  ['injection', 'injection_vial', 'injection_ampoule'],
];
const familyOf = (code) => FORM_FAMILIES.findIndex((f) => f.includes(code));

const FORM_NAMES = {
  tablet: 'tablet', dispersible_tablet: 'dispersible tablet', mouth_dissolving_tablet: 'mouth dissolving tablet',
  chewable_tablet: 'chewable tablet', capsule: 'capsule', syrup: 'syrup', suspension: 'suspension', dry_syrup: 'dry syrup',
  oral_solution: 'oral solution', oral_liquid: 'oral liquid', oral_drops: 'oral drops', injection: 'injection',
  injection_vial: 'injection (vial)', injection_ampoule: 'injection (ampoule)', cream: 'cream', ointment: 'ointment',
  gel: 'gel', lotion: 'lotion', eye_drops: 'eye drops', ear_drops: 'ear drops', inhaler: 'inhaler',
  dry_powder_inhaler: 'dry powder inhaler', inhalation_capsule: 'inhalation capsule', respules: 'respules',
  granules: 'granules', suppository: 'suppository', pessary: 'pessary', nasal_spray: 'nasal spray', enema: 'enema',
};
const RELEASE_NAMES = {
  ir: 'immediate release', sr: 'sustained release (SR)', er: 'extended release (ER)', xr: 'extended release (XR)',
  xl: 'extended release (XL)', mr: 'modified release (MR)', cr: 'controlled release (CR)', pr: 'prolonged release (PR)',
  dr: 'delayed release / enteric coated',
};
export const formName = (code) => FORM_NAMES[code] ?? code;
export const releaseName = (code) => RELEASE_NAMES[code] ?? code;
export const RELEASE_CODES = Object.freeze(Object.keys(RELEASE_NAMES));

/**
 * A liquid's strength means nothing without its volume: "120 mg" may be per 5 ml or per ml.
 * Percentages carry their volume already.
 */
export const lacksVolume = (strength, dosageForm) => UNIT_BASIS[dosageForm] === 'ml' && !!strength && !strength.perUnit && !strength.unit.startsWith('%');

/**
 * Compares the amount of one ingredient on both sides.
 *   both state the amount of the ingredient itself  -> compare those (equivalents are ignored)
 *   both state only an "eq. to" amount               -> compare the equivalents (same moiety, same amount)
 *   one states each                                  -> 'unclear' (a pharmacist must check)
 * @returns {'same'|'differs'|'unclear'|'missing'}
 */
function compareAmounts(a, b) {
  if (a.strength && b.strength) return sameStrength(a.strength, b.strength) ? 'same' : 'differs';
  const ea = a.equivalent?.strength;
  const eb = b.equivalent?.strength;
  if (!a.strength && !b.strength && ea && eb) return a.equivalent.key === b.equivalent.key && sameStrength(ea, eb) ? 'same' : 'differs';
  if ((a.strength || ea) && (b.strength || eb)) return 'unclear';
  return 'missing';
}

const amountText = (i) =>
  i.strength ? formatStrength(i.strength) : i.equivalent?.strength ? `equivalent to ${formatStrength(i.equivalent.strength)} ${i.equivalent.name ?? i.equivalent.key}` : 'not stated';

/**
 * @typedef {{name:string, ingredients:Array<{key:string, name:string, saltForm:string|null, strength:object|null,
 *            equivalent?:{key:string, strength:object}}>, dosageForm:string|null, route:string|null, releaseType:string|null}} MatchProduct
 * @param {MatchProduct} original the user's medicine
 * @param {MatchProduct} candidate a Jan Aushadhi product
 * @returns {{status:string, reasons:Array<{code:string, severity:'mismatch'|'missing'|'review', message:string}>}}
 */
export function compareProducts(original, candidate) {
  const reasons = [];
  const add = (severity, code, message) => reasons.push({ severity, code, message });
  const o = original;
  const c = candidate;

  // 1. Is everything we need known?
  if (!o.ingredients?.length) add('missing', 'composition_unknown', `The composition of ${o.name} is not known.`);
  if (!c.ingredients?.length) add('missing', 'composition_unknown', `The composition of ${c.name} could not be read.`);
  for (const [p, label] of [[o, o.name], [c, c.name]]) {
    for (const i of p.ingredients ?? []) {
      if (!i.strength && !i.equivalent?.strength) add('missing', 'strength_unknown', `The strength of ${i.name} is not stated for ${label}.`);
      else if (lacksVolume(i.strength, p.dosageForm)) add('missing', 'concentration_unknown', `The strength of ${i.name} per ml is not stated for ${label}.`);
    }
    if (!p.dosageForm) add('missing', 'form_unknown', `The dosage form of ${label} is not known.`);
    else if (!p.route) add('missing', 'route_unknown', `The route of ${label} is not known.`);
  }

  // 2. Same ingredients, no more and no fewer.
  if (o.ingredients?.length && c.ingredients?.length) {
    const oKeys = new Map(o.ingredients.map((i) => [i.key, i]));
    const cKeys = new Map(c.ingredients.map((i) => [i.key, i]));
    for (const [k, i] of oKeys) if (!cKeys.has(k)) add('mismatch', 'ingredient_missing', `${c.name} does not contain ${i.name}.`);
    for (const [k, i] of cKeys) if (!oKeys.has(k)) add('mismatch', 'ingredient_extra', `${c.name} also contains ${i.name}.`);

    // 3. Same strength of every ingredient; salt form when both state it.
    for (const [k, a] of oKeys) {
      const b = cKeys.get(k);
      if (!b) continue;
      const amounts = compareAmounts(a, b);
      if (amounts === 'differs') add('mismatch', 'strength_differs', `${a.name}: ${amountText(a)} vs ${amountText(b)}.`);
      if (amounts === 'unclear') add('review', 'strength_basis_differs', `${a.name}: ${amountText(a)} vs ${amountText(b)}; check they are the same amount.`);
      if (a.saltForm && b.saltForm && a.saltForm !== b.saltForm) {
        add('review', 'salt_form_differs', `${a.name}: ${a.saltForm} salt vs ${b.saltForm} salt.`);
      }
    }
  }

  // 4. Dosage form and route.
  if (o.dosageForm && c.dosageForm && o.dosageForm !== c.dosageForm) {
    const related = familyOf(o.dosageForm) >= 0 && familyOf(o.dosageForm) === familyOf(c.dosageForm);
    add(related ? 'review' : 'mismatch', 'form_differs', `Dosage form: ${formName(o.dosageForm)} vs ${formName(c.dosageForm)}.`);
  }
  if (o.route && c.route && o.route !== c.route) add('mismatch', 'route_differs', `Route: ${o.route} vs ${c.route}.`);

  // 5. Release type: modified-release types never match each other or immediate release.
  if (o.releaseType && c.releaseType && o.releaseType !== c.releaseType) {
    add('mismatch', 'release_differs', `Release type: ${releaseName(o.releaseType)} vs ${releaseName(c.releaseType)}.`);
  } else if (o.dosageForm && c.dosageForm && (!o.releaseType || !c.releaseType)) {
    const known = o.releaseType ? o : c.releaseType ? c : null;
    const unknown = !o.releaseType ? o : c;
    add(
      'review',
      'release_unknown',
      `The release type of ${unknown.name} is not recorded (check the strip for SR, ER, XR, MR or CR)` +
        (known ? `; ${known.name} is ${releaseName(known.releaseType)}.` : '.'),
    );
  }

  const has = (s) => reasons.some((r) => r.severity === s);
  const status = has('mismatch') ? STATUS.NOT_EQUIVALENT : has('missing') ? STATUS.INSUFFICIENT : has('review') ? STATUS.REVIEW : STATUS.VERIFIED;
  return { status, reasons };
}

const ORDER = [STATUS.VERIFIED, STATUS.REVIEW, STATUS.INSUFFICIENT, STATUS.NOT_EQUIVALENT];
export const statusRank = (s) => ORDER.indexOf(s);
