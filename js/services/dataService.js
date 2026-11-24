/**
 * Data status: which official lists are imported, when, and whether they are stale.
 * Loaded once at start-up from /api/status; search and prices come from catalogService.
 */
import { ok, fail, ERR } from '../core/errors.js';
import { apiGet } from './api.js';
import * as storage from './storage.js';

/** @type {{sources:object[], counts:object, officialDataImported:boolean}|null} */
let status = null;

/**
 * @param {{loadStatus?: () => Promise<object>}} [options] loadStatus is injectable for tests
 * @returns {Promise<{ok:true,data:object}|{ok:false,error:object}>}
 */
export async function loadDataStatus({ loadStatus = () => apiGet('status') } = {}) {
  try {
    const body = await loadStatus();
    if (!body || !Array.isArray(body.sources) || !body.counts) throw new Error('unexpected status format');
    status = body;
    return ok(status);
  } catch (error) {
    console.error('SaltSaver: could not load data status', error);
    status = null;
    return fail(ERR.DATA_LOAD, error.message);
  }
}

export const getDataStatus = () => status;

/** One source's status by id ('pmbi_product_list', 'nppa_ceiling_prices', ...). */
export const sourceInfo = (id) => status?.sources.find((s) => s.id === id) ?? null;

/** Clears every SaltSaver key on this device and reloads the data status. */
export async function resetApp(options) {
  storage.clearAll();
  return loadDataStatus(options);
}
