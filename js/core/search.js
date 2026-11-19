/**
 * Search engine (FR-01, BR-03): matches brand names, active salts and generic names.
 */
import { normalizeText } from './normalize.js';

export const SCORE = Object.freeze({
  BRAND_EXACT: 100,
  BRAND_PREFIX: 80,
  SALT_PREFIX: 60,
  CONTAINS: 40,
  ALL_WORDS: 20,
});

/**
 * @param {string} q normalized query
 * @param {{brandName:string, activeSalt:string, genericName:string}} medicine
 * @returns {number} 0 when there is no match
 */
export function scoreMedicine(q, medicine) {
  if (!q) return 0;
  const brand = normalizeText(medicine.brandName);
  const salt = normalizeText(medicine.activeSalt);
  const generic = normalizeText(medicine.genericName);

  if (brand === q) return SCORE.BRAND_EXACT;
  if (brand.startsWith(q)) return SCORE.BRAND_PREFIX;
  if (salt.split(' + ').some((part) => part.startsWith(q))) return SCORE.SALT_PREFIX;
  if (brand.includes(q) || salt.includes(q) || generic.includes(q)) return SCORE.CONTAINS;

  const haystack = `${brand} ${salt} ${generic}`;
  const words = q.split(' ').filter((w) => w && w !== '+');
  if (words.length > 1 && words.every((w) => haystack.includes(w))) return SCORE.ALL_WORDS;
  return 0;
}

/**
 * @param {string} query raw user input
 * @param {Array<object>} medicines
 * @param {{minChars?:number, maxResults?:number}} [options]
 * @returns {Array<object>} medicines ranked best match first
 */
export function searchMedicines(query, medicines, { minChars = 2, maxResults = 20 } = {}) {
  const q = normalizeText(query);
  if (q.length < minChars) return [];
  return medicines
    .map((medicine) => ({ medicine, score: scoreMedicine(q, medicine) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.medicine.brandName.localeCompare(b.medicine.brandName))
    .slice(0, maxResults)
    .map((r) => r.medicine);
}
