/**
 * Formulation key: two products with the same key are the same formulation, so their
 * prices can be compared per unit. It covers every salt, its salt form and strength, the
 * dosage form, the route and the release type. If any of these is unknown there is no key,
 * and no saving is ever worked out.
 */
import { compositionKey } from './composition.js';
import { lacksVolume } from './match.js';

/**
 * @param {{ingredients:Array<{key:string, saltForm?:string|null, strength:object|null}>, dosageForm:string|null,
 *          route:string|null, releaseType:string|null}} product as loaded by db/matching.js
 * @returns {string|null}
 */
export function formulationKey(product) {
  const { ingredients, dosageForm, route, releaseType } = product ?? {};
  if (!ingredients?.length || !dosageForm || !route || !releaseType) return null;
  if (ingredients.some((i) => !i.strength || lacksVolume(i.strength, dosageForm))) return null;
  const composition = compositionKey(ingredients);
  if (!composition) return null;
  const saltForms = ingredients.map((i) => `${i.key}=${i.saltForm ?? '-'}`).sort().join(', ');
  return [composition, saltForms, dosageForm, route, releaseType].join(' | ');
}
