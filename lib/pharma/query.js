/**
 * Reads what a person typed into the search box: the name (a brand or one or more salts),
 * strengths, a dosage form and a release type, so each can be matched on its own.
 *   "Crocin 500mg"        -> crocin, 500 mg
 *   "paracetamol 650"     -> paracetamol, 650
 *   "metformin SR tablet" -> metformin, sr, tablet
 */
import { normalizeText } from '../../js/core/normalize.js';

const STRENGTH = /^(\d+(?:\.\d+)?)(mg|mcg|g|iu)?$/;
const VOLUME = /^\d+(?:\.\d+)?ml$/; // "60ml" is a pack size, not a strength
const RELEASE = new Set(['sr', 'er', 'xr', 'xl', 'mr', 'cr', 'pr', 'dr']);
const NOISE = new Set(['ip', 'bp', 'usp', 'of', 'strip', 'medicine', 'price', 'generic']);

const LIQUIDS = ['syrup', 'suspension', 'dry_syrup', 'oral_solution', 'oral_liquid'];
const FORM_WORDS = new Map(Object.entries({
  tablet: ['tablet'], tablets: ['tablet'], tab: ['tablet'], tabs: ['tablet'],
  capsule: ['capsule'], capsules: ['capsule'], cap: ['capsule'], caps: ['capsule'],
  syrup: LIQUIDS, suspension: LIQUIDS,
  drops: ['oral_drops', 'eye_drops', 'ear_drops'],
  injection: ['injection', 'injection_vial', 'injection_ampoule'],
  cream: ['cream'], ointment: ['ointment'], gel: ['gel'], lotion: ['lotion'], inhaler: ['inhaler', 'dry_powder_inhaler'],
}));

/**
 * @param {string} raw
 * @returns {{text:string, words:string[], phrases:string[], strengths:Array<{value:number, unit:string|null}>,
 *            forms:string[], release:string|null}}
 *          words: name words, in order; phrases: the same words, one entry per salt of a combination
 */
export function parseQuery(raw) {
  const text = normalizeText(raw);
  const split = normalizeText(String(raw ?? '').replace(/[,&/]|\band\b/gi, ' + ').replace(/(\d)\s*(?:gms?|grams?)\b/gi, '$1g'));
  const out = { text, words: [], phrases: [], strengths: [], forms: [], release: null };
  let phrase = [];
  const endPhrase = () => {
    if (phrase.length) out.phrases.push(phrase.join(' '));
    phrase = [];
  };
  for (const token of split.split(' ')) {
    if (!token || NOISE.has(token) || VOLUME.test(token)) continue;
    const strength = STRENGTH.exec(token);
    if (token === '+') endPhrase();
    else if (strength) out.strengths.push({ value: Number(strength[1]), unit: strength[2] ?? null });
    else if (RELEASE.has(token)) out.release = token;
    else if (FORM_WORDS.has(token)) out.forms.push(...FORM_WORDS.get(token));
    else {
      out.words.push(token);
      phrase.push(token);
    }
  }
  endPhrase();
  out.forms = [...new Set(out.forms)];
  // Only a number or a form was typed ("650", "gel"): search names for the text as it is.
  if (!out.words.length && text) return { ...out, words: text.split(' ').filter((w) => w !== '+'), strengths: [], forms: [], release: null };
  return out;
}

/** Amounts a typed strength can stand for, in whatever unit a product states it: 1 g is also 1000 mg. */
export function strengthValues({ value, unit }) {
  if (unit === 'g') return [value, value * 1000];
  if (unit === 'mg') return value >= 1000 ? [value, value / 1000] : [value];
  return [value];
}
