/**
 * Prescription basket — PRD §9 addToBasket / calculateTotalSavings, FR-03, FR-04.
 * The basket stores only medicine IDs and quantities; prices always come from the DB.
 */
import { STORAGE_KEYS, QTY, MESSAGES } from '../config.js';
import { ERR, ok, fail } from '../core/errors.js';
import { validateQuantity, sanitizeBasket } from '../core/validate.js';
import { basketSummary } from '../core/savings.js';
import { can, DEFAULT_ROLE } from '../core/roles.js';
import { getDb } from './dataService.js';
import * as storage from './storage.js';

/** @type {Array<{medicineId:string, quantityPerMonth:number}>} */
let basket = [];
let getRole = () => DEFAULT_ROLE;

const snapshot = () => basket.map((item) => ({ ...item }));

function persist() {
  storage.setJSON(STORAGE_KEYS.basket, basket);
}

function checkRole() {
  return can(getRole(), 'addToBasket') ? null : fail(ERR.FORBIDDEN, MESSAGES.FORBIDDEN);
}

/**
 * @param {() => string} roleGetter returns the current role
 */
export function initBasket(roleGetter) {
  if (roleGetter) getRole = roleGetter;
  const db = getDb();
  basket = db ? sanitizeBasket(storage.getJSON(STORAGE_KEYS.basket, []), db.byId) : [];
  persist();
  return snapshot();
}

export const getBasket = snapshot;

export function addToBasket(medicineId, qty) {
  const denied = checkRole();
  if (denied) return denied;
  const q = validateQuantity(qty);
  if (!q.ok) return q;
  if (!getDb()?.byId.has(medicineId)) return fail(ERR.VALIDATION, MESSAGES.UNKNOWN_MEDICINE);

  const existing = basket.find((item) => item.medicineId === medicineId);
  if (existing) {
    const total = existing.quantityPerMonth + q.data;
    if (total > QTY.max) return fail(ERR.VALIDATION, MESSAGES.QTY_MAX);
    existing.quantityPerMonth = total;
  } else {
    basket.push({ medicineId, quantityPerMonth: q.data });
  }
  persist();
  return ok(snapshot());
}

export function updateQuantity(medicineId, qty) {
  const denied = checkRole();
  if (denied) return denied;
  const q = validateQuantity(qty);
  if (!q.ok) return q;
  const item = basket.find((i) => i.medicineId === medicineId);
  if (!item) return fail(ERR.VALIDATION, MESSAGES.NOT_IN_BASKET);
  item.quantityPerMonth = q.data;
  persist();
  return ok(snapshot());
}

/** @returns result whose data includes {basket, removed:{item,index}} so the UI can offer Undo */
export function removeFromBasket(medicineId) {
  const denied = checkRole();
  if (denied) return denied;
  const index = basket.findIndex((i) => i.medicineId === medicineId);
  if (index === -1) return fail(ERR.VALIDATION, MESSAGES.NOT_IN_BASKET);
  const [item] = basket.splice(index, 1);
  persist();
  return ok({ basket: snapshot(), removed: { item, index } });
}

/** Puts a removed line back where it was (Undo). */
export function restoreItem({ item, index }) {
  if (basket.some((i) => i.medicineId === item.medicineId)) return ok(snapshot());
  basket.splice(Math.min(index, basket.length), 0, { ...item });
  persist();
  return ok(snapshot());
}

export function clearBasket() {
  basket = [];
  persist();
  return ok(snapshot());
}

/** Forgets the in-memory basket without writing (used after Reset demo cleared storage). */
export function resetBasketMemory() {
  basket = [];
}

export function calculateTotalSavings() {
  if (basket.length === 0) return fail(ERR.EMPTY_BASKET, MESSAGES.EMPTY_BASKET);
  return ok(basketSummary(basket, getDb().byId));
}
