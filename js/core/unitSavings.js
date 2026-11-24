/**
 * Per-unit savings in INR (estimates).
 *
 *   original unit price    = MRP you entered / units in your pack
 *   alternative unit price = Jan Aushadhi MRP / units in its pack
 *   saving per unit        = original - alternative
 *   saving %               = saving per unit / original x 100   (rounded down, never over-promised)
 *
 * Only for verified matches whose units are the same (tablet vs tablet, ml vs ml).
 * Money is handled in paise; per-unit values may have fractions of a paisa and are
 * rounded only for display.
 */
import { toPaise } from './savings.js';

export const MRP_LIMITS = Object.freeze({ min: 0.01, max: 100000 });
export const COUNT_LIMITS = Object.freeze({ min: 0.001, max: 10000 });

/**
 * GST added to an NPPA ceiling price before comparing it with an MRP (MRPs include GST,
 * ceiling prices do not). Most medicines are taxed at 5% since 22 September 2025;
 * some are exempt. Check the rate for the medicine before relying on the warning.
 */
export const GST_RATE_FOR_CEILING_CHECK = 0.05;

const fail = (message) => ({ ok: false, message });

/** "32", "₹ 32.50", "1,250" -> number of rupees; validated. */
export function validateMrp(value) {
  const text = String(value ?? '').replace(/₹|rs\.?|,/gi, '').trim();
  if (!text) return fail('Enter the MRP printed on your strip or pack.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return fail('Enter the MRP as a number, like 32 or 32.50.');
  const n = Number(text);
  if (n < MRP_LIMITS.min) return fail('The MRP must be more than ₹0.');
  if (n > MRP_LIMITS.max) return fail('That MRP looks too large. Check the number on the pack.');
  return { ok: true, value: n };
}

/** Units in the pack (tablets, ml, ...). */
export function validatePackCount(value) {
  const text = String(value ?? '').trim();
  if (!text) return fail('Enter how many tablets (or ml) the pack contains.');
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return fail('Enter the pack size as a number, like 15.');
  const n = Number(text);
  if (n < COUNT_LIMITS.min) return fail('The pack size must be more than 0.');
  if (n > COUNT_LIMITS.max) return fail('That pack size looks too large.');
  return { ok: true, value: n };
}

/** Price of one unit, in (fractional) paise. */
export const perUnitPaise = (mrpRupees, count) => toPaise(mrpRupees) / count;

/**
 * @param {{status:string, original:{mrp:number, count:number, unit:string|null},
 *          alternative:{mrp:number|null, count:number|null, unit:string|null}}} input
 * @returns {{ok:false, reason:'not_verified'|'no_price'|'units_differ'} |
 *           {ok:true, unit:string, originalPerUnit:number, alternativePerUnit:number, savingPerUnit:number, savingPercent:number, cheaper:boolean}}
 */
export function compareUnitPrices({ status, original, alternative }) {
  if (status !== 'verified_match') return { ok: false, reason: 'not_verified' };
  if (!(alternative?.mrp > 0) || !(alternative.count > 0)) return { ok: false, reason: 'no_price' };
  if (!original?.unit || original.unit !== alternative.unit) return { ok: false, reason: 'units_differ' };
  const originalPerUnit = perUnitPaise(original.mrp, original.count);
  const alternativePerUnit = perUnitPaise(alternative.mrp, alternative.count);
  const savingPerUnit = originalPerUnit - alternativePerUnit;
  const cheaper = savingPerUnit > 0.0001;
  return {
    ok: true,
    unit: original.unit,
    originalPerUnit,
    alternativePerUnit,
    savingPerUnit: cheaper ? savingPerUnit : 0,
    savingPercent: cheaper ? Math.floor((savingPerUnit * 100) / originalPerUnit + 1e-9) : 0,
    cheaper,
  };
}

/** Saving for a number of units (e.g. packs per month x units per pack), in whole paise. */
export const savingForUnits = (savingPerUnit, units) => Math.round(savingPerUnit * units);

/**
 * Is the entered MRP above the NPPA ceiling (plus GST)? Only when the units match.
 * @param {{mrp:number, count:number, unit:string}} entered
 * @param {{ceilingPerUnit:number, unitCode:string}} ceiling
 */
export function ceilingCheck(entered, ceiling, gstRate = GST_RATE_FOR_CEILING_CHECK) {
  if (!ceiling || !entered?.unit || ceiling.unitCode !== entered.unit) return { applicable: false };
  const enteredPerUnit = perUnitPaise(entered.mrp, entered.count);
  const ceilingPerUnit = toPaise(ceiling.ceilingPerUnit);
  const ceilingWithGstPerUnit = ceilingPerUnit * (1 + gstRate);
  return { applicable: true, enteredPerUnit, ceilingPerUnit, ceilingWithGstPerUnit, above: enteredPerUnit > ceilingWithGstPerUnit + 0.5 };
}
