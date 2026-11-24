/**
 * Prices you typed from your own packs, so search results can show what you could save:
 *   references  one per formulation, typed on a generic
 *   entered     one per brand: MRP and pack, the release type read on its strip, or both
 * Kept in this browser tab only and never sent to the server.
 */
import { STORAGE_PREFIX } from '../config.js';
import { RELEASE_CODES } from '../../lib/pharma/match.js';

const KEYS = { references: `${STORAGE_PREFIX}references`, entered: `${STORAGE_PREFIX}enteredPrices` };
let memory = { references: {}, entered: {} }; // used when sessionStorage is missing or blocked

const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isReference = (r) => !!r && isPositive(r.mrp) && isPositive(r.count) && typeof r.unit === 'string' && r.unit !== '';
const isStripOnly = (r) => !!r && r.mrp === undefined && RELEASE_CODES.includes(r.release);
const isValid = (kind, r) => isReference(r) || (kind === 'entered' && isStripOnly(r));

/** Only the fields we know, so nothing else from storage reaches the page. */
function clean(kind, r) {
  const price = isReference(r) ? { mrp: r.mrp, count: r.count, unit: r.unit } : {};
  return kind === 'entered' ? { ...price, release: RELEASE_CODES.includes(r.release) ? r.release : '' } : price;
}

function read(kind) {
  let stored = memory[kind];
  try {
    stored = JSON.parse(sessionStorage.getItem(KEYS[kind]) ?? 'null') ?? memory[kind];
  } catch {
    /* blocked or malformed: use memory */
  }
  return Object.fromEntries(Object.entries(stored).filter(([key, r]) => key && isValid(kind, r)).map(([key, r]) => [key, clean(kind, r)]));
}

function write(kind, next) {
  memory[kind] = next;
  try {
    sessionStorage.setItem(KEYS[kind], JSON.stringify(next));
  } catch {
    /* blocked: kept in memory */
  }
}

/** @returns {Record<string, {mrp:number, count:number, unit:string}>} by formulation key; stored values are re-checked */
export const getReferences = () => read('references');

/** @returns {Record<string, {mrp?:number, count?:number, unit?:string, release:string}>} by brand id; stored values are re-checked */
export const getEntered = () => read('entered');

function save(kind, key, value) {
  if (!key || (value !== null && !isValid(kind, value))) return false;
  const next = read(kind);
  if (value === null) delete next[key];
  else next[key] = clean(kind, value);
  write(kind, next);
  return true;
}

/** Saves, or with null removes, the price for a formulation. @returns {boolean} whether it was accepted */
export const saveReference = (formulationKey, reference) => save('references', formulationKey, reference);

/** Saves, or with null removes, the price for a brand. @returns {boolean} whether it was accepted */
export const saveEntered = (productId, entered) => save('entered', productId, entered);

export function clearReferences() {
  memory = { references: {}, entered: {} };
  try {
    for (const key of Object.values(KEYS)) sessionStorage.removeItem(key);
  } catch {
    /* blocked */
  }
}
