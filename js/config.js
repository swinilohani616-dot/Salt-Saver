/**
 * App-wide constants and user-facing text.
 * Every message the user can see lives in MESSAGES so wording stays consistent
 * and can be translated later (see USER_WORKFLOW.md §6).
 */

export const SCHEMA_VERSION = 1;

export const DATA_URL = './data/sample-data.json';

export const STORAGE_PREFIX = 'saltsaver:v1:';
export const STORAGE_KEYS = Object.freeze({
  db: `${STORAGE_PREFIX}db`,
  basket: `${STORAGE_PREFIX}basket`,
  role: `${STORAGE_PREFIX}role`,
  prefs: `${STORAGE_PREFIX}prefs`,
});

export const SEARCH = Object.freeze({ minChars: 2, debounceMs: 250, maxResults: 20 });
export const QTY = Object.freeze({ min: 1, max: 999 });
export const FONT_SCALES = Object.freeze([1, 1.25, 1.5]);
export const DEFAULT_PREFS = Object.freeze({ fontScale: 1, highContrast: false });
export const EXAMPLE_QUERIES = Object.freeze(['Crocin', 'Paracetamol', 'Metformin', 'Amlodipine', 'Telma']);

export const MESSAGES = Object.freeze({
  NOT_FOUND: 'No brand found. Try searching by active salt name.',
  TOO_SHORT: 'Type at least 2 letters to search.',
  QTY_MIN: 'Quantity must be at least 1.',
  QTY_MAX: `Quantity can be at most ${QTY.max}.`,
  QTY_WHOLE: 'Quantity must be a whole number.',
  DISCLAIMER: 'Generics contain identical WHO-approved active chemical salts.',
  PRICE_NOTE:
    'Prices are indicative demo values. Confirm prices at your Jan Aushadhi Kendra and consult your doctor before switching medicines.',
  EMPTY_BASKET: 'Your basket is empty. Search a medicine and tap "Add to basket" to see your monthly savings.',
  STORAGE_FULL:
    'Storage is full or blocked. Your basket will be kept until you close this tab. Print it to keep a copy.',
  DATA_LOAD_FAIL: 'Could not load medicine data. Please refresh the page.',
  FORBIDDEN: 'Pharmacy buyers can compare prices but cannot save a basket.',
  UNKNOWN_MEDICINE: 'This medicine is not in the database.',
  NOT_IN_BASKET: 'This medicine is not in your basket.',
  RESET_DONE: 'Demo data has been reset.',
  ROLE_DEFAULT: 'Role set to Patient. You can change it anytime from the top bar.',
  added: (brand, total) => `${brand} added. Your basket now has ${total} ${total === 1 ? 'pack' : 'packs'} per month.`,
  removed: (brand) => `${brand} removed from your basket.`,
  roleChanged: (label) => `Role changed to ${label}.`,
  resultsCount: (n, q) => `${n} ${n === 1 ? 'medicine' : 'medicines'} found for "${q}".`,
});
