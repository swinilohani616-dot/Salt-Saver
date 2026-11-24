/**
 * Pack size -> number of comparable units, so prices can be compared per unit.
 *   "10's" -> 10 tablet     "Strip of 15 tablets" -> 15 tablet    "10 x 10" -> 100 tablet
 *   "30 ml bottle" -> 30 ml "15 gm" -> 15 g    "1 Vial" -> 1 vial    "200 MDI" -> 200 dose
 * The unit depends on the dosage form (tablets per tablet, syrups per ml, creams
 * per g, injections per vial/ampoule, inhalers per dose).
 */
import { prepText } from './text.js';

/** Unit used for per-unit prices, by dosage form code. */
export const UNIT_BASIS = Object.freeze({
  tablet: 'tablet', dispersible_tablet: 'tablet', mouth_dissolving_tablet: 'tablet', chewable_tablet: 'tablet',
  capsule: 'capsule', inhalation_capsule: 'capsule',
  syrup: 'ml', suspension: 'ml', dry_syrup: 'ml', oral_solution: 'ml', oral_drops: 'ml', eye_drops: 'ml', ear_drops: 'ml', lotion: 'ml',
  cream: 'g', ointment: 'g', gel: 'g',
  injection_vial: 'vial', injection_ampoule: 'ampoule', injection: 'container',
  inhaler: 'dose', respules: 'respule', granules: 'sachet', oral_liquid: 'ml', suppository: 'suppository', enema: 'container',
  pessary: 'pessary', dry_powder_inhaler: 'dose', nasal_spray: 'dose',
});

const NAMED = [
  ['tablet', /(\d+(?:\.\d+)?)\s*(?:tablets?|tabs?)\b/],
  ['capsule', /(\d+(?:\.\d+)?)\s*(?:rotacaps?|capsules?|caps?)\b/],
  ['vial', /(\d+(?:\.\d+)?)\s*vials?\b/],
  ['ampoule', /(\d+(?:\.\d+)?)\s*(?:ampoules?|ampules?|amps?)\b/],
  ['respule', /(\d+(?:\.\d+)?)\s*respules?\b/],
  ['dose', /(\d+(?:\.\d+)?)\s*(?:metered doses?|doses?|mdi|md|actuations?|puffs?)\b/],
  ['sachet', /(\d+(?:\.\d+)?)\s*sachets?\b/],
];
const VOLUME = /(\d+(?:\.\d+)?)\s*(ml|l)\b/;
const MASS = /(\d+(?:\.\d+)?)\s*(gms|gm|grams?|g)\b/;
const MULTIPLY = /(\d+)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/;
const APOSTROPHE_S = /(\d+)\s*(?:s|nos?)\b/; // "10's" becomes "10 s" after prepText

const round = (n) => Math.round(n * 1000) / 1000;

function named(t, unit) {
  const rule = NAMED.find(([u]) => u === unit);
  const m = rule && rule[1].exec(t);
  return m ? Number(m[1]) : null;
}

function multiplied(t) {
  const m = MULTIPLY.exec(t);
  if (!m) return null;
  return [m[1], m[2], m[3]].filter(Boolean).reduce((a, b) => a * Number(b), 1);
}

/**
 * @param {string} label pack size as written ("10's", "30 ml", "1 Vial & WFI")
 * @param {string|null} dosageFormCode
 * @returns {{count:number|null, unit:string|null, error:string|null}}
 */
export function parsePack(label, dosageFormCode = null) {
  const t = prepText(label);
  if (!t) return { count: null, unit: null, error: 'pack size is empty' };
  const basis = UNIT_BASIS[dosageFormCode] ?? null;
  const ok = (count, unit) => (count > 0 ? { count: round(count), unit, error: null } : { count: null, unit: null, error: `cannot read a unit count from "${label}"` });

  if (basis === 'tablet' || basis === 'capsule') {
    const mult = MULTIPLY.exec(t);
    if (mult && /^\s*(?:tablets?|tabs?|capsules?|caps?|rotacaps?|s\b|$)/.test(t.slice(mult.index + mult[0].length))) return ok(multiplied(t), basis);
    const n = named(t, basis) ?? named(t, basis === 'tablet' ? 'capsule' : 'tablet');
    if (n !== null) return ok(n, basis);
    const s = APOSTROPHE_S.exec(t);
    if (s) return ok(Number(s[1]), basis);
    if (mult) return ok(multiplied(t), basis);
    if (/^\d+$/.test(t)) return ok(Number(t), basis);
    return ok(0, basis);
  }

  if (basis === 'ml') {
    const m = VOLUME.exec(t);
    if (!m) return ok(0, basis);
    const ml = Number(m[1]) * (m[2] === 'l' ? 1000 : 1);
    const mult = MULTIPLY.exec(t);
    return ok(mult && mult.index < m.index ? Number(mult[1]) * ml : ml, 'ml');
  }

  if (basis === 'g') {
    const m = MASS.exec(t);
    return ok(m ? Number(m[1]) : 0, 'g');
  }

  if (basis === 'vial' || basis === 'ampoule' || basis === 'container') {
    for (const unit of ['vial', 'ampoule']) {
      const n = named(t, unit);
      if (n !== null) return ok(n, unit);
      if (new RegExp(`\\b${unit === 'vial' ? 'vials?' : '(?:ampoules?|ampules?|amps?)'}\\b`).test(t)) return ok(1, unit);
    }
    if (basis !== 'container' && (VOLUME.test(t) || MASS.test(t))) return ok(1, basis); // "10 ml" injection = one container
    return ok(0, basis);
  }

  if (basis === 'dose' || basis === 'respule' || basis === 'sachet') {
    const n = named(t, basis);
    if (n !== null) return ok(n, basis);
    if (basis === 'respule') {
      const mult = MULTIPLY.exec(t);
      if (mult) return ok(Number(mult[1]), 'respule');
    }
    return ok(0, basis);
  }

  // Unknown dosage form: accept only a pack label that names its own unit.
  for (const [unit] of NAMED) {
    const n = named(t, unit);
    if (n !== null) return ok(n, unit);
  }
  const vol = VOLUME.exec(t);
  if (vol) return ok(Number(vol[1]) * (vol[2] === 'l' ? 1000 : 1), 'ml');
  const mass = MASS.exec(t);
  if (mass) return ok(Number(mass[1]), 'g');
  return { count: null, unit: null, error: `cannot tell what unit "${label}" counts without a dosage form` };
}

/** Price per unit, rounded to 4 decimals; null when the count is unknown. */
export function unitPrice(price, count) {
  if (!(price >= 0) || !(count > 0)) return null;
  return Math.round((price / count) * 10_000) / 10_000;
}
