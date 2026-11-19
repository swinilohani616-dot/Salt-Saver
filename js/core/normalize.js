/**
 * Text normalization for search and salt matching. Pure functions.
 */

const UNIT_PATTERN = /(\d)\s*(mg|mcg|g|ml|iu)\b/g;

/**
 * "  Crocin-500 MG " -> "crocin 500mg"
 * lowercase, punctuation to spaces (keeps "+" and "."), joins number + unit,
 * normalizes spacing around "+", collapses whitespace.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+.\s]/g, ' ')
    .replace(UNIT_PATTERN, '$1$2')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Order-independent key for an active salt composition.
 * "Telmisartan 40mg + Hydrochlorothiazide 12.5mg"
 *   -> "hydrochlorothiazide 12.5mg + telmisartan 40mg"
 * @param {string} activeSalt
 * @returns {string}
 */
export function saltKey(activeSalt) {
  return normalizeText(activeSalt)
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join(' + ');
}
