/**
 * Prescription basket (FR-03, FR-04). Saved only in this browser.
 *
 * A line is a Jan Aushadhi medicine with its MRP at the time you added it and, when known, the
 * price it is compared with: the verified MRP of a brand, or the MRP and pack size you typed
 * ("Entered by you", never sent to the server or stored as a catalogue price).
 * The basket page refreshes verified prices from the server when it can.
 */
import { STORAGE_KEYS, QTY, MESSAGES } from '../config.js';
import { ERR, ok, fail } from '../core/errors.js';
import { validateQuantity, sanitizeBasket, isValidBasketItem, basketKey, hasReference } from '../core/validate.js';
import { validateMrp, validatePackCount } from '../core/unitSavings.js';
import { basketTotals, isUserPrice } from '../core/basketMath.js';
import { USER_ENTERED } from '../core/comparison.js';
import { can, DEFAULT_ROLE } from '../core/roles.js';
import * as storage from './storage.js';

/** @type {Array<object>} */
let basket = [];
let getRole = () => DEFAULT_ROLE;

const snapshot = () => basket.map((item) => ({ ...item, alternativePrice: { ...item.alternativePrice } }));
const persist = () => storage.setJSON(STORAGE_KEYS.basket, basket);
const checkRole = () => (can(getRole(), 'addToBasket') ? null : fail(ERR.FORBIDDEN, MESSAGES.FORBIDDEN));

/**
 * Loads the saved basket. Reading never writes: only a change made by the user is saved,
 * so a page can never erase lines it does not understand (see STORAGE_KEYS.basket).
 * @param {() => string} [roleGetter] returns the current role
 */
export function initBasket(roleGetter) {
  if (roleGetter) getRole = roleGetter;
  const saved = [STORAGE_KEYS.basket, ...STORAGE_KEYS.previousBaskets].map((key) => storage.getJSON(key)).find((x) => x !== null);
  basket = sanitizeBasket(saved ?? []);
  return snapshot();
}

export const getBasket = snapshot;
export { basketKey };

/**
 * @param {object} line see validate.js isValidBasketItem (packsPerMonth is taken from qty)
 * @param {number|string} qty packs per month
 */
export function addToBasket(line, qty) {
  const denied = checkRole();
  if (denied) return denied;
  const q = validateQuantity(qty);
  if (!q.ok) return q;
  const candidate = { ...line, packsPerMonth: q.data, addedAt: new Date().toISOString() };
  if (!isValidBasketItem(candidate)) return fail(ERR.VALIDATION, MESSAGES.UNKNOWN_MEDICINE);

  const key = basketKey(candidate);
  const existing = basket.find((i) => basketKey(i) === key);
  if (existing) {
    const total = existing.packsPerMonth + q.data;
    if (total > QTY.max) return fail(ERR.VALIDATION, MESSAGES.QTY_MAX);
    Object.assign(existing, { ...candidate, packsPerMonth: total, addedAt: existing.addedAt });
  } else {
    basket.push(sanitizeBasket([candidate])[0]);
  }
  persist();
  return ok(snapshot());
}

/**
 * Adds a medicine to the comparison basket once. The same medicine is never listed twice:
 * adding it again changes nothing, except that a reference price it did not have is filled in.
 * @returns result whose data is {basket, added:boolean}
 */
export function addComparison(line) {
  const denied = checkRole();
  if (denied) return denied;
  if (!isValidBasketItem(line)) return fail(ERR.VALIDATION, MESSAGES.UNKNOWN_MEDICINE);
  const same = basket.find((i) => i.alternativeId === line.alternativeId && (!i.productId || !line.productId || i.productId === line.productId));
  if (!same) {
    const r = addToBasket(line, 1);
    return r.ok ? ok({ basket: r.data, added: true }) : r;
  }
  const named = !same.productId && line.productId; // the same generic, now added from a brand
  if ((!hasReference(same) && hasReference(line)) || named) {
    const keep = hasReference(same) && isUserPrice(same) ? { enteredMrp: same.enteredMrp, enteredCount: same.enteredCount, unit: same.unit, referenceSource: USER_ENTERED, referenceAsOf: '' } : {};
    Object.assign(same, sanitizeBasket([{ ...line, ...keep, packsPerMonth: same.packsPerMonth, addedAt: same.addedAt }])[0]);
    persist();
  }
  return ok({ basket: snapshot(), added: false });
}

