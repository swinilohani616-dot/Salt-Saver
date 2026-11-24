/**
 * App-wide constants and user-facing text.
 * Every message the user can see lives in MESSAGES so wording stays consistent
 * and can be translated later (see USER_WORKFLOW.md §6).
 */

export const SCHEMA_VERSION = 1;

/** Base path of the backend API (server/app.js). Every request reads SaltSaver's own database. */
export const API_BASE = './api';

export const STORAGE_PREFIX = 'saltsaver:v1:';
export const STORAGE_KEYS = Object.freeze({
  db: `${STORAGE_PREFIX}db`,
  // Change this name whenever the shape of a basket line changes. A page still open from the previous
  // version shares this browser's storage, and would erase lines it does not understand.
  basket: `${STORAGE_PREFIX}basket4`,
  previousBaskets: [`${STORAGE_PREFIX}basket3`, `${STORAGE_PREFIX}basket2`], // newest first; read once, until the basket is first saved under the new name
  role: `${STORAGE_PREFIX}role`,
  prefs: `${STORAGE_PREFIX}prefs`,
});

export const SEARCH = Object.freeze({ minChars: 2, debounceMs: 250, maxResults: 20 });
export const QTY = Object.freeze({ min: 1, max: 999 });
export const FONT_SCALES = Object.freeze([1, 1.25, 1.5]);
export const DEFAULT_PREFS = Object.freeze({ fontScale: 1, highContrast: false });
export const EXAMPLE_QUERIES = Object.freeze(['Crocin', 'Paracetamol', 'Metformin', 'Amlodipine', 'Telma']);
export const SUGGEST = Object.freeze({ debounceMs: 200 });

export const MESSAGES = Object.freeze({
  NOT_FOUND: 'No brand found. Try searching by active salt name.',
  TOO_SHORT: 'Type at least 2 letters to search.',
  QTY_MIN: 'Quantity must be at least 1.',
  QTY_MAX: `Quantity can be at most ${QTY.max}.`,
  QTY_WHOLE: 'Quantity must be a whole number.',
  DISCLAIMER: 'Generics contain identical WHO-approved active chemical salts.', // PRD BR-02, word for word
  SAFETY_NOTE: 'Possible alternative only. Confirm with your doctor or pharmacist before switching medicines.',
  CONSULT: 'Consult your doctor or pharmacist before switching medicines.',
  BASKET_PURPOSE: 'This basket is for comparing prices and talking to your doctor or pharmacist. It does not order medicines or switch them for you.',
  PRICE_NOTE:
    'Monthly savings are estimates: the price of your branded medicine minus the price of the same amount of the generic, for the packs you use each month. Please confirm the price at your Jan Aushadhi Kendra.',
  CEILING_ABOVE: 'Price entered is above the NPPA ceiling — check the pack or report via the Pharma Sahi Daam app.',
  OFFLINE: 'Could not reach SaltSaver. Check your internet connection and try again.',
  SERVER_ERROR: 'SaltSaver could not answer just now. Please try again in a minute.',
  RATE_LIMITED: 'Too many searches in a short time. Please wait a minute and try again.',
  NO_JA_DATA: 'We are adding Jan Aushadhi prices. Generic options will show here soon.',
  STALE: (name, date) => `Prices from the ${name} were last checked on ${date}, so they may have changed. Please confirm at the shop.`,
  EMPTY_BASKET: 'Your prescription basket is empty. Search a medicine and tap "Add to Comparison Basket" to see your monthly savings.',
  STORAGE_FULL:
    'Storage is full or blocked. Your prescription basket is kept only until you close this tab. Print it to keep a copy.',
  DATA_LOAD_FAIL: 'Could not load medicine data. Please refresh the page.',
  FORBIDDEN: 'Pharmacy Buyers can search, compare and print, but cannot save a prescription basket.',
  CANNOT_COMPARE: 'The strength, form, release type or pack size is not fully listed, so a saving cannot be worked out safely.',
  UNKNOWN_MEDICINE: 'This medicine is not in SaltSaver yet.',
  NOT_IN_BASKET: 'This medicine is not in your prescription basket.',
  RESET_DONE: 'The SaltSaver demo has been reset on this device.',
  ROLE_DEFAULT: 'Role set to Patient / Senior. You can change it anytime from the top bar.',
  added: (name) => `${name} added to your comparison basket.`,
  removed: (name) => `${name} removed from your comparison basket.`,
  roleChanged: (label) => `Role changed to ${label}.`,
  TRUNCATED: 'There are more results. Add a strength, like "500 mg", to narrow the list.',
  similar: (q) => `No exact match for "${q}". These names are similar; check that this is your medicine.`,
  notShown: (n) =>
    `${n} other Jan Aushadhi ${n === 1 ? 'product has' : 'products have'} the same salt but a different strength, form or release type, so ${n === 1 ? 'it is' : 'they are'} not shown as ${n === 1 ? 'an option' : 'options'}.`,
  resultsCount: (body, q) => {
    const brands = body.groups.reduce((n, g) => n + g.brands.length, 0) + body.other.filter((p) => !p.isJanAushadhi).length;
    const generics = body.groups.reduce((n, g) => n + g.generics.length, 0) + body.other.filter((p) => p.isJanAushadhi).length;
    return `"${q}": ${brands} branded ${brands === 1 ? 'medicine' : 'medicines'} and ${generics} generic ${generics === 1 ? 'option' : 'options'}.`;
  },
});
