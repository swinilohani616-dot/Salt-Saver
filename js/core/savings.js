/**
 * Savings math (FR-02, FR-03, BR-01).
 * All arithmetic is in integer paise to avoid floating-point drift.
 * Prices are per pack; quantity is packs per month.
 */

/** @param {number} rupees */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

/** Saving on one pack, in paise. Never negative. */
export function unitSaving(medicine) {
  return Math.max(0, toPaise(medicine.brandPrice) - toPaise(medicine.genericPrice));
}

/** Whole-number percentage, rounded down: (30 - 5.5) / 30 = 81.67% -> 81. */
export function savingPercent(medicine) {
  const brand = toPaise(medicine.brandPrice);
  if (brand <= 0) return 0;
  return Math.floor((unitSaving(medicine) * 100) / brand);
}

/** BR-01: savings = (brandPrice - genericPrice) * quantity, in paise. */
export function lineSaving(medicine, quantity) {
  return unitSaving(medicine) * quantity;
}

/**
 * @param {Array<{medicineId:string, quantityPerMonth:number}>} items
 * @param {Map<string, object>} medicinesById
 */
export function basketSummary(items, medicinesById) {
  const lines = [];
  let totalBrand = 0;
  let totalGeneric = 0;
  let totalSaving = 0;

  for (const item of items) {
    const medicine = medicinesById.get(item.medicineId);
    if (!medicine) continue;
    const qty = item.quantityPerMonth;
    const brandTotal = toPaise(medicine.brandPrice) * qty;
    const genericTotal = toPaise(medicine.genericPrice) * qty;
    const saving = lineSaving(medicine, qty);
    lines.push({ medicine, qty, brandTotal, genericTotal, saving, percent: savingPercent(medicine) });
    totalBrand += brandTotal;
    totalGeneric += genericTotal;
    totalSaving += saving;
  }

  const overallPercent = totalBrand > 0 ? Math.floor((totalSaving * 100) / totalBrand) : 0;
  return { lines, totalBrand, totalGeneric, totalSaving, overallPercent, yearlySaving: totalSaving * 12 };
}
