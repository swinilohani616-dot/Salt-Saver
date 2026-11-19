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

/**
 * Cleans a stored basket: drops unknown medicines and bad quantities,
 * merges duplicate lines (capped at the maximum quantity).
 * @param {unknown} items
 * @param {Map<string, object>} medicinesById
 */
export function sanitizeBasket(items, medicinesById) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  for (const item of items) {
    if (!item || !medicinesById.has(item.medicineId)) continue;
    const q = validateQuantity(item.quantityPerMonth);
    if (!q.ok) continue;
    const prev = merged.get(item.medicineId) || 0;
    merged.set(item.medicineId, Math.min(QTY.max, prev + q.data));
  }
  return [...merged].map(([medicineId, quantityPerMonth]) => ({ medicineId, quantityPerMonth }));
}