/**
 * The price you pay now for the same medicine. Refused when the medicine's strength, form,
 * release type or pack size is not known, because the two prices could not be compared.
 * @param {{mrp:number|string, count:number|string}} reference
 */
export function setReference(key, { mrp, count }) {
  const denied = checkRole();
  if (denied) return denied;
  const item = basket.find((i) => basketKey(i) === key);
  if (!item) return fail(ERR.VALIDATION, MESSAGES.NOT_IN_BASKET);
  if (!item.formulationKey || !item.alternativePrice.count) return fail(ERR.VALIDATION, MESSAGES.CANNOT_COMPARE);
  const m = validateMrp(mrp);
  const c = validatePackCount(count);
  if (!m.ok || !c.ok) return fail(ERR.VALIDATION, (m.ok ? c : m).message);
  Object.assign(item, { enteredMrp: m.value, enteredCount: c.value, unit: item.alternativePrice.unit, referenceSource: USER_ENTERED, referenceAsOf: '' });
  persist();
  return ok(snapshot());
}

/**
 * The price you entered for a formulation on the search page, applied to that medicine in the
 * basket. A line that came from a brand keeps the price entered for that brand.
 * @param {{mrp:number, count:number, unit:string}} reference
 */
export function applyReference(formulationKey, reference) {
  const denied = checkRole();
  if (denied) return denied;
  const lines = basket.filter((i) => formulationKey && i.formulationKey === formulationKey && !i.productId && i.alternativePrice.count && i.alternativePrice.unit === reference.unit);
  for (const item of lines) Object.assign(item, { enteredMrp: reference.mrp, enteredCount: reference.count, unit: reference.unit, referenceSource: USER_ENTERED, referenceAsOf: '' });
  if (lines.length) persist();
  return ok(snapshot());
}

/**
 * The price now known for a brand (typed from your pack, or its verified MRP again after you cleared
 * yours), applied to the lines that compare with that brand. With no price, the line keeps its generic.
 * @param {{mrp:number, count:number, unit:string, source:string, asOf:string}|null} reference
 */
export function applyBrandReference(productId, reference) {
  const denied = checkRole();
  if (denied) return denied;
  const lines = basket.filter((i) => productId && i.productId === productId && (!reference || i.alternativePrice.unit === reference.unit));
  for (const item of lines) {
    Object.assign(item, reference
      ? { enteredMrp: reference.mrp, enteredCount: reference.count, unit: reference.unit, referenceSource: reference.source, referenceAsOf: reference.asOf ?? '' }
      : { enteredMrp: null, enteredCount: null, referenceSource: '', referenceAsOf: '' });
  }
  if (lines.length) persist();
  return ok(snapshot());
}

export function updateQuantity(key, qty) {
  const denied = checkRole();
  if (denied) return denied;
  const q = validateQuantity(qty);
  if (!q.ok) return q;
  const item = basket.find((i) => basketKey(i) === key);
  if (!item) return fail(ERR.VALIDATION, MESSAGES.NOT_IN_BASKET);
  item.packsPerMonth = q.data;
  persist();
  return ok(snapshot());
}

/** @returns result whose data includes {basket, removed:{item,index}} so the UI can offer Undo */
export function removeFromBasket(key) {
  const denied = checkRole();
  if (denied) return denied;
  const index = basket.findIndex((i) => basketKey(i) === key);
  if (index === -1) return fail(ERR.VALIDATION, MESSAGES.NOT_IN_BASKET);
  const [item] = basket.splice(index, 1);
  persist();
  return ok({ basket: snapshot(), removed: { item, index } });
}

/** Puts a removed line back where it was (Undo). */
export function restoreItem({ item, index }) {
  if (basket.some((i) => basketKey(i) === basketKey(item))) return ok(snapshot());
  basket.splice(Math.min(index, basket.length), 0, { ...item });
  persist();
  return ok(snapshot());
}

export function clearBasket() {
  basket = [];
  persist();
  return ok(snapshot());
}

/** Forgets the in-memory basket without writing (used after Reset cleared storage). */
export function resetBasketMemory() {
  basket = [];
}

/**
 * @param {Map<string, object|null>} [livePrices] current Jan Aushadhi prices by alternative id
 * @param {Map<string, object>} [liveReferences] current verified brand prices by brand id
 */
export function calculateTotalSavings(livePrices, liveReferences) {
  if (basket.length === 0) return fail(ERR.EMPTY_BASKET, MESSAGES.EMPTY_BASKET);
  return ok(basketTotals(basket, livePrices, liveReferences));
}
