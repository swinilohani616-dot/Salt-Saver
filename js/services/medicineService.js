/**
 * searchMedicine(query) — PRD §9.
 */
import { SEARCH, MESSAGES } from '../config.js';
import { ERR, ok, fail } from '../core/errors.js';
import { normalizeText } from '../core/normalize.js';
import { searchMedicines } from '../core/search.js';
import { sameSaltBrands } from '../core/saltIndex.js';
import { getDb } from './dataService.js';

/**
 * @param {string} query
 * @returns {{ok:true,data:Array<{medicine:object, sameSalt:object[]}>}|{ok:false,error:object}}
 */
export function searchMedicine(query) {
  const db = getDb();
  if (!db) return fail(ERR.DATA_LOAD, MESSAGES.DATA_LOAD_FAIL);
  if (normalizeText(query).length < SEARCH.minChars) return fail(ERR.VALIDATION, MESSAGES.TOO_SHORT);

  const results = searchMedicines(query, db.medicines, SEARCH);
  if (results.length === 0) return fail(ERR.NOT_FOUND, MESSAGES.NOT_FOUND);

  return ok(results.map((medicine) => ({ medicine, sameSalt: sameSaltBrands(db.saltIndex, medicine) })));
}

export function getMedicine(id) {
  return getDb()?.byId.get(id) || null;
}
