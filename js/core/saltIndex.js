/**
 * Active salt index: groups every product by its normalized salt composition,
 * so "all medicines with the same salt" is a single Map lookup.
 */
import { saltKey } from './normalize.js';

/**
 * @param {Array<{id:string, activeSalt:string}>} medicines
 * @returns {Map<string, Array<object>>}
 */
export function buildSaltIndex(medicines) {
  const index = new Map();
  for (const medicine of medicines) {
    const key = saltKey(medicine.activeSalt);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(medicine);
  }
  return index;
}

/**
 * Other brands that contain exactly the same salt(s) and strength.
 * @param {Map<string, Array<object>>} index
 * @param {{id:string, activeSalt:string}} medicine
 */
export function sameSaltBrands(index, medicine) {
  const group = index.get(saltKey(medicine.activeSalt)) || [];
  return group.filter((other) => other.id !== medicine.id);
}
