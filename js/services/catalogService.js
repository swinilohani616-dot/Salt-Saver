/**
 * Search (with comparisons), autocomplete and product look-ups through the API.
 * Only the newest search is kept: an older request still in flight is cancelled.
 */
import { apiGet } from './api.js';

let searchController = null;
let suggestController = null;

export async function searchCatalog(query) {
  searchController?.abort();
  searchController = new AbortController();
  return apiGet('search', { q: query }, { signal: searchController.signal });
}

export async function suggestNames(query) {
  suggestController?.abort();
  suggestController = new AbortController();
  const body = await apiGet('suggest', { q: query }, { signal: suggestController.signal });
  return body.suggestions ?? [];
}

/** Current details (and Jan Aushadhi MRP) for up to 50 products. */
export async function getProducts(ids) {
  if (!ids.length) return [];
  const body = await apiGet('products', { ids: ids.slice(0, 50).join(',') });
  return body.products ?? [];
}

export const isAbort = (error) => error?.name === 'AbortError';
