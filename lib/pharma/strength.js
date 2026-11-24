/**
 * Strength parsing and comparison.
 *   "650mg" "650 mg" "1 gm" "100 mcg/dose" "250mg/5ml" "250 mg per 5 ml" "1% w/w" "60000 IU"
 * Strengths are compared after converting mass to mg and concentrations to "per 1 unit".
 */
import { prepText } from './text.js';

const UNIT = {
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  mcg: 'mcg', ug: 'mcg', microgram: 'mcg', micrograms: 'mcg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  iu: 'iu', unit: 'iu', units: 'iu',
};
const PER_UNIT = {
  ml: 'ml', l: 'l', g: 'g', gm: 'g', dose: 'dose', puff: 'dose', actuation: 'dose', spray: 'dose', md: 'dose',
  tablet: 'tablet', tab: 'tablet', capsule: 'capsule', cap: 'capsule', drop: 'drop', vial: 'vial', ampoule: 'ampoule', sachet: 'sachet',
};
const MASS_TO_MG = { mg: 1, mcg: 0.001, g: 1000 };
const VOLUME_TO_ML = { ml: 1, l: 1000 };

const NUM = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const UNIT_RE = String.raw`(milligrams?|micrograms?|mcg|ug|mg|grams?|gms|gm|g|iu|units?|%\s*w\s*/\s*w|%\s*w\s*/\s*v|%\s*v\s*/\s*v|%)`;
const PER_RE = String.raw`(?:\s*(?:/|per)\s*(\d+(?:\.\d+)?)?\s*(ml|l|gm|g|dose|puff|actuation|spray|md|tablet|tab|capsule|cap|drop|vial|ampoule|sachet)s?(?![a-z]))?`;

/** Matches one strength inside prepped text. Not preceded by a letter/digit ("d3" is not "3"). */
export const STRENGTH_PATTERN = String.raw`(?<![a-z\d.])${NUM}\s*${UNIT_RE}(?![a-z])${PER_RE}`;

function unitOf(raw) {
  const u = raw.replace(/\s+/g, '');
  if (u.startsWith('%')) return u === '%' ? '%' : u; // '%w/w', '%w/v', '%v/v'
  return UNIT[u] ?? null;
}

function build(match) {
  const [, value, unitRaw, perValue, perRaw] = match;
  const unit = unitOf(unitRaw);
  if (!unit) return null;
  const strength = { value: Number(value), unit, perValue: null, perUnit: null, text: match[0].trim() };
  if (perRaw) {
    strength.perUnit = PER_UNIT[perRaw] ?? null;
    strength.perValue = perValue ? Number(perValue) : 1;
    if (!strength.perUnit) return null;
  }
  if (!(strength.value > 0) || (strength.perValue !== null && !(strength.perValue > 0))) return null;
  return strength;
}

/**
 * All strengths in a text, in order, with their positions in the prepped text.
 * @returns {Array<{value:number, unit:string, perValue:number|null, perUnit:string|null, text:string, index:number, length:number}>}
 */
export function findStrengths(preppedText) {
  const out = [];
  for (const match of preppedText.matchAll(new RegExp(STRENGTH_PATTERN, 'g'))) {
    const s = build(match);
    if (s) out.push({ ...s, index: match.index, length: match[0].length });
  }
  return out;
}

/** "650 mg" -> {value:650, unit:'mg', perValue:null, perUnit:null}; null if it is not exactly one strength. */
export function parseStrength(text) {
  const t = prepText(text);
  const found = findStrengths(t);
  if (found.length !== 1 || found[0].text !== t) return null;
  const { value, unit, perValue, perUnit } = found[0];
  return { value, unit, perValue, perUnit };
}

/** "500 mg + 125 mg" -> [{...500 mg}, {...125 mg}] */
export function parseStrengthList(text) {
  return findStrengths(prepText(text)).map(({ value, unit, perValue, perUnit }) => ({ value, unit, perValue, perUnit }));
}

/**
 * Converts to a comparable form: mass in mg, per-volume in ml, everything per 1 unit.
 * "250 mg/5 ml" -> {amount: 50, unit: 'mg', per: 'ml'}
 */
export function canonicalStrength(s) {
  if (!s) return null;
  let amount = s.value;
  let unit = s.unit;
  if (MASS_TO_MG[unit] !== undefined) {
    amount *= MASS_TO_MG[unit];
    unit = 'mg';
  }
  let per = null;
  if (s.perUnit) {
    let perValue = s.perValue ?? 1;
    per = s.perUnit;
    if (VOLUME_TO_ML[per] !== undefined) {
      perValue *= VOLUME_TO_ML[per];
      per = 'ml';
    }
    amount /= perValue;
  }
  return { amount: Math.round(amount * 1e6) / 1e6, unit, per };
}

/** True when two strengths are the same amount of the same thing. */
export function sameStrength(a, b) {
  const x = canonicalStrength(a);
  const y = canonicalStrength(b);
  if (!x || !y) return false;
  return x.unit === y.unit && x.per === y.per && Math.abs(x.amount - y.amount) <= 1e-6 * Math.max(1, x.amount);
}

/** {value:250, unit:'mg', perValue:5, perUnit:'ml'} -> "250 mg/5 ml" */
export function formatStrength(s) {
  if (!s) return '';
  const main = s.unit.startsWith('%')
    ? `${s.value}%${s.unit.length > 1 ? ` ${s.unit.slice(1)}` : ''}` // "1% w/w"
    : `${s.value} ${s.unit === 'iu' ? 'IU' : s.unit}`;
  if (!s.perUnit) return main;
  return s.perValue && s.perValue !== 1 ? `${main}/${s.perValue} ${s.perUnit}` : `${main}/${s.perUnit}`;
}
