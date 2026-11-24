/**
 * Monthly totals for the basket (FR-03, BR-01), as estimates.
 *
 * Each line is a Jan Aushadhi medicine and the price it is compared with (the reference: the
 * verified MRP of a brand, or the MRP and pack size entered by you). Per month:
 *   your cost        = your MRP x packs per month
 *   Jan Aushadhi     = Jan Aushadhi price per unit x units per month
 *   saving           = your cost - Jan Aushadhi cost (never below 0)
 * where units per month = packs per month x units in your pack.
 *
 * A line without a reference price is kept out of all three totals, so the totals always
 * compare like with like; its cost is reported separately (`uncompared`).
 */
import { toPaise } from './savings.js';
import { compareUnitPrices } from './unitSavings.js';
import { hasReference } from './validate.js';

/** Was the reference price of this line typed by the user? (Lines saved before this was recorded all were.) */
export const isUserPrice = (item) => hasReference(item) && (!item.referenceSource || item.referenceSource === 'user_entered');

/**
 * The reference price of a line: what you typed, or the brand's verified MRP, refreshed when the server has a newer one.
 * @param {Map<string, {mrp:number, count:number, unit:string, asOf:string}>} [liveReferences] by brand id
 */
export function lineReference(item, liveReferences = new Map()) {
  if (!hasReference(item)) return null;
  const now = isUserPrice(item) ? null : liveReferences.get(item.productId);
  if (now && now.unit === item.unit) return { ...now, source: item.referenceSource };
  return { mrp: item.enteredMrp, count: item.enteredCount, unit: item.unit, source: item.referenceSource || 'user_entered', asOf: item.referenceAsOf ?? '' };
}

/**
 * @param {Array<object>} items basket items (see validate.js isValidBasketItem)
 * @param {Map<string, {mrp:number, count:number, unit:string}|null>} [live] current Jan Aushadhi prices by alternative id
 * @param {Map<string, {mrp:number, count:number, unit:string, asOf:string}>} [liveReferences] current verified brand prices by brand id
 */
export function basketTotals(items, live = new Map(), liveReferences = new Map()) {
  const lines = [];
  let totalOriginal = 0;
  let totalAlternative = 0;
  let totalSaving = 0;
  let compared = 0;
  const uncompared = { count: 0, cost: 0 };
  for (const item of items) {
    const current = live.has(item.alternativeId) ? live.get(item.alternativeId) : undefined;
    const alt = current ?? item.alternativePrice;
    const priceChanged = !!current && (current.mrp !== item.alternativePrice.mrp || current.count !== item.alternativePrice.count);
    if (!hasReference(item)) {
      // No reference price: packs per month counts Jan Aushadhi packs.
      const cost = toPaise(alt.mrp) * item.packsPerMonth;
      uncompared.count += 1;
      uncompared.cost += cost;
      lines.push({ item, reference: null, units: null, original: null, alternative: cost, saving: 0, percent: 0, priceChanged, noLongerListed: current === null, comparable: false, alternativePrice: alt });
      continue;
    }
    const reference = lineReference(item, liveReferences);
    const units = item.packsPerMonth * reference.count;
    const comparison = compareUnitPrices({ status: 'verified_match', original: reference, alternative: alt ?? {} });
    const original = toPaise(reference.mrp) * item.packsPerMonth;
    const line = { item, reference, units, original, alternative: null, saving: 0, percent: 0, priceChanged, noLongerListed: current === null, comparable: comparison.ok };
    if (comparison.ok) {
      compared += 1;
      line.alternative = Math.round(comparison.alternativePerUnit * units);
      line.saving = Math.max(0, original - line.alternative);
      line.percent = comparison.savingPercent;
      line.alternativePrice = alt;
      totalOriginal += original;
      totalAlternative += line.alternative;
      totalSaving += line.saving;
    }
    lines.push(line);
  }
  const overallPercent = totalOriginal > 0 ? Math.floor((totalSaving * 100) / totalOriginal) : 0;
  return { lines, totalOriginal, totalAlternative, totalSaving, overallPercent, yearlySaving: totalSaving * 12, compared, uncompared };
}
