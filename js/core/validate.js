/**
 * Input and data validation (PRD §12). Data read from localStorage is treated
 * as untrusted and always re-validated.
 */
import { ERR, ok, fail } from './errors.js';
import { QTY, MESSAGES, SCHEMA_VERSION } from '../config.js';

/**
 * @param {unknown} value number or numeric string from an input
 * @returns {{ok:true,data:number}|{ok:false,error:object}}
 */
export function validateQuantity(value) {
  const text = typeof value === 'string' ? value.trim() : value;
  const n = text === '' || text === null || text === undefined ? NaN : Number(text);
  if (Number.isNaN(n) || n < QTY.min) return fail(ERR.VALIDATION, MESSAGES.QTY_MIN);
  if (!Number.isInteger(n)) return fail(ERR.VALIDATION, MESSAGES.QTY_WHOLE);
  if (n > QTY.max) return fail(ERR.VALIDATION, MESSAGES.QTY_MAX);
  return ok(n);
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** @returns {boolean} */
export function isValidMedicine(m) {
  return (
    !!m &&
    typeof m === 'object' &&
    isText(m.id) &&
    isText(m.brandName) &&
    isText(m.activeSalt) &&
    isText(m.genericName) &&
    isPrice(m.brandPrice) &&
    isPrice(m.genericPrice)
  );
}

/**
 * Keeps valid, unique medicines and drops the rest.
 * @returns {{ok:true,data:{medicines:object[], skipped:number}}|{ok:false,error:object}}
 */
export function validateDb(db) {
  if (!db || typeof db !== 'object' || db.schemaVersion !== SCHEMA_VERSION || !Array.isArray(db.medicines)) {
    return fail(ERR.DATA_LOAD, MESSAGES.DATA_LOAD_FAIL);
  }
  const seen = new Set();
  const medicines = [];
  for (const m of db.medicines) {
    if (!isValidMedicine(m) || seen.has(m.id)) continue;
    seen.add(m.id);
    medicines.push({
      id: m.id,
      brandName: m.brandName.trim(),
      activeSalt: m.activeSalt.trim(),
      brandPrice: m.brandPrice,
      genericName: m.genericName.trim(),
      genericPrice: m.genericPrice,
      manufacturer: isText(m.manufacturer) ? m.manufacturer.trim() : '',
      category: isText(m.category) ? m.category.trim() : '',
      packSize: isText(m.packSize) ? m.packSize.trim() : '',
    });
  }
  if (medicines.length === 0) return fail(ERR.DATA_LOAD, MESSAGES.DATA_LOAD_FAIL);
  return ok({ medicines, skipped: db.medicines.length - medicines.length });
}

const isId = (v) => typeof v === 'string' && /^\d{1,18}$/.test(v);
const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

const isMissing = (v) => v === null || v === undefined;

/** Who vouches for a reference price: the user, or a verified source (its provenance is shown, never guessed). */
const REFERENCE_SOURCES = new Set(['user_entered', 'nppa_brand_mrp', 'brand_review']);

/** Does this line have the price you pay now (the reference price)? */
export const hasReference = (i) => isPositive(i?.enteredMrp) && isPositive(i?.enteredCount);

/** Both reference values, in the unit the Jan Aushadhi pack is counted in; or neither. */
function hasValidReference(i) {
  if (isMissing(i.enteredMrp) && isMissing(i.enteredCount)) return true;
  return hasReference(i) && isPositive(i.alternativePrice.count) && isText(i.unit) && i.alternativePrice.unit === i.unit;
}

/**
 * A basket line: a Jan Aushadhi medicine with its MRP and, once you enter it, the price you
 * pay now for the same medicine (with its name, when you started from a brand).
 * Saved in this browser only.
 */
export function isValidBasketItem(i) {
  return (
    !!i &&
    typeof i === 'object' &&
    isId(i.alternativeId) &&
    isText(i.alternativeName) &&
    (isMissing(i.productId) || i.productId === '' || (isId(i.productId) && isText(i.productName))) &&
    !!i.alternativePrice &&
    isPositive(i.alternativePrice.mrp) &&
    (isMissing(i.alternativePrice.count) || isPositive(i.alternativePrice.count)) &&
    hasValidReference(i)
  );
}

export const basketKey = (i) => `${i.productId ?? ''}:${i.alternativeId}`;

/**
 * Cleans a stored basket: drops lines that are malformed or have bad quantities,
 * merges duplicate lines (capped at the maximum quantity). Data from storage is untrusted.
 * @param {unknown} items
 */
export function sanitizeBasket(items) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  for (const item of items) {
    if (!isValidBasketItem(item)) continue;
    const q = validateQuantity(item.packsPerMonth);
    if (!q.ok) continue;
    const key = basketKey(item);
    const prev = merged.get(key);
    const clean = {
      productId: isText(item.productId) ? item.productId : '',
      productName: isText(item.productId) ? item.productName.trim() : '',
      composition: isText(item.composition) ? item.composition.trim() : '',
      strength: isText(item.strength) ? item.strength.trim() : '',
      formulation: isText(item.formulation) ? item.formulation.trim() : '',
      formulationKey: isText(item.formulationKey) ? item.formulationKey : '',
      alternativeId: item.alternativeId,
      alternativeName: item.alternativeName.trim(),
      jaDrugCode: isText(item.jaDrugCode) ? item.jaDrugCode.trim() : '',
      unit: isText(item.unit) ? item.unit : '',
      enteredMrp: item.enteredMrp ?? null,
      enteredCount: item.enteredCount ?? null,
      // Where the reference price came from; lines saved before this was recorded were all typed by the user.
      referenceSource: hasReference(item) ? (REFERENCE_SOURCES.has(item.referenceSource) ? item.referenceSource : 'user_entered') : '',
      referenceAsOf: hasReference(item) && isText(item.referenceAsOf) ? item.referenceAsOf : '',
      alternativePrice: {
        mrp: item.alternativePrice.mrp,
        count: item.alternativePrice.count ?? null,
        unit: isText(item.alternativePrice.unit) ? item.alternativePrice.unit : null,
        packLabel: isText(item.alternativePrice.packLabel) ? item.alternativePrice.packLabel : '',
        asOf: isText(item.alternativePrice.asOf) ? item.alternativePrice.asOf : '',
      },
      packsPerMonth: Math.min(QTY.max, (prev?.packsPerMonth ?? 0) + q.data),
      addedAt: isText(item.addedAt) ? item.addedAt : new Date().toISOString(),
    };
    merged.set(key, clean);
  }
  return [...merged.values()];
}
